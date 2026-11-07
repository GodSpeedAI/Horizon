/**
 * Agent panels, mapped onto Horizon's closed block vocabulary (stage 4).
 *
 * An agent's panel arrives in the cockpit's block format. Horizon's own grammar (`grammar.ts`) stays the one vocabulary: a block whose
 * type is not in `BLOCK_TYPES` is never drawn, and a type Horizon knows but a panel cannot draw yet is said so in words. What leaves
 * this file is a small display shape (`text`, `rows`, `question`, `unavailable`) that the desk can draw without naming any block type,
 * so no second copy of the vocabulary exists outside this directory. Text is always text: nothing here produces markup.
 */
import { BLOCK_TYPES, type BlockType } from "./grammar";

export type PanelTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface TextItem {
  readonly kind: "text";
  readonly id: string;
  readonly tone: PanelTone;
  readonly label: string | null;
  readonly text: string;
}
export interface RowsItem {
  readonly kind: "rows";
  readonly id: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}
export interface QuestionItem {
  readonly kind: "question";
  readonly id: string;
  readonly question: string;
  readonly why_needed: string;
  readonly options: readonly { readonly option_id: string; readonly label: string }[];
  readonly answered: { readonly outcome: string; readonly value: unknown; readonly note: string | null } | null;
}
export interface UnavailableItem {
  readonly kind: "unavailable";
  readonly id: string;
}
export type PanelItem = TextItem | RowsItem | QuestionItem | UnavailableItem;

const TONE: Readonly<Record<string, PanelTone>> = { note: "neutral", ok: "success", warning: "warning", danger: "danger", unknown: "neutral", neutral: "neutral", info: "info", success: "success" };
export const toneOf = (value: unknown): PanelTone => TONE[String(value)] ?? "neutral";

const ID = /^[a-z][a-z0-9_-]{0,63}$/;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const clip = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : v === null || v === undefined ? "" : String(v).slice(0, max));

/** A question needs its words and at least two options. The person can always put it off or cancel it instead. */
export function questionOf(raw: Record<string, unknown>, id: string): QuestionItem | null {
  const options = Array.isArray(raw.options) ? raw.options.flatMap((o) => (isRec(o) && typeof o.option_id === "string" && ID.test(o.option_id) ? [{ option_id: o.option_id, label: clip(o.label, 120) }] : [])).slice(0, 8) : [];
  if (typeof raw.question !== "string" || raw.question.trim() === "" || options.length < 2) return null;
  return { kind: "question", id, question: clip(raw.question, 2048), why_needed: clip(raw.why_needed, 2048), options, answered: null };
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

/** One cockpit block as a panel item. Anything outside the grammar, or not drawable here, becomes `unavailable`. */
export function itemOf(raw: unknown, index: number): PanelItem {
  const fallback = `block_${index + 1}`;
  if (!isRec(raw)) return { kind: "unavailable", id: fallback };
  const id = typeof raw.id === "string" && ID.test(raw.id) ? raw.id : fallback;
  const type = BLOCK_TYPES.find((t) => t === raw.type);
  const draw = type === undefined ? undefined : DRAWN[type];
  return draw?.(raw, id) ?? { kind: "unavailable", id };
}
