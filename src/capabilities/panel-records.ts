/**
 * The desk's open panels as durable records (design v3, step 2). One record per panel in `horizon-panels`, keyed `panel:<panel_id>`,
 * holds the panel and its questions exactly as the board holds them: wording, choices, consequences, decision target, owners,
 * the answer, deferrals and withdrawal. One record in `horizon-desk-board`, keyed `board:<tenant>`, lists the visible panels in
 * order. The board is a view: `loadBoard` builds it from these records, and a record it cannot read is an error, never an empty
 * board. A panel that is closed, removed or evicted only leaves the visible list; its record stays.
 */
import type { DurableStore, Json } from "@godspeedai/cognate-events";
import { hasOpenAsk, MAX_OPEN_PANELS, type Panel, type Panels } from "../ui/desk/panels-model.ts";

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

/** The board as the records hold it, plus every stored panel (visible or not) so a closed panel can be brought back. */
export interface BoardView {
  readonly board: Panels;
  readonly stored: ReadonlyMap<string, Panel>;
}

/**
 * Builds the board from the records. Reads only; a record that cannot be read throws PanelLoadError, and the caller shows the error.
 */
export async function loadBoard(store: DurableStore, tenant: string): Promise<BoardView> {
  const stored = new Map<string, Panel>();
  for (const row of await store.listRecords(PANELS_COLLECTION, { tenant })) {
    const panel = readPanel(row.value);
    stored.set(panel.id, panel);
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
export async function boardWrites(store: DurableStore, tenant: string, before: Panels, after: Panels): Promise<CommitRecord[]> {
  const records: CommitRecord[] = [];
  const was = new Map(before.open.map((p) => [p.id, JSON.stringify(p)] as const));
  for (const panel of after.open) {
    if (was.get(panel.id) === JSON.stringify(panel)) continue;
    const id = panelIdOf(panel.id);
    const current = await store.getRecord(PANELS_COLLECTION, id);
    records.push({ collection: PANELS_COLLECTION, id, expectedVersion: current?.version ?? 0, value: { ...(panel as unknown as { readonly [key: string]: Json }), tenant } as { readonly [key: string]: Json } });
  }
  const order = (p: Panels): string => p.open.map((x) => x.id).join("\n");
  if (order(before) !== order(after)) {
    const current = await store.getRecord(BOARD_COLLECTION, boardIdOf(tenant));
    records.push({ collection: BOARD_COLLECTION, id: boardIdOf(tenant), expectedVersion: current?.version ?? 0, value: { tenant, visible: after.open.map((p) => p.id) } as { readonly [key: string]: Json } });
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
