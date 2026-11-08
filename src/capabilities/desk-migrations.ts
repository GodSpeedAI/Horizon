/**
 * The desk's versioned migrations (design v3, section 2 "Migrate honestly" and step 4, item 4). Each migration has a version number. The
 * record `marker:<scope>` in `horizon-desk-migrations` (the operator's scope, see deskScopeOf) holds the highest version that has run. A start runs every migration above that
 * version, in order, and writes the marker after each one. A migration that has run is never run again, and a start with nothing
 * pending writes nothing. Until the run finishes, the desk refuses every change (see app.ts), so no change is taken against records that
 * are still being moved. The whole run is one command in the desk's queue (`queue`), so no panel command runs between two migrations.
 */
import type { DurableStore, Json } from "@godspeedai/cognate-events";
import { AGREED_COLLECTION, agreedId, answerIdOf, conflictIdOf, guardIdOf, migrateDeferredAnswers, migratePreUpgradeAnswers, migrateAnswerStates, migrateReconcile, migrateSealedQuestions, PANEL_ANSWERS_COLLECTION, type PanelQueue } from "./panel-answers.ts";
import { BOARD_COLLECTION, boardIdOf, type CommitRecord, migrateQuestionStates, PANELS_COLLECTION, panelIdOf, parseDeskScope } from "./panel-records.ts";
import { REQUESTS_COLLECTION, requestIdOf } from "./desk-requests.ts";

export const MIGRATION_COLLECTION = "horizon-desk-migrations";
export const MIGRATING_WORDS = "The desk is updating its saved records. Nothing was changed. Try again in a moment.";
export const MIGRATION_FAILED_WORDS = "The desk could not update its saved records, so changes are paused. Nothing was changed. Check the desk's store, then restart the desk.";

export interface DeskMigration {
  readonly version: number;
  readonly name: string;
  /** `tenant` is the operator's scope (deskScopeOf); `sole` is the one operator in the configuration, or null when there is not exactly one. */
  /**
   * A layout migration moves records into the layout the record migrations read. It runs before them, once per scope, and its marker is
   * written after they have run, so an interrupted run runs it again (it skips what it already moved).
   */
  readonly layout?: boolean;
  readonly run: (store: DurableStore, tenant: string, now: Date, sole: string | null) => Promise<unknown>;
}

/** The migrations this desk knows, in version order. A new migration gets the next number and is appended. */
export const DESK_MIGRATIONS: readonly DeskMigration[] = [
  { version: 1, name: "answer states", run: (store, tenant) => migrateAnswerStates(store, tenant) },
  { version: 2, name: "answers from before the upgrade", run: (store, tenant, now) => migratePreUpgradeAnswers(store, tenant, now) },
  { version: 3, name: "question states", run: (store, tenant) => migrateQuestionStates(store, tenant) },
  { version: 4, name: "sealed questions", run: (store, tenant) => migrateSealedQuestions(store, tenant) },
  { version: 5, name: "reconciled identities", run: (store, tenant) => migrateReconcile(store, tenant) },
  { version: 6, name: "answers put off before the upgrade", run: (store, tenant) => migrateDeferredAnswers(store, tenant) },
  { version: 7, name: "operator scope", layout: true, run: (store, tenant, _now, sole) => migrateOperatorScope(store, tenant, sole) },
];

const markerId = (tenant: string): string => `marker:${tenant}`;

/** The highest migration version that has run for this tenant (0 when none has). */
export async function appliedVersion(store: DurableStore, tenant: string): Promise<number> {
  const row = await store.getRecord(MIGRATION_COLLECTION, markerId(tenant));
  const version = (row?.value as { readonly version?: unknown } | undefined)?.version;
  return typeof version === "number" && Number.isInteger(version) && version >= 0 ? version : 0;
}

/**
 * Runs every migration above the marker, in order, each once. The marker is written after each one, checked against the version it
 * was read at. The whole run is one command in `queue`, the desk's mutation queue, so a panel command that is queued behind it waits
 * for the run to finish and never sits between two migrations. (A command that waited for the migration while the migration waited
 * for a later queue slot would stall both; one indivisible command cannot.) `hold`, when given, is awaited inside that command before
 * anything runs (a test uses it to keep a migration pending). Returns the versions that ran, in order; a second run returns an empty list
 * and writes nothing.
 */
export async function runDeskMigrations(store: DurableStore, tenant: string, now: Date, queue: PanelQueue, migrations: readonly DeskMigration[] = DESK_MIGRATIONS, hold?: Promise<unknown>, sole: string | null = null): Promise<number[]> {
  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  return await queue(async (): Promise<number[]> => {
    if (hold !== undefined) await hold;
    const from = await appliedVersion(store, tenant);
    const pending = ordered.filter((m) => m.version > from);
    const applied: number[] = [];
    // The layout migrations run first, so the record migrations after them read the records where they now are.
    for (const migration of pending.filter((m) => m.layout === true)) {
      await migration.run(store, tenant, now, sole);
      applied.push(migration.version);
    }
    for (const migration of pending.filter((m) => m.layout !== true)) {
      await migration.run(store, tenant, now, sole);
      await writeMarker(store, tenant, migration, now);
      applied.push(migration.version);
    }
    // A layout migration writes its marker last, after the record migrations it precedes.
    const top = pending.at(-1);
    if (top?.layout === true) await writeMarker(store, tenant, top, now);
    return applied.sort((a, b) => a - b);
  });
}

