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

## D-011 DomainForge application instance count may be stale (2026-10-19)
- Location: `.sea/interaction/validation/domainforge-output.txt`
- Debt: The captured `validate --application` output reports a count that did not change after an invariant's `requirement_ref` was corrected (T04 re-pin `b0f31fcc`.. -> `6c18d6a6`..). It may count entities only, or the capture may lag the model, in which case the recorded "0 violations" is weaker evidence than it looks.
- Evidence: file diff on 2026-10-19 changed only the `world_ref`/hash lines; the instance count was unchanged across a substantive `.sea` edit.
- Confidence: low
- Closure: confirm what the count covers and whether `scripts/recapture-domainforge-output.sh` must be re-run after every `.sea` edit; document it. Size S.

### D-011 (continued) — CONFIRMED, not stale: the count is blind to dangling refs and duplicate ids
- Date: 2026-10-19
- Location: `justfile:46` (`gate-t01`), `scripts/teeth-domainforge-gate.py`
- Debt: The count is not stale — the gate genuinely does not see these defects. Vivisection on a scratch copy of `interaction-model.sea`:
  `requirement_ref: "REQ-INT-003"` -> `"REQ-DOES-NOT-EXIST-999"` still reports `Validation succeeded: 0 violations total`, exit 0.
  Duplicating `invariant_id: "INV-08"` onto the INV-07 instance still reports `0 violations total`, exit 0.
  This matters because the T04 pin revision was *caused by* a wrong `requirement_ref` (INV-08 pointed at REQ-NAV-001); the gate that was cited for that fix cannot detect the class of defect it was fixing.
- Evidence: `domainforge validate <copy> --application --format human` -> exit 0 / "0 violations total" for both injections; 24 entities unchanged.
- Confidence: high (directly observed)
- Closure: **added a tooth**, `scripts/teeth-domainforge-gate.py`, invoked from `just teeth`. It asserts the null tree passes, the control (undefined instance type) fails, and the two blind spots are *demonstrated* rather than assumed. Standing rule until DomainForge can see these: no task may cite "0 violations" as evidence of referential or identity integrity. The `world_ref`/`semantic_closure_hash` pin plus `check-idm-coverage.py` remain the real integrity controls. Size S (tooth done); upstream DomainForge gap is theirs.

## D-013 DomainForge diagnostic semantics asserted from partial source reading
- Location: `../domainforge/domainforge-core/src/module/resolver.rs`
- Debt: D-011 vivisection concluded the `--application` diagnostics are APP014 (symbol/import resolution) and APP015 (parse) from a grep of `resolver.rs` and `--help`, not from a diagnostic reference. The conclusion is behaviourally confirmed by the tooth (control fails, dangling/duplicate pass), but the *classification* of which diagnostic class covers what is not sourced from a spec.
- Evidence: observed `Error: Parse failed ... resolved closure failed graph construction: Grammar error: ... Entity 'TotallyUndefinedType' not found`.
- Confidence: medium
- Closure: cite the DomainForge APP001–APP015 diagnostic reference (version 0.21.1) in the T04 evidence, or drop the classification claim and rely only on observed behaviour. Size S.



## D-012 72 acceptance contracts restate the runtime in its own terms (2026-10-19)
- Location: `requirements/ledger.yaml`, `scripts/ledger-policy.yaml`
- Debt: Most expected-observable cells use the generic `Observed in the runtime's own terms:` form, which is checkable but weak as a falsifiable acceptance contract. Only three conjunctions were split facet-by-facet at T04.
- Evidence: T04 ledger census: 85 of 98 rows use the source-fidelity predicate; the generic restatement appears 72 times.
- Confidence: medium
- Closure: replace generic restatements with per-requirement observables as each owning task (T05+) is implemented, tightening the ledger policy so new rows cannot regress to the generic form. Size L.
