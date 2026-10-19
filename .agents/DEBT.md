# Observed debt

## D-001 SEA-Forge has no authority preview on the wire
- Evidence: `sea-rs/crates/sea-forge-authority/src/lib.rs` separates `evaluate` and `grant`, but only invocation-time authorization is reachable through Cognate's Unix-socket adapter; SFWP `preflight` validates case templates only.
- Impact: Horizon cannot show `likely_allow`; consequential choices show `deferred_to_invocation` (REQ-NAV-006).
- Next: request an evaluate-only SFWP operation upstream in SEA-Forge (T00 records, T11 consumes).

## D-002 Cognate lacks a generic typed object query
- Evidence: `DurableStore.listRecords` supports top-level equality only; no object sets or traversal (Cognate 0.6.1).
- Impact: Horizon builds its own object projection layer (T06).
- Next: report the framework gap upstream rather than patching Cognate internals; also report that `store-sqlite` `buildListRecordsQuery` interpolates the collection name after a regex check.

## D-003 building-with-cognate skill is stale
- Evidence: `cognate/.agents/skills/building-with-cognate/references/cli.md` says `--source` is required; commit `61015df` made it optional. Skill prose cites DomainForge 0.19.0 and `loadSemanticProjection`.
- Impact: cold agents may scaffold wrongly.
- Next: upstream skill fix in Cognate; until then the plan's T04 step overrides.

## D-004 Local sibling checkouts lag their remotes
- Evidence: `cognate` on `feature/landing-repositioning` (0.5.0); `domainforge` at 0.18.2 while Cognate main binds 0.21.1.
- Impact: source inspection against local trees gives wrong API answers.
- Next: operator decides whether to fetch/switch; T00 records drift.

## D-005 Gauntlet and Context Kernel have no Cognate adapters
- Evidence: Gauntlet is a Rust CLI with no Cognate dependency; Context Kernel is MCP-only with no TS client.
- Impact: T10 and T12 must build Cognate capability adapters.
- Next: decide in T00 whether adapters live upstream in Cognate or in Horizon.
