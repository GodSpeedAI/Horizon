/**
 * The read-only surface open (the CLI `surface` path) may run beside a desk, so it must never write. It must not migrate an older
 * store, and it must not create or rotate the launch secret the running desk was started with.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

const apps: DeskApp[] = [];
afterAll(async () => {
  for (const app of apps) await app.stop().catch(() => undefined);
});

const schemaVersion = (path: string): number => {
  const db = new Database(path, { readonly: true });
  try {
    return (db.query("SELECT MAX(version) AS version FROM schema_versions").get() as { version: number }).version;
  } finally {
    db.close();
  }
};

/** Turns a current store into one written before migration 4: its two lease columns are dropped and its version row removed. */
const downgradeToVersion3 = (path: string): void => {
  const db = new Database(path);
  try {
    db.exec("ALTER TABLE outbox DROP COLUMN lease_generation; ALTER TABLE outbox DROP COLUMN lease_owner; DELETE FROM schema_versions WHERE version = 4;");
  } finally {
    db.close();
  }
};

/** Starts a desk and stops it, so its store and launch secret stay on disk for a read-only open. */
const runAndStop = async (): Promise<string> => {
  const desk = await startDeskApp({});
  await desk.stop();
  return desk.root;
};

describe("a read-only open never writes", () => {
  test("an older-schema store is refused, and its schema version and the launch secret are unchanged", async () => {
    const root = await runAndStop();
    const path = join(root, "d.sqlite");
    const secretPath = join(root, "launch.secret");
    downgradeToVersion3(path);
    const versionBefore = schemaVersion(path);
    const secretBefore = readFileSync(secretPath);
    expect(versionBefore).toBe(3);

    await expect(startDeskApp({ root, readOnly: true })).rejects.toThrow("older than this build");

    expect(schemaVersion(path)).toBe(versionBefore);
    expect(readFileSync(secretPath)).toEqual(secretBefore);
  });

  test("a read-only open of a current store reads the running desk's launch secret and does not rewrite it", async () => {
    const root = await runAndStop();
    const secretPath = join(root, "launch.secret");
    const secretBefore = readFileSync(secretPath);
    const surface = await startDeskApp({ root, readOnly: true });
    apps.push(surface);
    expect(readFileSync(secretPath)).toEqual(secretBefore);
  });

  test("a read-only open with no launch secret is refused, and no secret is created", async () => {
    const root = await runAndStop();
    const secretPath = join(root, "launch.secret");
    rmSync(secretPath);
    await expect(startDeskApp({ root, readOnly: true })).rejects.toThrow("no per-launch secret");
    expect(existsSync(secretPath)).toBe(false);
  });
});