/** Writes the marker at one migration's version, checked against the version the marker was read at. */
async function writeMarker(store: DurableStore, tenant: string, migration: DeskMigration, now: Date): Promise<void> {
  const current = await store.getRecord(MIGRATION_COLLECTION, markerId(tenant));
  const version = (current?.value as { readonly version?: unknown } | undefined)?.version;
  if (typeof version === "number" && migration.version <= version) return;
  await store.commit({ appends: [], records: [{ collection: MIGRATION_COLLECTION, id: markerId(tenant), expectedVersion: current?.version ?? 0, value: { tenant, version: migration.version, name: migration.name, at: now.toISOString() } }] });
}

/**
 * The id a record from before operator scoping has under its scope, or null when the record is not one this migration knows. The legacy
 * id must be the one the old code wrote for its value, so a record is only moved when its key and its fields agree.
 */
function scopedIdOf(collection: string, legacyId: string, value: Record<string, unknown>, plainTenant: string, scope: string): string | null {
  const text = (v: unknown): v is string => typeof v === "string";
  if (collection === PANELS_COLLECTION) return text(value.id) && legacyId === `panel:${value.id}` ? panelIdOf(scope, value.id) : null;
  if (collection === BOARD_COLLECTION) return legacyId === boardIdOf(plainTenant) ? boardIdOf(scope) : null;
  if (collection === REQUESTS_COLLECTION) return text(value.request_id) && legacyId === `request:${plainTenant}:${value.request_id}` ? requestIdOf(scope, value.request_id) : null;
  if (collection === AGREED_COLLECTION) return text(value.panel_id) && text(value.ask) && legacyId === `agreed:${value.panel_id}:${value.ask}` ? agreedId(scope, value.panel_id, value.ask) : null;
  if (collection === PANEL_ANSWERS_COLLECTION) {
    if (text(value.panel_id) && text(value.ask) && typeof value.n === "number" && legacyId === `answer:${value.panel_id}:${value.n}`) return answerIdOf(scope, value.panel_id, value.n);
    if (text(value.panel_id) && text(value.ask) && legacyId === `question:${value.panel_id}:${value.ask}`) return guardIdOf(scope, value.panel_id, value.ask);
    if (text(value.panel_id) && text(value.ask) && legacyId === `conflict:${value.panel_id}:${value.ask}`) return conflictIdOf(scope, value.panel_id, value.ask);
  }
  return null;
}

/**
 * Migration 7 (operator scope). Before it, a desk's panels, board order, answers, guards, agreements and request receipts were keyed and
 * filtered by tenant alone, so every operator on the tenant read one another's records. Every read now asks for the operator's scope, and
 * every key carries it. A record from before the change is moved to the scope of an operator only when that operator is provably the one
 * who wrote it: the single operator in the configuration (`sole`). Any other record is left where it is, where no operator reads it, and
 * the log says how many need recovery. Nothing is re-homed to an operator without that proof. Records are copied, never deleted.
 */
export async function migrateOperatorScope(store: DurableStore, scope: string, sole: string | null): Promise<number> {
  const { tenant: plainTenant, operator } = parseDeskScope(scope);
  const found: { readonly collection: string; readonly id: string; readonly value: Record<string, unknown> }[] = [];
  for (const collection of [PANELS_COLLECTION, PANEL_ANSWERS_COLLECTION, AGREED_COLLECTION, BOARD_COLLECTION, REQUESTS_COLLECTION]) {
    for (const row of await store.listRecords(collection, { tenant: plainTenant })) found.push({ collection, id: row.id, value: row.value as Record<string, unknown> });
  }
  if (found.length === 0) return 0;
  if (sole !== operator) {
    console.error(`desk: ${found.length} saved panel records from before operator scoping need recovery and are not shown to this operator. No record contents are logged.`);
    return 0;
  }
  const records: CommitRecord[] = [];
  let unrecognised = 0;
  for (const rec of found) {
    const id = scopedIdOf(rec.collection, rec.id, rec.value, plainTenant, scope);
    if (id === null) {
      unrecognised += 1;
      continue;
    }
    const existing = await store.getRecord(rec.collection, id);
    if (existing !== undefined && existing !== null) continue;
    records.push({ collection: rec.collection, id, expectedVersion: 0, value: { ...rec.value, tenant: scope, operator } as { readonly [key: string]: Json } });
  }
  if (unrecognised > 0) console.error(`desk: ${unrecognised} saved panel records from before operator scoping need recovery and were not moved. No record contents are logged.`);
  if (records.length > 0) await store.commit({ appends: [], records });
  return records.length;
}
