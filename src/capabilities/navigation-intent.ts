/**
 * `commit_navigation_intent` (`.sea/interaction/interaction-model.sea:454`), the only
 * state-changing operation the structural skeleton exposes.
 *
 * Bound to the canonical records rather than invented:
 *   - input `CommitIntentInput` / output `CommitIntentOutput` (`:441`, `:449`);
 *   - the frame the intent names must be the most recent frame this application issued
 *     (`frame_revision` is a stale-frame guard, `failed_precondition`);
 *   - a duplicate `intent_id` with different input is a `duplicate_intent`
 *     (`already_exists`), never a second record;
 *   - the commit is recorded as a run-less event so the observation survives the
 *     process and the projection can report it.
 *
 * `authority_ref` is deliberately absent: a typed intent is not approval and does not
 * mutate the world (REQ-INT-004), and this skeleton has no authority source.
 */
import type { Component } from "@godspeedai/cognate-kernel-api";
import { randomUUID } from "node:crypto";
import { ConcurrencyError, RecordConflictError, type DurableStore, type Json, type StoredEvent } from "@godspeedai/cognate-events";
import { assertCommitIntent, IntentError, type CommitIntentInput, type CommitIntentOutput } from "../domain/intent.ts";
import type { NavigationFrameV1, NavigationIntentRecord } from "../domain/frame.ts";
import { type ExpectedOutcome, type SettlementWindow, expectationDigest } from "../domain/expectation.ts";
import { CONTRACT_VERSION, contractVersionOf } from "./capacity-ledger.ts";

/**
 * What a HORIZON-001 1.1.0 record carries beyond the intent fields (REQ-NAV-011). The capacity reservation is
 * not here: it commits with the pending intent (pending-intent.ts), before authority is requested; this record
 * is the operation's effect, written on execution.
 */
export interface IntentContract {
  readonly expectation: ExpectedOutcome | null;
  readonly threshold: { readonly id: string; readonly position: number } | null;
  readonly window: SettlementWindow | null;
}

export const NAVIGATION_INTENT_COMMIT = {
  id: "horizon.navigation.intent.commit",
  version: "1.0.0",
} as const;

export interface FrameRegister {
  current(): NavigationFrameV1 | null;
  issue(frame: NavigationFrameV1): void;
}

/** The most recently issued frame; the only frame a typed intent may act on. */
export function createFrameRegister(): FrameRegister {
  let current: NavigationFrameV1 | null = null;
  return {
    current: () => current,
    issue(frame) {
      if (current !== null && frame.frame_id === current.frame_id && frame.revision <= current.revision) {
        throw new Error(`INTENT: frame ${frame.frame_id} reissued at revision ${frame.revision}`);
      }
      current = frame;
    },
  };
}
/** Stream that holds committed `NavigationIntentRecord` events. */
export const INTENT_STREAM = "horizon.navigation-intents";
/** Stream that holds one record per attempted intent, refused or committed. */
export const INTENT_ATTEMPT_STREAM = "horizon.navigation-intent-attempts";
/** One entry per committed intent, keyed `<tenant>/<intent_id>`: the exactly-once guard and its O(1) lookup. */
export const INTENT_INDEX_COLLECTION = "horizon.navigation-intent-index";
/** Highest outcome recorded per intent id (stream-local keys avoid collisions across keys). */
export const INTENT_AUDIT_COLLECTION = "horizon.navigation-intent-audit";

export interface EventRecorded {
  readonly eventId: string;
  /** Store-wide commit position. */
  readonly position: number;
  readonly streamVersion: number;
}

