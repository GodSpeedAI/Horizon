/**
 * One local day of a ledger, read through the allow-listed RealityTrace reader.
 *
 * `ledger export` has no date filter, so the whole ledger is exported once and cut here. The cut is kept in a
 * cache file (`<root>/cache/ledger-<repo_id>.json`) keyed by the ledger's last record number, which `ledger verify`
 * reports without the export. While the number has not moved the cache answers and no export is run.
 * The cache holds only the reduced agent-event rows, not the ledger, and is deleted with the setup.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RecordReader } from "./realitytrace-economics.ts";

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** The YYYY-MM-DD of an instant in a time zone, or null when `ts` is not a date. */
export function localDay(ts: unknown, timeZone: string): string | null {
  if (typeof ts !== "string") return null;
  const when = new Date(ts);
  if (Number.isNaN(when.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(when);
}

/**
 * Keeps the agent events of the chosen local date. Question declarations are kept whole (a day's checks were declared
 * earlier). Nothing else is needed by the view, so nothing else is kept.
 */
export function filterDay(rows: readonly unknown[], day: string, timeZone: string): unknown[] {
  return rows.filter((row) => {
    if (!isObject(row)) return false;
    if (row.record_kind === "question.declared") return true;
    const payload = isObject(row.payload) ? row.payload : null;
    const extensions = payload && isObject(payload.extensions) ? payload.extensions : null;
    const event = extensions && isObject(extensions.agent_event) ? extensions.agent_event : null;
    return event !== null && localDay(event.ts, timeZone) === day;
  });
}

/** Rows reduced to what the comparison needs: agent events, workshop correlation, question ids. */
export function reduceRows(rows: readonly unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const row of rows) {
    if (!isObject(row)) continue;
    const base = { append_ordinal: row.append_ordinal, record_kind: row.record_kind, entry_hash: row.entry_hash, ledger_id: row.ledger_id };
    const payload = isObject(row.payload) ? row.payload : {};
    if (row.record_kind === "question.declared") {
      out.push({ ...base, payload: { representations: payload.representations } });
    } else if (row.record_kind === "observation.recorded" && isObject(payload.extensions)) {
      const { agent_event, cognate } = payload.extensions;
      if (agent_event !== undefined || cognate !== undefined) out.push({ ...base, payload: { extensions: { ...(agent_event === undefined ? {} : { agent_event }), ...(cognate === undefined ? {} : { cognate }) } } });
    }
  }
  return out;
}

export interface LedgerCache {
  readonly repo_id: string;
  readonly last_record: number;
  readonly rows: unknown[];
}

export function cachePath(cacheDir: string, repoId: string): string {
  return join(cacheDir, `ledger-${repoId.replace(/[^A-Za-z0-9_-]/g, "_")}.json`);
}

function readCache(path: string): LedgerCache | null {
  try {
    const doc = JSON.parse(readFileSync(path, "utf8")) as Partial<LedgerCache>;
    return typeof doc.repo_id === "string" && typeof doc.last_record === "number" && Array.isArray(doc.rows) ? (doc as LedgerCache) : null;
  } catch {
    return null;
  }
}

export type DayRead =
  | { readonly ok: true; readonly rows: unknown[]; readonly from_cache: boolean; readonly intact: boolean; readonly records: number | null; readonly divergence: string | null; readonly ledger_bytes: number }
  | { readonly ok: false; readonly message: string };

/**
 * `verify` first (also the "record intact" answer, checked now), then the cache or one export. A ledger whose record
 * count is unknown is never cached. A ledger that fails verification is still shown, with `intact: false`.
 */
export function readLedgerDay(reader: RecordReader, options: { readonly repoId: string; readonly day: string; readonly timeZone: string; readonly cacheDir?: string }): DayRead {
  const verified = reader.verify(options.repoId);
  if (!verified.ok) return { ok: false, message: verified.message };
  const path = options.cacheDir ? cachePath(options.cacheDir, options.repoId) : null;
  const cached = path ? readCache(path) : null;
  if (cached && verified.records !== null && cached.last_record === verified.records && cached.repo_id === options.repoId) {
    return { ok: true, rows: filterDay(cached.rows, options.day, options.timeZone), from_cache: true, intact: verified.intact, records: verified.records, divergence: verified.divergence, ledger_bytes: 0 };
  }
  const ledger = reader.ledger(options.repoId);
  if (!ledger.ok) return { ok: false, message: ledger.message };
  const reduced = reduceRows(ledger.rows);
  if (path && verified.records !== null) {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ repo_id: options.repoId, last_record: verified.records, rows: reduced } satisfies LedgerCache), { mode: 0o600 });
    renameSync(tmp, path);
  }
  return { ok: true, rows: filterDay(reduced, options.day, options.timeZone), from_cache: false, intact: verified.intact, records: verified.records, divergence: verified.divergence, ledger_bytes: JSON.stringify(ledger.rows).length };
}

