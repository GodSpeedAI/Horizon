# Atomic UI IR

## Contents
- Shape
- Vocabulary
- Composition levels
- State model
- Recommended artifacts

## Shape

Serialization may follow repository conventions. `sources.behavioral_phases` uses `IS<n>` prefixes matching Behavioral IR phase keys (`IS3_authority_resolution` → `IS3`).

```yaml
view:
  id: case_decision
  purpose: support a governed decision on one active case
sources:
  journey: CJ04
  behavioral_phases: [IS1, IS3, IS6, IS7, IS8]
context:
  persistence:
    case_identity: persistent
    evidence_summary: persistent_during_decision
regions:
  - { id: case_context, responsibility: orient_actor }
  - { id: evidence, responsibility: inspect_evidence }
  - { id: decision, responsibility: select_current_affordance }
elements:
  - { id: case_identity, primitive: identity, binds: { entity: case } }
  - { id: case_status, primitive: status, binds: { field: status } }
  - { id: evidence_collection, primitive: collection, item_primitive: evidence_item }
  - id: approve
    primitive: action
    semantic_action: approve_case
    consequence: consequential
    availability: { source: behavioral_ir }
states:
  loading: { when: case_not_loaded }
  ready: { when: decision_affordances_available }
  blocked: { when: no_current_affordance }
  error: { when: case_load_failed }
```

## Vocabulary

Candidate primitives: identity, label, value, status, metric, message, evidence_item, artifact_reference, action, choice, input, collection, tree, table, graph, timeline, progress, navigation, notification, inspector, comparison, command, workspace, viewport.

A primitive is an interface responsibility small enough to compose without domain-specific layout assumptions, not necessarily a visual atom.

## Composition levels

- **Element**: smallest meaningful responsibility (identity, status, value, action, evidence item, bounded input).
- **Group**: elements serving one local responsibility (case summary, action group, evidence summary, approval panel, artifact metadata).
- **Region**: persistent or spatially meaningful area for one behavioral responsibility (context, evidence, inspector, navigation, command).
- **View**: bounded interface state composing regions for a purposeful interaction; traceable to Behavioral IR responsibilities, not a route name or mockup.

## State model

Typical states: uninitialized, loading, ready, empty, blocked, partial, error, recovering, settled. Include only states that materially alter behavior or representation. Bind them to Behavioral IR or application state, not local component guesswork.

## Recommended artifacts

Repository conventions first. Otherwise:

```text
ui-model/
├── atomic-ui-contract.yaml   # primitives, composition levels, validation rules
├── views/*.yaml              # renderer-neutral view models
├── traceability.yaml         # UI responsibility → Behavioral IR → journey → IDM
├── projection-decisions.yaml # why richer representations were / were not earned
└── handoff.md                # renderer handoff + behavioral-fidelity acceptance criteria
```
