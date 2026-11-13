/**
 * Finding R4-3. Migration 5 counted a legacy "deferred" record (a "not yet") as a committed answer, so a "not yet" followed by a real answer
 * to the same question was marked as contradictory and routing refused it. Migration 8 clears those false markers over committed answers
 * only, and keeps a genuine contradiction marked. Every answer record stays as it was written.
 */
import { describe, expect, test } from "bun:test";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { CONFLICTED_WORDS, conflictOf, migrateReconcile, PANEL_ANSWERS_COLLECTION, planRoute, recordAnswer, type PanelQueue } from "../src/capabilities/panel-answers.ts";
import { DESK_MIGRATIONS, runDeskMigrations } from "../src/capabilities/desk-migrations.ts";

const queue: PanelQueue = (command) => command();
const tenant = "t";
const now = new Date("2026-11-08T09:00:00Z");
const ROUTED = "step handoff_0a49 in Seed: triage inbox";
const repair = DESK_MIGRATIONS.filter((m) => m.version === 8);

/** An answer record as the desk stored it before states existed (the legacy shape). */
const legacyAnswer = (n: number, outcome: string, value: string | null, owner: string) => ({
  collection: PANEL_ANSWERS_COLLECTION,
  id: `answer:${tenant}:p:${n}`,
  expectedVersion: 0,
  value: { tenant, panel_id: "p", n, ask: "q", outcome, value, note: null, at: "2026-11-02T10:00:00.000Z", version: null, routed_as: null, step: null, asked_by: "agent-a", asked_by_key: owner, owner_key: owner, fingerprint: null, history: [] },
});

describe("migration 8: conflict markers from deferred answers (R4-3)", () => {
  test("a legacy deferred record plus a later answer becomes a routable answer after the repair", async () => {
    const store = createMemoryStore();
    await store.commit({ appends: [], records: [legacyAnswer(1, "deferred", null, "k1")] });
    // The marker migration 5 wrote before it stopped counting deferred records.
    await store.commit({ appends: [], records: [{ collection: PANEL_ANSWERS_COLLECTION, id: `conflict:${tenant}:p:q`, expectedVersion: 0, value: { tenant, panel_id: "p", ask: "q", answers: [1, 2], owners: ["k1"] } }] });
    await recordAnswer(store, { tenant, panel_id: "p", ask: "q", outcome: "answered", value: "yes", owner_key: "k1", now } as Parameters<typeof recordAnswer>[1]);

    expect(await conflictOf(store, tenant, "p", "q")).toBe(true);
    expect(await planRoute(store, tenant, "p", "q", ROUTED, "k1")).toMatchObject({ ok: false, message: CONFLICTED_WORDS });

    expect(await runDeskMigrations(store, tenant, now, queue, repair)).toEqual([8]);

    expect(await conflictOf(store, tenant, "p", "q")).toBe(false);
    const routed = await planRoute(store, tenant, "p", "q", ROUTED, "k1");
    expect(routed.ok).toBe(true);
    // The marker is marked, not deleted; the legacy deferred record keeps its outcome.
    const marker = await store.getRecord(PANEL_ANSWERS_COLLECTION, `conflict:${tenant}:p:q`);
    expect(marker?.value).toMatchObject({ answers: [1, 2], cleared: true, cleared_by: 8 });
    expect((await store.getRecord(PANEL_ANSWERS_COLLECTION, `answer:${tenant}:p:1`))?.value).toMatchObject({ outcome: "deferred" });
    // A second run writes nothing.
    expect(await runDeskMigrations(store, tenant, now, queue, repair)).toEqual([]);
  });

  test("a genuine answered-vs-answered contradiction stays conflicted after the repair", async () => {
    const store = createMemoryStore();
    await store.commit({ appends: [], records: [legacyAnswer(1, "answered", "a", "k1"), legacyAnswer(2, "answered", "b", "k1")] });
    // Migration 5 marks a genuine contradiction; the repair must keep that mark.
    await migrateReconcile(store, tenant);
    expect(await conflictOf(store, tenant, "p", "q")).toBe(true);

    expect(await runDeskMigrations(store, tenant, now, queue, repair)).toEqual([8]);

    expect(await conflictOf(store, tenant, "p", "q")).toBe(true);
    expect(await planRoute(store, tenant, "p", "q", ROUTED, "k1")).toMatchObject({ ok: false, message: CONFLICTED_WORDS });
  });
});
