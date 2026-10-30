# deriving-atomic-ui-models

## Overview

The bundled skill that derives renderer-neutral Atomic UI IRs (views, regions,
groups, elements, persistent context, states, traceability) from Behavioral IRs,
sequential-proof evidence, projection pressure, and explicit interface
constraints, without naming framework components. The directory holds the
procedural `SKILL.md` (layer model R1–R5, derivation workflow, renderer
neutrality, affordance projection, completion gate, handoff), reference material
on phase derivation and projection pressure, a view template asset, and one
deterministic validator. There are no direct source files at this level.

## Subdirectories & Boundaries

- `scripts`: [Contract](./scripts/EGM.md) - `validate_atomic_ui_ir.py`, which enforces view traceability to the Behavioral IR, membership in the closed semantic primitive set, declared-region membership, action obligations, and the absence of framework component names.
- `references`: Unlinked reference material (no contract file): `atomic-ui-ir.md`, `phase-derivation.md`, `projection-pressure.md`, `validation-and-brownfield.md`.
- `assets`: Unlinked template asset (no contract file): `assets/view.template.yaml`, the starting point for a view IR.

## Declared Contracts

- The layer model keeps R1 Interaction Domain Model → R2 Behavioral IR → R3 Sequential Proof → R4 Atomic UI IR (this skill) → R5 Renderer Projection distinct [SKILL.md:upstream authority]
- Renderer neutrality forbids framework component names in the IR and requires semantic primitives such as `primitive: action` with `semantic_action`, `consequence`, and `availability: { source: behavioral_ir }` [SKILL.md:renderer neutrality]
- UI actions project Behavioral IR affordances; enablement rules must not become a second source of business truth [SKILL.md:affordance projection]
- The validator is invoked as `python scripts/validate_atomic_ui_ir.py <view.yaml>...` inside the workflow [SKILL.md:workflow]

## Verification

- Run: `just verify`
