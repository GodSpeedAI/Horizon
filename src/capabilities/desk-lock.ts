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
import { closeSync, fstatSync, linkSync, openSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
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
 * checked first. It holds the owning process id and a random token.
 *
 * The file is taken by a hard link, which is atomic: the holder's content is written to a staging file first, and `linkSync` to the
 * lock path fails with EEXIST when another start holds it. A held lock is never removed by a start that merely judged it stale: a
 * stale file is first renamed to a unique name (rename moves one inode, so only one start can move a given file), then the moved file
 * is checked against the one that was judged stale. A file that is not that one is put back.
 */
export interface StoreLockFile {
  readonly path: string;
  readonly token: string;
}

export function storeLockPath(storePath: string): string {
  return `${storePath}.lock`;
}

type LockHolder = { readonly pid?: unknown; readonly token?: unknown };

/** One read of a lock file: its inode and exact content, and the holder that content names. */
export interface LockObservation {
  readonly ino: number;
  readonly raw: string;
  /** Undefined when the content cannot be read as a holder (it may be mid-write), which counts as live. */
  readonly holder: LockHolder | undefined;
}

function parseHolder(raw: string): LockHolder | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as LockHolder) : undefined;
  } catch {
    return undefined;
  }
}

/** Reads the lock file at `path`, or undefined when there is no file. The inode and the content come from the same open file. */
export function observeLockFile(path: string): LockObservation | undefined {
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch (error) {
    if ((error as { code?: unknown }).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    const ino = fstatSync(fd).ino;
    const raw = readFileSync(fd, "utf8");
    return { ino, raw, holder: parseHolder(raw) };
  } finally {
    closeSync(fd);
  }
}

/** A lock is stale only when the process it names has gone and no token of this process holds it. */
export function lockIsStale(observed: LockObservation): boolean {
  const holder = observed.holder;
  if (holder === undefined || typeof holder.pid !== "number") return false;
  if (typeof holder.token === "string" && openTokens.has(holder.token)) return false;
  return !processAlive(holder.pid);
}

/**
 * Removes the stale lock that `observed` describes, if it is still at `path`. Returns true when this call removed it. Returns false
 * when the file at `path` is not the one observed (another start took it in between): that file is put back, and the caller retries.
 */
export function takeOverStaleLock(path: string, observed: LockObservation): boolean {
  const claim = `${path}.claim-${randomUUID()}`;
  try {
    renameSync(path, claim);
  } catch (error) {
    if ((error as { code?: unknown }).code === "ENOENT") return false;
    throw error;
  }
  const moved = observeLockFile(claim);
  if (moved !== undefined && moved.ino === observed.ino && moved.raw === observed.raw) {
    unlinkSync(claim);
    return true;
  }
  // A live lock was moved. Put it back. If the path is taken again already, that start holds it and the moved copy is dropped.
  try {
    linkSync(claim, path);
  } catch {
    // The path is held by another start.
  }
  rmSync(claim, { force: true });
  return false;
}

/** Takes the store's lock file, or throws DeskAlreadyRunning. Call this before the store is opened. */
export function acquireStoreLockFile(storePath: string): StoreLockFile {
  const path = storeLockPath(storePath);
  const token = randomUUID();
  const staging = `${path}.${token}.staging`;
  writeFileSync(staging, JSON.stringify({ pid: process.pid, token, since: new Date().toISOString() }), { flag: "wx" });
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        linkSync(staging, path);
        return { path, token };
      } catch (error) {
        if ((error as { code?: unknown }).code !== "EEXIST") throw error;
      }
      const observed = observeLockFile(path);
      if (observed === undefined) continue;
      if (!lockIsStale(observed)) throw new DeskAlreadyRunning();
      // The process that held it has gone: take the stale file over, then try the link again.
      takeOverStaleLock(path, observed);
    }
    throw new DeskAlreadyRunning();
  } finally {
    rmSync(staging, { force: true });
  }
}

/** Removes the lock file, if it still holds this lock's token. Nothing is removed when another start has taken it. */
export function releaseStoreLockFile(lock: StoreLockFile): void {
  try {
    if (observeLockFile(lock.path)?.holder?.token !== lock.token) return;
    unlinkSync(lock.path);
  } catch {
    // Already gone: nothing to release.
  }
}
