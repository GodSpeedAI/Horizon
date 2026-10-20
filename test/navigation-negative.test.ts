/**
 * T07 negative evidence (NE-01 … NE-11), one test per `.agents/prereg/horizon/T07.prereg.yaml`
 * `negative_expectations` entry.
 *
 * Each test attacks one claim: ranking cannot rescue an unauthorized move, a case cannot force a
 * primary, a blocked gate cannot lose its reason, and a UI payload cannot grant authority.
 */
import { describe, expect, test } from "bun:test";
import {
  NavigationError,
  assertFrameChoice,
  assertGates,
  buildNavigationFrame,
  deriveCase,
  reviseNavigationFrame,
  type AffordanceGates,
  type CandidateOperation,
  type CaseFact,
  type GateAssessment,
} from "../src/domain/navigation.ts";

const WORLD = "world:horizon@sha256:6c18d6a608bd9d83e6aa354d5a8cc804009ca208562021c1736ee429412309f0";
const CHECKPOINT = "cognate-checkpoint/1@42;horizon.operational-objects@1.0.0";

function gates(overrides: Partial<Record<keyof AffordanceGates, GateAssessment>> = {}): AffordanceGates {
  const base: Record<keyof AffordanceGates, GateAssessment> = {
    visibility: { verdict: "pass", basis_ref: "observation:visibility" },
    reach: { verdict: "pass", basis_ref: "observation:reach" },
    payment: { verdict: "pass", basis_ref: "observation:payment" },
    authority: { verdict: "pass", authority_outcome: "likely_allow", basis_ref: "authority:evaluation-1" },
    capability: { verdict: "pass", basis_ref: "observation:capability" },
    recovery: { verdict: "pass", basis_ref: "observation:recovery" },
    settlement_access: { verdict: "pass", basis_ref: "observation:settlement" },
  };
  return { ...base, ...overrides };
}

function move(overrides: Partial<CandidateOperation> = {}): CandidateOperation {
  return {
    operation_ref: "horizon.operation.commit",
    label: "Commit",
    kind: "move",
    responsibility: "commit",
    reversibility: "reversible",
    gates: gates(),
    payment: { estimate: "1 credit", provenance: "fixture:estimate" },
    expected_evidence: ["execution_record"],
    escalation: { behavior: "approval", approval_ref: "approval:queue-1" },
    ...overrides,
  };
}

function facts(material: boolean): CaseFact[] {
  return [
    {
      fact_ref: "fact:focus",
      subject_ref: "obj:strategy:alpha",
      source_ref: CHECKPOINT,
      statement: "the focus is present",
      deviation: false,
      material: false,
    },
    {
      fact_ref: "fact:deviation",
      subject_ref: "obj:strategy:alpha",
      source_ref: CHECKPOINT,
      statement: "the focus is behind its declared direction",
      deviation: material,
      material,
    },
  ];
}

function frame(options: { readonly material: boolean; readonly candidates: readonly CandidateOperation[] }) {
  const derived = deriveCase({
    case_ref: "case:alpha",
    purpose: "keep the strategy inside its declared direction",
    world_ref: WORLD,
    focus_ref: "obj:strategy:alpha",
    direction: { direction_ref: "direction:alpha", statement: "stay inside the declared range", target_ref: "obj:strategy:alpha" },
    facts: facts(options.material),
  });
  return buildNavigationFrame({
    frame_id: "frame-1",
    revision: 1,
    context: {
      observer_ref: "os:operator:1000",
      tenant_ref: "tenant:godspeed",
      world_ref: WORLD,
      checkpoint_ref: CHECKPOINT,
      checkpoint_unknown_reason: null,
      focus_ref: "obj:strategy:alpha",
      case_ref: "case:alpha",
    },
    case: derived,
    possible_operations: [],
    candidates: options.candidates,
  });
}

