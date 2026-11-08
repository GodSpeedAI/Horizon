import { describe, expect, test } from "bun:test";
import { NO_PANELS, reduceAgent, reduceHuman, ANSWERED_CANNOT_CHANGE, QUESTION_CHANGED, type AskBlock, type Panels } from "../src/ui/desk/panels-model.ts";
import { afterAll, beforeAll } from "bun:test";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

const ask = (over: Record<string, unknown> = {}) => ({ id: "q", question: "Which plan?", why_needed: "x", options: [{ option_id: "a", label: "Plan A", consequence: "Costs more" }, { option_id: "b", label: "Plan B" }], ...over });
const put = (state: Panels, a: Record<string, unknown>, panel = "p"): Panels => {
  const r = reduceAgent(state, { tool: "ask_human", panel, ask: a });
  expect(r.result.ok).toBe(true);
  return r.state;
};
const block = (state: Panels): AskBlock => state.open[0]!.blocks.find((b): b is AskBlock => b.kind === "question")!;

describe("each question has a version", () => {
  test("the version follows the question words, the options, their consequences and the input kind", () => {
    const v = (a: Record<string, unknown>) => block(put(NO_PANELS, a)).version;
    expect(v(ask())).toBe(v(ask()));
    expect(v(ask())).toMatch(/^[0-9a-f]{14}$/);
    expect(v(ask({ question: "Which plan now?" }))).not.toBe(v(ask()));
    expect(v(ask({ options: [{ option_id: "a", label: "Plan A", consequence: "Costs less" }, { option_id: "b", label: "Plan B" }] }))).not.toBe(v(ask()));
    expect(v(ask({ options: [{ option_id: "a", label: "Plan A", consequence: "Costs more" }, { option_id: "c", label: "Plan C" }] }))).not.toBe(v(ask()));
    expect(v(ask({ input: "multiselect" }))).not.toBe(v(ask()));
  });

  test("an answer to the version the person saw is accepted", () => {
    const s = put(NO_PANELS, ask());
    const r = reduceHuman(s, { op: "human.answer", panel: "p", ask: "q", outcome: "answered", value: "a", version: block(s).version });
    expect(r.result.ok).toBe(true);
  });

  test("an answer to a version the question does not have is refused with plain words", () => {
    // A question keeps its wording under its id, so the version a person saw can only go stale by a different version being sent.
    const s = put(NO_PANELS, ask());
    const seen = "0000000000000";
    expect(seen).not.toBe(block(s).version);
    const r = reduceHuman(s, { op: "human.answer", panel: "p", ask: "q", outcome: "answered", value: "a", version: seen });
    expect(r.result.ok).toBe(false);
    expect(r.result.ok === false && r.result.message).toBe("This question changed after you looked at it. Look again, then answer.");
    expect(QUESTION_CHANGED).toBe("This question changed after you looked at it. Look again, then answer.");
    expect(block(r.state).answered).toBeNull();
  });

  test("an agent cannot change a question the person already answered, by ask_human or show_surface", () => {
    let s = put(NO_PANELS, ask());
    s = reduceHuman(s, { op: "human.answer", panel: "p", ask: "q", outcome: "answered", value: "a", version: block(s).version }).state;
    const reworded = reduceAgent(s, { tool: "ask_human", panel: "p", ask: ask({ question: "Which plan, same as before?" }) });
    expect(reworded.result.ok).toBe(false);
    expect(reworded.result.ok === false && reworded.result.message).toBe(ANSWERED_CANNOT_CHANGE);
    expect(block(reworded.state).answered).not.toBeNull();
    const surface = reduceAgent(s, { tool: "show_surface", surface: { id: "p", blocks: [{ type: "ask", ...ask({ options: [{ option_id: "a", label: "Plan A", consequence: "Free" }, { option_id: "b", label: "Plan B" }] }) }] } });
    expect(surface.result.ok).toBe(false);
    expect(surface.result.ok === false && surface.result.message).toBe(ANSWERED_CANNOT_CHANGE);
    expect(block(surface.state).answered?.value).toBe("a");
  });

  // Operator decision (design v3): "Edit an existing question? No. Use a new question id for changes." The old behaviour, where an
  // unanswered question could be reworded under the same id, is replaced: the same id keeps its first wording on every state.
  const SAME_ID = "That question id was already used for different wording. Use a new question id.";

  test("the same question put again keeps the answer; a changed question under the same id is refused while unanswered", () => {
    let s = put(NO_PANELS, ask());
    const before = block(s).version;
    const edited = reduceAgent(s, { tool: "ask_human", panel: "p", ask: ask({ question: "A clearer question?" }) });
    expect(edited.result.ok).toBe(false);
    expect(edited.result.ok === false && edited.result.message).toBe(SAME_ID);
    expect(block(edited.state).question).toBe("Which plan?");
    expect(block(edited.state).version).toBe(before);
    s = reduceHuman(s, { op: "human.answer", panel: "p", ask: "q", outcome: "answered", value: "a", version: before }).state;
    const again = reduceAgent(s, { tool: "ask_human", panel: "p", ask: ask() });
    expect(again.result.ok).toBe(true);
    expect(block(again.state).answered?.value).toBe("a");
  });

  test("a question put off keeps its id's wording: a changed put is refused, the same words reopen it", () => {
    let s = put(NO_PANELS, ask());
    s = reduceHuman(s, { op: "human.answer", panel: "p", ask: "q", outcome: "deferred", version: block(s).version }).state;
    const changed = reduceAgent(s, { tool: "ask_human", panel: "p", ask: ask({ question: "Now which plan?" }) });
    expect(changed.result.ok).toBe(false);
    expect(changed.result.ok === false && changed.result.message).toBe(SAME_ID);
    expect(block(changed.state).answered?.outcome).toBe("deferred");
    const reopened = reduceAgent(s, { tool: "ask_human", panel: "p", ask: ask() });
    expect(reopened.result.ok).toBe(true);
    expect(block(reopened.state).answered).toBeNull();
  });
});

