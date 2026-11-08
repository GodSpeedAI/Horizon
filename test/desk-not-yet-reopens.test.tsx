/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NO_PANELS, hasOpenAsk, reduceAgent, reduceHuman, type AskBlock, type Panels } from "../src/ui/desk/panels-model.ts";
import { PanelCard } from "../src/ui/desk/Panels.tsx";
import { quietIo } from "./support/desk-io.ts";

const ask = { id: "q", question: "Which plan?", why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }] };
const block = (s: Panels): AskBlock => s.open[0]!.blocks.find((b): b is AskBlock => b.kind === "question")!;
const answered = (outcome: "answered" | "deferred" | "cancelled"): Panels => {
  const put = reduceAgent(NO_PANELS, { tool: "ask_human", panel: "p", ask }).state;
  return reduceHuman(put, { op: "human.answer", panel: "p", ask: "q", outcome, ...(outcome === "answered" ? { value: "a" } : {}) }).state;
};

describe("Not yet means the agent will ask again", () => {
  test("the agent asking the identical question again reopens a deferred one, and the earlier answer stays in the history", () => {
    const s = answered("deferred");
    expect(hasOpenAsk(s.open[0]!)).toBe(false);
    const again = reduceAgent(s, { tool: "ask_human", panel: "p", ask });
    expect(again.result.ok).toBe(true);
    expect(block(again.state).answered).toBeNull();
    expect(hasOpenAsk(again.state.open[0]!)).toBe(true);
    expect(block(again.state).earlier?.map((e) => e.outcome)).toEqual(["deferred"]);
    // It can be answered now, and the history keeps growing, not replacing.
    const twice = reduceAgent(reduceHuman(again.state, { op: "human.answer", panel: "p", ask: "q", outcome: "deferred" }).state, { tool: "ask_human", panel: "p", ask });
    expect(block(twice.state).earlier?.map((e) => e.outcome)).toEqual(["deferred", "deferred"]);
  });

  test("show_surface with the identical question reopens it too", () => {
    const again = reduceAgent(answered("deferred"), { tool: "show_surface", surface: { id: "p", blocks: [{ type: "ask", ...ask }] } });
    expect(again.result.ok).toBe(true);
    expect(block(again.state).answered).toBeNull();
    expect(block(again.state).earlier).toHaveLength(1);
  });

  test("the panel shows the earlier answer as history", () => {
    const again = reduceAgent(answered("deferred"), { tool: "ask_human", panel: "p", ask });
    const html = renderToStaticMarkup(<PanelCard panel={again.state.open[0]!} io={quietIo().panels} />).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(html).toContain("Earlier: You said not yet.");
  });

  test("an answered question still keeps its answer when asked again, and so does a skipped one", () => {
    expect(block(reduceAgent(answered("answered"), { tool: "ask_human", panel: "p", ask }).state).answered?.outcome).toBe("answered");
    expect(block(reduceAgent(answered("cancelled"), { tool: "ask_human", panel: "p", ask }).state).answered?.outcome).toBe("cancelled");
  });
});
