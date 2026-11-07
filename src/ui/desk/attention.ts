/**
 * The attention rules of design 5.2 as pure functions and one reducer (annex 5.2). Nothing here touches the page.
 * Rule 2: a poll changes `data` and nothing else. Rule 3: Escape closes one layer and returns focus to where it was.
 * Rule 5: a list you scrolled up in is frozen; new items are counted, not shown. Rule 6: states are words.
 * Rule 7: no record means "not recorded", counted as unchecked. Rule 9: a pin keeps its content and says when its source moved.
 */
import { NOT_RECORDED } from "../workspace/compare-model.ts";
import type { DeskState, InspectionAnswer, NextState, RecordPin, SearchResult, ViewId } from "./model.ts";
import type { WorkData } from "./work-build.ts";

// ---- Rule 6: every state in words (design section 2) ----
export const STATES = ["requested", "allowed", "queued", "running", "done", "recorded", "checked", "accepted"] as const;
export type WorkState = (typeof STATES)[number];
export const SHOWN_STATES = ["preview", "changed since you looked", "not recorded"] as const;
export type ShownState = (typeof SHOWN_STATES)[number];
export type AnyState = WorkState | ShownState;

/** The sentence-case word shown for each state. Colour may repeat it; it never replaces it. */
export const STATE_WORDS: Readonly<Record<AnyState, string>> = {
  requested: "Requested",
  allowed: "Allowed",
  queued: "Queued",
  running: "Running",
  done: "Done",
  recorded: "Recorded",
  checked: "Checked",
  accepted: "Accepted",
  preview: "Preview: not real yet",
  "changed since you looked": "Changed since you looked",
  "not recorded": "Not recorded",
};

// ---- Rule 7: missing data is "not recorded", never 0 and never "passed" ----
export interface StepRecord {
  readonly name: string;
  /** What the record keeper holds about this step; null when it holds nothing. */
  readonly record: { readonly passed: boolean } | null;
}
export interface StepCheck {
  readonly name: string;
  readonly words: string;
  readonly counted: "unchecked" | "passed" | "failed";
}

/** Notes are accepted as an argument on purpose and ignored: a note, tag or link cannot make a check pass. */
export function stepCheck(step: StepRecord, _notes: readonly unknown[] = []): StepCheck {
  if (step.record === null) return { name: step.name, words: NOT_RECORDED, counted: "unchecked" };
  return step.record.passed ? { name: step.name, words: "passed", counted: "passed" } : { name: step.name, words: "failed", counted: "failed" };
}

export function checkSummary(steps: readonly StepRecord[], notes: readonly unknown[] = []): { readonly unchecked: number; readonly passed: number; readonly failed: number; readonly words: string } {
  const checks = steps.map((s) => stepCheck(s, notes));
  const count = (kind: StepCheck["counted"]): number => checks.filter((c) => c.counted === kind).length;
  const [unchecked, passed, failed] = [count("unchecked"), count("passed"), count("failed")];
  return { unchecked, passed, failed, words: `${passed} passed, ${failed} failed, ${unchecked} unchecked` };
}

// ---- Rule 5: never scroll away from what you are reading ----
export interface Feed {
  readonly scrolledUp: boolean;
  /** How many items were shown when the reader scrolled up. */
  readonly frozenCount: number;
}
export const FEED_START: Feed = { scrolledUp: false, frozenCount: 0 };

export function onScroll(feed: Feed, position: { readonly atBottom: boolean }, total: number): Feed {
  if (position.atBottom) return FEED_START;
  return feed.scrolledUp ? feed : { scrolledUp: true, frozenCount: total };
}
export function shownCount(feed: Feed, total: number): number {
  return feed.scrolledUp ? Math.min(feed.frozenCount, total) : total;
}
export function newCount(feed: Feed, total: number): number {
  return Math.max(0, total - shownCount(feed, total));
}