/**
 * Append one committed `NavigationIntentRecord` (`interaction-model.sea:218`) to the
 * durable Cognate event log.
 *
 * The kernel already records every *invocation* (`capability.selected` /
 * `capability.outcome`, with the policy decision), so an attempt is observable even when
 * the validator refuses it. An invocation record is not the typed record the IDM
 * declares, though: this appends one run-less `horizon.navigation.intent.committed` event
 * whose payload is exactly the record's fields, so a restart reconstructs which intent
 * was committed, for which frame revision and observer. It writes through Cognate's own
 * store, never a second event history (REQ-STACK-002).
 *
 * It runs as a separate step after a successful commit, so a refused intent provably
 * writes no record (REQ-INT-004, REQ-VERIFY-002).
 *
 * Exactly once per `intent_id` within a tenant (J02 IS5): the same intent again returns the record
 * already committed, and the same id with a different intent is `duplicate_intent`
 * (`already_exists`). The event and an index record keyed `<tenant>/<intent_id>` (expected version 0,
 * "must not exist") commit atomically, so concurrent commits of one id cannot both land, and the
 * duplicate check is one record read rather than a scan of every intent. A resumed or replayed
 * governed run may therefore call this again safely. Records committed before the index existed are
 * indexed once per process, on first use.
 */
export async function appendIntentRecord(
  store: DurableStore,
  options: { readonly record: NavigationIntentRecord; readonly tenant: string; readonly scopeId: string; readonly contract?: IntentContract },
): Promise<EventRecorded> {
  await backfillIntentIndex(store);
  const key = indexKey(options.tenant, options.record.intent_id);
  const contract = options.contract;
  const digest = contract?.expectation ? expectationDigest(contract.expectation) : null;
  const record: NavigationIntentRecord = contract
    ? {
        ...options.record,
        contract_version: CONTRACT_VERSION,
        expected_outcome: contract.expectation,
        expectation_digest: digest,
        realitytrace_threshold: contract.threshold,
        window: contract.window,
      }
    : options.record;
  for (let attempt = 0; ; attempt++) {
    const committed = await committedRecord(store, key, record);
    if (committed) return committed;
    const eventId = randomUUID();
    let outcome;
    try {
      outcome = await store.commit({
        appends: [
          {
            streamId: INTENT_STREAM,
            expectedVersion: await store.streamVersion(INTENT_STREAM),
            events: [
              {
                eventId,
                eventType: "horizon.navigation.intent.committed",
                schemaVersion: 1,
                occurredAt: new Date().toISOString(),
                tenant: options.tenant,
                correlationId: record.correlation_ref ?? eventId,
                causationId: null,
                runId: null,
                scopeId: options.scopeId,
                componentId: "horizon.navigation-intent",
                payload: {
                  intent_id: record.intent_id,
                  frame_id: record.frame_id,
                  frame_revision: record.frame_revision,
                  actor_ref: record.actor_ref,
                  operation_ref: record.operation_ref,
                  ...(record.authority_ref ? { authority_ref: record.authority_ref } : {}),
                  correlation_ref: record.correlation_ref ?? null,
                  ...(contract
                    ? {
                        contract_version: CONTRACT_VERSION,
                        expected_outcome: (contract.expectation ?? null),
                        expectation_digest: digest,
                        realitytrace_threshold: (contract.threshold ?? null),
                        window: (contract.window ?? null),
                      }
                    : {}),
                } as unknown as Json,
              },
            ],
          },
        ],
        records: [
          {
            collection: INTENT_INDEX_COLLECTION,
            id: key,
            expectedVersion: 0,
            value: { event_id: eventId, ...intentFields(record), ...(contract ? { contract_version: CONTRACT_VERSION, expectation_digest: digest } : {}) },
          },
        ],
      });
    } catch (error) {
      // Another commit landed between the read and this commit (this id, or any intent): re-check.
      if ((error instanceof ConcurrencyError || error instanceof RecordConflictError) && attempt < 16) continue;
      throw error;
    }
    if (outcome.kind !== "committed") throw new Error(`INTENT: intent record was not committed (${outcome.kind})`);
    const recorded = outcome.events.find((event) => event.eventId === eventId);
    if (!recorded) throw new Error("INTENT: committed intent record is not readable from the store");
    return { eventId: recorded.eventId, position: recorded.position, streamVersion: recorded.streamSequence };
  }
}

function indexKey(tenant: string, intentId: string): string {
  return `${tenant}/${intentId}`;
}

