// REQ-NAV-011 live witnesses (HORIZON-001 1.1.0): the vetted verifier, compiled to one pinned binary, runs under
// RealityTrace confined by the launcher (read-only view, no network); RealityTrace records the exit code, argv and
// completion time in its own ledger; the threshold precedes every run. Asserted on RealityTrace's ledger export.
// Opt-in: REALITYTRACE_BIN (with RT-1, completed_at) and HORIZON_BWRAP (an attested bubblewrap >= 0.12).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { RealityTraceObligation } from "../src/adapters/realitytrace-obligation.ts";
import { appendIntentRecord } from "../src/capabilities/navigation-intent.ts";
import { assertExpectedOutcome } from "../src/domain/expectation.ts";

const RT = process.env.REALITYTRACE_BIN;
const BWRAP = process.env.HORIZON_BWRAP;
const live = RT && BWRAP ? test : test.skip;
const RECORDED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TARGET = "concept:navigation_intent";
const ABSENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let root = "";
let verifier = "";
let storeDir = "";
beforeAll(async () => {
  if (!RT || !BWRAP) return;
  root = mkdtempSync(join(tmpdir(), "horizon-rt-obligation-"));
  verifier = join(root, "horizon-verify-intent");
  const built = spawnSync("bun", ["run", "scripts/build-verifier.ts", "--out", verifier], { encoding: "utf8" });
  if (built.status !== 0) throw new Error(built.stderr);
  storeDir = join(root, "store");
  mkdirSync(storeDir);
  const store = openSqliteStore({ path: join(storeDir, "app.sqlite") });
  await appendIntentRecord(store, { record: { intent_id: RECORDED, frame_id: "f", frame_revision: 1, actor_ref: "o", operation_ref: "horizon.write" }, tenant: "local", scopeId: "s", contract: { expectation: null, threshold: null, window: null } });
}, 120_000);
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

const launcher = () => [
  BWRAP!, "--unshare-all", "--die-with-parent", "--new-session",
  "--ro-bind", "/usr", "/usr", "--ro-bind-try", "/lib", "/lib", "--ro-bind-try", "/lib64", "/lib64",
  "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
  "--ro-bind", storeDir, storeDir, "--ro-bind", verifier, verifier, "--chdir", "/",
];
const argvFor = (intentId: string) => [verifier, "--store", join(storeDir, "app.sqlite"), "--tenant", "local", "--intent", intentId];
const expectation = assertExpectedOutcome({ modality: "obligation", statement: "the navigation intent record exists", refuted_by: "the verifier exits non-zero", irrelevant: [], unaccounted: [], verifier: { template_ref: "horizon.intent-recorded@1" }, window_s: 60 });

function ledger(rt: { dataHome: string; stateHome: string; repoDir: string }, repo: string): { append_ordinal: number; record_kind: string; payload: any }[] {
  const out = spawnSync(RT!, ["ledger", "export", "--repo", repo, "--json"], { cwd: rt.repoDir, env: { PATH: process.env.PATH, XDG_DATA_HOME: rt.dataHome, XDG_STATE_HOME: rt.stateHome }, encoding: "utf8" });
  return JSON.parse(out.stdout);
}

describe("the vetted verifier under RealityTrace", () => {
  live("the confined verifier discriminates, and RealityTrace's ledger records exit code, argv and completion time after the threshold", async () => {
    const config = { bin: RT!, dataHome: join(root, "rt-data"), stateHome: join(root, "rt-state"), repoDir: join(root, "rt-repo") };
    const rt = new RealityTraceObligation(config);
    const threshold = await rt.declare({ intentId: RECORDED, statement: expectation.statement, target: TARGET, criteria: { minimum_relevance: "medium", minimum_reliability: "medium" } });
    const opts = { target: TARGET, snapshot: "snapshot:horizon" };
    const yes = await rt.run(threshold, argvFor(RECORDED), launcher(), 30, opts);
    const no = await rt.run(threshold, argvFor(ABSENT), launcher(), 30, opts);
    expect([yes.exit_code, no.exit_code]).toEqual([0, 1]);
    expect(yes.position.ordinal).toBeGreaterThan(threshold.position.ordinal);
    const rows = ledger(config, await rt.repo());
    const thresholdRow = rows.find((row) => row.append_ordinal === threshold.position.ordinal)!;
    expect(thresholdRow.record_kind).toBe("threshold.declared");
    expect(thresholdRow.payload.states[0].state_id).toBe(threshold.threshold_id);
    const recorded = rows.find((row) => row.append_ordinal === yes.position.ordinal)!;
    const content = recorded.payload.representations[0].inline_content;
    expect(recorded.payload.observations[0].observation_id).toBe(yes.observation_id);
    expect(content.exit_code).toBe(0);
    expect(content.invocation.argv).toEqual(argvFor(RECORDED));
    expect(content.invocation.launcher[0]).toBe(BWRAP);
    expect(Date.parse(content.completed_at)).toBeGreaterThanOrEqual(Date.parse(content.started_at));
  }, 120_000);

  live("confinement denies the verifier a write to the target and any network", () => {
    const write = spawnSync(launcher()[0]!, [...launcher().slice(1), "/usr/bin/sh", "-c", `echo x > ${join(storeDir, "pwn")}`], { encoding: "utf8" });
    expect(write.status).not.toBe(0);
    expect(write.stderr).toContain("Read-only file system");
    const net = spawnSync(launcher()[0]!, [...launcher().slice(1), "/usr/bin/sh", "-c", "exec 3<>/dev/tcp/1.1.1.1/53 && echo connected"], { encoding: "utf8" });
    expect(net.stdout).not.toContain("connected");
    expect(net.status).not.toBe(0);
  }, 60_000);

  live("the verifier binary is pinned: its digest is what the build reports", () => {
    const built = spawnSync("bun", ["run", "scripts/build-verifier.ts", "--out", join(root, "again")], { encoding: "utf8" });
    const reported = JSON.parse(built.stdout.trim().split("\n").pop()!).sha256 as string;
    expect(reported).toBe(createHash("sha256").update(readFileSync(join(root, "again"))).digest("hex"));
  }, 120_000);
});

