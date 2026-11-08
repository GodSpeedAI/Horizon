/** Step 6: the person stops waiting on an answer whose agent is gone. One change closes it; nothing else changes. */
import { describe, expect, test } from "bun:test";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { acceptanceBlocked, listAnswers, recordAnswer, stopWaiting } from "../src/capabilities/panel-answers.ts";

describe("stop waiting closes an answer whose agent is gone", () => {
  test("the answer is closed with its words kept, and the step can be accepted", async () => {
    const store = createMemoryStore();
    const now = new Date("2026-11-07T10:00:00.000Z");
    await recordAnswer(store, { tenant: "t", panel_id: "p", ask: "q", outcome: "answered", value: "a", step: "s1", asked_by_key: "ag_gone", now });
    expect(acceptanceBlocked(await listAnswers(store, "t"), "s1")).toBe(true);
    expect(await stopWaiting(store, "t", "s1")).toBe(1);
    const [row] = await listAnswers(store, "t");
    expect(row).toMatchObject({ replied: true, waiting_on: "none", note: "You chose to stop waiting for the agent.", owner_key: "ag_gone", outcome: "answered" });
    expect(acceptanceBlocked(await listAnswers(store, "t"), "s1")).toBe(false);
  });

  test("it closes only answers on that step", async () => {
    const store = createMemoryStore();
    const now = new Date("2026-11-07T10:00:00.000Z");
    await recordAnswer(store, { tenant: "t", panel_id: "p", ask: "q", outcome: "answered", value: "a", step: "s1", now });
    await recordAnswer(store, { tenant: "t", panel_id: "p", ask: "r", outcome: "answered", value: "b", step: "s2", now });
    expect(await stopWaiting(store, "t", "s1")).toBe(1);
    expect(acceptanceBlocked(await listAnswers(store, "t"), "s2")).toBe(true);
  });
});
