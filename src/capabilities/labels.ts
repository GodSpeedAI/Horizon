/**
 * Operator labels on real runs (design 8.2): pass or fail, plus the first thing that went wrong.
 *
 * One record per (org, session, event) in `horizon-labels`; a relabel is a versioned upsert, so there is
 * exactly one current label per run. Labels are scoped to the org: `listLabels` reads one tenant only.
 */
import type { DurableStore, Json } from "@godspeedai/cognate-events";

export const LABEL_COLLECTION = "horizon-labels";
export const FIRST_FAILURE_MAX = 600;
export const VERDICTS = ["pass", "fail"] as const;
export type Verdict = (typeof VERDICTS)[number];

export interface RunLabel {
  readonly tenant: string;
  readonly session_id: string;
  readonly event_id: string;
  /** Position in the record when one exists, else null. */
  readonly record_seq: number | null;
  readonly verdict: Verdict;
  readonly first_failure: string;
  readonly operator: string;
  readonly created_at: string;
}

export type LabelCheck =
  | { readonly ok: true; readonly verdict: Verdict; readonly first_failure: string; readonly record_seq: number | null }
  | { readonly ok: false; readonly code: "bad_verdict" | "too_long" | "bad_record_seq" };

/** Refuses, never cuts: a longer note is an error, not a silently shortened label. */
export function checkLabel(input: { verdict: unknown; first_failure?: unknown; record_seq?: unknown }): LabelCheck {
  if (input.verdict !== "pass" && input.verdict !== "fail") return { ok: false, code: "bad_verdict" };
  const first_failure = typeof input.first_failure === "string" ? input.first_failure.trim() : "";
  if (first_failure.length > FIRST_FAILURE_MAX) return { ok: false, code: "too_long" };
  let record_seq: number | null = null;
  if (input.record_seq !== undefined && input.record_seq !== null && input.record_seq !== "") {
    const n = typeof input.record_seq === "number" ? input.record_seq : Number(input.record_seq);
    if (!Number.isInteger(n) || n < 0) return { ok: false, code: "bad_record_seq" };
    record_seq = n;
  }
  return { ok: true, verdict: input.verdict, first_failure, record_seq };
}

export const labelId = (tenant: string, sessionId: string, eventId: string): string => `label:${tenant}:${sessionId}:${eventId}`;

export async function putLabel(
  store: DurableStore,
  options: { readonly tenant: string; readonly operator: string; readonly session_id: string; readonly event_id: string; readonly record_seq?: number | null; readonly verdict: unknown; readonly first_failure?: unknown; readonly now: Date },
): Promise<RunLabel> {
  const check = checkLabel({ verdict: options.verdict, first_failure: options.first_failure, record_seq: options.record_seq });
  if (!check.ok) throw new Error(`LABEL: ${check.code}`);
  if (options.session_id === "" || options.event_id === "") throw new Error("LABEL: session_id and event_id are required");
  const value: RunLabel = {
    tenant: options.tenant,
    session_id: options.session_id,
    event_id: options.event_id,
    record_seq: check.record_seq,
    verdict: check.verdict,
    first_failure: check.first_failure,
    operator: options.operator,
    created_at: options.now.toISOString(),
  };
  const id = labelId(options.tenant, options.session_id, options.event_id);
  const current = await store.getRecord(LABEL_COLLECTION, id);
  await store.commit({
    appends: [],
    records: [{ collection: LABEL_COLLECTION, id, expectedVersion: current?.version ?? 0, value: value as unknown as { readonly [key: string]: Json } }],
  });
  return value;
}

export async function listLabels(store: DurableStore, tenant: string): Promise<RunLabel[]> {
  const rows = await store.listRecords(LABEL_COLLECTION, { tenant });
  return rows.map((row) => row.value as unknown as RunLabel).filter((label) => label.tenant === tenant).sort((a, b) => a.created_at.localeCompare(b.created_at));
}
