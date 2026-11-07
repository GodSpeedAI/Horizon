/**
 * `bun run scripts/measure-timings.ts --setup testing [--source personal] [--repo <repo_id>] [--runs 15] [--out <dir>]`
 * Read-only. Stage 5 measures the running setup over HTTP (port from the setup table), each item `--runs` times after one warm-up:
 *   day view         GET /desk/state.json (today)
 *   record lookup    GET /desk/search?q=...
 *   comparison view  GET /workspace/compare
 * and the event-to-record delay (observed_at minus ts of each agent event in the record). Writes `timings.json` (median and p95
 * per item against the 1 s budget, K9) and `delay.json` (median_ms, p95_ms, n, threshold_ms 2000 per D10) into `.agents/reports/v2-build/stage-5/`.
 * `measure()` (the in-process Stage 1 reading of one repository's day) is kept for its test. Nothing is written to any record.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLedgerDay, localDay } from "../src/adapters/ledger-day.ts";
import { recordReader, type RecordReader } from "../src/adapters/realitytrace-economics.ts";
import { argValue, setupMapping, SETUP_NAMES } from "../src/config/setup.ts";
import { compareSession, listSessions } from "../src/ui/workspace/compare-model.ts";
import { recordSourcesOf } from "./setup-health.ts";

const THRESHOLD_MS = 2000;

export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

/** Milliseconds from `ts` to `observed_at` for each agent event that has both. */
export function delaysOf(rows: readonly unknown[]): number[] {
  const out: number[] = [];
  for (const row of rows as { payload?: { extensions?: { agent_event?: { ts?: unknown; observed_at?: unknown } } } }[]) {
    const event = row?.payload?.extensions?.agent_event;
    if (!event || typeof event.ts !== "string" || typeof event.observed_at !== "string") continue;
    const ms = Date.parse(event.observed_at) - Date.parse(event.ts);
    if (Number.isFinite(ms) && ms >= 0) out.push(ms);
  }
  return out;
}

export interface Measured {
  readonly repo: string;
  readonly day: string;
  readonly day_ms: number;
  readonly lookup_ms: number;
  readonly compare_ms: number;
  readonly ledger_bytes: number;
  readonly delay: { median_ms: number; p95_ms: number; n: number; threshold_ms: number };
}

