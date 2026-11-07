// Journey 6: a broken part is contained. Odd data that passes the grammar is put in a panel, one candidate at a time, and drawn by the real drawers.
// (Agent side is the stand-in in panel-harness.ts.) A part that fails to draw must show "This part could not be shown." and leave the rest of the page alone.
import { launch, open, toConversation, save, OUT } from "./lib.ts";
import { installHarness, catalogue } from "./panel-harness.ts";
import { BLOCK_TYPES } from "../../../../src/ui/surface2/grammar.ts";
// Part names come from the grammar list, so this proof never restates the closed set.
const T = Object.fromEntries(BLOCK_TYPES.map((t) => [t, t])) as Record<(typeof BLOCK_TYPES)[number], string>;
const b = await launch(); const { page, errors } = await open(b, 1440, 1400); const log: Record<string, unknown> = {};
const h = await installHarness(page); const cat = await catalogue(); const ex = (t: string) => structuredClone(cat[t]!.example);
const long = "w".repeat(2500), rtl = "مرحبا بالعالم שלום עולם", emoji = "😀👩‍👩‍👧‍👦".repeat(40), html = "<img src=x onerror=alert(1)><script>alert(1)</script>";
const C: [string, any][] = [
  ["metric: huge number", { ...ex(T.metric), value: 1e308 }], ["metric: tiny number", { ...ex(T.metric), value: -1e-300 }], ["metric: very long label and unit", { ...ex(T.metric), label: long, unit: long }], ["metric: markup in text", { ...ex(T.metric), label: html }],
  ["callout: 2500 characters, no spaces", { ...ex(T.callout), text: long }], ["callout: right-to-left text", { ...ex(T.callout), text: rtl }], ["callout: emoji run", { ...ex(T.callout), text: emoji }], ["callout: markup", { ...ex(T.callout), text: html }],
  ["table: no rows", { ...ex(T.table), rows: [] }], ["table: row missing a column", { ...ex(T.table), rows: [{ step: "Only one" }] }], ["table: extra keys and null values", { ...ex(T.table), rows: [{ step: null, state: null, extra: "x" }] }], ["table: object as a cell", { ...ex(T.table), rows: [{ step: { a: 1 }, state: [1, 2] }] }], ["table: 12 columns, 50 rows", { ...ex(T.table), columns: Array.from({ length: 12 }, (_, i) => ({ key: `c${i}`, label: `Column ${i}` })), rows: Array.from({ length: 50 }, (_, r) => Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`c${i}`, `r${r}c${i} ${long.slice(0, 30)}`]))) }],
  ["tree: parent that does not exist", { ...ex(T.tree), nodes: [{ ref: "semantic:A", label: "A", parent_ref: "semantic:Nope" }] }], ["tree: two nodes that are each other's parent", { ...ex(T.tree), nodes: [{ ref: "semantic:A", label: "A", parent_ref: "semantic:B" }, { ref: "semantic:B", label: "B", parent_ref: "semantic:A" }] }], ["tree: node its own parent", { ...ex(T.tree), nodes: [{ ref: "semantic:A", label: "A", parent_ref: "semantic:A" }] }], ["tree: duplicate refs", { ...ex(T.tree), nodes: [{ ref: "semantic:A", label: "A", parent_ref: null }, { ref: "semantic:A", label: "A again", parent_ref: null }] }], ["tree: empty", { ...ex(T.tree), nodes: [] }], ["tree: 60 levels deep", { ...ex(T.tree), nodes: Array.from({ length: 60 }, (_, i) => ({ ref: `semantic:N${i}`, label: `Level ${i}`, parent_ref: i === 0 ? null : `semantic:N${i - 1}` })) }],
  ["timeline: time not a date", { ...ex(T.timeline), entries: [{ at: "not a date", label: "x", ref: "semantic:Case" }] }], ["timeline: empty", { ...ex(T.timeline), entries: [] }], ["timeline: far future and far past", { ...ex(T.timeline), entries: [{ at: "9999-12-31T23:59:59Z", label: "later", ref: "semantic:Case" }, { at: "0001-01-01T00:00:00Z", label: "earlier", ref: "semantic:Case" }] }],
  ["graph: edge to itself", { ...ex(T.graph), edges: [{ from: "semantic:Plan", to: "semantic:Plan", relation: "has" }] }], ["graph: no nodes", { ...ex(T.graph), nodes: [], edges: [] }], ["graph: edge to a node not listed", { ...ex(T.graph), edges: [{ from: "semantic:Plan", to: "semantic:Ghost", relation: "has" }] }], ["graph: one node, 100 duplicate edges", { ...ex(T.graph), nodes: [{ id: "semantic:Plan", label: "Plan", kind: "plan" }], edges: Array.from({ length: 100 }, () => ({ from: "semantic:Plan", to: "semantic:Plan", relation: "r" })) }], ["graph: 80 nodes", { ...ex(T.graph), nodes: Array.from({ length: 80 }, (_, i) => ({ id: `semantic:N${i}`, label: `N${i}`, kind: "k" })), edges: [] }],
  ["chart: one point", { ...ex(T.chart), series: [{ label: "S", points: [5] }] }], ["chart: all points equal", { ...ex(T.chart), series: [{ label: "S", points: [4, 4, 4, 4] }] }], ["chart: all zero", { ...ex(T.chart), series: [{ label: "S", points: [0, 0, 0] }] }], ["chart: negative and huge", { ...ex(T.chart), series: [{ label: "S", points: [-1e9, 1e12, -5, 0] }] }], ["chart: no points", { ...ex(T.chart), series: [{ label: "S", points: [] }] }], ["chart: no series", { ...ex(T.chart), series: [] }], ["chart: bar with one point", { ...ex(T.chart), kind: "bar", series: [{ label: "S", points: [7] }] }], ["chart: 8 series of different length", { ...ex(T.chart), series: Array.from({ length: 8 }, (_, i) => ({ label: `S${i}`, points: Array.from({ length: i * 3 }, (_, j) => j) })) }], ["chart: huge decimals", { ...ex(T.chart), series: [{ label: "S", points: [0.1 + 0.2, 1 / 3, Number.MIN_VALUE] }] }],
  ["compare: no dimensions", { ...ex(T.compare), dimensions: [] }], ["compare: same on both sides, long text", { ...ex(T.compare), dimensions: [{ label: long, left: long, right: long }] }],
  ["media: pins outside 0 to 1", { ...ex(T.media), pins: [{ x: -5, y: 9, note: "outside" }] }], ["media: no items", { ...ex(T.media), items: [], pins: [] }], ["media: web address as source", { ...ex(T.media), items: [{ label: "Remote", src: "https://example.com/a.png" }] }],
  ["document: empty excerpt", { ...ex(T.document), excerpt: "" }], ["document: 2500-character excerpt", { ...ex(T.document), excerpt: long }],
  ["entity: unknown kind of reference", { ...ex(T.entity), ref: "semantic:Unknown" }], ["entity: empty label", { ...ex(T.entity), label: "" }],
  ["preflight: ready with no blocker", { ...ex(T.preflight), availability: "ready", first_blocker: undefined }], ["preflight: blocker 2500 characters", { ...ex(T.preflight), first_blocker: long }],
  ["progress: no figure", ex(T.progress)],
  ["form: no fields", { ...ex(T.form), fields: [] }], ["form: 20 fields", { ...ex(T.form), fields: Array.from({ length: 20 }, (_, i) => ({ name: `f${i}`, label: `Field ${i}`, kind: "text", required: false })) }],
  ["ask: option labels 2500 characters", { ...ex(T.ask), options: [{ option_id: "a", label: long, consequence: long }, { option_id: "b", label: "B" }] }],
];
await toConversation(page);
// An open question keeps the panel from folding.
const keepOpen = { ...ex(T.ask), id: "keep_open", question: "Keep this panel open?" };
const results: any[] = [];
for (const [name, block] of C) {
  const id = "odd";
  const before = errors.length;
  const r = h.agent({ tool: "show_surface", surface: { id, title: "Odd data", step: null, blocks: [{ ...block, id: block.id ?? "odd_block" }, keepOpen] } });
  const item = (h.board.open.find((p) => p.id === id)?.blocks[0]) as any;
  const grammar = item?.block !== undefined;
  await page.waitForTimeout(2300);
  const drawn = await page.locator(`[data-panel-id="${id}"] section.hb`).evaluateAll((els) => els.map((e) => ({ type: e.getAttribute("data-block"), len: (e as HTMLElement).innerText.length })));
  const fallbacks = await page.locator(`[data-panel-id="${id}"] .hb-fallback`).allTextContents();
  const stillThere = await page.locator(`[data-panel-id="${id}"] fieldset.hb-ask`).count();
  results.push({ name, accepted_by_panel: r.ok, passed_grammar: grammar, drawn_types: drawn.map((d) => d.type), fallback_lines: fallbacks, rest_of_panel_still_drawn: stillThere >= 1, new_console_errors: errors.slice(before), page_hscroll: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1) });
}
log.candidates = results.length;
log.passed_grammar = results.filter((r) => r.passed_grammar).map((r) => r.name);
log.refused_by_grammar_never_drawn = results.filter((r) => !r.passed_grammar).map((r) => ({ name: r.name, shown_as: r.fallback_lines }));
log.drawer_failed_and_contained = results.filter((r) => r.passed_grammar && r.fallback_lines.some((l: string) => /could not be shown/i.test(l))).map((r) => r.name);
log.rest_of_panel_always_drawn = results.every((r) => r.rest_of_panel_still_drawn);
log.any_console_errors = results.flatMap((r) => r.new_console_errors);
log.any_page_hscroll = results.filter((r) => r.page_hscroll).map((r) => r.name);
log.results = results;
save("j6-log.json", log);
console.log(JSON.stringify({ ...log, results: undefined }, null, 1)); await page.screenshot({ path: `${OUT}/j6-last-candidate.png` }); await b.close();
