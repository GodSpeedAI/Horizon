# T02 Behavioral Proof Report

Status: fixture-backed sequential proof (PROVE) over all six canonical journeys.

- Semantic source: `.sea/interaction/interaction-model.sea` (canonical, `world_ref` `world:horizon@sha256:6c18d6a608bd9d83e6aa354d5a8cc804009ca208562021c1736ee429412309f0`)
- Preregistration: `.agents/prereg/horizon/T02.prereg.yaml`
- Journeys: `behavioral/journeys/J01.yaml` … `J06.yaml`
- Engine: `behavioral/proof/engine.py`; scenarios: `behavioral/proof/scenarios.yaml`; runner: `behavioral/proof/run.py`
- Evidence: `.agents/evidence/horizon/T02/`

## What was proved

27 scenarios across J01–J06 matched preregistered outcomes, including happy, blocked, unknown, conflicted, cancelled, execution-failure and executed-but-unsettled paths. Each run evaluates IS1–IS8 one decision at a time and records the transcript.

- Authority: consequential journeys blocked on `denied`, `requires_approval` and `unknown`; no gate value grants authority.
- Settlement: execution success with failed or missing settlement yields `executed_unsettled` or `blocked`, never `settled`.
- Evidence: missing required evidence yields `unknown/evidence_incomplete`, not an invented result.
- Prompt burden: resolved context is not re-asked; a mandatory-everything policy over-asks all four J01 context fields (deliberate teeth).
- Binding teeth: removing approval and settlement bindings from J02 blocks the happy fixture and never infers permission.

## Evidence classes and limits

- Journeys: declared in the canonical IDM.
- Capability, authority and settlement bindings: inferred from the IDM and sibling contracts; not exercised against live Cognate, SEA-Forge, Gauntlet or RealityTrace.
- `settled` is a fixture outcome only. No live external settlement is claimed at T02.
- Payment units, authority preview, Gauntlet threshold, research-subsystem binding and product-owned semantics remain unresolved (`OQ-IDM-02`…`05`).

## Not proved

- Real Clack/GUI equivalence, real Cognate projections, live SEA-Forge authorization, Gauntlet records and RealityTrace observations belong to later integration tasks.
- Atomic UI composition is deliberately out of scope; see `behavioral/projection-pressure.yaml`.
