# Horizon Current Status

**Revision:** 5 · **Recorded:** 2026-10-19 · **Stage:** T01 IDM settled

T01 settled: the canonical DomainForge Interaction Domain Model was authored for the six frozen journeys (J01–J06) against the pinned DomainForge 0.21.1 Application Contract, together with research-artifact, product-integration-contract and first-wave product modules. `validate --application` and the coverage gate are green, both adversarial teeth blocked as preregistered, and `world_ref` is composed only from DomainForge's `semantic_closure_hash`. T02 is next.

**Verified:** pinned `domainforge` 0.21.1 (built from `~/projects/domainforge` HEAD `6e941ff`) `validate .sea/interaction/interaction-model.sea --application` exit 0 — 0 violations, application contract valid (4 operations, 8 records, 16 enums, 24 entities); `git diff --check` exit 0; `scripts/check-idm-coverage.py` exit 0 (6 journeys, 7 gates, 4 operations, 6 open questions); `world_ref = world:horizon@sha256:b0f31fcc…4ca1` via `scripts/world-ref.py`; teeth — guessed Relation (undeclared Role) and guessed Flow (undeclared Resource) both fail validation, a changed closure yields a different `world_ref` and `assert-same` exits 1, and the coverage gate names the missing journey when J06 is removed. Evidence retained under `.agents/evidence/horizon/T01/`.

**Limits:** six journeys modelled (spec is the ruler); plan T01 prose says five (OQ-06/OQ-IDM-06). Policies are inert binding points (`as: true`) since Horizon does not own authorization; concrete payment (OQ-IDM-02), authority-preview (OQ-IDM-03) and Gauntlet-threshold (OQ-IDM-04) details remain unknown. Product modules are Horizon-side join contracts (OQ-IDM-05). The bundled `domainforge-sea` skill (0.17) is stale vs pinned 0.21.1 (new D-010); PATH `domainforge` remains 0.19.0 (D-007 partially resolved). No instance queries, Cognate bindings, UI or live integration executed.

**Next:** T02 — project J01–J06 into Behavioral IR and prove the Clack journey (P1B).

**Spec:** HORIZON-001 v1.0.0, frozen; SHA-256 `75cfc1ceb9eec6139f7b8e73f8d1107fcc5e2b680e80683824edd7d8de434130`.

**Evidence:** [prereg](prereg/horizon/T01.prereg.yaml), [evidence](evidence/horizon/T01/), [IDM](../.sea/interaction/README.md), [world-ref](../scripts/world-ref.py), [coverage gate](../scripts/check-idm-coverage.py), [decisions](reports/horizon-decisions.yaml), [open questions](OPEN_QUESTIONS.md), [spec](specs/horizon.agent.spec.yaml), [plan](plans/horizon.plan.yaml).
