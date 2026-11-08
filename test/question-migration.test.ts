/** Step 7: an answer written before the upgrade with no owner recorded stays a wait. The upgrade does not close it, so acceptance stays blocked until the person decides. */
import { describe, expect, test } from "bun:test";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { acceptanceBlocked, listAnswers, migratePreUpgradeAnswers } from "../src/capabilities/panel-answers.ts";

/** Records as the desk wrote them before this upgrade: no owner_key, no waiting_on, no fingerprint, no history. */
const old = (n: number, over: Record<string, unknown>) => ({ tenant: "t", panel_id: "p", n, ask: `q${n}`, outcome: "answered", value: "a", note: null, at: "2026-11-01T10:00:00.000Z", replied: false, step: "s1", ...over });

describe("the upgrade leaves pre-upgrade waits outstanding", () => {
  test("an unrouted answer with no owner stays waiting, as does one with an owner; no record is rewritten", async () => {
    const store = createMemoryStore();
    const seeded = [old(1, {}), old(2, { asked_by_key: "ag_alice", ask: "q2" })];
    await store.commit({ appends: [], records: [
      { collection: "horizon-panel-answers", id: "answer:p:1", expectedVersion: 0, value: seeded[0] as never },
      { collection: "horizon-panel-answers", id: "answer:p:2", expectedVersion: 0, value: seeded[1] as never },
    ] });
    expect(acceptanceBlocked(await listAnswers(store, "t"), "s1")).toBe(true);
    expect(await migratePreUpgradeAnswers(store, "t", new Date("2026-11-07T10:00:00.000Z"))).toBe(0);
    const rows = await listAnswers(store, "t");
    expect(rows.find((r) => r.n === 1)).toMatchObject({ state: "waiting_for_agent", replied: false, waiting_on: "agent", owner_key: null });
    expect(rows.find((r) => r.n === 2)).toMatchObject({ state: "waiting_for_agent", replied: false, waiting_on: "agent", owner_key: "ag_alice" });
    expect(acceptanceBlocked(rows, "s1")).toBe(true);
    expect((await store.getRecord("horizon-panel-answers", "answer:p:1"))?.value).toEqual(seeded[0]);
    expect((await store.getRecord("horizon-panel-answers", "answer:p:1"))?.version).toBe(1);
  });

  test("a second run changes nothing", async () => {
    const store = createMemoryStore();
    await store.commit({ appends: [], records: [{ collection: "horizon-panel-answers", id: "answer:p:1", expectedVersion: 0, value: old(1, {}) as never }] });
    expect(await migratePreUpgradeAnswers(store, "t", new Date())).toBe(0);
    expect(await migratePreUpgradeAnswers(store, "t", new Date())).toBe(0);
    expect(acceptanceBlocked(await listAnswers(store, "t"), "s1")).toBe(true);
  });
});
