/**
 * The rules for an agent's question and the person's answer, as pure checks. No store, no clock, no I/O: each check takes the
 * record as it was read and says whether the operation may go ahead. The store commit that follows is written by the caller
 * (`panel-answers.ts`), and the desk's in-memory board (`ui/desk/panels-model.ts`) calls the same checks. Spec:
 * `.agents/reports/v2-build/gaps/store-design-v2.md`, sections 3, 4 and 8. Every plain-words refusal a store or board operation
 * can give is a message in this file.
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

/**
 * The five states a question is in (design v3, section 2). The state is stored once, on the question's answer record when it has
 * one, otherwise on its panel (see panel-records.ts). Every compatibility field (`replied`, `waiting_on`, `answered`, `withdrawn`)
 * is derived from it by these functions; nothing stores them.
 */
export const QUESTION_STATES = ["waiting_for_you", "put_off", "waiting_for_agent", "finished", "withdrawn"] as const;
export type QuestionStatus = (typeof QUESTION_STATES)[number];
/** Why a question finished. Kept apart from the state: the agent said where the answer went, or the person stopped waiting. */
export type FinishedBy = "reported" | "stopped";

/**
 * The state moves the board may make on an answer record: a put-off question comes back as waiting for you when the agent puts it up
 * again, a question is withdrawn, and a question is put off or reopened by the person. Nothing else moves a state. A question the person
 * answered (waiting for the agent or finished) or withdrew never moves back, so a republish cannot make it answerable again.
 */
const LEGAL_STATE_MOVES: { readonly [from in QuestionStatus]: readonly QuestionStatus[] } = {
  waiting_for_you: ["put_off", "withdrawn"],
  put_off: ["waiting_for_you", "withdrawn"],
  waiting_for_agent: [],
  finished: [],
  withdrawn: [],
};

/** Whether a question may move from one stored state to another. Only the moves in `LEGAL_STATE_MOVES` are legal. */
export function legalTransition(from: QuestionStatus, to: QuestionStatus): boolean {
  return LEGAL_STATE_MOVES[from].includes(to);
}

/** The compatibility fields a state implies. Only `waiting_for_agent` waits on the agent; `replied` is true for every other state. */
export function compatOf(status: QuestionStatus): { readonly replied: boolean; readonly waiting_on: WaitingOn } {
  return status === "waiting_for_agent" ? { replied: false, waiting_on: "agent" } : { replied: true, waiting_on: "none" };
}

/** The words a closed answer from before the upgrade carries. It names no destination, so it finished by stopping. */
const PRE_UPGRADE_ROUTE = "Answered before the upgrade; the owner was not recorded.";

/** Why an answer finished, from its destination words. Words that name no destination count as stopped waiting. */
export function finishedByOf(routedAs: string | null | undefined): FinishedBy {
  return typeof routedAs === "string" && routedAs.trim() !== "" && routedAs !== PRE_UPGRADE_ROUTE ? "reported" : "stopped";
}

/** The outcome origin/main stored for a "not yet" answer. Read as a put-off with deferred history (see `statusOfLegacy`). */
export const LEGACY_DEFERRED = "deferred";

/**
 * The state of an answer record. A record written with a `state` has that state. A record from before states existed is read
 * once by the rule that matches its old fields: an unanswered put-off is `put_off`; an answer that waits for the agent is
 * `waiting_for_agent`; the rest are `finished`. `migrateAnswerStates` writes the derived state back, so this runs once per record.
 */
export function statusOfLegacy(row: { readonly state?: unknown; readonly outcome?: string | null; readonly replied?: boolean; readonly waiting_on?: WaitingOn; readonly routed_as?: string | null }): QuestionStatus {
  if (typeof row.state === "string" && (QUESTION_STATES as readonly string[]).includes(row.state)) return row.state as QuestionStatus;
  if (row.outcome === null || row.outcome === undefined) return "put_off";
  // The origin/main outcome "deferred" is a put-off, not an answer: it waits for nobody, and it reopens when the agent puts it up again.
  if (row.outcome === LEGACY_DEFERRED) return "put_off";
  const waiting = row.waiting_on === "agent" || (row.waiting_on === undefined && row.replied !== true);
  return waiting ? "waiting_for_agent" : "finished";
}

