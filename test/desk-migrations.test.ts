/**
 * Design v3, section 2 and step 4 (item 4): the desk's saved records are migrated under a versioned marker. Each migration runs once, in
 * order; a start with nothing pending writes nothing; and while a migration is held, every change is refused with 503 and plain words.
 * The restart tests reopen the desk's SQLite file, and the legacy answer is written in the shape the upgrade found it in.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { acceptanceBlocked, listAnswers, PANEL_ANSWERS_COLLECTION } from "../src/capabilities/panel-answers.ts";
import { MIGRATION_COLLECTION, MIGRATING_WORDS, MIGRATION_FAILED_WORDS, runDeskMigrations, type DeskMigration } from "../src/capabilities/desk-migrations.ts";
import type { PanelQueue } from "../src/capabilities/panel-answers.ts";

/** A queue that runs each command at once; the migrations run one after another anyway. */
const queue: PanelQueue = (command) => command();
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

const apps: DeskApp[] = [];
const open = async (options: { root?: string; migrationHold?: Promise<unknown>; awaitMigration?: boolean } = {}) => {
  const app = await startDeskApp(options);
  apps.push(app);
  return app;
};
const restart = async (app: DeskApp, options: { migrationHold?: Promise<unknown>; awaitMigration?: boolean } = {}) => {
  const root = app.root;
  await app.stop();
  apps.splice(apps.indexOf(app), 1);
  return open({ root, ...options });
};
afterAll(async () => {
  for (const app of apps) await app.stop().catch(() => undefined);
});

const storeOf = (app: DeskApp) => app.application.runtime.runtime.store;
const COLLECTIONS = ["horizon-panels", PANEL_ANSWERS_COLLECTION, MIGRATION_COLLECTION, "horizon-conversation"];

/** Every record in the collections the migration reads or writes, with its version. */
async function versionsOf(app: DeskApp): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const collection of COLLECTIONS) for (const row of await storeOf(app).listRecords(collection, { tenant: app.application.caller.tenant })) out[`${collection}/${row.id}`] = row.version;
  return out;
}

/** Makes the marker read as "nothing has run", as an upgrade from before the marker would find it. */
async function forgetMarker(app: DeskApp): Promise<void> {
  const store = storeOf(app);
  const tenant = app.application.caller.tenant;
  const current = await store.getRecord(MIGRATION_COLLECTION, `marker:${tenant}`);
  await store.commit({ appends: [], records: [{ collection: MIGRATION_COLLECTION, id: `marker:${tenant}`, expectedVersion: current?.version ?? 0, value: { tenant, version: 0, name: "forgotten", at: "2026-11-01T00:00:00.000Z" } }] });
}

/** An answer as the desk wrote it before states existed: no state, no finish reason, with the derived fields stored. */
async function seedLegacyAnswer(app: DeskApp, panel: string): Promise<void> {
  const store = storeOf(app);
  const tenant = app.application.caller.tenant;
  await store.commit({ appends: [], records: [{ collection: PANEL_ANSWERS_COLLECTION, id: `answer:${panel}:1`, expectedVersion: 0, value: { tenant, panel_id: panel, n: 1, ask: "q", outcome: "answered", value: "a", note: null, at: "2026-11-02T10:00:00.000Z", version: null, routed_as: null, step: null, asked_by: null, asked_by_key: null, owner_key: null, fingerprint: null, history: [], replied: true, waiting_on: "none" } }] });
}

