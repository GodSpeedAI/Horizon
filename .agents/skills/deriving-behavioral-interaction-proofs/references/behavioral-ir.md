# Behavioral IR

## Contents
- Shape
- Minimum interaction record
- Recommended artifacts

## Shape

One Behavioral IR per canonical journey, inspectable independently of any renderer. Phase keys are `IS<n>_<name>`; downstream artifacts cite them by prefix (`IS3`). Follow repository conventions when they give a better serialization. Start from [assets/journey.template.yaml](../assets/journey.template.yaml).

```yaml
journey:
  id: CJ04
  title: Form and Commit Governed Work
  semantic_source: .sea/interaction/interaction-model.sea
  semantic_authority: canonical
proof_mode: PROTOTYPE
entry:
  states: [draft]
  actor_roles: [operator]
phases:
  IS1_context_selection:
    requires: [actor, cell, work_source]
  IS2_preflight:
    checks: [semantic_references_resolve, required_parameters_present]
  IS3_authority_resolution:
    required_role: operator
    approval: { status: unresolved_in_source }
  IS4_capability_invocation:
    capability:
      semantic_id: validate_and_commit_case
      binding: { status: unresolved }
  IS5_state_and_artifact_effect:
    expected_state: { from: draft, to: committed }
    artifacts: [immutable_case_plan]
  IS6_evidence_inspection:
    required_evidence: [accepted_plan, criteria, provenance]
  IS7_settlement_or_decision:
    criterion: { source: canonical_completion_condition, machine_evaluable: false }
  IS8_next_affordance_selection:
    source: canonical_next_decisions
    typed_edges: false
```

Unresolved items use an explicit `status: unresolved` / `unresolved_in_source`, never omission.

## Minimum interaction record

For each consequential action, determine or explicitly mark unresolved: stable semantic action ID; human-facing label; purpose; actor and role; current state; intention; preconditions; relevant context; affordance gates; authority requirement; material payment or burden; operation type; capability binding; expected state/artifact effect; evidence obligation; settlement criterion; failure state; recovery path; next affordance; source provenance; evidence class.

## Recommended artifacts

Use project conventions first. Otherwise:

```text
behavioral/
├── contract.yaml            # IS1–IS8 and required fields
├── catalog.yaml             # journey index
├── journeys/CJ01.yaml ...   # each instantiates the contract
├── proof/{src,fixtures,tests}/
├── proof-report.md
└── projection-pressure.yaml
```

The proof consumes the IR; business semantics must not live only in renderer callbacks.

`proof-report.md` contains: proof mode, journeys covered, paths exercised (pass/fail), unresolved bindings, simulated-vs-real statement, and links to fixtures and tests.
