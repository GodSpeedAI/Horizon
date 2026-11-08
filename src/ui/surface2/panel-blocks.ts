/**
 * Agent panels, mapped onto Horizon's closed block vocabulary (stage 4).
 *
 * An agent's panel arrives in the cockpit's block format. Horizon's own grammar (`grammar.ts`) stays the one vocabulary: a block whose
 * type is not in `BLOCK_TYPES` is never drawn, and a type Horizon knows but a panel cannot draw yet is said so in words. What leaves
 * this file is a small display shape (`text`, `rows`, `question`, `unavailable`) that the desk can draw without naming any block type,
 * so no second copy of the vocabulary exists outside this directory. Text is always text: nothing here produces markup.
 */
import { ASK_INPUTS, BLOCK_TYPES, MAX_CONSEQUENCE, MAX_TEXT_ANSWER, SurfaceBlock, type AskInput, type BlockType } from "./grammar";

export { MAX_TEXT_ANSWER, type AskInput };

/** A block that passed the grammar whole (strict, with provenance). It is kept on its item, so the desk can draw it with its own drawer. */
export interface Validated {
  readonly block?: SurfaceBlock;
}

export type PanelTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface TextItem extends Validated {
  readonly kind: "text";
  readonly id: string;
  readonly tone: PanelTone;
  readonly label: string | null;
  readonly text: string;
}
export interface RowsItem extends Validated {
  readonly kind: "rows";
  readonly id: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}
export interface QuestionOption {
  readonly option_id: string;
  readonly label: string;
  /** One plain sentence on what choosing this leads to, or null. */
  readonly consequence?: string | null;
}
/**
 * One question to the person. `input` says what to draw: `select` (pick one of `options`), `multiselect` (pick one or more),
 * `confirm` (Yes / No, no options) or `text` (one line, at most `MAX_TEXT_ANSWER` characters, no options).
 * `withdrawn` is set when the agent took the question back; the reason is shown in its place.
 */
export interface QuestionItem extends Validated {
  readonly kind: "question";
  readonly id: string;
  /** Missing means `select`. `questionOf` always sets it. */
  readonly input?: AskInput;
  readonly question: string;
  readonly why_needed: string;
  readonly options: readonly QuestionOption[];
  /** A short fingerprint of the question text, options, consequences and input kind, made when the agent put it up. */
  readonly version?: string;
  /** The step or decision this answer settles, as the agent named it, or null. */
  readonly resolves?: string | null;
  readonly answered: { readonly outcome: string; readonly value: unknown; readonly note: string | null; readonly routed_as?: string | null } | null;
  readonly withdrawn?: { readonly reason: string } | null;
  /** The agent that first put this question up (the agent door's name for it). Set once and never changed by a later put. */
  readonly asked_by?: string | null;
  /** The key id of the agent that put the question up. Only that key reads its answers or routes or withdraws the question. */
  readonly asked_by_key?: string | null;
  /** Earlier answers the person put off ("Not yet") before the agent asked again. Oldest first. */
  readonly earlier?: readonly { readonly outcome: string; readonly value: unknown; readonly note: string | null }[];
}
export interface UnavailableItem extends Validated {
  readonly kind: "unavailable";
  readonly id: string;
}
export type PanelItem = TextItem | RowsItem | QuestionItem | UnavailableItem;

const TONE: Readonly<Record<string, PanelTone>> = { note: "neutral", ok: "success", warning: "warning", danger: "danger", unknown: "neutral", neutral: "neutral", info: "info", success: "success" };
export const toneOf = (value: unknown): PanelTone => TONE[String(value)] ?? "neutral";

const ID = /^[a-z][a-z0-9_-]{0,63}$/;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const clip = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : v === null || v === undefined ? "" : String(v).slice(0, max));

