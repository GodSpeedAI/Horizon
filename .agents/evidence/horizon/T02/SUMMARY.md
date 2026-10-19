# T02 Evidence — Behavioral IRs and sequential proof

- Claim: six canonical journeys have renderer-neutral Behavioral IRs whose IS1–IS8 decisions are executable against fixtures, and whose blocking, unknown, conflict, cancellation, execution and settlement outcomes match preregistered expectations.
- Preregistration: `.agents/prereg/horizon/T02.prereg.yaml` (authored before artifacts).
- `world_ref`: `world:horizon@sha256:b0f31fcc60f49af730ca0b863af8e0eae990924fd0beb1d004f10c602cd24ca1`
- Mode: `PROVE`, fixture-backed. `settled` is a fixture outcome, never live external settlement.

## Gate runs

| Command | Result |
|---|---|
| `python3 .agents/skills/deriving-behavioral-interaction-proofs/scripts/validate_behavioral_ir.py behavioral/journeys/*.yaml` | exit 0; all six `ok` |
| `python3 behavioral/proof/run.py` | exit 0; 27/27 scenarios matched |
| `python3 behavioral/proof/teeth_authority.py` | exit 0; degraded J02 blocked, no inferred authority |
| `python3 behavioral/proof/teeth_prompt_burden.py` | exit 0; no redundant questions; mandatory-everything over-asks |
| YAML parse (contract, catalog, projection pressure, scenarios) | exit 0 |
| `git diff --check` | exit 0 |

Logs: `behavioral-ir-validation.log`, `scenario-matrix.log`, `teeth-authority-binding.log`, `teeth-prompt-burden.log`, `git-diff-check.log`, `yaml-parse.log`.
Per-scenario transcripts: `behavioral/proof/transcripts/`.

## Positive observations

- All eight phases are present and non-empty in every journey.
- Consequential journeys (J02, J03, J04, J06) carry approval, capability and settlement bindings; J01 and J05 are read-only and cannot grant authority.
- Outcomes distinguish `available`, `settled`, `blocked`, `unknown`, `conflicted`, `cancelled`, `execution_failed`, `executed_unsettled`.
- Unknown and contradictory information stay visible; missing evidence yields `unknown/evidence_incomplete`.

## Teeth

1. Removing the approval and settlement bindings from J02 blocks the happy fixture (`unauthorized_or_unresolved`) and records `inferred_authority: false`.
2. Asking every context field regardless of resolved context over-asks all four J01 fields; the contextual run asks none.

## Limits

- Bindings to Cognate, SEA-Forge, Gauntlet and RealityTrace are inferred from the IDM; no live call was made.
- Payment units, authority preview, Gauntlet threshold, research-subsystem binding and product-owned semantics remain unresolved (`OQ-IDM-02`…`05`).
- No UI or renderer decision is asserted; projection pressure is recorded separately in `behavioral/projection-pressure.yaml`.

## Artifact hashes (SHA-256)

```
e34b54b4cce15d4b1d92fb7d5936aa29c2479bbeb640224aa1a8121951113acc  behavioral/journeys/J01.yaml
9296ea42f72327efeedb536441aa797df529e88607c8df66ababea247389e459  behavioral/journeys/J02.yaml
ad94f7fffbb08f6f3abe10cb55a7b80da50420eacba343c33abf7e0dec48cc06  behavioral/journeys/J03.yaml
f6b253572cf4998f18644a36a7c2580529df434ac80f4bd22f3cdfd7a1cab158  behavioral/journeys/J04.yaml
d591d0114b81ad8cad31b075723f8e78a136d16e548f9584901614475fb13113  behavioral/journeys/J05.yaml
e517a78ebde19d1f2746f3c32a5c3cfe2013ea713192d61ff20e543ae8c11f37  behavioral/journeys/J06.yaml
6fcbb30c01e43af4927eed96e21f74b9487845636256d6d660d8d31d8f61d86e  behavioral/contract.yaml
de04138a155619ac0d8b46bf86d49369cbbe21afa53ba84f5fb07c7e2b931109  behavioral/catalog.yaml
8867e70d15f386e05a59535da97e3c3dad522fae18a0c52c81c5cca8dea7e54a  behavioral/projection-pressure.yaml
f4ebbacdb37917dc11a74cfcb4774bf8d422ed73ee504722bfff4fc480c9f871  behavioral/proof/engine.py
87ca51386b456b30f246f7d3f1ea912823a5208dd8bc55758007341772ab007c  behavioral/proof/run.py
efab20b960fb54fdc45945da27547a002dc3f09d6c717506426b4502b2965cd2  behavioral/proof/teeth_authority.py
b602563745fcaa60c7f9555d44b2c55bc127996b2cccefea82f511474f33192c  behavioral/proof/teeth_prompt_burden.py
4dfe7a778b145de14d19ea4a32f5a4b739e3f655535e6d49b1a2d57322985836  behavioral/proof/scenarios.yaml
4e01b68fa6c5455458da6f7a5fd4d846718e7d346f493ae5db178cce4fdb3b44  behavioral/PROOF-REPORT.md
```
