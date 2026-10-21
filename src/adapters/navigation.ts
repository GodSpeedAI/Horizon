/**
 * Source adapter for the T07 controller.
 *
 * It reads the T06 operational projection — a real Cognate read, already checkpointed — and derives
 * only what those facts support: read-only inspection moves. It does **not** invent a
 * consequential move, an authority evaluation or a payment estimate, because T07 has no SEA-Forge
 * evaluation channel. A caller that has a real evaluation may supply it to the controller directly.
 *
 * The case is a derived value, not stored state: facts name the object/link refs and the checkpoint
 * they were read at, and the direction is the caller's declared purpose. There is no case table.
 */
import type { CandidateOperation, CaseFact, DerivedCase, NavigationFrame, PossibleOperation } from "../domain/navigation.ts";
import { buildNavigationFrame, deriveCase } from "../domain/navigation.ts";
import type { DeclaredWorld, ProjectionView } from "./operational-objects.ts";
import type { OperationalLinkV1, OperationalObjectV1 } from "../domain/operational.ts";

export interface OperationalNavigationInput {
  readonly observer_ref: string;
  readonly tenant_ref: string;
  readonly world_ref: string;
  readonly checkpoint_ref: string;
  readonly focus_ref: string;
  readonly case_ref: string;
  readonly purpose: string;
  readonly direction_ref: string;
  readonly direction_statement: string;
  readonly projection: ProjectionView;
  readonly declared: DeclaredWorld;
}

export interface OperationalNavigation {
  readonly case: DerivedCase;
  readonly candidates: readonly CandidateOperation[];
  readonly possible_operations: readonly PossibleOperation[];
}

function pass(basisRef: string): { readonly verdict: "pass"; readonly basis_ref: string } {
  return { verdict: "pass", basis_ref: basisRef };
}

function readOnlyGates(basisRef: string) {
  return {
    visibility: pass(basisRef),
    reach: pass(basisRef),
    payment: pass(basisRef),
    authority: { verdict: "pass" as const, authority_outcome: "not_applicable" as const, basis_ref: basisRef },
    capability: pass(basisRef),
    recovery: pass(basisRef),
    settlement_access: pass(basisRef),
  };
}

function byRef(left: { readonly object_ref: string }, right: { readonly object_ref: string }): number {
  return left.object_ref < right.object_ref ? -1 : left.object_ref > right.object_ref ? 1 : 0;
}

/**
 * Derive the case and candidate moves supported by one projection read.
 *
 * A focus that is absent at this checkpoint is a material deviation, because the operational fact
 * contradicts the selected focus. That is a fact, not a prediction: the adapter reports it and
 * offers no fabricated repair move.
 */
export function deriveOperationalNavigation(input: OperationalNavigationInput): OperationalNavigation {
  const objects = [...input.projection.objects].sort(byRef);
  const focus = objects.find((object) => object.object_ref === input.focus_ref) ?? null;
  const links = input.projection.links.filter((link) => link.from === input.focus_ref);

  const facts: CaseFact[] = [];
  const checkpoint = input.checkpoint_ref;
  if (focus === null) {
    facts.push({
      fact_ref: `observation:focus-missing:${input.focus_ref}`,
      subject_ref: input.focus_ref,
      source_ref: checkpoint,
      statement: `focus ${input.focus_ref} is not present in the operational projection at ${checkpoint}`,
      deviation: true,
      material: true,
    });
  } else {
    facts.push({
      fact_ref: `observation:focus-present:${focus.object_ref}`,
      subject_ref: focus.object_ref,
      source_ref: checkpoint,
      statement: `focus ${focus.object_ref} is present as ${focus.semantic_ref}`,
      deviation: false,
      material: false,
    });
  }
  for (const link of links) {
    const target = objects.find((object) => object.object_ref === link.to);
    facts.push({
      fact_ref: `observation:link:${link.relation_type}:${link.from}->${link.to}`,
      subject_ref: link.to,
      source_ref: checkpoint,
      statement: target === undefined
        ? `link ${link.relation_type} from ${link.from} names ${link.to}`
        : `link ${link.relation_type} from ${link.from} reaches ${target.label}`,
      deviation: false,
      material: false,
    });
  }

  const derived = deriveCase({
    case_ref: input.case_ref,
    purpose: input.purpose,
    world_ref: input.world_ref,
    focus_ref: input.focus_ref,
    direction: {
      direction_ref: input.direction_ref,
      statement: input.direction_statement,
      target_ref: focus?.object_ref ?? input.focus_ref,
    },
    facts,
  });

  const candidates: CandidateOperation[] = [];
  if (focus !== null) {
    candidates.push(readOnlyCandidate({
      operation_ref: "horizon.inspect.focus",
      label: `Inspect ${focus.label}`,
      responsibility: "inspect",
      basisRefs: [checkpoint, focus.object_ref],
    }));
    if (links.length > 0) {
      candidates.push(readOnlyCandidate({
        operation_ref: "horizon.inspect.neighborhood",
        label: `Inspect ${links.length} linked object(s)`,
        responsibility: "inspect",
        basisRefs: [checkpoint, ...links.map((link) => `${link.relation_type}:${link.from}->${link.to}`)],
      }));
    }
  }

  return Object.freeze({
    case: derived,
    candidates: Object.freeze(candidates),
    possible_operations: Object.freeze(candidates.map((candidate) => ({ operation_ref: candidate.operation_ref, label: candidate.label }))),
  });
}

/**
 * Build the T08 sequential renderer's input from one operational read.
 *
 * The frame id is deterministic for (world, checkpoint, focus), so a script that reads the same
 * projection twice sees the same frame identity. The revision is supplied by the caller; a new
 * observation is a new revision, not a mutation of an old one.
 */
export function buildOperationalFrame(
  input: OperationalNavigationInput,
  frame: { readonly revision?: number; readonly frame_id?: string } = {},
): { readonly frame: NavigationFrame; readonly navigation: OperationalNavigation } {
  const navigation = deriveOperationalNavigation(input);
  const frameId = frame.frame_id ?? `frame:${input.world_ref}:${input.checkpoint_ref}:${input.focus_ref}`;
  return {
    frame: buildNavigationFrame({
      frame_id: frameId,
      revision: frame.revision ?? 1,
      context: {
        observer_ref: input.observer_ref,
        tenant_ref: input.tenant_ref,
        world_ref: input.world_ref,
        checkpoint_ref: input.checkpoint_ref,
        checkpoint_unknown_reason: null,
        focus_ref: input.focus_ref,
        case_ref: input.case_ref,
      },
      case: navigation.case,
      possible_operations: navigation.possible_operations,
      candidates: navigation.candidates,
    }),
    navigation,
  };
}

function readOnlyCandidate(input: {
  readonly operation_ref: string;
  readonly label: string;
  readonly responsibility: "inspect";
  readonly basisRefs: readonly string[];
}): CandidateOperation {
  // Each gate points at the checkpoint the read happened at; the individual object and link refs
  // travel as the evidence this read-only move would let the observer inspect.
  const basis = input.basisRefs[0] ?? "observation:projection";
  return {
    operation_ref: input.operation_ref,
    label: input.label,
    kind: "navigation",
    responsibility: input.responsibility,
    reversibility: "read_only",
    gates: readOnlyGates(basis),
    expected_evidence: [...input.basisRefs],
  };
}

/** A focus that exists and has no material deviation: this is an optional-only case. */
export function isOptionalOnly(navigation: OperationalNavigation): boolean {
  return navigation.case.optional_only;
}

export type { DeclaredWorld, ProjectionView, OperationalLinkV1, OperationalObjectV1 };
