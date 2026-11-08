/**
 * The rules for an agent's question and the person's answer, as pure checks. No store, no clock, no I/O: each check takes the
 * record as it was read and says whether the operation may go ahead. The store commit that follows is written by the caller
 * (`panel-answers.ts`). Spec: `.agents/reports/v2-build/gaps/store-design-v2.md`, sections 3, 4 and 8.
 */
import { createHash } from "node:crypto";

/** Who an answer waits on: the agent (to say where it went), the person (a question waits for an answer), or nobody. */
export type WaitingOn = "agent" | "person" | "none";

export interface HistoryEntry {
  readonly outcome: string;
  readonly at: string;
}

/** The part of a question record these rules read. */
export interface QuestionState {
  readonly owner_key: string | null;
  readonly fingerprint: string | null;
  readonly outcome: string | null;
  readonly replied: boolean;
  readonly waiting_on: WaitingOn;
  readonly history: readonly HistoryEntry[];
  readonly routed_as: string | null;
  readonly version: string | null;
}

export type Verdict = { readonly ok: true } | { readonly ok: false; readonly message: string };

export const MIN_ROUTE_WORDS = 6;
export const PAIRING_MAX_AGE_MS = 10 * 60_000;

/** The words the person's question shows when the question changed. */
export const CHANGED_WORDS = "This question changed after you looked at it. Look again, then answer.";

/** The question's own content, as far as its meaning goes. The id is the record key, so it is not part of the fingerprint. */
export interface QuestionContent {
  readonly question: string;
  readonly input?: string;
  readonly options: readonly { readonly option_id: string; readonly label: string; readonly consequence?: string | null }[];
  readonly resolves?: string | null;
}

/** A hash of the question's text, input kind, options (with consequences) and what it resolves. Same words, same hash. */
export function questionFingerprint(q: QuestionContent): string {
  return createHash("sha256").update(JSON.stringify([q.question, q.input ?? "select", q.options.map((o) => [o.option_id, o.label, o.consequence ?? null]), q.resolves ?? null])).digest("hex");
}

const refuse = (message: string): { readonly ok: false; readonly message: string } => ({ ok: false, message });

/** Whether the question was committed as answered or cancelled (a deferred question is not committed: its outcome stays null). */
const committed = (s: QuestionState): boolean => s.outcome === "answered" || s.outcome === "cancelled";

/**
 * Put a question. A new question is owned by the caller. An existing one is the owner's only. The same words re-open a deferred
 * question (its history is kept) and are a no-op on an answered one. Different words on an existing question are refused.
 */
export function checkPut(input: { readonly existing: QuestionState | null; readonly callerKey: string; readonly fingerprint: string }):
  | { readonly ok: true; readonly owner_key: string; readonly reopen: boolean }
  | { readonly ok: false; readonly message: string } {
  const { existing, callerKey, fingerprint } = input;
  if (existing === null) return { ok: true, owner_key: callerKey, reopen: false };
  if (existing.owner_key !== callerKey) return refuse("That question belongs to another agent.");
  if (existing.fingerprint !== null && existing.fingerprint !== fingerprint) return refuse("This question already exists with other words. Ask it with the same words, or give it a new id.");
  return { ok: true, owner_key: callerKey, reopen: !committed(existing) && existing.history.length > 0 };
}

/** The person answers. The question must be open (not already committed) and the version they saw must be the current one. */
export function checkAnswer(input: { readonly state: QuestionState; readonly seenVersion: string | null }): Verdict {
  if (committed(input.state)) return refuse("This question was already answered.");
  if (input.seenVersion !== input.state.version) return refuse(CHANGED_WORDS);
  return { ok: true };
}

/** The agent says where the answer went. Only the owner key, only while an answer waits for the agent, and at least 6 characters. */
export function checkRoute(input: { readonly state: QuestionState; readonly callerKey: string; readonly routedAs: string }): Verdict {
  if (input.state.owner_key !== input.callerKey) return refuse("That question was asked by a different agent, so you cannot answer for it.");
  if (input.routedAs.trim().length < MIN_ROUTE_WORDS) return refuse(`Say where the answer went in at least ${MIN_ROUTE_WORDS} characters.`);
  if (input.state.waiting_on !== "agent") return refuse("No answer to that question is waiting for the agent.");
  return { ok: true };
}

/** The agent withdraws a question: the owner only, unanswered only, never one that resolves a required step. */
export function checkWithdraw(input: { readonly state: QuestionState; readonly callerKey: string; readonly resolvesRequiredStep: boolean }): Verdict {
  if (input.state.owner_key !== input.callerKey) return refuse("That question was asked by a different agent, so you cannot withdraw it.");
  if (committed(input.state)) return refuse("This question was already answered, so it cannot be withdrawn.");
  if (input.resolvesRequiredStep) return refuse("This question decides a step that must be done, so it cannot be withdrawn.");
  return { ok: true };
}

/** The person stops waiting for the agent. Allowed only where an answer waits for the agent. */
export function checkStopWaiting(input: { readonly state: QuestionState }): Verdict {
  return input.state.waiting_on === "agent" ? { ok: true } : refuse("Nothing was waiting.");
}

/**
 * The person moves a question to another registered agent. Paired desk only, a pairing no older than 10 minutes, a target that is
 * registered, and an explicit second confirm. A waiting answer may be reassigned (the person is the only one who can do it).
 */
export function checkReassign(input: {
  readonly state: QuestionState;
  readonly paired: boolean;
  readonly pairedAgeMs: number;
  readonly newOwnerKey: string;
  readonly targetRegistered: boolean;
  readonly confirmed: boolean;
}): Verdict {
  if (!input.paired) return refuse("Only the person on a paired desk can change the owner.");
  if (input.pairedAgeMs > PAIRING_MAX_AGE_MS) return refuse("Pair this browser again to change the owner. The pairing is more than 10 minutes old, so the change is refused for safety.");
  if (!input.targetRegistered) return refuse("That agent is not registered on this desk, so it cannot own the question.");
  if (!input.confirmed) return refuse("Confirm the change first. Nothing was changed.");
  if (input.state.owner_key === input.newOwnerKey) return refuse("That agent already owns the question.");
  return { ok: true };
}
