/**
 * Finding R2-5: an answer, deferral or cancellation must carry the question's version and owner revision. An answer without them
 * used to succeed after a reassignment. It is now refused with a plain reason, and nothing is stored.
 */
import { describe, expect, test } from "bun:test";
import { ANSWER_NEEDS_REVISION, moveQuestion, NO_PANELS, reduceAgent, reduceHuman, type AskBlock, type Panels } from "../src/ui/desk/panels-model.ts";

const ask = (over: Record<string, unknown> = {}) => ({ id: "q", question: "Which plan?", why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }], ...over });
const qOf = (s: Panels): AskBlock => s.open[0]!.blocks.find((b): b is AskBlock => b.kind === "question" && b.id === "q")!;
const board = (): Panels => reduceAgent(NO_PANELS, { tool: "ask_human", panel: "p", ask: ask() }, "Alice", "ag_alice").state;

describe("every answer carries the question's version and owner revision", () => {
  test("an answer without owner_rev is refused after a reassignment, and nothing is stored", () => {
    const seen = board();
    const version = qOf(seen).version!;
    const moved = moveQuestion(seen, "p", "q", "ag_bob", "Bob");
    const r = reduceHuman(moved, { op: "human.answer", panel: "p", ask: "q", outcome: "answered", value: "a", version } as never);
    expect(r.result).toEqual({ ok: false, code: "SCHEMA", message: ANSWER_NEEDS_REVISION });
    expect(r.state).toBe(moved);
    expect(qOf(r.state).answered).toBeNull();
  });

  test("an answer without version is refused, and so is a malformed version or owner revision", () => {
    const s = board();
    const rev = qOf(s).owner_rev ?? 0;
    for (const bad of [{ owner_rev: rev }, { version: "not-a-version", owner_rev: rev }, { version: qOf(s).version!, owner_rev: -1 }, { version: qOf(s).version!, owner_rev: "0" }]) {
      const r = reduceHuman(s, { op: "human.answer", panel: "p", ask: "q", outcome: "answered", value: "a", ...bad } as never);
      expect(r.result).toEqual({ ok: false, code: "SCHEMA", message: ANSWER_NEEDS_REVISION });
    }
  });

  test("a deferral and a cancellation without the revisions are refused too", () => {
    const s = board();
    for (const outcome of ["deferred", "cancelled"] as const) {
      const r = reduceHuman(s, { op: "human.answer", panel: "p", ask: "q", outcome } as never);
      expect(r.result).toMatchObject({ ok: false, message: ANSWER_NEEDS_REVISION });
    }
  });

  test("an answer carrying the current version and owner revision is accepted", () => {
    const s = board();
    const r = reduceHuman(s, { op: "human.answer", panel: "p", ask: "q", outcome: "answered", value: "a", version: qOf(s).version!, owner_rev: 0 });
    expect(r.result.ok).toBe(true);
  });
});
