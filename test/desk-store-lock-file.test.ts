/**
 * The process-level store lock file (`<store>.lock`). A stale file (its process has gone) is taken over, a live one refuses the start,
 * and two starts that both read the same stale file cannot both take it: exactly one holds the lock.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireStoreLockFile, DeskAlreadyRunning, lockIsStale, observeLockFile, storeLockPath, takeOverStaleLock } from "../src/capabilities/desk-lock.ts";

const dirs: string[] = [];
const newStore = (): { readonly store: string; readonly lock: string } => {
  const dir = mkdtempSync(join(tmpdir(), "desk-store-lock-"));
  dirs.push(dir);
  const store = join(dir, "d.sqlite");
  return { store, lock: storeLockPath(store) };
};
const stalePid = 2147483646; // no process has this id
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("the store lock file", () => {
  test("a lock file whose process has gone is taken over by a new start", () => {
    const { store, lock } = newStore();
    writeFileSync(lock, JSON.stringify({ pid: stalePid, token: "crashed-desk", since: "2026-11-01T00:00:00.000Z" }));
    const taken = acquireStoreLockFile(store);
    expect(JSON.parse(readFileSync(lock, "utf8"))).toMatchObject({ pid: process.pid, token: taken.token });
  });

  test("a lock file whose process is alive refuses the start, and is left as it was", () => {
    const { store, lock } = newStore();
    // This test's parent is alive for as long as the test runs, and it is not this process.
    const held = JSON.stringify({ pid: process.ppid, token: "other-desk", since: new Date().toISOString() });
    writeFileSync(lock, held);
    expect(() => acquireStoreLockFile(store)).toThrow(DeskAlreadyRunning);
    expect(readFileSync(lock, "utf8")).toBe(held);
  });

  test("two starts that both read the same stale lock: exactly one takes the lock", () => {
    const { store, lock } = newStore();
    writeFileSync(lock, JSON.stringify({ pid: stalePid, token: "crashed-desk", since: "2026-11-01T00:00:00.000Z" }));
    // Both starts read the stale file before either removes it.
    const seenByA = observeLockFile(lock);
    const seenByB = observeLockFile(lock);
    expect(seenByA).toBeDefined();
    expect(seenByB).toBeDefined();
    expect(lockIsStale(seenByA!)).toBe(true);
    expect(lockIsStale(seenByB!)).toBe(true);

    // A removes the stale file and takes a new lock.
    expect(takeOverStaleLock(lock, seenByA!)).toBe(true);
    const holderA = acquireStoreLockFile(store);

    // B resumes with its stale view. The file at the path is A's live lock, so B must not remove it.
    expect(takeOverStaleLock(lock, seenByB!)).toBe(false);
    expect(JSON.parse(readFileSync(lock, "utf8")).token).toBe(holderA.token);
    // B's own start now refuses, and no moved copy of A's lock is left beside the file.
    expect(() => acquireStoreLockFile(store)).toThrow(DeskAlreadyRunning);
    expect(readdirSync(join(lock, "..")).filter((name) => name.includes(".claim-") || name.endsWith(".staging"))).toEqual([]);
    expect(JSON.parse(readFileSync(lock, "utf8")).token).toBe(holderA.token);
  });

  test("a start leaves no staging file behind, whether it takes the lock or is refused", () => {
    const { store, lock } = newStore();
    const taken = acquireStoreLockFile(store);
    expect(() => acquireStoreLockFile(store)).toThrow(DeskAlreadyRunning);
    expect(readdirSync(join(lock, "..")).sort()).toEqual(["d.sqlite.lock"]);
    expect(JSON.parse(readFileSync(lock, "utf8")).token).toBe(taken.token);
  });
});
