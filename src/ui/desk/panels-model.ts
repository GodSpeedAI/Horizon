/**
 * Agent panels in Horizon's own format (stage 4). An agent's tools (`show_surface`, `ask_human`, `arrange`, `annotate`,
 * `read_responses`) and the person's operations (`human.answer`, `human.pin`, `human.close`, `human.open`) come from the cockpit
 * protocol. They are mapped here onto a small set of Horizon blocks named like the grammar's 15 (callout, metric, table, document, ask).
 * Anything else an agent sends becomes one plain sentence saying it cannot be drawn. Text is only ever shown as text.
 *
 * The state is a plain value and every change returns a new one, so what an agent sent can be tested without a screen.
 */
export const MAX_OPEN_PANELS = 8;

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";
export type PanelBlock =
  | { readonly type: "callout"; readonly id: string; readonly tone: Tone; readonly text: string }
  | { readonly type: "metric"; readonly id: string; readonly label: string; readonly value: string }
  | { readonly type: "table"; readonly id: string; readonly columns: readonly string[]; readonly rows: readonly (readonly string[])[] }
  | { readonly type: "document"; readonly id: string; readonly title: string; readonly text: string }
  | { readonly type: "ask"; readonly id: string; readonly question: string; readonly why_needed: string; readonly options: readonly { readonly option_id: string; readonly label: string }[]; readonly answered: { readonly outcome: string; readonly value: unknown; readonly note: string | null } | null }
  | { readonly type: "unsupported"; readonly id: string; readonly kind: string };

export type AskBlock = Extract<PanelBlock, { readonly type: "ask" }>;
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

const TONE: Readonly<Record<string, Tone>> = { note: "neutral", ok: "success", warning: "warning", danger: "danger", unknown: "neutral", neutral: "neutral", info: "info", success: "success" };
const ID = /^[a-z][a-z0-9_-]{0,63}$/;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : v === null || v === undefined ? "" : String(v).slice(0, max));

/** Maps one cockpit block onto a Horizon block. A block this panel cannot draw becomes `unsupported`, never raw content. */
export function blockOf(raw: unknown, index: number): PanelBlock {
  const fallbackId = `block_${index + 1}`;
  if (!isRec(raw)) return { type: "unsupported", id: fallbackId, kind: "unknown" };
  const id = typeof raw.id === "string" && ID.test(raw.id) ? raw.id : fallbackId;
  switch (raw.type) {
    case "callout":
      return { type: "callout", id, tone: TONE[String(raw.tone)] ?? "neutral", text: str(raw.text ?? raw.body ?? raw.label, 2048) };
    case "metric":
      return { type: "metric", id, label: str(raw.label, 80), value: str(raw.value ?? raw.text, 120) };
    case "table": {
      const rows = Array.isArray(raw.rows) ? raw.rows.slice(0, 50).map((row) => (Array.isArray(row) ? row.slice(0, 12).map((c) => str(c, 200)) : isRec(row) ? Object.values(row).slice(0, 12).map((c) => str(c, 200)) : [str(row, 200)])) : [];
      const columns = Array.isArray(raw.columns) ? raw.columns.slice(0, 12).map((c) => str(isRec(c) ? (c.label ?? c.key) : c, 60)) : [];
      return { type: "table", id, columns, rows };
    }
    case "document":
      return { type: "document", id, title: str(raw.title, 120), text: str(raw.text ?? raw.body, 4000) };
    case "ask": {
      const ask = askOf(raw, id);
      return ask ?? { type: "unsupported", id, kind: "ask" };
    }
    default:
      return { type: "unsupported", id, kind: typeof raw.type === "string" ? raw.type.slice(0, 30) : "unknown" };
  }
}

/** An ask needs a question and at least two options; the person can always defer or cancel instead. */
function askOf(raw: Record<string, unknown>, id: string): PanelBlock | null {
  const options = Array.isArray(raw.options) ? raw.options.flatMap((o) => (isRec(o) && typeof o.option_id === "string" && ID.test(o.option_id) ? [{ option_id: o.option_id, label: str(o.label, 120) }] : [])).slice(0, 8) : [];
  if (typeof raw.question !== "string" || raw.question.trim() === "" || options.length < 2) return null;
  return { type: "ask", id, question: str(raw.question, 2048), why_needed: str(raw.why_needed, 2048), options, answered: null };
}

