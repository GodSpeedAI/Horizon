// Terminal accounting is one commit; the startup reconciler completes or reports stranded holds.
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DurableStore } from "@godspeedai/cognate-events";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { CURRENCIES, type CapacityAllowance, type Currency, type PaymentEntry } from "../src/domain/payment.ts";
import { assertExpectedOutcome, openWindow } from "../src/domain/expectation.ts";
import { readLedger } from "../src/capabilities/capacity-ledger.ts";
import { readPending, reservePendingIntent, terminate, updatePending } from "../src/capabilities/pending-intent.ts";
import { reconcilePending } from "../src/capabilities/pending-reconcile.ts";

const TENANT = "local";
const NOW = new Date("2026-10-23T12:00:00.000Z");
const storePath = () => join(mkdtempSync(join(tmpdir(), "horizon-pending-atomic-")), "store.sqlite");
const binding = (overrides: Partial<Record<Currency, number>> = {}): PaymentEntry[] =>
  CURRENCIES.map((currency) => ({ currency, unit: "units", amount: overrides[currency] ?? 0, basis: "declared_bound", source_ref: "binding:test@1" }));
const ALLOWANCES: CapacityAllowance[] = [{ currency: "compute", unit: "units", allowance: 5, period: "none" }];
const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const reserve = (store: DurableStore, id: string) =>
  reservePendingIntent(store, {
    tenant: TENANT,
    pending: {
      intent: { intent_id: id, frame_id: "frame-1", frame_revision: 1, actor_ref: "observer:operator", operation_ref: "horizon.write" },
      operation_ref: "horizon.write",
      expectation: assertExpectedOutcome({ modality: "obligation", statement: "the record exists", refuted_by: "exit non-zero", irrelevant: [], unaccounted: [], verifier: { template_ref: "t@1" }, window_s: 600 }),
      threshold: { question_id: "q-1", threshold_id: "thr-1", position: { ledger_id: "L", ordinal: 7 } },
      window: openWindow(NOW, 600),
      verifier_argv: ["/v"],
    },
    payment: { entries: binding({ compute: 2 }), allowances: ALLOWANCES },
    now: NOW,
  });
const state = async (store: DurableStore, id: string) => {
  const pending = (await readPending(store, TENANT, id))!.pending;
  const { ledger } = await readLedger(store, TENANT, ALLOWANCES);
  return { stage: pending.stage, terminal: !!pending.terminal, held: ledger.reservations.some((r) => r.intent_id === id), consumed: ledger.consumptions.filter((c) => c.intent_id === id).length };
};
/** A store whose commit fails once the armed predicate matches (simulating a crash on that write). */
const failing = (inner: DurableStore, shouldFail: () => boolean): DurableStore =>
  new Proxy(inner, {
    get: (target, prop) => {
      if (prop === "commit") return async (arg: unknown) => { if (shouldFail()) throw new Error("simulated crash"); return (target.commit as (a: unknown) => Promise<unknown>)(arg); };
      const value = (target as unknown as Record<string | symbol, unknown>)[prop];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

describe("terminate is one commit", () => {
  test("a failed commit leaves the intent fully held and not terminal", async () => {
    const store = openSqliteStore({ path: storePath() });
    await reserve(store, ID_A);
    await expect(terminate(failing(store, () => true), TENANT, ID_A, "settled", null, NOW)).rejects.toThrow("simulated crash");
    expect(await state(store, ID_A)).toMatchObject({ stage: "awaiting_authority", terminal: false, held: true, consumed: 0 });
    await terminate(store, TENANT, ID_A, "settled", null, NOW);
    expect(await state(store, ID_A)).toMatchObject({ terminal: true, held: false, consumed: 1 });
  });

  test("a duplicate delivery is a no-op", async () => {
    const store = openSqliteStore({ path: storePath() });
    await reserve(store, ID_A);
    await terminate(store, TENANT, ID_A, "refused", "r", NOW);
    const before = await readPending(store, TENANT, ID_A);
    await terminate(store, TENANT, ID_A, "settled", null, new Date(NOW.getTime() + 1000));
    expect(await readPending(store, TENANT, ID_A)).toEqual(before);
    expect(await state(store, ID_A)).toMatchObject({ held: false, consumed: 1 });
  });

  test("concurrent terminate: one consumption", async () => {
    const path = storePath();
    const a = openSqliteStore({ path });
    const b = openSqliteStore({ path });
    await reserve(a, ID_A);
    await Promise.all([terminate(a, TENANT, ID_A, "settled", null, NOW), terminate(b, TENANT, ID_A, "settled", null, NOW)]);
    expect(await state(a, ID_A)).toMatchObject({ terminal: true, held: false, consumed: 1 });
  });
});

describe("reconcilePending", () => {
  /** The pre-fix crash state: terminal recorded, reservation still held. */
  const strand = async (store: DurableStore, id: string) => {
    await reserve(store, id);
    await updatePending(store, TENANT, id, () => ({ stage: "terminal", terminal: { outcome: "settled", reason: null, at: NOW.toISOString() } }));
  };

  test("terminal-and-held is consumed", async () => {
    const store = openSqliteStore({ path: storePath() });
    await strand(store, ID_A);
    expect(await state(store, ID_A)).toMatchObject({ terminal: true, held: true });
    expect(await reconcilePending(store, TENANT)).toEqual({ consumed: [ID_A], blockers: [] });
    expect(await state(store, ID_A)).toMatchObject({ terminal: true, held: false, consumed: 1 });
  });

  test("awaiting_authority is kept and reported as a blocker", async () => {
    const store = openSqliteStore({ path: storePath() });
    await reserve(store, ID_A);
    expect(await reconcilePending(store, TENANT)).toEqual({ consumed: [], blockers: [ID_A] });
    expect(await state(store, ID_A)).toMatchObject({ stage: "awaiting_authority", terminal: false, held: true });
  });

  test("running twice is idempotent", async () => {
    const store = openSqliteStore({ path: storePath() });
    await strand(store, ID_A);
    await reserve(store, ID_B);
    await reconcilePending(store, TENANT);
    const once = [await state(store, ID_A), await state(store, ID_B)];
    const second = await reconcilePending(store, TENANT);
    expect([await state(store, ID_A), await state(store, ID_B)]).toEqual(once);
    expect(second).toEqual({ consumed: [], blockers: [ID_B] });
  });

  test("restart: a new handle on the same data reads the same state", async () => {
    const path = storePath();
    const first = openSqliteStore({ path });
    await strand(first, ID_A);
    await reconcilePending(first, TENANT);
    const expected = await state(first, ID_A);
    expect(await state(openSqliteStore({ path }), ID_A)).toEqual(expected);
  });
});
