/**
 * The single writer for a desk database (design v3, section 2: "Refuse a second server against the same desk database; this design
 * deliberately supports one local writer"). One record in `horizon-desk-lock` holds the token of the desk that owns the store, its
 * process id and the time it started. A desk takes the lock with a compare-and-set commit at startup, and gives it up on close.
 *
 * A lock is held by a desk that is still running: a token this process has not released, or a process id that is alive and is not
 * this one's own closed desk. A lock left behind by a process that stopped without releasing it does not block the next start.
 */
import { randomUUID } from "node:crypto";
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
      const sameProcess = typeof holder.pid === "number" && holder.pid === process.pid;
      const live = openTokens.has(holder.token) || (!sameProcess && typeof holder.pid === "number" && processAlive(holder.pid));
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
