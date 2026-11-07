import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { listLabels } from "../src/capabilities/labels.ts";
import { listDays } from "../src/capabilities/notes.ts";
import { CASES, LABELS, NOTES, OBLIGATIONS, SESSIONS, TEMPLATES } from "../scripts/seed-data/data.ts";
import { clearTestSetup, main, type AgentEventLine, type ClearDeps, type IO, type LedgerRow, type Ports } from "../scripts/seed.ts";
import { run as setupClear } from "../scripts/setup-clear.ts";
import { run as setupInit } from "../scripts/setup-init.ts";

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "horizon-seed-test-"));
  dirs.push(d);
  return d;
};

function io(): IO & { lines: string[]; errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  return { lines, errors, out: (l) => void lines.push(l), err: (l) => void errors.push(l) };
}

/** A setups folder holding a test setup (with its marker) and, when asked, a production one. */
function setups(options: { marker?: "testing" | "production" | "none"; production?: boolean } = {}) {
  const base = tmp();
  const root = join(base, "testing");
  mkdirSync(join(root, "cell"), { recursive: true });
  if (options.marker !== "none") writeFileSync(join(root, "SETUP.json"), JSON.stringify({ name: options.marker ?? "testing", root, createdAt: "2026-11-07T00:00:00Z" }));
  if (options.production) {
    mkdirSync(join(base, "production", "cell"), { recursive: true });
    writeFileSync(join(base, "production", "SETUP.json"), JSON.stringify({ name: "production", root: join(base, "production"), createdAt: "2026-11-07T00:00:00Z" }));
    writeFileSync(join(base, "production", "cell", "app.sqlite"), "production data");
  }
  const env = { HORIZON_SETUP: "testing", HORIZON_SETUPS_BASE: base, PATH: process.env.PATH };
  return { base, root, env };
}

// ---------------------------------------------------------------------------------------------- fakes

function fakeKeeper() {
  const cases: { case_id: string; template: string; items: { plan_item_id: string; name: string; execution: string; settlement: string; proposed_by?: string }[] }[] = [];
  const replies = new Map<string, Record<string, unknown>>();
  const sent: { verb: string; request_id?: string; asOperator: boolean; policy?: unknown }[] = [];
  const stepOf = (template: string) => CASES.find((c) => c.template === template)!.step_id;
  return {
    cases,
    sent,
    port: {
      async call(request: Record<string, unknown>, options?: { asOperator?: boolean }): Promise<Record<string, unknown>> {
        const verb = String(request.verb);
        const request_id = typeof request.request_id === "string" ? request.request_id : undefined;
        sent.push({ verb, ...(request_id ? { request_id } : {}), asOperator: options?.asOperator === true, policy: request.policy });
        if (request_id && replies.has(request_id)) return replies.get(request_id)!;
        let reply: Record<string, unknown>;
        if (verb === "case_preflight") reply = { ok: true, template_ref: request.template_ref, items: [], plan_precondition: { ref: `plan:${request.template_ref}`, expected_digest: "sha256:abc" } };
        else if (verb === "case_commit") {
          const id = `case_fake_${cases.length + 1}`;
          const template = String(request.template_ref);
          cases.push({ case_id: id, template, items: [{ plan_item_id: stepOf(template), name: "sign off", execution: "active", settlement: "unsettled" }] });
          reply = { case_id: id, state: "active" };
        } else if (verb === "case_list") reply = { cases: cases.map((c) => ({ case_id: c.case_id, case_state: "active", summary: "x" })) };
        else if (verb === "case_get_horizon") reply = { case_state: "active", items: cases.find((c) => c.case_id === request.case_id)?.items ?? [] };
        else if (verb === "case_add_item") {
          if (request.policy !== "policy.yaml") return { ok: false, error_class: "missing_config_error", error: "no policy" };
          const item = request.item as { plan_item_id: string; name: string };
          cases.find((c) => c.case_id === request.case_id)!.items.push({ plan_item_id: item.plan_item_id, name: item.name, execution: "active", settlement: "unsettled", ...(options?.asOperator ? {} : { proposed_by: "cognate-service" }) });
          reply = { ok: true, case_id: request.case_id, plan_item_id: item.plan_item_id };
        } else if (verb === "case_advance") reply = { ok: true, case_id: request.case_id };
        else return { ok: false, error_class: "unknown_verb", error: String(verb) };
        if (request_id) replies.set(request_id, reply);
        return reply;
      },
    },
  };
}

