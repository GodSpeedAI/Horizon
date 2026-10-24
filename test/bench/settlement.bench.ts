// BM-SETTLE (docs/benchmarks.md, godspeed-readiness): what does one consequential, settled Horizon operation cost, and
// does the stack leak? Runs the J02 revision 2 supported-obligation flow (test/J02r2-live.test.ts, "causal order across
// owners, and a supported obligation settles") N times on one live cell (real sea-forge-server, real RealityTrace,
// attested bubblewrap), with fresh intent ids, and writes metrics.json + samples.jsonl.
//
// Run: bun run test/bench/settlement.bench.ts   (opt-in: SEA_FORGE_SERVER_BIN, REALITYTRACE_BIN, HORIZON_BWRAP)
// Env: BENCH_N (default 10), GSR_RUN_DIR (output dir; default ~/projects/_wt/bm-settle-<timestamp>).
// Run alone: the caller holds ~/projects/_wt/cargo.lock around this process.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { cpus, homedir, release, totalmem, type } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { PendingIntent } from "../../src/capabilities/pending-intent.ts";
import { readPending } from "../../src/capabilities/pending-intent.ts";
import { BIN, BWRAP, RECORD, RT, WINDOW_S, type Cell, cell, ensureVerifier, expectation, rtRows, runCleanups, settleAfterClose, seaForgeSettlement } from "../support/j02r2-rig.ts";

const REPO = resolve(import.meta.dir, "../..");
process.chdir(REPO); // the rig reads domain/ and scripts/ relative to the repo root

if (!BIN || !RT || !BWRAP) {
  console.log("BM-SETTLE skipped: set SEA_FORGE_SERVER_BIN, REALITYTRACE_BIN and HORIZON_BWRAP to run it");
  process.exit(0);
}

const N = Number(process.env.BENCH_N ?? 10);
const IDLE_S = 60;
const RUN_DIR = process.env.GSR_RUN_DIR ?? join(homedir(), "projects/_wt", `bm-settle-${new Date().toISOString().replace(/[:.]/g, "-")}`);
mkdirSync(RUN_DIR, { recursive: true });
const SAMPLES = join(RUN_DIR, "samples.jsonl");
writeFileSync(SAMPLES, "");

type Stage = "threshold" | "authority_decision" | "discrimination" | "execution" | "verification" | "closure" | "settlement";
const STAGES: Stage[] = ["threshold", "authority_decision", "discrimination", "execution", "verification", "closure", "settlement"];
type Store = "sea_forge" | "realitytrace" | "horizon_store";
const STORES: Store[] = ["sea_forge", "realitytrace", "horizon_store"];

/** Recursive byte count of a file or directory tree (0 when missing). Stands in for each store's on-disk size. */
function bytesUnder(path: string): number {
  if (!existsSync(path)) return 0;
  const st = statSync(path);
  if (!st.isDirectory()) return st.size;
  let total = 0;
  for (const e of readdirSync(path, { withFileTypes: true })) total += bytesUnder(join(path, e.name));
  return total;
}

/** SEA-Forge: <root>/ledgers (entries, mmr, checkpoints). RealityTrace: its data and state homes. Horizon: its store dir. */
function storeBytes(c: Cell): Record<Store, number> {
  return {
    sea_forge: bytesUnder(join(c.root, "ledgers")),
    realitytrace: bytesUnder(c.rt.dataHome) + bytesUnder(c.rt.stateHome),
    horizon_store: bytesUnder(c.storeDir),
  };
}

/** Resident set from /proc/<pid>/status, in kB. */
function rssKb(pid: number): number {
  const m = /^VmRSS:\s+(\d+) kB/m.exec(readFileSync(`/proc/${pid}/status`, "utf8"));
  return m ? Number(m[1]) : NaN;
}

const ms = (iso?: string | null): number => (iso ? Date.parse(iso) : NaN);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : NaN);

/** Nearest-rank percentile. */
function pct(xs: number[], p: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))] ?? NaN;
}

/** Least-squares slope of ys against the operation index. */
function slopePerOp(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return NaN;
  const mx = (n - 1) / 2;
  const my = mean(ys);
  let num = 0;
  let den = 0;
  ys.forEach((y, x) => {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  });
  return num / den;
}

const profileOf = (bin: string) => (bin.includes("/release/") ? "release" : "debug");
const gitHead = (dir: string): string => {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "unknown";
};
/** The binaries live at <repo>/target/<profile>/<bin>. */
const repoOf = (bin: string) => resolve(dirname(bin), "../..");

