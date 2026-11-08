/**
 * A step Horizon did (a route, a hand off) whose row could not be written to the conversation. The step is done; the record of it
 * is not. The warning is kept in the store, so it outlives the request, and the status line shows it until the record is made.
 */
import type { DurableStore, Json } from "@godspeedai/cognate-events";

export const RECONCILIATION_COLLECTION = "horizon-reconciliation";
export const NOT_RECONCILED_WORDS = "A step was recorded, but the conversation did not record it. Check the desk log.";

export interface NotRecordedRefs {
  readonly panel_id: string;
  readonly ask_id: string;
  readonly case_id?: string;
  readonly step_id?: string;
}

export async function noteNotRecorded(store: DurableStore, tenant: string, refs: NotRecordedRefs, now: Date): Promise<void> {
  const id = `not-recorded:${refs.panel_id}:${refs.ask_id}:${now.getTime()}`;
  await store.commit({ appends: [], records: [{ collection: RECONCILIATION_COLLECTION, id, expectedVersion: 0, value: { tenant, words: NOT_RECONCILED_WORDS, refs: { ...refs }, at: now.toISOString() } as unknown as { readonly [key: string]: Json } }] });
}

/** The warnings the status line shows: one line per kind of gap, however many rows were missed. */
export async function notRecordedWarnings(store: DurableStore, tenant: string): Promise<string[]> {
  const rows = await store.listRecords(RECONCILIATION_COLLECTION, { tenant });
  return rows.length === 0 ? [] : [NOT_RECONCILED_WORDS];
}
