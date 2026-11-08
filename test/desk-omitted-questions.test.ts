import { describe, expect, test } from "bun:test";
import { NO_PANELS, QUESTION_CHANGED, reduceAgent, reduceHuman, type AskBlock, type Panels } from "../src/ui/desk/panels-model.ts";
import { QUESTION_OTHER_AGENT, SAME_ID_OTHER_WORDS } from "../src/capabilities/question-rules.ts";

const ask = (over: Record<string, unknown> = {}) => ({ id: "q", question: "Which plan?", why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }], ...over });
const qs = (s: Panels): AskBlock[] => (s.open[0]?.blocks ?? []).filter((b): b is AskBlock => b.kind === "question");
const ALICE = "ag_alice";
const BOB = "ag_bob";

/** Alice puts up q; the person moves it to Bob (the owner change the desk makes in one commit with its row). */
function reassignedToBob(): Panels {
  const put = reduceAgent(NO_PANELS, { tool: "ask_human", panel: "p", ask: ask() }, "Alice", ALICE);
  expect(put.result.ok).toBe(true);
  return { ...put.state, open: put.state.open.map((p) => ({ ...p, blocks: p.blocks.map((b) => (b.kind === "question" ? { ...b, asked_by: "Bob", asked_by_key: BOB } : b)) })) };
}

describe("a question is not deleted by a put that leaves it out", () => {
  test("Alice's empty put does not delete Bob's question, and is refused", () => {
    const s = reassignedToBob();
    const r = reduceAgent(s, { tool: "show_surface", surface: { id: "p", blocks: [] } }, "Alice", ALICE);
    expect(r.result).toEqual({ ok: false, code: "SCHEMA", message: QUESTION_OTHER_AGENT });
    expect(qs(r.state).map((b) => b.id)).toEqual(["q"]);
  });

  test("Bob's question survives a deferral and Alice's empty put after it, and its id cannot be reused with other words", () => {
    let s = reassignedToBob();
    s = reduceHuman(s, { op: "human.answer", panel: "p", ask: "q", outcome: "deferred", version: qs(s)[0]!.version }).state;
    expect(qs(s)[0]!.answered?.outcome).toBe("deferred");
    const emptied = reduceAgent(s, { tool: "show_surface", surface: { id: "p", blocks: [] } }, "Alice", ALICE);
    expect(emptied.result.ok).toBe(false);
    expect(qs(emptied.state)).toHaveLength(1);
    const reworded = reduceAgent(emptied.state, { tool: "ask_human", panel: "p", ask: ask({ question: "A new wording?" }) }, "Alice", ALICE);
    expect(reworded.result).toMatchObject({ ok: false, message: QUESTION_OTHER_AGENT });
    expect(qs(reworded.state)[0]!.question).toBe("Which plan?");
  });

  test("Alice's own put-off question is kept when she leaves it out, so its wording stays bound to the id", () => {
    let s = reduceAgent(NO_PANELS, { tool: "ask_human", panel: "p", ask: ask() }, "Alice", ALICE).state;
    s = reduceHuman(s, { op: "human.answer", panel: "p", ask: "q", outcome: "deferred", version: qs(s)[0]!.version }).state;
    const emptied = reduceAgent(s, { tool: "show_surface", surface: { id: "p", blocks: [] } }, "Alice", ALICE);
    expect(emptied.result.ok).toBe(true);
    expect(qs(emptied.state).map((b) => b.id)).toEqual(["q"]);
    const reworded = reduceAgent(emptied.state, { tool: "show_surface", surface: { id: "p", blocks: [{ type: "ask", ...ask({ question: "Other?" }) }] } }, "Alice", ALICE);
    expect(reworded.result).toMatchObject({ ok: false, message: SAME_ID_OTHER_WORDS });
  });
});
