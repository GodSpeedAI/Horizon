/**
 * What the operator answered to an agent's question (stage 4). One record per answer in `horizon-panel-answers`, keyed
 * `answer:<panel_id>:<n>`. Design v3, step 3: every answer stores its `state` once (waiting for the agent, put off, or finished,
 * with `finished_by` saying why), and `replied` and `waiting_on` are derived from that state. An answer waits for the agent until
 * the agent says where it went (`answer.route` with `routed_as`), or until the person stops waiting. No other agent call closes it.
 * Every write that finishes an answer, moves its owner or stops its wait is planned here as records, so the caller can commit it
 * in the same commit as the panel and the conversation row (see `planRoute`, `planStopWaiting`, `planReassign`).
 */
import { createHash } from "node:crypto";
import type { DurableStore, Json } from "@godspeedai/cognate-events";
import { answerRowOf, newRowRecord, planAppend, planUpdate, type RowWrite } from "./conversation.ts";
import { checkAnswer, checkReassign, checkRoute, checkRouteWords, checkStopWaiting, compatOf, finishedByOf, LEGACY_DEFERRED, MAX_ROUTE_WORDS, MIN_ROUTE_WORDS, NO_ANSWER_WAITING, statusOfLegacy, TOO_SHORT_ROUTE, type FinishedBy, type QuestionState, type QuestionStatus, type WaitingOn } from "./question-rules.ts";
import type { Who } from "./notes.ts";
import type { CommitRecord } from "./panel-records.ts";

/** The route words' limits and refusal, as the rules define them (kept under these names for the desk's callers). */
export const MIN_ROUTED_AS = MIN_ROUTE_WORDS;
export const MAX_ROUTED_AS = MAX_ROUTE_WORDS;
export { TOO_SHORT_ROUTE };

export const PANEL_ANSWERS_COLLECTION = "horizon-panel-answers";
export const OUTCOMES = ["answered", "deferred", "cancelled"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export type AnswerValue = string | readonly string[] | boolean;

export interface PanelAnswer {
  readonly tenant: string;
  readonly panel_id: string;
  readonly n: number;
  readonly ask: string;
  readonly outcome: Outcome | null;
  readonly value: AnswerValue | null;
  readonly note: string | null;
  readonly at: string;
  /** The version of the question the person was looking at when they answered. Missing on older answers. */
  readonly version?: string | null;
  /** True unless the answer waits for the agent. Derived from `state`; not stored. */
  readonly replied: boolean;
  /** Where the agent took the answer ("step handoff_0a49 in Seed: triage inbox", "no action: <why>"). Null until it says. */
  readonly routed_as?: string | null;
  /** The step this answer bears on, when the panel is about one. */
  readonly step: string | null;
  /** The agent that asked the question. Only that agent reads this answer. Missing on older answers, which no agent reads. */
  readonly asked_by?: string | null;
  /** The key id of the agent that asked. Only that key reads this answer. Missing on older answers, which no agent reads. */
  readonly asked_by_key?: string | null;
  /** The agent key that owns the question (set when it is first put; changed only by Reassign owner). Null on older records without a recorded owner. */
  readonly owner_key?: string | null;
  /** A hash of the question's words, kind, options and resolution (`questionFingerprint`). Null on older records. */
  readonly fingerprint?: string | null;
  /** Earlier outcomes of a deferred question, in order. */
  readonly history?: readonly { readonly outcome: string; readonly at: string }[];
  /** Who the answer waits on: the agent (to say where it went), the person, or nobody. Derived from `state`; not stored. */
  readonly waiting_on?: WaitingOn;
  /** The state of the question as this answer records it. Stored once here; `replied` and `waiting_on` are derived from it. */
  readonly state?: QuestionStatus;
  /** Why the answer finished, once it has: the agent named where it went ("reported"), or the person stopped waiting ("stopped"). */
  readonly finished_by?: FinishedBy | null;
  /**
   * Every change of owner, in order (`planReassign`). The authorship fields (`asked_by`, `asked_by_key`) are never changed by a
   * reassignment; this list says who held the question and when.
   */
  readonly reassignments?: readonly { readonly from_key: string; readonly to_key: string; readonly from_name: string; readonly to_name: string; readonly at: string }[];
}

/**
 * Fills the fields a record does not have, and derives the compatibility fields from its state. A record written before states
 * existed is read once by `statusOfLegacy`. The owner is the key that asked, when it was recorded.
 */
export function normaliseAnswer(row: PanelAnswer): PanelAnswer & { readonly state: QuestionStatus; readonly finished_by: FinishedBy | null; readonly owner_key: string | null; readonly fingerprint: string | null; readonly history: readonly { readonly outcome: string; readonly at: string }[]; readonly waiting_on: WaitingOn; readonly replied: boolean } {
  const state = statusOfLegacy(row);
  return {
    ...row,
    ...compatOf(state),
    state,
    finished_by: state === "finished" ? (row.finished_by ?? finishedByOf(row.routed_as)) : null,
    owner_key: row.owner_key ?? row.asked_by_key ?? null,
    fingerprint: row.fingerprint ?? null,
    history: row.history ?? [],
  };
}

/** The record as it is stored: the compatibility fields that are derived from the state are left out. */
export function storedOf(a: object): { readonly [key: string]: Json } {
  const { replied: _replied, waiting_on: _waiting, ...rest } = a as { readonly replied?: unknown; readonly waiting_on?: unknown } & { readonly [key: string]: unknown };
  return rest as unknown as { readonly [key: string]: Json };
}

/** The id of one answer record. The scope (the operator's tenant scope, see deskScopeOf) is part of the key, so no operator's answer shares an id with another's. */
export const answerIdOf = (scope: string, panel: string, n: number): string => `answer:${scope}:${panel}:${n}`;

export function checkValue(value: unknown): { readonly ok: true; readonly value: AnswerValue | null } | { readonly ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value === "boolean") return { ok: true, value };
  if (typeof value === "string") return value.length <= 2000 ? { ok: true, value } : { ok: false };
  if (Array.isArray(value) && value.length <= 12 && value.every((v) => typeof v === "string" && v.length <= 200)) return { ok: true, value: value as string[] };
  return { ok: false };
}

