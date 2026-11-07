/**
 * The notebook's durable side (design 6; annex Stage 2). Four collections, one `commit()` per save:
 * a save writes the note, its new revision, its placements and its tags together or not at all.
 * Revisions are kept; nothing is deleted. Notes are private to (organization, operator): every list, count and search
 * leaves out what the caller may not see *before* counting. Notes are not sent to the record keeper.
 */
import { randomUUID } from "node:crypto";
import type { DurableStore, Json, RecordWrite, StoredRecord } from "@godspeedai/cognate-events";
import { checkNote, type NoteLink } from "../domain/note.ts";

export const NOTE_COLLECTION = "horizon-notes";
export const NOTE_REVISION_COLLECTION = "horizon-note-revisions";
export const NOTE_PLACEMENT_COLLECTION = "horizon-note-placements";
export const TAG_COLLECTION = "horizon-tags";

export interface NoteRecord {
  readonly note_id: string;
  readonly tenant: string;
  readonly operator: string;
  readonly created_at: string;
  readonly day: string;
  readonly case_ref: string | null;
  readonly head_rev: number;
}

export interface NoteRevision {
  readonly note_id: string;
  readonly rev: number;
  readonly body: string;
  readonly author: string;
  readonly at: string;
  readonly links: readonly NoteLink[];
  readonly tags: readonly string[];
}

export interface NoteView {
  readonly note_id: string;
  readonly day: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly author: string;
  readonly body: string;
  readonly rev: number;
  readonly case_ref: string | null;
  /** Every case this note appears on (the same note, not a copy). */
  readonly cases: readonly string[];
  readonly tags: readonly string[];
  readonly links: readonly NoteLink[];
}

export interface Who {
  readonly tenant: string;
  readonly operator: string;
}

const asJson = (value: unknown): { readonly [key: string]: Json } => value as { readonly [key: string]: Json };
const noteKey = (id: string): string => id;
export const revisionKey = (noteId: string, rev: number): string => `${noteId}:rev:${rev}`;
export const placementKey = (noteId: string, kind: "day" | "case", ref: string): string => `place:${noteId}:${kind}:${ref}`;
export const tagKey = (tenant: string, name: string): string => `tag:${tenant}:${name}`;

/** The date in the chosen time zone, as YYYY-MM-DD. */
export function dayInZone(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

const mine = (who: Who, value: { readonly tenant?: unknown; readonly operator?: unknown }): boolean => value.tenant === who.tenant && value.operator === who.operator;

export class NoteRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoteRefused";
  }
}

export interface SaveNoteOptions extends Who {
  readonly input: unknown;
  readonly now: Date;
  readonly timeZone: string;
}

