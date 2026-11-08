/**
 * Design v3, section 2 (step 4, item 3): one local writer per desk database. A second desk started on the same store file is refused at
 * startup with plain words, the first desk keeps working, and the store is open to a new desk once the first one stops. A lock left by
 * a process that died does not block the next start. The tests start real application instances on one SQLite file.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { ALREADY_RUNNING_WORDS, LOCK_COLLECTION, LOCK_ID } from "../src/capabilities/desk-lock.ts";
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
