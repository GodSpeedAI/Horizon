/** Step 2 at the store: "Not yet" is kept in history, leaves outcome null, and does not wait for the agent or block acceptance. */
import { describe, expect, test } from "bun:test";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { acceptanceBlocked, listAnswers, recordAnswer } from "../src/capabilities/panel-answers.ts";

const now = new Date("2026-11-07T10:00:00.000Z");

describe("a question put off", () => {
  test("keeps outcome null, adds a history entry, waits for nobody, and does not block its step", async () => {
    const store = createMemoryStore();
    await recordAnswer(store, { tenant: "t", panel_id: "p", ask: "q", outcome: "deferred", step: "s1", asked_by_key: "ag_alice", now });
    const [row] = await listAnswers(store, "t");
    expect(row).toMatchObject({ outcome: null, waiting_on: "none", replied: true, owner_key: "ag_alice", history: [{ outcome: "deferred", at: now.toISOString() }] });
    expect(acceptanceBlocked(await listAnswers(store, "t"), "s1")).toBe(false);
  });

  test("a later answer is stored and waits for the agent", async () => {
    const store = createMemoryStore();
    await recordAnswer(store, { tenant: "t", panel_id: "p", ask: "q", outcome: "deferred", step: "s1", now });
    await recordAnswer(store, { tenant: "t", panel_id: "p", ask: "q", outcome: "answered", value: "a", step: "s1", now });
    const rows = await listAnswers(store, "t");
    expect(rows.at(-1)).toMatchObject({ outcome: "answered", waiting_on: "agent", replied: false });
    expect(acceptanceBlocked(rows, "s1")).toBe(true);
  });
});
