/** @jsxImportSource react */
/** The Conversation view and the one composer (stage 8): rows, badges, cards, commands, the status line, and plain words throughout. */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { START, type UiState } from "../src/ui/desk/attention.ts";
import { BANNED } from "../src/ui/desk/banned-words.ts";
import { COMMANDS, hintsFor, parseLine, unknownCommandWords } from "../src/ui/desk/commands.ts";
import { Desk } from "../src/ui/desk/Desk.tsx";
import { keepsDraft } from "../src/ui/desk/Composer.tsx";
import { requestFor, sourceBadge } from "../src/ui/desk/Conversation.tsx";
import type { ConversationRow } from "../src/ui/desk/conversation-model.ts";
import { itemsOf } from "../src/ui/desk/model.ts";
import { NO_PANELS, reduceAgent } from "../src/ui/desk/panels-model.ts";
import { deskState } from "./support/desk-fixture.ts";
import { quietIo } from "./support/desk-io.ts";

const text = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ");
const row = (n: number, over: Partial<ConversationRow> = {}): ConversationRow => ({ row_id: `row-${n}`, at: `2026-11-07T10:0${n}:00Z`, source: "you", kind: "note", words: `words ${n}`, outcome: `outcome ${n}`, status: "done", refs: {}, ...over });
const draw = (ui: Partial<UiState>): string => renderToStaticMarkup(<Desk ui={{ ...START, data: deskState(), ...ui }} dispatch={() => undefined} io={quietIo()} />);
const convo = (rows: ConversationRow[], over: Partial<UiState> = {}): string => draw({ view: "conversation", rows, ...over });

describe("rows", () => {
  const rows = [
    row(1, { status: "done", outcome: "Saved to 2026-11-07." }),
    row(2, { status: "waiting", source: "agent", agent_name: "Reviewer", kind: "handoff-proposal", words: "Fix totals", outcome: "An agent suggests this. Nothing is sent until you confirm.", refs: { draft_id: "d1" } }),
    row(3, { status: "refused", outcome: "Cases are not connected." }),
    row(4, { status: "unseen", source: "page-agent", agent_name: "Agent on this page", kind: "find", outcome: "Not checked yet." }),
  ];
  test("each status has a dot and a word; not seen is its own state; each source has its badge; one outcome line", () => {
    const html = convo(rows);
    expect(html).toContain('aria-label="Conversation, oldest first"');
    for (const status of ["done", "waiting", "refused", "unseen"]) expect(html).toContain(`data-status="${status}"`);
    const words = text(html);
    for (const w of ["Done", "Waiting for you", "Refused", "Not seen yet"]) expect(words).toContain(w);
    expect(words).toContain("You");
    expect(words).toContain("Agent · Reviewer");
    expect(words).toContain("Agent on this page");
    expect(words).toContain("Saved to 2026-11-07.");
    expect(words).not.toMatch(/\bno\b.*Not seen yet/);
    expect(sourceBadge({ source: "agent" })).toBe("Agent");
  });
  test("the list is reachable by the keyboard cursor, in order", () => {
    expect(itemsOf("conversation", null, null, rows).map((i) => i.id)).toEqual(rows.map((r) => `row:${r.row_id}`));
  });
  test("an empty conversation says what to do", () => {
    expect(text(convo([]))).toContain("Nothing has happened yet");
  });
  test("selecting a row opens it in the inspector: not seen yet when nothing was seen, never no", () => {
    const html = convo(rows, { selection: "row:row-4" });
    const words = text(html);
    expect(html).toContain('data-selected="row"');
    expect((html.match(/chip-unseen/g) ?? []).length).toBe(3);
    for (const label of ["Decided", "Recorded", "Observed", "Details"]) expect(words).toContain(label);
  });
  test("the header names the setup and the open case, with a Try line and the open questions", () => {
    const words = text(convo(rows));
    expect(words).toContain("testing setup");
    expect(words).toContain("Try /find invoice");
    expect(words).toContain("Needs you (1)"); // the one waiting agent proposal; no open questions
  });
});

