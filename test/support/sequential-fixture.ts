/**
 * Small, explicit frames for the T08 controller and renderer tests.
 *
 * These are not a second set of journeys: each builder names the journey and branch it stands
 * for, and the assertions are about what the renderer does with the same typed frame the T07
 * controller emits. The source-backed path is covered separately through the T06 fixture.
 */
import {
  buildNavigationFrame,
  deriveCase,
  type AffordanceGates,
  type CandidateOperation,
  type DerivedCase,
  type EscalationBehavior,
  type NavigationFrame,
  type PaymentView,
} from "../../src/domain/navigation.ts";

export const WORLD = "world:horizon@sha256:701d6211e7ef60ebb35d100cd8968561a4982daec7162107e91937e3929af290";
export const CHECKPOINT = "cognate:projection@1";
export const OBSERVER = "os:operator:1000";
export const TENANT = "tenant:godspeed";

type GateOverrides = Partial<Record<keyof AffordanceGates, { verdict: "pass" | "fail" | "unknown" | "conflicted"; reason?: string; basis_ref?: string; prerequisite_ref?: string; authority_outcome?: string }>>;

export function gates(overrides: GateOverrides = {}): AffordanceGates {
  const base: Record<string, unknown> = {
    visibility: { verdict: "pass", basis_ref: CHECKPOINT },
    reach: { verdict: "pass", basis_ref: CHECKPOINT },
    payment: { verdict: "pass", basis_ref: CHECKPOINT },
    authority: { verdict: "pass", basis_ref: CHECKPOINT, authority_outcome: "likely_allow" },
    capability: { verdict: "pass", basis_ref: CHECKPOINT },
    recovery: { verdict: "pass", basis_ref: CHECKPOINT },
    settlement_access: { verdict: "pass", basis_ref: CHECKPOINT },
  };
  for (const [key, value] of Object.entries(overrides)) base[key] = value;
  return base as unknown as AffordanceGates;
}

export function readOnly(operation_ref: string, label: string): CandidateOperation {
  return {
    operation_ref,
    label,
    kind: "navigation",
    responsibility: "inspect",
    reversibility: "read_only",
    gates: gates({ authority: { verdict: "pass", authority_outcome: "not_applicable", basis_ref: CHECKPOINT } }),
    expected_evidence: [CHECKPOINT],
  };
}

export function consequential(input: {
  readonly operation_ref: string;
  readonly label: string;
  readonly authority?: { verdict: "pass" | "fail" | "unknown" | "conflicted"; authority_outcome: string; reason?: string; prerequisite_ref?: string };
  readonly payment?: PaymentView;
  readonly escalation?: EscalationBehavior;
  readonly reversibility?: "reversible" | "compensable" | "irreversible" | "unknown";
}): CandidateOperation {
  const authority = input.authority ?? { verdict: "pass" as const, authority_outcome: "likely_allow" };
  return {
    operation_ref: input.operation_ref,
    label: input.label,
    kind: "move",
    responsibility: "commit",
    reversibility: input.reversibility ?? "compensable",
    gates: gates({ authority: { ...authority, basis_ref: CHECKPOINT } }),
    payment: input.payment ?? { entries: [{ currency: "compute" as const, unit: "credits", amount: 2, basis: "predicted" as const, source_ref: "heuristic estimate, never a hard gate" }] },
    expected_evidence: ["evidence:receipt"],
    escalation: input.escalation ?? { behavior: "approval", approval_ref: "sea-forge:approval" },
  };
}

export function caseFor(input: { readonly optional?: boolean; readonly focus?: string; readonly case_ref?: string } = {}): DerivedCase {
  const focus = input.focus ?? "obj:strategy:alpha";
  return deriveCase({
    case_ref: input.case_ref ?? "case:alpha",
    purpose: "keep the strategy inside its declared direction",
    world_ref: WORLD,
    focus_ref: focus,
    direction: { direction_ref: "direction:alpha", statement: "stay inside the declared range", target_ref: focus },
    facts: [
      {
        fact_ref: input.optional === true ? "observation:focus-present" : "observation:deviation",
        subject_ref: focus,
        source_ref: CHECKPOINT,
        statement: input.optional === true ? "focus is present" : "focus is outside the declared range",
        deviation: input.optional !== true,
        material: input.optional !== true,
      },
    ],
  });
}

