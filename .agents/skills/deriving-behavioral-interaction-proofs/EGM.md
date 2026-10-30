# deriving-behavioral-interaction-proofs

## Overview

The bundled skill that turns canonical interaction semantics into one
renderer-neutral Behavioral IR per journey plus an executable sequential
behavioral proof, exposing missing authority, capability, settlement, and
recovery bindings rather than inventing them. The directory holds the procedural
`SKILL.md` (workflow, the shared `IS1`–`IS8` contract, the affordance rule, proof
modes, completion gate, handoff), reference material, a journey template asset,
and one deterministic validator. There are no direct source files at this level.

## Subdirectories & Boundaries

- `scripts`: [Contract](./scripts/EGM.md) - `validate_behavioral_ir.py`, which enforces journey identity fields, the `IS1`–`IS8` phase set, the declared `proof_mode`, and renderer-neutral interaction kinds.
- `references`: Unlinked reference material (no contract file): `behavioral-ir.md`, `interaction-vocabulary.md`, `proof-and-testing.md`.
- `assets`: Unlinked template asset (no contract file): `assets/journey.template.yaml`, the starting point for a journey IR.

## Declared Contracts

- Proof modes are declared as exactly one of `IR_ONLY`, `PROTOTYPE`, or `PROVE`, defaulting to `PROTOTYPE` when the user does not choose [SKILL.md:proof modes]
- The affordance rule requires `visible, reachable, authorized, payable, executable, recoverable, settleable` before a named action counts as a current affordance, with candidates classified `available | blocked | unknown | conflicted` [SKILL.md:affordance rule]
- Evidence classes are preserved as `declared`, `observed`, `inferred`, `proposed`, `unknown` [SKILL.md:evidence discipline]
- The validator is invoked as `python scripts/validate_behavioral_ir.py <journey.yaml>...` inside the workflow [SKILL.md:workflow]

## Verification

- Run: `just verify`
