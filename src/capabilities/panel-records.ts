/**
 * The desk's open panels as durable records (design v3, steps 2 and 3). One record per panel in `horizon-panels`, keyed `panel:<panel_id>`,
 * holds the panel and its questions: wording, choices, consequences, decision target, owners, deferrals and withdrawal. A question's
 * state is stored once: on its answer record when it has one (`horizon-panel-answers`), otherwise on its panel (withdrawn). The board's
 * `answered` and `withdrawn` fields are derived from that state here and never stored. One record in `horizon-desk-board`, keyed
 * `board:<tenant>`, lists the visible panels in order. The board is a view: `loadBoard` builds it from these records, and a record it
 * cannot read is an error, never an empty board. A panel that is closed, removed or evicted only leaves the visible list; its record stays.
 */
import type { DurableStore, Json } from "@godspeedai/cognate-events";
import { listAnswers, PANEL_ANSWERS_COLLECTION, storedOf, type PanelAnswer } from "./panel-answers.ts";
import { QUESTION_STATES, statusOfLegacy, type QuestionStatus } from "./question-rules.ts";
import { hasOpenAsk, MAX_OPEN_PANELS, type Panel, type Panels, type PanelBlock } from "../ui/desk/panels-model.ts";

export const PANELS_COLLECTION = "horizon-panels";
export const BOARD_COLLECTION = "horizon-desk-board";

/** What the person sees when the saved panels cannot be read. Shown in place of the board, so the desk never looks empty. */
export const PANEL_LOAD_WORDS = "The panels saved on this desk could not be read, so no panels are shown and none can change. Nothing was changed. Check the desk's store, then restart the desk.";

/** A record that cannot be read as the board it describes. */
export class PanelLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PanelLoadError";
  }
}

/** A question an answer in the same commit is for (its record holds the state, so the panel record keeps no copy of `answered`). */
export type Answering = { readonly panel: string; readonly ask: string };

export type CommitRecord = { readonly collection: string; readonly id: string; readonly expectedVersion: number; readonly value: { readonly [key: string]: Json } };

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const panelIdOf = (id: string): string => `panel:${id}`;
const boardIdOf = (tenant: string): string => `board:${tenant}`;

/** A panel record must have the fields the board reads. Anything else is refused as unreadable. */
export function readPanel(value: unknown): Panel {
  if (!isRec(value)) throw new PanelLoadError("A saved panel is not a record.");
  const ok = typeof value.id === "string" && typeof value.title === "string" && (typeof value.step === "string" || value.step === null) && typeof value.pinned === "boolean" && Array.isArray(value.blocks) && value.blocks.every((b) => isRec(b) && typeof b.kind === "string") && Array.isArray(value.notes) && (value.owner_key === undefined || value.owner_key === null || typeof value.owner_key === "string");
  if (!ok) throw new PanelLoadError("A saved panel is missing a field the board needs.");
  return value as unknown as Panel;
}

/** The newest answer record of one question, if it has one. */
const latestOf = (answers: readonly PanelAnswer[], panelId: string, askId: string): PanelAnswer | undefined => answers.filter((a) => a.panel_id === panelId && a.ask === askId).at(-1);

/**
 * A question block as the board shows it. With an answer record, `answered` and `withdrawn` follow its state; without one, the block's
 * own stored `withdrawn` stands, and a legacy `answered` is kept as it was (the only copy that exists for it).
 */
function derivedBlock(panelId: string, block: PanelBlock, answers: readonly PanelAnswer[]): PanelBlock {
  if (block.kind !== "question") return block;
  // The stored state of a question with no answer record is kept on its panel record; the board does not show it.
  const { state: _stored, ...plain } = block as PanelBlock & { readonly state?: unknown };
  const latest = latestOf(answers, panelId, block.id);
  if (latest === undefined) return plain as unknown as PanelBlock;
  const status: QuestionStatus = statusOfLegacy(latest);
  const answered = status === "put_off" ? { outcome: "deferred", value: null, note: latest.note, routed_as: null } : status === "waiting_for_agent" || status === "finished" ? { outcome: latest.outcome, value: latest.value, note: latest.note, routed_as: latest.routed_as ?? null } : null;
  const withdrawn = status === "withdrawn" ? (block.withdrawn ?? { reason: "" }) : null;
  return { ...plain, answered, withdrawn } as unknown as PanelBlock;
}

/** The panel as the board shows it, with its question states derived. */
function derivedPanel(panel: Panel, answers: readonly PanelAnswer[]): Panel {
  return { ...panel, blocks: panel.blocks.map((b) => derivedBlock(panel.id, b, answers)) };
}