/** An answer as one read saw it, with the record version that read saw. A write made from this read commits against that version. */
export interface ReadAnswer {
  readonly answer: PanelAnswer;
  readonly version: number;
}

export async function readAnswerRows(store: DurableStore, tenant: string, panelId?: string): Promise<ReadAnswer[]> {
  const rows = await store.listRecords(PANEL_ANSWERS_COLLECTION, { tenant });
  // Only answer records: a question's guard record (`question:<panel>:<ask>`) shares the collection and is not an answer.
  return rows
    .filter((r) => r.id.startsWith("answer:"))
    .map((r) => ({ answer: normaliseAnswer(r.value as unknown as PanelAnswer), version: r.version }))
    .filter((r) => panelId === undefined || r.answer.panel_id === panelId)
    .sort((a, b) => (a.answer.panel_id === b.answer.panel_id ? a.answer.n - b.answer.n : a.answer.panel_id < b.answer.panel_id ? -1 : 1));
}

export async function listAnswers(store: DurableStore, tenant: string, panelId?: string): Promise<PanelAnswer[]> {
  return (await readAnswerRows(store, tenant, panelId)).map((r) => r.answer);
}

/**
 * The queue every writer to answer and panel records runs in (the desk's panelCommand: one command at a time, in arrival order).
 * A writer that is called from outside the desk passes the queue in, so its read and its commit cannot interleave with another command.
 */
export type PanelQueue = <T>(command: () => Promise<T>) => Promise<T>;

/** A question already has a committed answer (or a cancel). One answer per question: a second one is refused, and nothing is stored. */
export class QuestionAlreadyAnswered extends Error {
  constructor() {
    super("This question was already answered. Nothing was sent. Look again.");
    this.name = "QuestionAlreadyAnswered";
  }
}

export const guardIdOf = (scope: string, panel: string, ask: string): string => `question:${scope}:${panel}:${ask}`;