// ---- Rule 9: what you pin stays put ----
export interface Pin {
  readonly id: string;
  readonly kind: "note" | "case";
  readonly title: string;
  readonly content: string;
  readonly pinned_at: string;
  /** The source's version when it was pinned (a note's revision, a case's purpose). */
  readonly source_rev: string;
  readonly changed: boolean;
}
export function pinItem(pins: readonly Pin[], item: Omit<Pin, "pinned_at" | "changed">, now: Date): Pin[] {
  return [...pins.filter((p) => p.id !== item.id), { ...item, pinned_at: now.toISOString(), changed: false }];
}
export function unpin(pins: readonly Pin[], id: string): Pin[] {
  return pins.filter((p) => p.id !== id);
}
/** Marks a pin whose source moved on. The pinned content is never rewritten: unpin and pin again to take the new wording. */
export function checkPins(pins: readonly Pin[], currentRev: (id: string) => string | null): Pin[] {
  return pins.map((pin) => {
    const now = currentRev(pin.id);
    return now !== null && now !== pin.source_rev ? { ...pin, changed: true } : pin;
  });
}

// ---- Rules 2, 3: the reducer ----
export type LayerKind = "quick" | "keys" | "history";
export interface Layer {
  readonly kind: LayerKind;
  readonly returnFocus: string;
}
export type Mode = "write" | "find" | "ask";
export const MODES: readonly Mode[] = ["write", "find", "ask"];

// ---- Rule 4: three strengths of interruption ----
export interface Interruptions {
  /** A count beside a view name. */
  readonly counts: Readonly<Record<ViewId, number>>;
  /** Notices wait in Decide; they never take the screen. */
  readonly notices: readonly string[];
  /** Decision cards in the order shown: waiting, oldest first, then held. Each shows its age. */
  readonly cardIds: readonly string[];
}
export function interruptionsOf(data: DeskState | null): Interruptions {
  const cards = data?.decide.cards ?? [];
  return {
    counts: { today: 0, explore: 0, decide: cards.filter((c) => c.held === null).length, work: 0 },
    notices: data?.decide.notices ?? [],
    cardIds: cards.map((c) => c.id),
  };
}

/** What the operator is looking at before confirming a choice on a decision card. */
export interface OpenDecision {
  readonly cardId: string;
  readonly choice: "accept" | "reject" | "hold";
  /** The preview code that was on screen when the preview opened. The confirm button works only while the card still has this code. */
  readonly code: string;
  readonly records: readonly RecordPin[];
  readonly reason: string;
  readonly busy: boolean;
  /** A refusal or an error from the last attempt, in plain words. */
  readonly problem: string | null;
}
export interface DecideNote {
  readonly ok: boolean;
  readonly message: string;
}
/** The one move the first-run path offers, as the fields a plain form posts. `null`: nothing can be submitted from here. */
export interface FirstMove {
  readonly action_id: string;
  readonly operation: string;
  readonly frame_id: string;
  readonly frame_revision: string;
  readonly focus: string;
  readonly label: string;
}
export interface WorkQuery {
  readonly source: string | null;
  readonly repo: string | null;
  readonly day: string | null;
  readonly session: string | null;
  readonly only: "contradicted" | null;
}

export interface UiState {
  readonly view: ViewId;
  /** The day the Today view shows; null means today. */
  readonly day: string | null;
  readonly cursor: number;
  readonly selection: string | null;
  readonly layers: readonly Layer[];
  /** A logical focus target: "list", "composer", "nav", "layer:<kind>" or "item:<id>". The page applies it. */
  readonly focus: string;
  readonly composer: { readonly mode: Mode; readonly text: string; readonly selStart: number; readonly selEnd: number };
  readonly feed: Feed;
  readonly find: { readonly q: string; readonly day: string | null; readonly tag: string | null };
  readonly results: SearchResult | null;
  readonly pins: readonly Pin[];
  readonly notice: string | null;
  readonly editing: string | null;
  readonly data: DeskState | null;
  readonly decision: OpenDecision | null;
  readonly decideNote: DecideNote | null;
  readonly work: WorkData | null;
  readonly workQuery: WorkQuery;
  /** `undefined` until asked for. */
  readonly firstMove?: FirstMove | null;
  /** The next decision from the shared frame; null until read. */
  readonly next: NextState | null;
  /** The last debugger answer asked for in the inspector. */
  readonly inspection: { readonly operation: string; readonly query: string; readonly busy: boolean; readonly answer: InspectionAnswer | null; readonly problem: string | null } | null;
}

