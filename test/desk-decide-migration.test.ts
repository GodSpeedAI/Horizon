/**
 * The card-decision path (`POST /desk/decide`) is refused while the desk's records are migrating, and after a failed migration, the
 * same way the panel and agent writes are. The refusal is in the decide path itself, not only at the HTTP gate.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { MIGRATION_COLLECTION, MIGRATION_FAILED_WORDS, MIGRATING_WORDS } from "../src/capabilities/desk-migrations.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

const apps: DeskApp[] = [];
afterEach(async () => {
  while (apps.length > 0) await apps.pop()!.stop().catch(() => undefined);
});

const decide = (app: DeskApp) => app.post("/desk/decide", { card_id: "case-task:none", choice: "accept", preview_code: "x", records: [] });

describe("deskDecide honours the migration state", () => {
  test("while the migration is held, a decision is refused with 503 and the pending words", async () => {
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const app = await startDeskApp({ migrationHold: hold, awaitMigration: false });
    apps.push(app);
    const refused = await decide(app);
    expect(refused.status).toBe(503);
    expect(((await refused.json()) as { message: string }).message).toBe(MIGRATING_WORDS);
    release();
    await app.application.migrated;
  });

  test("after a forced migration failure, a decision is refused with the failed-migration words", async () => {
    const first = await startDeskApp();
    apps.push(first);
    // Make the marker read as "nothing has run", so the next start runs the migration.
    const store = first.application.runtime.runtime.store;
    const tenant = first.application.caller.tenant;
    const current = await store.getRecord(MIGRATION_COLLECTION, `marker:${tenant}`);
    await store.commit({ appends: [], records: [{ collection: MIGRATION_COLLECTION, id: `marker:${tenant}`, expectedVersion: current?.version ?? 0, value: { tenant, version: 0, name: "forgotten", at: "2026-11-01T00:00:00.000Z" } }] });
    const root = first.root;
    await first.stop();
    apps.pop();
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const failed = await startDeskApp({ root, migrationHold: hold, awaitMigration: false });
    apps.push(failed);
    // The marker's commit fails, so the migration fails and the desk pauses changes.
    const failing = failed.application.runtime.runtime.store as unknown as { commit: (input: { records?: { collection: string }[] }) => Promise<unknown> };
    const real = failing.commit.bind(failing);
    failing.commit = async (input) => {
      if ((input.records ?? []).some((r) => r.collection === MIGRATION_COLLECTION)) throw new Error("disk full");
      return real(input);
    };
    const quiet = console.error;
    console.error = () => undefined;
    try {
      release();
      await failed.application.migrated;
    } finally {
      console.error = quiet;
    }
    const refused = await decide(failed);
    expect(refused.status).toBe(503);
    expect(((await refused.json()) as { message: string }).message).toBe(MIGRATION_FAILED_WORDS);
  });
});