export async function recordAnswer(
  store: DurableStore,
  input: { readonly tenant: string; readonly panel_id: string; readonly ask: string; readonly outcome: Outcome; readonly value?: AnswerValue | null; readonly note?: string | null; readonly step?: string | null; readonly version?: string | null; readonly asked_by?: string | null; readonly asked_by_key?: string | null; /** The agent that answers for the question now. Defaults to the author. */ readonly owner_key?: string | null; readonly fingerprint?: string | null; readonly now: Date; /** The panel records that show the answer. Committed in the same commit as the answer. */ readonly alsoRecords?: () => Promise<readonly CommitRecord[]> },
): Promise<PanelAnswer> {
  const committed = input.outcome === "answered" || input.outcome === "cancelled";
  for (let attempt = 0; ; attempt += 1) {
    // The guard is the question's own record. Two answers that race both carry its version; the store refuses the second commit.
    const guard = await store.getRecord(PANEL_ANSWERS_COLLECTION, guardIdOf(input.tenant, input.panel_id, input.ask));
    // A guard exists only once a committed answer (or cancel) is stored. The rule decides whether the question is still open.
    // The version the person saw is checked by the desk's answer step (panels-model, reduceHuman), not here: the store has
    // no version to compare with until an answer is committed, so this check passes the version through unchanged.
    const existing = await listAnswers(store, input.tenant, input.panel_id);
    if (committed) {
      // A question an answer or cancel already sealed is refused, whether or not its guard was written (a legacy answer has none).
      const sealed = existing.find((a) => a.ask === input.ask && (a.outcome === "answered" || a.outcome === "cancelled"));
      const state: QuestionState = { owner_key: input.owner_key ?? input.asked_by_key ?? null, fingerprint: input.fingerprint ?? null, outcome: guard ? String((guard.value as { outcome?: unknown }).outcome) : (sealed?.outcome ?? null), replied: false, waiting_on: "none", history: [], routed_as: null, version: null };
      if (!checkAnswer({ state, seenVersion: null }).ok) throw new QuestionAlreadyAnswered();
    }
    const n = (existing.at(-1)?.n ?? 0) + 1;
    // "Not yet" is not an answer: the outcome stays null, the question keeps its history, and nobody waits for it.
    const deferred = input.outcome === "deferred";
    const stored = {
      tenant: input.tenant, panel_id: input.panel_id, n, ask: input.ask,
      outcome: deferred ? null : input.outcome,
      value: deferred ? null : input.value ?? null, note: input.note ?? null, at: input.now.toISOString(), version: input.version ?? null,
      routed_as: null, step: input.step ?? null, asked_by: input.asked_by ?? null, asked_by_key: input.asked_by_key ?? null,
      owner_key: input.owner_key ?? input.asked_by_key ?? null, fingerprint: input.fingerprint ?? null, history: deferred ? [{ outcome: "deferred", at: input.now.toISOString() }] : [],
      state: deferred ? "put_off" : "waiting_for_agent", finished_by: null,
    };
    const records: { collection: string; id: string; expectedVersion: number; value: { readonly [key: string]: Json } }[] = [{ collection: PANEL_ANSWERS_COLLECTION, id: answerIdOf(input.tenant, input.panel_id, n), expectedVersion: 0, value: storedOf(stored) }];
    if (committed) records.push({ collection: PANEL_ANSWERS_COLLECTION, id: guardIdOf(input.tenant, input.panel_id, input.ask), expectedVersion: guard?.version ?? 0, value: { tenant: input.tenant, panel_id: input.panel_id, ask: input.ask, outcome: input.outcome, n, at: input.now.toISOString() } });
    try {
      // The answer and the panel that shows it are one commit: both are there or neither is.
      const panelRecords = input.alsoRecords ? await input.alsoRecords() : [];
      await store.commit({ appends: [], records: [...records, ...panelRecords] });
      return normaliseAnswer(stored as unknown as PanelAnswer);
    } catch (error) {
      // A lost race is looked at again: the next pass sees the committed answer and refuses it.
      if (attempt >= 3) throw error;
    }
  }
}

/** An answer record as the rules read it. */
export function answerState(a: PanelAnswer): QuestionState {
  return { owner_key: a.owner_key ?? null, fingerprint: a.fingerprint ?? null, outcome: a.outcome, replied: a.replied, waiting_on: a.waiting_on ?? "none", history: a.history ?? [], routed_as: a.routed_as ?? null, version: a.version ?? null };
}

/**
 * The write that finishes one answer: its words are kept, and why it finished is recorded. It commits against the version the read
 * saw (`read.version`), so a change made after that read (a reassignment, another route) makes this commit fail instead of being
 * overwritten by the stale words.
 */
type Write = { readonly collection: string; readonly id: string; readonly expectedVersion: number; readonly value: { readonly [key: string]: Json } };
function planFinish(read: ReadAnswer, by: FinishedBy, routedAs: string | null, note: string | null): Write {
  const a = read.answer;
  return { collection: PANEL_ANSWERS_COLLECTION, id: answerIdOf(a.tenant, a.panel_id, a.n), expectedVersion: read.version, value: storedOf({ ...a, state: "finished", finished_by: by, routed_as: routedAs, note: a.note ?? note }) };
}

/**
 * The records that say where an answer went: `answer.route { panel_id, ask_id, routed_as }`. Every answer to that question that waits
 * for the agent is finished and keeps its words. `callerKey` is the agent key asking, and is required: the owner, the words and the
 * waiting state are checked by `checkRoute` for that key. Nothing is written here.
 */
