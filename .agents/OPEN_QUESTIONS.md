# Horizon open questions — formation

Unresolved, materially important points recorded during T00 formation. These do not
change the frozen ruler (spec 1.0.0); they are execution/environment conflicts to resolve
before the affected task. None blocks T00 settlement.

## OQ-01 Cognate `cognate create --source` requirement (affects T04)
- Side A (plan/handoff): "code (commit 61015df) makes `--source` optional; code wins."
- Side B (observed code, origin/main a477933): `packages/cli/src/bin.ts:31-34` exits with
  "cognate create: --source is required"; the skill `references/cli.md` also says required.
- Fact: commit `61015df` ("feat(cli): create without --source") exists in the repo but is
  **not an ancestor of main a477933**.
- Proposed resolution: pin 0.6.1 and pass `--source` at T04; revisit if a release
  containing 61015df is published. Not a ruler contradiction (spec is silent).

## OQ-02 Gauntlet / Context Kernel adapter home (affects T10/T12)
- Open: do the adapters live upstream in Cognate, or as Cognate capabilities in Horizon?
- Recorded decision DEC-T00-04: Horizon implements them as Cognate capabilities and files
  upstream requests. Operator may redirect to upstream Cognate ownership.

## OQ-03 domainforge CLI drift (environmental)
- Required: @godspeedai/domainforge 0.21.1. Observed on PATH: `domainforge 0.19.0`.
- Not a ruler issue; the environment must provide the pinned binding. Operator action
  (install/pin) awaited; T01 validation must use the pinned version.

## OQ-04 RealityTrace `sxr` CLI not on PATH (affects T13/T18)
- `sxr` was not found on PATH during T00. P8 resolver must fail closed, not fabricate.
- Operator action (install or set the configured executable) awaited.

## OQ-05 SEA family liveness (resolved for Horizon, revisitable)
- SEA / NewSea / XSEA / sentient-enterprise-architecture own no live behavior Horizon
  consumes (DEC-T00-03). Revisit only on explicit owner instruction.

## OQ-06 Plan journey count vs frozen spec (T01)
- Plan T01 `changes` reads "five Horizon journeys" and step 2 says "five J01–J05".
- The frozen spec `execution_integration_contract.journeys` declares six:
  J01_explore, J02_operate, J03_build, J04_monitor, J05_compare, J06_develop.
- Ruler hierarchy: the spec wins. T01 models all six. Recorded as `OQ-IDM-06` in the IDM.
- Proposed resolution: reconcile plan prose at the next plan revision; no spec change needed.