export function measure(reader: RecordReader, repoId: string, timeZone: string): Measured | { error: string } {
  const exported = reader.ledger(repoId);
  if (!exported.ok) return { error: exported.message };
  const ledger_bytes = JSON.stringify(exported.rows).length;
  const stamps = exported.rows.flatMap((r) => {
    const ts = (r as { payload?: { extensions?: { agent_event?: { ts?: unknown } } } })?.payload?.extensions?.agent_event?.ts;
    return typeof ts === "string" ? [ts] : [];
  });
  const counts = new Map<string, number>();
  for (const ts of stamps) {
    const day = localDay(ts, timeZone);
    if (day) counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const day = [...counts].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0];
  if (!day) return { error: "no dated agent events in this repository" };

  const scratch = mkdtempSync(join(tmpdir(), "horizon-timing-"));
  try {
    let t = performance.now();
    const cold = readLedgerDay(reader, { repoId, day, timeZone, cacheDir: scratch });
    const day_ms = performance.now() - t;
    if (!cold.ok) return { error: cold.message };
    t = performance.now();
    const warm = readLedgerDay(reader, { repoId, day, timeZone, cacheDir: scratch });
    const lookup_ms = performance.now() - t;
    if (!warm.ok) return { error: warm.message };
    t = performance.now();
    const sessions = listSessions(warm.rows);
    if (sessions[0]) compareSession({ rows: warm.rows, sessionId: sessions[0].session_id, intact: { intact: warm.intact, records: warm.records, divergence: warm.divergence } });
    const compare_ms = performance.now() - t;
    const delays = delaysOf(exported.rows).sort((a, b) => a - b);
    return { repo: repoId, day, day_ms, lookup_ms, compare_ms, ledger_bytes, delay: { median_ms: percentile(delays, 50), p95_ms: percentile(delays, 95), n: delays.length, threshold_ms: THRESHOLD_MS } };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const BUDGET_MS = 1000;

export interface TimedItem {
  readonly item: string;
  readonly path: string;
  readonly n: number;
  readonly median_ms: number;
  readonly p95_ms: number;
  readonly budget_ms: number;
  readonly pass: boolean;
}

/** Time `runs` GETs of `path` after one warm-up; each answer must be 200. */
export async function timeGets(base: string, item: string, path: string, runs: number, get: (url: string) => Promise<{ status: number }> = (u) => fetch(u)): Promise<TimedItem> {
  const once = async (): Promise<number> => {
    const t = performance.now();
    const response = await get(`${base}${path}`);
    if (response.status !== 200) throw new Error(`${item}: ${path} answered ${response.status}`);
    await (response as Response).arrayBuffer?.();
    return performance.now() - t;
  };
  await once();
  const samples: number[] = [];
  for (let i = 0; i < runs; i += 1) samples.push(await once());
  samples.sort((a, b) => a - b);
  const median_ms = Math.round(percentile(samples, 50) * 10) / 10;
  const p95_ms = Math.round(percentile(samples, 95) * 10) / 10;
  return { item, path, n: samples.length, median_ms, p95_ms, budget_ms: BUDGET_MS, pass: p95_ms <= BUDGET_MS };
}

export async function run(args: readonly string[], env: Record<string, string | undefined>, out: (line: string) => void, err: (line: string) => void): Promise<number> {
  const setup = argValue(args, "setup");
  if (!setup || !(SETUP_NAMES as readonly string[]).includes(setup)) {
    err("measure-timings: --setup <testing|production>");
    return 2;
  }
  const mapping = setupMapping(setup as "testing" | "production", env);
  const sourceName = argValue(args, "source") ?? "personal";
  const source = recordSourcesOf(mapping).find((s) => s.name === sourceName);
  if (!source) {
    err(`measure-timings: no record source named ${sourceName} in ${mapping.config}`);
    return 2;
  }
  const reader = recordReader(source, env.REALITYTRACE_BIN?.trim() || "realitytrace");
  const listed = reader.repos();
  if (!listed.ok) {
    err(`measure-timings: ${listed.message}`);
    return 1;
  }
  let repoId = argValue(args, "repo");
  if (!repoId) {
    let biggest = -1;
    for (const repo of listed.repos) {
      const ledger = reader.ledger(repo.repo_id);
      // Only a repository with dated agent events can be measured; among those, the biggest.
      const dated = ledger.ok && ledger.rows.some((r) => typeof (r as { payload?: { extensions?: { agent_event?: { ts?: unknown } } } })?.payload?.extensions?.agent_event?.ts === "string");
      const size = dated ? JSON.stringify(ledger.rows).length : -1;
      if (size > biggest) ((biggest = size), (repoId = repo.repo_id));
    }
  }
  if (!repoId) {
    err("measure-timings: no repository in this record source has dated agent events (try --source or --repo)");
    return 1;
  }
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const result = measure(reader, repoId, timeZone);
  if ("error" in result) {
    err(`measure-timings: ${result.error}`);
    return 1;
  }
  const base = `http://127.0.0.1:${mapping.horizonPort}`;
  const runs = Number(argValue(args, "runs") ?? "15");
  let items: TimedItem[];
  try {
    items = [
      await timeGets(base, "day view", "/desk/state.json", runs),
      await timeGets(base, "record lookup", "/desk/search?q=record", runs),
      await timeGets(base, "comparison view", "/workspace/compare", runs),
    ];
  } catch (error) {
    err(`measure-timings: the ${setup} setup at ${base} did not answer: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  const dir = argValue(args, "out") ?? join(import.meta.dir, "..", ".agents", "reports", "v2-build", "stage-5");
  mkdirSync(dir, { recursive: true });
  const measuredAt = new Date().toISOString();
  writeFileSync(join(dir, "timings.json"), `${JSON.stringify({ measured_at: measuredAt, setup, base, budget_ms: BUDGET_MS, rule: "pass when p95_ms <= budget_ms", items }, null, 2)}\n`);
  writeFileSync(join(dir, "delay.json"), `${JSON.stringify({ ...result.delay, measured_at: measuredAt, source: sourceName, repo: result.repo, note: result.delay.median_ms === 0 && result.delay.p95_ms === 0 ? "Every event was stamped at the moment it was recorded (seeded events), so this zero is not a live delay. Rerun after live agent work for a real figure." : "observed_at minus ts of each agent event", pass: result.delay.median_ms <= result.delay.threshold_ms }, null, 2)}\n`);
  for (const t of items) out(`${t.item}: median ${t.median_ms} ms, p95 ${t.p95_ms} ms, ${t.pass ? "within" : "OVER"} ${BUDGET_MS} ms`);
  out(`event-to-record delay: median ${result.delay.median_ms} ms, p95 ${result.delay.p95_ms} ms over ${result.delay.n} events (threshold ${result.delay.threshold_ms} ms)`);
  out(`wrote timings.json and delay.json in ${dir}`);
  return items.every((t) => t.pass) ? 0 : 1;
}

if (import.meta.main) process.exit(await run(process.argv.slice(2), process.env, console.log, console.error));
