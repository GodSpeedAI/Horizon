# Canonical Journey Catalog (J01–J06)

Source: frozen spec `execution_integration_contract.journeys` and
`core_domain_model.entities`. Journey semantics are also instantiated in
`interaction-model.sea` as `CanonicalJourney` instances so downstream agents can
project without re-reading prose.

Note on count: the frozen spec declares **six** journeys (J01_explore,
J02_operate, J03_build, J04_monitor, J05_compare, J06_develop). Plan T01 prose
says "five J01–J05"; per the ruler hierarchy the spec wins. Recorded as
`OQ-IDM-06`.

---

## J01 — Enter, search, filter and traverse a shared world

- **Actor / role:** `NavigatingObserver` (Observer or agent acting for a human).
- **Initiating condition:** an observer has a question about objects in a shared world.
- **Current → desired state:** no focused result set → a source-backed,
  access-scoped, filterable typed result set with provenance.
- **Preconditions:** a resolved navigation context with a pinned `world_ref`
  and an operational checkpoint.
- **Steps:** search intent + scoped focus + checkpoint → Cognate resolves object
  types and accessible instances → DomainForge confirms semantic type and
  relationship → source-backed matching object set → typed filter/traverse
  intent → operational instance links at checkpoint → scoped Context Kernel
  citations or `unavailable` → updated focus and contextual operations.
- **Capabilities / actions:** `assess_affordance` (reads
  `AffordanceAssessment`); typed object resolution and traversal.
- **Policy / authority:** read-scoped access; no consequential authority.
- **Artifacts / resources:** `FocusSet`, citations, provenance.
- **Outcome:** inspectable, provenance-bearing focus set.
- **Evidence:** resolved object types, matching instances, traversal provenance.
- **Settlement:** the focus set is inspectable; no world change occurred.
- **Failure / recovery:** source changes invalidate affected results explicitly;
  unavailable citations are marked unavailable, never invented.
- **Next affordances:** inspect, filter further, traverse, or propose a
  consequential operation.
- **Known variants:** browsing without a case (case is optional).

## J02 — Preflight, authorize, execute and review a consequential operation

- **Actor / role:** `NavigatingObserver`.
- **Initiating condition:** an observer selects objects and considers a
  consequential move.
- **Desired state:** reviewed scope, payment and expected evidence, then an
  exactly-once authorized effect with separate settlement.
- **Steps:** candidate operation → capability binding discovery → gate payment,
  reach, recovery, settlement access → authority gate (evaluate-only preview or
  policy coverage) → if blocked/unknown, explain blocker and prerequisite → else
  show exact scope, payment and expected evidence → typed idempotent commitment →
  freeze expectation and persist intent → authorize actual invocation → bounded
  Gauntlet execution or single bound action → commit events and observation
  outbox → RealityTrace observations → SEA-Forge operational settlement →
  events, evidence, cost, status → separate developmental interpretation.
- **Capabilities / actions:** `assess_affordance`, `commit_navigation_intent`
  (creates `NavigationIntentRecord`).
- **Policy / authority:** authority gate values only (`likely_allow`,
  `requires_approval`, `deferred_to_invocation`, `denied`, `unreachable`,
  `unknown`); no gate value grants authority. SEA-Forge authorizes invocation.
- **Artifacts / resources:** `NavigationIntentRecord`, execution records,
  observation outbox.
- **Outcome:** authorized effect (or preserved no-side-effect status) plus
  evidence.
- **Evidence:** execution records, RealityTrace observations, settlement refs.
- **Settlement:** operational settlement reference, distinct from evidence and
  from developmental interpretation.
- **Failure / recovery:** blocked/unknown paths expose a blocker and reachable
  prerequisite; denied/awaiting approval preserves status with no side effect.
- **Next affordances:** review evidence, choose the next bounded response, defer.
- **Known variants:** bounded long-horizon (Gauntlet) vs single bound action.

## J03 — Inspect lineage and propose a governed semantic or pipeline revision

- **Actor / role:** `ProposingBuilder`.
- **Initiating condition:** a builder inspects lineage and identifies a change.
- **Steps:** focus lineage resource → scoped lineage projection + Context Kernel
  references → upstream/downstream dependencies → candidate change with
  acceptance criteria → store candidate with parent identity → DomainForge
  validates candidate closure → valid: govern proposal/execution → Gauntlet
  frozen Reference → RealityTrace evidence → verify candidate closure →
  evidence-backed diff → promotion intent → SEA-Forge authorizes transition →
  retarget world alias to new pinned `world_ref`.
- **Capabilities / actions:** `propose_semantic_revision` (creates
  `CandidateRevision`).
- **Policy / authority:** SEA-Forge governs proposal and promotion.
- **Outcome:** immutable candidate identity and, on promotion, alias history.
- **Evidence:** DomainForge diagnostics/identity, Gauntlet records, RealityTrace
  observations.
