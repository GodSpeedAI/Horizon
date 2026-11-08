/** Step 7: an answer written before the upgrade with no owner recorded is closed, and does not block acceptance afterwards. */
import { describe, expect, test } from "bun:test";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { acceptanceBlocked, listAnswers, migratePreUpgradeAnswers, PRE_UPGRADE_WORDS } from "../src/capabilities/panel-answers.ts";

/** Records as the desk wrote them before this upgrade: no owner_key, no waiting_on, no fingerprint, no history. */
const old = (n: number, over: Record<string, unknown>) => ({ tenant: "t", panel_id: "p", n, ask: `q${n}`, outcome: "answered", value: "a", note: null, at: "2026-11-01T10:00:00.000Z", replied: false, step: "s1", ...over });

describe("the upgrade closes pre-upgrade answers with no owner", () => {
  test("an unrouted answer with no owner is closed with the words; one with an owner stays open", async () => {
    const store = createMemoryStore();
    await store.commit({ appends: [], records: [
      { collection: "horizon-panel-answers", id: "answer:p:1", expectedVersion: 0, value: old(1, {}) as never },
      { collection: "horizon-panel-answers", id: "answer:p:2", expectedVersion: 0, value: old(2, { asked_by_key: "ag_alice", ask: "q2" }) as never },
    ] });
    expect(acceptanceBlocked(await listAnswers(store, "t"), "s1")).toBe(true);
    expect(await migratePreUpgradeAnswers(store, "t", new Date("2026-11-07T10:00:00.000Z"))).toBe(1);
    const rows = await listAnswers(store, "t");
    expect(rows.find((r) => r.n === 1)).toMatchObject({ replied: true, waiting_on: "none", routed_as: PRE_UPGRADE_WORDS, owner_key: null });
    expect(rows.find((r) => r.n === 2)).toMatchObject({ replied: false, waiting_on: "agent", owner_key: "ag_alice" });
    expect(PRE_UPGRADE_WORDS).toBe("Answered before the upgrade; the owner was not recorded.");
  });

  test("the step is blocked only by the owned answer, and a second run changes nothing", async () => {
    const store = createMemoryStore();
    await store.commit({ appends: [], records: [{ collection: "horizon-panel-answers", id: "answer:p:1", expectedVersion: 0, value: old(1, {}) as never }] });
    await migratePreUpgradeAnswers(store, "t", new Date());
    expect(acceptanceBlocked(await listAnswers(store, "t"), "s1")).toBe(false);
    expect(await migratePreUpgradeAnswers(store, "t", new Date())).toBe(0);
  });
});