function cpuModel(): string {
  try {
    const m = /^model name\s*:\s*(.+)$/m.exec(readFileSync("/proc/cpuinfo", "utf8"));
    return m?.[1]?.trim() ?? "unknown";
  } catch {
    return "unknown";
  }
}

function rtEnv(c: Cell): NodeJS.ProcessEnv {
  return { PATH: process.env.PATH, XDG_DATA_HOME: c.rt.dataHome, XDG_STATE_HOME: c.rt.stateHome };
}

/** Hard assertion: RealityTrace's own ledger verifies, per repo, through its CLI (`ledger verify`). */
function verifyRealityTraceLedgers(c: Cell): { ok: boolean; detail: string } {
  const env = rtEnv(c);
  const listed = spawnSync(RT!, ["repo", "list", "--json"], { cwd: c.root, env, encoding: "utf8" });
  const repos = ((JSON.parse(listed.stdout).repos ?? []) as { repo_id: string }[]).map((r) => r.repo_id);
  if (repos.length === 0) return { ok: false, detail: "no RealityTrace repo listed" };
  const results = repos.map((repo) => {
    const r = spawnSync(RT!, ["ledger", "verify", "--repo", repo, "--json"], { cwd: c.root, env, encoding: "utf8" });
    return { repo, status: r.status, out: (r.stdout ?? "").trim().slice(0, 300) };
  });
  const ok = results.every((r) => r.status === 0);
  return { ok, detail: JSON.stringify(results) };
}

interface RepSample {
  rep: number;
  intent_id: string | null;
  settled: boolean;
  status: string | null;
  epistemic_status: string | null;
  error: string | null;
  stage_ms: Record<Stage, number>;
  commit_wall_ms: number;
  settle_wall_ms: number;
  op_wall_ms: number;
  verifier_runs: number;
  verifications: number;
  bytes: Record<Store, number>;
  rss_kb: { sea_forge_server: number; horizon_bench: number };
  reason: string | null;
  terminal: unknown;
  closure_committed_at: string | null;
  window_closes_at: string | null;
}

const samples: RepSample[] = [];
const assertions: { id: string; ok: boolean; detail: string }[] = [];
const metrics: Record<string, number> = {};

