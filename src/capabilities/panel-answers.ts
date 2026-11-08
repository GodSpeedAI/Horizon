/**
 * What the operator answered to an agent's question (stage 4). One record per answer in `horizon-panel-answers`, keyed
 * `answer:<panel_id>:<n>`. An answer starts with `replied: false` ("waiting for the agent to say where it went"). It is closed
 * only when the agent sends `answer.route` with `routed_as`, at least 6 characters saying where the answer went (or when the
 * operator says to stop waiting). No other agent call closes it. While a step has an open answer, accepting that step is blocked.
 */
import { createHash } from "node:crypto";
import type { DurableStore, Json } from "@godspeedai/cognate-events";
import { newRowRecord } from "./conversation.ts";
import { checkAnswer, checkReassign, checkRoute, checkRouteWords, checkStopWaiting, MAX_ROUTE_WORDS, MIN_ROUTE_WORDS, NO_ANSWER_WAITING, TOO_SHORT_ROUTE, type QuestionState } from "./question-rules.ts";
import type { Who } from "./notes.ts";

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
  /** True once the agent has said where the answer went (`routed_as`), or the operator chose to stop waiting. */
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
  /** Who the answer waits on: the agent (to say where it went), the person, or nobody. Derived for older records by `normaliseAnswer`. */
  readonly waiting_on?: "agent" | "person" | "none";
}

/** Fills the fields a record written before the upgrade does not have. The owner is the key that asked, when it was recorded. */
export function normaliseAnswer(row: PanelAnswer): PanelAnswer & { readonly owner_key: string | null; readonly fingerprint: string | null; readonly history: readonly { readonly outcome: string; readonly at: string }[]; readonly waiting_on: "agent" | "person" | "none" } {
  return {
    ...row,
    owner_key: row.owner_key ?? row.asked_by_key ?? null,
    fingerprint: row.fingerprint ?? null,
    history: row.history ?? [],
    waiting_on: row.waiting_on ?? (row.replied ? "none" : "agent"),
  };
}

const idOf = (panel: string, n: number): string => `answer:${panel}:${n}`;

export function checkValue(value: unknown): { readonly ok: true; readonly value: AnswerValue | null } | { readonly ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value === "boolean") return { ok: true, value };
  if (typeof value === "string") return value.length <= 2000 ? { ok: true, value } : { ok: false };
  if (Array.isArray(value) && value.length <= 12 && value.every((v) => typeof v === "string" && v.length <= 200)) return { ok: true, value: value as string[] };
  return { ok: false };
}

export async function listAnswers(store: DurableStore, tenant: string, panelId?: string): Promise<PanelAnswer[]> {
  const rows = await store.listRecords(PANEL_ANSWERS_COLLECTION, { tenant });
  // Only answer records: a question's guard record (`question:<panel>:<ask>`) shares the collection and is not an answer.
  return rows.filter((r) => r.id.startsWith("answer:")).map((r) => normaliseAnswer(r.value as unknown as PanelAnswer)).filter((a) => panelId === undefined || a.panel_id === panelId).sort((a, b) => (a.panel_id === b.panel_id ? a.n - b.n : a.panel_id < b.panel_id ? -1 : 1));
}

/** A question already has a committed answer (or a cancel). One answer per question: a second one is refused, and nothing is stored. */
export class QuestionAlreadyAnswered extends Error {
  constructor() {
    super("This question was already answered. Nothing was sent. Look again.");
    this.name = "QuestionAlreadyAnswered";
  }
}

const guardIdOf = (panel: string, ask: string): string => `question:${panel}:${ask}`;

