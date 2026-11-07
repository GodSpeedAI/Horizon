/**
 * What the operator answered to an agent's question (stage 4). One record per answer in `horizon-panel-answers`, keyed
 * `answer:<panel_id>:<n>`. An answer starts with `replied: false` and turns true when the agent replies on that panel (or when
 * the operator says to stop waiting). While a step has an answer nobody has replied to, accepting that step is blocked.
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
  readonly replied: boolean;
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
  input: { readonly tenant: string; readonly panel_id: string; readonly ask: string; readonly outcome: Outcome; readonly value?: AnswerValue | null; readonly note?: string | null; readonly step?: string | null; readonly now: Date },
): Promise<PanelAnswer> {
  for (let attempt = 0; ; attempt += 1) {
    const existing = await listAnswers(store, input.tenant, input.panel_id);
    const n = (existing.at(-1)?.n ?? 0) + 1;
    const answer: PanelAnswer = { tenant: input.tenant, panel_id: input.panel_id, n, ask: input.ask, outcome: input.outcome, value: input.value ?? null, note: input.note ?? null, at: input.now.toISOString(), replied: false, step: input.step ?? null };
    try {
      await store.commit({ appends: [], records: [{ collection: PANEL_ANSWERS_COLLECTION, id: idOf(input.panel_id, n), expectedVersion: 0, value: answer as unknown as { readonly [key: string]: Json } }] });
      return answer;
    } catch (error) {
      if (attempt >= 3) throw error;
    }
  }
}

async function markWhere(store: DurableStore, tenant: string, pick: (a: PanelAnswer) => boolean, note: string | null): Promise<number> {
  let changed = 0;
  for (const a of await listAnswers(store, tenant)) {
    if (a.replied || !pick(a)) continue;
    const row = await store.getRecord(PANEL_ANSWERS_COLLECTION, idOf(a.panel_id, a.n));
    if (row === null || row === undefined) continue;
    await store.commit({ appends: [], records: [{ collection: PANEL_ANSWERS_COLLECTION, id: idOf(a.panel_id, a.n), expectedVersion: row.version, value: { ...a, replied: true, note: a.note ?? note } as unknown as { readonly [key: string]: Json } }] });
    changed += 1;
  }
  return changed;
}

/** The agent replied on this panel: every answer waiting on it is replied to. */
export const markReplied = (store: DurableStore, tenant: string, panelId: string): Promise<number> => markWhere(store, tenant, (a) => a.panel_id === panelId, null);

/** The operator chose to stop waiting for the agent about this step. Kept in the record so it is not mistaken for a reply. */
export const stopWaiting = (store: DurableStore, tenant: string, step: string): Promise<number> => markWhere(store, tenant, (a) => a.step === step, "You chose to stop waiting for the agent.");

/** Acceptance of a step is blocked until the agent has replied (the annex predicate). */
export const acceptanceBlocked = (answers: readonly Pick<PanelAnswer, "step" | "replied">[], stepId: string): boolean => answers.filter((a) => a.step === stepId && !a.replied).length > 0;

export const WAITING_WORDS = "You answered an agent about this step and it has not replied yet, so the step cannot be accepted. Wait for the reply, or choose to stop waiting.";
