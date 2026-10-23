/**
 * The pending intent (HORIZON-001 1.1.0, SPEC-CR-002 §4 order of operations, step 2).
 *
 * Committing an intent that requires settlement records it here, with its frozen expectation, the
 * RealityTrace threshold (T) and the window, in the same `store.commit` that reserves its declared bounds in
 * the capacity ledger. The NavigationIntentRecord is the operation's *effect*, written only on execution, so
 * the discrimination run can tell "already holds" from "holds because we acted".
 *
 * The record then accumulates what the flow observes (the discrimination run, verification runs, the closure,
 * the settlement) and survives restarts: a window resumes from its stored bounds, never a fresh clock.
 */
import { ConcurrencyError, RecordConflictError, type DurableStore, type Json } from "@godspeedai/cognate-events";
import { type ExpectedOutcome, type SettlementWindow, expectationDigest } from "../domain/expectation.ts";
import type { CommitIntentInput } from "../domain/intent.ts";
import { type CapacityAllowance, type ObservedPayment, type PaymentEntry, reserve } from "../domain/payment.ts";
import { CONTRACT_VERSION, consumeReservation, contractVersionOf, ledgerWrite, readLedger } from "./capacity-ledger.ts";
import type { DeclaredThreshold, VerifierRun } from "../adapters/realitytrace-obligation.ts";
import { IntentError } from "../domain/intent.ts";

/** Hyphenated: listRecords accepts only [A-Za-z0-9_-] collection names. */
export const PENDING_COLLECTION = "horizon-navigation-intent-pending";

export type PendingStage = "awaiting_authority" | "executed" | "terminal";

export interface PendingIntent {
  readonly contract_version: number;
  readonly intent: CommitIntentInput;
  readonly operation_ref: string;
  /** Null for an exempt intent (read_only without settlement: required): it settles as not_required. */
  readonly expectation: ExpectedOutcome | null;
  readonly expectation_digest: string | null;
  readonly threshold: DeclaredThreshold | null;
  readonly window: SettlementWindow | null;
  /** The instantiated verifier argv; its digest is frozen in the authority request's claims. */
  readonly verifier_argv: readonly string[] | null;
  readonly stage: PendingStage;
  /** Whether committing it reserved capacity (so becoming terminal consumes it). */
  readonly reserved: boolean;
  readonly operation_id?: string;
  readonly discrimination?: VerifierRun;
  readonly verifications?: readonly VerifierRun[];
  readonly closure?: { readonly b: number; readonly c: number; readonly committed_at: string; readonly on_time: boolean };
  /** REQ-NAV-010: what owners recorded this intent spent, e.g. steering_attention decisions from SEA-Forge. */
  readonly observed?: readonly ObservedPayment[];
  /** Why the intent became terminal: refused (with its reason), settled, rejected, unsettled, suspended, failed. */
  readonly terminal?: { readonly outcome: string; readonly reason: string | null; readonly at: string };
}

const key = (tenant: string, intentId: string) => `${tenant}/${intentId}`;

export async function readPending(store: DurableStore, tenant: string, intentId: string): Promise<{ readonly pending: PendingIntent; readonly version: number } | null> {
  const entry = await store.getRecord(PENDING_COLLECTION, key(tenant, intentId));
  if (!entry) return null;
  contractVersionOf(entry.value);
  return { pending: entry.value as unknown as PendingIntent, version: entry.version };
}

export async function listPending(store: DurableStore, tenant: string): Promise<readonly PendingIntent[]> {
  return (await store.listRecords(PENDING_COLLECTION))
    .filter((record) => record.id.startsWith(`${tenant}/`))
    .map((record) => {
      contractVersionOf(record.value);
      return record.value as unknown as PendingIntent;
    });
}

/**
 * Record the pending intent and reserve its declared bounds atomically. The same intent again (same
 * expectation digest) returns the existing record; the same id with a different intent or expectation is
 * `duplicate_intent`. A concurrent commit that took the capacity forces a re-evaluation, never an overspend.
 */
export async function reservePendingIntent(
  store: DurableStore,
  options: {
    readonly tenant: string;
    readonly pending: Omit<PendingIntent, "contract_version" | "stage" | "expectation_digest" | "reserved">;
    readonly payment: { readonly entries: readonly PaymentEntry[]; readonly allowances: readonly CapacityAllowance[] } | null;
    readonly now: Date;
  },
): Promise<PendingIntent> {
  const digest = options.pending.expectation ? expectationDigest(options.pending.expectation) : null;
  const record: PendingIntent = { ...options.pending, contract_version: CONTRACT_VERSION, expectation_digest: digest, stage: "awaiting_authority", reserved: options.payment !== null };
  const id = key(options.tenant, record.intent.intent_id);
  for (let attempt = 0; ; attempt++) {
    const existing = await readPending(store, options.tenant, record.intent.intent_id);
    if (existing) {
      const same = existing.pending.expectation_digest === digest && JSON.stringify(existing.pending.intent) === JSON.stringify(record.intent);
      if (!same) throw new IntentError("already_exists", `duplicate_intent: intent ${record.intent.intent_id} was already committed with a different intent or expectation`);
      return existing.pending;
    }
    const reservation = options.payment
      ? await (async () => {
          const { ledger, version } = await readLedger(store, options.tenant, options.payment!.allowances);
          return ledgerWrite(options.tenant, reserve(ledger, record.intent.intent_id, options.payment!.entries, options.now), version);
        })()
      : null;
    try {
      await store.commit({ appends: [], records: [{ collection: PENDING_COLLECTION, id, expectedVersion: 0, value: record as unknown as { readonly [key: string]: Json } }, ...(reservation ? [reservation] : [])] });
      return record;
    } catch (error) {
      if ((error instanceof RecordConflictError || error instanceof ConcurrencyError) && attempt < 16) continue;
      throw error;
    }
  }
}

/** Merge observed facts into the pending record (expected-version write, retried on conflict). */
export async function updatePending(store: DurableStore, tenant: string, intentId: string, patch: (current: PendingIntent) => Partial<PendingIntent>): Promise<PendingIntent> {
  for (let attempt = 0; attempt < 16; attempt++) {
    const current = await readPending(store, tenant, intentId);
    if (!current) throw new Error(`PENDING: intent ${intentId} has no pending record`);
    const next: PendingIntent = { ...current.pending, ...patch(current.pending) };
    try {
      await store.commit({ appends: [], records: [{ collection: PENDING_COLLECTION, id: key(tenant, intentId), expectedVersion: current.version, value: next as unknown as { readonly [key: string]: Json } }] });
      return next;
    } catch (error) {
      if (!(error instanceof RecordConflictError)) throw error;
    }
  }
  throw new Error(`PENDING: could not update intent ${intentId}`);
}

/** The intent is terminal: record why, and its reservation becomes consumption (idempotent). */
export async function terminate(store: DurableStore, tenant: string, intentId: string, outcome: string, reason: string | null, at: Date): Promise<PendingIntent> {
  const done = await updatePending(store, tenant, intentId, (current) => (current.terminal ? {} : { stage: "terminal", terminal: { outcome, reason, at: at.toISOString() } }));
  if (done.reserved) await consumeReservation(store, { tenant, intentId, at });
  return done;
}
