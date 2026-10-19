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

## D-004 Local sibling checkouts lag their remotes — RESOLVED (T00)
- Evidence (T00): `cognate` now on `main@a477933` (0.6.1) and `domainforge` on `main@6e941ff` (0.21.1); drift resolved without a fetch.
- Impact: none remaining for API inspection.
- Next: keep pinning published versions; re-check drift before each integration task.

## D-005 Gauntlet and Context Kernel have no Cognate adapters
- Evidence: Gauntlet is a Rust CLI with no Cognate dependency; Context Kernel is MCP-only with no TS client.
- Impact: T10 and T12 must build Cognate capability adapters.
- Next: decide in T00 whether adapters live upstream in Cognate or in Horizon.

## D-006 cognate create --source still required at pinned 0.6.1
- Evidence (T00): `cognate` main@a477933 `packages/cli/src/bin.ts:31-34` exits unless `--source` is given; commit `61015df` ("create without --source") is not an ancestor of main. Plan/handoff claim the opposite.
- Impact: T04 scaffolding must pass `--source`; a registry-only path is not available at the pinned version.
- Next: scaffold with `--source <cognate checkout>`; revisit when a release containing 61015df is published (OQ-01).

## D-007 domainforge CLI on PATH lags the bound binding — PARTIALLY RESOLVED (T01)
- Evidence (T00): `domainforge --version` = 0.19.0; Cognate main binds `@godspeedai/domainforge` 0.21.1.
- Evidence (T01): built pinned `0.21.1` from `~/projects/domainforge` HEAD `6e941ff` at
  `~/projects/domainforge/target/release/domainforge`; all T01 validation used it via
  `DOMAINFORGE_BIN`. The PATH CLI is still `0.19.0`.
- Impact: remaining risk is operators/CI invoking the stale PATH CLI. Pin the release binary
  in T04 toolchain wiring.
- Next: T04 binds the pinned binary into `justfile` gates; operator may still install 0.21.1 (OQ-03).

## D-010 Bundled domainforge-sea skill predates the 0.21 Application Contract
- Evidence (T01): `.agents/skills/domainforge-sea/references/sea-dsl-ai-cheatsheet.yaml:4`
  says it was re-verified against 0.17.0; the pinned 0.21.1 adds typed entity bodies,
  `record`, `enum`, `operation` and APP001–APP015. T01 authored against the real grammar
  (`domainforge-core/grammar/sea.pest`, `docs/reference/sea-application-contract.md`).
- Impact: recurring — any agent trusting the cheatsheet's syntax/CLI sections will author
  stale `.sea`. Local T01 syntax guesses were corrected by live validation.
- Next: regenerate the skill references from the pinned DomainForge source in T04.

## D-008 RealityTrace sxr CLI absent from PATH
- Evidence (T00): `command -v sxr` empty.
- Impact: P8 evidence recipes must fail closed; T13/T18 cannot produce live evidence until resolvable.
- Next: operator installs or sets the configured executable (OQ-04).

## D-009 SEA vs sea-rs naming collision
- Evidence (T00): `~/projects/SEA` is GodSpeedAI/SEA (MPL-2.0, 0.19.1); the authoritative fork is GodSpeedAI/SEA-Forge at `~/projects/sea-rs` (LicenseRef-SEA-Forge).
- Impact: resolving SEA by directory name picks the wrong repo.
- Next: always resolve by remote identity (DEC-T00-03).
