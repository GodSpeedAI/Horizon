# Assumptions, Unknowns and Contradictions

Mirrored as `OpenSemanticQuestion` instances in `interaction-model.sea` so
downstream tooling can inspect them.

| ID | Class | Statement | Blocks |
| -- | ----- | --------- | ------ |
| OQ-IDM-01 | unknown | Canonical CognitiveOS documents (Manifesto v13.1, Mathematical Spec v2.3, Purposeful Case Navigation, Developmental Orientation) were not located locally. | faithful derivation of some purpose, capability, payment and authority detail |
| OQ-IDM-02 | unknown | Concrete payment model (units, estimation source, affordability-gate inputs) unspecified. | binding `gate_payment` to a real capability contract |
| OQ-IDM-03 | unknown | Whether SEA-Forge exposes an evaluate-only preview. | binding `likely_allow`; otherwise `deferred_to_invocation` applies |
| OQ-IDM-04 | unknown | Threshold separating a direct bound action from bounded Gauntlet execution. | selecting `ExecutionPath` per operation |
| OQ-IDM-05 | proposed | Strategist and the research subsystem do not yet own `.sea` models; product modules are Horizon-side join contracts. | claiming product-owned semantics |
| OQ-IDM-06 | unknown | Plan T01 prose says five journeys; the frozen spec declares six. | nothing in this model; flagged for plan/spec reconciliation |

## Contradictions

- **Journey count (OQ-IDM-06).** Plan prose `five J01–J05` contradicts the frozen
  spec `six` journeys. Decision: model six; the spec is the ruler. Evidence that
  would overturn: a spec revision removing J06.
- **DomainForge references vs installed tooling.** The bundled
  `domainforge-sea` cheatsheet predates the 0.21 Application Contract
  (typed entities, `record`, `enum`, `operation`). Decision: author against the
  0.21.1 grammar; treat the cheatsheet's CLI/syntax sections as stale where they
  conflict. Evidence that would overturn: a pinned DomainForge release matching
  the cheatsheet.

## Modeling decisions without full evidence

- **Policies are inert binding points** (`as: true`). Horizon does not own
  authorization; SEA-Forge does. The policies record the precondition at which
  the authority gate is enforced. This is a deliberate semantic compromise, not
  an enforceable invariant, and is recorded in `validation/limitations.md`.
- **Product modules are Horizon-side contracts.** They encode the join
  vocabulary, not the products' own semantics.
