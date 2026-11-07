/** @jsxImportSource react */
// The cost view in the desk (ported from the stage 1 economics page, HC-06). Figures in the markup equal the model; the adapter runs only
// the record keeper's read-only commands; unconfigured and failing states are honest; cost per accepted outcome is never invented.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { READ_ONLY_COMMANDS, realityTraceEconomics, type EconomicsReadout, type EconomicsSource, type Runner } from "../src/adapters/realitytrace-economics.ts";
import { economicsFromEnv } from "../src/config/load.ts";
import { economicsModel } from "../src/economics/model.ts";
import { Cost } from "../src/ui/desk/views/Cost.tsx";
import { costLine, type AcceptedKnowledge, type CostPart } from "../src/ui/desk/work-build.ts";
import { startDeskApp } from "./support/desk-app.ts";
import { residual, sampleLedger } from "./support/economics-fixture.ts";

const projection = [residual("r1", "observed_undeclared"), residual("r2", "declared_unobserved"), residual("r3", "declared_unobserved")];
const model = economicsModel(sampleLedger(), projection);
const ok: EconomicsReadout = { state: "ok", repos: [{ repo_id: "repo-1", path: "/work/alpha", model, error: null }], skipped: { without_agent_activity: 0, missing_folder: 0 } };
const fmt = (n: number) => n.toLocaleString("en-US");
const unknown: AcceptedKnowledge = { kind: "unknown", why: "Cases are not connected, so no outcome can be counted as accepted." };
const draw = (readout: EconomicsReadout, knowledge: AcceptedKnowledge = unknown): string => renderToStaticMarkup(<Cost cost={{ readout, knowledge } satisfies CostPart} />);

