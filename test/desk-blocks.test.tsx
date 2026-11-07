/** @jsxImportSource react */
/** Every block drawn (stage 8, step 6): all 15 drawers, the guard, the agent tag, the ask states, the form, Presenting, and the catalogue. */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { BlockGuard, DRAWERS, NO_CTX, drawBlock, type BlockCtx } from "../src/ui/desk/blocks/index.tsx";
import { Question } from "../src/ui/desk/blocks/index.tsx";
import { allowedPicture, sameSite } from "../src/ui/desk/blocks/viz.tsx";
import { CATALOGUE, vocabulary } from "../src/ui/surface2/catalog.ts";
import { BLOCK_TYPES, SurfaceBlock } from "../src/ui/surface2/grammar.ts";
import { questionOf } from "../src/ui/surface2/panel-blocks.ts";
import { standInMap, standInText } from "../src/ui/workspace/presenting.ts";

const text = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const draw = (block: unknown, ctx: BlockCtx = NO_CTX): string => renderToStaticMarkup(<>{drawBlock(block, ctx)}</>);
const ask = (over: Record<string, unknown> = {}) => ({ ...CATALOGUE.ask.example, ...over });

describe("the catalogue", () => {
  test("has an entry for exactly the 15 blocks, and each example passes the grammar", () => {
    expect(BLOCK_TYPES.length).toBe(15);
    expect(Object.keys(CATALOGUE).sort()).toEqual([...BLOCK_TYPES].sort());
    for (const type of BLOCK_TYPES) {
      const entry = CATALOGUE[type];
      expect(entry.use.length).toBeGreaterThan(10);
      expect(entry.avoid.length).toBeGreaterThan(10);
      expect(entry.example.type).toBe(type);
      const parsed = SurfaceBlock.safeParse(entry.example);
      if (!parsed.success) throw new Error(`${type}: ${JSON.stringify(parsed.error.issues)}`);
    }
  });
  test("the vocabulary lists every block and the rules", () => {
    const v = vocabulary();
    for (const type of BLOCK_TYPES) expect(v).toContain(`- ${type}:`);
    expect(v).toContain("Agents never answer");
    expect(v).toContain("Ask, then wait");
    expect(v).toContain("answer.route");
    expect(v).toContain("Nothing sends without the person's Confirm");
  });
});