function fakeGithub() {
  const issues: { number: number; title: string; url: string }[] = [];
  const board = new Set<string>();
  return {
    issues,
    board,
    port: {
      repo: "GodSpeedAI/horizon-sandbox",
      async findIssue(title: string) {
        return issues.find((i) => i.title === title) ?? null;
      },
      async createIssue(title: string) {
        const number = issues.length + 1;
        const issue = { number, title, url: `https://github.com/GodSpeedAI/horizon-sandbox/issues/${number}` };
        issues.push(issue);
        return issue;
      },
      async onBoard(url: string) {
        return board.has(url);
      },
      async addToBoard(url: string) {
        board.add(url);
      },
    },
  };
}

/** A record keeper that appends rows the way the real ledger does, including a repeated declare appending again. */
function fakeRecords() {
  const rows: LedgerRow[] = [];
  const add = (record_kind: string, payload: Record<string, unknown>) => void rows.push({ append_ordinal: rows.length + 1, ledger_id: "L1", record_kind, payload });
  let runs = 0;
  return {
    rows,
    port: {
      async ledger() {
        return rows.slice();
      },
      async declareObligation(i: { intentId: string; statement: string }) {
        add("question.declared", { representations: [{ inline_content: { question_id: `q-${i.intentId}` } }] });
        add("threshold.declared", { states: [{ state_id: `t-${i.intentId}` }] });
      },
      async runObligation(intentId: string) {
        add("run.started", { provenance_refs: [`question:q-${intentId}`], scope: { run_id: `run${++runs}` } });
        add("observation.recorded", {});
      },
      async declareJourney(questionId: string) {
        add("question.declared", { representations: [{ inline_content: { question_id: questionId } }] });
      },
      async openRun(questionId: string) {
        const known = rows.find((r) => r.record_kind === "run.started" && r.payload.provenance_refs.includes(`question:${questionId}`));
        if (known) return known.payload.scope.run_id as string;
        const id = `run${++runs}`;
        add("run.started", { provenance_refs: [`question:${questionId}`], scope: { run_id: id } });
        return id;
      },
      async ingest(_run: string, events: readonly AgentEventLine[]) {
        for (const e of events) add("observation.recorded", { extensions: { agent_event: { ...e, event_id: String(e.event_id) } } });
      },
    },
  };
}

function rig(base: { root: string; env: Record<string, string | undefined> }) {
  const keeper = fakeKeeper();
  const github = fakeGithub();
  const records = fakeRecords();
  const store = createMemoryStore();
  const templates = new Set<string>();
  let policy = false;
  const ports: Ports = {
    keeper: keeper.port,
    github: github.port,
    records: records.port,
    store,
    templates: {
      present: () => [...templates],
      install: () => TEMPLATES.filter((t) => !templates.has(t)).map((t) => (templates.add(t), t)),
      policyAllowsAdd: () => policy,
      allowAdd: () => (policy ? false : ((policy = true), true)),
    },
  };
  let built = 0;
  const deps = {
    ports: () => {
      built += 1;
      return { ports, who: { tenant: "local:test:testing", operator: "actor:operator" }, timeZone: "America/New_York" };
    },
    now: () => new Date("2026-11-07T16:00:00Z"),
  };
  return { keeper, github, records, store, ports, deps, built: () => built, env: base.env };
}

// ---------------------------------------------------------------------------------------------- tests

