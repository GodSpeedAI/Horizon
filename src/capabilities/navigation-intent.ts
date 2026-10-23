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
import { ConcurrencyError, fingerprint, IdempotencyMismatchError, type DurableStore, type Json, type StoredEvent } from "@godspeedai/cognate-events";
import { assertCommitIntent, IntentError, type CommitIntentInput, type CommitIntentOutput } from "../domain/intent.ts";
import type { NavigationFrameV1, NavigationIntentRecord } from "../domain/frame.ts";

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
 * Exactly once per `intent_id` (J02 IS5): the same intent again returns the record already
 * committed, and the same id with a different intent is `duplicate_intent` (`already_exists`).
 * The store's idempotency key makes this atomic under concurrent commits; the stream check
 * also covers records committed before the key existed. A resumed or replayed governed run
 * may therefore call this again safely.
 */
export async function appendIntentRecord(
  store: DurableStore,
  options: { readonly record: NavigationIntentRecord; readonly tenant: string; readonly scopeId: string },
): Promise<EventRecorded> {
  const committed = await committedRecord(store, options.record);
  if (committed) return committed;
  const eventId = randomUUID();
  for (let attempt = 0; ; attempt++) {
    let outcome;
    try {
      outcome = await store.commit({
        idempotency: { scope: INTENT_STREAM, key: options.record.intent_id, fingerprint: fingerprint(intentFields(options.record) as unknown as Json) },
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
                correlationId: options.record.correlation_ref ?? eventId,
                causationId: null,
                runId: null,
                scopeId: options.scopeId,
                componentId: "horizon.navigation-intent",
                payload: {
                  intent_id: options.record.intent_id,
                  frame_id: options.record.frame_id,
                  frame_revision: options.record.frame_revision,
                  actor_ref: options.record.actor_ref,
                  operation_ref: options.record.operation_ref,
                  ...(options.record.authority_ref ? { authority_ref: options.record.authority_ref } : {}),
                  correlation_ref: options.record.correlation_ref ?? null,
                },
              },
            ],
          },
        ],
      });
    } catch (error) {
      if (error instanceof IdempotencyMismatchError) throw duplicateIntent(options.record.intent_id);
      // Another intent was committed between reading the version and committing: re-check, retry.
      if (error instanceof ConcurrencyError && attempt < 4) {
        const raced = await committedRecord(store, options.record);
        if (raced) return raced;
        continue;
      }
      throw error;
    }
    if (outcome.kind === "duplicate") {
      const replayed = await committedRecord(store, options.record);
      if (!replayed) throw new Error("INTENT: an idempotent replay found no committed intent record");
      return replayed;
    }
    const events = await store.readStream(INTENT_STREAM, {});
    const recorded = events.find((event) => event.eventId === eventId);
    if (!recorded) throw new Error("INTENT: committed intent record is not readable from the store");
    return { eventId: recorded.eventId, position: recorded.position, streamVersion: recorded.streamSequence };
  }
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

/** The record already committed for this intent id, or null; a different intent under that id throws. */
async function committedRecord(store: DurableStore, record: CommitIntentInput): Promise<EventRecorded | null> {
  const events = await store.readStream(INTENT_STREAM, {});
  const existing = events.find((event) => (event.payload as Record<string, unknown> | null)?.intent_id === record.intent_id);
  if (!existing) return null;
  const want = intentFields(record);
  const have = existing.payload as unknown as CommitIntentInput;
  if ((Object.keys(want) as (keyof CommitIntentInput)[]).some((key) => have[key] !== want[key])) throw duplicateIntent(record.intent_id);
  return { eventId: existing.eventId, position: existing.position, streamVersion: existing.streamSequence };
}

/** Read committed intent records back from the durable log. */
export async function readIntentRecords(
  store: DurableStore,
): Promise<readonly { readonly event: StoredEvent; readonly record: NavigationIntentRecord }[]> {
  const events = await store.readStream(INTENT_STREAM, {});
  return events.map((event) => ({ event, record: event.payload as unknown as NavigationIntentRecord }));
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
