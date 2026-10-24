// SPEC-CR-002 "Migration and upgrade" and "Rollback" witnesses (HORIZON-001 1.1.0): pending v1 commit runs are
// suspended at activation and never execute, even after approval; the store is marked; unknown contract versions
// are refused; the rollback guard refuses a 1.0.1 start against any v2 state (marker, records, pending inputs).
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DurableStore, Json } from "@godspeedai/cognate-events";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { SUSPENDED_REASON, SuspendedIntentError, activateContract, assertCurrentRunInput, readSuspensions, rollbackVerdict } from "../src/capabilities/contract-upgrade.ts";
import { ContractVersionError, markStore, readStoreMarker } from "../src/capabilities/capacity-ledger.ts";
import { appendIntentRecord } from "../src/capabilities/navigation-intent.ts";
import { navigationCommitAgent } from "../src/agents/navigation-commit.ts";

const NOW = new Date("2026-10-23T12:00:00.000Z");
const open = () => openSqliteStore({ path: join(mkdtempSync(join(tmpdir(), "horizon-upgrade-")), "store.sqlite") });
const INTENT = { intent_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", frame_id: "frame-1", frame_revision: 1, actor_ref: "observer:operator", operation_ref: "horizon.write" };

let sequence = 0;
/** A commit run as Cognate records it: a `run.started` event naming the agent and input, plus the runs record. */
async function startRun(store: DurableStore, input: Json, options: { readonly agent?: string; readonly ended?: boolean } = {}): Promise<string> {
  const runId = `run-test-${++sequence}`;
  const event = (eventType: string, payload: Json) => ({
    eventId: crypto.randomUUID(),
    eventType,
    schemaVersion: 1,
    occurredAt: NOW.toISOString(),
    tenant: "local",
    correlationId: runId,
    causationId: null,
    runId,
    scopeId: "s",
    componentId: "cognate",
    payload,
    metadata: { agent: options.agent ?? "horizon.navigation.commit" },
  });
  await store.commit({
    appends: [{ streamId: `run-${runId}`, expectedVersion: 0, events: [event("run.started", { input }), ...(options.ended ? [event("run.completed", { output: null })] : [])] }],
    records: [{ collection: "runs", id: runId, expectedVersion: 0, value: { tenant: "local" } }],
  });
  return runId;
}

describe("1.1.0 activation", () => {
  test("a pending v1 commit run is suspended and presented; the store is marked; activation is idempotent", async () => {
    const store = open();
    const pending = await startRun(store, { intent: INTENT });
    await startRun(store, { intent: { ...INTENT, intent_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" } }, { ended: true });
    await startRun(store, { intent: { ...INTENT, intent_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" }, contract_version: 2 });
    await startRun(store, { intent: INTENT }, { agent: "horizon.structural.observe" });
    const suspended = await activateContract(store, NOW);
    expect(suspended).toEqual([{ intent_id: INTENT.intent_id, run_id: pending, reason: SUSPENDED_REASON, at: NOW.toISOString() }]);
    expect(await readStoreMarker(store)).toBe(2);
    expect(await activateContract(store, NOW)).toEqual([]);
    expect((await readSuspensions(store, "local")).map((entry) => entry.intent_id)).toEqual([INTENT.intent_id]);
  });

  test("a suspended v1 run does not execute, even when its approval is then granted", async () => {
    const store = open();
    const calls: string[] = [];
    const agent = navigationCommitAgent(() => store);
    // The resumed run: SEA-Forge has allowed the invoke, so the governed call would return.
    const context = {
      tenant: "local",
      actor: { id: "operator", kind: "user" },
      invoke: async (capability: string) => {
        calls.push(capability);
        return { intent_id: INTENT.intent_id, correlation_ref: null };
      },
      step: async (name: string, body: () => Promise<unknown>) => {
        calls.push(`step:${name}`);
        return body();
      },
    };
    await expect(agent.run({ intent: INTENT } as never, context as never)).rejects.toBeInstanceOf(SuspendedIntentError);
    expect(calls).toEqual([]);
    expect(await store.readStream("horizon.navigation-intents", {})).toHaveLength(0);
    // The same intent under the current contract executes and writes a v2 record.
    await agent.run({ intent: INTENT, contract_version: 2 } as never, context as never);
    expect(calls).toEqual(["horizon.navigation.intent.commit", "step:record", "step:audit"]);
    const [record] = await store.readStream("horizon.navigation-intents", {});
    expect((record!.payload as { contract_version?: unknown }).contract_version).toBe(2);
  });

  test("an unknown contract_version on a run input or the marker is refused", async () => {
    expect(() => assertCurrentRunInput({ intent: INTENT, contract_version: 3 }, INTENT.intent_id)).toThrow(ContractVersionError);
    const store = open();
    await store.commit({ appends: [], records: [{ collection: "horizon.store-meta", id: "contract_version", expectedVersion: 0, value: { contract_version: 7 } }] });
    await expect(markStore(store)).rejects.toThrow(/unknown contract_version 7/);
    await expect(activateContract(store, NOW)).rejects.toThrow(/unknown contract_version 7/);
  });
});

describe("rollback guard", () => {
  test("a store no 1.1.x build has touched may roll back", async () => {
    const store = open();
    await startRun(store, { intent: INTENT });
    expect(await rollbackVerdict(store)).toEqual({ allowed: true, reasons: [] });
  });

  test("the marker refuses a 1.0.1 start", async () => {
    const store = open();
    await markStore(store);
    expect(await rollbackVerdict(store)).toMatchObject({ allowed: false, reasons: ["the store is marked horizon.contract_version = 2"] });
  });

  test("a v2 intent record refuses it even without the marker", async () => {
    const store = open();
    await appendIntentRecord(store, { record: INTENT, tenant: "local", scopeId: "s", contract: { expectation: null, threshold: null, window: null } });
    expect((await rollbackVerdict(store)).reasons).toEqual(["1 intent record(s) carry contract_version 2 or later"]);
  });

  test("a v2 pending commit run input refuses it even without the marker or a record", async () => {
    const store = open();
    await startRun(store, { intent: INTENT, contract_version: 2 });
    expect((await rollbackVerdict(store)).reasons).toEqual(["1 pending commit run input(s) carry contract_version 2 or later"]);
  });
});
