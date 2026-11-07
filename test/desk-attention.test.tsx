/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SHOWN_STATES, START, STATES, STATE_WORDS, checkSummary, deskReducer, newCount, onScroll, shownCount, stepCheck, FEED_START, type Action, type UiState } from "../src/ui/desk/attention.ts";
import { Desk, type DeskIo } from "../src/ui/desk/Desk.tsx";
import { StateWord } from "../src/ui/desk/StateWord.tsx";
import { deskState, note } from "./support/desk-fixture.ts";

const io: DeskIo = { saveNote: async () => ({ ok: false, message: "not used" }), setPresenting: () => undefined };
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
    expect(html).toContain("Rules: connected");
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
});
