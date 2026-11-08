/**
 * The desk's versioned migrations (design v3, section 2 "Migrate honestly" and step 4, item 4). Each migration has a version number. The
 * record `marker:<tenant>` in `horizon-desk-migrations` holds the highest version that has run. A start runs every migration above that
 * version, in order, and writes the marker after each one. A migration that has run is never run again, and a start with nothing
 * pending writes nothing. Until the run finishes, the desk refuses every change (see app.ts), so no change is taken against records that
 * are still being moved. The whole run is one command in the desk's queue (`queue`), so no panel command runs between two migrations.
 */
import type { DurableStore } from "@godspeedai/cognate-events";
import { migrateDeferredAnswers, migratePreUpgradeAnswers, migrateAnswerStates, migrateReconcile, migrateSealedQuestions, type PanelQueue } from "./panel-answers.ts";
import { migrateQuestionStates } from "./panel-records.ts";

export const MIGRATION_COLLECTION = "horizon-desk-migrations";
export const MIGRATING_WORDS = "The desk is updating its saved records. Nothing was changed. Try again in a moment.";
export const MIGRATION_FAILED_WORDS = "The desk could not update its saved records, so changes are paused. Nothing was changed. Check the desk's store, then restart the desk.";

export interface DeskMigration {
  readonly version: number;
  readonly name: string;
  readonly run: (store: DurableStore, tenant: string, now: Date) => Promise<unknown>;
}

/** The migrations this desk knows, in version order. A new migration gets the next number and is appended. */
export const DESK_MIGRATIONS: readonly DeskMigration[] = [
  { version: 1, name: "answer states", run: (store, tenant) => migrateAnswerStates(store, tenant) },
  { version: 2, name: "answers from before the upgrade", run: (store, tenant, now) => migratePreUpgradeAnswers(store, tenant, now) },
  { version: 3, name: "question states", run: (store, tenant) => migrateQuestionStates(store, tenant) },
  { version: 4, name: "sealed questions", run: (store, tenant) => migrateSealedQuestions(store, tenant) },
  { version: 5, name: "reconciled identities", run: (store, tenant) => migrateReconcile(store, tenant) },
  { version: 6, name: "answers put off before the upgrade", run: (store, tenant) => migrateDeferredAnswers(store, tenant) },
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
export async function runDeskMigrations(store: DurableStore, tenant: string, now: Date, queue: PanelQueue, migrations: readonly DeskMigration[] = DESK_MIGRATIONS, hold?: Promise<unknown>): Promise<number[]> {
  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  return await queue(async (): Promise<number[]> => {
    if (hold !== undefined) await hold;
    const applied: number[] = [];
    for (const migration of ordered) {
      const current = await store.getRecord(MIGRATION_COLLECTION, markerId(tenant));
      const version = (current?.value as { readonly version?: unknown } | undefined)?.version;
      if (typeof version === "number" && migration.version <= version) continue;
      await migration.run(store, tenant, now);
      await store.commit({ appends: [], records: [{ collection: MIGRATION_COLLECTION, id: markerId(tenant), expectedVersion: current?.version ?? 0, value: { tenant, version: migration.version, name: migration.name, at: now.toISOString() } }] });
      applied.push(migration.version);
    }
    return applied;
  });
}
