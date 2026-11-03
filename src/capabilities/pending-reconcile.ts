/**
 * Startup reconciliation of pending intents against the capacity ledger.
 *
 * - terminal record that still holds its reservation: consume it (one commit; the terminal record already
 *   states the outcome, so this only completes accounting).
 * - awaiting_authority with a live hold: never released here (not on age alone); reported as a blocker.
 * - anything else: unchanged. Idempotent.
 */
import type { DurableStore } from "@godspeedai/cognate-events";
import { consumeReservation, readLedger } from "./capacity-ledger.ts";
import { listPending } from "./pending-intent.ts";

export interface ReconcileReport {
  readonly consumed: readonly string[];
  /** Intent ids still awaiting authority while holding capacity; for the cockpit to surface. */
  readonly blockers: readonly string[];
}

export async function reconcilePending(store: DurableStore, tenant: string): Promise<ReconcileReport> {
  const consumed: string[] = [];
  const blockers: string[] = [];
  for (const pending of await listPending(store, tenant)) {
    if (!pending.reserved) continue;
    const id = pending.intent.intent_id;
    const { ledger } = await readLedger(store, tenant, []);
    if (!ledger.reservations.some((entry) => entry.intent_id === id)) continue;
    if (pending.terminal) {
      await consumeReservation(store, { tenant, intentId: id, at: new Date(pending.terminal.at) });
      consumed.push(id);
    } else if (pending.stage === "awaiting_authority") {
      blockers.push(id);
    }
  }
  return { consumed, blockers };
}
