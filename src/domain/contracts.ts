import type { NavigationFrameV1 } from "./frame.ts";

/**
 * Witnesses for the acceptance contracts that name an observation rather than a behaviour:
 *
 * - `evaluateDeviation` — REQ-CASE-002 / `AC-CASE-002-01` (candidate contract T04-CR-001).
 *   The ruler does not define "material", so the *input* is supplied by the caller and this
 *   function only states what the requirement requires of a supplied input: the next move
 *   responds to an undertaken deviation, and with no deviation a frame of optional choices
 *   names no primary move.
 * - `resolvableContext` — REQ-NAV-005 / `AC-NAV-005-01` (candidate contract T04-CR-001).
 *   Context already present as a frame reference is resolvable without asking.
 */

/** A recorded deviation input: what an operation did, relative to what the frame said. */
export interface DeviationInput {
  readonly kind: "undertaken" | "none";
  /** The operation that deviated (required when `kind` is `undertaken`). */
  readonly operation_ref?: string;
  /** What the observer saw happen. */
  readonly observed: "completed" | "refused" | "failed" | "contradicted" | null;
}

export interface PrimaryMove {
  readonly kind: "primary" | "optional-only";
  readonly operation_ref: string | null;
  readonly responds_to: string | null;
  /** The operation recommended when the deviation was recorded, when it changed. */
  readonly changed_from?: string;
}

export class ContractError extends Error {
  override readonly name = "ContractError";
}

/**
 * The next primary move for one deviation input. `previousRecommended` is the operation the
 * prior frame recommended; it must not be recommended again when that operation deviated.
 */
export function evaluateDeviation(options: {
  readonly deviation: DeviationInput;
  readonly previousRecommended: string | null;
  readonly choices: NavigationFrameV1["choices"];
}): PrimaryMove {
  const { deviation } = options;
  if (deviation.kind === "none") {
    if (options.choices.length === 0) {
      throw new ContractError("CONTRACT: a frame with no choices cannot name a move or be optional-only");
    }
    return { kind: "optional-only", operation_ref: null, responds_to: null };
  }
  if (typeof deviation.operation_ref !== "string" || deviation.operation_ref.trim() === "") {
    throw new ContractError("CONTRACT: an undertaken deviation must name the operation that deviated");
  }
  if (deviation.observed === null) {
    throw new ContractError("CONTRACT: an undertaken deviation must record what was observed to happen");
  }
  if (options.choices.every((choice) => choice.operation_ref === deviation.operation_ref)) {
    throw new ContractError(`CONTRACT: no move other than ${deviation.operation_ref} is available to respond with`);
  }
  // The move responds to the operation that deviated. When that is the earlier
  // recommendation, the move is recorded as changed from it.
  const changed = deviation.operation_ref === options.previousRecommended;
  return {
    kind: "primary",
    operation_ref: deviation.operation_ref,
    responds_to: deviation.operation_ref,
    ...(changed && options.previousRecommended ? { changed_from: options.previousRecommended } : {}),
  };
}

/** Reference classes already present in a frame an operator cannot be asked to repeat. */
const FRAME_REFERENCES = ["checkpoint", "world", "operation", "focus"] as const;
export type FrameReference = (typeof FRAME_REFERENCES)[number];

/**
 * Which references in `requested` the frame can resolve itself. A reference is resolvable
 * only if the frame actually carries it (a checkpoint, a world, an operation choice or a
 * focus); anything else must still be asked for.
 */
export function resolvableContext(
  frame: NavigationFrameV1,
  requested: readonly { readonly reference: FrameReference; readonly value?: string }[],
): readonly { readonly reference: FrameReference; readonly resolved_from: string }[] {
  const available: Record<FrameReference, string | null> = {
    checkpoint: frame.checkpoint_ref && frame.checkpoint_ref !== "cognate:none" ? frame.checkpoint_ref : null,
    world: frame.world_ref || null,
    operation: frame.choices[0]?.operation_ref ?? null,
    focus: frame.focus_ref || null,
  };
  const resolved: { reference: FrameReference; resolved_from: string }[] = [];
  for (const item of requested) {
    const source = available[item.reference];
    if (!source) continue;
    if (item.value !== undefined && item.value !== source) {
      // A different value for the same reference class is not resolvable from this frame.
      continue;
    }
    resolved.push({ reference: item.reference, resolved_from: source });
  }
  return resolved;
}
