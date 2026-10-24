// REQ-NAV-011 live witnesses (HORIZON-001 1.1.0): the vetted verifier, compiled to one pinned binary, runs under
// RealityTrace confined by the launcher (read-only view, no network); RealityTrace records the exit code, argv and
// completion time in its own ledger; the threshold precedes every run. Asserted on RealityTrace's ledger export.
// Opt-in: REALITYTRACE_BIN (with RT-1, completed_at) and HORIZON_BWRAP (an attested bubblewrap >= 0.12).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
  live("the confined verifier discriminates, and RealityTrace's ledger records exit code, argv and completion time after the threshold", () => {
    const config = { bin: RT!, dataHome: join(root, "rt-data"), stateHome: join(root, "rt-state"), repoDir: join(root, "rt-repo") };
    const rt = new RealityTraceObligation(config);
    const threshold = rt.declare(RECORDED, expectation);
    const yes = rt.run(threshold, argvFor(RECORDED), launcher(), 30);
    const no = rt.run(threshold, argvFor(ABSENT), launcher(), 30);
    expect([yes.exit_code, no.exit_code]).toEqual([0, 1]);
    expect(yes.position.ordinal).toBeGreaterThan(threshold.position.ordinal);
    const rows = ledger(config, rt.repo());
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
