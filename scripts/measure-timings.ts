/**
 * `bun run scripts/measure-timings.ts --setup testing [--source personal] [--repo <repo_id>] [--out <dir>]`
 * Read-only. Writes `timings.md` (day_ms, lookup_ms, compare_ms, ledger_bytes, repo) and `delay.json`
 * (median_ms, p95_ms, n, threshold_ms) into `.agents/reports/v2-build/stage-1/`.
 *   day_ms     the cold read of the busiest day of the repo: verify + export + cut, no cache
 *   lookup_ms  the same day read again with the cache warm (no export)
 *   compare_ms the model: list the day's sessions and build the comparison for the first
 *   delay      observed_at minus ts of each agent event: how long a record takes to appear. threshold_ms is 2000 (D10).
 * The repo is the one with the largest ledger unless --repo names one. Nothing is written to any record.
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

export function run(args: readonly string[], env: Record<string, string | undefined>, out: (line: string) => void, err: (line: string) => void): number {
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
      const size = ledger.ok ? JSON.stringify(ledger.rows).length : -1;
      if (size > biggest) ((biggest = size), (repoId = repo.repo_id));
    }
  }
  if (!repoId) {
    err("measure-timings: the record holds no repository");
    return 1;
  }
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const result = measure(reader, repoId, timeZone);
  if ("error" in result) {
    err(`measure-timings: ${result.error}`);
    return 1;
  }
  const dir = argValue(args, "out") ?? join(import.meta.dir, "..", ".agents", "reports", "v2-build", "stage-1");
  mkdirSync(dir, { recursive: true });
  const ms = (n: number) => n.toFixed(1);
  writeFileSync(
    join(dir, "timings.md"),
    [
      "# Stage 1 timings",
      "",
      `Measured ${new Date().toISOString()} on ${result.day} (source ${sourceName}). The repository id is shown, not its name.`,
      "",
      "| Field | Value |",
      "| --- | --- |",
      `| day_ms | ${ms(result.day_ms)} |`,
      `| lookup_ms | ${ms(result.lookup_ms)} |`,
      `| compare_ms | ${ms(result.compare_ms)} |`,
      `| ledger_bytes | ${result.ledger_bytes} |`,
      `| repo | ${result.repo} |`,
      "",
      result.day_ms > 1000 ? "day_ms is over 1000: the cache (keyed by last record number) is what keeps repeat reads fast; lookup_ms is the cached read." : "day_ms is within 1000 ms.",
      "",
    ].join("\n"),
  );
  writeFileSync(join(dir, "delay.json"), `${JSON.stringify(result.delay, null, 2)}\n`);
  out(`wrote timings.md and delay.json in ${dir} (day_ms ${ms(result.day_ms)}, median delay ${result.delay.median_ms} ms over ${result.delay.n} events)`);
  return 0;
}

if (import.meta.main) process.exit(run(process.argv.slice(2), process.env, console.log, console.error));