export async function recordAnswer(
  store: DurableStore,
  input: { readonly tenant: string; readonly panel_id: string; readonly ask: string; readonly outcome: Outcome; readonly value?: AnswerValue | null; readonly note?: string | null; readonly step?: string | null; readonly version?: string | null; readonly asked_by?: string | null; readonly asked_by_key?: string | null; readonly fingerprint?: string | null; readonly now: Date },
): Promise<PanelAnswer> {
  const committed = input.outcome === "answered" || input.outcome === "cancelled";
  for (let attempt = 0; ; attempt += 1) {
    // The guard is the question's own record. Two answers that race both carry its version; the store refuses the second commit.
    const guard = await store.getRecord(PANEL_ANSWERS_COLLECTION, guardIdOf(input.panel_id, input.ask));
    // A guard exists only once a committed answer (or cancel) is stored. The rule decides whether the question is still open.
    // The version the person saw is checked by the desk's answer step (panels-model, reduceHuman), not here: the store has
    // no version to compare with until an answer is committed, so this check passes the version through unchanged.
    if (committed) {
      const state: QuestionState = { owner_key: input.asked_by_key ?? null, fingerprint: input.fingerprint ?? null, outcome: guard ? String((guard.value as { outcome?: unknown }).outcome) : null, replied: false, waiting_on: "none", history: [], routed_as: null, version: null };
      if (!checkAnswer({ state, seenVersion: null }).ok) throw new QuestionAlreadyAnswered();
    }
    const existing = await listAnswers(store, input.tenant, input.panel_id);
    const n = (existing.at(-1)?.n ?? 0) + 1;
    // "Not yet" is not an answer: the outcome stays null, the question keeps its history, and nobody waits for it.
    const deferred = input.outcome === "deferred";
    const answer: PanelAnswer = {
      tenant: input.tenant, panel_id: input.panel_id, n, ask: input.ask,
      outcome: deferred ? (null as unknown as Outcome) : input.outcome,
      value: deferred ? null : input.value ?? null, note: input.note ?? null, at: input.now.toISOString(), version: input.version ?? null,
      replied: deferred, step: input.step ?? null, asked_by: input.asked_by ?? null, asked_by_key: input.asked_by_key ?? null,
      owner_key: input.asked_by_key ?? null, fingerprint: input.fingerprint ?? null, history: deferred ? [{ outcome: "deferred", at: input.now.toISOString() }] : [], waiting_on: deferred ? "none" : "agent",
    };
    const records: { collection: string; id: string; expectedVersion: number; value: { readonly [key: string]: Json } }[] = [{ collection: PANEL_ANSWERS_COLLECTION, id: idOf(input.panel_id, n), expectedVersion: 0, value: answer as unknown as { readonly [key: string]: Json } }];
    if (committed) records.push({ collection: PANEL_ANSWERS_COLLECTION, id: guardIdOf(input.panel_id, input.ask), expectedVersion: guard?.version ?? 0, value: { tenant: input.tenant, panel_id: input.panel_id, ask: input.ask, outcome: input.outcome, n, at: input.now.toISOString() } });
    try {
      await store.commit({ appends: [], records });
      return answer;
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

/** Closes one answer that waits for the agent: it keeps its words, and its note or the given note. Returns false if it has gone. */
async function closeAnswer(store: DurableStore, a: PanelAnswer, note: string | null, routedAs: string | null): Promise<boolean> {
  const row = await store.getRecord(PANEL_ANSWERS_COLLECTION, idOf(a.panel_id, a.n));
  if (row === null || row === undefined) return false;
  await store.commit({ appends: [], records: [{ collection: PANEL_ANSWERS_COLLECTION, id: idOf(a.panel_id, a.n), expectedVersion: row.version, value: { ...a, replied: true, waiting_on: "none", routed_as: routedAs, note: a.note ?? note } as unknown as { readonly [key: string]: Json } }] });
  return true;
}

/**
 * The agent says where an answer went: `answer.route { panel_id, ask_id, routed_as }`. Every answer to that question that waits for
 * the agent is closed and keeps the words. `callerKey` is the agent key asking; the owner, the words and the waiting state are
 * checked by `checkRoute`. Without a `callerKey` (the store's own call, not the agent door) the owner is not checked.
 */
export async function routeAnswer(store: DurableStore, tenant: string, panelId: string, askId: string, routedAs: unknown, callerKey?: string): Promise<{ readonly ok: true; readonly closed: number } | { readonly ok: false; readonly message: string }> {
  const rows = (await listAnswers(store, tenant, panelId)).filter((a) => a.ask === askId);
  const target = rows.filter(waitsForAgent).at(-1) ?? rows.at(-1);
  if (target === undefined) {
    const words = checkRouteWords(routedAs);
    return words.ok ? { ok: false, message: NO_ANSWER_WAITING } : { ok: false, message: words.message };
  }
  const state = answerState(target);
  const verdict = checkRoute({ state, callerKey: callerKey ?? state.owner_key, routedAs });
  if (!verdict.ok) return { ok: false, message: verdict.message };
  const words = typeof routedAs === "string" ? routedAs.trim() : "";
  let closed = 0;
  for (const a of rows.filter(waitsForAgent)) if (await closeAnswer(store, a, null, words)) closed += 1;
  return closed === 0 ? { ok: false, message: NO_ANSWER_WAITING } : { ok: true, closed };
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

/** The operator chose to stop waiting for the agent about this step. Kept in the record so it is not mistaken for a reply. */
/** The operator stops waiting: every answer on the step that waits for the agent is closed, if the rule allows it. */
export async function stopWaiting(store: DurableStore, tenant: string, step: string): Promise<number> {
  let changed = 0;
  for (const a of await listAnswers(store, tenant)) {
    if (a.step !== step || !checkStopWaiting({ state: answerState(a) }).ok) continue;
    if (await closeAnswer(store, a, "You chose to stop waiting for the agent.", null)) changed += 1;
  }
  return changed;
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

const agreedId = (panelId: string, ask: string): string => `agreed:${panelId}:${ask}`;

export async function agreedFingerprintOf(store: DurableStore, panelId: string, ask: string): Promise<string | null> {
  const row = await store.getRecord(AGREED_COLLECTION, agreedId(panelId, ask));
  if (row === null || row === undefined) return null;
  const fingerprint = (row.value as { fingerprint?: unknown }).fingerprint;
  return typeof fingerprint === "string" ? fingerprint : null;
}

/** Keeps the agreement the first time the person answers; a later answer can only carry the same fingerprint (a change is refused before it gets here). */
export async function rememberAgreed(store: DurableStore, tenant: string, panelId: string, ask: string, fingerprint: string, now: Date): Promise<void> {
  if ((await agreedFingerprintOf(store, panelId, ask)) !== null) return;
  await store.commit({ appends: [], records: [{ collection: AGREED_COLLECTION, id: agreedId(panelId, ask), expectedVersion: 0, value: { tenant, panel_id: panelId, ask, fingerprint, at: now.toISOString() } as unknown as { readonly [key: string]: Json } }] });
}

export const NOTHING_SENT = "Nothing was sent. Try again.";

/**
 * The person moves a question that waits for an agent to another registered agent. Every answer record of that question takes the
 * new owner, and the conversation row that names both display names is written in the same commit. The commit is refused as a whole
 * if any record has moved since it was read. The caller checks the pairing, the target and the second confirm (see checkReassign).
 */
export async function reassignOwner(
  store: DurableStore,
  input: {
    readonly tenant: string; readonly panel_id: string; readonly ask: string; readonly question: string;
    readonly from_key: string; readonly to_key: string; readonly from_name: string; readonly to_name: string;
    readonly paired: boolean; readonly pairedAgeMs: number | null; readonly targetRegistered: boolean; readonly confirmed: boolean;
    readonly who: Who; readonly now: Date;
  },
): Promise<{ readonly ok: true; readonly changed: number } | { readonly ok: false; readonly message: string }> {
  const rows = (await listAnswers(store, input.tenant, input.panel_id)).filter((a) => a.ask === input.ask);
  const waiting = rows.filter(waitsForAgent).at(-1);
  if (waiting === undefined) return { ok: false, message: "No answer is waiting for an agent on that question, so there is no owner to change. Nothing was changed." };
  const state = { owner_key: waiting.owner_key ?? null, fingerprint: waiting.fingerprint ?? null, outcome: waiting.outcome, replied: waiting.replied, waiting_on: waiting.waiting_on ?? "agent", history: waiting.history ?? [], routed_as: waiting.routed_as ?? null, version: waiting.version ?? null } as const;
  if (state.owner_key !== input.from_key) return { ok: false, message: "The owner changed while you were looking. Look again, then try. Nothing was changed." };
  const verdict = checkReassign({ state, paired: input.paired, pairedAgeMs: input.pairedAgeMs ?? Number.POSITIVE_INFINITY, newOwnerKey: input.to_key, targetRegistered: input.targetRegistered, confirmed: input.confirmed });
  if (!verdict.ok) return { ok: false, message: verdict.message };
  const records: { readonly collection: string; readonly id: string; readonly expectedVersion: number; readonly value: { readonly [key: string]: Json } }[] = [];
  for (const row of rows) {
    const current = await store.getRecord(PANEL_ANSWERS_COLLECTION, idOf(row.panel_id, row.n));
    if (current === null || current === undefined) continue;
    records.push({ collection: PANEL_ANSWERS_COLLECTION, id: idOf(row.panel_id, row.n), expectedVersion: current.version, value: { ...row, owner_key: input.to_key, asked_by_key: input.to_key, asked_by: input.to_name } as unknown as { readonly [key: string]: Json } });
  }
  const when = input.now.toISOString();
  const row = newRowRecord(input.who, { source: "you", kind: "answer", words: `Moved the question "${input.question}" from ${input.from_name} to ${input.to_name}.`, outcome: `${input.to_name} now answers for it, since ${when}. Its answer is still waiting for them to say where it went.`, status: "waiting" }, input.now);
  try {
    await store.commit({ appends: [], records: [...records, row] });
  } catch {
    return { ok: false, message: NOTHING_SENT };
  }
  return { ok: true, changed: records.length };
}

/** The words an unrouted answer from before the upgrade is closed with, when no owner was recorded for it. */
export const PRE_UPGRADE_WORDS = "Answered before the upgrade; the owner was not recorded.";

/**
 * Closes answers written before the upgrade that have no owner and no route. They do not block acceptance after the upgrade
 * (store-design-v2 section 5). Runs once; a second run finds nothing to close. Returns how many it closed.
 */
export async function migratePreUpgradeAnswers(store: DurableStore, tenant: string, _now: Date): Promise<number> {
  let closed = 0;
  for (const a of await listAnswers(store, tenant)) {
    if (!waitsForAgent(a) || a.owner_key !== null || a.outcome === null) continue;
    const row = await store.getRecord(PANEL_ANSWERS_COLLECTION, idOf(a.panel_id, a.n));
    if (row === null || row === undefined) continue;
    await store.commit({ appends: [], records: [{ collection: PANEL_ANSWERS_COLLECTION, id: idOf(a.panel_id, a.n), expectedVersion: row.version, value: { ...a, replied: true, waiting_on: "none", routed_as: PRE_UPGRADE_WORDS} as unknown as { readonly [key: string]: Json } }] });
    closed += 1;
  }
  return closed;
}
