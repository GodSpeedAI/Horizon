/**
 * What the operator did with a decision card: holds (set aside with a reason) and the record of each decision.
 * Both are Horizon's own records. A hold changes nothing at the case keeper; it only moves the card out of "needs you".
 */
import { randomUUID } from "node:crypto";
import type { DurableStore, Json } from "@godspeedai/cognate-events";

export const HOLD_COLLECTION = "horizon-holds";
export const DECISION_COLLECTION = "horizon-decisions";
export const REASON_MAX = 600;

export interface Hold {
  readonly card_id: string;
  readonly reason: string;
  readonly at: string;
  readonly released: boolean;
}

const holdId = (tenant: string, cardId: string): string => `${tenant}/${cardId}`;

export type ReasonCheck = { readonly ok: true; readonly reason: string } | { readonly ok: false; readonly message: string };

/** A typed reason: a few real words, not a cut-off paste. */
export function checkReason(raw: unknown): ReasonCheck {
  const reason = typeof raw === "string" ? raw.trim() : "";
  if (reason === "") return { ok: false, message: "Type a reason first. It is kept with the decision." };
  if (reason.length > REASON_MAX) return { ok: false, message: `Keep the reason to ${REASON_MAX} characters or fewer.` };
  return { ok: true, reason };
}

export async function putHold(store: DurableStore, options: { readonly tenant: string; readonly card_id: string; readonly reason: string; readonly released: boolean; readonly now: Date }): Promise<void> {
  const id = holdId(options.tenant, options.card_id);
  const current = await store.getRecord(HOLD_COLLECTION, id);
  const value = { tenant: options.tenant, card_id: options.card_id, reason: options.reason, at: options.now.toISOString(), released: options.released };
  await store.commit({ appends: [], records: [{ collection: HOLD_COLLECTION, id, expectedVersion: current?.version ?? 0, value: value as unknown as { readonly [key: string]: Json } }] });
}

/** Cards currently held, by card id. */
export async function activeHolds(store: DurableStore, tenant: string): Promise<Map<string, Hold>> {
  const held = new Map<string, Hold>();
  for (const row of await store.listRecords(HOLD_COLLECTION, { tenant })) {
    const hold = row.value as unknown as Hold;
    if (!hold.released) held.set(hold.card_id, { card_id: hold.card_id, reason: hold.reason, at: hold.at, released: false });
  }
  return held;
}

export async function recordDecision(
  store: DurableStore,
  entry: { readonly tenant: string; readonly operator: string; readonly card_id: string; readonly choice: string; readonly reason: string | null; readonly preview_code: string; readonly outcome: string; readonly now: Date },
): Promise<void> {
  const value = { ...entry, now: undefined, at: entry.now.toISOString() };
  delete (value as { now?: unknown }).now;
  await store.commit({ appends: [], records: [{ collection: DECISION_COLLECTION, id: `decision:${randomUUID()}`, expectedVersion: 0, value: value as unknown as { readonly [key: string]: Json } }] });
}

export async function decisionsFor(store: DurableStore, tenant: string): Promise<{ readonly card_id: string; readonly choice: string; readonly at: string; readonly outcome: string }[]> {
  return (await store.listRecords(DECISION_COLLECTION, { tenant })).map((row) => row.value as unknown as { card_id: string; choice: string; at: string; outcome: string });
}