export type AgentOp =
  | { readonly tool: "show_surface"; readonly surface: { readonly id: string; readonly title?: string; readonly step?: string | null; readonly blocks: readonly unknown[] } }
  | { readonly tool: "ask_human"; readonly panel: string; readonly ask: Record<string, unknown>; readonly step?: string | null }
  | { readonly tool: "arrange"; readonly action: { readonly op: "surface.remove"; readonly id: string } | { readonly op: "view.focus"; readonly id: string } | { readonly op: "view.place"; readonly id: string } }
  | { readonly tool: "annotate"; readonly panel: string; readonly text: string; readonly tone?: string }
  | { readonly tool: "read_responses" };

export type HumanOp =
  | { readonly op: "human.answer"; readonly panel: string; readonly ask: string; readonly outcome: "answered" | "deferred" | "cancelled"; readonly value?: unknown; readonly note?: string | null }
  | { readonly op: "human.pin"; readonly id: string; readonly pinned: boolean }
  | { readonly op: "human.close"; readonly id: string }
  | { readonly op: "human.open"; readonly template: string; readonly title?: string; readonly step?: string | null };

export type Refusal = { readonly ok: false; readonly code: "SCHEMA" | "NOT_FOUND" | "CAP" | "PINNED"; readonly message: string };
export type Reduced = { readonly state: Panels; readonly result: { readonly ok: true; readonly panel: string | null } | Refusal };

const refuse = (state: Panels, code: Refusal["code"], message: string): Reduced => ({ state, result: { ok: false, code, message } });
const same = (a: string, b: string): boolean => a === b;

/**
 * Adds a new panel, never past the cap. At the cap the oldest panel that is not pinned makes room; if every panel is pinned the new
 * one is refused and the person is told to close one.
 */
function admit(state: Panels, panel: Panel): Reduced {
  let open = [...state.open];
  while (open.length >= state.max) {
    const oldest = open.findIndex((p) => !p.pinned);
    if (oldest < 0) return refuse(state, "CAP", `${state.max} panels are open and all of them are pinned. Close one to make room.`);
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
      const blocks = s.blocks.slice(0, 64).map(blockOf);
      const existing = state.open.find((p) => same(p.id, s.id));
      if (existing !== undefined) {
        // An update keeps the panel where it is and keeps it pinned; answers already given stay on their questions.
        const before = (id: string): AskBlock | undefined => existing.blocks.find((o): o is AskBlock => o.type === "ask" && o.id === id);
        const kept = blocks.map((b) => (b.type === "ask" ? { ...b, answered: before(b.id)?.answered ?? null } : b));
        return { state: replace(state, s.id, (p) => ({ ...p, title: str(s.title, 120) || p.title, step: s.step === undefined ? p.step : (s.step ?? null), blocks: kept })), result: { ok: true, panel: s.id } };
      }
      return admit(state, { id: s.id, title: str(s.title, 120) || s.id, step: s.step ?? null, pinned: false, blocks, notes: [] });
    }
    case "ask_human": {
      const panel = state.open.find((p) => same(p.id, op.panel));
      const id = typeof op.ask.id === "string" && ID.test(op.ask.id) ? op.ask.id : "";
      const block = id === "" ? null : askOf(op.ask, id);
      if (block === null) return refuse(state, "SCHEMA", "A question needs an id, the question, and at least two options.");
      if (panel === undefined) return admit(state, { id: op.panel, title: op.panel, step: op.step ?? null, pinned: false, blocks: [block], notes: [] });
      return { state: replace(state, panel.id, (p) => ({ ...p, step: op.step === undefined ? p.step : (op.step ?? null), blocks: [...p.blocks.filter((b) => b.id !== block.id), block] })), result: { ok: true, panel: panel.id } };
    }
    case "annotate": {
      if (!state.open.some((p) => same(p.id, op.panel))) return refuse(state, "NOT_FOUND", "That panel is not open.");
      const text = str(op.text, 400);
      if (text === "") return refuse(state, "SCHEMA", "A note needs some words.");
      return { state: replace(state, op.panel, (p) => ({ ...p, notes: [...p.notes, { text, tone: TONE[String(op.tone)] ?? "neutral" }].slice(-20) })), result: { ok: true, panel: op.panel } };
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
      const ask = panel?.blocks.find((b): b is AskBlock => b.type === "ask" && b.id === op.ask);
      if (panel === undefined || ask === undefined) return refuse(state, "NOT_FOUND", "That question is no longer open.");
      if (ask.answered !== null) return refuse(state, "SCHEMA", "That question was already answered.");
      return { state: replace(state, panel.id, (p) => ({ ...p, blocks: p.blocks.map((b) => (b.type === "ask" && b.id === ask.id ? { ...b, answered: { outcome: op.outcome, value: op.value ?? null, note: op.note ?? null } } : b)) })), result: { ok: true, panel: panel.id } };
    }
  }
}
