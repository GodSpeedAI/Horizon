# Source Translation Map

Every material source statement from the frozen spec is represented,
canonicalized, treated as a projection, contradicted, or explicitly left
unresolved. Evidence classes: declared, observed, inferred, proposed, unknown.

| Source | Source statement | Extracted concepts | Canonical journey | Status | Evidence class | Notes |
| ------ | ---------------- | ------------------ | ----------------- | ------ | -------------- | ----- |
| spec §core_domain_model | NavigationContext is the observer-relative operating present | `NavigationContext`, `WorldRevision`, `Checkpoint` | J01–J06 | represented | declared | `world_ref` is a `ref<WorldRevision>` |
| spec §core_domain_model | NavigationFrame is a reproducible question for one observer at one revision | `NavigationFrame`, `NavigationResponsibility` | J01–J06 | represented | declared | revision is the stale-intent token |
| spec §core_domain_model | FocusSet carries typed selections and traversal | `FocusSet` | J01 | represented | declared | provenance/access-scoping noted in J01 |
| spec §core_domain_model | AffordanceAssessment distinguishes possibility from executable path | `AffordanceAssessment`, `AffordanceStatus`, `GateKey`, `AuthorityOutcome`, `ReversibilityClass` | J01,J02 | represented | declared | seven canonical gate keys exactly |
| spec §core_domain_model | NavigationIntent is durable renderer-independent choice | `NavigationIntentRecord`, `commit_navigation_intent` | J02,J04 | represented | declared | idempotency keyed by `intent_id` |
| spec §core_domain_model | SurfaceSpec is closed declarative presentation | `SurfaceSpecRecord`, `SurfaceIntent` | J01–J06 | represented | declared | inv_surface_not_authority |
| spec §core_domain_model | SettlementReview separates operation, evidence, settlement, development | `SettlementReviewRecord`, `EpistemicStatus`, `ReviewDisposition` | J02,J06 | represented | declared | inv_settlement_not_evidence |
| REQ-NAV-001 | distinguish possible/available/blocked/unknown/conflicted | `AffordanceStatus` | J01,J02 | represented | declared | `possible` included |
| REQ-NAV-002 | exactly seven canonical gate keys | `GateKey`, seven `AffordanceGate` instances | J02 | represented | declared | enforced by coverage gate |
| REQ-NAV-006 | authority vocabulary, never a grant | `AuthorityOutcome` | J02,J04,J05 | represented | declared | six members |
| REQ-WORLD-004 | historical/current/candidate immutable refs | `WorldStateKind`, `WorldRevision` | J03 | represented | declared | inv_world_identity_immutable |
| REQ-STACK-001 | DomainForge owns semantic compilation and world_ref | world_ref via `semantic_closure_hash` | all | represented | declared | `scripts/world-ref.py` |
| spec §journeys J01–J06 | six canonical journeys | six `CanonicalJourney` instances + four operations | J01–J06 | represented | declared | plan prose says five; spec wins (OQ-IDM-06) |
| spec §REQ-DEV / research migration | developmental interpretation, preregistered experiments | `Dataset`, `Preregistration`, `ExperimentRun`, `Verdict`, `Estimator` | J06 | represented | declared | product/artifact contracts are Horizon-side |
| register first-wave products | research subsystem and Strategist join | `ProductIntegrationContract`, `ResearchSubsystemProduct`, `StrategistProduct` | J06/T21 | represented | proposed | product-owned semantics unresolved (OQ-IDM-05) |
| CognitiveOS references | Manifesto v13.1, Mathematical Spec v2.3, Purposeful Case Navigation, Developmental Orientation | — | — | unresolved | unknown | documents not found locally (OQ-IDM-01) |
| spec §payment gate | material payment changes reachability | `gate_payment`, `payment_estimate` | J02 | partially represented | declared | concrete payment model unresolved (OQ-IDM-02) |
| spec §authority preview | evaluate-only preview if exposed | `gate_authority`, `AuthorityOutcome` | J02 | partially represented | unknown | preview availability unknown (OQ-IDM-03) |
| spec §Gauntlet bounded work | threshold between direct action and Gauntlet | `ExecutionPath` | J02,J04 | partially represented | unknown | threshold unspecified (OQ-IDM-04) |
| spec §SurfaceSpec rules | no raw executable UI; provenance-marked inline data | inv_surface_not_authority | J01–J06 | represented as invariant | declared | enforcement deferred to T08/T09 |

No material source statement is silently dropped. Items marked
`partially represented` or `unresolved` appear as `OpenSemanticQuestion`
instances in `interaction-model.sea`.
