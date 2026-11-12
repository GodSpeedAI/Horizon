/**
 * Stage 0B interim containment: a reserved operation runs only after an exact local confirmation.
 *
 * A reserved route does not write when it is first asked. It writes an immutable pending descriptor
 * (what the operation is, by digest, and who asked), shows a one-time code on the controlling
 * terminal, and answers that the operation is waiting for local confirmation. The person confirms
 * on that terminal with `horizon confirm --pending <id>`, which renders the exact operation and
 * asks for the code. A confirmed descriptor is consumed exactly once by the same operation.
 *
 * Decisions, recorded where they bind:
 * - The code is never stored. The descriptor keeps a keyed digest of it, keyed by a per-launch key
 *   held only in memory, so a copy of the store cannot be brute-forced offline and a restart
 *   invalidates every outstanding confirmation (they also expire in two minutes).
 * - State lives in a head record changed by compare-and-swap, so consuming a confirmation is a
 *   single transition: two concurrent requests cannot both apply it.
 * - Every transition is also appended to a log, so the history of a descriptor is the record.
 */
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { DurableStore, Json } from "@godspeedai/cognate-events";

export const PENDING_COLLECTION = "horizon-pending";
export const PENDING_HEAD_COLLECTION = "horizon-pending-heads";
export const PENDING_TRANSITION_COLLECTION = "horizon-pending-transitions";
export const CONFIRM_TTL_MS = 2 * 60_000;
export const CODE_DIGITS = 6;

export type PendingState = "pending" | "confirmed" | "applied" | "expired";

/** The one key the digests are made under. It exists only in this process. */
const launchKey = randomBytes(32);

export interface PendingDescriptor {
  readonly pending_id: string;
  readonly tenant: string;
  readonly operator: string;
  readonly operation_id: string;
  readonly operation_digest: string;
  readonly confirmation_digest: string;
  readonly created_at: string;
  readonly expires_at: string;
}

export interface Summoned {
  readonly pending_id: string;
  readonly code: string;
  readonly expires_at: string;
}

