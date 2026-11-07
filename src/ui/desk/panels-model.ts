/**
 * Agent panels in Horizon's own format (stage 4). An agent's tools (`show_surface`, `ask_human`, `arrange`, `annotate`,
 * `read_responses`) and the person's operations (`human.answer`, `human.pin`, `human.close`, `human.open`) come from the cockpit
 * protocol. They are mapped onto Horizon's own block vocabulary.
 * The mapping itself lives with the grammar (`surface2/panel-blocks.ts`); anything else an agent sends becomes one plain sentence saying it cannot be drawn. Text is only ever shown as text.
 *
 * The state is a plain value and every change returns a new one, so what an agent sent can be tested without a screen.
 */
export const MAX_OPEN_PANELS = 8;

import { answerFor, MIN_ROUTED_AS, MAX_ROUTED_AS, TOO_SHORT_ROUTE } from "../../capabilities/panel-answers.ts";
import { clip, itemOf, questionOf, toneOf, type PanelItem, type PanelTone, type QuestionItem } from "../surface2/panel-blocks.ts";

export type Tone = PanelTone;
export type PanelBlock = PanelItem;
export type AskBlock = QuestionItem;
export interface PanelNote {
  readonly text: string;
  readonly tone: Tone;
}
export interface Panel {
  readonly id: string;
  readonly title: string;
  /** The step this panel is about. Answers given here bear on it. */
  readonly step: string | null;
  readonly pinned: boolean;
  readonly blocks: readonly PanelBlock[];
  readonly notes: readonly PanelNote[];
}
export interface Panels {
  readonly open: readonly Panel[];
  readonly max: number;
}
export const NO_PANELS: Panels = { open: [], max: MAX_OPEN_PANELS };

const ID = /^[a-z][a-z0-9_-]{0,63}$/;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = clip;

export type AgentOp =
  | { readonly tool: "show_surface"; readonly surface: { readonly id: string; readonly title?: string; readonly step?: string | null; readonly blocks: readonly unknown[] } }
  | { readonly tool: "ask_human"; readonly panel: string; readonly ask: Record<string, unknown>; readonly step?: string | null }
  | { readonly tool: "arrange"; readonly action: { readonly op: "surface.remove"; readonly id: string } | { readonly op: "view.focus"; readonly id: string } | { readonly op: "view.place"; readonly id: string } }
  | { readonly tool: "annotate"; readonly panel: string; readonly text: string; readonly tone?: string }
  | { readonly tool: "read_responses" }
  /** The agent takes a question back, with the reason (1 to 200 characters) shown in its place. Only a question nobody answered. */
  | { readonly tool: "ask.withdraw"; readonly panel_id: string; readonly ask_id: string; readonly reason: string }
  /** The agent says where an answer went (`routed_as`, at least 6 characters). This is the only thing that closes an answer. */
  | { readonly tool: "answer.route"; readonly panel_id: string; readonly ask_id: string; readonly routed_as: string };

export const MAX_WITHDRAW_REASON = 200;
export const QUESTION_CHANGED = "This question changed after you looked at it. Look again, then answer.";
export const ANSWERED_CANNOT_CHANGE = "The person already answered this question, so it cannot be changed. Ask a new question with a different id.";
/** A question the person answered (not put off, not skipped) is an agreement to those exact words. */
const agreedTo = (b: AskBlock | undefined): b is AskBlock => b !== undefined && b.answered !== null && b.answered.outcome === "answered";
export const ALL_WAITING = "Eight panels are waiting for answers. Answer or skip one first.";
/** A question still waiting for the person: not answered (not even put off) and not withdrawn. */
export const isOpenAsk = (b: PanelBlock): boolean => b.kind === "question" && b.answered === null && (b.withdrawn ?? null) === null;
export const hasOpenAsk = (p: Panel): boolean => p.blocks.some(isOpenAsk);

export type HumanOp =
  /** `version` is the version of the question the person was looking at. When it is sent and no longer matches, the answer is refused. */
  | { readonly op: "human.answer"; readonly panel: string; readonly ask: string; readonly outcome: "answered" | "deferred" | "cancelled"; readonly value?: unknown; readonly note?: string | null; readonly version?: string }
  | { readonly op: "human.pin"; readonly id: string; readonly pinned: boolean }
  | { readonly op: "human.close"; readonly id: string }
  | { readonly op: "human.open"; readonly template: string; readonly title?: string; readonly step?: string | null };

export type Refusal = { readonly ok: false; readonly code: "SCHEMA" | "NOT_FOUND" | "CAP" | "PINNED"; readonly message: string };
export type Reduced = { readonly state: Panels; readonly result: { readonly ok: true; readonly panel: string | null } | Refusal };

const refuse = (state: Panels, code: Refusal["code"], message: string): Reduced => ({ state, result: { ok: false, code, message } });
const same = (a: string, b: string): boolean => a === b;