describe("waiting moves", () => {
  test("a suggested hand off and an own preview are cards with Confirm and Discard; a settled one is not", () => {
    const html = convo([
      row(1, { kind: "handoff-proposal", source: "page-agent", status: "waiting", refs: { draft_id: "d1" } }),
      row(2, { kind: "handoff", status: "waiting", refs: { draft_id: "d2" } }),
      row(3, { kind: "handoff", status: "done" }),
    ]);
    expect((html.match(/data-confirm-move/g) ?? []).length).toBe(2);
    expect((html.match(/data-discard-move/g) ?? []).length).toBe(2);
    expect(text(html)).toContain("An agent suggests");
    expect(text(html)).toContain("Nothing is sent until you confirm there");
  });
  test("Confirm asks the composer for the draft when there is one, and for the words alone when there is not", () => {
    expect(requestFor(row(1, { words: "Fix it", refs: { draft_id: "d1" } }))).toEqual({ words: "Fix it", draftId: "d1" });
    expect(requestFor(row(1, { words: "Fix it" }))).toEqual({ words: "Fix it" });
  });
});

describe("cards from agents", () => {
  const ask = { id: "q1", question: "Ship it?", why_needed: "Release is waiting", options: [{ option_id: "yes", label: "Yes" }, { option_id: "no", label: "No" }] };
  const made = reduceAgent(NO_PANELS, { tool: "ask_human", panel: "release", ask });
  if (!made.result.ok) throw new Error("setup");
  const folded = reduceAgent(made.state, { tool: "show_surface", surface: { id: "notes", title: "Release notes", blocks: [{ type: "callout", id: "c", tone: "ok", text: "All good." }] } });
  if (!folded.result.ok) throw new Error("setup");
  const rows = [row(1, { kind: "panel", source: "agent", status: "waiting", refs: { panel_id: "release" } }), row(2, { kind: "panel", source: "agent", refs: { panel_id: "notes" } })];
  const html = convo(rows, { data: deskState({ panels: { ...folded.state, waiting: [] } }) });
  test("a card with an open question has a label, a heading and the question; one without folds to its title and summary", () => {
    expect(html).toMatch(/data-panel-id="release"[^>]*data-folded="no"/);
    expect(html).toMatch(/data-panel-id="notes"[^>]*data-folded="yes"/);
    expect(html).toContain("<details>");
    expect(html).toMatch(/<h2[^>]*>Release notes<\/h2>/);
    const words = text(html);
    expect(words).toContain("Needs you");
    expect(words).toContain("Ship it?");
    expect(words).toContain("All good.");
  });
  test("the separate list is gone", () => {
    expect(text(html)).not.toContain("From agents");
    expect(draw({ view: "today", data: deskState({ panels: { ...folded.state, waiting: [] } }) })).not.toContain("data-panel-id");
  });
});

describe("the one composer", () => {
  test("every other view has the bar: the status line shows the latest outcome and the button counts what waits", () => {
    const rows = [row(1, { status: "waiting", kind: "handoff", outcome: "Preview ready." }), row(2, { status: "done", outcome: "Saved to 2026-11-07." }), row(3, { status: "waiting", kind: "handoff-proposal", outcome: "An agent suggests this." })];
    for (const view of ["today", "explore", "decide", "work"] as const) {
      const html = draw({ view, rows });
      expect(html).toContain('aria-label="Composer"');
      expect(text(html)).toContain("An agent suggests this.");
      expect(text(html)).toContain("Conversation (2)");
      expect((html.match(/id="composer-input"/g) ?? []).length).toBe(1);
    }
    const inside = convo(rows);
    expect((inside.match(/id="composer-input"/g) ?? []).length).toBe(1);
    expect(inside).not.toContain("data-open-conversation");
  });
  test("the per-page thread is gone", () => {
    const html = draw({ view: "today", rows: [] });
    expect(html).not.toContain("cv-thread");
    expect(html).not.toContain("cv-turn");
  });
  test("the nav puts Conversation right after Today, with what waits", () => {
    const html = draw({ rows: [row(1, { status: "waiting", kind: "handoff" })] });
    const nav = html.slice(html.indexOf('class="views"'));
    expect(nav.indexOf('data-view="today"')).toBeLessThan(nav.indexOf('data-view="conversation"'));
    expect(nav.indexOf('data-view="conversation"')).toBeLessThan(nav.indexOf('data-view="explore"'));
    expect(text(nav.slice(0, nav.indexOf("</ul>")))).toContain("Conversation (1)");
  });
});

