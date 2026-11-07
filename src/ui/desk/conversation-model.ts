/**
 * The desk's conversation as a record of moves (stage 8, design 3.1). Pure: the row, the newest-200 window and the reducer.
 * The stored side is `src/capabilities/conversation.ts`. Rows hold plain words and references, never raw error text or keys.
 */

export const CONVERSATION_WINDOW = 200;
export const WORDS_MAX = 600;
export const AGENT_NAME_MAX = 60;

export type RowSource = "you" | "agent" | "page-agent";
export type RowKind = "note" | "handoff" | "handoff-proposal" | "find" | "decision" | "panel" | "answer";
/** `claimed`: the agent says it happened and Horizon has not seen it. */
export type RowStatus = "done" | "waiting" | "refused" | "unseen" | "claimed" | "partial";

/** One stage of a hand off, with its own outcome. `unseen` means Horizon has not observed it. */
export const STAGE_NAMES = ["Sent", "Started", "Given to an agent", "Result seen"] as const;
export interface RowStage {
  readonly name: (typeof STAGE_NAMES)[number];
  readonly status: "done" | "refused" | "unseen";
  readonly words: string;
  /** What the person can do when the stage failed. */
  readonly recovery?: "Try again" | "Open the step";
}

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
  /** A hand off shows each stage on its own. Other rows have none. */
  readonly stages?: readonly RowStage[];
}

export type ConversationAction =
  | { readonly type: "append"; readonly row: ConversationRow }
  | { readonly type: "update"; readonly row_id: string; readonly status?: RowStatus; readonly outcome?: string; readonly stages?: readonly RowStage[] };

