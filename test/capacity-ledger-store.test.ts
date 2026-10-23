// REQ-NAV-009 / REQ-NAV-011 store witnesses (HORIZON-001 1.1.0): the reservation is atomic with recording the
// pending intent (before authority), concurrent commits cannot jointly exceed capacity, a terminal reservation
// becomes consumption, the expectation is part of the duplicate check, the window and threshold survive a
// restart, and unknown contract versions are refused. Asserted on the Horizon store itself (a real SQLite file).
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { CURRENCIES, type CapacityAllowance, type Currency, type PaymentEntry } from "../src/domain/payment.ts";
import { assertExpectedOutcome, openWindow } from "../src/domain/expectation.ts";
import { INTENT_INDEX_COLLECTION, INTENT_STREAM, appendIntentRecord, readIntentRecords } from "../src/capabilities/navigation-intent.ts";
import { ContractVersionError, markStore, readLedger, readStoreMarker } from "../src/capabilities/capacity-ledger.ts";
import { PENDING_COLLECTION, readPending, reservePendingIntent, terminate } from "../src/capabilities/pending-intent.ts";

const TENANT = "local";
const NOW = new Date("2026-10-23T12:00:00.000Z");
const storePath = () => join(mkdtempSync(join(tmpdir(), "horizon-capacity-")), "store.sqlite");
const binding = (overrides: Partial<Record<Currency, number>> = {}): PaymentEntry[] =>
  CURRENCIES.map((currency) => ({ currency, unit: "units", amount: overrides[currency] ?? 0, basis: "declared_bound", source_ref: "binding:test@1" }));
const ALLOWANCES: CapacityAllowance[] = [{ currency: "compute", unit: "units", allowance: 5, period: "none" }];
const intent = (intentId: string) => ({ intent_id: intentId, frame_id: "frame-1", frame_revision: 1, actor_ref: "observer:operator", operation_ref: "horizon.write" });
const expectation = (statement = "the record exists") =>
  assertExpectedOutcome({ modality: "obligation", statement, refuted_by: "exit non-zero", irrelevant: [], unaccounted: [], verifier: { template_ref: "t@1" }, window_s: 600 });
const THRESHOLD = { question_id: "q-1", threshold_id: "thr-1", position: { ledger_id: "L", ordinal: 7 } };
const reservePending = (store: ReturnType<typeof openSqliteStore>, intentId: string, options: { compute?: number; statement?: string } = {}) =>
  reservePendingIntent(store, {
    tenant: TENANT,
    pending: { intent: intent(intentId), expectation: expectation(options.statement), threshold: THRESHOLD, window: openWindow(NOW, 600), verifier_argv: ["/v", "--intent", intentId] },
    payment: { entries: binding({ compute: options.compute ?? 3 }), allowances: ALLOWANCES },
    now: NOW,
  });