export async function planRoute(store: DurableStore, tenant: string, panelId: string, askId: string, routedAs: unknown, callerKey: string): Promise<{ readonly ok: true; readonly records: CommitRecord[]; readonly closed: number } | { readonly ok: false; readonly message: string }> {
  if (typeof callerKey !== "string" || callerKey.trim() === "") return { ok: false, message: NO_CALLER_KEY };
  const rows = (await readAnswerRows(store, tenant, panelId)).filter((r) => r.answer.ask === askId);
  // A question whose answers contradict each other is refused for routing until the person decides (R2-10).
  if (await conflictOf(store, tenant, panelId, askId)) return { ok: false, message: CONFLICTED_WORDS };
  const target = (rows.filter((r) => waitsForAgent(r.answer)).at(-1) ?? rows.at(-1))?.answer;
  if (target === undefined) {
    const words = checkRouteWords(routedAs);
    return words.ok ? { ok: false, message: NO_ANSWER_WAITING } : { ok: false, message: words.message };
  }
  const state = answerState(target);
  const verdict = checkRoute({ state, callerKey, routedAs });
  if (!verdict.ok) return { ok: false, message: verdict.message };
  // Every answer this commit finishes must be the caller's. One that is not refuses the whole commit (R2-10).
  for (const r of rows.filter((x) => waitsForAgent(x.answer))) {
    const own = checkRoute({ state: answerState(r.answer), callerKey, routedAs });
    if (!own.ok) return { ok: false, message: own.message };
  }
  const words = typeof routedAs === "string" ? routedAs.trim() : "";
  const records: CommitRecord[] = rows.filter((r) => waitsForAgent(r.answer)).map((r) => planFinish(r, "reported", words, null));
  return records.length === 0 ? { ok: false, message: NO_ANSWER_WAITING } : { ok: true, records, closed: records.length };
}

export const NO_CALLER_KEY = "The agent key is missing, so the route cannot be checked. Nothing was changed.";

/**
 * Routes an answer on its own (the store's call, without the desk's rows). The read, the check and the commit run in `queue`, the
 * desk's one mutation queue, so no other panel command runs between them. Returns how many answers it finished.
 */
export async function routeAnswer(store: DurableStore, tenant: string, panelId: string, askId: string, routedAs: unknown, callerKey: string, queue: PanelQueue): Promise<{ readonly ok: true; readonly closed: number } | { readonly ok: false; readonly message: string }> {
  return queue(async () => {
    const planned = await planRoute(store, tenant, panelId, askId, routedAs, callerKey);
    if (!planned.ok) return planned;
    try {
      await store.commit({ appends: [], records: planned.records });
    } catch {
      return { ok: false, message: NOTHING_SENT };
    }
    return { ok: true, closed: planned.closed };
  });
}

/** What an ask offers, as far as checking an answer needs it. */
export interface AskShape {
  readonly input: "select" | "confirm" | "multiselect" | "text";
  readonly options: readonly { readonly option_id: string }[];
}
export const MAX_TEXT_ANSWER = 500;

/**
 * The person's answer, checked against the kind of question. confirm gives "yes" or "no" (a true/false is read as that);
 * select gives one option id; multiselect gives a list of option ids, at least one; text gives one trimmed line, 1 to 500 characters.
 */
export function answerFor(ask: AskShape, value: unknown): { readonly ok: true; readonly value: string | readonly string[] } | { readonly ok: false; readonly message: string } {
  const bad = (message: string) => ({ ok: false as const, message });
  switch (ask.input) {
    case "confirm": {
      const v = value === true ? "yes" : value === false ? "no" : value;
      return v === "yes" || v === "no" ? { ok: true, value: v } : bad("Answer Yes or No.");
    }
    case "select":
      return typeof value === "string" && ask.options.some((o) => o.option_id === value) ? { ok: true, value } : bad("Pick one of the choices offered.");
    case "multiselect": {
      if (!Array.isArray(value) || value.length < 1 || !value.every((v) => typeof v === "string" && ask.options.some((o) => o.option_id === v))) return bad("Pick at least one of the choices offered.");
      return { ok: true, value: [...new Set(value as string[])] };
    }
    case "text": {
      const t = typeof value === "string" ? value.trim() : "";
      if (t === "") return bad("Write an answer first.");
      if (t.length > MAX_TEXT_ANSWER || /[\r\n]/.test(t)) return bad(`Keep the answer to one line of ${MAX_TEXT_ANSWER} characters or fewer.`);
      return { ok: true, value: t };
    }
  }
}

/** The words the conversation row of a stopped answer carries. */
export const STOPPED_ROW = "You stopped waiting. The agent has not said where your answer went.";

/**
 * The records that stop the person's wait on one step: every answer on the step that waits for the agent is finished as stopped, and
 * its conversation row says so, in the same set of records. `who` and `now` are needed for the rows; without them only answers change.
 */
export async function planStopWaiting(store: DurableStore, tenant: string, step: string, who?: Who, now?: Date): Promise<{ readonly count: number; readonly records: CommitRecord[] }> {
  const records: CommitRecord[] = [];
  let count = 0;
  // One conversation row per question: two waiting answers to one question share its row, so the row is planned once (R3-7). Every
  // answer is still finished.
  const rowsPlanned = new Set<string>();
  for (const read of await readAnswerRows(store, tenant)) {
    const a = read.answer;
    if (a.step !== step || !checkStopWaiting({ state: answerState(a) }).ok) continue;
    records.push(planFinish(read, "stopped", null, "You chose to stop waiting for the agent."));
    count += 1;
    const rowKey = `${a.panel_id}\n${a.ask}`;
    if (who !== undefined && now !== undefined && !rowsPlanned.has(rowKey)) {
      rowsPlanned.add(rowKey);
      records.push(await answerRowWrite(store, who, a, now));
    }
  }
  return { count, records: uniqueRecords(records) };
}

