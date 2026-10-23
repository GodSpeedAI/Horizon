/**
 * The 1.1.0 upgrade (SPEC-CR-002 "Migration and upgrade" steps 2-3, and "Rollback").
 *
 * - Governed commit runs started by 1.1.x carry `contract_version: 2` in their input.
 * - A v1 commit run still awaiting authority, or pending execution, is suspended: the commit agent
 *   refuses it before invoking and before recording, so it never executes, even if its approval is
 *   granted later. A suspension record presents it ("suspended by the 1.1.0 upgrade; re-commit under
 *   the current world"). Its pins are retained and it consumes no capacity (v1 reserved none).
 * - The store is marked `horizon.contract_version = 2`.
 * - The rollback guard refuses a 1.0.1 start against a store holding any v2 state: the marker, a v2
 *   intent record or a v2 pending run input.
 *
 * Reads the store only, so the guard can run without starting Horizon.
 */
import { RecordConflictError, type DurableStore, type StoredEvent } from "@godspeedai/cognate-events";
import { INTENT_STREAM } from "./navigation-intent.ts";
import { CONTRACT_VERSION, contractVersionOf, markStore, readStoreMarker } from "./capacity-ledger.ts";

export const NAVIGATION_COMMIT_AGENT_ID = "horizon.navigation.commit";
/** Hyphenated, not dotted: listRecords accepts only [A-Za-z0-9_-] collection names. */
export const SUSPENSION_COLLECTION = "horizon-navigation-intent-suspension";
export const SUSPENDED_REASON = "suspended by the 1.1.0 upgrade; re-commit under the current world";

export class SuspendedIntentError extends Error {
  override readonly name = "SuspendedIntentError";
  readonly code = "failed_precondition";
  constructor(intentId: string) {
    super(`INTENT: ${intentId} was ${SUSPENDED_REASON}`);
  }
}

/** Refuse a commit run input that this build must not execute: a v1 input (suspended) or an unknown version. */
export function assertCurrentRunInput(input: unknown, intentId: string): void {
  if (contractVersionOf(input) !== CONTRACT_VERSION) throw new SuspendedIntentError(intentId);
}

export interface RunSummary {
  readonly runId: string;
  readonly agent: string;
  readonly tenant: string;
  readonly input: unknown;
  readonly terminal: boolean;
}

const TERMINAL_EVENTS = new Set(["run.completed", "run.failed", "run.cancelled"]);

function summarize(runId: string, events: readonly StoredEvent[]): RunSummary | undefined {
  const first = events[0];
  if (!first || first.eventType !== "run.started") return undefined;
  const metadata = (first.metadata ?? {}) as Record<string, unknown>;
  return {
    runId,
    agent: typeof metadata.agent === "string" ? metadata.agent : "",
    tenant: first.tenant,
    input: ((first.payload ?? {}) as Record<string, unknown>).input ?? null,
    terminal: events.some((event) => TERMINAL_EVENTS.has(event.eventType)),
  };
}

/** Every Cognate run in the store, folded just far enough to tell its agent, input and whether it ended. */
export async function listRunSummaries(store: DurableStore): Promise<readonly RunSummary[]> {
  const summaries: RunSummary[] = [];
  for (const record of await store.listRecords("runs")) {
    const summary = summarize(record.id, await store.readStream(`run-${record.id}`, {}));
    if (summary) summaries.push(summary);
  }
  return summaries;
}

export interface Suspension {
  readonly intent_id: string;
  readonly run_id: string;
  readonly reason: string;
  readonly at: string;
}

const intentIdOf = (input: unknown): string | null => {
  const intent = (input as { intent?: { intent_id?: unknown } } | null)?.intent;
  return typeof intent?.intent_id === "string" ? intent.intent_id : null;
};

/**
 * Activate the 1.1.0 contract on this store: suspend pending v1 commit runs, then write the marker.
 * Idempotent, and safe to run at every start.
 */
export async function activateContract(store: DurableStore, now: Date): Promise<readonly Suspension[]> {
  const suspended: Suspension[] = [];
  for (const run of await listRunSummaries(store)) {
    if (run.agent !== NAVIGATION_COMMIT_AGENT_ID || run.terminal) continue;
    if (contractVersionOf(run.input) === CONTRACT_VERSION) continue;
    const intentId = intentIdOf(run.input);
    if (intentId === null) continue;
    const suspension: Suspension = { intent_id: intentId, run_id: run.runId, reason: SUSPENDED_REASON, at: now.toISOString() };
    try {
      await store.commit({ appends: [], records: [{ collection: SUSPENSION_COLLECTION, id: `${run.tenant}/${intentId}`, expectedVersion: 0, value: { ...suspension } }] });
      suspended.push(suspension);
    } catch (error) {
      if (!(error instanceof RecordConflictError)) throw error;
    }
  }
  await markStore(store);
  return suspended;
}

export async function readSuspensions(store: DurableStore, tenant: string): Promise<readonly Suspension[]> {
  return (await store.listRecords(SUSPENSION_COLLECTION))
    .filter((record) => record.id.startsWith(`${tenant}/`))
    .map((record) => record.value as unknown as Suspension);
}

export interface RollbackVerdict {
  readonly allowed: boolean;
  readonly reasons: readonly string[];
}

/**
 * Whether a 1.0.1 build may open this store. 1.0.1 does not check contract versions and cannot be made
 * to, so any v2 state means rollback is restore-from-backup, never an in-place start.
 */
export async function rollbackVerdict(store: DurableStore): Promise<RollbackVerdict> {
  const reasons: string[] = [];
  const marker = await readStoreMarker(store).catch((error: Error) => {
    reasons.push(error.message);
    return null;
  });
  if (marker !== null && marker >= 2) reasons.push(`the store is marked horizon.contract_version = ${marker}`);
  const records = (await store.readStream(INTENT_STREAM, {})).filter((event) => {
    const version = (event.payload as { contract_version?: unknown } | null)?.contract_version;
    return version !== undefined && version !== 1;
  });
  if (records.length > 0) reasons.push(`${records.length} intent record(s) carry contract_version 2 or later`);
  const runs = (await listRunSummaries(store)).filter((run) => {
    const version = (run.input as { contract_version?: unknown } | null)?.contract_version;
    return run.agent === NAVIGATION_COMMIT_AGENT_ID && !run.terminal && version !== undefined && version !== 1;
  });
  if (runs.length > 0) reasons.push(`${runs.length} pending commit run input(s) carry contract_version 2 or later`);
  return { allowed: reasons.length === 0, reasons };
}