- **Settlement:** immutable candidate identity; promotion yields alias entry.
- **Failure / recovery:** invalid candidate shows diagnostics with no active
  world change; denial preserves candidate and reason.
- **Next affordances:** request promotion, revise, or abandon.
- **Known variants:** semantic revision vs pipeline revision.

## J04 — Observe changed world state and choose a bounded response

- **Actor / role:** `NavigatingObserver`.
- **Initiating condition:** a source system emits a new event with a unique
  identity.
- **Steps:** event → commit and rebuild projections → queue observation intent →
  RealityTrace recorded receipt (not settlement) → relevant condition with
  checkpoint → scoped references → reassess case and candidate moves →
  informational/non-permissible notice OR consequential response: authority gate
  → approval required: pending record and request authorized decision; automatic:
  idempotent response intent → authorize invocation → bounded Gauntlet work →
  correlate results → settle declared obligations → observed result →
  developmental interpretation and next state.
- **Capabilities / actions:** reassessment plus J02-style authorized response.
- **Policy / authority:** automatic authority where it exists, else authorized
  decision in the home attention view.
- **Evidence:** RealityTrace receipts/observations/residuals; SEA-Forge status.
- **Settlement:** applicable declared obligations settled; a receipt alone is not
  settlement.
- **Failure / recovery:** informational/non-permissible conditions surface a
  blocker rather than an invented action.
- **Next affordances:** act, defer, escalate.

## J05 — Compare hypothetical alternatives without pretending to change the world

- **Actor / role:** `NavigatingObserver`.
- **Initiating condition:** an observer wants to compare alternative paths.
- **Steps:** scope and assumptions → pin `world_ref` and checkpoint → baseline
  evidence references → cited assumptions/limitations → bounded hypothetical
  variants (optional scenario model) → estimates and uncertainty, or
  `unsupported` → clearly marked baseline vs hypothetical → request real
  actionable candidate → scoped capability candidate → authority preview (not
  authorization) → governable choice or blocker.
- **Policy / authority:** authority preview only, never authorization.
- **Outcome:** marked baseline/hypothetical comparison.
- **Settlement:** no world change and no authority granted; simulation NEVER
  settles or changes world state.
- **Failure / recovery:** unsupported scenario model reports `unsupported`
  rather than fabricating an estimate.
- **Next affordances:** request a real actionable candidate (a new real-world
  intent).

## J06 — Review developmental evidence and run a preregistered experiment

- **Actor / role:** `NavigatingObserver` / research authority.
- **Initiating condition:** an observer opens the develop lens for a capability
  or case family.
- **Steps:** focus developmental history → read settled/failed/contradicted
  episodes and research records → capability status with variation, recovery and
  transfer evidence → insufficient: unproven with the missing variation → else
  draft hypothesis and held-out criterion → freeze preregistration and export
  scoped dataset → SEA-Forge authorizes compute and data use → bounded pinned
  pipeline in the research subsystem → metrics, verdict, hashed artifacts →
  correlate against frozen criterion → verdict vs preregistration (failure
  retained) → optional governed estimator activation.
- **Capabilities / actions:** `run_preregistered_experiment` (creates
  `ExperimentRun`).
- **Policy / authority:** SEA-Forge authorizes compute and data use; a separate
  governed activation promotes an estimator.
- **Artifacts / resources:** `Dataset`, `Preregistration`, `ExperimentRun`,
  `Verdict`, `Estimator`.
- **Settlement:** result compared against preregistration; estimator activation
  is a separate governed decision.
- **Failure / recovery:** denial/escalation keeps the preregistration and
  reports blocked/pending with a reason.
- **Next affordances:** request estimator activation, propose another
  experiment, or leave the capability unproven.

---

## Interaction grammar summary

- **Fundamental nouns:** NavigationContext, NavigationFrame, FocusSet,
  AffordanceAssessment, NavigationIntentRecord, SurfaceSpecRecord,
  SettlementReviewRecord; WorldRevision, Checkpoint, CaseRecord, OperationRecord;
  Dataset, Preregistration, ExperimentRun, Verdict, Estimator.
- **Fundamental verbs:** navigate/inspect, assess affordance, commit intent,
  propose revision, authorize, execute bounded work, observe evidence, settle,
  review, run preregistered experiment, compare, promote.
- **Canonical distinctions:** possibility ≠ affordance; observer context ≠ world
  revision; intent ≠ action; operation ≠ evidence; evidence ≠ settlement;
  operational settlement ≠ developmental assessment; surface ≠ authority.
- **Composition:** journeys share `assess_affordance` and the authority gate;
  J04 and J06 reuse J02's commit/execute/settle chain but differ in initiating
  condition and settlement target.
- **Projections:** `SurfaceSpecRecord` and renderers (Clack/GUI) are projections;
  flows and relations are process narrative, not operation contracts.
