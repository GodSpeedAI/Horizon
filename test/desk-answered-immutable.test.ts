import { describe, expect, test } from "bun:test";
import { reducerRevision } from "./support/answer-revision.ts";
import { ANSWERED_CANNOT_CHANGE, NO_PANELS, reduceAgent, reduceHuman, type AskBlock, type Panels } from "../src/ui/desk/panels-model.ts";

const ask = (over: Record<string, unknown> = {}) => ({ id: "q", question: "Which plan?", why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }], ...over });
const asks = (state: Panels): AskBlock[] => state.open.flatMap((p) => p.blocks.filter((b): b is AskBlock => b.kind === "question"));
const answeredBoard = (over: Record<string, unknown> = {}): Panels => {
  const put = reduceAgent(NO_PANELS, { tool: "ask_human", panel: "p", ask: ask(over) });
  return reduceHuman(put.state, { op: "human.answer", panel: "p", ask: "q", ...reducerRevision(put.state, "p", "q"), outcome: "answered", value: "a" }).state;
};
const refused = (r: ReturnType<typeof reduceAgent>) => r.result.ok === false && r.result.message === ANSWERED_CANNOT_CHANGE;

describe("an answered question cannot be erased or changed", () => {
  test("a show_surface with no blocks cannot remove a panel that holds an answered question", () => {
    const s = answeredBoard();
    const emptied = reduceAgent(s, { tool: "show_surface", surface: { id: "p", blocks: [] } });
    expect(refused(emptied)).toBe(true);
    expect(asks(emptied.state)[0]?.answered?.value).toBe("a");
  });

  test("the erase-then-reword sequence does not get past the first step", () => {
    const s = answeredBoard();
    const first = reduceAgent(s, { tool: "show_surface", surface: { id: "p", blocks: [] } });
    const second = reduceAgent(first.state, { tool: "ask_human", panel: "p", ask: ask({ question: "Which plan, now with different words?" }) });
    expect(refused(second)).toBe(true);
    expect(asks(second.state)[0]?.answered?.value).toBe("a");
  });

  test("a show_surface that leaves out only the answered question is refused", () => {
    const put = reduceAgent(NO_PANELS, { tool: "show_surface", surface: { id: "p", blocks: [{ type: "ask", ...ask() }, { type: "ask", ...ask({ id: "r", question: "Another?" }) }] } });
    const s = reduceHuman(put.state, { op: "human.answer", panel: "p", ask: "q", ...reducerRevision(put.state, "p", "q"), outcome: "answered", value: "a" }).state;
    const dropped = reduceAgent(s, { tool: "show_surface", surface: { id: "p", blocks: [{ type: "ask", ...ask({ id: "r", question: "Another?" }) }] } });
    expect(refused(dropped)).toBe(true);
    expect(asks(dropped.state).map((b) => b.id).sort()).toEqual(["q", "r"]);
  });

  test("changing what the answer settles (resolves) is refused, by ask_human and by show_surface", () => {
    const s = answeredBoard({ resolves: "step_one" });
    const viaAsk = reduceAgent(s, { tool: "ask_human", panel: "p", ask: ask({ resolves: "step_two" }) });
    expect(refused(viaAsk)).toBe(true);
    expect(asks(viaAsk.state)[0]?.resolves).toBe("step_one");
    const viaSurface = reduceAgent(s, { tool: "show_surface", surface: { id: "p", blocks: [{ type: "ask", ...ask({ resolves: "step_two" }) }] } });
    expect(refused(viaSurface)).toBe(true);
    const cleared = reduceAgent(s, { tool: "ask_human", panel: "p", ask: ask() });
    expect(refused(cleared)).toBe(true);
    expect(asks(cleared.state)[0]?.answered?.value).toBe("a");
  });

  test("changing the options, their consequences or the input kind is refused", () => {
    const s = answeredBoard();
    for (const change of [{ options: [{ option_id: "a", label: "Plan A", consequence: "Costs more" }, { option_id: "b", label: "Plan B" }] }, { options: [{ option_id: "a", label: "Plan A" }, { option_id: "c", label: "Plan C" }] }, { input: "multiselect" }]) {
      expect(refused(reduceAgent(s, { tool: "ask_human", panel: "p", ask: ask(change) })), JSON.stringify(change)).toBe(true);
    }
  });

  test("the identical question again is let through and keeps the answer", () => {
    const s = answeredBoard({ resolves: "step_one" });
    const again = reduceAgent(s, { tool: "ask_human", panel: "p", ask: ask({ resolves: "step_one" }) });
    expect(again.result.ok).toBe(true);
    expect(asks(again.state)[0]?.answered?.value).toBe("a");
  });

  test("an unanswered question can still be removed; a changed one under the same id is refused", () => {
    const put = reduceAgent(NO_PANELS, { tool: "ask_human", panel: "p", ask: ask() });
    expect(reduceAgent(put.state, { tool: "show_surface", surface: { id: "p", blocks: [] } }).result.ok).toBe(true);
    // Operator decision: "Edit an existing question? No. Use a new question id for changes." The same id keeps its first wording.
    const reworded = reduceAgent(put.state, { tool: "ask_human", panel: "p", ask: ask({ question: "Reworded?" }) });
    expect(reworded.result.ok).toBe(false);
    expect(reworded.result.ok === false && reworded.result.message).toBe("That question id was already used for different wording. Use a new question id.");
    expect(reduceAgent(put.state, { tool: "ask_human", panel: "p", ask: ask({ id: "q2", question: "Reworded?" }) }).result.ok).toBe(true);
  });
});