/** The panel as it is stored: a question whose answer record holds its state does not store `answered`. */
function storedPanel(panel: Panel, tenant: string, answers: readonly PanelAnswer[], answering?: Answering): { readonly [key: string]: Json } {
  const blocks = panel.blocks.map((b) => questionBlockFor(panel.id, b, answers, answering));
  return { ...(({ ...panel, blocks }) as unknown as { readonly [key: string]: Json }), tenant };
}

/**
 * The question block as its panel record stores it (design v3, step 4, item 5). A question with an answer record keeps its state there,
 * so the block stores neither `answered` nor a state. A question with no answer record stores its own state, explicitly: waiting for
 * you, or withdrawn.
 */
function questionBlockFor(panelId: string, block: PanelBlock, answers: readonly PanelAnswer[], answering?: Answering): PanelBlock {
  if (block.kind !== "question") return block;
  const { state: _state, ...rest } = block as PanelBlock & { readonly state?: unknown };
  // The answer being written in the same commit is not in `answers` yet: its record holds the state, so the block keeps no copy.
  const answeredNow = answering !== undefined && answering.panel === panelId && answering.ask === block.id;
  if (answeredNow || latestOf(answers, panelId, block.id) !== undefined) {
    const { answered: _answered, ...kept } = rest as PanelBlock & { readonly answered?: unknown };
    return kept as PanelBlock;
  }
  // No answer record: a block that still carries an answer (written before answer records) keeps it, the only copy there is.
  if ((rest as { readonly answered?: unknown }).answered != null) return rest as PanelBlock;
  const withdrawn = (rest as { readonly withdrawn?: unknown }).withdrawn;
  return { ...rest, state: withdrawn ? "withdrawn" : "waiting_for_you" } as unknown as PanelBlock;
}

const isStored = (value: unknown): value is QuestionStatus => typeof value === "string" && (QUESTION_STATES as readonly string[]).includes(value);

/**
 * The state of one question, read from the records: its answer record when it has one, otherwise the state its panel record stores.
 * Undefined when the question is not stored at all. Reads only.
 */
export async function questionStateOf(store: DurableStore, tenant: string, panelId: string, askId: string): Promise<QuestionStatus | undefined> {
  const latest = latestOf(await listAnswers(store, tenant, panelId), panelId, askId);
  if (latest !== undefined) return statusOfLegacy(latest);
  const row = await store.getRecord(PANELS_COLLECTION, panelIdOf(panelId));
  if (row === null || row === undefined) return undefined;
  const block = readPanel(row.value).blocks.find((b) => b.kind === "question" && b.id === askId) as (PanelBlock & { readonly state?: unknown; readonly answered?: { readonly outcome?: string } | null; readonly withdrawn?: unknown }) | undefined;
  if (block === undefined) return undefined;
  if (isStored(block.state)) return block.state;
  if (block.answered != null) return block.answered.outcome === "deferred" ? "put_off" : "finished";
  return block.withdrawn ? "withdrawn" : "waiting_for_you";
}

/**
 * Migration (design v3, step 4, item 5): every question with no answer record gets its explicit state on its panel record. Runs once;
 * a second run finds nothing to change. Returns how many panel records it wrote.
 */
export async function migrateQuestionStates(store: DurableStore, tenant: string): Promise<number> {
  const answers = await listAnswers(store, tenant);
  const records: CommitRecord[] = [];
  for (const row of await store.listRecords(PANELS_COLLECTION, { tenant })) {
    const panel = readPanel(row.value);
    const blocks = panel.blocks.map((b) => questionBlockFor(panel.id, b, answers));
    const changed = blocks.some((b, i) => JSON.stringify(b) !== JSON.stringify(panel.blocks[i]));
    if (!changed) continue;
    records.push({ collection: PANELS_COLLECTION, id: row.id, expectedVersion: row.version, value: { ...(row.value as { readonly [key: string]: Json }), blocks: blocks as unknown as Json } });
  }
  if (records.length > 0) await store.commit({ appends: [], records });
  return records.length;
}

/** The board as the records hold it, plus every stored panel (visible or not) so a closed panel can be brought back. */
export interface BoardView {
  readonly board: Panels;
  readonly stored: ReadonlyMap<string, Panel>;
}

/**
 * Builds the board from the records. Reads only; a record that cannot be read throws PanelLoadError, and the caller shows the error.
 */