/** The intent fields a duplicate is judged on; `correlation_ref` names the invocation, not the intent. */
function intentFields(record: CommitIntentInput): CommitIntentInput {
  return {
    intent_id: record.intent_id,
    frame_id: record.frame_id,
    frame_revision: record.frame_revision,
    actor_ref: record.actor_ref,
    operation_ref: record.operation_ref,
  };
}

function duplicateIntent(intentId: string): IntentError {
  return new IntentError("already_exists", `duplicate_intent: intent ${intentId} was already committed with different input`);
}

/** The record already committed under this key, or null; a different intent under that id throws. */
async function committedRecord(store: DurableStore, key: string, record: NavigationIntentRecord): Promise<EventRecorded | null> {
  const entry = await store.getRecord(INTENT_INDEX_COLLECTION, key);
  if (!entry) return null;
  contractVersionOf(entry.value);
  const have = entry.value as unknown as CommitIntentInput & { readonly event_id: string; readonly expectation_digest?: string | null };
  const want = intentFields(record);
  if ((Object.keys(want) as (keyof CommitIntentInput)[]).some((field) => have[field] !== want[field])) throw duplicateIntent(record.intent_id);
  // The expectation is part of the canonical input: the same id with a changed expectation is a new intent.
  if ((have.expectation_digest ?? null) !== (record.expectation_digest ?? null)) throw duplicateIntent(record.intent_id);
  const event = (await store.readStream(INTENT_STREAM, {})).find((e) => e.eventId === have.event_id);
  if (!event) throw new Error(`INTENT: the index names event ${have.event_id}, which the intent stream does not hold`);
  return { eventId: event.eventId, position: event.position, streamVersion: event.streamSequence };
}

const indexed = new WeakSet<DurableStore>();

/** Index intents committed before the index existed; once per store per process. */
async function backfillIntentIndex(store: DurableStore): Promise<void> {
  if (indexed.has(store)) return;
  for (const event of await store.readStream(INTENT_STREAM, {})) {
    const payload = event.payload as unknown as CommitIntentInput | null;
    if (!payload || typeof payload.intent_id !== "string") continue;
    const key = indexKey(event.tenant, payload.intent_id);
    if (await store.getRecord(INTENT_INDEX_COLLECTION, key)) continue;
    try {
      await store.commit({ appends: [], records: [{ collection: INTENT_INDEX_COLLECTION, id: key, expectedVersion: 0, value: { event_id: event.eventId, ...intentFields(payload) } }] });
    } catch (error) {
      if (!(error instanceof RecordConflictError)) throw error;
    }
  }
  indexed.add(store);
}

/** Read committed intent records back from the durable log. */
export async function readIntentRecords(
  store: DurableStore,
): Promise<readonly { readonly event: StoredEvent; readonly record: NavigationIntentRecord }[]> {
  const events = await store.readStream(INTENT_STREAM, {});
  return events.map((event) => {
    contractVersionOf(event.payload);
    return { event, record: event.payload as unknown as NavigationIntentRecord };
  });
}

export interface IntentAttempt {
  readonly intent_id: string | null;
  /** The observer the intent claimed. */
  readonly actor_ref: string | null;
  /** The authenticated caller that submitted it. */
  readonly caller_ref: string | null;
  /** `awaiting_authority`: SEA-Forge escalated; the commit waits for an operator's decision (no record yet). */
  readonly outcome: "accepted" | "refused" | "awaiting_authority";
  readonly reason: string | null;
  readonly at: string;
}

/**
 * Record that an intent was *attempted*, and how it ended.
 *
 * A refused intent must leave an observable audit record (AC-CONFIG-001-01:
 * "the attempt is observable in the audit record") while writing no
 * `NavigationIntentRecord` and no caller-sourced event. Cognate's causal inspection
 * only reports `run.invocation` events, so the attempt is written here, through the
 * same durable store. Repeated attempts for one intent id are stream-ordered; the
 * audit collection keeps the highest version under a key escaped from the intent id.
 */