export const START: UiState = {
  view: "today",
  day: null,
  cursor: 0,
  selection: null,
  layers: [],
  focus: "list",
  composer: { mode: "write", text: "", selStart: 0, selEnd: 0 },
  feed: FEED_START,
  find: { q: "", day: null, tag: null },
  results: null,
  pins: [],
  notice: null,
  editing: null,
  data: null,
  decision: null,
  decideNote: null,
  work: null,
  workQuery: { source: null, repo: null, day: null, session: null, only: null },
  next: null,
  inspection: null,
};

export type Action =
  | { readonly type: "poll"; readonly state: DeskState; readonly now?: Date }
  | { readonly type: "view"; readonly view: ViewId }
  | { readonly type: "day"; readonly day: string | null }
  | { readonly type: "cursor"; readonly delta: number; readonly length: number }
  | { readonly type: "select"; readonly id: string | null }
  | { readonly type: "open-layer"; readonly kind: LayerKind }
  | { readonly type: "escape" }
  | { readonly type: "focus"; readonly target: string }
  | { readonly type: "mode"; readonly mode: Mode }
  | { readonly type: "cycle-mode" }
  | { readonly type: "typing"; readonly text: string; readonly selStart: number; readonly selEnd: number }
  | { readonly type: "sent" }
  | { readonly type: "scrolled"; readonly atBottom: boolean; readonly total: number }
  | { readonly type: "jump-to-new" }
  | { readonly type: "find"; readonly q: string; readonly day?: string | null; readonly tag?: string | null }
  | { readonly type: "results"; readonly results: SearchResult }
  | { readonly type: "pin"; readonly pin: Omit<Pin, "pinned_at" | "changed">; readonly now: Date }
  | { readonly type: "unpin"; readonly id: string }
  | { readonly type: "pins"; readonly pins: readonly Pin[] }
  | { readonly type: "notice"; readonly text: string | null }
  | { readonly type: "edit"; readonly id: string | null }
  | { readonly type: "draft"; readonly text: string }
  | { readonly type: "preview-open"; readonly cardId: string; readonly choice: OpenDecision["choice"] }
  | { readonly type: "preview-close" }
  | { readonly type: "reason"; readonly text: string }
  | { readonly type: "decision-busy" }
  | { readonly type: "decision-result"; readonly ok: boolean; readonly message: string }
  | { readonly type: "first-move"; readonly move: FirstMove | null }
  | { readonly type: "next"; readonly next: NextState }
  | { readonly type: "inspect-start"; readonly operation: string; readonly query: string }
  | { readonly type: "inspect-result"; readonly answer: InspectionAnswer | null; readonly problem: string | null }
  | { readonly type: "work"; readonly work: WorkData }
  | { readonly type: "work-query"; readonly patch: Partial<WorkQuery> };

export function currentRevOf(state: DeskState | null): (id: string) => string | null {
  return (id) => {
    if (state === null) return null;
    if (id.startsWith("case:")) return state.cases.find((c) => c.case_ref === id)?.purpose ?? null;
    const note = [...state.notes, ...state.caseNotes, ...(state.selected ? [state.selected.note] : [])].find((n) => n.note_id === id);
    return note ? String(note.rev) : null;
  };
}

