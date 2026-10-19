# Handoff

The IDM is the canonical semantic source. Downstream work projects it; it never
re-derives domain meaning from routes, screens, or Cognate code.

## How to use it

1. **Load the model** with `@godspeedai/domainforge` (`loadSemanticWorld` /
  `parseSourceMap` per the current Cognate API) into a read-only semantic
  projection. Objects are read-only; nothing becomes a capability implicitly.
2. **Bind capabilities explicitly.** Use the four canonical operations as the
  binding points and record every binding here:
   - `assess_affordance` → Horizon navigation controller (gate assessment).
   - `commit_navigation_intent` → Cognate runtime + SEA-Forge authorization.
   - `propose_semantic_revision` → Cognate + DomainForge validation +
     SEA-Forge-governed promotion.
   - `run_preregistered_experiment` → research subsystem capability, SEA-Forge
     authorized compute/data use.
3. **Map IDM concepts to constructs** using Cognate's `idm-to-cognate.md`:
   roles → principals/authorization; journeys → agent runs; intents →
   idempotent state transitions; artifacts → Cognate artifacts/continuations;
   outcomes/evidence/settlement → events, projections, RealityTrace records.
4. **Project surfaces** (`SurfaceSpecRecord`, `SurfaceIntent`) through Clack and
   GUI renderers. Surfaces are closed declarative presentation, never authority.

## Projection readiness (typed vs descriptive)

Typed in the model: roles; the seven core entities and their required fields;
closed enums (status, gates, authority, reversibility, world state); the four
operations with input/output/state/effect/failure/idempotency/concurrency/
evidence/lifecycle; world/checkpoint/case identity; artifact entities.

Descriptive (carried in journey instances and this catalog, not yet executable):
concrete payment units and estimates; the exact SEA-Forge preview behaviour;
the direct-vs-Gauntlet threshold; per-operation capability provider identities;
renderer block vocabularies.

Downstream (`deriving-behavioral-interaction-proofs`) should turn each journey
into a Behavioral IR and sequential proof without re-inventing missing
capability, payment or authority bindings; unresolved bindings come from the
`OpenSemanticQuestion` instances above.

## Constraints to preserve

- `world_ref` is composed from DomainForge `semantic_closure_hash`; never
  re-derive identity outside DomainForge (REQ-STACK-001).
- Historical/current/candidate worlds stay distinct; promotion is explicit.
- No gate value grants authority; absence of a passed gate is not availability.
