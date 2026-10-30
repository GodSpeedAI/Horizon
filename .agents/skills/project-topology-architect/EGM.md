# project-topology-architect

## Overview

The bundled Project Topology Architect skill: a procedural specification
(`SKILL.md`) for compiling a specification, plan, or existing repository into a
semantically grounded, executable, observable substrate with a requirement
ledger and a frozen Wayfinder. The directory holds the procedural text, its
supporting reference material and templates, and the deterministic validators
that make the substrate's structural claims checkable. It contains no direct
source files at this level; the executable behaviour lives in `scripts/`.

## Subdirectories & Boundaries

- `scripts`: [Contract](./scripts/EGM.md) - Six standalone Python validators: frozen-artifact hashing, portable SXR resolution, generated-substrate scaffold checks, requirement-ledger and Wayfinder validation, and plugin-layout validation.
- `references`: Unlinked reference material (no contract file): `greenfield-formation.md`, `requirement-ledger.md`, `verification-topology.md`, `topology-principles.md`, `brownfield-restructuring.md`, `cold-agent-evaluation.md`, `gauntlet-formation-freeze.md`, `realitytrace-integration.md`, `agents-workbench.md`, `icm-lineage.md`.
- `assets`: Unlinked template assets (no contract file): `assets/lineage/icm/` holds the lineage skill text, core/form/system-map notes, and node/object/process/questionnaire templates.

## Procedure

- The primary workflow stages are named `P0`–`P10` in the skill body: `P0` orient and pin the ruler, `P1` semantic formation, `P1B` behavioral formation, `P1C` atomic UI formation, `P2` derive the software topology, `P3` executable walking skeleton, `P4` verification graph, `P5` frozen convergence envelope, `P6` generated operating surface, `P7` operational `just` surface, `P8` RealityTrace/SXR at the CLI boundary, `P9` cold-agent topology evaluation, `P10` handoff report [SKILL.md:P0 — Orient, gather, pin the ruler]
- Deterministic scripts are documented under the skill's own "Deterministic scripts" section [SKILL.md:7. Deterministic scripts]
- Composition with the sibling skills and the references index are declared in their own sections [SKILL.md:5. Composition of the bundled skills]

## Verification

- Run: `just verify`
