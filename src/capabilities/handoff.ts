/**
 * Hand off (design 5.3, 7): words become one step in a case. A draft has one `draftId` (a UUID) from the moment it starts until the
 * step is added; it is kept in `horizon-ui-state` as `draft:<tenant>:<operator>`, so a restart gives the same id back. The id makes
 * the request number `handoff:<draftId>` and the step's own id, so sending the same draft again can never add a second step.
 */
import { randomUUID } from "node:crypto";
import type { DurableStore } from "@godspeedai/cognate-events";
import { UI_STATE_COLLECTION } from "./workspace-records.ts";

export const DRAFT_TEXT_MAX = 2_000;
export type DraftMode = "write" | "find" | "ask" | "handoff";
export interface Draft {
  readonly draftId: string;
  readonly text: string;
  readonly mode: DraftMode;
}

const draftKey = (tenant: string, operator: string): string => `draft:${tenant}:${operator}`;
const MODES: readonly string[] = ["write", "find", "ask", "handoff"];

function read(row: { readonly value: Record<string, unknown> } | null): Draft | null {
  const v = row?.value;
  if (v === undefined || typeof v.draftId !== "string" || v.draftId === "") return null;
  return { draftId: v.draftId, text: typeof v.text === "string" ? v.text : "", mode: MODES.includes(String(v.mode)) ? (v.mode as DraftMode) : "write" };
}

async function put(store: DurableStore, tenant: string, operator: string, draft: Draft): Promise<void> {
  // Two quick writes can collide on the version; one retry reads the newer version and writes over it.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await store.getRecord(UI_STATE_COLLECTION, draftKey(tenant, operator));
    try {
      await store.commit({ appends: [], records: [{ collection: UI_STATE_COLLECTION, id: draftKey(tenant, operator), expectedVersion: current?.version ?? 0, value: { ...draft } }] });
      return;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
}

/** The operator's current draft. A draft is made (and kept) the first time it is asked for. */
export async function currentDraft(store: DurableStore, tenant: string, operator: string): Promise<Draft> {
  const found = read((await store.getRecord(UI_STATE_COLLECTION, draftKey(tenant, operator))) as never);
  if (found !== null) return found;
  const fresh: Draft = { draftId: randomUUID(), text: "", mode: "write" };
  await put(store, tenant, operator, fresh);
  return (read((await store.getRecord(UI_STATE_COLLECTION, draftKey(tenant, operator))) as never)) ?? fresh;
}

/** Keeps the text and mode of the draft with this id. Another draft's id is not overwritten. */
export async function saveDraft(store: DurableStore, tenant: string, operator: string, input: { readonly draftId: string; readonly text: string; readonly mode: DraftMode }): Promise<boolean> {
  const current = await currentDraft(store, tenant, operator);
  if (current.draftId !== input.draftId) return false;
  await put(store, tenant, operator, { draftId: current.draftId, text: input.text.slice(0, DRAFT_TEXT_MAX), mode: input.mode });
  return true;
}

/** Starts a new draft (a new id) only if the draft that was just sent is still the current one. */
export async function nextDraft(store: DurableStore, tenant: string, operator: string, sentDraftId: string): Promise<Draft> {
  const current = await currentDraft(store, tenant, operator);
  if (current.draftId !== sentDraftId) return current;
  const fresh: Draft = { draftId: randomUUID(), text: "", mode: "write" };
  await put(store, tenant, operator, fresh);
  return fresh;
}

export const handoffRequestId = (draftId: string): string => `handoff:${draftId}`;
export const handoffStepId = (draftId: string): string => `handoff_${draftId.replace(/[^A-Za-z0-9]/g, "")}`;
const VALID_DRAFT_ID = /^[0-9a-fA-F-]{36}$/;
export const validDraftId = (value: unknown): value is string => typeof value === "string" && VALID_DRAFT_ID.test(value);

/** One line to name the step. The whole text is not kept in the plan: the plan holds names, not paragraphs. */
export function stepNameOf(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 200 ? `${line.slice(0, 199)}…` : line;
}

/** The step the case keeper is asked to add. The same draft always gives the same step, so a retry is a replay. */
export function handoffItem(draftId: string, text: string, review = false): Record<string, unknown> {
  return {
    plan_item_id: handoffStepId(draftId),
    name: stepNameOf(text),
    item_kind: "human_task",
    settlement_criteria: { required_artifacts: [], required_declarations: [] },
    markers: { required: false, review },
  };
}