describe("T07 navigation controller — negative evidence (NE-01…NE-11)", () => {
  test("NE-01 unauthorized high-value candidate ranked first is still eliminated from spendable options", () => {
    const unauthorized = {
      ...move({
        operation_ref: "horizon.operation.high-value",
        payment: { estimate: "1000000 credits", provenance: "fixture:estimate" },
        gates: gates({ authority: { verdict: "fail", authority_outcome: "denied", reason: "policy denies high-value operations" } }),
      }),
      rank: 0,
    } as CandidateOperation;
    const authorized = move({ operation_ref: "horizon.operation.authorized", payment: { estimate: "1 credit", provenance: "fixture:estimate" } });
    const f = frame({ material: true, candidates: [unauthorized, authorized] });
    expect(f.choices.find((choice) => choice.operation_ref === "horizon.operation.high-value")?.spendable).toBe(false);
    expect(f.allowed_choice_refs).not.toContain("horizon.operation.high-value");
    expect(f.primary_choice_ref).toBe("horizon.operation.authorized");
  });

  test("NE-02 an optional-only case cannot be forced to produce a primary move", () => {
    const f = frame({ material: false, candidates: [move()] });
    expect(f.decision).toBe("owner_choice");
    expect(f.primary_choice_ref).toBeNull();
    expect(f.choices.some((choice) => choice.is_primary)).toBe(false);
    expect(f.should_settle_now).toBe(false);
  });

  test("NE-03 a blocked gate without a material reason is refused", () => {
    expect(() => assertGates({ ...gates(), reach: { verdict: "fail" } })).toThrow(/without a material reason/);
    expect(() => assertGates({ ...gates(), visibility: { verdict: "unknown" } })).toThrow(/without a material reason/);
    expect(() => assertGates({ ...gates(), capability: { verdict: "conflicted" } })).toThrow(/without a material reason/);
  });

  test("NE-04 unknown authority is unknown, not available", () => {
    const f = frame({
      material: true,
      candidates: [
        move({
          operation_ref: "horizon.operation.unknown-authority",
          gates: gates({ authority: { verdict: "unknown", authority_outcome: "unknown", reason: "no SEA-Forge evaluation" } }),
        }),
      ],
    });
    const choice = f.choices.find((entry) => entry.operation_ref === "horizon.operation.unknown-authority");
    expect(choice?.status).toBe("unknown");
    expect(choice?.spendable).toBe(false);
    expect(f.allowed_choice_refs).not.toContain("horizon.operation.unknown-authority");
    expect(f.decision).toBe("no_affordance");
  });

  test("NE-05 requires_approval is pending and deferred_to_invocation is a known pass without grant", () => {
    const pending = frame({
      material: true,
      candidates: [
        move({
          operation_ref: "horizon.operation.approval",
          gates: gates({ authority: { verdict: "pass", authority_outcome: "requires_approval", reason: "approval required", prerequisite_ref: "authority:approval" } }),
        }),
      ],
    });
    const pendingChoice = pending.choices.find((choice) => choice.operation_ref === "horizon.operation.approval");
    expect(pendingChoice?.status).toBe("blocked");
    expect(pendingChoice?.status).not.toBe("unknown");
    expect(pendingChoice?.next_prerequisite_ref).toBe("authority:approval");

    const deferred = frame({
      material: true,
      candidates: [
        move({
          operation_ref: "horizon.operation.deferred",
          gates: gates({ authority: { verdict: "pass", authority_outcome: "deferred_to_invocation", reason: "policy-covered; no preview" } }),
        }),
      ],
    });
    expect(deferred.choices.find((choice) => choice.operation_ref === "horizon.operation.deferred")?.status).toBe("available");
    expect(deferred.choices.find((choice) => choice.operation_ref === "horizon.operation.deferred")?.status).not.toBe("unknown");
    expect(deferred.authority.grants_authority).toBe(false);
  });

  test("NE-06 a gate map with an extra or missing canonical key is refused", () => {
    expect(() => assertGates({ ...gates(), approval_override: { verdict: "pass" } })).toThrow(/non-canonical keys/);
    const missing = { ...gates() } as Record<string, unknown>;
    delete missing["settlement_access"];
    expect(() => assertGates(missing)).toThrow(/missing canonical keys: settlement_access/);
  });

  test("NE-07 case derivation without a world anchor or declared direction is refused", () => {
    expect(() =>
      deriveCase({
        case_ref: "case:bad",
        purpose: "x",
        focus_ref: "obj:strategy:alpha",
        direction: { direction_ref: "d", statement: "s", target_ref: "t" },
        facts: facts(false),
      } as never),
    ).toThrow(/world_ref/);
    expect(() =>
      deriveCase({
        case_ref: "case:bad",
        purpose: "x",
        world_ref: WORLD,
        focus_ref: "obj:strategy:alpha",
        facts: facts(false),
      } as never),
    ).toThrow(/direction/);
  });

  test("NE-08 should settle now stays false without an authorized judgment", () => {
    const missing = frame({ material: true, candidates: [move()] });
    expect(missing.settlement_reachable).toBe(true);
    expect(missing.should_settle_now).toBe(false);

    const derived = deriveCase({
      case_ref: "case:alpha",
      purpose: "keep the strategy inside its declared direction",
      world_ref: WORLD,
      focus_ref: "obj:strategy:alpha",
      direction: { direction_ref: "d", statement: "s", target_ref: "t" },
      facts: facts(true),
    });
    const unauthorized = buildNavigationFrame({
      frame_id: "frame-1",
      revision: 1,
      context: {
        observer_ref: "os:operator:1000",
        tenant_ref: "tenant:godspeed",
        world_ref: WORLD,
        checkpoint_ref: CHECKPOINT,
        checkpoint_unknown_reason: null,
        focus_ref: "obj:strategy:alpha",
        case_ref: "case:alpha",
      },
      case: derived,
      possible_operations: [],
      candidates: [move()],
      settlement_judgment: { authorized: false, authority_ref: "authority:decision-2", judgment_ref: "judgment:settle-2" },
    });
    expect(unauthorized.should_settle_now).toBe(false);
    expect(unauthorized.reasons.join(" ")).toContain("not authorized");
  });

  test("NE-09 UI enablement of a blocked choice is ignored and grants no authority", () => {
    const f = frame({
      material: true,
      candidates: [move({ gates: gates({ authority: { verdict: "fail", authority_outcome: "denied", reason: "policy denies" } }) })],
    });
    const payload = { operation_ref: "horizon.operation.commit", enabled: true, status: "available", revision: f.revision };
    // The payload is not consulted: the frame's assessment is.
    expect(() => assertFrameChoice(f, payload.operation_ref, payload.revision)).toThrow(/blocked and cannot be selected/);
    const choice = f.choices.find((entry) => entry.operation_ref === "horizon.operation.commit");
    expect(choice?.status).toBe("blocked");
    expect(choice?.spendable).toBe(false);
    expect(f.authority.grants_authority).toBe(false);
  });

  test("NE-10 a frozen frame cannot be mutated in place", () => {
    const f = frame({ material: true, candidates: [move()] });
    expect(Object.isFrozen(f)).toBe(true);
    expect(Object.isFrozen(f.choices)).toBe(true);
    expect(() => {
      (f as { decision: string }).decision = "owner_choice";
    }).toThrow();
    expect(() => {
      (f.choices[0] as { status: string }).status = "available";
    }).toThrow();
    const next = reviseNavigationFrame(f, { context: f, case: null, possible_operations: [], candidates: [] } as never);
    expect(next.revision).toBe(2);
  });

  test("NE-11 a stale frame revision is refused", () => {
    const f = frame({ material: true, candidates: [move()] });
    try {
      assertFrameChoice(f, "horizon.operation.commit", f.revision - 1);
      throw new Error("stale revision was accepted");
    } catch (error) {
      expect(error).toBeInstanceOf(NavigationError);
      expect((error as NavigationError).code).toBe("stale_frame");
    }
    const next = reviseNavigationFrame(f, {
      context: {
        observer_ref: f.observer_ref,
        tenant_ref: f.tenant_ref,
        world_ref: f.world_ref,
        checkpoint_ref: f.checkpoint_ref,
        checkpoint_unknown_reason: f.checkpoint_unknown_reason,
        focus_ref: f.focus_ref,
        case_ref: f.case_ref,
      },
      case: null,
      possible_operations: [],
      candidates: [],
    });
    expect(() => assertFrameChoice(next, "horizon.inspect.focus", f.revision)).toThrow(/stale/);
  });
});