/**
 * Adds a new panel, never past the cap. At the cap the oldest panel that is neither pinned nor waiting for an answer makes room.
 * A panel with an open question is never removed to make room. If none can go, the new one is refused in words.
 */
function admit(state: Panels, panel: Panel): Reduced {
  let open = [...state.open];
  while (open.length >= state.max) {
    const oldest = open.findIndex((p) => !p.pinned && !hasOpenAsk(p));
    if (oldest < 0) return open.every(hasOpenAsk) ? refuse(state, "CAP", ALL_WAITING) : refuse(state, "CAP", `${state.max} panels are open and all of them are pinned or waiting for an answer. Close or answer one to make room.`);
    open = open.filter((_, i) => i !== oldest);
  }
  return { state: { ...state, open: [...open, panel] }, result: { ok: true, panel: panel.id } };
}

const replace = (state: Panels, id: string, change: (p: Panel) => Panel): Panels => ({ ...state, open: state.open.map((p) => (same(p.id, id) ? change(p) : p)) });

export function reduceAgent(state: Panels, op: AgentOp): Reduced {
  switch (op.tool) {
    case "read_responses":
      return { state, result: { ok: true, panel: null } };
    case "show_surface": {
      const s = op.surface;
      if (!isRec(s) || typeof s.id !== "string" || !ID.test(s.id) || !Array.isArray(s.blocks)) return refuse(state, "SCHEMA", "A panel needs an id and a list of blocks.");
      const blocks = s.blocks.slice(0, 64).map(itemOf);
      const existing = state.open.find((p) => same(p.id, s.id));
      if (existing !== undefined) {
        // An update keeps the panel where it is and keeps it pinned; answers already given stay on their questions.
        const before = (id: string): AskBlock | undefined => existing.blocks.find((o): o is AskBlock => o.kind === "question" && o.id === id);
        // A question the person answered cannot be reworded under them; one they put off or skipped starts again when it changes.
        for (const b of blocks) if (b.kind === "question" && agreedTo(before(b.id)) && before(b.id)?.version !== b.version) return refuse(state, "SCHEMA", ANSWERED_CANNOT_CHANGE);
        const kept = blocks.map((b) => {
          if (b.kind !== "question") return b;
          const old = before(b.id);
          return old !== undefined && old.version === b.version ? { ...b, answered: old.answered, withdrawn: old.withdrawn ?? null } : b;
        });
        return { state: replace(state, s.id, (p) => ({ ...p, title: str(s.title, 120) || p.title, step: s.step === undefined ? p.step : (s.step ?? null), blocks: kept })), result: { ok: true, panel: s.id } };
      }
      return admit(state, { id: s.id, title: str(s.title, 120) || s.id, step: s.step ?? null, pinned: false, blocks, notes: [] });
    }
    case "ask_human": {
      const panel = state.open.find((p) => same(p.id, op.panel));
      const id = typeof op.ask.id === "string" && ID.test(op.ask.id) ? op.ask.id : "";
      const block = id === "" ? null : questionOf(op.ask, id);
      if (block === null) return refuse(state, "SCHEMA", "A question needs an id, the question, and (for pick-one and pick-several) at least two options.");
      if (panel === undefined) return admit(state, { id: op.panel, title: op.panel, step: op.step ?? null, pinned: false, blocks: [block], notes: [] });
      const old = panel.blocks.find((b): b is AskBlock => b.kind === "question" && b.id === block.id);
      if (agreedTo(old) && old.version !== block.version) return refuse(state, "SCHEMA", ANSWERED_CANNOT_CHANGE);
      // The very same question again keeps what the person said; a changed one starts again.
      const next = old !== undefined && old.version === block.version ? { ...block, answered: old.answered, withdrawn: old.withdrawn ?? null } : block;
      return { state: replace(state, panel.id, (p) => ({ ...p, step: op.step === undefined ? p.step : (op.step ?? null), blocks: [...p.blocks.filter((b) => b.id !== block.id), next] })), result: { ok: true, panel: panel.id } };
    }
    case "annotate": {
      if (!state.open.some((p) => same(p.id, op.panel))) return refuse(state, "NOT_FOUND", "That panel is not open.");
      const text = str(op.text, 400);
      if (text === "") return refuse(state, "SCHEMA", "A note needs some words.");
      return { state: replace(state, op.panel, (p) => ({ ...p, notes: [...p.notes, { text, tone: toneOf(op.tone) }].slice(-20) })), result: { ok: true, panel: op.panel } };
    }
    case "ask.withdraw": {
      const panel = state.open.find((p) => same(p.id, op.panel_id));
      const ask = panel?.blocks.find((b): b is AskBlock => b.kind === "question" && b.id === op.ask_id);
      if (panel === undefined || ask === undefined) return refuse(state, "NOT_FOUND", "That question is not open.");
      const reason = typeof op.reason === "string" ? op.reason.trim() : "";
      if (reason === "" || reason.length > MAX_WITHDRAW_REASON) return refuse(state, "SCHEMA", `Say why you are withdrawing it, in 1 to ${MAX_WITHDRAW_REASON} characters.`);
      if (ask.answered !== null) return refuse(state, "SCHEMA", "That question was already answered, so it cannot be withdrawn.");
      return { state: replace(state, panel.id, (p) => ({ ...p, blocks: p.blocks.map((b) => (b.kind === "question" && b.id === ask.id ? { ...b, withdrawn: { reason } } : b)) })), result: { ok: true, panel: panel.id } };
    }
    case "answer.route": {
      // The record of the answer lives in the store (`routeAnswer`); here the panel, if still open, shows where it went.
      const words = typeof op.routed_as === "string" ? op.routed_as.trim() : "";
      if (words.length < MIN_ROUTED_AS || words.length > MAX_ROUTED_AS) return refuse(state, "SCHEMA", TOO_SHORT_ROUTE);
      const panel = state.open.find((p) => same(p.id, op.panel_id));
      const ask = panel?.blocks.find((b): b is AskBlock => b.kind === "question" && b.id === op.ask_id);
      if (panel === undefined || ask === undefined || ask.answered === null) return { state, result: { ok: true, panel: op.panel_id } };
      return { state: replace(state, panel.id, (p) => ({ ...p, blocks: p.blocks.map((b) => (b.kind === "question" && b.id === ask.id && b.answered !== null ? { ...b, answered: { ...b.answered, routed_as: words } } : b)) })), result: { ok: true, panel: panel.id } };
    }
    case "arrange": {
      const target = state.open.find((p) => same(p.id, op.action.id));
      if (target === undefined) return refuse(state, "NOT_FOUND", "That panel is not open.");
      if (op.action.op === "surface.remove") {
        if (target.pinned) return refuse(state, "PINNED", "You pinned this panel, so an agent cannot remove it.");
        return { state: { ...state, open: state.open.filter((p) => !same(p.id, target.id)) }, result: { ok: true, panel: target.id } };
      }
      // Focus and placement are the person's: an agent's request changes nothing here.
      return { state, result: { ok: true, panel: target.id } };
    }
  }
}

