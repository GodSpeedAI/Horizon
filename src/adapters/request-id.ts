/**
 * Request ids for the case keeper. The case keeper remembers the outcome of every request id, refusals and "stale" included, and
 * replays it. So an id names ONE attempt:
 *  - after a definite refusal (stale, refused, a validation error: nothing was written) the next try uses `<base>:a<k>` with k + 1;
 *  - after a timeout or a closed socket (it may have been written) the same id is kept, so a retry replays instead of doubling.
 * The attempt number is kept in `horizon-ui-state` (`attempt:<tenant>:<base>`), so it survives a restart. A duplicate is still
 * impossible: the step's own id is fixed, and the case keeper refuses a second step with the same id.
 */
import type { DurableStore } from "@godspeedai/cognate-events";
import { UI_STATE_COLLECTION } from "../capabilities/workspace-records.ts";

export const attemptId = (base: string, attempt: number): string => (attempt <= 0 ? base : `${base}:a${attempt}`);
const key = (tenant: string, base: string): string => `attempt:${tenant}:${base}`;

export async function currentAttempt(store: DurableStore, tenant: string, base: string): Promise<number> {
  const row = await store.getRecord(UI_STATE_COLLECTION, key(tenant, base));
  const k = row?.value.attempt;
  return typeof k === "number" && Number.isInteger(k) && k >= 0 ? k : 0;
}

/** The id to send now. */
export async function requestIdFor(store: DurableStore, tenant: string, base: string): Promise<string> {
  return attemptId(base, await currentAttempt(store, tenant, base));
}

/** The attempt was definitely refused: the next try gets a new id. Bumps only if `sentId` is still the current one. */
export async function refused(store: DurableStore, tenant: string, base: string, sentId: string): Promise<void> {
  const row = await store.getRecord(UI_STATE_COLLECTION, key(tenant, base));
  const k = await currentAttempt(store, tenant, base);
  if (attemptId(base, k) !== sentId) return;
  try {
    await store.commit({ appends: [], records: [{ collection: UI_STATE_COLLECTION, id: key(tenant, base), expectedVersion: row?.version ?? 0, value: { attempt: k + 1 } }] });
  } catch {
    // A concurrent bump already moved it on.
  }
}