describe("cost view", () => {
  const html = draw(ok);

  test("semantic tables with captions and no script or form", () => {
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<form");
    for (const table of ["per-accepted", "cost", "unattributed", "lessons", "journeys", "residuals", "ablation"]) {
      expect(html).toMatch(new RegExp(`<table data-table="${table}"[^>]*><caption>`));
    }
    expect(html).toContain('scope="col"');
  });

  test("figures in the markup equal the model", () => {
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
    expect(html).toContain("Not tied to a case");
    const noArm = draw({ state: "ok", repos: [{ repo_id: "r", path: null, model: economicsModel(sampleLedger().filter((r: any) => r.append_ordinal !== 20), []), error: null }], skipped: { without_agent_activity: 0, missing_folder: 0 } });
    expect(noArm).toContain("not run");
    expect(html).toContain("Arms recorded on events");
    expect(html).toContain('Total <span class="badge observed">observed</span>');
  });

  test("cost per accepted outcome shows not recorded without a source", () => {
    // No source for acceptance: every row says Not recorded and why. It is never 0 and never a number.
    expect(html).toContain("Not recorded: Cases are not connected, so no outcome can be counted as accepted.");
    expect([...html.matchAll(/data-per-accepted="([^"]+)"/g)].map((m) => m[1]).every((v) => v === "not-recorded")).toBe(true);
    expect(html).not.toMatch(/data-per-accepted="0"/);
    for (const item of model.cases) expect(costLine(item, unknown)).toMatchObject({ accepted: null, per_accepted: null });
    // A source that says the case is not done yet: still not recorded, with that reason.
    const bound = model.cases.find((c) => c.case_id !== null)!;
    expect(costLine(bound, { kind: "known", completed: [] })).toMatchObject({ accepted: 0, per_accepted: null });
    expect(costLine(bound, { kind: "known", completed: [] }).words).toContain("no accepted outcome yet");
    // The same case, accepted: a real number, tokens for one outcome.
    expect(costLine(bound, { kind: "known", completed: [bound.case_id!] })).toMatchObject({ accepted: 1, per_accepted: bound.totals.observed.total });
    // Work with no case can never be counted against an outcome.
    const unbound = model.cases.find((c) => c.case_id === null)!;
    expect(costLine(unbound, { kind: "known", completed: [bound.case_id!] }).per_accepted).toBeNull();
    // Not configured at all also says Not recorded, not blank.
    expect(draw({ state: "not_configured" })).toContain("Cost per accepted outcome: Not recorded");
  });

  test("honest states: not configured, unavailable, empty", () => {
    const off = draw({ state: "not_configured" });
    expect(off).toContain("not set up");
    expect(off).toContain("te-agents install --with-realitytrace");
    expect(off).toContain("te-agents rt enroll");
    expect(off).toContain("HORIZON_ECONOMICS_REALITYTRACE_BIN");
    const down = draw({ state: "unavailable", message: "realitytrace repo list failed (exit 2): boom" });
    expect(down).toContain("could not be read");
    expect(down).toContain("boom");
    expect(draw({ state: "empty", repos: [], skipped: { without_agent_activity: 0, missing_folder: 0 } })).toContain("No agent events recorded yet");
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
    const out = realityTraceEconomics({ realitytrace_bin: "rt", data_home: "/d", state_home: "/s" }, run, () => true).read();
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

  test("skips vanished folders and repos without agent events, and counts both", () => {
    const calls: string[] = [];
    const repos = [
      { repo_id: "LIVE", filesystem_path: "/live", state: "enrolled" },
      { repo_id: "QUIET", filesystem_path: "/quiet", state: "enrolled" },
      { repo_id: "GONE", filesystem_path: "/tmp/gone", state: "enrolled" },
    ];
    const run: Runner = (_b, args) => {
      calls.push(args.slice(0, 4).join(" "));
      if (args[0] === "repo") return { status: 0, stdout: JSON.stringify({ repos }), stderr: "" };
      if (args[0] === "ledger") return { status: 0, stdout: JSON.stringify(args[3] === "LIVE" ? sampleLedger() : []), stderr: "" };
      return { status: 0, stdout: "[]", stderr: "" };
    };
    const out = realityTraceEconomics({ realitytrace_bin: "rt" }, run, (p) => p !== "/tmp/gone").read();
    expect(out.state).toBe("ok");
    if (out.state !== "ok") return;
    expect(out.repos.map((r) => r.repo_id)).toEqual(["LIVE"]);
    expect(out.skipped).toEqual({ without_agent_activity: 1, missing_folder: 1 });
    // no CLI call for the vanished folder, and no projection export for the quiet repo
    expect(calls.some((c) => c.includes("GONE"))).toBe(false);
    expect(calls.filter((c) => c.startsWith("projections"))).toEqual(["projections export --repo LIVE"]);
    const html = renderToStaticMarkup(<Cost cost={{ readout: out, knowledge: { kind: "unknown", why: "test" } }} />);
    expect(html).toContain("Not shown: 1 enrolled repository has no agent events; 1 is enrolled at a folder that no longer exists.");
  });

  test("config binding: absent by default, env overrides the file", () => {
    expect(economicsFromEnv({})).toBeUndefined();
    expect(economicsFromEnv({ HORIZON_ECONOMICS_REALITYTRACE_BIN: "/bin/rt", HORIZON_ECONOMICS_DATA_HOME: "/d" })).toEqual({ realitytrace_bin: "/bin/rt", data_home: "/d" });
    expect(economicsFromEnv({}, { realitytrace_bin: "/f", data_home: "/fd" })).toEqual({ realitytrace_bin: "/f", data_home: "/fd" });
  });
});

describe("cost through the application", () => {
  let reads = 0;
  const source: EconomicsSource = { read: () => (reads++, ok) };

  test("the cost view reads the record keeper and cases not connected makes cost per accepted outcome not recorded", async () => {
    const app = await startDeskApp({ economics: source });
    try {
      const work = await app.get("/desk/work.json");
      expect(work.cost.readout.state).toBe("ok");
      expect(work.cost.knowledge.kind).toBe("unknown");
      expect(work.cases.connected).toBe(false);
      expect(reads).toBeGreaterThanOrEqual(1);
      // The old JSON route stays the read model.
      const json = await fetch(`${app.base}/workspace/economics`, { headers: { accept: "application/json" } });
      const body = (await json.json()) as any;
      expect(body.schema).toBe("horizon.economics/1");
      expect(body.repos[0].model.totals.observed.total).toBe(model.totals.observed.total);
      // The HTML address opens the desk, not a second page.
      const page = await fetch(`${app.base}/workspace/economics`);
      expect(page.headers.get("content-type")).toContain("text/html");
      expect(await page.text()).toContain('src="/desk/app.js"');
      expect((await fetch(`${app.base}/workspace/economics`, { method: "POST" })).status).not.toBe(200);
    } finally {
      await app.stop();
    }
  });
});
