/**
 * T07 positive evidence (PE-01 … PE-12), one test per `.agents/prereg/horizon/T07.prereg.yaml`
 * `positive_expectations` entry.
 *
 * These are pure-control tests: every gate is an input record. They prove the controller's
 * semantics, not live authorization. The source-adapter test in `navigation-source.test.ts` proves
 * that the same controller accepts a real T06 projection read.
 */
import { describe, expect, test } from "bun:test";
import {
  AFFORDANCE_STATUSES,
  GATE_KEYS,
  NavigationError,
  assertFrameChoice,
  assertGates,
  buildNavigationFrame,
  deriveCase,
  planContextSelection,
  reviseNavigationFrame,
  type AffordanceGates,
  type CandidateOperation,
  type CaseFact,
  type GateAssessment,
  type NavigationContext,
} from "../src/domain/navigation.ts";

const WORLD = "world:horizon@sha256:701d6211e7ef60ebb35d100cd8968561a4982daec7162107e91937e3929af290";

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
    label: "Commit the bounded operation",
    kind: "move",
    responsibility: "commit",
    reversibility: "reversible",
    gates: gates(),
    payment: { entries: [{ currency: "compute" as const, unit: "credits", amount: 2, basis: "predicted" as const, source_ref: "fixture:estimate" }] },
    expected_evidence: ["execution_record", "realitytrace_observation"],
    escalation: { behavior: "approval", approval_ref: "approval:queue-1", note: "requests approval when authority escalates" },
    ...overrides,
  };
}

function inspect(overrides: Partial<CandidateOperation> = {}): CandidateOperation {
  return {
    operation_ref: "horizon.inspect.focus",
    label: "Inspect the focused object",
    kind: "navigation",
    responsibility: "inspect",
    reversibility: "read_only",
    gates: {
      visibility: { verdict: "pass", basis_ref: "observation:visibility" },
      reach: { verdict: "pass", basis_ref: "observation:reach" },
      payment: { verdict: "pass", basis_ref: "observation:payment" },
      authority: { verdict: "pass", authority_outcome: "not_applicable", basis_ref: "observation:authority" },
      capability: { verdict: "pass", basis_ref: "observation:capability" },
      recovery: { verdict: "pass", basis_ref: "observation:recovery" },
      settlement_access: { verdict: "pass", basis_ref: "observation:settlement" },
    },
    ...overrides,
  };
}

function facts(material: boolean): CaseFact[] {
  return [
    {
      fact_ref: "fact:focus-present",
      subject_ref: "obj:strategy:alpha",
      source_ref: "cognate-checkpoint/1@42;horizon.operational-objects@1.0.0",
      statement: "the focused strategy is present",
      deviation: false,
      material: false,
    },
    {
      fact_ref: "fact:deviation",
      subject_ref: "obj:strategy:alpha",
      source_ref: "cognate-checkpoint/1@42;horizon.operational-objects@1.0.0",
      statement: "the strategy is behind its declared direction",
      deviation: material,
      material,
    },
  ];
}

function context(overrides: Partial<NavigationContext> = {}): NavigationContext {
  return {
    observer_ref: "os:operator:1000",
    tenant_ref: "tenant:godspeed",
    world_ref: WORLD,
    checkpoint_ref: "cognate-checkpoint/1@42;horizon.operational-objects@1.0.0",
    checkpoint_unknown_reason: null,
    focus_ref: "obj:strategy:alpha",
    case_ref: "case:alpha",
    ...overrides,
  };
}

function frame(options: {
  readonly material?: boolean;
  readonly candidates?: readonly CandidateOperation[];
  readonly context?: Partial<NavigationContext>;
  readonly judgment?: { readonly authorized: boolean; readonly authority_ref: string; readonly judgment_ref: string };
}) {
  const ctx = context(options.context);
  const derived = deriveCase({
    case_ref: "case:alpha",
    purpose: "keep the strategy inside its declared direction",
    world_ref: WORLD,
    focus_ref: "obj:strategy:alpha",
    direction: { direction_ref: "direction:alpha", statement: "stay inside the declared range", target_ref: "obj:strategy:alpha" },
    facts: facts(options.material ?? true),
  });
  return buildNavigationFrame({
    frame_id: "frame-1",
    revision: 1,
    context: ctx,
    case: derived,
    possible_operations: [{ operation_ref: "horizon.operation.possible-only", label: "Declared but unassessed" }],
    candidates: options.candidates ?? [move()],
    ...(options.judgment === undefined ? {} : { settlement_judgment: options.judgment }),
  });
}

