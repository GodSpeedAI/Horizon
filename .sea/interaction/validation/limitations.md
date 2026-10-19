# Limitations and Semantic Compromises

## Skill / reference staleness

- The bundled `.agents/skills/domainforge-sea` cheatsheet was checked against
  DomainForge 0.17.0. The pinned 0.21.1 adds the Application Contract (typed
  entity bodies, `record`, `enum`, `operation`, APP001–APP015). T01 authored
  against the 0.21.1 grammar (`domainforge-core/grammar/sea.pest` +
  `docs/reference/sea-application-contract.md`). The cheatsheet's syntax/CLI
  sections are stale for those constructs. Recorded as DEBT.

## Deliberate semantic compromises (valid `.sea`, nearest representation)

1. **Inert policies.** The four policies use `as: true`. Horizon does not own
   authorization; SEA-Forge does. Policies record the enforcement binding point
   only. They are not enforceable invariants. The real invariants are carried as
   `InteractionInvariant` instances and by the operations' clauses.
2. **Bodyless classification entities.** `CanonicalJourney`, `AffordanceGate`,
   `InteractionInvariant`, `OpenSemanticQuestion` are bodyless so instances can
   carry free-form, spec-traceable text. This is the DomainForge-sanctioned
   schemaless-entity pattern.
3. **Product modules are Horizon-side contracts.** They encode the join
   vocabulary; the products do not yet own `.sea` models (OQ-IDM-05). Fields are
   minimal and marked `source_custody`.
4. **Payment, authority-preview and Gauntlet-threshold detail** is modeled as
   string/optional fields and open questions rather than invented structure.

## Recurring vs local

- The stale-skill mismatch is **recurring** across the repository and is
  recorded as debt; it affects any task authoring `.sea`.
- The inert-policy compromise is **local** to T01 and will be revisited when the
  authority gate binds to SEA-Forge.

## Credible future grammar candidates

None proposed. The versioned `.sea` surface (via a spec revision) is the correct
channel, not a grammar change (spec §5.4 / AGENTS.md §9).
