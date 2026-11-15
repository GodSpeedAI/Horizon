/** Step 8 (store): two answers at once store exactly one; a failed commit stores nothing and says so. */
import { describe, expect, test } from "bun:test";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { listAnswers, QuestionAlreadyAnswered, recordAnswer } from "../src/capabilities/panel-answers.ts";

const now = new Date("2026-11-07T10:00:00.000Z");
const base = { tenant: "t", panel_id: "p", ask: "q", step: "s1", now };

describe("two answers to one question", () => {
  test("two at once: exactly one is stored, the other is refused as already answered", async () => {
    const store = createMemoryStore();
    const results = await Promise.allSettled([recordAnswer(store, { ...base, outcome: "answered", value: "a" }), recordAnswer(store, { ...base, outcome: "answered", value: "b" })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(refused).toHaveLength(1);
    expect(refused[0]!.reason).toBeInstanceOf(QuestionAlreadyAnswered);
    expect((await listAnswers(store, "t")).filter((a) => a.outcome === "answered")).toHaveLength(1);
  });

  test("an answer after one is stored is refused, and nothing is added", async () => {
    const store = createMemoryStore();
    await recordAnswer(store, { ...base, outcome: "answered", value: "a" });
    await expect(recordAnswer(store, { ...base, outcome: "answered", value: "b" })).rejects.toBeInstanceOf(QuestionAlreadyAnswered);
    expect(await listAnswers(store, "t")).toHaveLength(1);
  });

  test("a failed commit stores nothing", async () => {
    const real = createMemoryStore();
    const failing = { ...real, commit: async () => { throw new Error("disk gone"); } } as unknown as typeof real;
    await expect(recordAnswer(failing, { ...base, outcome: "answered", value: "a" })).rejects.toThrow();
    expect(await listAnswers(real, "t")).toHaveLength(0);
  });
});
