# Horizon Interaction Domain Model

Canonical semantic source for Horizon's observer-relative navigation world.
Derived in T01 (topology P1) from the frozen spec
`.agents/specs/horizon.agent.spec.yaml` (1.0.0, sha256
`75cfc1ce…434130`) and the plan `.agents/plans/horizon.plan.yaml`.

## Files

| Path | Namespace | Role |
| ---- | --------- | ---- |
| `interaction-model.sea` | `horizon.interaction` | Canonical IDM: core entities, journeys, gates, invariants, operations, unknowns. Entry file. |
| `research-artifacts.sea` | `horizon.research.artifacts` | J06 research artifacts and the `run_preregistered_experiment` operation. |
| `product-integration-contract.sea` | `horizon.contracts` | Product join vocabulary (disposition, target level). |
| `products/godspeed-research.sea` | `horizon.products.godspeed_research` | First-wave research-subsystem join contract. |
| `products/strategist.sea` | `horizon.products.strategist` | First-wave Strategist join contract. |

`interaction-model.sea` imports the other modules via relative path imports, so
a single-file validate resolves the whole closure.

## Commands (pinned DomainForge 0.21.1)

```sh
export DOMAINFORGE_BIN=/home/sprime01/projects/domainforge/target/release/domainforge
$DOMAINFORGE_BIN validate .sea/interaction/interaction-model.sea --application --format human
python3 scripts/check-idm-coverage.py
python3 scripts/world-ref.py .sea/interaction/interaction-model.sea
```

`world_ref` is composed from DomainForge's `semantic_closure_hash`, so
DomainForge alone owns world identity (REQ-STACK-001). See
`validation/`, `canonical-journey-catalog.md`, `source-translation-map.md`,
`assumptions-and-unknowns.md` and `handoff.md`.

## Canonicality

The Interaction Domain Model is sufficiently stable to serve as the canonical
semantic source for downstream projections. Open semantic questions are
preserved as `OpenSemanticQuestion` instances and in
`assumptions-and-unknowns.md`; they constrain binding, not the journey
structure.
