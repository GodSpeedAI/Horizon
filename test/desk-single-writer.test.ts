/**
 * Design v3, section 2 (step 4, item 3): one local writer per desk database. A second desk started on the same store file is refused at
 * startup with plain words, the first desk keeps working, and the store is open to a new desk once the first one stops. A lock left by
 * a process that died does not block the next start. The tests start real application instances on one SQLite file.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { acquireDeskLock, ALREADY_RUNNING_WORDS, DeskAlreadyRunning, LOCK_COLLECTION, LOCK_ID } from "../src/capabilities/desk-lock.ts";
import { join } from "node:path";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

const apps: DeskApp[] = [];
const open = async (root?: string) => {
  const app = await startDeskApp(root === undefined ? {} : { root });
  apps.push(app);
  return app;
};
afterAll(async () => {
  for (const app of apps) await app.stop().catch(() => undefined);
});

describe("one writer per desk database", () => {
  test("a second desk on the same store is refused at startup, in plain words", async () => {
    const first = await open();
    await expect(startDeskApp({ root: first.root })).rejects.toThrow("Another Horizon desk is already using this database. Stop it first.");
    expect(ALREADY_RUNNING_WORDS).toBe("Another Horizon desk is already using this database. Stop it first.");
    // The first desk is untouched and still answers.
    const state = await fetch(`${first.base}/desk/state.json`);
    expect(state.status).toBe(200);
  });

  test("once the first desk stops, the store opens to a new desk, which keeps what was saved", async () => {
    const first = await open();
    await first.application.applyAgentOp({ tool: "ask_human", panel: "w1", ask: { id: "q", question: "Which?", why_needed: "x", options: [{ option_id: "a", label: "A" }, { option_id: "b", label: "B" }] } });
    const root = first.root;
    await first.stop();
    apps.splice(apps.indexOf(first), 1);
    const second = await open(root);
    const state = await second.state();
    expect(state.panels.open.map((p: { id: string }) => p.id)).toContain("w1");
  });

  test("a lock left by a process that stopped without releasing it does not block the next start", async () => {
    const first = await open();
    const root = first.root;
    // Simulate a crash: the lock names another process that is no longer running, and this desk never released it.
    const store = first.application.runtime.runtime.store;
    const held = await store.getRecord(LOCK_COLLECTION, LOCK_ID);
    await store.commit({ appends: [], records: [{ collection: LOCK_COLLECTION, id: LOCK_ID, expectedVersion: held?.version ?? 0, value: { token: "crashed-desk", pid: 2147483646, since: "2026-11-01T00:00:00.000Z" } }] });
    await first.stop();
    apps.splice(apps.indexOf(first), 1);
    const second = await open(root);
    expect((await second.state()).panels).toBeDefined();
  });

  test("a second acquirer in the same process, while the first holds the lock, is refused", async () => {
    // A second worker in this process has its own copy of the lock module, so it cannot see the first desk's token. It sees the
    // record instead: a live token named by this process's id. The record must still refuse it.
    const first = await open();
    const store = first.application.runtime.runtime.store;
    const held = await store.getRecord(LOCK_COLLECTION, LOCK_ID);
    await store.commit({ appends: [], records: [{ collection: LOCK_COLLECTION, id: LOCK_ID, expectedVersion: held?.version ?? 0, value: { token: "worker-desk", pid: process.pid, since: new Date().toISOString() } }] });
    await expect(acquireDeskLock(store)).rejects.toBeInstanceOf(DeskAlreadyRunning);
    expect((await store.getRecord(LOCK_COLLECTION, LOCK_ID))?.value).toMatchObject({ token: "worker-desk" });
  });

  test("a lock held by a live process other than this one is refused", async () => {
    const first = await open();
    const store = first.application.runtime.runtime.store;
    const held = await store.getRecord(LOCK_COLLECTION, LOCK_ID);
    // This process's parent is alive for as long as the test runs, and it is not this process.
    await store.commit({ appends: [], records: [{ collection: LOCK_COLLECTION, id: LOCK_ID, expectedVersion: held?.version ?? 0, value: { token: "other-desk", pid: process.ppid, since: new Date().toISOString() } }] });
    await first.stop();
    apps.splice(apps.indexOf(first), 1);
    // The record now names a live process, so a desk cannot take the store until that process lets it go.
    await expect(startDeskApp({ root: first.root })).rejects.toThrow(ALREADY_RUNNING_WORDS);
  });
});

describe("the read-only surface open beside a running desk", () => {
  test("a read-only open takes no lock, so it opens while a desk holds the store, and the desk keeps its lock", async () => {
    const first = await open();
    const reader = await startDeskApp({ root: first.root, readOnly: true });
    apps.push(reader);
    const view = reader.application.surface();
    expect(view.ok).toBe(true);
    await reader.stop();
    apps.splice(apps.indexOf(reader), 1);
    // The desk still holds the lock: a second writer is still refused.
    await expect(startDeskApp({ root: first.root })).rejects.toThrow(ALREADY_RUNNING_WORDS);
  });

  test("a read-only open refuses to migrate: until the records are migrated it cannot surface", async () => {
    // A desk whose record migration is held pending never writes the migration marker.
    const stalled = await startDeskApp({ migrationHold: new Promise(() => undefined), awaitMigration: false });
    apps.push(stalled);
    await expect(startDeskApp({ root: stalled.root, readOnly: true })).rejects.toThrow("not migrated yet");
  });

  test("a store opened read-only refuses every write, and the record is not written", async () => {
    const first = await open();
    const { openReadOnlyStore } = await import("../src/runtime/create.ts");
    const store = openReadOnlyStore(join(first.root, "d.sqlite"));
    await expect(store.commit({ appends: [], records: [{ collection: "horizon-read-only-probe", id: "x", expectedVersion: 0, value: { a: 1 } }] })).rejects.toThrow("opened read-only");
    expect(await store.getRecord("horizon-read-only-probe", "x")).toBeUndefined();
  });
});

describe("the writer lock comes before any runtime starts", () => {
  test("a second desk on a held store is refused, and a pending outbox item is left as it was", async () => {
    // A desk that stopped leaves a pending run.execute item behind. A live process (this test's parent) then holds the lock.
    const first = await open();
    const root = first.root;
    await first.stop();
    apps.splice(apps.indexOf(first), 1);
    const path = join(root, "d.sqlite");
    const raw = openSqliteStore({ path });
    const held = await raw.getRecord(LOCK_COLLECTION, LOCK_ID);
    await raw.commit({ appends: [], records: [{ collection: LOCK_COLLECTION, id: LOCK_ID, expectedVersion: held?.version ?? 0, value: { token: "other-desk", pid: process.ppid, since: new Date().toISOString() } }], outbox: [{ id: "run.execute:held-item", topic: "run.execute", payload: { runId: "run-that-does-not-exist" } }] });
    await raw.close();
    // The refused start must not deliver the item: its runtime is never built.
    await expect(startDeskApp({ root })).rejects.toThrow(ALREADY_RUNNING_WORDS);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const after = openSqliteStore({ path });
    try {
      const items = await after.listOutbox({ topic: "run.execute" });
      expect(items.map((item) => ({ id: item.id, status: item.status, attempts: item.attempts }))).toEqual([{ id: "run.execute:held-item", status: "pending", attempts: 0 }]);
    } finally {
      await after.close();
    }
  });
});
