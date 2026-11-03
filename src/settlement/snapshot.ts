/**
 * The verifier's view of the store. The live Cognate store is a WAL database, which a read-only mount cannot
 * open (no -wal/-shm can be created), so before each verifier run a consistent standalone copy is taken
 * (`VACUUM INTO`, a rollback-journal database) and renamed atomically onto the stable snapshot path the
 * verifier template names. The launcher mounts the snapshot directory read-only, never the live store's.
 */
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

export class SnapshotRefusal extends Error {
  override readonly name = "SnapshotRefusal";
}

export const SNAPSHOT_FILE = "app.sqlite";

/** The snapshot path the verifier template's `--store` literal must name. */
export const snapshotPath = (snapshotDir: string): string => join(resolve(snapshotDir), SNAPSHOT_FILE);

/** The snapshot directory must be its own directory: never the live store's. */
export function assertSnapshotDir(snapshotDir: string, liveStore: string): void {
  if (resolve(snapshotDir) === resolve(liveStore, "..")) {
    throw new SnapshotRefusal(`settlement.snapshot_dir must not be the live store's directory (${resolve(snapshotDir)})`);
  }
}

/** Take the snapshot; returns the snapshot path. Throws SnapshotRefusal; never leaves a partial file at the target. */
export function takeSnapshot(liveStore: string, snapshotDir: string): string {
  assertSnapshotDir(snapshotDir, liveStore);
  if (!existsSync(liveStore)) throw new SnapshotRefusal(`the live store does not exist: ${liveStore}`);
  const dir = resolve(snapshotDir);
  const target = join(dir, SNAPSHOT_FILE);
  const temp = join(dir, `.${SNAPSHOT_FILE}.${process.pid}.${crypto.randomUUID()}.tmp`);
  let db: Database | undefined;
  try {
    mkdirSync(dir, { recursive: true });
    db = new Database(liveStore, { readonly: true });
    db.run(`VACUUM INTO '${temp.replaceAll("'", "''")}'`);
    db.close();
    db = undefined;
    renameSync(temp, target);
    return target;
  } catch (error) {
    try { db?.close(); } catch { /* already closed */ }
    rmSync(temp, { force: true });
    throw new SnapshotRefusal(`the store snapshot could not be taken: ${error instanceof Error ? error.message : String(error)}`);
  }
}
