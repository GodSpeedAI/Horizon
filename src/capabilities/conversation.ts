/**
 * The desk conversation's durable side (stage 8, design 3.1 and 4): one record per row in `horizon-conversation`, in the same
 * store as the notes. It is a read model that points at the case keeper, the record keeper and the notes; it holds plain words and
 * references, never raw answers, error text or keys. Rows are private to (organization, operator), like notes.
 */
import { randomUUID } from "node:crypto";
import type { DurableStore, Json } from "@godspeedai/cognate-events";
import { panelRowFor, reduceConversation, tidyRow, waitingForDraft, windowOf, type ConversationRow, type RowKind, type RowRefs, type RowSource, type RowStatus } from "../ui/desk/conversation-model.ts";
import type { Who } from "./notes.ts";

export const CONVERSATION_COLLECTION = "horizon-conversation";

export interface NewRow {
  readonly source: RowSource;
  readonly agent_name?: string | undefined;
  readonly kind: RowKind;
  readonly words: string;
  readonly outcome: string;
  readonly status: RowStatus;
  readonly refs?: RowRefs;
}

let counter = 0;
const rowIdOf = (): string => `row:${String((counter = (counter + 1) % 1_000_000)).padStart(6, "0")}:${randomUUID().slice(0, 8)}`;
const mine = (who: Who, value: { readonly tenant?: unknown; readonly operator?: unknown }): boolean => value.tenant === who.tenant && value.operator === who.operator;
const toJson = (row: ConversationRow, who: Who): { readonly [key: string]: Json } => ({ ...(row as unknown as { [key: string]: Json }), tenant: who.tenant, operator: who.operator });
const fromRecord = (value: Record<string, unknown>): ConversationRow => {
  const { tenant: _t, operator: _o, ...row } = value;
  return row as unknown as ConversationRow;
};

/** All of this person's rows, the newest 200, oldest first. */
export async function listConversation(store: DurableStore, who: Who): Promise<ConversationRow[]> {
  const rows = (await store.listRecords(CONVERSATION_COLLECTION, { tenant: who.tenant })).filter((r) => mine(who, r.value)).map((r) => fromRecord(r.value));
  return windowOf(rows);
}

async function everyRow(store: DurableStore, who: Who): Promise<ConversationRow[]> {
  return (await store.listRecords(CONVERSATION_COLLECTION, { tenant: who.tenant })).filter((r) => mine(who, r.value)).map((r) => fromRecord(r.value));
}

async function put(store: DurableStore, who: Who, row: ConversationRow): Promise<void> {
  const current = await store.getRecord(CONVERSATION_COLLECTION, row.row_id);
  await store.commit({ appends: [], records: [{ collection: CONVERSATION_COLLECTION, id: row.row_id, expectedVersion: current?.version ?? 0, value: toJson(row, who) }] });
}

/**
 * Add a row. A panel row for a panel that already has one updates that row in place; a hand off preview for a draft that already
 * has a waiting preview updates that one. Returns the row as stored.
 */
export async function appendRow(store: DurableStore, who: Who, input: NewRow, now: Date): Promise<ConversationRow> {
  const at = now.toISOString();
  const fresh = tidyRow({ row_id: rowIdOf(), at, source: input.source, ...(input.agent_name === undefined ? {} : { agent_name: input.agent_name }), kind: input.kind, words: input.words, outcome: input.outcome, status: input.status, refs: input.refs ?? {} });
  const rows = await everyRow(store, who);
  const same = panelRowFor(rows, fresh) ?? (fresh.refs.draft_id !== undefined && fresh.status === "waiting" ? waitingForDraft(rows, fresh.refs.draft_id) : undefined);
  if (same !== undefined) {
    const next = same.kind === "panel" ? reduceConversation([same], { type: "append", row: fresh })[0]! : { ...same, at, words: fresh.words, outcome: fresh.outcome, refs: { ...same.refs, ...fresh.refs } };
    await put(store, who, next);
    return next;
  }
  await put(store, who, fresh);
  return fresh;
}

/** Change the status and outcome of one row. Returns the row, or null when it is not this person's or not there. */
export async function updateRow(store: DurableStore, who: Who, rowId: string, change: { readonly status?: RowStatus; readonly outcome?: string }): Promise<ConversationRow | null> {
  const found = await store.getRecord(CONVERSATION_COLLECTION, rowId);
  if (found === undefined || !mine(who, found.value)) return null;
  const next = reduceConversation([fromRecord(found.value)], { type: "update", row_id: rowId, ...change })[0]!;
  await put(store, who, next);
  return next;
}

/** The waiting preview of one draft, if there is one. */
export async function waitingRowForDraft(store: DurableStore, who: Who, draftId: string): Promise<ConversationRow | undefined> {
  return waitingForDraft(await everyRow(store, who), draftId);
}

/** Settle a draft's waiting preview row (done or refused); with none waiting, add a row so the move is still on record. */
export async function settleDraftRow(store: DurableStore, who: Who, draftId: string, status: "done" | "refused", outcome: string, fallback: NewRow, now: Date): Promise<ConversationRow> {
  const waiting = await waitingRowForDraft(store, who, draftId);
  if (waiting !== undefined) return (await updateRow(store, who, waiting.row_id, { status, outcome }))!;
  return appendRow(store, who, { ...fallback, status, outcome, refs: { ...fallback.refs, draft_id: draftId } }, now);
}

/** Turn a waiting proposal into a discarded one (human only). Only a waiting hand off row can be discarded. */
export async function discardRow(store: DurableStore, who: Who, rowId: string): Promise<{ readonly ok: true; readonly row: ConversationRow } | { readonly ok: false; readonly status: number; readonly message: string }> {
  const found = await store.getRecord(CONVERSATION_COLLECTION, rowId);
  if (found === undefined || !mine(who, found.value)) return { ok: false, status: 404, message: "That row could not be found." };
  const row = fromRecord(found.value);
  if (row.status !== "waiting" || (row.kind !== "handoff" && row.kind !== "handoff-proposal")) return { ok: false, status: 409, message: "Only a suggestion that is still waiting can be discarded." };
  return { ok: true, row: (await updateRow(store, who, rowId, { status: "refused", outcome: "Discarded by you. Nothing was sent." }))! };
}