describe("seed guard", () => {
  test("seed refuses outside the test setup", async () => {
    for (const env of [{} as Record<string, string | undefined>, { HORIZON_SETUP: "production" }, { HORIZON_SETUP: "" }]) {
      const s = setups({ production: true });
      const r = rig(s);
      const out = io();
      expect(await main([], { ...s.env, ...env, ...(Object.keys(env).length === 0 ? { HORIZON_SETUP: undefined } : {}) }, out, r.deps)).toBe(1);
      expect(out.errors.join("\n")).toContain("test setup");
      expect(r.built()).toBe(0);
      expect(r.keeper.sent).toHaveLength(0);
      expect(r.github.issues).toHaveLength(0);
      expect(r.records.rows).toHaveLength(0);
    }
    // --status is refused the same way, and so is asking for another setup by name.
    const s = setups();
    const r = rig(s);
    expect(await main(["--status"], { ...s.env, HORIZON_SETUP: "production" }, io(), r.deps)).toBe(1);
    expect(await main(["--setup", "production"], s.env, io(), r.deps)).toBe(1);
    expect(r.built()).toBe(0);
  });

  test("seed refuses without the test marker", async () => {
    for (const marker of ["none", "production"] as const) {
      const s = setups({ marker });
      const r = rig(s);
      const out = io();
      expect(await main([], s.env, out, r.deps)).toBe(1);
      expect(out.errors.join("\n")).toMatch(/marker|says "production"/);
      expect(r.built()).toBe(0);
      expect(r.keeper.sent).toHaveLength(0);
      expect(r.github.issues).toHaveLength(0);
    }
  });
});

describe("seed", () => {
  test("seed twice changes nothing", async () => {
    const s = setups();
    const r = rig(s);
    expect(await main([], s.env, io(), r.deps)).toBe(0);
    const snapshot = async () => ({
      cases: JSON.stringify(r.keeper.cases),
      issues: JSON.stringify(r.github.issues),
      board: [...r.github.board],
      ledger: JSON.stringify(r.records.rows),
      days: JSON.stringify(await listDays(r.store, { tenant: "local:test:testing", operator: "actor:operator" })),
      labels: JSON.stringify((await listLabels(r.store, "local:test:testing")).map(({ created_at: _created, ...rest }) => rest)),
      noteCount: (await listDays(r.store, { tenant: "local:test:testing", operator: "actor:operator" })).reduce((n, d) => n + d.count, 0),
    });
    const first = await snapshot();
    const out = io();
    expect(await main([], s.env, out, r.deps)).toBe(0);
    expect(await snapshot()).toEqual(first);
    // What it made, by the numbers the data file promises.
    expect(r.keeper.cases).toHaveLength(CASES.length);
    expect(r.keeper.cases.flatMap((c) => c.items.map((i) => i.plan_item_id))).toEqual(expect.arrayContaining(["seed_handoff_metrics", "seed_rollback_note"]));
    expect(r.github.issues).toHaveLength(1);
    expect(first.noteCount).toBe(NOTES.length);
    expect((await listLabels(r.store, "local:test:testing"))).toHaveLength(LABELS.length);
    expect(out.errors).toEqual([]);
    // Every write that could repeat carried a fixed request id.
    const writes = r.keeper.sent.filter((v) => ["case_commit", "case_add_item"].includes(v.verb));
    expect(writes.every((w) => typeof w.request_id === "string")).toBe(true);
    // The agent's proposal went as the service alone; the hand off and the GitHub step on behalf of the operator.
    const by = Object.fromEntries(writes.filter((w) => w.verb === "case_add_item").map((w) => [w.request_id, w.asOperator]));
    expect(by["propose:seed-r1:rollback_note"]).toBe(false);
    expect(by["handoff:seed-3f6c1a52-8d0b-4e7a-9a41-5b2d7c9e1f10"]).toBe(true);
    expect(by["github:GodSpeedAI/horizon-sandbox#1"]).toBe(true);
    // The triage case is advanced once, under a fixed id, after the steps are added.
    const advances = r.keeper.sent.filter((v) => v.verb === "case_advance");
    expect(advances.length).toBeGreaterThan(0);
    expect(new Set(advances.map((a) => a.request_id)).size).toBe(1);
    expect(advances[0]!.request_id).toMatch(/^advance:seed:case_fake_\d+:3$/);
  });

  test("seed-status reports each part", async () => {
    const s = setups();
    const r = rig(s);
    const names = (out: ReturnType<typeof io>) => out.lines.filter((l) => /^ {2}(present|MISSING) /.test(l));
    const before = io();
    expect(await main(["--status"], s.env, before, r.deps)).toBe(0);
    expect(names(before).every((l) => l.includes("MISSING"))).toBe(true);
    expect(before.lines.join("\n")).toContain("are missing");

    expect(await main([], s.env, io(), r.deps)).toBe(0);
    const after = io();
    expect(await main(["--status"], s.env, after, r.deps)).toBe(0);
    const lines = names(after);
    expect(lines.every((l) => l.includes("present"))).toBe(true);
    const text = lines.join("\n");
    for (const part of [
      "templates", "policy lets the operator add steps", "case release", "case triage", "GitHub issue ", "on the test board", "step from the GitHub issue", "step handed off",
      "step proposed by an agent", "decision waiting for the operator", "notes", "conversation", "labels",
      ...OBLIGATIONS.map((o) => `record ${o.id}`), ...SESSIONS.map((x) => `record ${x.id}`), "record journey:J-SEED:release:3",
    ]) {
      expect(text).toContain(part);
    }
    expect(before.lines.filter((l) => l.includes("MISSING")).length).toBe(lines.length);
    expect(after.lines.join("\n")).toContain("All ");
  });

  test("a part removed from the world shows as missing", async () => {
    const s = setups();
    const r = rig(s);
    await main([], s.env, io(), r.deps);
    r.github.board.clear();
    const out = io();
    await main(["--status"], s.env, out, r.deps);
    expect(out.lines.filter((l) => l.startsWith("  MISSING")).map((l) => l.trim())[0]).toContain("GitHub issue on the test board");
  });
});

