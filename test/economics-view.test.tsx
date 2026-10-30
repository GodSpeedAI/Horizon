/** @jsxImportSource react */
// HC-06: the economics page and route. Figures in the HTML equal the model; the route needs no client script;
// the adapter runs only RealityTrace's read-only commands; unconfigured and failing states are honest.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApplication, type HorizonApplication } from "../src/app.ts";
import { READ_ONLY_COMMANDS, realityTraceEconomics, type EconomicsReadout, type EconomicsSource, type Runner } from "../src/adapters/realitytrace-economics.ts";
import { economicsFromEnv } from "../src/config/load.ts";
import { economicsModel } from "../src/economics/model.ts";
import { renderEconomicsPage } from "../src/ui/workspace/economics.tsx";
import { horizonDocument, writeConfig } from "./support/config.ts";
import { residual, sampleLedger } from "./support/economics-fixture.ts";

const projection = [residual("r1", "observed_undeclared"), residual("r2", "declared_unobserved"), residual("r3", "declared_unobserved")];
const model = economicsModel(sampleLedger(), projection);
const ok: EconomicsReadout = { state: "ok", repos: [{ repo_id: "repo-1", path: "/work/alpha", model, error: null }] };
const fmt = (n: number) => n.toLocaleString("en-US");

describe("economics page", () => {
  const html = renderEconomicsPage(ok);

  test("semantic tables with captions and no script", () => {
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<form");
    for (const table of ["cost", "unattributed", "lessons", "journeys", "residuals", "ablation"]) {
      expect(html).toMatch(new RegExp(`<table data-table="${table}"><caption>`));
    }
    expect(html).toContain('scope="col"');
  });

  test("figures in the HTML equal the model", () => {
    const cell = (scope: string, field: string) => {
      const row = html.slice(html.indexOf(scope));
      return new RegExp(`data-f="${field}">([^<]*)<`).exec(row)?.[1];
    };
    expect(cell('<tr data-total="repo">', "observed_total")).toBe(fmt(model.totals.observed.total));
    expect(cell('<tr data-total="repo">', "te_overhead")).toBe(fmt(model.totals.te_overhead.total));
    expect(cell('<tr data-session="s1">', "cache_read")).toBe(fmt(12000));
    expect(cell('<tr data-session="s1">', "overhead_pct")).toBe(`${((150 / 15600) * 100).toFixed(1)}%`);
    expect(cell('<tbody data-case="unbound">', "observed_total")).toBe("137");
    expect(html).toContain('data-f="unattributed_total">137<');
    expect(html).toContain('data-residual="declared_unobserved"><th scope="row">declared_unobserved</th><td class="num">2<');
  });

  test("estimate is labelled estimate, savings say no estimate recorded, ablation says not run", () => {
    expect(html).toContain('<span class="badge estimate">estimate</span>');
    expect(html).toContain("no estimate recorded");
    expect(html).toContain("Unbound");
    const noArm = renderEconomicsPage({ state: "ok", repos: [{ repo_id: "r", path: null, model: economicsModel(sampleLedger().filter((r: any) => r.append_ordinal !== 20), []), error: null }] });
    expect(noArm).toContain("not run");
    expect(html).toContain("Arms recorded on events");
    // the estimate badge never sits on the observed total header
    expect(html).toContain('Total <span class="badge observed">observed</span>');
  });

  test("honest states: not configured, unavailable, empty", () => {
    const off = renderEconomicsPage({ state: "not_configured" });
    expect(off).toContain("not configured");
    expect(off).toContain("te-agents install --with-realitytrace");
    expect(off).toContain("te-agents rt enroll");
    expect(off).toContain("HORIZON_ECONOMICS_REALITYTRACE_BIN");
    const down = renderEconomicsPage({ state: "unavailable", message: "realitytrace repo list failed (exit 2): boom" });
    expect(down).toContain("could not be read");
    expect(down).toContain("boom");
    expect(renderEconomicsPage({ state: "empty", repos: [] })).toContain("No agent events recorded yet");
  });
});

