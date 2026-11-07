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

  test("an answer to an older version is refused with plain words", () => {
    const s = put(NO_PANELS, ask());
    const seen = block(s).version;
    const changed = put(s, ask({ question: "Which plan, really?" }));
    const r = reduceHuman(changed, { op: "human.answer", panel: "p", ask: "q", outcome: "answered", value: "a", version: seen });
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

  test("the same question put again keeps the answer; a question nobody answered can be changed", () => {
    let s = put(NO_PANELS, ask());
    const before = block(s).version;
    const edited = put(s, ask({ question: "A clearer question?" }));
    expect(block(edited).version).not.toBe(before);
    s = reduceHuman(s, { op: "human.answer", panel: "p", ask: "q", outcome: "answered", value: "a", version: before }).state;
    const again = reduceAgent(s, { tool: "ask_human", panel: "p", ask: ask() });
    expect(again.result.ok).toBe(true);
    expect(block(again.state).answered?.value).toBe("a");
  });

  test("a question put off with Not yet starts again when the agent changes it", () => {
    let s = put(NO_PANELS, ask());
    s = reduceHuman(s, { op: "human.answer", panel: "p", ask: "q", outcome: "deferred", version: block(s).version }).state;
    const changed = reduceAgent(s, { tool: "ask_human", panel: "p", ask: ask({ question: "Now which plan?" }) });
    expect(changed.result.ok).toBe(true);
    expect(block(changed.state).answered).toBeNull();
  });
});

describe("over the desk", () => {
  let app: DeskApp;
  beforeAll(async () => {
    app = await startDeskApp();
  });
  afterAll(async () => app.stop());

  test("a stale answer is refused with the plain words, a current one is recorded with its version", async () => {
    await app.application.applyAgentOp({ tool: "ask_human", panel: "web", ask: ask() });
    const seen = (await app.state()).panels.open.find((p: any) => p.id === "web").blocks[0].version;
    await app.application.applyAgentOp({ tool: "ask_human", panel: "web", ask: ask({ question: "Which plan, again?" }) });
    const stale = await app.post("/desk/panels/op", { op: "human.answer", panel: "web", ask: "q", outcome: "answered", value: "a", version: seen });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as any).message).toBe("This question changed after you looked at it. Look again, then answer.");
    const now = (await app.state()).panels.open.find((p: any) => p.id === "web").blocks[0].version;
    expect((await app.post("/desk/panels/op", { op: "human.answer", panel: "web", ask: "q", outcome: "answered", value: "a", version: now })).status).toBe(200);
    const said = await app.application.applyAgentOp({ tool: "read_responses" });
    expect(said.ok && said.responses?.find((r) => r.panel_id === "web")?.version).toBe(now);
    const late = await app.application.applyAgentOp({ tool: "ask_human", panel: "web", ask: ask({ question: "Sneaky change" }) });
    expect(late.ok).toBe(false);
  });
});