describe("seed-clear", () => {
  function fakeGhPath(): string {
    const dir = tmp();
    const gh = join(dir, "gh");
    writeFileSync(gh, `#!/bin/sh\ncase "$*" in\n*"issue list"*) echo '[]';;\n*"project list"*) echo '{"projects":[]}';;\nesac\n`);
    chmodSync(gh, 0o755);
    return `${dir}:${process.env.PATH}`;
  }

  test("seed-clear never touches production or the personal record", async () => {
    const s = setups({ production: true });
    const personal = join(s.base, "personal-record");
    mkdirSync(personal, { recursive: true });
    writeFileSync(join(personal, "ledger.json"), "personal");
    writeFileSync(join(s.root, "cell", "app.sqlite"), "test data");
    const env = { ...s.env, PATH: fakeGhPath() };
    const calls: string[][] = [];
    const deps: ClearDeps = {
      clear: (args, e, out, err) => (calls.push([...args]), setupClear(args, e, out, err)),
      init: setupInit,
      running: async () => [],
      ask: async () => "yes",
    };
    const out = io();
    expect(await clearTestSetup([], env, out, deps)).toBe(0);
    // Only the test setup was named, and the list was shown before the delete.
    expect(calls).toEqual([["--setup", "testing"], ["--setup", "testing", "--yes"]]);
    expect(out.lines.join("\n")).toContain(join(s.root, "cell", "app.sqlite"));
    expect(existsSync(join(s.root, "cell", "app.sqlite"))).toBe(false);
    expect(existsSync(join(s.root, "SETUP.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(s.root, "SETUP.json"), "utf8")).name).toBe("testing");
    // Production and the personal record are untouched.
    expect(readFileSync(join(s.base, "production", "cell", "app.sqlite"), "utf8")).toBe("production data");
    expect(existsSync(join(s.base, "production", "SETUP.json"))).toBe(true);
    expect(readFileSync(join(personal, "ledger.json"), "utf8")).toBe("personal");

    // Production is refused before anything is listed or deleted.
    const calls2: string[][] = [];
    const refused = io();
    const code = await clearTestSetup(["--yes"], { ...env, HORIZON_SETUP: "production" }, refused, { ...deps, clear: (a) => (calls2.push([...a]), 0) });
    expect(code).toBe(1);
    expect(calls2).toEqual([]);
    expect(readFileSync(join(s.base, "production", "cell", "app.sqlite"), "utf8")).toBe("production data");
  });

  test("seed-clear asks first, and says to stop a running setup instead of deleting under it", async () => {
    const s = setups();
    writeFileSync(join(s.root, "cell", "keep.txt"), "keep");
    const env = { ...s.env, PATH: fakeGhPath() };
    const base = { clear: setupClear, init: setupInit, running: async () => [] as string[] };
    // Not confirmed: nothing is deleted.
    const no = io();
    expect(await clearTestSetup([], env, no, { ...base, ask: async () => "no" })).toBe(1);
    expect(existsSync(join(s.root, "cell", "keep.txt"))).toBe(true);
    // Running: refused in words, nothing deleted even with --yes.
    const up = io();
    expect(await clearTestSetup(["--yes"], env, up, { ...base, running: async () => ["the case keeper (/x/sea-forge.sock)"], ask: async () => "yes" })).toBe(1);
    expect(up.errors.join("\n")).toContain("stop the test setup first");
    expect(existsSync(join(s.root, "cell", "keep.txt"))).toBe(true);
    // Confirmed and stopped: gone.
    expect(await clearTestSetup([], env, io(), { ...base, ask: async () => "yes" })).toBe(0);
    expect(existsSync(join(s.root, "cell", "keep.txt"))).toBe(false);
  });
});

describe("seed records: runs begin on the rulebook snapshot id", () => {
  /** A stand-in realitytrace program that logs every call and answers just enough for a run to begin. */
  function fakeBin(dir: string, snapshotReply: string): { bin: string; log: string } {
    const log = join(dir, "calls.log");
    const bin = join(dir, "realitytrace");
    writeFileSync(
      bin,
      `#!/bin/sh
echo "$@" >> "${log}"
case "$1 $2" in
  "repo list") echo '{"repos":[]}';;
  "repo enroll") echo '{"repo_id":"R1"}';;
  "snapshot create") echo '${snapshotReply}';;
  "run begin") echo '{"run_id":"run1"}';;
  "ledger export") echo '[]';;
  *) echo '{}';;
esac
`,
    );
    chmodSync(bin, 0o755);
    return { bin, log };
  }
  async function beginOn(snapshotReply: string): Promise<string> {
    const { root, env } = setups();
    const { setupMapping } = await import("../src/config/setup.ts");
    const { recordsPort } = await import("../scripts/seed.ts");
    const mapping = setupMapping("testing", env);
    mkdirSync(mapping.cell, { recursive: true });
    const { bin, log } = fakeBin(root, snapshotReply);
    const port = recordsPort(mapping, { ...env, REALITYTRACE_BIN: bin });
    await port.openRun("journey-1");
    const begin = readFileSync(log, "utf8").split("\n").find((l) => l.startsWith("run begin"))!;
    return begin;
  }

  test("with the rulebook connected the run begins on the real snapshot id, not the fixed one", async () => {
    const begin = await beginOn('{"snapshot_id":"sha256:abc123"}');
    expect(begin).toContain("--snapshot sha256:abc123");
    expect(begin).not.toContain("snapshot:horizon");
  });

  test("when the rulebook cannot be snapshotted the run begins on the genesis snapshot", async () => {
    const begin = await beginOn("{}");
    expect(begin).toContain("--snapshot snapshot:genesis");
  });
});
