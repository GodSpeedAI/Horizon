/**
 * The desk's conversation as a record of moves (stage 8, design 3.1). Pure: the row, the newest-200 window and the reducer.
 * The stored side is `src/capabilities/conversation.ts`. Rows hold plain words and references, never raw error text or keys.
 */

export const CONVERSATION_WINDOW = 200;
export const WORDS_MAX = 600;
export const AGENT_NAME_MAX = 60;

export type RowSource = "you" | "agent" | "page-agent";
export type RowKind = "note" | "handoff" | "handoff-proposal" | "find" | "decision" | "panel" | "answer";
export type RowStatus = "done" | "waiting" | "refused" | "unseen";

export interface RowRefs {
  readonly case_id?: string;
  readonly step_id?: string;
  readonly intent_id?: string;
  readonly panel_id?: string;
  readonly ask_id?: string;
  readonly draft_id?: string;
}

export interface ConversationRow {
  readonly row_id: string;
  readonly at: string;
  readonly source: RowSource;
  readonly agent_name?: string;
  readonly kind: RowKind;
  readonly words: string;
  readonly outcome: string;
  readonly status: RowStatus;
  readonly refs: RowRefs;
}

export type ConversationAction =
  | { readonly type: "append"; readonly row: ConversationRow }
  | { readonly type: "update"; readonly row_id: string; readonly status?: RowStatus; readonly outcome?: string };

const REF_KEYS = ["case_id", "step_id", "intent_id", "panel_id", "ask_id", "draft_id"] as const;
const clean = (text: string, max: number): string => text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** A name an agent gives itself: plain text, no markup or control characters, at most 60 characters. */
export function cleanAgentName(raw: string | null | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  const name = clean(raw.replace(/[<>&"'`]/g, ""), AGENT_NAME_MAX);
  return name === "" ? undefined : name;
}

/** The same row with its words clipped and its references kept to the known ones. */
export function tidyRow(row: ConversationRow): ConversationRow {
  const refs: Record<string, string> = {};
  for (const key of REF_KEYS) {
    const value = row.refs?.[key];
    if (typeof value === "string" && value !== "") refs[key] = value.slice(0, 200);
  }
  const name = row.source === "you" ? undefined : cleanAgentName(row.agent_name);
  return { row_id: row.row_id, at: row.at, source: row.source, ...(name === undefined ? {} : { agent_name: name }), kind: row.kind, words: clean(row.words, WORDS_MAX), outcome: clean(row.outcome, WORDS_MAX), status: row.status, refs };
}

/** Oldest first; the same time keeps the order the rows were made in (their ids carry a counter). */
export const byTime = (a: ConversationRow, b: ConversationRow): number => (a.at === b.at ? (a.row_id < b.row_id ? -1 : a.row_id > b.row_id ? 1 : 0) : a.at < b.at ? -1 : 1);

/** The newest 200 rows, oldest first. Older ones are reached through Find. */
export function windowOf(rows: readonly ConversationRow[]): ConversationRow[] {
  const sorted = [...rows].sort(byTime);
  return sorted.slice(Math.max(0, sorted.length - CONVERSATION_WINDOW));
}

/** The row a new panel row replaces: a panel updates in place and adds no second row. */
export const panelRowFor = (rows: readonly ConversationRow[], row: Pick<ConversationRow, "kind" | "refs">): ConversationRow | undefined =>
  row.kind === "panel" && row.refs.panel_id !== undefined ? rows.find((r) => r.kind === "panel" && r.refs.panel_id === row.refs.panel_id) : undefined;

/** The waiting preview for one draft, which a later send (or a second preview) settles instead of adding another row. */
export const waitingForDraft = (rows: readonly ConversationRow[], draftId: string): ConversationRow | undefined =>
  rows.find((r) => (r.kind === "handoff" || r.kind === "handoff-proposal") && r.status === "waiting" && r.refs.draft_id === draftId);

/**
 * `append` adds a row (a panel row whose panel is already there is updated in place, keeping its place in the list);
 * `update` changes the status and outcome of one row by its id. An unknown id changes nothing.
 */
export function reduceConversation(rows: readonly ConversationRow[], action: ConversationAction): ConversationRow[] {
  if (action.type === "update") return rows.map((r) => (r.row_id === action.row_id ? { ...r, ...(action.status === undefined ? {} : { status: action.status }), ...(action.outcome === undefined ? {} : { outcome: clean(action.outcome, WORDS_MAX) }) } : r));
  const row = tidyRow(action.row);
  const same = panelRowFor(rows, row);
  if (same !== undefined) return rows.map((r) => (r.row_id === same.row_id ? { ...r, at: row.at, words: row.words, outcome: row.outcome, status: row.status, refs: { ...r.refs, ...row.refs } } : r));
  if (rows.some((r) => r.row_id === row.row_id)) return [...rows];
  return [...rows, row];
}
