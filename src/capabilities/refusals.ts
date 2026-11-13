/**
 * The audit a frozen refusal leaves behind.
 *
 * A refused operation performs no target effect: nothing is approved, added, started, exported or
 * committed, and no authority is claimed. The refusal itself is still recorded, so the refusal is
 * visible to whoever runs the desk and a caller cannot make a refusal invisible by trying again.
 *
 * This is the only write a refusal makes. The catalog states it per row (`refusal_audit`), and the
 * design says the same thing in words: no target effect, one refusal audit.
 */
import { randomUUID } from "node:crypto";
import type { DurableStore, Json } from "@godspeedai/cognate-events";

export const REFUSAL_COLLECTION = "horizon-refusals";

/** One refused attempt, as it is kept. Nothing here is a decision: it is the record that none was made. */
export interface RefusalAudit {
  /** The tenant the attempt belongs to. */
  readonly tenant: string;
  /** The operation the catalog refuses. */
  readonly operation: string;
  /** The caller path's own name, when the row answers differently per path. */
  readonly code_op: string | null;
  /** The route the attempt arrived at. */
  readonly route: string | null;
  /** Who was refused, as the route named them: an actor, a key id, or the device's execution. Never an authority. */
  readonly caller: string | null;
  /** The catalog's own words for the refusal. */
  readonly reason: string;
  /** When the refusal was answered. */
  readonly at: string;
}

export async function recordRefusal(store: DurableStore, entry: Omit<RefusalAudit, "at"> & { readonly now: Date }): Promise<void> {
  const value = {
    tenant: entry.tenant,
    operation: entry.operation,
    code_op: entry.code_op,
    route: entry.route,
    caller: entry.caller,
    reason: entry.reason,
    at: entry.now.toISOString(),
  };
  await store.commit({ appends: [], records: [{ collection: REFUSAL_COLLECTION, id: `refusal:${randomUUID()}`, expectedVersion: 0, value: value as unknown as { readonly [key: string]: Json } }] });
}

/** Every refusal kept for a tenant, oldest first as the store returns them. */
export async function refusalsFor(store: DurableStore, tenant: string): Promise<RefusalAudit[]> {
  return (await store.listRecords(REFUSAL_COLLECTION, { tenant })).map((row) => row.value as unknown as RefusalAudit);
}