async function main(): Promise<void> {
  const verifier = ensureVerifier();
  const c = await cell("allow", { computeAllowance: Math.max(10, N), steeringAllowance: Math.max(20, N) });
  const store = c.app.runtime.runtime.store;
  const tenant = c.app.caller.tenant;

  const startRss = { sea_forge_server: rssKb(c.serverPid), horizon_bench: rssKb(process.pid) };
  const startBytes = storeBytes(c);
  console.log(`cell ready: ${RUN_DIR}, verifier ${verifier.sha256.slice(0, 12)}, N=${N}`);

  for (let rep = 0; rep < N; rep++) {
    const beforeBytes = storeBytes(c);
    const verifiersBefore = rtRows(c).filter(isVerifierRun).length;
    const t0 = Date.now();
    let sample: RepSample = {
      rep, intent_id: null, settled: false, status: null, epistemic_status: null, error: null,
      stage_ms: Object.fromEntries(STAGES.map((s) => [s, NaN])) as Record<Stage, number>,
      commit_wall_ms: NaN, settle_wall_ms: NaN, op_wall_ms: NaN, verifier_runs: 0, verifications: 0,
      bytes: { sea_forge: 0, realitytrace: 0, horizon_store: 0 }, rss_kb: { sea_forge_server: NaN, horizon_bench: NaN },
      reason: null, terminal: null, closure_committed_at: null, window_closes_at: null,
    };
    try {
      const commit = await c.app.commitNavigationIntent({ operationRef: RECORD, expectation: expectation() });
      const tCommit = Date.now();
      const id = commit.intent.intent_id;
      sample.intent_id = id;
      const pendingAtCommit = (await readPending(store, tenant, id))!.pending;
      // Same wait as settleAfterClose (the rig), timed from the window close.
      const wait = Date.parse(pendingAtCommit.window!.closes_at) - Date.now() + 500;
      if (wait > 0) await Bun.sleep(wait);
      const tSettle = Date.now();
      const settlement = await c.app.settleNavigationIntent(id);
      const tEnd = Date.now();
      const ref = settlement.settlement_reference as { status: string; final: boolean; epistemic_status: string };
      const pend = (await readPending(store, tenant, id))!.pending;
      sample = { ...sample, ...stageSample(pend, t0) };
      sample.reason = (ref as { reason?: string | null }).reason ?? null;
      sample.terminal = pend.terminal ?? null;
      sample.closure_committed_at = pend.closure?.committed_at ?? null;
      sample.window_closes_at = pend.window?.closes_at ?? null;
      sample.commit_wall_ms = tCommit - t0;
      sample.settle_wall_ms = tEnd - tSettle;
      sample.op_wall_ms = tEnd - t0;
      sample.status = ref.status;
      sample.epistemic_status = ref.epistemic_status;
      sample.settled = ref.status === "settled" && ref.final === true && ref.epistemic_status === "supported";
      // Cross-check on SEA-Forge's own settlement packet, as the gate does.
      const packet = await seaForgeSettlement(c, pend.operation_id!);
      if (packet.ok !== true) sample.error = `authority_settle not ok: ${JSON.stringify(packet).slice(0, 200)}`;
    } catch (error) {
      sample.error = error instanceof Error ? error.message : String(error);
    }
    sample.verifier_runs = rtRows(c).filter(isVerifierRun).length - verifiersBefore;
    const afterBytes = storeBytes(c);
    sample.bytes = {
      sea_forge: afterBytes.sea_forge - beforeBytes.sea_forge,
      realitytrace: afterBytes.realitytrace - beforeBytes.realitytrace,
      horizon_store: afterBytes.horizon_store - beforeBytes.horizon_store,
    };
    sample.rss_kb = { sea_forge_server: rssKb(c.serverPid), horizon_bench: rssKb(process.pid) };
    samples.push(sample);
    appendFileSync(SAMPLES, JSON.stringify(sample) + "\n");
    console.log(`rep ${rep}: ${sample.settled ? "settled/supported" : `NOT settled (${sample.status}/${sample.epistemic_status}${sample.error ? `, ${sample.error}` : ""})`} op=${sample.op_wall_ms} ms`);
  }

  // Hard assertions (correctness): every repetition settles.
  const bad = samples.filter((s) => !s.settled);
  assertions.push({
    id: "every-rep-settled-supported",
    ok: samples.length === N && bad.length === 0,
    detail: `${samples.length - bad.length}/${N} settled supported/settled; failing reps: ${bad.map((s) => `${s.rep}:${s.status ?? "none"}/${s.epistemic_status ?? "none"}${s.error ? ` (${s.error.slice(0, 120)})` : ""}`).join("; ") || "none"}`,
  });

  const rt = verifyRealityTraceLedgers(c);
  assertions.push({ id: "realitytrace-ledger-verifies", ok: rt.ok, detail: rt.detail });

  // Idle: no operation runs for IDLE_S; every store must stay byte-identical.
  const idle0 = storeBytes(c);
  await Bun.sleep(IDLE_S * 1000);
  const idle1 = storeBytes(c);
  for (const s of STORES) {
    const delta = idle1[s] - idle0[s];
    assertions.push({ id: `idle-growth-zero-${s.replace("_", "-")}`, ok: delta === 0, detail: `${delta} bytes over ${IDLE_S} s (${idle0[s]} -> ${idle1[s]})` });
    metrics[`idle_growth_bytes.${s}`] = delta;
  }

  const endRss = { sea_forge_server: rssKb(c.serverPid), horizon_bench: rssKb(process.pid) };
  summarize(startRss, endRss, startBytes, storeBytes(c));
  await c.app.close().catch(() => undefined);
}

const isVerifierRun = (r: { record_kind: string; payload: any }) =>
  r.record_kind === "observation.recorded" && r.payload?.representations?.[0]?.inline_content?.verifier_id === "command";

/** Per-stage wall times from the pending record's own timestamps, bounded by the call-site timestamps. */
function stageSample(pend: PendingIntent, t0: number): Pick<RepSample, "stage_ms" | "verifications"> {
  const d = pend.discrimination;
  const v = pend.verifications ?? [];
  const opened = ms(pend.window?.opens_at);
  const closes = ms(pend.window?.closes_at);
  const committed = ms(pend.closure?.committed_at);
  // Horizon's scheduled close (at window close) asks SEA-Forge for the closure, then settles; the explicit settle call reads it back.
  const stage_ms: Record<Stage, number> = {
    threshold: opened - t0,
    authority_decision: ms(d?.started_at) - opened,
    discrimination: ms(d?.completed_at) - ms(d?.started_at),
    execution: ms(v[0]?.started_at) - ms(d?.completed_at),
    verification: sum(v.map((x) => ms(x.completed_at) - ms(x.started_at))),
    closure: committed - closes,
    settlement: ms(pend.terminal?.at) - committed,
  };
  return { stage_ms, verifications: v.length };
}