export function reduceHuman(state: Panels, op: HumanOp): Reduced {
  switch (op.op) {
    case "human.pin":
      return state.open.some((p) => same(p.id, op.id)) ? { state: replace(state, op.id, (p) => ({ ...p, pinned: op.pinned })), result: { ok: true, panel: op.id } } : refuse(state, "NOT_FOUND", "That panel is not open.");
    case "human.close":
      return state.open.some((p) => same(p.id, op.id)) ? { state: { ...state, open: state.open.filter((p) => !same(p.id, op.id)) }, result: { ok: true, panel: op.id } } : refuse(state, "NOT_FOUND", "That panel is not open.");
    case "human.open": {
      const id = `open_${op.template.replace(/[^a-z0-9_-]/gi, "").toLowerCase().slice(0, 40) || "panel"}`;
      if (state.open.some((p) => same(p.id, id))) return { state, result: { ok: true, panel: id } };
      return admit(state, { id, title: str(op.title, 120) || op.template.slice(0, 60), step: op.step ?? null, pinned: false, blocks: [], notes: [] });
    }
    case "human.answer": {
      const panel = state.open.find((p) => same(p.id, op.panel));
      const ask = panel?.blocks.find((b): b is AskBlock => b.kind === "question" && b.id === op.ask);
      if (panel === undefined || ask === undefined) return refuse(state, "NOT_FOUND", "That question is no longer open.");
      if (op.version !== undefined && ask.version !== undefined && op.version !== ask.version) return refuse(state, "SCHEMA", QUESTION_CHANGED);
      if (ask.answered !== null) return refuse(state, "SCHEMA", "That question was already answered.");
      if ((ask.withdrawn ?? null) !== null) return refuse(state, "SCHEMA", "The agent withdrew that question.");
      // Not now and Skip carry no value; an answer must fit the kind of question.
      let value: unknown = null;
      if (op.outcome === "answered") {
        const checked = answerFor({ input: ask.input ?? "select", options: ask.options }, op.value);
        if (!checked.ok) return refuse(state, "SCHEMA", checked.message);
        value = checked.value;
      }
      return { state: replace(state, panel.id, (p) => ({ ...p, blocks: p.blocks.map((b) => (b.kind === "question" && b.id === ask.id ? { ...b, answered: { outcome: op.outcome, value: op.outcome === "answered" ? value : (op.value ?? null), note: op.note ?? null, routed_as: null } } : b)) })), result: { ok: true, panel: panel.id } };
    }
  }
}