describe("the drawers", () => {
  test("a drawer exists for every block type", () => {
    for (const type of BLOCK_TYPES) expect(typeof DRAWERS[type]).toBe("function");
    expect(Object.keys(DRAWERS).sort()).toEqual([...BLOCK_TYPES].sort());
  });
  for (const type of BLOCK_TYPES) {
    test(`${type} draws its catalogue example`, () => {
      const html = draw(CATALOGUE[type].example);
      expect(html).toContain(`data-block="${type}"`);
      expect(html).not.toContain("could not be shown");
      expect(html).not.toContain("cannot be shown here");
      expect(html).not.toContain("[object");
      expect(html).not.toContain("undefined");
    });
  }
  test("charts and graphs are plain SVG with a text alternative", () => {
    const chart = draw(CATALOGUE.chart.example);
    expect(chart).toContain("<svg");
    expect(chart).toContain('role="img"');
    expect(chart).toMatch(/aria-label="Line chart with 1 series/);
    expect(chart).toContain('<table class="hb-sr">');
    const bar = draw({ ...CATALOGUE.chart.example, kind: "bar" });
    expect(bar).toContain("<rect");
    const graph = draw(CATALOGUE.graph.example);
    expect(graph).toContain("<svg");
    expect(text(graph)).toContain("Plan has Step");
  });
  test("a graph with a cycle and a table with odd rows still draw", () => {
    const g = draw({ ...CATALOGUE.graph.example, edges: [{ from: "semantic:Plan", to: "semantic:Step", relation: "has" }, { from: "semantic:Step", to: "semantic:Plan", relation: "back" }] });
    expect(g).toContain("hb-node");
    const t = draw({ ...CATALOGUE.table.example, rows: [["a", "b"], "c", { step: null, state: true }] });
    expect(text(t)).toContain("Yes");
  });
  test("refs become chips that open through the desk", () => {
    const html = draw(CATALOGUE.entity.example);
    expect(html).toContain('class="hb-chip"');
    expect(html).toContain("Open Case");
  });
  test("a type outside the grammar, or not a block at all, gets the plain line", () => {
    for (const bad of [{ type: "iframe", id: "x" }, null, "text", 4, []]) expect(text(draw(bad))).toContain("This part cannot be shown here");
  });
  test("a broken block is contained, not thrown", () => {
    for (const bad of [{ type: "table", columns: 5, rows: "x" }, { type: "chart", series: "no" }, { type: "tree", nodes: [{ ref: "a", parent_ref: "a" }, null] }, { type: "ask" }, { type: "form", fields: 3 }, { type: "graph", nodes: [null], edges: 7 }, { type: "media", items: [{}], pins: [{ x: "a" }] }]) {
      expect(() => draw(bad)).not.toThrow();
    }
    expect(text(draw({ type: "ask" }))).toContain("This part could not be shown.");
  });
  test("the guard shows the plain failure line when its child throws", () => {
    expect(BlockGuard.getDerivedStateFromError()).toEqual({ failed: true });
    const guard = new BlockGuard({ children: null });
    guard.state = { failed: true };
    expect(text(renderToStaticMarkup(<>{guard.render()}</>))).toContain("This part could not be shown.");
  });
});

describe("the agent tag", () => {
  test("inline agent data is tagged; data from a named source is not", () => {
    expect(text(draw(CATALOGUE.callout.example))).toContain("from the agent");
    expect(text(draw(CATALOGUE.metric.example))).toContain("from the agent");
    expect(draw(CATALOGUE.table.example)).toContain('data-from-agent="no"');
    expect(text(draw(CATALOGUE.table.example))).not.toContain("from the agent");
    expect(text(draw(CATALOGUE.timeline.example))).not.toContain("from the agent");
  });
});

describe("media", () => {
  test("only allowed local sources count; remote addresses never load", () => {
    expect(allowedPicture("file:evidence/home.png")).toBe(true);
    for (const bad of ["https://x.test/a.png", "http://x.test/a.png", "data:image/png;base64,AA", "file:evidence/../a.png", "file:other/a.png", "file:evidence/a.txt", "agent:thing.png"]) expect(allowedPicture(bad)).toBe(false);
    expect(sameSite("/files/a.png")).toBe(true);
    for (const bad of ["//evil.test/a.png", "https://evil.test/a.png", "javascript:1", null]) expect(sameSite(bad)).toBe(false);
  });
  test("the picture is drawn only through the desk's own address", () => {
    const ctx: BlockCtx = { ...NO_CTX, mediaUrl: () => "/desk/file/home.png" };
    expect(draw(CATALOGUE.media.example, ctx)).toContain('src="/desk/file/home.png"');
    expect(draw(CATALOGUE.media.example, { ...NO_CTX, mediaUrl: () => "https://evil.test/a.png" })).not.toContain("<img");
    expect(draw(CATALOGUE.media.example)).not.toContain("<img");
    const remote = { ...CATALOGUE.media.example, items: [{ label: "x", src: "https://evil.test/a.png" }] };
    expect(draw(remote, ctx)).not.toContain("evil.test/a.png\"");
    expect(draw(remote, ctx)).not.toContain("<img");
  });
});

describe("asks", () => {
  test("an open select shows the options with what each leads to, and Answer, Not yet and Skip", () => {
    const t = text(draw(ask()));
    expect(t).toContain("Which plan should I follow?");
    expect(t).toContain("Faster, but riskier.");
    expect(t).toContain("This settles: Choice of plan");
    for (const b of ["Answer", "Not yet", "Skip"]) expect(t).toContain(b);
    expect(draw(ask())).toContain('type="radio"');
    expect(draw(ask())).toContain("disabled");
  });
  test("each input kind draws its input", () => {
    const multi = draw(ask({ input: "multiselect" }));
    expect(multi).toContain('type="checkbox"');
    const confirm = draw(ask({ input: "confirm", options: undefined }));
    expect(confirm).toContain('value="yes"');
    expect(text(confirm)).toContain("No");
    const words = draw(ask({ input: "text", options: undefined }));
    expect(words).toContain('type="text"');
    expect(words).toContain('maxLength="500"');
  });
  test("answered and waiting, then routed", () => {
    const waiting = text(draw(ask(), { ...NO_CTX, askState: () => ({ answered: { outcome: "answered", value: "plan_b" } }) }));
    expect(waiting).toContain("You answered: Plan B");
    expect(waiting).toContain("Waiting for the agent to say where it went");
    const routed = text(draw(ask(), { ...NO_CTX, askState: () => ({ answered: { outcome: "answered", value: "plan_b", routed_as: "step handoff_0a49 in Seed: triage inbox" } }) }));
    expect(routed).toContain("You answered: Plan B");
    expect(routed).toContain("The agent says it took it to: step handoff_0a49 in Seed: triage inbox");
    expect(routed).not.toContain("Waiting for the agent");
    const confirm = text(draw(ask({ input: "confirm", options: undefined }), { ...NO_CTX, askState: () => ({ answered: { outcome: "answered", value: "yes" } }) }));
    expect(confirm).toContain("You answered: Yes");
    const deferred = text(draw(ask(), { ...NO_CTX, askState: () => ({ answered: { outcome: "deferred" } }) }));
    expect(deferred).toContain("You said not yet.");
    expect(deferred).not.toContain("Waiting for the agent");
  });
  test("withdrawn shows the reason", () => {
    const t = text(draw(ask(), { ...NO_CTX, askState: () => ({ withdrawn: { reason: "I found it myself" } }) }));
    expect(t).toContain("The agent withdrew this question: I found it myself");
    expect(t).not.toContain("Not yet");
  });
  test("Question draws a display item directly", () => {
    const item = questionOf({ ...CATALOGUE.ask.example }, "which_way")!;
    expect(text(renderToStaticMarkup(<Question item={{ ...item, answered: { outcome: "answered", value: "plan_a", note: null, routed_as: "no action: later" } }} />))).toContain("The agent says it took it to: no action: later");
  });
});

describe("the form", () => {
  test("draws its fields and only talks to ctx", () => {
    const calls: string[] = [];
    const ctx: BlockCtx = { ...NO_CTX, onSubmit: () => calls.push("submit"), onAnswer: () => calls.push("answer"), onAction: () => calls.push("action") };
    const html = draw(CATALOGUE.form.example, ctx);
    expect(html).toContain("<form");
    expect(html).toContain("<textarea");
    expect(html).toContain('type="checkbox"');
    expect(text(html)).toContain("Still needed");
    expect(calls).toEqual([]);
  });
  test("the drawers never reach for the network or markup", () => {
    const dir = join(import.meta.dir, "..", "src", "ui", "desk", "blocks");
    for (const name of readdirSync(dir).filter((n) => n.endsWith(".ts") || n.endsWith(".tsx"))) {
      const src = readFileSync(join(dir, name), "utf8");
      expect(src).not.toContain("dangerouslySetInnerHTML");
      expect(src).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|innerHTML|eval\(/);
    }
  });
});

describe("actions inside a part", () => {
  test("a ready step offers a button; a blocked one does not", () => {
    const ready = { ...CATALOGUE.preflight.example, availability: "available", first_blocker: null };
    expect(text(draw(ready))).toContain("Show me the preview");
    expect(text(draw(CATALOGUE.preflight.example))).toContain("What stops it first: Two reviews are still open.");
    expect(draw(CATALOGUE.preflight.example)).not.toContain("<button");
  });
});

describe("Presenting", () => {
  test("stand-ins replace project names in drawn text only when Presenting is on", () => {
    const map = standInMap("k".repeat(32), ["SecretClientApp"]);
    const block = { ...CATALOGUE.callout.example, text: "SecretClientApp needs a review." };
    const hideNames = (t: string): string => standInText(t, map);
    const on = text(draw(block, { ...NO_CTX, presenting: true, hideNames }));
    expect(on).not.toContain("SecretClientApp");
    expect(on).toContain("Project ");
    expect(text(draw(block, { ...NO_CTX, presenting: false, hideNames }))).toContain("SecretClientApp");
    const table = draw({ ...CATALOGUE.table.example, rows: [{ step: "SecretClientApp", state: "ok" }] }, { ...NO_CTX, presenting: true, hideNames });
    expect(table).not.toContain("SecretClientApp");
  });
});
