// REQ-NAV-009 / REQ-NAV-011 store witnesses (HORIZON-001 1.1.0): the reservation is atomic with the intent
// record, concurrent commits cannot jointly exceed capacity, a terminal reservation becomes consumption, the
// expectation is part of the duplicate check, the window survives a restart, and unknown contract versions are
// refused. Asserted on the Horizon store itself (a real SQLite file), not on a view of it.
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { CURRENCIES, type CapacityAllowance, type Currency, type PaymentEntry } from "../src/domain/payment.ts";
import { assertExpectedOutcome, openWindow } from "../src/domain/expectation.ts";
import type { NavigationIntentRecord } from "../src/domain/frame.ts";
import { INTENT_INDEX_COLLECTION, INTENT_STREAM, appendIntentRecord, readIntentRecords, type IntentContract } from "../src/capabilities/navigation-intent.ts";
import { ContractVersionError, consumeReservation, markStore, readLedger, readStoreMarker } from "../src/capabilities/capacity-ledger.ts";

const TENANT = "local";
const NOW = new Date("2026-10-23T12:00:00.000Z");
const storePath = () => join(mkdtempSync(join(tmpdir(), "horizon-capacity-")), "store.sqlite");
const binding = (overrides: Partial<Record<Currency, number>> = {}): PaymentEntry[] =>
  CURRENCIES.map((currency) => ({ currency, unit: "units", amount: overrides[currency] ?? 0, basis: "declared_bound", source_ref: "binding:test@1" }));
const ALLOWANCES: CapacityAllowance[] = [{ currency: "compute", unit: "units", allowance: 5, period: "none" }];
const record = (intentId: string): NavigationIntentRecord => ({ intent_id: intentId, frame_id: "frame-1", frame_revision: 1, actor_ref: "observer:operator", operation_ref: "horizon.write" });
const expectation = (statement = "the record exists") =>
  assertExpectedOutcome({ modality: "obligation", statement, refuted_by: "exit non-zero", irrelevant: [], unaccounted: [], verifier: { template_ref: "t@1" }, window_s: 600 });
const contract = (overrides: Partial<IntentContract> = {}): IntentContract => ({
  expectation: expectation(),
  threshold: { id: "thr-1", position: 7 },
  window: openWindow(NOW, 600),
  payment: { entries: binding({ compute: 3 }), allowances: ALLOWANCES },
  now: NOW,
  ...overrides,
});
const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("capacity ledger on the Horizon store", () => {
  test("two intents that each fit but jointly exceed capacity, committed concurrently: exactly one commits", async () => {
    const path = storePath();
    const first = openSqliteStore({ path });
    const second = openSqliteStore({ path });
    const results = await Promise.allSettled([
      appendIntentRecord(first, { record: record(ID_A), tenant: TENANT, scopeId: "s", contract: contract() }),
      appendIntentRecord(second, { record: record(ID_B), tenant: TENANT, scopeId: "s", contract: contract() }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(String(refused.reason)).toContain("compute: declares 3 units, 2 available");
    const records = await readIntentRecords(first);
    expect(records).toHaveLength(1);
    const { ledger } = await readLedger(first, TENANT, ALLOWANCES);
    expect(ledger.reservations.map((entry) => entry.intent_id)).toEqual([records[0]!.record.intent_id]);
  });

  test("a refused reservation writes no intent record", async () => {
    const store = openSqliteStore({ path: storePath() });
    await expect(appendIntentRecord(store, { record: record(ID_A), tenant: TENANT, scopeId: "s", contract: contract({ payment: { entries: binding({ compute: 9 }), allowances: ALLOWANCES } }) })).rejects.toThrow(/compute: declares 9 units, 5 available/);
    expect(await store.readStream(INTENT_STREAM, {})).toHaveLength(0);
    expect(await store.getRecord(INTENT_INDEX_COLLECTION, `${TENANT}/${ID_A}`)).toBeUndefined();
  });

  test("a terminal intent's reservation becomes consumption, once", async () => {
    const store = openSqliteStore({ path: storePath() });
    await appendIntentRecord(store, { record: record(ID_A), tenant: TENANT, scopeId: "s", contract: contract() });
    await consumeReservation(store, { tenant: TENANT, intentId: ID_A, at: NOW });
    await consumeReservation(store, { tenant: TENANT, intentId: ID_A, at: NOW });
    const { ledger } = await readLedger(store, TENANT, ALLOWANCES);
    expect(ledger.reservations).toHaveLength(0);
    expect(ledger.consumptions.map((entry) => entry.intent_id)).toEqual([ID_A]);
    // Consumption still counts against the allowance: a second 3-unit intent no longer fits.
    await expect(appendIntentRecord(store, { record: record(ID_B), tenant: TENANT, scopeId: "s", contract: contract() })).rejects.toThrow(/2 available/);
  });

  test("the same intent_id with a changed expectation is duplicate_intent; the same expectation replays", async () => {
    const store = openSqliteStore({ path: storePath() });
    const first = await appendIntentRecord(store, { record: record(ID_A), tenant: TENANT, scopeId: "s", contract: contract() });
    const replay = await appendIntentRecord(store, { record: record(ID_A), tenant: TENANT, scopeId: "s", contract: contract() });
    expect(replay.eventId).toBe(first.eventId);
    await expect(appendIntentRecord(store, { record: record(ID_A), tenant: TENANT, scopeId: "s", contract: contract({ expectation: expectation("something else") }) })).rejects.toThrow(/duplicate_intent/);
    const { ledger } = await readLedger(store, TENANT, ALLOWANCES);
    expect(ledger.reservations).toHaveLength(1);
  });

  test("the window and threshold are stored with the record and survive a restart", async () => {
    const path = storePath();
    await appendIntentRecord(openSqliteStore({ path }), { record: record(ID_A), tenant: TENANT, scopeId: "s", contract: contract() });
    const [stored] = await readIntentRecords(openSqliteStore({ path }));
    expect(stored!.record).toMatchObject({ contract_version: 2, window: { opens_at: "2026-10-23T12:00:00.000Z", closes_at: "2026-10-23T12:10:00.000Z" }, realitytrace_threshold: { id: "thr-1", position: 7 } });
    expect(stored!.record.expectation_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test("an unknown contract_version is refused, on records and on the index", async () => {
    const store = openSqliteStore({ path: storePath() });
    await store.commit({ appends: [], records: [{ collection: INTENT_INDEX_COLLECTION, id: `${TENANT}/${ID_A}`, expectedVersion: 0, value: { event_id: "e", contract_version: 3 } }] });
    await expect(appendIntentRecord(store, { record: record(ID_A), tenant: TENANT, scopeId: "s", contract: contract() })).rejects.toBeInstanceOf(ContractVersionError);
    await store.commit({
      appends: [{ streamId: INTENT_STREAM, expectedVersion: 0, events: [{ eventId: crypto.randomUUID(), eventType: "horizon.navigation.intent.committed", schemaVersion: 1, occurredAt: NOW.toISOString(), tenant: TENANT, correlationId: "c", causationId: null, runId: null, scopeId: "s", componentId: "x", payload: { intent_id: ID_B, contract_version: 9 } }] }],
      records: [],
    });
    await expect(readIntentRecords(store)).rejects.toThrow(/unknown contract_version 9/);
  });

  test("the store marker is written once and read back", async () => {
    const store = openSqliteStore({ path: storePath() });
    expect(await readStoreMarker(store)).toBeNull();
    await markStore(store);
    await markStore(store);
    expect(await readStoreMarker(store)).toBe(2);
  });
});
