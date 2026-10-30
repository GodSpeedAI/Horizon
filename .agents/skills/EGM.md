# Horizon Bundled Skills

## Overview

The repository's bundled agent skills: each child directory is one
self-describing skill consisting of a `SKILL.md` procedure plus optional
reference material, template assets, and deterministic validation scripts. Three
of the six skills carry EGM contracts written at their own level; the remaining
three have no contract file here and are listed unlinked with a direct link to
their existing `SKILL.md`. Nothing in this directory executes on its own — the
scripts run only when a skill workflow or a `justfile` recipe invokes them.

## Subdirectories & Boundaries

- `project-topology-architect`: [Contract](./project-topology-architect/EGM.md) - Substrate-formation skill: compiles a spec or repository into a requirement ledger, verification graph, and frozen Wayfinder; its `scripts/` hold the ledger, Wayfinder, scaffold, plugin, hash, and SXR-resolution validators used by `just ledger` and `just wayfinder`.
- `deriving-behavioral-interaction-proofs`: [Contract](./deriving-behavioral-interaction-proofs/EGM.md) - Derives one renderer-neutral Behavioral IR per canonical journey and a sequential proof over the `IS1`–`IS8` phases; ships `validate_behavioral_ir.py`.
- `deriving-atomic-ui-models`: [Contract](./deriving-atomic-ui-models/EGM.md) - Derives renderer-neutral Atomic UI IRs from Behavioral IRs and projection pressure; ships `validate_atomic_ui_ir.py`.
- `deriving-interaction-domain-models`: [SKILL.md](./deriving-interaction-domain-models/SKILL.md) - Canonical `.sea` Interaction Domain Model derivation; also contains `references/` and `evals/` (no EGM contract file).
- `domainforge-sea`: [SKILL.md](./domainforge-sea/SKILL.md) - DomainForge SEA DSL authoring and CLI workflow guidance; also contains `agents/` and `references/` (no EGM contract file).
- `neatcode`: [SKILL.md](./neatcode/SKILL.md) - Software-engineering judgment skill for implementation, review, and audit; also contains `references/` (no EGM contract file).

## Boundaries

- A skill directory owns procedure and validation only; it is not application
  runtime. The ledger and Wayfinder validators read repository artifacts but the
  `justfile` recipes (`ledger`, `wayfinder`) are what the repository actually
  runs [justfile:ledger].
- Reference material and assets inside a skill are inputs to a procedure, not
  executable surfaces; no script in this tree writes files.

## Verification

- Run: `just verify`
