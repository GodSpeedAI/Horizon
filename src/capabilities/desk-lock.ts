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
import { spawn, spawnSync, type ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";
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
 * The process-level lock: a kernel-held advisory lock on `<store>.lock`, taken before the store is opened at all. Opening a store at an
 * older schema migrates it, so a second desk must be refused before that open (R3-4). The store's own record lock (above) stays as a
 * second check.
 *
 * The lock is held by a `flock -n` child process (util-linux) on the lock file, for as long as the child's stdin stays open: its shell
 * waits on `read`. Release closes stdin, so `read` ends, flock exits, and the kernel drops the lock. If the desk dies, its end of the
 * pipe closes with it, and the kernel drops the lock the same way. Nothing is renamed, unlinked or judged by a process id to decide
 * exclusion, so there is no stale lock to recover.
 */
export const FLOCK_MISSING_WORDS = "Horizon needs the flock command (util-linux) to guard its database, and it is not installed. Install util-linux, then start again.";

export class FlockMissing extends Error {
  constructor() {
    super(FLOCK_MISSING_WORDS);
    this.name = "FlockMissing";
  }
}

/** The held lock: the path of the lock file, and the flock child that holds it. Keep it open until the desk shuts down. */
export interface StoreLockFile {
  readonly path: string;
  readonly holder: ChildProcessByStdio<Writable, Readable, null>;
}

export function storeLockPath(storePath: string): string {
  return `${storePath}.lock`;
}

function flockInstalled(): boolean {
  return spawnSync("/bin/sh", ["-c", "command -v flock"], { stdio: "ignore" }).status === 0;
}

/** Takes the store's lock file, or throws DeskAlreadyRunning when another start holds it. Call this before the store is opened. */
export async function acquireStoreLockFile(storePath: string): Promise<StoreLockFile> {
  if (!flockInstalled()) throw new FlockMissing();
  const path = storeLockPath(storePath);
  const holder = spawn("flock", ["-n", path, "-c", "echo LOCKED; read _"], { stdio: ["pipe", "pipe", "ignore"] });
  // A holder that has already exited makes its stdin fail. That is not an error for the start.
  holder.stdin.on("error", () => undefined);
  return new Promise<StoreLockFile>((resolve, reject) => {
    let out = "";
    let settled = false;
    holder.stdout.setEncoding("utf8");
    holder.stdout.on("data", (chunk: string) => {
      out += chunk;
      if (!settled && out.includes("LOCKED\n")) {
        settled = true;
        resolve({ path, holder });
      }
    });
    holder.once("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    // flock -n exits non-zero, without printing LOCKED, when another start holds the file.
    holder.once("exit", () => {
      if (settled) return;
      settled = true;
      reject(new DeskAlreadyRunning());
    });
  });
}

/** Gives the lock up: closes the holder's stdin so flock releases the file, and waits for the holder to exit. */
export function releaseStoreLockFile(lock: StoreLockFile): Promise<void> {
  const { holder } = lock;
  if (holder.exitCode !== null || holder.signalCode !== null) return Promise.resolve();
  return new Promise<void>((resolve) => {
    holder.once("exit", () => resolve());
    holder.stdin.end();
  });
}