// Stage 4 (annex): the adapter is async, takes its question, thresholds and target as input, and stops a child that hangs.
// These use a fake `realitytrace` script, so they run everywhere.
describe("the RealityTrace obligation adapter, against a fake binary", () => {
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
  function rig(script: string, timeoutMs?: number, rulebookEntry?: string) {
    const dir = mkdtempSync(join(tmpdir(), "horizon-rt-fake-"));
    dirs.push(dir);
    const bin = join(dir, "realitytrace");
    writeFileSync(bin, `#!/bin/sh\n${script}\n`);
    chmodSync(bin, 0o755);
    return { dir, bin, rt: new RealityTraceObligation({ bin, dataHome: join(dir, "d"), stateHome: join(dir, "s"), repoDir: join(dir, "repo"), ...(timeoutMs ? { timeoutMs } : {}), ...(rulebookEntry ? { rulebookEntry } : {}) }) };
  }
  const input = { intentId: "i1", statement: "the record exists", target: TARGET, criteria: { minimum_relevance: "high", minimum_reliability: "low" } };

  test("declare writes question and threshold before run", async () => {
    const { rt, bin } = rig(
      `echo "$1 $2" >> $0.log
for a in "$@"; do case "$a" in --file) f=1;; *) [ -n "$f" ] && { cat "$a" >> $0.files; echo >> $0.files; f=; };; esac; done
case "$1 $2" in
  "repo list") echo '{"repos":[]}';;
  "repo enroll") echo '{"repo_id":"R1"}';;
  "question declare") echo '{}';;
  "threshold declare") echo '{"threshold_id":"t-i1","ledger_position":{"ledger_id":"L","append_ordinal":4}}';;
  "run begin") echo '{"run_id":"run1"}';;
  "plan create") echo '{}';;
  "verify run") echo '{"observations":[{"observation_id":"o1","exit_code":1,"ledger_position":{"ledger_id":"L","append_ordinal":6}}]}';;
esac`,
    );
    const threshold = await rt.declare(input);
    expect(threshold.position).toEqual({ ledger_id: "L", ordinal: 4 });
    const run = await rt.run(threshold, ["v"], [], 5, { target: "concept:other", snapshot: "snapshot:test" });
    expect(run.position.ordinal).toBe(6);
    const calls = readFileSync(`${bin}.log`, "utf8").trim().split("\n");
    const order = calls.filter((c) => ["question declare", "threshold declare", "run begin", "plan create", "verify run"].includes(c));
    expect(order).toEqual(["question declare", "threshold declare", "run begin", "plan create", "verify run"]);
    const files = readFileSync(`${bin}.files`, "utf8");
    expect(files).toContain('"title":"the record exists"');
    expect(files).toContain('"minimum_relevance":"high"');
    expect(files).toContain('"minimum_reliability":"low"');
  });

  test("horizon run begins on the real snapshot id", async () => {
    const SNAP = "sha256:" + "ab".repeat(32);
    const { rt, bin, dir } = rig(
      `echo "$@" >> $0.log
case "$1 $2" in
  "repo list") echo '{"repos":[]}';;
  "repo enroll") echo '{"repo_id":"R1"}';;
  "semantic configure") echo '{"state":"semantic"}';;
  "snapshot create") echo '{"snapshot_id":"${SNAP}"}';;
  "run begin") echo '{"run_id":"run1"}';;
  "plan create") echo '{}';;
  "verify run") echo '{"observations":[{"observation_id":"o1","exit_code":0,"ledger_position":{"ledger_id":"L","append_ordinal":6}}]}';;
esac`,
      undefined,
      "/rulebook/interaction-model.sea",
    );
    const snapshot = await rt.snapshot();
    expect(snapshot).toBe(SNAP);
    expect(rt.rulebookConnected()).toBe(true);
    await rt.run({ question_id: "q", threshold_id: "t", position: { ledger_id: "L", ordinal: 1 } }, ["v"], [], 5, { target: TARGET, snapshot });
    const log = readFileSync(`${bin}.log`, "utf8");
    expect(log).toContain("semantic configure --repo R1 --entry /rulebook/interaction-model.sea");
    expect(log).toContain(`run begin --repo R1 --snapshot ${SNAP}`);
    expect(log).not.toContain("snapshot:horizon");
    expect(dir).toBeTruthy();
  });

  test("a rulebook that cannot be snapshotted falls back to genesis and says it is not connected", async () => {
    const { rt } = rig(`case "$1 $2" in "repo list") echo '{"repos":[]}';; "repo enroll") echo '{"repo_id":"R1"}';; "semantic configure") echo no >&2; exit 3;; esac`, undefined, "/rulebook/x.sea");
    expect(await rt.snapshot()).toBe("snapshot:genesis");
    expect(rt.rulebookConnected()).toBe(false);
  });

  test("sxr does not block the event loop", async () => {
    const { rt } = rig(`case "$1 $2" in "repo list") sleep 0.6; echo '{"repos":[]}';; "repo enroll") echo '{"repo_id":"R1"}';; esac`);
    let ticks = 0;
    const timer = setInterval(() => (ticks += 1), 20);
    const started = Date.now();
    await rt.repo();
    clearInterval(timer);
    expect(Date.now() - started).toBeGreaterThanOrEqual(500);
    // A blocked loop would have counted about zero ticks across 600 ms.
    expect(ticks).toBeGreaterThan(10);
  });

  // Commit b7ce7f4 made repo() asynchronous but stored its memo after the awaits, so concurrent first callers each ran git init.
  test("concurrent first callers initialise the git repository and enrol once", async () => {
    const { rt, bin, dir } = rig(`echo "$1 $2" >> $0.log\ncase "$1 $2" in "repo list") echo '{"repos":[]}';; "repo enroll") echo '{"repo_id":"R1"}';; esac`);
    const ids = await Promise.all([rt.repo(), rt.repo(), rt.repo(), rt.repo(), rt.repo()]);
    expect(ids).toEqual(["R1", "R1", "R1", "R1", "R1"]);
    const count = spawnSync("git", ["rev-list", "--count", "HEAD"], { cwd: join(dir, "repo"), encoding: "utf8" });
    expect(count.stdout.trim()).toBe("1");
    const calls = readFileSync(`${bin}.log`, "utf8").trim().split("\n");
    expect(calls.filter((c) => c === "repo enroll")).toHaveLength(1);
  });

  test("concurrent snapshot callers configure and snapshot once", async () => {
    const SNAP = "sha256:" + "cd".repeat(32);
    const { rt, bin } = rig(
      `echo "$1 $2" >> $0.log\ncase "$1 $2" in "repo list") echo '{"repos":[]}';; "repo enroll") echo '{"repo_id":"R1"}';; "semantic configure") echo '{}';; "snapshot create") echo '{"snapshot_id":"${SNAP}"}';; esac`,
      undefined,
      "/rulebook/interaction-model.sea",
    );
    expect(await Promise.all([rt.snapshot(), rt.snapshot(), rt.snapshot()])).toEqual([SNAP, SNAP, SNAP]);
    const calls = readFileSync(`${bin}.log`, "utf8").trim().split("\n");
    expect(calls.filter((c) => c === "snapshot create")).toHaveLength(1);
    expect(calls.filter((c) => c === "semantic configure")).toHaveLength(1);
  });

  test("a failed initialisation is not cached: every waiter sees the error and a later call retries", async () => {
    // The binary fails until a marker file exists, so the failure is removed without touching the adapter.
    const { rt, dir } = rig(`[ -f ${"$"}0.ok ] || { echo boom >&2; exit 3; }\ncase "$1 $2" in "repo list") echo '{"repos":[]}';; "repo enroll") echo '{"repo_id":"R1"}';; esac`);
    const failed = await Promise.allSettled([rt.repo(), rt.repo(), rt.repo()]);
    expect(failed.map((r) => r.status)).toEqual(["rejected", "rejected", "rejected"]);
    for (const r of failed) expect(String((r as PromiseRejectedResult).reason)).toMatch(/boom/);
    writeFileSync(join(dir, "realitytrace.ok"), "");
    expect(await rt.repo()).toBe("R1");
  });

  test("a timeout kills the child", async () => {
    const { rt, dir } = rig(`echo $$ > $0.pid\nexec sleep 30`, 300);
    const started = Date.now();
    await expect(rt.repo()).rejects.toThrow(/timed out after/);
    expect(Date.now() - started).toBeLessThan(5_000);
    const pid = Number(readFileSync(join(dir, "realitytrace.pid"), "utf8").trim());
    let alive = true;
    try {
      process.kill(pid, 0);
    } catch {
      alive = false;
    }
    expect(alive).toBe(false);
  });
});