function summarize(startRss: { sea_forge_server: number; horizon_bench: number }, endRss: { sea_forge_server: number; horizon_bench: number },
  startBytes: Record<Store, number>, endBytes: Record<Store, number>): void {
  const settled = samples.filter((s) => s.settled);
  for (const s of STAGES) {
    const xs = settled.map((x) => x.stage_ms[s]).filter(Number.isFinite);
    metrics[`stage.${s}.p50_ms`] = pct(xs, 0.5);
    metrics[`stage.${s}.p95_ms`] = pct(xs, 0.95);
  }
  const walls = settled.map((x) => x.op_wall_ms);
  metrics["op.wall.p50_ms"] = pct(walls, 0.5);
  metrics["op.wall.p95_ms"] = pct(walls, 0.95);
  metrics["verifier_runs_per_op"] = mean(samples.map((s) => s.verifier_runs));
  metrics["verifications_per_op"] = mean(samples.map((s) => s.verifications));
  for (const s of STORES) metrics[`bytes_per_op.${s}`] = (endBytes[s] - startBytes[s]) / N;
  metrics["rss_kb.sea_forge_server.start"] = startRss.sea_forge_server;
  metrics["rss_kb.sea_forge_server.after_n"] = endRss.sea_forge_server;
  metrics["rss_kb.sea_forge_server.slope_per_op"] = slopePerOp(samples.map((s) => s.rss_kb.sea_forge_server));
  metrics["rss_kb.horizon_bench.start"] = startRss.horizon_bench;
  metrics["rss_kb.horizon_bench.after_n"] = endRss.horizon_bench;
  metrics["rss_kb.horizon_bench.slope_per_op"] = slopePerOp(samples.map((s) => s.rss_kb.horizon_bench));
  metrics["reps_settled"] = settled.length;

  const sfProfile = profileOf(BIN!);
  const rtProfile = profileOf(RT!);
  const meta = {
    benchmark: "BM-SETTLE",
    hardware: {
      cpu: cpuModel(), cores: cpus().length, mem_total_mb: Math.round(totalmem() / 1048576),
      os: `${type()} ${release()}`, profile: sfProfile === rtProfile ? sfProfile : `mixed(sea-forge=${sfProfile},realitytrace=${rtProfile})`,
    },
    revisions: { horizon: gitHead(REPO), "sea-forge": gitHead(repoOf(BIN!)), realitytrace: gitHead(repoOf(RT!)) },
    params: { n: N, window_s: WINDOW_S, idle_s: IDLE_S, compute_allowance: Math.max(10, N), flow: "J02r2 supported-obligation" },
    metrics,
    assertions,
    samples_file: "samples.jsonl",
    notes: [
      "stage boundaries: threshold = commit start to window open; authority_decision = window open to discrimination start; " +
        "discrimination/verification = verifier record timestamps; execution = discrimination end to first verification start (includes SEA-Forge evidence submission); " +
        "closure = window close to SEA-Forge closure commit (scheduled by Horizon at close); settlement = closure commit to Horizon's terminal record. settle_wall_ms = the explicit settle call.",
      "bytes_per_op = (store size after N - size before N) / N; stores are sized recursively (SEA-Forge <root>/ledgers, RealityTrace data+state homes, Horizon store dir incl. sqlite WAL).",
      "the Horizon process is the bench process itself (Horizon runs in-process); its RSS is process.pid.",
    ],
  };
  writeFileSync(join(RUN_DIR, "metrics.json"), JSON.stringify(meta, null, 2) + "\n");
  console.log(`wrote ${join(RUN_DIR, "metrics.json")}`);
  console.log(JSON.stringify({ assertions: assertions.map((a) => [a.id, a.ok]), settled: settled.length, of: N }));
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  runCleanups();
}
if (assertions.some((a) => !a.ok) || exitCode !== 0) {
  console.error("BM-SETTLE: hard assertion failed");
  process.exit(1);
}
process.exit(0);
