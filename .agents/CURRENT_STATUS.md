# Horizon Current Status

**Revision:** 6 · **Recorded:** 2026-10-19 · **Stage:** T02 Behavioral proof settled

T02 settled: six renderer-neutral Behavioral IRs (J01–J06) were authored against the canonical IDM and executed by a fixture-backed IS1–IS8 proof engine. 27 scenarios matched preregistered outcomes across happy, blocked, unknown, conflicted, cancelled, execution-failure and executed-but-unsettled paths. Both teeth behaved as preregistered, no gate value grants authority, and projection pressure is recorded for the subsequent UI-model task. T03 is next.

**Verified:** `validate_behavioral_ir.py behavioral/journeys/*.yaml` exit 0 (all six `ok`); `behavioral/proof/run.py` exit 0 (27/27 matched); `teeth_authority.py` exit 0 — removing J02's approval/settlement bindings blocks the happy fixture as `unauthorized_or_unresolved` with `inferred_authority: false`; `teeth_prompt_burden.py` exit 0 — resolved context is not re-asked, while mandatory-everything over-asks all four J01 fields; T02 YAML parses; `git diff --check` exit 0. Evidence retained under `.agents/evidence/horizon/T02/`.

**Limits:** fixture-backed only — `settled` is a simulation outcome, not live settlement. Capability, authority and settlement bindings are inferred from the IDM; no live Cognate, SEA-Forge, Gauntlet or RealityTrace call was made. Payment units, authority preview, Gauntlet threshold and the research-subsystem binding remain unresolved (OQ-IDM-02…05). No UI or renderer decision is asserted.

**Next:** T03 — derive atomic UI models from the proven journeys and recorded projection pressure.

**Spec:** HORIZON-001 v1.0.0, frozen; SHA-256 `75cfc1ceb9eec6139f7b8e73f8d1107fcc5e2b680e80683824edd7d8de434130`.

**Evidence:** [prereg](prereg/horizon/T02.prereg.yaml), [evidence](evidence/horizon/T02/), [journeys](../behavioral/journeys/), [proof engine](../behavioral/proof/engine.py), [scenario matrix](../behavioral/proof/scenarios.yaml), [proof report](../behavioral/PROOF-REPORT.md), [projection pressure](../behavioral/projection-pressure.yaml), [decisions](reports/horizon-decisions.yaml), [open questions](OPEN_QUESTIONS.md), [spec](specs/horizon.agent.spec.yaml), [plan](plans/horizon.plan.yaml).