/** Save or edit one note: a single atomic commit. Throws `NoteRefused` with a plain sentence when the input is not acceptable. */
export async function saveNote(store: DurableStore, options: SaveNoteOptions): Promise<NoteView> {
  const checked = checkNote(options.input);
  if (!checked.ok) throw new NoteRefused(checked.message);
  const at = options.now.toISOString();
  const who: Who = { tenant: options.tenant, operator: options.operator };
  const records: RecordWrite[] = [];

  let note: NoteRecord;
  let noteVersion = 0;
  let previousTags: readonly string[] = [];
  let rev = 1;
  if (checked.note_id !== null) {
    const row = await store.getRecord(NOTE_COLLECTION, noteKey(checked.note_id));
    if (row === undefined || !mine(who, row.value)) throw new NoteRefused("That note could not be found.");
    const head = row.value as unknown as NoteRecord;
    noteVersion = row.version;
    rev = head.head_rev + 1;
    previousTags = ((await store.getRecord(NOTE_REVISION_COLLECTION, revisionKey(head.note_id, head.head_rev)))?.value as unknown as NoteRevision | undefined)?.tags ?? [];
    note = { ...head, case_ref: head.case_ref ?? checked.case_ref, head_rev: rev };
  } else {
    note = { note_id: `note:${randomUUID()}`, tenant: who.tenant, operator: who.operator, created_at: at, day: dayInZone(options.now, options.timeZone), case_ref: checked.case_ref, head_rev: 1 };
  }
  records.push({ collection: NOTE_COLLECTION, id: noteKey(note.note_id), expectedVersion: noteVersion, value: asJson(note) });
  const revision: NoteRevision = { note_id: note.note_id, rev, body: checked.body, author: who.operator, at, links: checked.links, tags: checked.tags };
  records.push({ collection: NOTE_REVISION_COLLECTION, id: revisionKey(note.note_id, rev), expectedVersion: 0, value: asJson(revision) });

  const place = async (kind: "day" | "case", ref: string): Promise<void> => {
    const id = placementKey(note.note_id, kind, ref);
    const current = await store.getRecord(NOTE_PLACEMENT_COLLECTION, id);
    if (current && current.value.removed !== true) return;
    records.push({ collection: NOTE_PLACEMENT_COLLECTION, id, expectedVersion: current?.version ?? 0, value: asJson({ note_id: note.note_id, kind, ref, at, tenant: who.tenant, operator: who.operator, removed: false }) });
  };
  await place("day", note.day);
  if (checked.case_ref !== null) await place("case", checked.case_ref);

  for (const name of new Set([...previousTags, ...checked.tags])) {
    const id = tagKey(who.tenant, name);
    const current = await store.getRecord(TAG_COLLECTION, id);
    const ids = new Set<string>(((current?.value.note_ids as readonly string[] | undefined) ?? []).slice());
    if (checked.tags.includes(name)) ids.add(note.note_id);
    else ids.delete(note.note_id);
    records.push({ collection: TAG_COLLECTION, id, expectedVersion: current?.version ?? 0, value: asJson({ name, tenant: who.tenant, note_ids: [...ids] }) });
  }

  await store.commit({ appends: [], records });
  return viewOf(note, revision, await casesOf(store, who, note.note_id));
}

/** Take a note off one case. The note stays; the placement is marked removed and the history keeps it. */
export async function removeFromCase(store: DurableStore, options: Who & { readonly noteId: string; readonly caseRef: string; readonly now: Date }): Promise<void> {
  const row = await store.getRecord(NOTE_COLLECTION, noteKey(options.noteId));
  if (row === undefined || !mine(options, row.value)) throw new NoteRefused("That note could not be found.");
  const id = placementKey(options.noteId, "case", options.caseRef);
  const current = await store.getRecord(NOTE_PLACEMENT_COLLECTION, id);
  if (current === undefined) return;
  await store.commit({ appends: [], records: [{ collection: NOTE_PLACEMENT_COLLECTION, id, expectedVersion: current.version, value: asJson({ ...current.value, removed: true, at: options.now.toISOString() }) }] });
}

function viewOf(note: NoteRecord, revision: NoteRevision, cases: readonly string[]): NoteView {
  return {
    note_id: note.note_id,
    day: note.day,
    created_at: note.created_at,
    updated_at: revision.at,
    author: revision.author,
    body: revision.body,
    rev: revision.rev,
    case_ref: note.case_ref,
    cases,
    tags: revision.tags,
    links: revision.links,
  };
}

async function casesOf(store: DurableStore, who: Who, noteId: string): Promise<string[]> {
  const rows = await store.listRecords(NOTE_PLACEMENT_COLLECTION, { note_id: noteId });
  return rows.filter((row) => row.value.kind === "case" && row.value.removed !== true && mine(who, row.value)).map((row) => String(row.value.ref));
}

async function loadView(store: DurableStore, who: Who, row: StoredRecord): Promise<NoteView | null> {
  const note = row.value as unknown as NoteRecord;
  if (!mine(who, note)) return null;
  const revision = (await store.getRecord(NOTE_REVISION_COLLECTION, revisionKey(note.note_id, note.head_rev)))?.value as unknown as NoteRevision | undefined;
  if (revision === undefined) return null;
  return viewOf(note, revision, await casesOf(store, who, note.note_id));
}

const newestFirst = (a: NoteView, b: NoteView): number => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0);

async function visibleNotes(store: DurableStore, who: Who): Promise<NoteView[]> {
  const out: NoteView[] = [];
  for (const row of await store.listRecords(NOTE_COLLECTION, { tenant: who.tenant })) {
    const view = await loadView(store, who, row);
    if (view !== null) out.push(view);
  }
  return out;
}