export async function loadBoard(store: DurableStore, tenant: string): Promise<BoardView> {
  const answers = await listAnswers(store, tenant);
  const stored = new Map<string, Panel>();
  for (const row of await store.listRecords(PANELS_COLLECTION, { tenant })) {
    const panel = readPanel(row.value);
    stored.set(panel.id, derivedPanel(panel, answers));
  }
  const desk = await store.getRecord(BOARD_COLLECTION, boardIdOf(tenant));
  let visible: string[] = [];
  if (desk !== null && desk !== undefined) {
    const value = desk.value as unknown;
    if (!isRec(value) || !Array.isArray(value.visible) || !value.visible.every((id) => typeof id === "string")) throw new PanelLoadError("The saved board order is not readable.");
    visible = value.visible as string[];
  }
  const open = visible.map((id) => {
    const panel = stored.get(id);
    if (panel === undefined) throw new PanelLoadError("The saved board lists a panel that has no record.");
    return panel;
  });
  if (open.length > MAX_OPEN_PANELS) throw new PanelLoadError("The saved board lists more panels than the desk shows.");
  return { board: { open, max: MAX_OPEN_PANELS }, stored };
}

/**
 * The records that bring the stored panels and the visible order to `after`, given the board `before`. A panel whose content
 * changed is written; the visible order is written when it changed. Each write carries the version it was checked against.
 * Nothing is deleted: a panel that left the visible list keeps its record.
 */
export async function boardWrites(store: DurableStore, tenant: string, before: Panels, after: Panels, answering?: Answering): Promise<CommitRecord[]> {
  const records: CommitRecord[] = [];
  const answers = await listAnswers(store, tenant);
  const was = new Map(before.open.map((p) => [p.id, JSON.stringify(p)] as const));
  for (const panel of after.open) {
    if (was.get(panel.id) === JSON.stringify(panel)) continue;
    const id = panelIdOf(panel.id);
    const current = await store.getRecord(PANELS_COLLECTION, id);
    records.push({ collection: PANELS_COLLECTION, id, expectedVersion: current?.version ?? 0, value: storedPanel(panel, tenant, answers, answering) });
  }
  const order = (p: Panels): string => p.open.map((x) => x.id).join("\n");
  if (order(before) !== order(after)) {
    const current = await store.getRecord(BOARD_COLLECTION, boardIdOf(tenant));
    records.push({ collection: BOARD_COLLECTION, id: boardIdOf(tenant), expectedVersion: current?.version ?? 0, value: { tenant, visible: after.open.map((p) => p.id) } as { readonly [key: string]: Json } });
  }
  return records;
}

/**
 * The answer records that move a question to the state the board now shows it in: put off becomes waiting for you when the agent
 * puts it up again; a withdrawn question is withdrawn. A question whose answer already waits for the agent or is finished is left alone.
 * Written in the same commit as the board change that caused it.
 */
export async function stateWrites(store: DurableStore, tenant: string, after: Panels): Promise<CommitRecord[]> {
  const answers = await listAnswers(store, tenant);
  const records: CommitRecord[] = [];
  for (const panel of after.open) {
    for (const block of panel.blocks) {
      if (block.kind !== "question") continue;
      const latest = latestOf(answers, panel.id, block.id);
      if (latest === undefined) continue;
      const q = block as unknown as { readonly answered?: { readonly outcome?: string } | null; readonly withdrawn?: unknown };
      const want: QuestionStatus | null = q.withdrawn ? "withdrawn" : q.answered == null ? "waiting_for_you" : q.answered.outcome === "deferred" ? "put_off" : null;
      if (want === null || want === statusOfLegacy(latest)) continue;
      const id = `answer:${panel.id}:${latest.n}`;
      const row = await store.getRecord(PANEL_ANSWERS_COLLECTION, id);
      if (row === null || row === undefined) continue;
      records.push({ collection: PANEL_ANSWERS_COLLECTION, id, expectedVersion: row.version, value: { ...storedOf(latest), state: want, finished_by: null } as { readonly [key: string]: Json } });
    }
  }
  return records;
}

/**
 * Brings a panel that is not visible back onto the board, so an agent's put or the person's open merges with what was stored (its
 * questions, their answers and deferrals). Makes room the same way the board does (only a panel with no open question and not
 * pinned goes). If there is no room, the board is returned unchanged and the rule that adds a panel refuses it.
 */
export function withStored(board: Panels, stored: ReadonlyMap<string, Panel>, id: string): Panels {
  if (board.open.some((p) => p.id === id)) return board;
  const panel = stored.get(id);
  if (panel === undefined) return board;
  let open = [...board.open];
  while (open.length >= board.max) {
    const oldest = open.findIndex((p) => !p.pinned && !hasOpenAsk(p));
    if (oldest < 0) return board;
    open = open.filter((_, i) => i !== oldest);
  }
  return { ...board, open: [...open, panel] };
}
