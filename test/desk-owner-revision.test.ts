import { describe, expect, test } from "bun:test";
import { moveQuestion, NO_PANELS, OWNER_CHANGED, reduceAgent, reduceHuman, type AskBlock, type Panels } from "../src/ui/desk/panels-model.ts";

const ask = (over: Record<string, unknown> = {}) => ({ id: "q", question: "Which plan?", why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }], ...over });
const qs = (s: Panels): AskBlock[] => (s.open[0]?.blocks ?? []).filter((b): b is AskBlock => b.kind === "question");

describe("a reassignment starts a new owner revision that an answer must carry", () => {
  const alice = (): Panels => {
    const r = reduceAgent(NO_PANELS, { tool: "ask_human", panel: "p", ask: ask() }, "Alice", "ag_alice");
    expect(r.result.ok).toBe(true);
    return r.state;
  };

  test("a question starts at owner revision 0 and each reassignment adds one", () => {
    expect(qs(alice())[0]!.owner_rev).toBe(0);
    const once = moveQuestion(alice(), "p", "q", "ag_bob", "Bob");
    expect(qs(once)[0]).toMatchObject({ owner_rev: 1, asked_by_key: "ag_bob", asked_by: "Bob" });
    expect(qs(moveQuestion(once, "p", "q", "ag_alice", "Alice"))[0]!.owner_rev).toBe(2);
  });

  test("an answer carrying the previous owner's revision is refused after reassignment and nothing is stored", () => {
    const seen = alice();
    const before = qs(seen)[0]!.owner_rev ?? 0;
    const moved = moveQuestion(seen, "p", "q", "ag_bob", "Bob");
    const r = reduceHuman(moved, { op: "human.answer", panel: "p", ask: "q", outcome: "answered", value: "a", version: qs(seen)[0]!.version!, owner_rev: before });
    expect(r.result).toEqual({ ok: false, code: "SCHEMA", message: OWNER_CHANGED });
    expect(r.state).toBe(moved);
    expect(qs(r.state)[0]!.answered).toBeNull();
  });

  test("an answer carrying the current revision is accepted", () => {
    const moved = moveQuestion(alice(), "p", "q", "ag_bob", "Bob");
    const r = reduceHuman(moved, { op: "human.answer", panel: "p", ask: "q", outcome: "answered", value: "a", version: qs(moved)[0]!.version!, owner_rev: 1 });
    expect(r.result.ok).toBe(true);
    expect(qs(r.state)[0]!.answered?.value).toBe("a");
  });

  test("a deferral under the previous revision is refused too, and the question keeps its current revision", () => {
    const moved = moveQuestion(alice(), "p", "q", "ag_bob", "Bob");
    const r = reduceHuman(moved, { op: "human.answer", panel: "p", ask: "q", outcome: "deferred", version: qs(moved)[0]!.version!, owner_rev: 0 });
    expect(r.result.ok).toBe(false);
    expect(qs(r.state)[0]!.owner_rev).toBe(1);
  });
});
