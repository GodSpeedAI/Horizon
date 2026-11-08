/**
 * The single writer for a desk database (design v3, section 2: "Refuse a second server against the same desk database; this design
 * deliberately supports one local writer"). One record in `horizon-desk-lock` holds the token of the desk that owns the store, its
 * process id and the time it started. A desk takes the lock with a compare-and-set commit at startup, and gives it up on close.
 *
 * A lock is held by a desk that is still running: a token that has not been released, held by a process id that is alive. That includes
 * a desk in this process, or a worker in this process, whose tokens this module cannot see. A lock left behind by a process that stopped
 * without releasing it does not block the next start.
 */
import { randomUUID } from "node:crypto";
import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import type { DurableStore } from "@godspeedai/cognate-events";

export const LOCK_COLLECTION = "horizon-desk-lock";
export const LOCK_ID = "desk";
export const ALREADY_RUNNING_WORDS = "Another Horizon desk is already using this database. Stop it first.";

/** Tokens of desks that are open in this process. A second desk in the same process sees them here. */
const openTokens = new Set<string>();

export class DeskAlreadyRunning extends Error {
  constructor() {
    super(ALREADY_RUNNING_WORDS);
    this.name = "DeskAlreadyRunning";
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else, so it is alive.
    return (error as { code?: unknown }).code === "EPERM";
  }
}

/** Takes the store's writer lock, or throws DeskAlreadyRunning. Returns the token that releases it. */
export async function acquireDeskLock(store: DurableStore): Promise<string> {
  const current = await store.getRecord(LOCK_COLLECTION, LOCK_ID);
  if (current !== undefined) {
    const holder = current.value as { readonly token?: unknown; readonly pid?: unknown };
    if (typeof holder.token === "string") {
      // A record that names this process is live too: another worker in this process holds it, and its tokens are not in this
      // module's set. Only a record whose process has gone is stale.
      const live = openTokens.has(holder.token) || (typeof holder.pid === "number" && processAlive(holder.pid));
      if (live) throw new DeskAlreadyRunning();
    }
  }
  const token = randomUUID();
  try {
    // The compare-and-set makes two desks that start together race for the record: one commit wins, the other is refused.
    await store.commit({ appends: [], records: [{ collection: LOCK_COLLECTION, id: LOCK_ID, expectedVersion: current?.version ?? 0, value: { token, pid: process.pid, since: new Date().toISOString() } }] });
  } catch {
    throw new DeskAlreadyRunning();
  }
  openTokens.add(token);
  return token;
}

/** Gives the lock up. Only the desk that holds the token can clear it. */
export async function releaseDeskLock(store: DurableStore, token: string): Promise<void> {
  openTokens.delete(token);
  const current = await store.getRecord(LOCK_COLLECTION, LOCK_ID);
  if (current === undefined || (current.value as { readonly token?: unknown }).token !== token) return;
  await store.commit({ appends: [], records: [{ collection: LOCK_COLLECTION, id: LOCK_ID, expectedVersion: current.version, value: { token: null, pid: null, since: null } }] });
}

/**
 * The process-level lock: a file next to the store (`<store>.lock`), taken before the store is opened at all. The store's own record
 * (above) lives inside the store, so a second desk would migrate an older store before that record could refuse it. This file is
 * checked first. It holds the owning process id and a random token. It is created with `wx`, so two starts cannot both take it.
 */
export interface StoreLockFile {
  readonly path: string;
  readonly token: string;
}

export function storeLockPath(storePath: string): string {
  return `${storePath}.lock`;
}

type LockHolder = { readonly pid?: unknown; readonly token?: unknown };

/** The holder the file names. Undefined when there is no file. A file that cannot be read as a holder reads as an empty holder. */
function readLockHolder(path: string): LockHolder | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as LockHolder) : {};
  } catch (error) {
    return (error as { code?: unknown }).code === "ENOENT" ? undefined : {};
  }
}

/**
 * Takes the store's lock file, or throws DeskAlreadyRunning. A file whose process is alive (or that cannot be read, so it may be
 * mid-write) refuses the start. A file whose process has gone is taken over. Call this before the store is opened.
 */
export function acquireStoreLockFile(storePath: string): StoreLockFile {
  const path = storeLockPath(storePath);
  const token = randomUUID();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let fd: number;
    try {
      fd = openSync(path, "wx");
    } catch (error) {
      if ((error as { code?: unknown }).code !== "EEXIST") throw error;
      const holder = readLockHolder(path);
      if (holder === undefined) continue;
      const alive = typeof holder.pid !== "number" || processAlive(holder.pid) || (typeof holder.token === "string" && openTokens.has(holder.token));
      if (alive) throw new DeskAlreadyRunning();
      // The process that held it has gone: the lock is stale, so it is taken over.
      try {
        unlinkSync(path);
      } catch (unlinkError) {
        if ((unlinkError as { code?: unknown }).code !== "ENOENT") throw unlinkError;
      }
      continue;
    }
    try {
      writeSync(fd, JSON.stringify({ pid: process.pid, token, since: new Date().toISOString() }));
    } catch (writeError) {
      closeSync(fd);
      unlinkSync(path);
      throw writeError;
    }
    closeSync(fd);
    return { path, token };
  }
  throw new DeskAlreadyRunning();
}

/** Removes the lock file, if it still holds this lock's token. Nothing is removed when another start has taken it. */
export function releaseStoreLockFile(lock: StoreLockFile): void {
  try {
    if (readLockHolder(lock.path)?.token !== lock.token) return;
    unlinkSync(lock.path);
  } catch {
    // Already gone: nothing to release.
  }
}
