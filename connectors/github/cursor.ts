/**
 * The connector's only progress marker: how far into the case keeper's events it has acted.
 * Collection `horizon-github-cursor`, key `cursor:<setup>`, fields `name` and `from_cursor`.
 * It is saved by the caller only after the GitHub write for that event succeeded, so a restart or a failure
 * can repeat the last event (which is safe: every write checks first) and can never skip one.
 */
import type { DurableStore } from "@godspeedai/cognate-events";

export const CURSOR_COLLECTION = "horizon-github-cursor";
export const cursorKey = (setup: string): string => `cursor:${setup}`;

export async function loadCursor(store: DurableStore, setup: string): Promise<string | null> {
  const row = await store.getRecord(CURSOR_COLLECTION, cursorKey(setup));
  const value = row?.value.from_cursor;
  return typeof value === "string" && value !== "" ? value : null;
}

export async function saveCursor(store: DurableStore, setup: string, from_cursor: string): Promise<void> {
  const id = cursorKey(setup);
  const current = await store.getRecord(CURSOR_COLLECTION, id);
  await store.commit({ appends: [], records: [{ collection: CURSOR_COLLECTION, id, expectedVersion: current?.version ?? 0, value: { name: setup, from_cursor } }] });
}