describe("realityTraceEconomics adapter", () => {
  test("not configured without a binding", () => {
    expect(realityTraceEconomics(undefined).read()).toEqual({ state: "not_configured" });
  });

  test("runs only the three read-only commands and passes only its own XDG homes", () => {
    const calls: { args: string[]; env: Record<string, string> }[] = [];
    const run: Runner = (_bin, args, env) => {
      calls.push({ args: [...args], env });
      if (args[0] === "repo") return { status: 0, stdout: JSON.stringify({ repos: [{ repo_id: "R1", filesystem_path: "/w", state: "enrolled" }, { repo_id: "R2", state: "removed" }] }), stderr: "" };
      if (args[0] === "ledger") return { status: 0, stdout: JSON.stringify(sampleLedger()), stderr: "" };
      return { status: 0, stdout: JSON.stringify(projection), stderr: "" };
    };
    const out = realityTraceEconomics({ realitytrace_bin: "rt", data_home: "/d", state_home: "/s" }, run).read();
    expect(out.state).toBe("ok");
    expect(calls.map((c) => c.args.slice(0, 2).join(" "))).toEqual(["repo list", "ledger export", "projections export"]);
    for (const call of calls) {
      expect(READ_ONLY_COMMANDS.some(([a, b]) => call.args[0] === a && call.args[1] === b)).toBe(true);
      expect(call.env.XDG_DATA_HOME).toBe("/d");
      expect(call.env.XDG_STATE_HOME).toBe("/s");
    }
    if (out.state === "ok") expect(out.repos[0]!.model!.totals.observed.total).toBe(model.totals.observed.total);
  });

  test("a failing CLI is a brief error, a failing projection keeps the ledger figures", () => {
    const failing = realityTraceEconomics({ realitytrace_bin: "rt" }, () => ({ status: 3, stdout: "", stderr: "no such store\n" })).read();
    expect(failing).toEqual({ state: "unavailable", message: "realitytrace repo list failed (exit 3): no such store" });
    const run: Runner = (_b, args) =>
      args[0] === "repo" ? { status: 0, stdout: JSON.stringify({ repos: [{ repo_id: "R1" }] }), stderr: "" } : args[0] === "ledger" ? { status: 0, stdout: JSON.stringify(sampleLedger()), stderr: "" } : { status: 1, stdout: "", stderr: "x" };
    const partial = realityTraceEconomics({ realitytrace_bin: "rt" }, run).read();
    expect(partial.state).toBe("ok");
    if (partial.state === "ok") {
      expect(partial.repos[0]!.error).toContain("residuals unavailable");
      expect(partial.repos[0]!.model!.totals.observed.total).toBe(model.totals.observed.total);
    }
  });

  test("an enrolled store with no agent events is empty", () => {
    const run: Runner = (_b, args) => ({ status: 0, stdout: JSON.stringify(args[0] === "repo" ? { repos: [{ repo_id: "R1" }] } : []), stderr: "" });
    expect(realityTraceEconomics({ realitytrace_bin: "rt" }, run).read().state).toBe("empty");
  });

  test("config binding: absent by default, env overrides the file", () => {
    expect(economicsFromEnv({})).toBeUndefined();
    expect(economicsFromEnv({ HORIZON_ECONOMICS_REALITYTRACE_BIN: "/bin/rt", HORIZON_ECONOMICS_DATA_HOME: "/d" })).toEqual({ realitytrace_bin: "/bin/rt", data_home: "/d" });
    expect(economicsFromEnv({}, { realitytrace_bin: "/f", data_home: "/fd" })).toEqual({ realitytrace_bin: "/f", data_home: "/fd" });
  });
});

describe("GET /workspace/economics", () => {
  let application: HorizonApplication;
  let server: ReturnType<HorizonApplication["startServer"]>;
  let reads = 0;
  const source: EconomicsSource = { read: () => (reads++, ok) };

  beforeAll(async () => {
    const root = mkdtempSync(join(tmpdir(), "economics-route-"));
    const configPath = await writeConfig(join(root, "horizon.toml"), horizonDocument({ storePath: join(root, "e.sqlite"), secretPath: join(root, "launch.secret") }));
    application = await createApplication({ configPath, economics: source });
    server = application.startServer(0);
  });
  afterAll(async () => {
    server?.stop();
    await application?.close();
  });

  test("serves HTML, and JSON on request, from the same read", async () => {
    const page = await fetch(new URL("/workspace/economics", server.url));
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(await page.text()).toContain(fmt(model.totals.observed.total));
    const json = await fetch(new URL("/workspace/economics", server.url), { headers: { accept: "application/json" } });
    const body = (await json.json()) as any;
    expect(body.schema).toBe("horizon.economics/1");
    expect(body.state).toBe("ok");
    expect(body.repos[0].model.totals.observed.total).toBe(model.totals.observed.total);
    expect(reads).toBeGreaterThanOrEqual(2);
  });

  test("the workspace links to it, and a foreign Host is refused like other workspace routes", async () => {
    const workspace = await (await fetch(new URL("/workspace", server.url))).text();
    expect(workspace).toContain('href="/workspace/economics"');
    const refused = await fetch(new URL("/workspace/economics", server.url), { headers: { host: "evil.example:80" } });
    expect(refused.status).toBe(403);
  });

  test("POST is not a route", async () => {
    const response = await fetch(new URL("/workspace/economics", server.url), { method: "POST" });
    expect(response.status).not.toBe(200);
  });
});

describe("unconfigured application", () => {
  test("the view is an honest empty state, not an error", async () => {
    const root = mkdtempSync(join(tmpdir(), "economics-off-"));
    const configPath = await writeConfig(join(root, "horizon.toml"), horizonDocument({ storePath: join(root, "e.sqlite"), secretPath: join(root, "launch.secret") }));
    const saved = process.env.HORIZON_ECONOMICS_REALITYTRACE_BIN;
    delete process.env.HORIZON_ECONOMICS_REALITYTRACE_BIN;
    const app = await createApplication({ configPath });
    const server = app.startServer(0);
    try {
      const response = await fetch(new URL("/workspace/economics", server.url));
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("Case economics is not configured");
      expect(((await (await fetch(new URL("/workspace/economics", server.url), { headers: { accept: "application/json" } })).json()) as any).state).toBe("not_configured");
    } finally {
      server.stop();
      await app.close();
      if (saved !== undefined) process.env.HORIZON_ECONOMICS_REALITYTRACE_BIN = saved;
    }
  });
});