export async function appendIntentAttempt(
  store: DurableStore,
  options: { readonly attempt: IntentAttempt; readonly tenant: string; readonly scopeId: string },
): Promise<{ readonly eventId: string; readonly position: number; readonly version: number }> {
  const key = options.attempt.intent_id === null ? "unidentified" : `intent:${options.attempt.intent_id}`;
  const current = await store.getRecord(INTENT_AUDIT_COLLECTION, key);
  const version = (current?.version ?? 0) + 1;
  const eventId = randomUUID();
  const outcome = await store.commit({
    appends: [
      {
        streamId: INTENT_ATTEMPT_STREAM,
        expectedVersion: await store.streamVersion(INTENT_ATTEMPT_STREAM),
        events: [
          {
            eventId,
            eventType: `horizon.navigation.intent.${options.attempt.outcome}`,
            schemaVersion: 1,
            occurredAt: options.attempt.at,
            tenant: options.tenant,
            correlationId: eventId,
            causationId: null,
            runId: null,
            scopeId: options.scopeId,
            componentId: "horizon.navigation-intent",
            payload: {
              intent_id: options.attempt.intent_id,
              actor_ref: options.attempt.actor_ref,
              caller_ref: options.attempt.caller_ref,
              outcome: options.attempt.outcome,
              reason: options.attempt.reason,
            },
          },
        ],
      },
    ],
    records: [
      {
        collection: INTENT_AUDIT_COLLECTION,
        id: key,
        expectedVersion: current?.version ?? 0,
        value: {
          intent_id: options.attempt.intent_id,
          actor_ref: options.attempt.actor_ref,
          caller_ref: options.attempt.caller_ref,
          outcome: options.attempt.outcome,
          reason: options.attempt.reason,
          attempts: version,
          at: options.attempt.at,
        },
      },
    ],
  });
  if (outcome.kind !== "committed") throw new Error(`INTENT: audit attempt was not committed (${outcome.kind})`);
  const events = await store.readStream(INTENT_ATTEMPT_STREAM, {});
  return { eventId, position: events[events.length - 1]?.position ?? 0, version };
}

/** All attempt records, oldest first. */
export async function readIntentAttempts(store: DurableStore): Promise<readonly IntentAttempt[]> {
  const events = await store.readStream(INTENT_ATTEMPT_STREAM, {});
  return events.map((event) => {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    return {
      intent_id: typeof payload.intent_id === "string" ? payload.intent_id : null,
      actor_ref: typeof payload.actor_ref === "string" ? payload.actor_ref : null,
      caller_ref: typeof payload.caller_ref === "string" ? payload.caller_ref : null,
      outcome:
        event.eventType === "horizon.navigation.intent.accepted"
          ? "accepted"
          : event.eventType === "horizon.navigation.intent.awaiting_authority"
            ? "awaiting_authority"
            : "refused",
      reason: typeof payload.reason === "string" ? payload.reason : null,
      at: event.occurredAt,
    };
  });
}


export interface NavigationIntentComponent extends Component {
  /** The frame register this component validates against. */
  readonly frames: FrameRegister;
}

export function navigationIntentComponent(register: FrameRegister = createFrameRegister()): NavigationIntentComponent {
  return {
    frames: register,
    id: "horizon.navigation-intent",
    provides: [NAVIGATION_INTENT_COMMIT],
    activate(fiber) {
      // The kernel records `capability.selected` / `capability.outcome` (with the policy
      // decision) for every invocation, so an attempt is observable in the audit trail
      // even when the validator refuses it — nothing extra may be written here.
      fiber.provide(NAVIGATION_INTENT_COMMIT, async (input: unknown, context): Promise<CommitIntentOutput> => {
        const frame = register.current();
        if (frame === null) throw new Error("INTENT: no navigation frame has been issued");
        const intent: CommitIntentInput = assertCommitIntent(input, frame, frame.observer_ref);
        return { intent_id: intent.intent_id, correlation_ref: context.correlationId };
      });
    },
  };
}
