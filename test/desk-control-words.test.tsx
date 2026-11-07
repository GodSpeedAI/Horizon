/** @jsxImportSource react */
/** Beside each control on a question, one plain sentence says what it does. An agent cannot withdraw a question that settles a decision. */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { hasBannedWords } from "../src/ui/desk/banned-words.ts";
import { CONTROL_WORDS } from "../src/ui/desk/blocks/ask.tsx";
import { PanelCard } from "../src/ui/desk/Panels.tsx";
import { NO_PANELS, REQUIRED_CANNOT_WITHDRAW, reduceAgent, reduceHuman } from "../src/ui/desk/panels-model.ts";
import { quietIo } from "./support/desk-io.ts";

const ask = (over: Record<string, unknown> = {}) => ({ id: "q", question: "Which plan?", why_needed: "x", options: [{ option_id: "a", label: "A" }, { option_id: "b", label: "B" }], ...over });
const text = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const board = (a: Record<string, unknown>) => reduceAgent(NO_PANELS, { tool: "ask_human", panel: "p", ask: a }).state;

describe("what each control does", () => {
  test("one sentence beside Answer, Not yet and Skip", () => {
    const html = renderToStaticMarkup(<PanelCard panel={board(ask()).open[0]!} io={quietIo().panels} />);
    const pairs: [string, string][] = [["answer", "Your answer goes to the agent."], ["not-yet", "The agent will ask again later. Nothing is decided."], ["skip", "The question is closed without an answer. Nothing is decided."]];
    for (const [key, sentence] of pairs) {
      expect(html).toContain(`data-control-words="${key}"`);
      expect(text(html)).toContain(sentence);
    }
    expect(html.indexOf("Answer</button>")).toBeLessThan(html.indexOf('data-control-words="answer"'));
    expect(html.indexOf("Not yet</button>")).toBeLessThan(html.indexOf('data-control-words="not-yet"'));
    expect(html.indexOf("Skip</button>")).toBeLessThan(html.indexOf('data-control-words="skip"'));
  });

  test("a withdrawn question says what that means", () => {
    const withdrawn = reduceAgent(board(ask()), { tool: "ask.withdraw", panel_id: "p", ask_id: "q", reason: "No longer needed" });
    expect(withdrawn.result.ok).toBe(true);
    const html = renderToStaticMarkup(<PanelCard panel={withdrawn.state.open[0]!} io={quietIo().panels} />);
    expect(text(html)).toContain("The agent took back its question. Your answers so far stay on record.");
  });

  test("the sentences use plain words", () => {
    for (const sentence of Object.values(CONTROL_WORDS)) expect(hasBannedWords(sentence)).toBe(false);
    expect(hasBannedWords(REQUIRED_CANNOT_WITHDRAW)).toBe(false);
  });
});

describe("a required decision cannot be withdrawn by an agent", () => {
  test("a question that names what it settles is refused, and stays open for the person", () => {
    const required = board(ask({ resolves: "Choice of plan" }));
    const r = reduceAgent(required, { tool: "ask.withdraw", panel_id: "p", ask_id: "q", reason: "Changed my mind" });
    expect(r.result.ok).toBe(false);
    expect(r.result.ok === false && r.result.message).toBe("This question settles a decision, so only you can close it. The agent cannot take it back.");
    expect((r.state.open[0]!.blocks[0] as any).withdrawn).toBeNull();
  });

  test("the person can still skip it, and an ordinary question can still be withdrawn", () => {
    const required = board(ask({ resolves: "Choice of plan" }));
    expect(reduceHuman(required, { op: "human.answer", panel: "p", ask: "q", outcome: "cancelled" }).result.ok).toBe(true);
    expect(reduceHuman(required, { op: "human.close", id: "p" }).result.ok).toBe(true);
    expect(reduceAgent(board(ask()), { tool: "ask.withdraw", panel_id: "p", ask_id: "q", reason: "Not needed" }).result.ok).toBe(true);
  });
});