const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("capacity reservation with the pending intent", () => {
  test("two intents that each fit but jointly exceed capacity, committed concurrently: exactly one commits", async () => {
    const path = storePath();
    const first = openSqliteStore({ path });
    const second = openSqliteStore({ path });
    const results = await Promise.allSettled([reservePending(first, ID_A), reservePending(second, ID_B)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(String(refused.reason)).toContain("compute: declares 3 units, 2 available");
    const pending = await first.listRecords(PENDING_COLLECTION);
    expect(pending).toHaveLength(1);
    const { ledger } = await readLedger(first, TENANT, ALLOWANCES);
    expect(ledger.reservations.map((entry) => `${TENANT}/${entry.intent_id}`)).toEqual([pending[0]!.id]);
  });

  test("a refused reservation records no pending intent", async () => {
    const store = openSqliteStore({ path: storePath() });
    await expect(reservePending(store, ID_A, { compute: 9 })).rejects.toThrow(/compute: declares 9 units, 5 available/);
    expect(await readPending(store, TENANT, ID_A)).toBeNull();
  });

  test("a terminal intent's reservation becomes consumption, once, and still counts", async () => {
    const store = openSqliteStore({ path: storePath() });
    await reservePending(store, ID_A);
    await terminate(store, TENANT, ID_A, "refused", "expected outcome already holds before acting", NOW, true);
    await terminate(store, TENANT, ID_A, "settled", null, NOW, true);
    const { ledger } = await readLedger(store, TENANT, ALLOWANCES);
    expect(ledger.reservations).toHaveLength(0);
    expect(ledger.consumptions.map((entry) => entry.intent_id)).toEqual([ID_A]);
    expect((await readPending(store, TENANT, ID_A))!.pending.terminal).toMatchObject({ outcome: "refused", reason: "expected outcome already holds before acting" });
    await expect(reservePending(store, ID_B)).rejects.toThrow(/2 available/);
  });

  test("the same intent_id with a changed expectation is duplicate_intent; the same expectation replays", async () => {
    const store = openSqliteStore({ path: storePath() });
    const first = await reservePending(store, ID_A);
    expect(await reservePending(store, ID_A)).toEqual(first);
    await expect(reservePending(store, ID_A, { statement: "something else" })).rejects.toThrow(/duplicate_intent/);
    const { ledger } = await readLedger(store, TENANT, ALLOWANCES);
    expect(ledger.reservations).toHaveLength(1);
  });

  test("the window and threshold are stored and survive a restart", async () => {
    const path = storePath();
    await reservePending(openSqliteStore({ path }), ID_A);
    const reopened = (await readPending(openSqliteStore({ path }), TENANT, ID_A))!.pending;
    expect(reopened).toMatchObject({ contract_version: 2, stage: "awaiting_authority", window: { opens_at: "2026-10-23T12:00:00.000Z", closes_at: "2026-10-23T12:10:00.000Z" }, threshold: THRESHOLD });
    expect(reopened.expectation_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test("the effect record carries the expectation digest, and a changed expectation is duplicate_intent", async () => {
    const store = openSqliteStore({ path: storePath() });
    const contract = { expectation: expectation(), threshold: { id: "thr-1", position: 7 }, window: openWindow(NOW, 600) };
    await appendIntentRecord(store, { record: intent(ID_A), tenant: TENANT, scopeId: "s", contract });
    await expect(appendIntentRecord(store, { record: intent(ID_A), tenant: TENANT, scopeId: "s", contract: { ...contract, expectation: expectation("other") } })).rejects.toThrow(/duplicate_intent/);
    const [stored] = await readIntentRecords(store);
    expect(stored!.record).toMatchObject({ contract_version: 2, realitytrace_threshold: { id: "thr-1", position: 7 } });
  });

  test("an unknown contract_version is refused, on records, the index and pending intents", async () => {
    const store = openSqliteStore({ path: storePath() });
    await store.commit({ appends: [], records: [{ collection: INTENT_INDEX_COLLECTION, id: `${TENANT}/${ID_A}`, expectedVersion: 0, value: { event_id: "e", contract_version: 3 } }] });
    await expect(appendIntentRecord(store, { record: intent(ID_A), tenant: TENANT, scopeId: "s", contract: { expectation: null, threshold: null, window: null } })).rejects.toBeInstanceOf(ContractVersionError);
    await store.commit({
      appends: [{ streamId: INTENT_STREAM, expectedVersion: 0, events: [{ eventId: crypto.randomUUID(), eventType: "horizon.navigation.intent.committed", schemaVersion: 1, occurredAt: NOW.toISOString(), tenant: TENANT, correlationId: "c", causationId: null, runId: null, scopeId: "s", componentId: "x", payload: { intent_id: ID_B, contract_version: 9 } }] }],
      records: [{ collection: PENDING_COLLECTION, id: `${TENANT}/${ID_B}`, expectedVersion: 0, value: { contract_version: 5 } }],
    });
    await expect(readIntentRecords(store)).rejects.toThrow(/unknown contract_version 9/);
    await expect(readPending(store, TENANT, ID_B)).rejects.toThrow(/unknown contract_version 5/);
  });

  test("the store marker is written once and read back", async () => {
    const store = openSqliteStore({ path: storePath() });
    expect(await readStoreMarker(store)).toBeNull();
    await markStore(store);
    await markStore(store);
    expect(await readStoreMarker(store)).toBe(2);
  });
});