export const MIN_ROUTE_WORDS = 6;
export const MAX_ROUTE_WORDS = 300;
export const PAIRING_MAX_AGE_MS = 10 * 60_000;

/** The words the person's question shows when the question changed. */
export const CHANGED_WORDS = "This question changed after you looked at it. Look again, then answer.";
export const TOO_SHORT_ROUTE = "Say where the answer went in at least 6 characters, for example \"step handoff_0a49 in Seed: triage inbox\" or \"no action: <why>\".";
export const TOO_LONG_ROUTE = `Keep "where it went" to ${MAX_ROUTE_WORDS} characters or fewer.`;
export const NO_ANSWER_WAITING = "No answer to that question is waiting for the agent.";
export const OTHER_AGENT_OWNS = "That question was asked by a different agent, so you cannot answer for it.";
/** A question belongs to the agent that asked it (or the one the person moved it to); another agent cannot put it up again. */
export const QUESTION_OTHER_AGENT = "That question belongs to another agent.";
/** Same id, different wording, choices, consequences, input kind or target: refused on every state (unanswered, put off, answered). */
export const SAME_ID_OTHER_WORDS = "That question id was already used for different wording. Use a new question id.";
export const REQUIRED_CANNOT_WITHDRAW = "This question settles a decision, so only you can close it. The agent cannot take it back.";

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
  if (existing.fingerprint !== null && existing.fingerprint !== fingerprint) return refuse(SAME_ID_OTHER_WORDS);
  return { ok: true, owner_key: callerKey, reopen: !committed(existing) && existing.history.length > 0 };
}

/** The person answers. The question must be open (not already committed) and the version they saw must be the current one. */
export function checkAnswer(input: { readonly state: QuestionState; readonly seenVersion: string | null }): Verdict {
  if (committed(input.state)) return refuse("This question was already answered.");
  if (input.seenVersion !== input.state.version) return refuse(CHANGED_WORDS);
  return { ok: true };
}

/** The length of the words an agent says where an answer went. Shared by the store and the board. */
export function checkRouteWords(routedAs: unknown): Verdict {
  const words = typeof routedAs === "string" ? routedAs.trim() : "";
  if (words.length < MIN_ROUTE_WORDS) return refuse(TOO_SHORT_ROUTE);
  if (words.length > MAX_ROUTE_WORDS) return refuse(TOO_LONG_ROUTE);
  return { ok: true };
}

/**
 * The agent says where the answer went. Owner key first, then the words, then the answer must be waiting for the agent. A question
 * with no recorded owner (null) is refused for every real agent key, because no agent key is null.
 */
export function checkRoute(input: { readonly state: QuestionState; readonly callerKey: string | null; readonly routedAs: unknown }): Verdict {
  if (input.state.owner_key !== input.callerKey) return refuse(OTHER_AGENT_OWNS);
  const words = checkRouteWords(input.routedAs);
  if (!words.ok) return words;
  if (input.state.waiting_on !== "agent") return refuse(NO_ANSWER_WAITING);
  return { ok: true };
}

/** The agent withdraws a question: the owner only, unanswered only, never one that resolves a required step. */
export function checkWithdraw(input: { readonly state: QuestionState; readonly callerKey: string; readonly resolvesRequiredStep: boolean }): Verdict {
  if (input.state.owner_key !== input.callerKey) return refuse("That question was asked by a different agent, so you cannot withdraw it.");
  if (committed(input.state)) return refuse("That question was already answered, so it cannot be withdrawn.");
  if (input.resolvesRequiredStep) return refuse(REQUIRED_CANNOT_WITHDRAW);
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