const REF_KEYS = ["case_id", "step_id", "intent_id", "panel_id", "ask_id", "draft_id"] as const;
const clean = (text: string, max: number): string => text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** A name an agent gives itself: plain text, no markup or control characters, at most 60 characters. */
export function cleanAgentName(raw: string | null | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  const name = clean(raw.replace(/[<>&"'`]/g, ""), AGENT_NAME_MAX);
  return name === "" ? undefined : name;
}

const tidyStages = (stages: readonly RowStage[] | undefined): readonly RowStage[] | undefined =>
  Array.isArray(stages) && stages.length > 0
    ? stages.filter((g) => STAGE_NAMES.includes(g.name) && (g.status === "done" || g.status === "refused" || g.status === "unseen")).slice(0, 4).map((g) => ({ name: g.name, status: g.status, words: clean(String(g.words ?? ""), WORDS_MAX), ...(g.recovery === "Try again" || g.recovery === "Open the step" ? { recovery: g.recovery } : {}) }))
    : undefined;

/** The same row with its words clipped and its references kept to the known ones. */
export function tidyRow(row: ConversationRow): ConversationRow {
  const refs: Record<string, string> = {};
  for (const key of REF_KEYS) {
    const value = row.refs?.[key];
    if (typeof value === "string" && value !== "") refs[key] = value.slice(0, 200);
  }
  const name = row.source === "you" ? undefined : cleanAgentName(row.agent_name);
  return { row_id: row.row_id, at: row.at, source: row.source, ...(name === undefined ? {} : { agent_name: name }), kind: row.kind, words: clean(row.words, WORDS_MAX), outcome: clean(row.outcome, WORDS_MAX), status: row.status, refs, ...(tidyStages(row.stages) === undefined ? {} : { stages: tidyStages(row.stages)! }) };
}

/** Oldest first; the same time keeps the order the rows were made in (their ids carry a counter). */
export const byTime = (a: ConversationRow, b: ConversationRow): number => (a.at === b.at ? (a.row_id < b.row_id ? -1 : a.row_id > b.row_id ? 1 : 0) : a.at < b.at ? -1 : 1);

/** Whether a row is still waiting for the person (an ask, a suggestion, a preview) or for the agent to say where an answer went. */
export const isStillWaiting = (row: ConversationRow): boolean => row.status === "waiting";

/**
 * Every row that is still waiting, plus the newest of the others, up to 200 rows in all, oldest first. Waiting work never drops out
 * of the window because newer rows pushed it down. (More than 200 waiting rows are all kept.) Older rows are reached through Find.
 */
export function windowOf(rows: readonly ConversationRow[]): ConversationRow[] {
  const sorted = [...rows].sort(byTime);
  if (sorted.length <= CONVERSATION_WINDOW) return sorted;
  const waiting = sorted.filter(isStillWaiting);
  const room = Math.max(0, CONVERSATION_WINDOW - waiting.length);
  const others = sorted.filter((r) => !isStillWaiting(r));
  const keep = new Set([...waiting, ...others.slice(others.length - room)].map((r) => r.row_id));
  return sorted.filter((r) => keep.has(r.row_id));
}

/** Suggestions from agents waiting on one case at the same time. A 21st is refused. */
export const MAX_WAITING_PROPOSALS = 20;
export const TOO_MANY_PROPOSALS = "This case already has 20 suggestions waiting. Confirm or discard some first.";

/** The row a new panel row replaces: a panel updates in place and adds no second row. */
export const panelRowFor = (rows: readonly ConversationRow[], row: Pick<ConversationRow, "kind" | "refs">): ConversationRow | undefined =>
  row.kind === "panel" && row.refs.panel_id !== undefined ? rows.find((r) => r.kind === "panel" && r.refs.panel_id === row.refs.panel_id) : undefined;

/** The one row for an answer: a second answer to the same question (or the agent's reply) updates it, never adds another. */
export const answerRowFor = (rows: readonly ConversationRow[], row: Pick<ConversationRow, "kind" | "refs">): ConversationRow | undefined =>
  row.kind === "answer" && row.refs.panel_id !== undefined && row.refs.ask_id !== undefined ? rows.find((r) => r.kind === "answer" && r.refs.panel_id === row.refs.panel_id && r.refs.ask_id === row.refs.ask_id) : undefined;

export const WAITING_FOR_AGENT = "Waiting for the agent to say where it went";
const ECHO_MAX = 120;

/** What the person said, in their question's own words: option labels, Yes or No, or their text (clipped). */
export function answerEcho(ask: { readonly input?: string; readonly options: readonly { readonly option_id: string; readonly label: string }[] }, outcome: "answered" | "deferred" | "cancelled", value: unknown): string {
  if (outcome === "deferred") return "You said not yet.";
  if (outcome === "cancelled") return "You skipped this question.";
  const label = (id: string): string => ask.options.find((o) => o.option_id === id)?.label ?? "your choice";
  const shown = ask.input === "confirm" ? (value === true || value === "yes" ? "Yes" : "No")
    : ask.input === "multiselect" ? (Array.isArray(value) ? value.map((v) => label(String(v))).join(", ") : label(String(value)))
    : ask.input === "text" ? String(value ?? "")
    : label(String(value));
  const text = clean(shown, ECHO_MAX + 1);
  return `You answered: ${text.length > ECHO_MAX ? `${text.slice(0, ECHO_MAX)}...` : text}`;
}

/** The waiting preview for one draft, which a later send (or a second preview) settles instead of adding another row. */
export const waitingForDraft = (rows: readonly ConversationRow[], draftId: string): ConversationRow | undefined =>
  rows.find((r) => (r.kind === "handoff" || r.kind === "handoff-proposal") && r.status === "waiting" && r.refs.draft_id === draftId);

/**
 * `append` adds a row (a panel row whose panel is already there is updated in place, keeping its place in the list);
 * `update` changes the status and outcome of one row by its id. An unknown id changes nothing.
 */
export function reduceConversation(rows: readonly ConversationRow[], action: ConversationAction): ConversationRow[] {
  if (action.type === "update") return rows.map((r) => (r.row_id === action.row_id ? { ...r, ...(action.status === undefined ? {} : { status: action.status }), ...(action.outcome === undefined ? {} : { outcome: clean(action.outcome, WORDS_MAX) }), ...(tidyStages(action.stages) === undefined ? {} : { stages: tidyStages(action.stages)! }) } : r));
  const row = tidyRow(action.row);
  const same = panelRowFor(rows, row);
  if (same !== undefined) return rows.map((r) => (r.row_id === same.row_id ? { ...r, at: row.at, words: row.words, outcome: row.outcome, status: row.status, refs: { ...r.refs, ...row.refs } } : r));
  if (rows.some((r) => r.row_id === row.row_id)) return [...rows];
  return [...rows, row];
}