/** The digest of an operation and its parameters, in a fixed key order, so equal requests match. */
export function operationDigest(operationId: string, params: Readonly<Record<string, unknown>>): string {
  const canonical = JSON.stringify({ operation_id: operationId, params: sortKeys(params) });
  return createHash("sha256").update(canonical).digest("base64url");
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeys((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
}

const codeDigest = (pendingId: string, code: string): string =>
  createHmac("sha256", launchKey).update(`${pendingId}\n${code}`).digest("base64url");

const newCode = (): string => String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, "0");

/** Where the code goes. Without a terminal nothing is written and the request is refused. */
export interface CodeOutput {
  readonly terminal: (line: string) => boolean;
}

/** Test seam, the same shape as the pairing seam: receives the code instead of the terminal. */
let codeSink: ((pendingId: string, code: string) => void) | null = null;
export function setConfirmationCodeSink(sink: ((pendingId: string, code: string) => void) | null): void {
  codeSink = sink;
}

export class ConfirmationNeedsTerminal extends Error {
  override readonly name = "ConfirmationNeedsTerminal";
  constructor() {
    super(
      "Horizon has no terminal to show the confirmation code on, so this operation was not started and nothing was changed. Run Horizon from an interactive terminal to confirm operations.",
    );
  }
}

async function headOf(store: DurableStore, pendingId: string): Promise<{ state: PendingState; seq: number; version: number } | null> {
  const row = await store.getRecord(PENDING_HEAD_COLLECTION, pendingId);
  if (row === undefined) return null;
  const value = row.value as { state: PendingState; seq: number };
  return { state: value.state, seq: value.seq, version: row.version };
}

async function descriptorOf(store: DurableStore, pendingId: string): Promise<PendingDescriptor | null> {
  const row = await store.getRecord(PENDING_COLLECTION, pendingId);
  return row === undefined ? null : (row.value as unknown as PendingDescriptor);
}

/**
 * Writes one transition: the new head (compare-and-swap on its version, so only one writer moves a
 * descriptor past a state) and the appended log entry. Returns false if another writer got there first.
 */
async function transition(
  store: DurableStore,
  pendingId: string,
  head: { seq: number; version: number },
  to: PendingState,
  from: PendingState,
  reason: string,
  at: Date,
): Promise<boolean> {
  const seq = head.seq + 1;
  try {
    await store.commit({
      appends: [],
      records: [
        {
          collection: PENDING_HEAD_COLLECTION,
          id: pendingId,
          expectedVersion: head.version,
          value: { state: to, seq } as unknown as { readonly [key: string]: Json },
        },
        {
          collection: PENDING_TRANSITION_COLLECTION,
          id: `${pendingId}#${seq}`,
          expectedVersion: 0,
          value: { pending_id: pendingId, seq, from_state: from, to_state: to, reason, at: at.toISOString() } as unknown as {
            readonly [key: string]: Json;
          },
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
}

export type SummonResult =
  | { readonly ok: true; readonly summoned: Summoned }
  | { readonly ok: false; readonly code: "no_terminal"; readonly message: string };

/**
 * Starts a waiting operation: writes the descriptor, shows the code on the terminal, and returns the
 * pending id. Nothing else is written, and the operation itself has not run.
 */
export async function summon(
  store: DurableStore,
  input: { readonly tenant: string; readonly operator: string; readonly operationId: string; readonly params: Readonly<Record<string, unknown>>; readonly now: Date },
  output: CodeOutput,
): Promise<SummonResult> {
  const pendingId = `pending_${randomUUID()}`;
  const code = newCode();
  const expires = new Date(input.now.getTime() + CONFIRM_TTL_MS);
  const descriptor: PendingDescriptor = {
    pending_id: pendingId,
    tenant: input.tenant,
    operator: input.operator,
    operation_id: input.operationId,
    operation_digest: operationDigest(input.operationId, input.params),
    confirmation_digest: codeDigest(pendingId, code),
    created_at: input.now.toISOString(),
    expires_at: expires.toISOString(),
  };
  if (codeSink === null && !output.terminal(`Confirm ${input.operationId} in Horizon with: horizon confirm --pending ${pendingId}. Code: ${code}. It works once and expires in two minutes.`)) {
    return { ok: false, code: "no_terminal", message: new ConfirmationNeedsTerminal().message };
  }
  if (codeSink !== null) codeSink(pendingId, code);
  await store.commit({
    appends: [],
    records: [
      { collection: PENDING_COLLECTION, id: pendingId, expectedVersion: 0, value: descriptor as unknown as { readonly [key: string]: Json } },
      {
        collection: PENDING_HEAD_COLLECTION,
        id: pendingId,
        expectedVersion: 0,
        value: { state: "pending", seq: 0 } as unknown as { readonly [key: string]: Json },
      },
      {
        collection: PENDING_TRANSITION_COLLECTION,
        id: `${pendingId}#0`,
        expectedVersion: 0,
        value: { pending_id: pendingId, seq: 0, from_state: null, to_state: "pending", reason: "summoned", at: input.now.toISOString() } as unknown as {
          readonly [key: string]: Json;
        },
      },
    ],
  });
  return { ok: true, summoned: { pending_id: pendingId, code, expires_at: expires.toISOString() } };
}

export type ConfirmResult =
  | { readonly ok: true; readonly operation_id: string; readonly operation_digest: string }
  | { readonly ok: false; readonly code: "unknown" | "not_pending" | "expired" | "wrong_code" | "raced"; readonly message: string };

/**
 * Confirms one descriptor against the code the terminal showed. The code must match exactly, the
 * descriptor must still be pending and unexpired, and the transition is one compare-and-swap.
 */
export async function confirm(
  store: DurableStore,
  input: { readonly tenant: string; readonly pendingId: string; readonly typedCode: string; readonly now: Date },
): Promise<ConfirmResult> {
  const descriptor = await descriptorOf(store, input.pendingId);
  if (descriptor === null || descriptor.tenant !== input.tenant) return { ok: false, code: "unknown", message: "No waiting operation has that id." };
  const head = await headOf(store, input.pendingId);
  if (head === null || head.state !== "pending") return { ok: false, code: "not_pending", message: "That operation is no longer waiting for confirmation." };
  if (input.now.getTime() > Date.parse(descriptor.expires_at)) {
    await transition(store, input.pendingId, head, "expired", "pending", "expired before confirmation", input.now);
    return { ok: false, code: "expired", message: "That confirmation expired. Ask again to start a new one." };
  }
  const given = Buffer.from(codeDigest(input.pendingId, input.typedCode));
  const want = Buffer.from(descriptor.confirmation_digest);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return { ok: false, code: "wrong_code", message: "The code does not match. Nothing was confirmed." };
  }
  const moved = await transition(store, input.pendingId, head, "confirmed", "pending", "confirmed on the terminal", input.now);
  if (!moved) return { ok: false, code: "raced", message: "That operation changed while it was being confirmed. Nothing was confirmed." };
  return { ok: true, operation_id: descriptor.operation_id, operation_digest: descriptor.operation_digest };
}

export type ConsumeResult =
  | { readonly ok: true; readonly pending_id: string }
  | { readonly ok: false; readonly code: "awaiting_local_confirmation"; readonly pending_id: string; readonly expires_at: string }
  | { readonly ok: false; readonly code: "no_terminal"; readonly message: string; readonly pending_id: null; readonly expires_at: null };

/**
 * The gate a reserved route calls before its write. It consumes a confirmed descriptor for this exact
 * operation and parameters (once), or reuses a descriptor still waiting, or summons a new one. The
 * caller performs the write only on `ok: true`; every other answer means nothing was written.
 */
export async function gate(
  store: DurableStore,
  input: { readonly tenant: string; readonly operator: string; readonly operationId: string; readonly params: Readonly<Record<string, unknown>>; readonly now: Date },
  output: CodeOutput,
): Promise<ConsumeResult> {
  const digest = operationDigest(input.operationId, input.params);
  const candidates = await store.listRecords(PENDING_COLLECTION, { tenant: input.tenant, operation_digest: digest });
  let waiting: PendingDescriptor | null = null;
  for (const row of candidates) {
    const descriptor = row.value as unknown as PendingDescriptor;
    if (descriptor.operator !== input.operator) continue;
    if (input.now.getTime() > Date.parse(descriptor.expires_at)) continue;
    const head = await headOf(store, descriptor.pending_id);
    if (head === null) continue;
    if (head.state === "confirmed") {
      const moved = await transition(store, descriptor.pending_id, head, "applied", "confirmed", "consumed by the operation", input.now);
      if (moved) return { ok: true, pending_id: descriptor.pending_id };
    }
    if (head.state === "pending" && waiting === null) waiting = descriptor;
  }
  if (waiting !== null) {
    return { ok: false, code: "awaiting_local_confirmation", pending_id: waiting.pending_id, expires_at: waiting.expires_at };
  }
  const summoned = await summon(store, input, output);
  if (!summoned.ok) return { ok: false, code: "no_terminal", message: summoned.message, pending_id: null, expires_at: null };
  if (codeSink !== null) {
    // Test-process seam only (installed by the test preload, never by the server): the code is
    // handed to the test client, which confirms it through the same compare-and-swap as a person.
    const confirmed = await confirm(store, {
      tenant: input.tenant,
      pendingId: summoned.summoned.pending_id,
      typedCode: summoned.summoned.code,
      now: input.now,
    });
    if (confirmed.ok) return gate(store, input, output);
  }
  return { ok: false, code: "awaiting_local_confirmation", pending_id: summoned.summoned.pending_id, expires_at: summoned.summoned.expires_at };
}

/** The state of a descriptor, read from its head. Used by the CLI and by tests. */
export async function stateOf(store: DurableStore, pendingId: string): Promise<PendingState | null> {
  return (await headOf(store, pendingId))?.state ?? null;
}

/** The descriptor, for the terminal to render exactly what is being confirmed. */
export async function describe(store: DurableStore, pendingId: string): Promise<PendingDescriptor | null> {
  return descriptorOf(store, pendingId);
}
