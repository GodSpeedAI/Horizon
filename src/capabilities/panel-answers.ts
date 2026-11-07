/**
 * What the operator answered to an agent's question (stage 4). One record per answer in `horizon-panel-answers`, keyed
 * `answer:<panel_id>:<n>`. An answer starts with `replied: false` ("waiting for the agent to say where it went"). It is closed
 * only when the agent sends `answer.route` with `routed_as`, at least 6 characters saying where the answer went (or when the
 * operator says to stop waiting). No other agent call closes it. While a step has an open answer, accepting that step is blocked.
 */
import type { DurableStore, Json } from "@godspeedai/cognate-events";

export const PANEL_ANSWERS_COLLECTION = "horizon-panel-answers";
export const OUTCOMES = ["answered", "deferred", "cancelled"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export type AnswerValue = string | readonly string[] | boolean;

export interface PanelAnswer {
  readonly tenant: string;
  readonly panel_id: string;
  readonly n: number;
  readonly ask: string;
  readonly outcome: Outcome;
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
  return rows.map((r) => r.value as unknown as PanelAnswer).filter((a) => panelId === undefined || a.panel_id === panelId).sort((a, b) => (a.panel_id === b.panel_id ? a.n - b.n : a.panel_id < b.panel_id ? -1 : 1));
}

export async function recordAnswer(
  store: DurableStore,
  input: { readonly tenant: string; readonly panel_id: string; readonly ask: string; readonly outcome: Outcome; readonly value?: AnswerValue | null; readonly note?: string | null; readonly step?: string | null; readonly version?: string | null; readonly now: Date },
): Promise<PanelAnswer> {
  for (let attempt = 0; ; attempt += 1) {
    const existing = await listAnswers(store, input.tenant, input.panel_id);
    const n = (existing.at(-1)?.n ?? 0) + 1;
    const answer: PanelAnswer = { tenant: input.tenant, panel_id: input.panel_id, n, ask: input.ask, outcome: input.outcome, value: input.value ?? null, note: input.note ?? null, at: input.now.toISOString(), version: input.version ?? null, replied: false, step: input.step ?? null };
    try {
      await store.commit({ appends: [], records: [{ collection: PANEL_ANSWERS_COLLECTION, id: idOf(input.panel_id, n), expectedVersion: 0, value: answer as unknown as { readonly [key: string]: Json } }] });
      return answer;
    } catch (error) {
      if (attempt >= 3) throw error;
    }
  }
}

async function markWhere(store: DurableStore, tenant: string, pick: (a: PanelAnswer) => boolean, note: string | null, routedAs: string | null = null): Promise<number> {
  let changed = 0;
  for (const a of await listAnswers(store, tenant)) {
    if (a.replied || !pick(a)) continue;
    const row = await store.getRecord(PANEL_ANSWERS_COLLECTION, idOf(a.panel_id, a.n));
    if (row === null || row === undefined) continue;
    await store.commit({ appends: [], records: [{ collection: PANEL_ANSWERS_COLLECTION, id: idOf(a.panel_id, a.n), expectedVersion: row.version, value: { ...a, replied: true, routed_as: routedAs, note: a.note ?? note } as unknown as { readonly [key: string]: Json } }] });
    changed += 1;
  }
  return changed;
}

export const MIN_ROUTED_AS = 6;
export const MAX_ROUTED_AS = 300;
export const TOO_SHORT_ROUTE = "Say where the answer went in at least 6 characters, for example \"step handoff_0a49 in Seed: triage inbox\" or \"no action: <why>\".";

/**
 * The agent says where an answer went: `answer.route { panel_id, ask_id, routed_as }`. Every open answer to that question is
 * closed and keeps the words. A `routed_as` that is too short is refused and nothing changes.
 */
export async function routeAnswer(store: DurableStore, tenant: string, panelId: string, askId: string, routedAs: unknown): Promise<{ readonly ok: true; readonly closed: number } | { readonly ok: false; readonly message: string }> {
  const words = typeof routedAs === "string" ? routedAs.trim() : "";
  if (words.length < MIN_ROUTED_AS) return { ok: false, message: TOO_SHORT_ROUTE };
  if (words.length > MAX_ROUTED_AS) return { ok: false, message: `Keep "where it went" to ${MAX_ROUTED_AS} characters or fewer.` };
  const closed = await markWhere(store, tenant, (a) => a.panel_id === panelId && a.ask === askId, null, words);
  return closed === 0 ? { ok: false, message: "No answer to that question is waiting for the agent." } : { ok: true, closed };
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
export const stopWaiting = (store: DurableStore, tenant: string, step: string): Promise<number> => markWhere(store, tenant, (a) => a.step === step, "You chose to stop waiting for the agent.");

/** Acceptance of a step is blocked until the agent has replied (the annex predicate). */
export const acceptanceBlocked = (answers: readonly Pick<PanelAnswer, "step" | "replied">[], stepId: string): boolean => answers.filter((a) => a.step === stepId && !a.replied).length > 0;

export const WAITING_WORDS = "You answered an agent about this step and it has not replied yet, so the step cannot be accepted. Wait for the agent to say where your answer went, or choose to stop waiting.";