const SAME_ID_WORDS = "That question id was already used for different wording. Use a new question id.";

describe("over the desk", () => {
  let app: DeskApp;
  beforeAll(async () => {
    app = await startDeskApp();
  });
  afterAll(async () => app.stop());

  test("an answer with a version the question does not have is refused with the plain words, a current one is recorded with its version", async () => {
    await app.application.applyAgentOp({ tool: "ask_human", panel: "web", ask: ask() });
    const seen = (await app.state()).panels.open.find((p: any) => p.id === "web").blocks[0].version;
    // A changed question under the same id is refused now (the id keeps its wording), so the board keeps the version the person saw.
    const reworded = await app.application.applyAgentOp({ tool: "ask_human", panel: "web", ask: ask({ question: "Which plan, again?" }) });
    expect(reworded.ok).toBe(false);
    expect(reworded.ok === false && reworded.message).toBe(SAME_ID_WORDS);
    const stale = await app.post("/desk/panels/op", { op: "human.answer", panel: "web", ask: "q", outcome: "answered", value: "a", version: "0000000000000" });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as any).message).toBe("This question changed after you looked at it. Look again, then answer.");
    expect(seen).toMatch(/^[0-9a-f]{14}$/);
    const now = (await app.state()).panels.open.find((p: any) => p.id === "web").blocks[0].version;
    expect((await app.post("/desk/panels/op", { op: "human.answer", panel: "web", ask: "q", outcome: "answered", value: "a", version: now })).status).toBe(200);
    const said = await app.application.applyAgentOp({ tool: "read_responses" });
    expect(said.ok && said.responses?.find((r) => r.panel_id === "web")?.version).toBe(now);
    const late = await app.application.applyAgentOp({ tool: "ask_human", panel: "web", ask: ask({ question: "Sneaky change" }) });
    expect(late.ok).toBe(false);
  });
});
