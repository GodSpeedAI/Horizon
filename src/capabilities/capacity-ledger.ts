/**
 * The capacity ledger and the store's contract version (HORIZON-001 1.1.0, REQ-NAV-009; SPEC-CR-002
 * "Migration and upgrade").
 *
 * The ledger is one Horizon-owned durable record per tenant holding open reservations and consumption.
 * Allowances are operator configuration and are supplied at evaluation, never stored here, so changing
 * an allowance never rewrites history. Every write uses the record's expected version: a reservation
 * commits in the same `store.commit` as its intent record, so a conflicting concurrent commit re-reads
 * the ledger and re-evaluates instead of overspending.
 */
import { RecordConflictError, type DurableStore, type Json } from "@godspeedai/cognate-events";
import { type CapacityAllowance, type CapacityLedger, type Consumption, type Reservation, consume } from "../domain/payment.ts";

export const CAPACITY_LEDGER_COLLECTION = "horizon.capacity-ledger";
export const STORE_META_COLLECTION = "horizon.store-meta";

/** The contract this build writes. Absent on a record means 1. */
export const CONTRACT_VERSION = 2;
const KNOWN_CONTRACT_VERSIONS = new Set([1, 2]);

export class ContractVersionError extends Error {
  override readonly name = "ContractVersionError";
  constructor(message: string) {
    super(`CONTRACT: ${message}`);
  }
}

/** A record's contract version; an unknown one is refused (fail closed). */
export function contractVersionOf(value: unknown): 1 | 2 {
  const raw = value !== null && typeof value === "object" ? (value as Record<string, unknown>)["contract_version"] : undefined;
  const version = raw === undefined ? 1 : raw;
  if (typeof version !== "number" || !KNOWN_CONTRACT_VERSIONS.has(version)) throw new ContractVersionError(`unknown contract_version ${String(raw)}; this build reads 1 and 2`);
  return version as 1 | 2;
}

/** The store's marker, or null for a store no 1.1.x build has opened. */
export async function readStoreMarker(store: DurableStore): Promise<number | null> {
  const marker = await store.getRecord(STORE_META_COLLECTION, "contract_version");
  if (!marker) return null;
  return contractVersionOf(marker.value);
}

/** Mark the store `horizon.contract_version = 2`. Idempotent; refuses a store marked by a newer build. */
export async function markStore(store: DurableStore): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await store.getRecord(STORE_META_COLLECTION, "contract_version");
    if (current) {
      contractVersionOf(current.value);
      return;
    }
    try {
      await store.commit({ appends: [], records: [{ collection: STORE_META_COLLECTION, id: "contract_version", expectedVersion: 0, value: { contract_version: CONTRACT_VERSION } }] });
      return;
    } catch (error) {
      if (!(error instanceof RecordConflictError)) throw error;
    }
  }
  throw new Error("CONTRACT: could not mark the store");
}

interface StoredLedger {
  readonly reservations: readonly Reservation[];
  readonly consumptions: readonly Consumption[];
}

export const ledgerKey = (tenant: string): string => `${tenant}/ledger`;

/** The ledger value for evaluation, with the configured allowances, and the record version to write against. */
export async function readLedger(store: DurableStore, tenant: string, allowances: readonly CapacityAllowance[]): Promise<{ readonly ledger: CapacityLedger; readonly version: number }> {
  const entry = await store.getRecord(CAPACITY_LEDGER_COLLECTION, ledgerKey(tenant));
  const stored = (entry?.value ?? { reservations: [], consumptions: [] }) as unknown as StoredLedger;
  return {
    ledger: Object.freeze({ allowances: Object.freeze([...allowances]), reservations: Object.freeze([...stored.reservations]), consumptions: Object.freeze([...stored.consumptions]) }),
    version: entry?.version ?? 0,
  };
}

/** The record write that persists `ledger` over `version`; commit it with the intent's own appends. */
export const ledgerWrite = (tenant: string, ledger: CapacityLedger, version: number) => ({
  collection: CAPACITY_LEDGER_COLLECTION,
  id: ledgerKey(tenant),
  expectedVersion: version,
  value: { reservations: ledger.reservations, consumptions: ledger.consumptions } as unknown as { readonly [key: string]: Json },
});

/**
 * A terminal intent's reservation becomes consumption (settled, rejected, refused, suspended with a
 * reservation, or failed). Idempotent: a second call for the same intent changes nothing.
 */
export async function consumeReservation(store: DurableStore, options: { readonly tenant: string; readonly intentId: string; readonly at: Date }): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { ledger, version } = await readLedger(store, options.tenant, []);
    const next = consume(ledger, options.intentId, options.at);
    if (next === ledger) return;
    try {
      await store.commit({ appends: [], records: [ledgerWrite(options.tenant, next, version)] });
      return;
    } catch (error) {
      if (!(error instanceof RecordConflictError)) throw error;
    }
  }
  throw new Error(`CAPACITY: could not consume the reservation of ${options.intentId}`);
}
