# Implementation handoff — 2026-10-19

For the agent implementing Horizon. This note routes; it does not restate the spec or plan.

## Start here

1. Read root `AGENTS.md`, then `.agents/AGENTS.md`.
2. Run `tail -n 1 .agents/CURRENT_STATUS.jsonl` for the latest status (revision 3).
3. Begin **T00** in `.agents/plans/horizon.plan.yaml`. It is formation and verification only; app scaffolding starts at T04.

## Fixed inputs

| Input | State |
|---|---|
| Spec `.agents/specs/horizon.agent.spec.yaml` | HORIZON-001 1.0.1, **approved and frozen**; SHA-256 `14a42936fe3a17c3726ee57fbc9278fd6f6e92276f67519fd9bf0f605f3324a4` (1.0.1 adds REQ-CMP-001). Do not edit; propose a new version instead. |
| Plan `.agents/plans/horizon.plan.yaml` | 1.0.0, ready; 23 tasks, 58 edges, all 99 requirements mapped. Execute by DAG, not task number. |
| Review `.agents/reports/horizon-spec-adversarial-review.md` | Why the spec says what it says; grounded API facts per subsystem. |
| Product register `.agents/reports/horizon-product-integration-register.yaml` | Product dispositions and first-wave products (research subsystem, Strategist). T00 confirms. |
| Debt `.agents/DEBT.md` | Upstream gaps: SEA-Forge has no authority preview, Cognate has no object query, stale Cognate skill, missing Gauntlet and Context Kernel adapters. |

## Decisions already made by the owner

- Spec approved and frozen (1.0.0; amended to 1.0.1 on 2026-10-20).
- Product Actualizer is Apache-2.0 (commit `c9df8d2` in that repo). Cockpit code may be copied with attribution.
- One-way dependency: every product and stack owner, SEA-Forge included, must work without Horizon (REQ-STACK-014).
- WarpRoom joins as a second-wave product through its own MCP and REST surfaces.
- GodSpeed Agent is superseded; its Python ML research infrastructure moves into a Python research subsystem (T21), never ported to TypeScript.

## Still open for T00 to record

- Single home for developmental scoring and promotion rules (REQ-DEV-003).
- Research migration manifest with hashes, plus the `cybernetic_nav` tool mapping.
- Whether Gauntlet and Context Kernel adapters live upstream in Cognate or in Horizon.
- Which of SEA, NewSea, XSEA and sentient-enterprise-architecture still own live behavior.

## Environment facts (2026-10-19)

- Workspace names differ from product names: SEA-Forge is `../sea-rs`, RealityTrace `../sxr`, Context Kernel `../Context_Kernel`, GodSpeed Agent `../godspeed_agent`.
- `../cognate` is on `main` at `a477933` (packages 0.6.1, DomainForge 0.21.1, `loadSemanticWorld` present). `../domainforge` is on `main` at `6e941ff` (0.21.1).
- The Cognate skill's `cli.md` wrongly says `cognate create --source` is required; it is optional.
- Auto mode trusts all repositories under `~/projects`; `git fetch`, `git switch` and fast-forward-only merge/pull are pre-allowed. History-rewriting git operations and pushes are not.
- The `actualize/` model in Product Actualizer still says AGPL until its next run; this does not affect Horizon.