describe("the desk's record migrations", () => {
  test("the first start migrates legacy answers and records the marker; the answer keeps its words and gains a state", async () => {
    const first = await open();
    await seedLegacyAnswer(first, "legacy-1");
    await forgetMarker(first);
    const second = await restart(first);
    const [answer] = await listAnswers(storeOf(second), second.application.caller.tenant, "legacy-1");
    expect(answer).toBeDefined();
    expect(answer!.state).toBe("finished");
    expect(answer!.value).toBe("a");
    const raw = (await storeOf(second).getRecord(PANEL_ANSWERS_COLLECTION, "answer:legacy-1:1"))!.value as Record<string, unknown>;
    expect(raw.state).toBe("finished");
    expect("replied" in raw).toBe(false);
    expect("waiting_on" in raw).toBe(false);
    const marker = await storeOf(second).getRecord(MIGRATION_COLLECTION, `marker:${second.application.caller.tenant}`);
    expect((marker!.value as { version: number }).version).toBe(6);
  });

  test("a second start with nothing pending writes nothing", async () => {
    const first = await open();
    await seedLegacyAnswer(first, "legacy-2");
    await forgetMarker(first);
    const migrated = await restart(first);
    const before = await versionsOf(migrated);
    const again = await restart(migrated);
    expect(await versionsOf(again)).toEqual(before);
  });

  test("while a migration is held, changes are refused with 503 and plain words; reads still answer", async () => {
    const first = await open();
    await forgetMarker(first);
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const held = await restart(first, { migrationHold: hold, awaitMigration: false });
    const refused = await held.post("/desk/panels/op", { op: "human.pin", id: "none", pinned: true });
    expect(refused.status).toBe(503);
    expect(((await refused.json()) as { message: string }).message).toBe(MIGRATING_WORDS);
    expect((await fetch(`${held.base}/desk/session`)).status).toBe(200);
    release();
    await held.application.migrated;
    const after = await held.post("/desk/panels/op", { op: "human.pin", id: "none", pinned: true });
    expect(after.status).not.toBe(503);
  });

  test("a restart leaves an outstanding legacy wait waiting, with no owner recorded, and acceptance stays blocked", async () => {
    const first = await open();
    const store = storeOf(first);
    const tenant = first.application.caller.tenant;
    await store.commit({ appends: [], records: [{ collection: PANEL_ANSWERS_COLLECTION, id: "answer:legacy-wait:1", expectedVersion: 0, value: { tenant, panel_id: "legacy-wait", n: 1, ask: "q", outcome: "answered", value: "a", note: null, at: "2026-11-02T10:00:00.000Z", version: null, routed_as: null, step: "step-legacy", asked_by: null, asked_by_key: null, owner_key: null, fingerprint: null, history: [], replied: false } }] });
    await forgetMarker(first);
    const second = await restart(first);
    const rows = await listAnswers(storeOf(second), second.application.caller.tenant, "legacy-wait");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ state: "waiting_for_agent", waiting_on: "agent", replied: false, finished_by: null, routed_as: null });
    expect(acceptanceBlocked(rows, "step-legacy")).toBe(true);
  });

  test("after a forced migration failure, an agent op and a person's op both refuse, and nothing is persisted", async () => {
    const first = await open();
    await forgetMarker(first);
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const failed = await restart(first, { migrationHold: hold, awaitMigration: false });
    // The marker's commit fails, so the migration fails and the desk pauses changes for good.
    const store = storeOf(failed) as unknown as { commit: (input: { records?: { collection: string }[] }) => Promise<unknown> };
    const real = store.commit.bind(store);
    store.commit = async (input) => {
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
    const agentOp = { tool: "ask_human", panel: "paused-agent", ask: { id: "q", question: "Which plan?", why_needed: "x", options: [{ option_id: "a", label: "Plan A" }] } };
    const agent = await failed.application.applyAgentOp(agentOp as unknown as Parameters<typeof failed.application.applyAgentOp>[0]);
    expect(agent).toMatchObject({ ok: false, message: MIGRATION_FAILED_WORDS });
    expect((await storeOf(failed).getRecord("horizon-panels", "panel:paused-agent")) ?? null).toBeNull();
    const human = await failed.post("/desk/panels/op", { op: "human.pin", id: "none", pinned: true });
    expect(human.status).toBe(503);
    expect(((await human.json()) as { message: string }).message).toBe(MIGRATION_FAILED_WORDS);
  });

  test("the words for a pending migration are plain", () => {
    expect(MIGRATING_WORDS).toBe("The desk is updating its saved records. Nothing was changed. Try again in a moment.");
  });
});

describe("the migration runner", () => {
  const fixture = () => {
    const ran: number[] = [];
    const migrations: DeskMigration[] = [
      { version: 2, name: "second", run: async () => void ran.push(2) },
      { version: 1, name: "first", run: async () => void ran.push(1) },
      { version: 3, name: "third", run: async () => void ran.push(3) },
    ];
    return { ran, migrations };
  };

  test("runs pending migrations in version order, each once, and a re-run is a no-op", async () => {
    const store = createMemoryStore();
    const { ran, migrations } = fixture();
    const now = new Date("2026-11-08T09:00:00Z");
    expect(await runDeskMigrations(store, "t", now, queue, migrations)).toEqual([1, 2, 3]);
    expect(ran).toEqual([1, 2, 3]);
    const commitsBefore = (await store.getRecord(MIGRATION_COLLECTION, "marker:t"))?.version;
    expect(await runDeskMigrations(store, "t", now, queue, migrations)).toEqual([]);
    expect(ran).toEqual([1, 2, 3]);
    expect((await store.getRecord(MIGRATION_COLLECTION, "marker:t"))?.version).toBe(commitsBefore);
  });

  test("a migration that fails is not marked, and the next run runs it again", async () => {
    const store = createMemoryStore();
    let fail = true;
    const ran: number[] = [];
    const migrations: DeskMigration[] = [
      { version: 1, name: "ok", run: async () => void ran.push(1) },
      { version: 2, name: "flaky", run: async () => {
        if (fail) throw new Error("disk full");
        ran.push(2);
      } },
    ];
    await expect(runDeskMigrations(store, "t", new Date(), queue, migrations)).rejects.toThrow("disk full");
    expect((await store.getRecord(MIGRATION_COLLECTION, "marker:t"))?.value).toMatchObject({ version: 1 });
    fail = false;
    expect(await runDeskMigrations(store, "t", new Date(), queue, migrations)).toEqual([2]);
    expect(ran).toEqual([1, 2]);
  });
});

describe("an agent op issued straight after startup", () => {
  test("completes, and the migration completes after it, without a stall", async () => {
    // The migration is queued at startup, before the agent op. The op waits for the migration; the migration must not wait behind the op.
    const app = await open({ awaitMigration: false });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("the agent op stalled behind the migration")), 3_000);
    });
    try {
      const result = await Promise.race([
        app.application.applyAgentOp({ tool: "ask_human", panel: "w1", ask: { id: "q", question: "Which?", why_needed: "x", options: [{ option_id: "a", label: "A" }, { option_id: "b", label: "B" }] } }),
        timeout,
      ]);
      expect(result.ok).toBe(true);
      await Promise.race([app.application.migrated, timeout]);
      const markers = await app.application.runtime.runtime.store.listRecords(MIGRATION_COLLECTION);
      expect(markers.map((row) => (row.value as { version?: number }).version)).toEqual([6]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  });
});
