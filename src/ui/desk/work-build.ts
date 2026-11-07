/**
 * Work (design 6, rule 8): what is running, how it went, what it cost. Pure, shared by the server and the browser bundle.
 * Missing data is "Not recorded" with a reason; it is never 0 and never "passed" (rule 7).
 */
import type { EconomicsReadout } from "../../economics/readout.ts";
import type { CaseModel } from "../../economics/model.ts";
import type { ComparePageProps } from "../workspace/compare.tsx";
import type { Outcome } from "../workspace/compare-model.ts";
import { caseTitle } from "./model.ts";

const NOT_RECORDED = "Not recorded";

export interface WorkItem {
  readonly id: string;
  readonly kind: "session" | "case";
  readonly title: string;
  readonly outcome: Outcome | "waiting" | "done" | "stopped";
  /** The plain sentence for the outcome. */
  readonly words: string;
  readonly at: string | null;
}

const OUTCOME_WORDS: Readonly<Record<WorkItem["outcome"], string>> = {
  contradicted: "Contradicted: what the agent reported does not match the independent record.",
  matched: "Matched: the agent's report agrees with the independent record.",
  "not recorded": "Not recorded: the independent record has nothing to compare.",
  waiting: "Still running or waiting.",
  done: "Done.",
  stopped: "Stopped before it finished.",
};
export const outcomeWords = (outcome: WorkItem["outcome"]): string => OUTCOME_WORDS[outcome];

/** Rule 8: a contradicted item is first, then the unknowns, then the rest. Within a group, the newest first. */
export function orderWork(items: readonly WorkItem[]): WorkItem[] {
  const rank = (item: WorkItem): number => (item.outcome === "contradicted" ? 0 : item.outcome === "not recorded" ? 1 : 2);
  return [...items].sort((a, b) => rank(a) - rank(b) || (a.at ?? "") .localeCompare(b.at ?? "") * -1 || a.id.localeCompare(b.id));
}

export function sessionItems(sessions: ComparePageProps["sessions"]): WorkItem[] {
  return sessions.map((s): WorkItem => ({ id: `session:${s.session_id}`, kind: "session", title: `Session ${s.session_id} (${s.runtime})`, outcome: s.outcome, words: outcomeWords(s.outcome), at: s.last_ts ?? s.first_ts ?? null }));
}

export interface CaseLineData {
  readonly case_id: string;
  readonly case_state: string;
  readonly summary: string;
  readonly created_at: string;
  readonly closed_at: string | null;
}
const CASE_STATE_WORDS: Readonly<Record<string, string>> = { active: "Running", awaiting_approval: "Waiting for your approval", completed: "Done", terminated: "Stopped" };
export const caseStateWords = (state: string): string => CASE_STATE_WORDS[state] ?? `Unknown state (${state})`;

export function caseItems(cases: readonly CaseLineData[]): WorkItem[] {
  return cases.map((c): WorkItem => ({
    id: `case:${c.case_id}`,
    kind: "case",
    title: caseTitle(c.summary, c.created_at),
    outcome: c.case_state === "completed" ? "done" : c.case_state === "terminated" ? "stopped" : "waiting",
    words: caseStateWords(c.case_state),
    at: c.closed_at ?? c.created_at,
  }));
}

export type AcceptedKnowledge = { readonly kind: "unknown"; readonly why: string } | { readonly kind: "known"; readonly completed: readonly string[] };

export interface CostLine {
  readonly case_id: string | null;
  readonly tokens: number;
  readonly accepted: number | null;
  /** Tokens per accepted outcome, or null with `words` saying why. */
  readonly per_accepted: number | null;
  readonly words: string;
}

/** Cost per accepted outcome. With no source for acceptance the answer is "Not recorded", never zero. */
export function costLine(item: CaseModel, knowledge: AcceptedKnowledge): CostLine {
  const tokens = item.totals.observed.total;
  if (knowledge.kind === "unknown") return { case_id: item.case_id, tokens, accepted: null, per_accepted: null, words: `${NOT_RECORDED}: ${knowledge.why}` };
  if (item.case_id === null) return { case_id: null, tokens, accepted: null, per_accepted: null, words: `${NOT_RECORDED}: this usage is not tied to a case, so no outcome can be counted against it.` };
  const accepted = knowledge.completed.includes(item.case_id) ? 1 : 0;
  if (accepted === 0) return { case_id: item.case_id, tokens, accepted, per_accepted: null, words: `${NOT_RECORDED}: no accepted outcome yet for this case.` };
  return { case_id: item.case_id, tokens, accepted, per_accepted: tokens / accepted, words: `${(tokens / accepted).toLocaleString("en-US")} tokens for 1 accepted outcome` };
}

export interface CostPart {
  readonly readout: EconomicsReadout;
  readonly knowledge: AcceptedKnowledge;
}
export const costSource = (readout: EconomicsReadout, knowledge: AcceptedKnowledge): CostPart => ({ readout, knowledge });

export interface WorkData {
  readonly compare: ComparePageProps;
  readonly items: readonly WorkItem[];
  readonly cases: { readonly connected: boolean; readonly words: string; readonly items: readonly CaseLineData[]; readonly unreadable: number };
  readonly cost: CostPart;
}