export async function getNote(store: DurableStore, who: Who, noteId: string): Promise<NoteView | null> {
  const row = await store.getRecord(NOTE_COLLECTION, noteKey(noteId));
  return row === undefined ? null : loadView(store, who, row);
}

/** Every earlier wording, oldest first. */
export async function noteHistory(store: DurableStore, who: Who, noteId: string): Promise<NoteRevision[]> {
  const row = await store.getRecord(NOTE_COLLECTION, noteKey(noteId));
  if (row === undefined || !mine(who, row.value)) return [];
  const revisions: NoteRevision[] = [];
  for (let rev = 1; rev <= (row.value as unknown as NoteRecord).head_rev; rev += 1) {
    const found = await store.getRecord(NOTE_REVISION_COLLECTION, revisionKey(noteId, rev));
    if (found) revisions.push(found.value as unknown as NoteRevision);
  }
  return revisions;
}

/** Notes placed on one day, oldest first (a day reads in time order). */
export async function listDay(store: DurableStore, who: Who, day: string): Promise<NoteView[]> {
  const out: NoteView[] = [];
  for (const place of await store.listRecords(NOTE_PLACEMENT_COLLECTION, { kind: "day", ref: day })) {
    if (!mine(who, place.value)) continue;
    const view = await getNote(store, who, String(place.value.note_id));
    if (view !== null) out.push(view);
  }
  return out.sort((a, b) => -newestFirst(a, b));
}

/** Notes on one case, oldest first. A note removed from the case is not listed; it still exists. */
export async function listCase(store: DurableStore, who: Who, caseRef: string): Promise<NoteView[]> {
  const out: NoteView[] = [];
  for (const place of await store.listRecords(NOTE_PLACEMENT_COLLECTION, { kind: "case", ref: caseRef })) {
    if (place.value.removed === true || !mine(who, place.value)) continue;
    const view = await getNote(store, who, String(place.value.note_id));
    if (view !== null) out.push(view);
  }
  return out.sort((a, b) => -newestFirst(a, b));
}

export interface SearchOptions {
  readonly q?: string;
  readonly day?: string;
  readonly tag?: string;
  readonly limit?: number;
}

/** Newest first. A tag is only a way to find notes; it is never read as anything else. */
export async function search(store: DurableStore, who: Who, options: SearchOptions = {}): Promise<NoteView[]> {
  let pool: NoteView[];
  if (options.tag) {
    const row = await store.getRecord(TAG_COLLECTION, tagKey(who.tenant, options.tag.trim().replace(/^#+/, "").toLowerCase()));
    pool = [];
    for (const id of (row?.value.note_ids as readonly string[] | undefined) ?? []) {
      const view = await getNote(store, who, id);
      if (view !== null) pool.push(view);
    }
  } else pool = await visibleNotes(store, who);
  const q = options.q?.trim().toLowerCase() ?? "";
  const hits = pool.filter((note) => (!options.day || note.day === options.day) && (q === "" || note.body.toLowerCase().includes(q) || note.tags.some((t) => t.includes(q))));
  return hits.sort(newestFirst).slice(0, options.limit ?? 200);
}

/** Days that have at least one note you may see, newest first, with the visible count. */
export async function listDays(store: DurableStore, who: Who): Promise<{ day: string; count: number }[]> {
  const counts = new Map<string, number>();
  for (const note of await visibleNotes(store, who)) counts.set(note.day, (counts.get(note.day) ?? 0) + 1);
  return [...counts].map(([day, count]) => ({ day, count })).sort((a, b) => (a.day < b.day ? 1 : -1));
}

/** Tags with the number of notes you may see. A tag with no visible note is not listed. */
export async function listTags(store: DurableStore, who: Who): Promise<{ name: string; count: number }[]> {
  const out: { name: string; count: number }[] = [];
  for (const row of await store.listRecords(TAG_COLLECTION, { tenant: who.tenant })) {
    let count = 0;
    for (const id of (row.value.note_ids as readonly string[] | undefined) ?? []) if ((await getNote(store, who, id)) !== null) count += 1;
    if (count > 0) out.push({ name: String(row.value.name), count });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
