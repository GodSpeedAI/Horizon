/** @jsxImportSource react */
/** Agent panels keep their validated blocks and draw them all (stage 8 step 6): kept, drawn, presented, offered as a catalogue. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { PanelCard, type PanelsIo } from "../src/ui/desk/Panels.tsx";
import { NO_PANELS, reduceAgent, reduceHuman } from "../src/ui/desk/panels-model.ts";
import { CATALOGUE } from "../src/ui/surface2/catalog.ts";
import { BLOCK_TYPES, SurfaceBlock } from "../src/ui/surface2/grammar.ts";

const SECRET = "SecretClientApp";
const io: PanelsIo = { answer: async () => ({ ok: true, message: "" }), pin: async () => undefined, close: async () => undefined, stopWaiting: async () => ({ ok: true, message: "" }) };
const must = (r: ReturnType<typeof reduceAgent>) => {
  expect(r.result.ok).toBe(true);
  return r.state;
};
/** Every sentence in an example (a string with a space) names the private repository. */
const named = (v: unknown): unknown => (typeof v === "string" ? (v.includes(" ") || /^[A-Z]/.test(v) ? `${v} ${SECRET}` : v) : Array.isArray(v) ? v.map(named) : v !== null && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, named(x)])) : v);

describe("a panel keeps the blocks that passed the grammar", () => {
  test("each of the 15 examples is kept and drawn by its own drawer", () => {
    for (const type of BLOCK_TYPES) {
      const state = must(reduceAgent(NO_PANELS, { tool: "show_surface", surface: { id: `p_${type}`, blocks: [CATALOGUE[type].example] } }));
      const item = state.open[0]!.blocks[0]!;
      expect(item.block, type).toBeDefined();
      expect(item.block!.type).toBe(type);
      const html = renderToStaticMarkup(<PanelCard panel={{ ...state.open[0]!, pinned: true }} io={io} />);
      expect(html, type).toContain(`data-block="${type}"`);
    }
  });

  test("a block that fails the grammar is not kept, and still shows as before", () => {
    const state = must(reduceAgent(NO_PANELS, { tool: "show_surface", surface: { id: "loose", blocks: [{ type: "callout", id: "c", tone: "ok", text: "fine" }, { type: "tree", id: "t" }] } }));
    expect(state.open[0]!.blocks.map((b) => b.block)).toEqual([undefined, undefined]);
    expect(state.open[0]!.blocks.map((b) => b.kind)).toEqual(["text", "unavailable"]);
  });

  test("a kept question takes its answer state from the card", () => {
    let state = must(reduceAgent(NO_PANELS, { tool: "show_surface", surface: { id: "q", blocks: [CATALOGUE.ask.example] } }));
    const ask = state.open[0]!.blocks[0]!;
    expect(ask.block?.type).toBe("ask");
    const id = ask.id;
    const first = (CATALOGUE.ask.example as { options?: { option_id: string }[] }).options?.[0]?.option_id;
    state = reduceHuman(state, { op: "human.answer", panel: "q", ask: id, outcome: first === undefined ? "deferred" : "answered", ...(first === undefined ? {} : { value: first }) }).state;
    const html = renderToStaticMarkup(<PanelCard panel={state.open[0]!} io={io} />);
    expect(html).toMatch(/You answered|not yet/);
  });
});

describe("the server", () => {
  let app: DeskApp;
  beforeAll(async () => {
    app = await startDeskApp({ repoPath: `/work/${SECRET}` });
  });
  afterAll(async () => app.stop());

  test("Presenting hides a private repository name in every part of a panel", async () => {
    const blocks = BLOCK_TYPES.map((type) => {
      const block = named(CATALOGUE[type].example);
      expect(SurfaceBlock.safeParse(block).success, `${type} still passes the grammar`).toBe(true);
      expect(JSON.stringify(block), type).toContain(SECRET);
      return block;
    });
    expect((await app.application.applyAgentOp({ tool: "show_surface", surface: { id: "all_parts", title: `Panel ${SECRET}`, blocks } })).ok).toBe(true);
    const off = JSON.stringify((await app.state()).panels);
    expect(off).toContain(SECRET);
    const on = await fetch(`${app.base}/workspace/presenting`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "on=1" });
    expect(on.status).toBeLessThan(400);
    const shown = JSON.stringify((await app.state()).panels);
    expect(shown).not.toContain(SECRET);
    expect(shown).toContain("Project ");
    // All 15 parts reached the page, kept whole.
    const panel = ((await app.state()).panels.open as { blocks: { block?: { type: string } }[] }[])[0]!;
    expect(panel.blocks.map((x) => x.block?.type)).toEqual([...BLOCK_TYPES]);
  });

  test("an agent can read the catalogue; it is read-only and not stored", async () => {
    const response = await fetch(`${app.base}/desk/panels/catalogue`, { headers: { "x-horizon-source": "page-agent" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as { schema: string; vocabulary: string; blocks: Record<string, unknown> };
    expect(body.schema).toBe("horizon.surface/3");
    expect(Object.keys(body.blocks).sort()).toEqual([...BLOCK_TYPES].sort());
    expect(body.vocabulary).toContain("callout");
    expect((await fetch(`${app.base}/desk/panels/catalogue`, { method: "POST", headers: { "x-horizon-source": "page-agent" } })).status).toBe(403);
  });
});
