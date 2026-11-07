/**
 * What an agent may read from the desk. Presenting only hides repository names; it does not limit what an agent can read. This does.
 * An agent sees case titles and step names, open items, counts and its own suggestions. Notes, your answers and evidence bodies stay
 * private unless you marked a note as shared with agents.
 */
import type { NoteView } from "../../capabilities/notes.ts";
import type { ConversationRow } from "./conversation-model.ts";
import type { DeskState, SearchResult } from "./model.ts";

export const WITHHELD_WORDS = "Private notes, your answers and evidence are not shown to agents. A note you mark as shared with agents is.";

export interface SharedNote {
  readonly note_id: string;
  readonly day: string;
  readonly body: string;
  readonly tags: readonly string[];
}

export interface AgentCaseLine {
  readonly case_ref: string;
  readonly title: string;
  readonly state: string | null;
  readonly steps: readonly string[];
}

export interface AgentState {
  readonly view: "agent";
  readonly rev: string;
  readonly today: string;
  readonly status: { readonly setup: string | null; readonly openCase: { readonly case_ref: string; readonly title: string } | null; readonly waiting: number; readonly presenting: boolean };
  readonly cases: readonly AgentCaseLine[];
  readonly open_items: {
    readonly decisions: readonly { readonly id: string; readonly kind: string; readonly title: string }[];
    readonly questions: readonly { readonly panel: string; readonly ask: string; readonly question: string }[];
  };
  readonly counts: { readonly notes_today: number; readonly notes_on_open_case: number; readonly cases: number; readonly decisions: number; readonly open_questions: number; readonly suggestions: number };
  /** Hand offs that agents suggested and that are still waiting for you. */
  readonly proposals: readonly { readonly row_id: string; readonly words: string; readonly agent: string | null }[];
  readonly shared_notes: readonly SharedNote[];
  readonly withheld: string;
}

const sharedOnly = (notes: readonly NoteView[]): SharedNote[] =>
  notes.filter((n) => n.shared_with_agents === true).map((n) => ({ note_id: n.note_id, day: n.day, body: n.body, tags: n.tags }));

const dedupe = (notes: readonly SharedNote[]): SharedNote[] => [...new Map(notes.map((n) => [n.note_id, n])).values()];

/** The desk's state as an agent may read it. `steps` maps a case to its step names. */
export function agentStateOf(state: DeskState, rows: readonly ConversationRow[], steps: ReadonlyMap<string, readonly string[]> = new Map()): AgentState {
  const questions = (state.panels?.open ?? []).flatMap((p) => p.blocks.flatMap((b) => (b.kind === "question" && b.answered === null && (b.withdrawn ?? null) === null ? [{ panel: p.id, ask: b.id, question: b.question }] : [])));
  const proposals = rows.filter((r) => r.source !== "you" && r.kind === "handoff-proposal" && r.status === "waiting").map((r) => ({ row_id: r.row_id, words: r.words, agent: r.agent_name ?? null }));
  return {
    view: "agent",
    rev: state.rev,
    today: state.today,
    status: { setup: state.status.setup, openCase: state.status.openCase === null ? null : { case_ref: state.status.openCase.case_ref, title: state.status.openCase.purpose }, waiting: state.status.waiting, presenting: state.status.presenting },
    cases: state.cases.map((c) => ({ case_ref: c.case_ref, title: c.purpose, state: c.state ?? null, steps: steps.get(c.case_ref) ?? [] })),
    open_items: { decisions: state.decide.cards.filter((c) => c.held === null).map((c) => ({ id: c.id, kind: c.kind, title: c.title })), questions },
    counts: { notes_today: state.notes.length, notes_on_open_case: state.caseNotes.length, cases: state.cases.length, decisions: state.decide.cards.length, open_questions: questions.length, suggestions: proposals.length },
    proposals,
    shared_notes: dedupe([...sharedOnly(state.notes), ...sharedOnly(state.caseNotes), ...(state.selected === null ? [] : sharedOnly([state.selected.note]))]),
    withheld: WITHHELD_WORDS,
  };
}

export interface AgentSearch {
  readonly view: "agent";
  readonly q: string;
  readonly cases: readonly { readonly case_ref: string; readonly title: string }[];
  readonly counts: { readonly notes: number; readonly cases: number; readonly days: number; readonly tags: number };
  readonly shared_notes: readonly SharedNote[];
  readonly withheld: string;
}

/** A find as an agent may read it: case titles, counts, and only the notes marked as shared. */
export function agentSearchOf(found: SearchResult): AgentSearch {
  return {
    view: "agent",
    q: found.q,
    cases: found.cases.map((c) => ({ case_ref: c.case_ref, title: c.purpose })),
    counts: { notes: found.notes.length, cases: found.cases.length, days: found.days.length, tags: found.tags.length },
    shared_notes: sharedOnly(found.notes),
    withheld: WITHHELD_WORDS,
  };
}

/** The conversation as an agent may read it: its own rows in full; your rows by kind, status and time only. */
export function agentRowsOf(rows: readonly ConversationRow[]): ConversationRow[] {
  return rows.map((r) => (r.source === "you" ? { row_id: r.row_id, at: r.at, source: r.source, kind: r.kind, words: "", outcome: "", status: r.status, refs: {} } : r));
}