/** A short, steady fingerprint (53 bits, 14 hex characters) of what the person is asked to agree to: the words, the options, what each one does, and how they answer. */
export function questionVersion(q: { readonly question: string; readonly input?: string; readonly options: readonly QuestionOption[] }): string {
  const text = JSON.stringify([q.question, q.input ?? "select", q.options.map((o) => [o.option_id, o.label, o.consequence ?? null])]);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** A question needs its words. Select and multiselect need 2 to 8 options; confirm and text take none. The person can always put it off or cancel it instead. */
export function questionOf(raw: Record<string, unknown>, id: string): QuestionItem | null {
  const input: AskInput = raw.input === undefined ? "select" : (ASK_INPUTS.find((k) => k === raw.input) ?? "select");
  if (raw.input !== undefined && !ASK_INPUTS.some((k) => k === raw.input)) return null;
  const listed = input === "select" || input === "multiselect";
  const options: QuestionOption[] = listed && Array.isArray(raw.options)
    ? raw.options.flatMap((o) => (isRec(o) && typeof o.option_id === "string" && ID.test(o.option_id) ? [{ option_id: o.option_id, label: clip(o.label, 120), consequence: typeof o.consequence === "string" && o.consequence.trim() !== "" ? clip(o.consequence, MAX_CONSEQUENCE) : null }] : [])).slice(0, 8)
    : [];
  if (typeof raw.question !== "string" || raw.question.trim() === "" || (listed && options.length < 2)) return null;
  const resolves = typeof raw.resolves === "string" && raw.resolves.trim() !== "" ? clip(raw.resolves, 128) : null;
  const question = clip(raw.question, 2048);
  return { kind: "question", id, input, question, why_needed: clip(raw.why_needed, 2048), options, version: questionVersion({ question, input, options }), resolves, answered: null, withdrawn: null };
}

/** How a block a panel can draw is shown. The keys are checked against the grammar's own list below. */
const DRAWN: Partial<Record<BlockType, (raw: Record<string, unknown>, id: string) => PanelItem | null>> = {
  callout: (raw, id) => ({ kind: "text", id, tone: toneOf(raw.tone), label: null, text: clip(raw.text ?? raw.body ?? raw.label, 2048) }),
  metric: (raw, id) => ({ kind: "text", id, tone: "neutral", label: clip(raw.label, 80), text: clip(raw.value ?? raw.text, 120) }),
  document: (raw, id) => ({ kind: "text", id, tone: "neutral", label: clip(raw.title, 120) || null, text: clip(raw.text ?? raw.body, 4000) }),
  table: (raw, id) => {
    const rows = Array.isArray(raw.rows) ? raw.rows.slice(0, 50).map((row) => (Array.isArray(row) ? row.slice(0, 12).map((c) => clip(c, 200)) : isRec(row) ? Object.values(row).slice(0, 12).map((c) => clip(c, 200)) : [clip(row, 200)])) : [];
    const columns = Array.isArray(raw.columns) ? raw.columns.slice(0, 12).map((c) => clip(isRec(c) ? (c.label ?? c.key) : c, 60)) : [];
    return { kind: "rows", id, columns, rows };
  },
  ask: (raw, id) => questionOf(raw, id),
};

/** One cockpit block as a panel item. Anything outside the grammar, or not drawable here, becomes `unavailable`. A block that passes the grammar whole is kept on the item as `block`. */
export function itemOf(raw: unknown, index: number): PanelItem {
  const fallback = `block_${index + 1}`;
  if (!isRec(raw)) return { kind: "unavailable", id: fallback };
  const id = typeof raw.id === "string" && ID.test(raw.id) ? raw.id : fallback;
  const type = BLOCK_TYPES.find((t) => t === raw.type);
  const draw = type === undefined ? undefined : DRAWN[type];
  const item = draw?.(raw, id) ?? { kind: "unavailable" as const, id };
  const checked = type === undefined ? null : SurfaceBlock.safeParse(raw);
  if (checked?.success !== true) return item;
  // The kept block draws with the grammar's own drawer. An item the display shapes could not make (a tree, a graph) is still kept.
  return { ...item, block: checked.data };
}
