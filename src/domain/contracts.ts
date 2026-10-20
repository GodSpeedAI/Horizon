import type { NavigationFrameV1 } from "./frame.ts";

/**
 * Witnesses for the acceptance contracts that name an observation rather than a behaviour:
 *
 * - `evaluateDeviation` — REQ-CASE-002 / `AC-CASE-002-01` (candidate contract T04-CR-001).
 *   The requirement is "The next primary move MUST respond to material deviation; no primary
 *   recommendation is required when only optional choices remain." The frozen spec's
 *   `reference_algorithms.derive_navigation_frame` selects
 *   `firstAvailableThatAddressesMaterialDeviationOrNone(assessments)`, and `.sea` INV-01
 *   states that a represented possibility is not an affordance until a reachable, payable,
 *   governable, settleable path is visible. This function therefore reports the first choice
 *   that is available and addresses a deviation, or none -- it never names the operation the
 *   observer happened to last use, and it invents no list of outcomes.
 * - `resolvableContext` — REQ-NAV-005 / `AC-NAV-005-01` (candidate contract T04-CR-001).
 *   The requirement is "The navigation controller MUST avoid asking for context it can
 *   resolve without user burden." Asking is a burden; this function reports which requested
 *   context a supplied frame already resolves, so the controller has no reason to ask.
 */

/** A recorded deviation input: what an operation did, relative to what the frame said. */
export interface DeviationInput {
  readonly kind: "undertaken" | "none";
  /** The operation that deviated (required when `kind` is `undertaken`). */
  readonly operation_ref?: string;
  /** What the observer saw happen. */
  readonly observed: string | null;
}

export interface PrimaryMove {
  readonly kind: "primary" | "optional-only";
  readonly operation_ref: string | null;
  readonly responds_to: string | null;
}

export class ContractError extends Error {
  override readonly name = "ContractError";
}

/**
 * The next primary move for one deviation input: the *first* available choice that addresses
 * the deviation, in the frame's own order (the spec's reference algorithm). A frame whose
 * choices are all unavailable has no available move; when no deviation was recorded it has
 * no primary move either, and only optional choices remain.
 */
export function evaluateDeviation(options: {
  readonly deviation: DeviationInput;
  readonly choices: NavigationFrameV1["choices"];
}): PrimaryMove {
  const { deviation, choices } = options;
  if (deviation.kind === "none") {
    if (choices.length === 0) {
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
  const move = choices.find((choice) => choice.assessment.status === "available");
  if (!move) {
    // Possibility is not an affordance (INV-01): no available choice, no primary move.
    return { kind: "optional-only", operation_ref: null, responds_to: null };
  }
  return { kind: "primary", operation_ref: move.operation_ref, responds_to: deviation.operation_ref };
}

/** Reference classes a supplied frame may carry; not an enumeration the ruler declares. */
const FRAME_REFERENCES = ["checkpoint", "world", "operation", "focus"] as const;
export type FrameReference = (typeof FRAME_REFERENCES)[number];

/**
 * Which references in `requested` a supplied frame resolves itself, so the controller has no
 * reason to ask for them (REQ-NAV-005: "MUST avoid asking for context it can resolve without
 * user burden"). The frame's reference classes are a property of this frame, not a vocabulary
 * the ruler declares. A reference is resolved only if the frame actually carries it; an
 * unknown checkpoint, or a requested value that differs from the frame's, is not resolved and
 * must still be asked for.
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