/** Keeps the first record for each collection and id, so one commit never writes the same record twice. */
function uniqueRecords(records: readonly CommitRecord[]): CommitRecord[] {
  const seen = new Set<string>();
  return records.filter((r) => {
    const key = `${r.collection}\n${r.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The conversation row of one answer, finished in place (or added when there is none), as a record. */
async function answerRowWrite(store: DurableStore, who: Who, a: PanelAnswer, now: Date): Promise<CommitRecord> {
  const existing = await answerRowOf(store, who, a.panel_id, a.ask);
  const write: RowWrite | null = existing === undefined ? await planAppend(store, who, { source: "you", kind: "answer", words: "Your answer to the agent's question", outcome: STOPPED_ROW, status: "done", refs: { panel_id: a.panel_id, ask_id: a.ask } }, now) : await planUpdate(store, who, existing.row_id, { status: "done", outcome: STOPPED_ROW });
  if (write === null) throw new Error("the answer's row is not there to finish");
  return write.record;
}

/** Stops the wait on one step, as its own commit, run in `queue`. Returns how many answers it finished. */
export async function stopWaiting(store: DurableStore, tenant: string, step: string, queue: PanelQueue, who?: Who, now?: Date): Promise<number> {
  return queue(async () => {
    const planned = await planStopWaiting(store, tenant, step, who, now);
    if (planned.count > 0) await store.commit({ appends: [], records: planned.records });
    return planned.count;
  });
}

/**
 * The one test for whether an answer waits for the agent: `waiting_on = agent`. A record written before `waiting_on` existed reads as
 * waiting for the agent until the agent has replied. Every place that asks "is this answer waiting?" uses this.
 */
export const waitsForAgent = (a: { readonly replied: boolean; readonly waiting_on?: "agent" | "person" | "none" }): boolean => (a.waiting_on ?? (a.replied ? "none" : "agent")) === "agent";

/** Acceptance of a step is blocked while any answer on it waits for the agent. Nothing else blocks it (store-design-v2 section 3). */
export const acceptanceBlocked = (answers: readonly { readonly step: string | null; readonly replied: boolean; readonly waiting_on?: "agent" | "person" | "none" }[], stepId: string): boolean => answers.some((a) => a.step === stepId && waitsForAgent(a));

export const WAITING_WORDS = "You answered an agent about this step and it has not replied yet, so the step cannot be accepted. Wait for the agent to say where your answer went, or choose to stop waiting.";

/**
 * What the person agreed to, kept apart from the panel so it outlives the panel. An agent that recreates a question the person
 * answered, with other words, options, consequences, input kind or resolution, is refused, even after the panel was removed or the
 * desk restarted. One record per answered question: `agreed:<panel>:<question>`.
 */
export const AGREED_COLLECTION = "horizon-agreed-answers";

/** The question as the panel model normalises it, as far as the agreement needs it. */
export interface AgreedQuestion {
  readonly id: string;
  readonly question: string;
  readonly options: readonly { readonly option_id: string; readonly label: string; readonly consequence?: string | null }[];
  readonly input?: string;
  readonly resolves?: string | null;
}

/** A hash of the panel, the question id, its text, options (with consequences), input kind and what it resolves. */
export function agreedFingerprint(panelId: string, q: AgreedQuestion): string {
  return createHash("sha256").update(JSON.stringify([panelId, q.id, q.question, q.options.map((o) => [o.option_id, o.label, o.consequence ?? null]), q.input ?? "select", q.resolves ?? null])).digest("hex");
}

export const agreedId = (scope: string, panelId: string, ask: string): string => `agreed:${scope}:${panelId}:${ask}`;

export async function agreedFingerprintOf(store: DurableStore, tenant: string, panelId: string, ask: string): Promise<string | null> {
  const row = await store.getRecord(AGREED_COLLECTION, agreedId(tenant, panelId, ask));
  if (row === null || row === undefined) return null;
  const fingerprint = (row.value as { fingerprint?: unknown }).fingerprint;
  return typeof fingerprint === "string" ? fingerprint : null;
}

export const NOTHING_SENT = "Nothing was sent. Try again.";

/**
 * The records that move a question that waits for an agent to another registered agent: every answer record of that question takes the
 * new owner, and the conversation row that names both display names is in the same set. The caller commits them with the panel record.
 * The checks are the pairing, the target, and the second confirm (see checkReassign). Nothing is written here.
 */
export async function planReassign(
  store: DurableStore,
  input: {
    readonly tenant: string; readonly panel_id: string; readonly ask: string; readonly question: string;
    readonly from_key: string; readonly to_key: string; readonly from_name: string; readonly to_name: string;
    readonly paired: boolean; readonly pairedAgeMs: number | null; readonly targetRegistered: boolean; readonly confirmed: boolean;
    readonly who: Who; readonly now: Date;
  },
): Promise<{ readonly ok: true; readonly records: CommitRecord[]; readonly changed: number } | { readonly ok: false; readonly message: string }> {
  const rows = (await readAnswerRows(store, input.tenant, input.panel_id)).filter((r) => r.answer.ask === input.ask);
  const waiting = rows.filter((r) => waitsForAgent(r.answer)).at(-1)?.answer;
  if (waiting === undefined) return { ok: false, message: "No answer is waiting for an agent on that question, so there is no owner to change. Nothing was changed." };
  const state = { owner_key: waiting.owner_key ?? null, fingerprint: waiting.fingerprint ?? null, outcome: waiting.outcome, replied: waiting.replied, waiting_on: waiting.waiting_on ?? "agent", history: waiting.history ?? [], routed_as: waiting.routed_as ?? null, version: waiting.version ?? null } as const;
  if (state.owner_key !== input.from_key) return { ok: false, message: "The owner changed while you were looking. Look again, then try. Nothing was changed." };
  const verdict = checkReassign({ state, paired: input.paired, pairedAgeMs: input.pairedAgeMs ?? Number.POSITIVE_INFINITY, newOwnerKey: input.to_key, targetRegistered: input.targetRegistered, confirmed: input.confirmed });
  if (!verdict.ok) return { ok: false, message: verdict.message };
  const when = input.now.toISOString();
  const entry = { from_key: input.from_key, to_key: input.to_key, from_name: input.from_name, to_name: input.to_name, at: when };
  // Only the current owner changes. The authorship fields (asked_by, asked_by_key) stay as the agent that asked wrote them, and
  // each record gets the reassignment in its list. Each write commits against the version this read saw.
  const records: CommitRecord[] = rows.map((r) => ({ collection: PANEL_ANSWERS_COLLECTION, id: answerIdOf(r.answer.tenant, r.answer.panel_id, r.answer.n), expectedVersion: r.version, value: storedOf({ ...r.answer, owner_key: input.to_key, reassignments: [...(r.answer.reassignments ?? []), entry] }) }));
  // A completed note that names the panel and the question, as an unanswered question's move does. It is not a waiting row: the
  // answer's own row is the one that waits, and the route finishes it.
  const row = newRowRecord(input.who, { source: "you", kind: "note", words: `Moved the question "${input.question}" from ${input.from_name} to ${input.to_name}.`, outcome: `${input.to_name} now answers for it, since ${when}.`, status: "done", refs: { panel_id: input.panel_id, ask_id: input.ask } }, input.now);
  return { ok: true, records: [...records, row], changed: records.length };
}

/** The words an unrouted answer from before the upgrade is closed with, when no owner was recorded for it. */
export const PRE_UPGRADE_WORDS = "Answered before the upgrade; the owner was not recorded.";

/**
 * Writes the state of every answer record that has none yet, derived once from its old fields (`statusOfLegacy`). The derived
 * compatibility fields are dropped from the stored record. Runs before any read that needs states; a second run writes nothing.
 * Returns how many records it wrote.
 */
export async function migrateAnswerStates(store: DurableStore, tenant: string): Promise<number> {
  const records: CommitRecord[] = [];
  for (const row of await store.listRecords(PANEL_ANSWERS_COLLECTION, { tenant })) {
    if (!row.id.startsWith("answer:")) continue;
    const value = row.value as { readonly [key: string]: unknown };
    if (typeof value.state === "string") continue;
    const legacy = { outcome: (value.outcome as string | null | undefined) ?? null, replied: value.replied as boolean | undefined, waiting_on: value.waiting_on as WaitingOn | undefined, routed_as: value.routed_as as string | null | undefined };
    const state = statusOfLegacy(legacy);
    records.push({ collection: PANEL_ANSWERS_COLLECTION, id: row.id, expectedVersion: row.version, value: storedOf({ ...value, state, finished_by: state === "finished" ? finishedByOf(legacy.routed_as) : null }) });
  }
  if (records.length > 0) await store.commit({ appends: [], records });
  return records.length;
}

/**
 * The pre-upgrade close, retired. It used to finish every unrouted answer with no recorded owner as stopped, so acceptance went ahead
 * without the person's decision. Those waits now stay outstanding: the person reassigns them or stops waiting. Legacy records are not
 * rewritten here. The version stays in the migration list so an upgraded desk's marker still reads; this writes nothing and returns 0.
 */
export async function migratePreUpgradeAnswers(_store: DurableStore, _tenant: string, _now: Date): Promise<number> {
  return 0;
}

/**
 * Seals every question a committed answer or cancel answered (design v3, finding 3): each gets its guard record, `question:<panel>:<ask>`,
 * which refuses a second answer. A legacy answer keeps its unknown wording, so no fingerprint is invented here. Runs once; a second run
 * finds every guard in place and writes nothing. Returns how many guards it wrote.
 */
export async function migrateSealedQuestions(store: DurableStore, tenant: string): Promise<number> {
  const guards = new Set((await store.listRecords(PANEL_ANSWERS_COLLECTION, { tenant })).map((r) => r.id).filter((id) => id.startsWith("question:")));
  const records: CommitRecord[] = [];
  for (const a of await listAnswers(store, tenant)) {
    if (a.outcome !== "answered" && a.outcome !== "cancelled") continue;
    const id = guardIdOf(tenant, a.panel_id, a.ask);
    if (guards.has(id)) continue;
    guards.add(id);
    records.push({ collection: PANEL_ANSWERS_COLLECTION, id, expectedVersion: 0, value: { tenant, panel_id: a.panel_id, ask: a.ask, outcome: a.outcome, n: a.n, at: a.at } as { readonly [key: string]: Json } });
  }
  if (records.length > 0) await store.commit({ appends: [], records });
  return records.length;
}

/** The record that marks a question whose stored answers contradict each other (finding R2-10). `conflict:<panel>:<ask>`. */
export const conflictIdOf = (scope: string, panel: string, ask: string): string => `conflict:${scope}:${panel}:${ask}`;

/** The words a route on a conflicted question gets. The person decides which answer stands; the desk never picks one. */
export const CONFLICTED_WORDS = "Two answers to this question disagree about its value or its owner, so the desk will not route it. The person needs to decide which one stands. Nothing was changed.";

/** Whether the question's answers were marked as contradictory. Reads only. */
export async function conflictOf(store: DurableStore, tenant: string, panelId: string, askId: string): Promise<boolean> {
  const row = await store.getRecord(PANEL_ANSWERS_COLLECTION, conflictIdOf(tenant, panelId, askId));
  return row !== null && row !== undefined && (row.value as { readonly cleared?: unknown }).cleared !== true;
}

/** Every question whose stored answers were marked as contradictory, with the answer numbers they hold. Reads only. */
export async function listConflicts(store: DurableStore, tenant: string): Promise<{ readonly panel_id: string; readonly ask: string; readonly answers: readonly number[] }[]> {
  const out: { readonly panel_id: string; readonly ask: string; readonly answers: readonly number[] }[] = [];
  for (const row of await store.listRecords(PANEL_ANSWERS_COLLECTION, { tenant })) {
    if (!row.id.startsWith("conflict:")) continue;
    const value = row.value as { readonly panel_id?: unknown; readonly ask?: unknown; readonly answers?: unknown; readonly cleared?: unknown };
    if (value.cleared === true || typeof value.panel_id !== "string" || typeof value.ask !== "string") continue;
    out.push({ panel_id: value.panel_id, ask: value.ask, answers: Array.isArray(value.answers) ? value.answers.filter((n): n is number => typeof n === "number") : [] });
  }
  return out.sort((a, b) => (a.panel_id === b.panel_id ? (a.ask < b.ask ? -1 : a.ask > b.ask ? 1 : 0) : a.panel_id < b.panel_id ? -1 : 1));
}

/**
 * Migration (finding R2-9 and R2-10). Reconciles the sealed identities of the questions the store holds:
 *  - every standalone agreement (`agreed:<panel>:<ask>`) gets its guard, `question:<panel>:<ask>`, so the question cannot be answered
 *    again even when its answer record is gone;
 *  - every question with two committed answers that differ in value or owner is marked `conflict:<panel>:<ask>`. Its answers are kept as
 *    they are; routing refuses the question until the person decides. Nothing here picks an answer.
 * Runs once; a second run writes nothing. Returns how many records it wrote.
 */
export async function migrateReconcile(store: DurableStore, tenant: string): Promise<number> {
  const records: CommitRecord[] = [];
  const guards = new Set((await store.listRecords(PANEL_ANSWERS_COLLECTION, { tenant })).map((r) => r.id));
  for (const row of await store.listRecords(AGREED_COLLECTION, { tenant })) {
    const value = row.value as { readonly panel_id?: unknown; readonly ask?: unknown; readonly fingerprint?: unknown; readonly at?: unknown };
    if (typeof value.panel_id !== "string" || typeof value.ask !== "string") continue;
    const id = guardIdOf(tenant, value.panel_id, value.ask);
    if (guards.has(id)) continue;
    guards.add(id);
    records.push({ collection: PANEL_ANSWERS_COLLECTION, id, expectedVersion: 0, value: { tenant, panel_id: value.panel_id, ask: value.ask, outcome: "answered", n: 0, at: typeof value.at === "string" ? value.at : new Date(0).toISOString(), fingerprint: typeof value.fingerprint === "string" ? value.fingerprint : null, from_agreement: true } as { readonly [key: string]: Json } });
  }
  const groups = new Map<string, PanelAnswer[]>();
  for (const a of await listAnswers(store, tenant)) {
    // Only a committed answer or cancel can contradict another. A legacy "deferred" record is a not-yet and never counts (R4-3).
    if (a.outcome !== "answered" && a.outcome !== "cancelled") continue;
    const key = `${a.panel_id}\n${a.ask}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  for (const answers of groups.values()) {
    const distinct = new Set(answers.map((a) => JSON.stringify([a.owner_key ?? null, a.outcome, a.value ?? null])));
    if (distinct.size < 2) continue;
    const { panel_id, ask } = answers[0]!;
    const id = conflictIdOf(tenant, panel_id, ask);
    if (await store.getRecord(PANEL_ANSWERS_COLLECTION, id)) continue;
    records.push({ collection: PANEL_ANSWERS_COLLECTION, id, expectedVersion: 0, value: { tenant, panel_id, ask, answers: answers.map((a) => a.n), owners: [...new Set(answers.map((a) => a.owner_key ?? null))].map((k) => k ?? "") } as { readonly [key: string]: Json } });
  }
  if (records.length > 0) await store.commit({ appends: [], records });
  return records.length;
}

/** The version of the repair that clears conflict markers migration 5 wrongly raised (desk-migrations.ts, version 8). */
export const CONFLICT_REPAIR_VERSION = 8;

/**
 * Migration 8 (finding R4-3). Migration 5 counted a legacy "deferred" record as a committed answer, so a "not yet" followed by a real answer
 * was marked as a contradiction and routing refused a question with one committed answer. This recomputes every conflict marker over the
 * committed answers (answered or cancelled) only. A marker whose committed answers no longer disagree is marked `cleared` with this version:
 * the marker is not deleted, and no answer record is rewritten. A marker that still disagrees (a genuine contradiction) is left as it is.
 * Runs once; a second run finds every marker already cleared or still genuine, and writes nothing. Returns how many markers it wrote.
 */
export async function migrateConflictRepair(store: DurableStore, tenant: string): Promise<number> {
  const answers = await listAnswers(store, tenant);
  const records: CommitRecord[] = [];
  for (const row of await store.listRecords(PANEL_ANSWERS_COLLECTION, { tenant })) {
    if (!row.id.startsWith("conflict:")) continue;
    const value = row.value as { readonly [key: string]: Json };
    if (value.cleared === true || typeof value.panel_id !== "string" || typeof value.ask !== "string") continue;
    const panel = value.panel_id;
    const ask = value.ask;
    const committed = answers.filter((a) => a.panel_id === panel && a.ask === ask && (a.outcome === "answered" || a.outcome === "cancelled"));
    const distinct = new Set(committed.map((a) => JSON.stringify([a.owner_key ?? null, a.outcome, a.value ?? null])));
    if (distinct.size >= 2) continue;
    records.push({ collection: PANEL_ANSWERS_COLLECTION, id: row.id, expectedVersion: row.version, value: { ...value, cleared: true, cleared_by: CONFLICT_REPAIR_VERSION } });
  }
  if (records.length > 0) await store.commit({ appends: [], records });
  return records.length;
}

/**
 * Migration (finding R3-6). An origin/main answer with outcome "deferred" was a "not yet": it waits for nobody. Before it was recognised,
 * it was read as waiting for the agent, so a republish left it deferred and blocked the step. This repairs every stored record that still
 * carries the legacy outcome: it becomes put off, its outcome is cleared as a new "not yet" clears it, and its history names the deferral.
 * Runs once per tenant (the version is the list's next number); a second run finds no legacy outcome and writes nothing. Returns how many
 * records it wrote.
 */
export async function migrateDeferredAnswers(store: DurableStore, tenant: string): Promise<number> {
  const records: CommitRecord[] = [];
  for (const row of await store.listRecords(PANEL_ANSWERS_COLLECTION, { tenant })) {
    if (!row.id.startsWith("answer:")) continue;
    const value = row.value as { readonly [key: string]: unknown };
    if (value.outcome !== LEGACY_DEFERRED) continue;
    const at = typeof value.at === "string" ? value.at : new Date(0).toISOString();
    const history = Array.isArray(value.history) ? (value.history as { readonly outcome?: unknown }[]) : [];
    const kept = history.some((h) => h.outcome === LEGACY_DEFERRED) ? history : [...history, { outcome: LEGACY_DEFERRED, at }];
    records.push({ collection: PANEL_ANSWERS_COLLECTION, id: row.id, expectedVersion: row.version, value: storedOf({ ...value, outcome: null, value: null, state: "put_off", finished_by: null, history: kept }) });
  }
  if (records.length > 0) await store.commit({ appends: [], records });
  return records.length;
}
