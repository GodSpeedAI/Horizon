import { describe, expect, test } from "bun:test";
import { DUPLICATE_BLOCK_ID, NO_PANELS, reduceAgent, reduceHuman, type AskBlock } from "../src/ui/desk/panels-model.ts";
import { PanelLoadError, readPanel } from "../src/capabilities/panel-records.ts";

const ask = (over: Record<string, unknown> = {}) => ({ type: "ask", id: "q", question: "Which plan?", why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }], ...over });

describe("two blocks on one panel cannot share an id", () => {
  test("a put with two differently worded questions under one id is refused before anything is stored", () => {
    const r = reduceAgent(NO_PANELS, { tool: "show_surface", surface: { id: "p", blocks: [ask(), ask({ question: "Which route?" })] } });
    expect(r.result).toEqual({ ok: false, code: "SCHEMA", message: DUPLICATE_BLOCK_ID });
    expect(r.state.open).toEqual([]);
  });

  test("a put that reuses a block id for a callout is refused too", () => {
    const r = reduceAgent(NO_PANELS, { tool: "show_surface", surface: { id: "p", blocks: [ask(), { type: "callout", id: "q", text: "fine" }] } });
    expect(r.result).toMatchObject({ ok: false, message: DUPLICATE_BLOCK_ID });
  });

  test("two questions with distinct ids are accepted and each is answered on its own", () => {
    const put = reduceAgent(NO_PANELS, { tool: "show_surface", surface: { id: "p", blocks: [ask(), ask({ id: "r", question: "Which route?" })] } });
    expect(put.result.ok).toBe(true);
    const s = reduceHuman(put.state, { op: "human.answer", panel: "p", ask: "q", outcome: "answered", value: "a" }).state;
    const answered = s.open[0]!.blocks.filter((b): b is AskBlock => b.kind === "question").map((b) => [b.id, b.answered?.value ?? null]);
    expect(answered).toEqual([["q", "a"], ["r", null]]);
  });

  test("a saved panel with two blocks of one id is refused as unreadable when loaded", () => {
    const saved = { id: "p", title: "p", step: null, pinned: false, notes: [], owner_key: null, blocks: [{ kind: "question", id: "q", question: "A?" }, { kind: "question", id: "q", question: "B?" }] };
    expect(() => readPanel(saved)).toThrow(PanelLoadError);
    expect(() => readPanel({ ...saved, blocks: [saved.blocks[0]] })).not.toThrow();
  });
});