export function deskReducer(ui: UiState, action: Action): UiState {
  switch (action.type) {
    case "poll":
      // Rule 2: an update from outside changes the numbers, list ends and inspector (all derived from `data`) and nothing else.
      return { ...ui, data: action.state, pins: checkPins(ui.pins, currentRevOf(action.state)) };
    case "view":
      return { ...ui, view: action.view, cursor: 0, feed: FEED_START, focus: "list", decision: null };
    case "day":
      return { ...ui, view: "today", day: action.day, cursor: 0, feed: FEED_START, focus: "list" };
    case "cursor": {
      if (action.length === 0) return ui;
      const next = Math.min(action.length - 1, Math.max(0, ui.cursor + action.delta));
      return { ...ui, cursor: next, focus: "list" };
    }
    case "select":
      return { ...ui, selection: action.id };
    case "open-layer":
      return { ...ui, layers: [...ui.layers, { kind: action.kind, returnFocus: ui.focus }], focus: `layer:${action.kind}` };
    case "escape": {
      // Rule 3: one layer per press, and focus goes back to where it was before that layer opened.
      if (ui.layers.length > 0) {
        const top = ui.layers[ui.layers.length - 1]!;
        return { ...ui, layers: ui.layers.slice(0, -1), focus: top.returnFocus };
      }
      if (ui.decision !== null) return { ...ui, decision: null, focus: "list" };
      if (ui.editing !== null) return { ...ui, editing: null, focus: "list" };
      if (ui.focus === "composer") return { ...ui, focus: "list" };
      return ui;
    }
    case "focus":
      return { ...ui, focus: action.target };
    case "mode":
      return { ...ui, composer: { ...ui.composer, mode: action.mode } };
    case "cycle-mode":
      return { ...ui, composer: { ...ui.composer, mode: MODES[(MODES.indexOf(ui.composer.mode) + 1) % MODES.length]! } };
    case "typing":
      return { ...ui, composer: { ...ui.composer, text: action.text, selStart: action.selStart, selEnd: action.selEnd } };
    case "draft":
      return { ...ui, composer: { ...ui.composer, text: action.text, selStart: action.text.length, selEnd: action.text.length } };
    case "sent":
      return { ...ui, composer: { ...ui.composer, text: "", selStart: 0, selEnd: 0 }, notice: null };
    case "scrolled":
      return { ...ui, feed: onScroll(ui.feed, { atBottom: action.atBottom }, action.total) };
    case "jump-to-new":
      return { ...ui, feed: FEED_START };
    case "find":
      return { ...ui, view: "explore", cursor: 0, feed: FEED_START, find: { q: action.q, day: action.day ?? null, tag: action.tag ?? null } };
    case "results":
      return { ...ui, results: action.results };
    case "pin":
      return { ...ui, pins: pinItem(ui.pins, action.pin, action.now) };
    case "unpin":
      return { ...ui, pins: unpin(ui.pins, action.id) };
    case "pins":
      return { ...ui, pins: action.pins };
    case "notice":
      return { ...ui, notice: action.text };
    case "edit":
      return { ...ui, editing: action.id };
    case "preview-open": {
      // Opens a preview of what a choice will do. Nothing is decided here. Only the operator can open one (A, R, H or a click).
      const card = ui.data?.decide.cards.find((c) => c.id === action.cardId);
      if (!card) return ui;
      return { ...ui, decision: { cardId: card.id, choice: action.choice, code: card.preview.code, records: card.preview.records, reason: "", busy: false, problem: null }, decideNote: null, focus: "decision" };
    }
    case "preview-close":
      return { ...ui, decision: null, focus: "list" };
    case "reason":
      return ui.decision === null ? ui : { ...ui, decision: { ...ui.decision, reason: action.text } };
    case "decision-busy":
      return ui.decision === null ? ui : { ...ui, decision: { ...ui.decision, busy: true, problem: null } };
    case "decision-result":
      if (action.ok) return { ...ui, decision: null, decideNote: { ok: true, message: action.message }, focus: "list" };
      return ui.decision === null ? { ...ui, decideNote: { ok: false, message: action.message } } : { ...ui, decision: { ...ui.decision, busy: false, problem: action.message } };
    case "next":
      return { ...ui, next: action.next };
    case "inspect-start":
      return { ...ui, inspection: { operation: action.operation, query: action.query, busy: true, answer: null, problem: null } };
    case "inspect-result":
      return ui.inspection === null ? ui : { ...ui, inspection: { ...ui.inspection, busy: false, answer: action.answer, problem: action.problem } };
    case "first-move":
      return { ...ui, firstMove: action.move };
    case "work":
      return { ...ui, work: action.work };
    case "work-query":
      return { ...ui, workQuery: { ...ui.workQuery, ...action.patch } };
  }
}