export function frame(input: {
  readonly candidates: readonly CandidateOperation[];
  readonly optional?: boolean;
  readonly frame_id?: string;
  readonly revision?: number;
  readonly focus?: string;
  readonly checkpoint?: string | null;
  readonly possible?: readonly { readonly operation_ref: string; readonly label: string }[];
}): NavigationFrame {
  const focus = input.focus ?? "obj:strategy:alpha";
  return buildNavigationFrame({
    frame_id: input.frame_id ?? "frame:t08:1",
    revision: input.revision ?? 1,
    context: {
      observer_ref: OBSERVER,
      tenant_ref: TENANT,
      world_ref: WORLD,
      checkpoint_ref: input.checkpoint === undefined ? CHECKPOINT : input.checkpoint,
      checkpoint_unknown_reason: input.checkpoint === null ? "the projection has not been read" : null,
      focus_ref: focus,
      case_ref: "case:alpha",
    },
    case: caseFor({ optional: input.optional, focus }),
    possible_operations: input.possible ?? [],
    candidates: input.candidates,
  });
}

/** J01: a read-only world with no material deviation; optional choices only. */
export function j01(): NavigationFrame {
  return frame({
    optional: true,
    candidates: [readOnly("horizon.inspect.focus", "Inspect Strategy Alpha"), readOnly("horizon.inspect.neighborhood", "Inspect linked objects")],
  });
}

/** J02: a consequential move is available and must be reviewed before its intent exists. */
export function j02(): NavigationFrame {
  return frame({
    candidates: [consequential({ operation_ref: "product.apply", label: "Apply the strategy change" })],
  });
}

/** J02 blocked: approval is required, with exactly one next prerequisite. */
export function j02Blocked(): NavigationFrame {
  return frame({
    candidates: [
      consequential({
        operation_ref: "product.apply",
        label: "Apply the strategy change",
        authority: {
          verdict: "fail",
          authority_outcome: "requires_approval",
          reason: "this change needs an authorized approver",
          prerequisite_ref: "sea-forge:approval:42",
        },
      }),
    ],
  });
}

/** J02 denied: the authority owner refused the exact operation. */
export function j02Denied(): NavigationFrame {
  return frame({
    candidates: [
      consequential({
        operation_ref: "product.apply",
        label: "Apply the strategy change",
        authority: { verdict: "fail", authority_outcome: "denied", reason: "policy prohibits this change" },
      }),
    ],
  });
}

/** J04 unknown and J02 contradicted variants. */
export function j04Unknown(): NavigationFrame {
  return frame({
    candidates: [
      consequential({
        operation_ref: "product.respond",
        label: "Respond to the changed object",
        authority: { verdict: "unknown", authority_outcome: "unreachable", reason: "SEA-Forge is unreachable" },
      }),
    ],
  });
}

export function j02Conflicted(): NavigationFrame {
  return frame({
    candidates: [
      consequential({
        operation_ref: "product.apply",
        label: "Apply the strategy change",
        authority: { verdict: "conflicted", authority_outcome: "unknown", reason: "two policy records disagree" },
      }),
    ],
  });
}

/** J05: comparison exposes a read-only alternative and no world-touching move. */
export function j05(): NavigationFrame {
  return frame({
    optional: true,
    candidates: [readOnly("horizon.compare.hypothetical", "Compare without changing the world")],
  });
}

/** J03: a semantic revision is consequential and carries its evidence and escalation. */
export function j03(): NavigationFrame {
  return frame({
    candidates: [
      consequential({
        operation_ref: "semantic.revise",
        label: "Propose the semantic revision",
        reversibility: "reversible",
        escalation: { behavior: "unknown", note: "promotion approval path is unresolved" },
      }),
    ],
  });
}
