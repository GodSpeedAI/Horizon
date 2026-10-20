/**
 * Typed navigation intent, bound to the canonical IDM operation
 * `commit_navigation_intent` and record `CommitIntentInput` / `CommitIntentOutput`
 * (`.sea/interaction/interaction-model.sea:441`, `:454`).
 *
 * The record has no free-form parameters and no field that can carry authority,
 * presentation identity or approval: `actor_ref` is the only observer-bearing field
 * and it is checked against the authenticated caller, never trusted as given
 * (REQ-CONFIG-001). That is what makes a *typed* intent route possible at T04
 * without inventing a second runtime or a later navigation feature.
 */
import type { NavigationFrameV1 } from "./frame.ts";

export class IntentError extends Error {
  override readonly name = "IntentError";
  constructor(
    readonly code: "invalid_argument" | "failed_precondition",
    message: string,
  ) {
    super(`INTENT: ${message}`);
  }
}

/** Exactly the fields of the `.sea` `CommitIntentInput` record, in canonical order. */
export interface CommitIntentInput {
  readonly intent_id: string;
  readonly frame_id: string;
  readonly frame_revision: number;
  readonly actor_ref: string;
  readonly operation_ref: string;
}

export interface CommitIntentOutput {
  readonly intent_id: string;
  readonly correlation_ref?: string;
}

const INPUT_FIELDS = ["intent_id", "frame_id", "frame_revision", "actor_ref", "operation_ref"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Build the canonical intent for one choice of one frame revision.
 *
 * A route (CLI, GUI, Clack or machine adapter) supplies the frame, the choice it
 * selects and a fresh intent id; it cannot supply an observer or an operation that
 * the frame does not offer.
 */
export function buildCommitIntent(options: {
  readonly frame: NavigationFrameV1;
  readonly operationRef: string;
  readonly intentId: string;
}): CommitIntentInput {
  const { frame } = options;
  return {
    intent_id: options.intentId,
    frame_id: frame.frame_id,
    frame_revision: frame.revision,
    actor_ref: frame.observer_ref,
    operation_ref: options.operationRef,
  };
}

/**
 * Validate a candidate intent against the frame it claims to act on (the `.sea`
 * idempotency key is `intent_id`; `actor_ref` must be the authenticated caller).
 */
export function assertCommitIntent(
  value: unknown,
  frame: NavigationFrameV1,
  callerActorRef: string,
  allowedExtra: readonly string[] = [],
): CommitIntentInput {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new IntentError("invalid_argument", "intent must be an object");
  }
  const record = value as Record<string, unknown>;
  const declared = [...INPUT_FIELDS, "correlation_ref"] as readonly string[];
  const unknown = Object.keys(record).filter((key) => !declared.includes(key) && !allowedExtra.includes(key));
  if (unknown.length > 0) {
    throw new IntentError("invalid_argument", `intent carries undeclared fields: ${unknown.join(", ")}`);
  }
  if (typeof record.intent_id !== "string" || !UUID.test(record.intent_id)) {
    throw new IntentError("invalid_argument", "intent_id must be a uuid");
  }
  if (record.frame_id !== frame.frame_id) {
    throw new IntentError("failed_precondition", `intent frame ${String(record.frame_id)} is not the current frame ${frame.frame_id}`);
  }
  if (record.frame_revision !== frame.revision) {
    throw new IntentError("failed_precondition", `intent frame_revision ${String(record.frame_revision)} is stale; current is ${frame.revision}`);
  }
  if (record.actor_ref !== callerActorRef) {
    throw new IntentError("failed_precondition", `actor_ref ${String(record.actor_ref)} is not the authenticated observer ${callerActorRef}`);
  }
  if (typeof record.operation_ref !== "string" || !frame.choices.some((choice) => choice.operation_ref === record.operation_ref)) {
    throw new IntentError("invalid_argument", `operation_ref ${String(record.operation_ref)} is not a choice of frame ${frame.frame_id}`);
  }
  return {
    intent_id: record.intent_id,
    frame_id: record.frame_id,
    frame_revision: record.frame_revision,
    actor_ref: record.actor_ref,
    operation_ref: record.operation_ref,
  };
}