describe("the box is also a command line", () => {
  test("each command is read with its words", () => {
    for (const name of COMMANDS) expect(parseLine(`/${name} some words`)).toEqual({ kind: "command", name, arg: "some words" });
    expect(parseLine("/FIND  invoice ")).toEqual({ kind: "command", name: "find", arg: "invoice" });
    expect(parseLine("/done")).toEqual({ kind: "command", name: "done", arg: "" });
  });
  test("an unknown command says so in plain words", () => {
    expect(parseLine("/nope x")).toEqual({ kind: "unknown", name: "nope" });
    expect(unknownCommandWords("nope")).toBe("No command called /nope. Try /find, /handoff, /note, /done or /hold.");
  });
  test("plain text is left alone", () => {
    for (const plain of ["hello there", "see /find later", "10/5 meeting", ""]) expect(parseLine(plain)).toEqual({ kind: "plain" });
  });
  test("typing / offers a short list of commands in plain words", () => {
    expect(hintsFor("/").map((h) => h.name)).toEqual([...COMMANDS]);
    expect(hintsFor("/ho").map((h) => h.name)).toEqual(["hold"]);
    expect(hintsFor("/find x")).toEqual([]);
    const html = draw({ composer: { mode: "write", text: "/", selStart: 1, selEnd: 1 } });
    expect(text(html)).toContain("/handoff <words>");
    expect(text(html)).toContain("Save a note on today");
  });
});

describe("plain words on the new view", () => {
  test("no banned word, no internal name, no raw id", () => {
    const rows = [
      row(1), row(2, { status: "waiting", kind: "handoff-proposal", source: "page-agent", agent_name: "Agent on this page", refs: { draft_id: "9b2f0c1e-0000-4000-8000-000000000000", step_id: "step_x", intent_id: "intent-1" } }),
      row(3, { status: "unseen", kind: "decision" }), row(4, { status: "refused", kind: "answer" }),
    ];
    for (const ui of [{ view: "conversation" as const, rows }, { view: "conversation" as const, rows, selection: "row:row-2" }, { view: "today" as const, rows }]) {
      const visible = text(draw(ui));
      const hits = BANNED.filter((b) => b.pattern.test(visible)).map((b) => b.name);
      expect(hits).toEqual([]);
      for (const jargon of ["WebMCP", "schema", "intent", "draft ", "block", "panel", "9b2f0c1e", "step_x"]) expect(visible).not.toContain(jargon);
      const region = text((draw(ui).split("cv-view")[1] ?? "").split("class=\"convo\"")[0]!);
      expect(region).not.toMatch(/\bask\b/i);
    }
  });
});

describe("a confirmed proposal", () => {
  test("its own draft id is never saved as the desk's draft (the server refuses it, which showed as a 409 in the console)", () => {
    expect(keepsDraft("mine", "theirs")).toBe(true);
    expect(keepsDraft("mine", null)).toBe(true);
    expect(keepsDraft("theirs", "theirs")).toBe(false);
  });
});

describe("a wide part on a phone", () => {
  test("a row may shrink to the screen, so a wide part inside it scrolls on its own and the page does not (seen live at 390 px)", () => {
    expect(readFileSync(new URL("../src/ui/desk/desk.css", import.meta.url), "utf8")).toMatch(/\.cv-row \{ display:grid; grid-template-columns:minmax\(0,1fr\); min-width:0;/);
  });
});

describe("a chart on a phone", () => {
  test("its hidden table is contained by the chart, so it cannot make the page scroll sideways (seen live at 390 px)", () => {
    expect(readFileSync(new URL("../src/ui/desk/blocks/blocks.css", import.meta.url), "utf8")).toMatch(/\.hb-chart \{ position:relative; overflow:hidden; \}/);
  });
});

describe("headings and landmarks in the conversation", () => {
  test("a waiting card is a heading level 2 in an article, not a named region, so two of them do not clash and levels do not skip", () => {
    const html = convo([row(1, { status: "waiting", source: "page-agent", kind: "handoff-proposal", words: "Fix totals", refs: { draft_id: "d1" } }), row(2, { status: "waiting", source: "page-agent", kind: "handoff-proposal", words: "Fix tax", refs: { draft_id: "d2" } })]);
    expect((html.match(/<article[^>]*data-waiting-move/g) ?? []).length).toBe(2);
    expect(html).not.toMatch(/<section[^>]*data-waiting-move/);
    expect(html).toMatch(/<h2[^>]*>Hand off this work\?<\/h2>/);
    expect(html).not.toMatch(/<h3[^>]*cv-card-title/);
  });
});