describe("T07 navigation controller — positive evidence (PE-01…PE-12)", () => {
  test("PE-01 possible is not available: blocked, unknown and conflicted stay distinct", () => {
    const f = frame({
      candidates: [
        inspect(),
        move({
          operation_ref: "horizon.operation.denied",
          gates: gates({ authority: { verdict: "fail", authority_outcome: "denied", reason: "policy denies this operation" } }),
        }),
        move({
          operation_ref: "horizon.operation.unknown-capability",
          gates: gates({ capability: { verdict: "unknown", reason: "capability binding not observed" } }),
        }),
        move({
          operation_ref: "horizon.operation.conflicted",
          gates: gates({ visibility: { verdict: "conflicted", reason: "two sources disagree about visibility", basis_ref: "observation:a" } }),
        }),
      ],
    });

    expect(f.possible_operation_refs).toContain("horizon.operation.possible-only");
    expect(f.choices.some((choice) => choice.operation_ref === "horizon.operation.possible-only")).toBe(false);
    const status = (ref: string) => f.choices.find((choice) => choice.operation_ref === ref)?.status;
    expect(status("horizon.inspect.focus")).toBe("available");
    expect(status("horizon.operation.denied")).toBe("blocked");
    expect(status("horizon.operation.unknown-capability")).toBe("unknown");
    expect(status("horizon.operation.conflicted")).toBe("conflicted");
    expect(f.allowed_choice_refs).not.toContain("horizon.operation.denied");
    expect(AFFORDANCE_STATUSES).toContain("possible");
  });

  test("PE-02 exactly the seven canonical gate keys, no extras", () => {
    const choice = frame({}).choices[0];
    expect(choice).toBeDefined();
    expect(Object.keys(choice?.gates ?? {}).sort()).toEqual([...GATE_KEYS].sort());
    expect(() => assertGates({ ...gates(), extra_gate: { verdict: "pass" } })).toThrow(/non-canonical keys/);
    const missing = gates() as unknown as Record<string, unknown>;
    delete missing["recovery"];
    expect(() => assertGates(missing)).toThrow(/missing canonical keys: recovery/);
  });

  test("PE-03 only an available assessment is spendable, and a blocked path keeps its reason and prerequisite", () => {
    const f = frame({
      candidates: [
        move({
          operation_ref: "horizon.operation.blocked",
          gates: gates({ reach: { verdict: "fail", reason: "focus is outside the selected world scope", prerequisite_ref: "prereq:select-focus" } }),
        }),
      ],
    });
    const blocked = f.choices.find((choice) => choice.operation_ref === "horizon.operation.blocked");
    expect(blocked?.spendable).toBe(false);
    expect(blocked?.status).toBe("blocked");
    expect(blocked?.first_blocker).toContain("reach:");
    expect(blocked?.next_prerequisite_ref).toBe("prereq:select-focus");
    expect(f.allowed_choice_refs).not.toContain("horizon.operation.blocked");
    expect(f.primary_choice_ref).toBeNull();
  });

  test("PE-04 optional-only case offers inspect, defer, reframe and disagree with no forced primary", () => {
    const f = frame({ material: false, candidates: [inspect(), move()] });
    expect(f.decision).toBe("owner_choice");
    expect(f.primary_choice_ref).toBeNull();
    const controls = f.choices.filter((choice) => choice.operation_ref.startsWith("horizon.navigation."));
    expect(controls.map((choice) => choice.operation_ref).sort()).toEqual([
      "horizon.navigation.defer",
      "horizon.navigation.disagree",
      "horizon.navigation.inspect",
      "horizon.navigation.reframe",
    ]);
    for (const control of controls) expect(control.status).toBe("available");
    expect(f.choices.every((choice) => choice.is_primary === false)).toBe(true);
  });

  test("PE-05 resolved context is not asked for again", () => {
    const selection = planContextSelection(["observer_ref", "world_ref", "focus_ref", "checkpoint_ref"], {
      observer_ref: "os:operator:1000",
      world_ref: WORLD,
      focus_ref: "obj:strategy:alpha",
    });
    expect(selection.resolved).toEqual(["observer_ref", "world_ref", "focus_ref"]);
    expect(selection.questions).toEqual(["checkpoint_ref"]);
    expect(selection.questions).not.toContain("observer_ref");
  });

  test("PE-06 six authority values: pass without grant, pending, blocked and unknown stay distinct", () => {
    const authorityCandidate = (outcome: "likely_allow" | "deferred_to_invocation" | "requires_approval" | "denied" | "unreachable" | "unknown", operation: string) =>
      move({
        operation_ref: operation,
        gates: gates({
          authority: {
            verdict: outcome === "denied" ? "fail" : outcome === "unknown" || outcome === "unreachable" ? "unknown" : "pass",
            authority_outcome: outcome,
            ...(outcome === "requires_approval" ? { reason: "approval is required", prerequisite_ref: "authority:approval" } : {}),
            ...(outcome === "denied" ? { reason: "policy denies" } : {}),
            ...(outcome === "unreachable" ? { reason: "SEA-Forge is unreachable" } : {}),
            ...(outcome === "unknown" ? { reason: "no SEA-Forge evaluation" } : {}),
          },
        }),
      });
    const f = frame({
      candidates: [
        authorityCandidate("likely_allow", "horizon.operation.likely"),
        authorityCandidate("deferred_to_invocation", "horizon.operation.deferred"),
        authorityCandidate("requires_approval", "horizon.operation.approval"),
        authorityCandidate("denied", "horizon.operation.denied"),
        authorityCandidate("unreachable", "horizon.operation.unreachable"),
        authorityCandidate("unknown", "horizon.operation.unknown"),
      ],
    });
    const status = (ref: string) => f.choices.find((choice) => choice.operation_ref === ref)?.status;
    expect(status("horizon.operation.likely")).toBe("available");
    expect(status("horizon.operation.deferred")).toBe("available");
    expect(status("horizon.operation.approval")).toBe("blocked");
    expect(f.choices.find((entry) => entry.operation_ref === "horizon.operation.approval")?.next_prerequisite_ref).toBe("authority:approval");
    expect(status("horizon.operation.denied")).toBe("blocked");
    expect(status("horizon.operation.unreachable")).toBe("unknown");
    expect(status("horizon.operation.unknown")).toBe("unknown");
    expect(f.authority.grants_authority).toBe(false);
  });

  test("PE-07 consequential choice carries reversibility, payment, expected evidence and escalation", () => {
    const f = frame({ candidates: [move()] });
    const choice = f.choices.find((entry) => entry.operation_ref === "horizon.operation.commit");
    expect(choice?.reversibility).toBe("reversible");
    expect(choice?.payment).toEqual({ entries: [{ currency: "compute" as const, unit: "credits", amount: 2, basis: "predicted" as const, source_ref: "fixture:estimate" }] });
    expect(choice?.expected_evidence).toEqual(["execution_record", "realitytrace_observation"]);
    expect(choice?.escalation?.behavior).toBe("approval");
    expect(choice?.escalation?.approval_ref).toBe("approval:queue-1");
    expect(() => frame({ candidates: [move({ payment: undefined })] })).toThrow(/carries no payment estimate/);
  });

  test("PE-08 case derivation is anchored in facts and direction, with no second ontology", () => {
    const derived = deriveCase({
      case_ref: "case:alpha",
      purpose: "keep the strategy inside its declared direction",
      world_ref: WORLD,
      focus_ref: "obj:strategy:alpha",
      direction: { direction_ref: "direction:alpha", statement: "stay inside the declared range", target_ref: "obj:strategy:alpha" },
      facts: facts(true),
    });
    expect(derived.authoritative_fact_refs).toEqual(["fact:focus-present", "fact:deviation"]);
    expect(derived.material_deviations).toHaveLength(1);
    expect(derived.ontology).toBeNull();
    expect(Object.keys(derived)).not.toContain("entities");
    expect(Object.keys(derived)).not.toContain("classes");
    expect(() =>
      deriveCase({
        case_ref: "case:bad",
        purpose: "x",
        world_ref: WORLD,
        focus_ref: "obj:strategy:alpha",
        direction: { direction_ref: "d", statement: "s", target_ref: "t" },
        facts: facts(false),
        entities: [{ name: "Strategy" }],
      } as never),
    ).toThrow(/undeclared fields: entities/);
  });

  test("PE-09 material deviation yields one primary, optional-only yields none", () => {
    const material = frame({ material: true, candidates: [move({ operation_ref: "horizon.operation.b" }), move({ operation_ref: "horizon.operation.a" })] });
    expect(material.decision).toBe("primary_available");
    expect(material.choices.filter((choice) => choice.is_primary)).toHaveLength(1);
    expect(["horizon.operation.a", "horizon.operation.b"]).toContain(material.primary_choice_ref as string);

    const optional = frame({ material: false, candidates: [move()] });
    expect(optional.decision).toBe("owner_choice");
    expect(optional.primary_choice_ref).toBeNull();
  });

  test("PE-10 settlement reachable and should settle now are separate and the latter needs an authorized judgment", () => {
    const withoutJudgment = frame({ material: true });
    expect(withoutJudgment.settlement_reachable).toBe(true);
    expect(withoutJudgment.should_settle_now).toBe(false);
    expect(withoutJudgment.settlement_reason).toContain("authorized judgment");

    const authorized = frame({
      material: true,
      judgment: { authorized: true, authority_ref: "authority:decision-1", judgment_ref: "judgment:settle-1" },
    });
    expect(authorized.should_settle_now).toBe(true);
    expect(authorized.evidence_refs).toContain("authority:decision-1");

    const rejected = frame({
      material: true,
      judgment: { authorized: false, authority_ref: "authority:decision-2", judgment_ref: "judgment:settle-2" },
    });
    expect(rejected.should_settle_now).toBe(false);
  });

  test("PE-11 frame identifies observer, world, checkpoint unknown, focus, mode and allowed choices", () => {
    const known = frame({});
    expect(known.observer_ref).toBe("os:operator:1000");
    expect(known.tenant_ref).toBe("tenant:godspeed");
    expect(known.world_ref).toBe(WORLD);
    expect(known.checkpoint_ref).not.toBeNull();
    expect(known.focus_ref).toBe("obj:strategy:alpha");
    expect(known.view_mode).toBe("commit");
    expect(known.allowed_choice_refs.length).toBeGreaterThan(0);
    for (const choice of known.choices) {
      expect(choice.operation_ref.length).toBeGreaterThan(0);
      expect(choice.status).toBeDefined();
      expect(choice.basis_refs.length).toBeGreaterThan(0);
    }

    const unknown = frame({ context: { checkpoint_ref: null, checkpoint_unknown_reason: "store has not been read yet" } });
    expect(unknown.checkpoint_ref).toBeNull();
    expect(unknown.checkpoint_unknown_reason).toBe("store has not been read yet");
    expect(unknown.view_mode).toBe("orient");
    expect(unknown.reasons.join(" ")).toContain("checkpoint unknown");
  });

  test("PE-12 frames are immutable, revision advances only through revise, stale and UI enablement grant nothing", () => {
    const f = frame({});
    expect(Object.isFrozen(f)).toBe(true);
    expect(() => {
      (f as { revision: number }).revision = 99;
    }).toThrow();
    expect(() => {
      (f.choices as unknown as unknown[]).push({});
    }).toThrow();

    const next = reviseNavigationFrame(f, {
      context: context({ focus_ref: "obj:strategy:beta", case_ref: null }),
      case: null,
      possible_operations: [],
      candidates: [inspect()],
    });
    expect(next.revision).toBe(2);
    expect(next.previous_frame_id).toBe(f.frame_id);
    expect(() => assertFrameChoice(f, "horizon.operation.commit", 999)).toThrow(NavigationError);

    const blocked = frame({
      candidates: [
        move({
          operation_ref: "horizon.operation.blocked",
          gates: gates({ authority: { verdict: "fail", authority_outcome: "denied", reason: "policy denies" } }),
        }),
      ],
    });
    expect(() => assertFrameChoice(blocked, "horizon.operation.blocked", blocked.revision)).toThrow(/blocked and cannot be selected/);
  });
});
