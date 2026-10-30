// HC-06 live witness (opt-in: REALITYTRACE_BIN with `ingest --stdin-format agent-event-v1`).
// Ingests a small agent-event batch with the real CLI into scratch XDG homes, then asserts the view's figures
// equal sums computed directly from `ledger export` (INV-13). Reads only; Horizon stores nothing.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realityTraceEconomics } from "../src/adapters/realitytrace-economics.ts";

const RT = process.env.REALITYTRACE_BIN;
const live = RT ? test : test.skip;
let root = "";
let data = "";
let state = "";
let repoId = "";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const env = () => ({ PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "/", XDG_DATA_HOME: data, XDG_STATE_HOME: state });
function rt(args: string[], input?: string): any {
  const r = spawnSync(RT!, args, { env: env(), encoding: "utf8", input });
  if (r.status !== 0) throw new Error(`realitytrace ${args.slice(0, 2).join(" ")}: ${r.stderr || r.stdout}`);
  return r.stdout.trim().startsWith("{") || r.stdout.trim().startsWith("[") ? JSON.parse(r.stdout) : r.stdout;
}
const ev = (n: string, extra: Record<string, unknown>) => ({
  schema: "agent-event/v1", event_id: sha(n), source: "hook", runtime: "claude", native_session_id: "sess-live", native_event_ref: n, kind: "usage",
  ts: "2026-10-30T10:00:00Z", case_id: "case:live", unit_id: "u", te_session_id: "t", role: "user", arm: "none",
  tokens: { input: 0, output: 0, cache_write: 0, cache_read: 0 }, token_quality: "EXACT", owner: "native", ...extra,
});

beforeAll(() => {
  if (!RT) return;
  root = mkdtempSync(join(tmpdir(), "horizon-economics-live-"));
  data = join(root, "data");
  state = join(root, "state");
  const repo = join(root, "repo");
  for (const dir of [data, state, repo]) mkdirSync(dir);
  spawnSync("git", ["init", "-q"], { cwd: repo });
  spawnSync("git", ["-c", "user.email=h@l", "-c", "user.name=h", "commit", "--allow-empty", "-qm", "i"], { cwd: repo });
  repoId = rt(["repo", "enroll", repo, "--json"]).repo_id;
  writeFileSync(join(root, "q.json"), JSON.stringify({ question_id: "agent-activity", question_form: "is_true", question_type: "verification", target_entities: [], expected_answer_shape: "boolean", title: "t" }));
  writeFileSync(join(root, "t.json"), JSON.stringify({ threshold_id: "th", minimum_relevance: "medium", minimum_reliability: "medium" }));
  rt(["question", "declare", "--repo", repoId, "--file", join(root, "q.json"), "--json"]);
  rt(["threshold", "declare", "--repo", repoId, "--question", "agent-activity", "--file", join(root, "t.json"), "--json"]);
  const run = rt(["run", "begin", "--repo", repoId, "--snapshot", "snapshot:horizon", "--question", "agent-activity", "--threshold", "th", "--require-declared", "--json"]).run_id;
  rt(["plan", "create", "--run", run, "--verifier", "agent-tap/claude", "--target", "th", "--json"]);
  const batch = [
    ev("u1", { tokens: { input: 100, output: 20, cache_write: 3, cache_read: 400 } }),
    ev("u2", { tokens: { input: 7, output: 1, cache_write: 0, cache_read: 0 }, token_quality: "ESTIMATED" }),
    ev("u3", { case_id: "unknown", tokens: { input: 5, output: 5, cache_write: 0, cache_read: 0 } }),
    ev("o1", { kind: "te_overhead", owner: "te", token_quality: "DERIVED", tokens: { input: 50, output: 0, cache_write: 0, cache_read: 0 } }),
    ev("i1", { kind: "te_injection", owner: "te", tokens: null, token_quality: "ESTIMATED", attributed_input_tokens: 40 }),
    ev("f1", { kind: "tool_fail", tokens: null, token_quality: "UNAVAILABLE", exit_code: 1 }),
  ];
  const text = batch.map((e) => JSON.stringify(e)).join("\n") + "\n";
  rt(["ingest", "--run", run, "--verifier", "agent-tap/claude", "--stdin-format", "agent-event-v1", "--json"], text);
  rt(["ingest", "--run", run, "--verifier", "agent-tap/claude", "--stdin-format", "agent-event-v1", "--json"], text); // redelivery is a no-op
}, 120_000);
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe("case economics against a live RealityTrace store", () => {
  live("the view's figures equal sums computed directly from ledger export", () => {
    const readout = realityTraceEconomics({ realitytrace_bin: RT!, data_home: data, state_home: state }).read();
    expect(readout.state).toBe("ok");
    if (readout.state !== "ok") return;
    const repo = readout.repos.find((r) => r.repo_id === repoId)!;
    const model = repo.model!;

    const ledger = rt(["ledger", "export", "--repo", repoId, "--json"]) as any[];
    const events = ledger.filter((r) => r.record_kind === "observation.recorded").map((r) => r.payload.extensions.agent_event);
    const sum = (pred: (e: any) => boolean) => events.filter(pred).reduce((n, e) => n + (e.tokens ? e.tokens.input + e.tokens.output + e.tokens.cache_read + e.tokens.cache_write : 0), 0);
    expect(events).toHaveLength(6); // redelivery did not add events
    expect(model.audit.agent_events).toBe(6);
    expect(model.totals.observed.total).toBe(sum((e) => e.owner === "native")); // 523 + 8 + 10 = 541
    expect(model.totals.observed.total).toBe(541);
    expect(model.totals.te_overhead.total).toBe(sum((e) => e.owner === "te"));
    expect(model.totals.te_injection_attributed).toBe(40);
    expect(model.totals.tool_fail).toBe(1);
    expect(model.totals.observed_estimated.total).toBe(8);
    expect(model.cases.map((c) => c.case_id)).toEqual(["case:live", null]);
    expect(model.unattributed_usage.observed.total).toBe(10);
    const caseSum = model.cases.reduce((n, c) => n + c.totals.observed.total, 0);
    expect(caseSum).toBe(model.totals.observed.total);
  });
});
