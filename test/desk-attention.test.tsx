/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SHOWN_STATES, START, STATES, STATE_WORDS, checkSummary, deskReducer, newCount, onScroll, shownCount, stepCheck, FEED_START, type Action, type UiState } from "../src/ui/desk/attention.ts";
import { Desk, type DeskIo } from "../src/ui/desk/Desk.tsx";
import { StateWord } from "../src/ui/desk/StateWord.tsx";
import { deskState, note } from "./support/desk-fixture.ts";
import { quietIo } from "./support/desk-io.ts";
import { buildDecide } from "../src/ui/desk/decide-build.ts";
import { interruptionsOf } from "../src/ui/desk/attention.ts";
import { orderWork, sessionItems, type WorkData } from "../src/ui/desk/work-build.ts";
import type { DecisionCardData } from "../src/ui/desk/model.ts";

const io: DeskIo = quietIo();
const run = (ui: UiState, ...actions: Action[]): UiState => actions.reduce(deskReducer, ui);
const draw = (ui: UiState): string => renderToStaticMarkup(<Desk ui={ui} dispatch={() => undefined} io={io} />);
const text = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("attention rules (desk)", () => {
  test("attention rule 2: 50 agent updates leave cursor, selection and layers unchanged", () => {
    let ui = run(
      { ...START, data: deskState() },
      { type: "cursor", delta: 2, length: 3 },
      { type: "select", id: "note:n2" },
      { type: "open-layer", kind: "keys" },
      { type: "typing", text: "half a thought", selStart: 4, selEnd: 9 },
    );
    const before = { view: ui.view, cursor: ui.cursor, selection: ui.selection, layers: ui.layers, focus: ui.focus, composer: ui.composer, day: ui.day, editing: ui.editing };
    for (let i = 0; i < 50; i += 1) {
      const notes = [note(1), note(2, { body: `edited by an agent ${i}` }), note(3), ...Array.from({ length: i + 1 }, (_, k) => note(10 + k))];
      ui = deskReducer(ui, { type: "poll", state: deskState({ rev: `r${i}`, status: { ...deskState().status, waiting: i } }, notes) });
    }
    expect({ view: ui.view, cursor: ui.cursor, selection: ui.selection, layers: ui.layers, focus: ui.focus, composer: ui.composer, day: ui.day, editing: ui.editing }).toEqual(before);
    // What may change did: the count, the end of the list, and the inspector's content.
    expect(ui.data!.status.waiting).toBe(49);
    expect(ui.data!.notes.length).toBe(53);
    ui = deskReducer(ui, { type: "escape" });
    expect(text(draw(ui))).toContain("edited by an agent 49");
  });

  test("attention rule 3: Escape three times returns focus to where it started", () => {
    const start = { ...START, data: deskState(), focus: "list" };
    let ui = run(start, { type: "open-layer", kind: "quick" }, { type: "open-layer", kind: "keys" }, { type: "open-layer", kind: "history" });
    expect(ui.layers.map((l) => l.kind)).toEqual(["quick", "keys", "history"]);
    ui = deskReducer(ui, { type: "escape" });
    expect(ui.layers).toHaveLength(2);
    ui = deskReducer(ui, { type: "escape" });
    expect(ui.layers).toHaveLength(1);
    ui = deskReducer(ui, { type: "escape" });
    expect(ui.layers).toHaveLength(0);
    expect(ui.focus).toBe(start.focus);
    expect(ui.cursor).toBe(start.cursor);
    // From the composer, Escape leaves the box and goes to the list; with nothing open it changes nothing else.
    const typing = run(start, { type: "focus", target: "composer" }, { type: "open-layer", kind: "quick" }, { type: "escape" });
    expect(typing.focus).toBe("composer");
    expect(deskReducer(typing, { type: "escape" }).focus).toBe("list");
  });

  test("attention rule 5: scroll position holds and N new is correct", () => {
    let feed = onScroll(FEED_START, { atBottom: false }, 3);
    expect(shownCount(feed, 3)).toBe(3);
    expect(newCount(feed, 3)).toBe(0);
    // Items arrive while the reader is scrolled up: the list does not grow under them, the count does.
    feed = onScroll(feed, { atBottom: false }, 7);
    expect(shownCount(feed, 10)).toBe(3);
    expect(newCount(feed, 10)).toBe(7);
    const ui = run({ ...START }, { type: "poll", state: deskState({}, [note(1), note(2), note(3)]) }, { type: "scrolled", atBottom: false, total: 3 }, { type: "poll", state: deskState({ rev: "r2" }, Array.from({ length: 10 }, (_, i) => note(i + 1))) });
    const html = draw(ui);
    expect(html.match(/data-note-id=/g)?.length).toBe(3);
    expect(text(html)).toContain("7 new ↓");
    const back = deskReducer(ui, { type: "jump-to-new" });
    expect(draw(back).match(/data-note-id=/g)?.length).toBe(10);
    expect(text(draw(back))).not.toContain("new ↓");
    expect(onScroll(feed, { atBottom: true }, 10)).toEqual(FEED_START);
  });

  test("attention rule 6: with colour removed every state is distinguishable", () => {
    const all = [...STATES, ...SHOWN_STATES];
    const words = all.map((state) => text(renderToStaticMarkup(<StateWord state={state} />)).trim());
    expect(new Set(words).size).toBe(all.length);
    for (const [i, state] of all.entries()) {
      expect(words[i]).toBe(STATE_WORDS[state]);
      // The only difference between two states is text; strip every attribute (class, data-state, style) and they still differ.
      const bare = renderToStaticMarkup(<StateWord state={state} />).replace(/<span[^>]*>/, "<span>");
      expect(bare).toContain(STATE_WORDS[state]);
    }
    // Part health is words too: a missing part never relies on colour.
    const html = draw({ ...START, data: deskState() });
    expect(html).toContain("Records: Not connected");
    expect(html).toContain("Rulebook edition 0a10c20d");
  });

  test("attention rule 7: a step with no record shows not recorded and counts as unchecked", () => {
    const missing = stepCheck({ name: "build", record: null });
    expect(missing).toEqual({ name: "build", words: "not recorded", counted: "unchecked" });
    expect(missing.words).not.toBe("0");
    expect(missing.words).not.toContain("passed");
    const steps = [{ name: "a", record: null }, { name: "b", record: null }, { name: "c", record: { passed: true } }];
    expect(checkSummary(steps)).toMatchObject({ unchecked: 2, passed: 1, failed: 0 });
    // A note, with a tag that sounds like approval, cannot make a check pass.
    const notes = [note(1, { body: "this passed, approved", tags: ["approved", "passed"] })];
    expect(stepCheck({ name: "build", record: null }, notes)).toEqual(missing);
    expect(checkSummary(steps, notes)).toEqual(checkSummary(steps));
    // The inspector says so for a case.
    const data = deskState({ cases: [{ case_ref: "case:1", purpose: "Checkout fix", opened_at: "2026-11-05T10:00:00Z" }] });
    const html = draw({ ...START, data, selection: "case:1" });
    expect(text(html)).toContain("Not recorded");
    expect(text(html)).not.toContain("passed");
  });

  test("attention rule 9: changing the source marks the pin and leaves content unchanged", () => {
    const first = deskState({}, [note(1, { body: "the wording I pinned" })]);
    let ui = run({ ...START, data: first }, { type: "select", id: "note:n1" }, { type: "pin", pin: { id: "note:n1", kind: "note", title: "pinned", content: "the wording I pinned", source_rev: "1" }, now: new Date("2026-11-06T10:00:00Z") });
    expect(ui.pins[0]!.changed).toBe(false);
    ui = deskReducer(ui, { type: "poll", state: deskState({ rev: "r2" }, [note(1, { body: "someone changed it", rev: 2 })]) });
    expect(ui.pins[0]).toMatchObject({ changed: true, content: "the wording I pinned", source_rev: "1", pinned_at: "2026-11-06T10:00:00.000Z" });
    const html = text(draw(ui));
    expect(html).toContain("Changed since you looked");
    expect(html).toContain("the wording I pinned");
    expect(html).toContain("pinned 2026-11-06");
  });

  const row = (id: string, requestedAt: string | null, over: Record<string, unknown> = {}) => ({
    approval_id: id, case_id: "case_1", plan_item_id: `step_${id}`, requested_at: requestedAt ?? "", expires_at: "2026-11-09T10:00:00Z", expired: false,
    digest: { ref: `approval:${id}`, expected_digest: `sha256:${id}` }, ...over,
  });
  const cards = (rows: ReturnType<typeof row>[], holds: Record<string, string> = {}, notices: string[] = []): DecisionCardData[] =>
    buildDecide({
      inbox: notices.length > 0 ? { state: "unreachable", message: notices[0]! } : { state: "not_configured" },
      moves: [],
      caseApprovals: { kind: "listed", approvals: rows, unreadable: null },
      holds: new Map(Object.entries(holds).map(([id, reason]) => [`case-task:${id}`, { reason, at: "2026-11-07T11:00:00Z" }])),
    }).cards as DecisionCardData[];
  const NOW = Date.parse("2026-11-07T12:00:00Z");
  const drawAt = (ui: UiState): string => renderToStaticMarkup(<Desk ui={ui} dispatch={() => undefined} io={io} nowMs={NOW} />);

  test("attention rule 1: two pending decisions render exactly one highlighted card", () => {
    const two = cards([row("a", "2026-11-07T08:00:00Z"), row("b", "2026-11-07T09:00:00Z")]);
    const ui: UiState = { ...START, view: "decide", data: deskState({ decide: { notices: [], cards: two } }) };
    const html = drawAt(ui);
    expect(html.match(/data-highlight="true"/g)?.length).toBe(1);
    expect(html.match(/data-highlight="false"/g)?.length).toBe(1);
    // The highlighted one is the oldest, and the other waits as "2 of 2".
    expect(html.indexOf('data-highlight="true"')).toBeLessThan(html.indexOf('data-highlight="false"'));
    expect(text(html)).toContain("NEEDS YOU · 1 of 2");
    expect(text(html)).toContain("Waiting · 2 of 2");
    // Moving the cursor moves the one highlight; there is still exactly one.
    const moved = drawAt({ ...ui, cursor: 1 });
    expect(moved.match(/data-highlight="true"/g)?.length).toBe(1);
    expect(text(moved)).toContain("NEEDS YOU · 2 of 2");
    // Only the highlighted card has the filled Accept button.
    expect(moved.match(/class="primary"[^>]*data-choice="accept"/g)?.length).toBe(1);
  });

  test("attention rule 4: a mix of events gives the right counts and order without moving focus", () => {
    const mixed = cards([row("new", "2026-11-07T11:30:00Z"), row("old", "2026-11-07T06:00:00Z"), row("held", "2026-11-07T05:00:00Z")], { held: "write the missing test" });
    const base: UiState = { ...START, view: "decide", focus: "composer", cursor: 1, composer: { ...START.composer, text: "half a thought", selStart: 4, selEnd: 9 } };
    const ui = deskReducer({ ...base, data: deskState({ decide: { notices: [], cards: [] } }) }, { type: "poll", state: deskState({ rev: "r2", decide: { notices: ["The case keeper did not answer."], cards: mixed } }) });
    // Strength 1, a count beside the view name: two are waiting, the held one is not counted.
    const found = interruptionsOf(ui.data);
    expect(found.counts.decide).toBe(2);
    expect(found.counts.today).toBe(0);
    // Strength 2, a notice: it waits in Decide and is not a card.
    expect(found.notices).toEqual(["The case keeper did not answer."]);
    // Strength 3, cards: oldest waiting first, held last.
    expect(found.cardIds).toEqual(["case-task:old", "case-task:new", "case-task:held"]);
    // Nothing moved the reader.
    expect({ focus: ui.focus, cursor: ui.cursor, composer: ui.composer, layers: ui.layers, view: ui.view }).toEqual({ focus: "composer", cursor: 1, composer: base.composer, layers: [], view: "decide" });
    const html = drawAt(ui);
    expect(html).toContain('data-count="decide"> (2)');
    expect(text(html)).toContain("Notices The case keeper did not answer.");
    expect(text(html)).toContain("waiting 6 hours");
    expect(text(html)).toContain("waiting 30 minutes");
    expect(text(html)).toContain("Held: write the missing test");
    expect(html.indexOf("case-task:old")).toBeLessThan(html.indexOf("case-task:new"));
    expect(html.indexOf("case-task:new")).toBeLessThan(html.indexOf("case-task:held"));
  });

  const sessionRow = (id: string, outcome: "matched" | "contradicted" | "not recorded", at: string): WorkData["compare"]["sessions"][number] => ({
    kind: "agent", runtime: "claude", session_id: id, first_ts: at, last_ts: at, events: 4, checks: outcome === "not recorded" ? 0 : 2, failed: outcome === "contradicted" ? 1 : 0, outcome, event_id: `e-${id}`, record_seq: 1, label: null,
  });
  const workData = (sessions: WorkData["compare"]["sessions"]): WorkData => ({
    compare: { presenting: false, selection: { source: "personal", repo: "R1", day: "2026-11-07", session: null, only: null }, sources: ["personal"], repos: [{ repo_id: "R1", path: "/work/alpha" }], sessions, view: null, label: null, notice: null, labelError: null },
    items: orderWork(sessionItems(sessions)),
    cases: { connected: false, words: "Cases are not connected, so running work cannot be shown.", items: [], unreadable: 0 },
    cost: { readout: { state: "not_configured" }, knowledge: { kind: "unknown", why: "Cases are not connected." } },
  });

  test("attention rule 8: a contradicted record is the first item in Work", () => {
    const sessions = [sessionRow("s-ok", "matched", "2026-11-07T11:00:00Z"), sessionRow("s-none", "not recorded", "2026-11-07T10:00:00Z"), sessionRow("s-bad", "contradicted", "2026-11-07T08:00:00Z")];
    expect(orderWork(sessionItems(sessions)).map((i) => i.id)).toEqual(["session:s-bad", "session:s-none", "session:s-ok"]);
    const ui: UiState = { ...START, view: "work", data: deskState(), work: workData(sessions) };
    const html = drawAt(ui);
    const items = [...html.matchAll(/data-work-item="([^"]+)"/g)].map((m) => m[1]);
    expect(items[0]).toBe("session:s-bad");
    expect(html).toContain('data-first="true"');
    // Said in plain words, not only by colour.
    expect(text(html)).toContain("Contradicted: what the agent reported does not match the independent record.");
    // The contradicted item stays first however the others arrive.
    const shuffled = workData([sessions[2]!, sessions[0]!, sessions[1]!].reverse());
    expect(shuffled.items[0]!.id).toBe("session:s-bad");
  });
});
