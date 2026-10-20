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

## D-014 Module-resolution swap needs an isolated dependency tree (2026-10-19)
- Location: `node_modules/@godspeedai/cognate-runtime-bun` (installed tree; no repository file)
- Debt: Bun resolves a dependency by its on-disk package directory, not by preload order, so the T04 fake-runtime tooth cannot substitute `createRuntime` through `--preload` in this checkout. Building the discriminating attack requires an isolated dependency tree in a temporary directory. During the first attempt the installed package directory was briefly moved out of this repository into `/tmp`; it was restored within the same step and verified (version `0.6.1`, 14 source files, tests green), but a concurrent process would have failed. Do not mutate the shared `node_modules` to build an attack; copy the tree instead.
- Evidence: `bun --preload <fake>.ts -e 'await import("@godspeedai/cognate-runtime-bun")'` reported the real `createRuntime`; `mv node_modules/@godspeedai/cognate-runtime-bun /tmp/... && mv` back, then `ls .../src | wc -l` = 14 and `bun test` green.
- Confidence: high (directly observed)
- Closure: keep attack tooling confined to temporary copies of `package.json` + `node_modules`; if the tooth later needs a real module swap, vendor a second copy under a distinct path rather than moving the installed one. Size S.

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

### D-012 (continued) — the generic form also dropped subjects and left prohibitions unrestated
- Date: 2026-10-19
- Location: `scripts/gen-requirement-ledger.py` (`restate`), `requirements/ledger.yaml`
- Debt: Besides the four reversed prohibitions (D-015), the old `restate()` stripped everything before `MUST` and then removed the modal, so many contracts lost their subject ("Adapters is observed to not create…") and 35 clauses keep a raw normative modal inside a restatement ("…and operations MUST carry a checkpoint reference"). The generator is fixed and self-tested; the frozen ledger still carries the old text until T04-CR-001 is authorized.
- Evidence: clause census in `.agents/evidence/horizon/T04/REMEDIATION.md`; `scripts/check-acceptance-claims.py` reports 65 failures against the frozen ledger and 0 against the candidate.
- Confidence: high (directly observed)
- Closure: covered by candidate revision T04-CR-001 for the frozen artifacts; per-requirement observables remain D-012's own work. Size S for the generator (done), L for the remaining contracts.
- Status: CLOSED 2026-10-20 for the frozen artifacts: T04-CR-001 revision 3 applied and re-frozen (`T04-CR-001@2026-10-20`, DEC-T04-06). Per-requirement witnesses remain owning-task work.

## D-015 Frozen acceptance contracts invert four prohibitions (2026-10-19)
- Location: `requirements/ledger.yaml` (`AC-INT-004-01`, `AC-STACK-006-01`, `AC-STACK-012-01`, `AC-UI-006-01`), `.wayfinder/answer-key.md`, `scripts/gen-requirement-ledger.py`
- Debt: The generator stripped `MUST NOT`, so four frozen contracts prescribe the behaviour their requirements forbid (approval misrepresentation, receipt-as-settlement, product adoption of Horizon's stack, owner-layout seizure). A downstream implementation could satisfy the oracle by violating the ruler. Found by the independent T04 verdict (F2, severity S1), not by the builder or the freeze gates.
- Evidence: verdict `codex-root-20261019-7b4d110` §F2; `scripts/check-acceptance-claims.py` fails against the frozen ledger naming all four.
- Confidence: high (directly observed by the reviewer and re-derived here)
- Closure: generator fixed with a self-test; frozen artifacts require candidate revision T04-CR-001 and an owner-authorized re-freeze. Do not treat any of the four as settled until then. Size M.

### D-015 (continued) — resolved status
- Date: 2026-10-19
- Location: `.agents/candidates/horizon/T04-CR-001/`
- Debt: (status only, no new defect) The generator fix and the candidate revision are in place and verified; the *frozen* contracts are still inverted until the owner authorizes the re-freeze.
- Evidence: `just acceptance-claims` passes on the candidate; `just acceptance-claims-frozen` fails on the active ledger, by design.
- Confidence: high
- Closure: close this entry when a new freeze replaces the inverted contracts. Do not close it on the strength of the generator fix alone.
- Status: CLOSED 2026-10-20 for the frozen artifacts: T04-CR-001 revision 3 applied and re-frozen (`T04-CR-001@2026-10-20`, DEC-T04-06).

## D-016 — RESOLVED — Canonical `.sea` binds an invariant to a requirement that does not exist (2026-10-19)
- Location: `.sea/interaction/interaction-model.sea:728` (`inv_simulation_never_changes_world` → `REQ-CMP-001`)
- Debt: The frozen spec declares no `REQ-CMP-*` requirement (98 requirements, none CMP). The invariant restates the J05_compare journey note, which is not bound to a requirement id. Found while adding the referential-integrity check; the ledger census could not see it because instance bindings are keyed by `requirement_ref` and a dangling one silently binds nothing.
- Evidence: `python3 scripts/check-idm-integrity.py` reports the dangling reference; it is tolerated only because `scripts/idm-integrity-debt.yaml` lists that exact triple.
- Confidence: high (directly observed)
- Closure: decide whether the spec should declare the requirement or the model should re-bind INV-10; either path changes the canonical world and therefore `world_ref`, so it needs a new freeze. Until then the debt entry must stay, and any *new* dangling reference fails `gate-t01`. Size M.
- Status: CLOSED 2026-10-20: spec 1.0.1 declares REQ-CMP-001 (DEC-SPEC-101); world_ref unchanged; the integrity exception is removed.

## D-017 `bun run scripts/teeth.ts` depends on the caller's environment (2026-10-19)
- Location: `scripts/teeth.ts` (isolated-tree attacks), `justfile` (`teeth`)
- Debt: The fake-runtime and missing-dependency attacks build a temporary dependency tree by copying `node_modules` (~135 MB, roughly two copies per run) and depend on three ambient facts: the repository has an installed `node_modules`, absolute paths recorded in `node_modules` resolve back to this checkout, and the pinned world is reachable through `domain/`. On a machine without `node_modules` the teeth fail closed rather than silently pass, but they are slow (minutes) and not portable to a fresh clone without `setup`.
- Evidence: `bun run scripts/teeth.ts` copies `node_modules` twice per run; first attempt failed with `ENOENT … /tmp/…/domain` until the `domain/` symlink was followed with `realpathSync`.
- Confidence: high (directly observed)
- Closure: replace the copy with a hard-linked or overlay install, or vendor one second copy of `@godspeedai/cognate-runtime-bun`. Size S.

## D-018 Recorder printed success for every failing target (2026-10-19)
- Location: `.agents/evidence/horizon/T04/run-gates.sh`
- Debt: `echo "$t exit=$?"` ran after `rc=1`, so `$?` was the preceding `echo`'s status: every target reported `exit=0` regardless of failure. The first remediation run printed `acceptance-claims-frozen exit=0` for a target that exits 1. This is the class of defect the repo's "no false green" rule targets, in the recorder rather than in a gate.
- Evidence: run output `acceptance-claims-frozen exit=0` beside `just-acceptance-claims-frozen.log` ending with "recipe failed on line 27 with exit code 1".
- Confidence: high (directly observed)
- Closure: capture `status=$?` before reassigning `rc` (done in this session) and never summarise a target's status without capturing it first. Size S.

## D-019 REQ-CONFIG-004 names provider controls Horizon does not have (2026-10-19, updated 2026-10-20)
- Date: 2026-10-19
- Location: `.agents/specs/horizon.agent.spec.yaml:576` (`REQ-CONFIG-004`), `src/config/types.ts:21` (`HorizonConfig`), `test/acceptance.test.ts` (`AC-CONFIG-004-01`)
- Debt: The frozen requirement says "Configured provider endpoints, credentials, timeouts and scope MUST remain below stable behavior contracts". The only configured provider is the research subsystem (`research_command`); no provider declares credentials, timeouts or scope. Revision 2's witness varied Horizon's own `bind_host`/`port` and `secrets.path` and called them provider configuration (independent verdict r2 F3). Revision 3's witness varies the research provider endpoint only and is recorded as PARTIAL; credentials, timeouts and scope remain unproven.
- Evidence: `HorizonConfig` has no provider credential, timeout or scope field; `scripts/ledger-policy.candidate.yaml` `REQ-CONFIG-004.witness_supplies` begins "PARTIAL".
- Confidence: high (directly observed in code and config)
- Closure: either declare the provider controls the requirement assumes and extend the witness, or amend REQ-CONFIG-004 in a new frozen spec version to name the controls Horizon actually has. Size M.

## D-020 Contract findings carried by the witness-claims baseline (2026-10-19, updated 2026-10-20)
- Date: 2026-10-19
- Location: `scripts/witness-claims-baseline.txt`, `scripts/check-witness-claims.py`, `scripts/measure-contract-modals.py`
- Debt: Revision 2 baselined eleven check-contract lines and fourteen check-modals lines and called the candidate's inherited DEV-001, NAV-002, STACK-004, STACK-011 and STACK-014 contracts "pre-existing debt". Independent verdict r2 ruled them DEFECT (F2) and showed the baseline was keyed by file basename, so a candidate entry could suppress an active finding and a repaired CASE-003 contract could regress silently (F4). Revision 3 rewrites the five contracts, keys entries by full ledger path plus a contract-text digest, fails on stale entries, and adds `contract-modals` to `gate-t04`. After the 2026-10-20 re-freeze the only entries are REQ-RES-001 for the active and the applied candidate ledger, a lexical false positive the verdict ruled ACCEPTABLE-DIFFERENCE. The checkers remain lexical; neither establishes semantic equivalence.
- Evidence: `just witness-claims` (5 known, 0 new, 0 stale); `just contract-modals` (1 known); attacks in `.agents/evidence/horizon/T04/gates.txt`.
- Confidence: high (reproduced mechanically)
- Closure: the five active entries were deleted at the re-freeze. Keep the RES-001 entry only while its contract text is unchanged; a lexical checker with a "contains no" pattern would retire it. Size S.

## D-021 The requirements author has no committed artifact witnesses (2026-10-19)
- Date: 2026-10-19
- Location: `.wayfinder/answer-key.md`, `requirements/ledger.yaml`
- Debt: All 98 requirements are marked `evidence_class: "declared"` with `status: "active"` in the canonical `.sea`, and the frozen ledger records no acceptance-evidence binding per requirement; the Wayfinder lists only the gate command. A contractual acceptance claim can therefore cite a gate that exercises a different behavior. The candidate revision's witness bindings (revision 3: only REQ-CONFIG-004, partial) live in the candidate policy only and are not represented per requirement in the ledger.
- Evidence: `requirements/ledger.yaml` rows carry `proof` (gate commands) and `acceptance` (ids), no evidence reference; the `.sea` invariants all read `evidence_class: "declared"`.
- Confidence: medium (code and schema reading, not observed failing a gate)
- Closure: add an `acceptance_evidence` binding per requirement (path plus test name) to the ledger schema, emitted by the generator from `evaluated_by`, and validate it in `just wayfinder`. Size M.


## D-022 — RESOLVED — There is no NOTICE file, though T05's prereg names one (2026-10-20)
- Date: 2026-10-20
- Location: repository root (`NOTICE`), `.agents/prereg/horizon/T05.prereg.yaml` PE-08, `docs/donors.md`
- Debt: PE-08 expects donor-derived vocabulary to be recorded in `docs/donors.md` **and** `NOTICE`. `docs/donors.md` exists and is current; no `NOTICE` file exists at the root and no code or check references one, so the second half of the expectation cannot be satisfied as written. Whether Apache-2.0 redistribution of the vendored Cognate closure requires one was not verified here.
- Evidence: `ls NOTICE` -> no such file; no reference to `NOTICE` in `src/`, `scripts/` or `docs/`.
- Confidence: high (directly observed absence)
- Closure: either author a root `NOTICE` covering the vendored Apache-2.0 closure and link it from `docs/donors.md`, or amend PE-08 to name `docs/donors.md` alone. Both need owner sign-off because PE-08 is frozen. Size S.
- Resolution (2026-10-20, owner ruling): plan rule `horizon.plan.yaml:77` makes a `NOTICE` entry an expected output of copying donor material, so the owner authorized authoring it rather than amending frozen PE-08. `NOTICE` now records, per donor, the name, license, pinned source commit or package version and what was borrowed, and `docs/donors.md` links to it. `check-t05-boundaries.ts` now fails if the two lists disagree or a section lacks License/Source/Borrowed, verified by attack (absent NOTICE, dropped donor, missing License). PE-08 re-run separately: PASS. See `DEC-T05-04`/`DEC-T05-05` and `.agents/evidence/horizon/T05/pe08-rerun.log`. Horizon itself still declares no license (no root `LICENSE`, no `package.json` license field); that is a separate gap, logged as D-026.

## D-023 CLI and server processes contend for one SQLite store (2026-10-20)
- Date: 2026-10-20
- Location: `src/runtime/create.ts` (`openSqliteStore`), `src/main.ts`
- Debt: Two Horizon processes pointed at the same `HORIZON_STORE` race on `PRAGMA journal_mode = WAL` and one dies with `SQLiteError: database is locked (SQLITE_BUSY)`. It does not block T05 — `scripts/teeth-t05-equivalence.ts` gives each process its own store — but an operator running `horizon surface` beside a live server sees a hard crash rather than a retry.
- Evidence: `bun run src/main.ts surface` and `bun run src/main.ts schema` against one `HORIZON_STORE`; the second exited 1 with `SQLiteError: database is locked` at `openSqliteStore`.
- Confidence: high (directly observed)
- Closure: set `busy_timeout` on open, or keep store paths per-process. Size S.
- Reclassified 2026-10-20 (latent, does not block T06/T07): does not reproduce on the settled tree. `bun run src/main.ts surface` beside a live `server`, two processes started simultaneously, and six concurrent processes against one fresh `HORIZON_STORE` all exited 0 with zero lock errors. The pinned `cognate-store-sqlite` 0.6.1 already issues `PRAGMA busy_timeout = 5000` (`src/index.ts:135`), so the retry the closure asked for is supplied upstream. Residual window: `busy_timeout` is set *after* `PRAGMA journal_mode = WAL` (`:129`), so a burst that all opens an un-migrated store at once could still collide before the timeout is armed. That window was not observed failing. Horizon does not patch the vendored store (REQ-STACK-010); hardening belongs upstream in Cognate. See `DEC-T05-06`.

## D-024 MCP tool names fold the closed operation id, so identity is lost (2026-10-20)
- Date: 2026-10-20
- Location: `src/ui/surface2/render.ts` (`mcpTools`)
- Debt: Tool names are `operation.replaceAll(".", "_")`, so `horizon.health` is published as `horizon_health`. A consumer cannot recover the closed operation id from the name without re-deriving the fold, and no field on the descriptor carries the original id. The equivalence tooth must re-apply the same transformation, so it verifies a naming convention rather than an identity.
- Evidence: `bun run src/main.ts mcp` emits `horizon_health`, `horizon_research_health`, … against a grammar union of `horizon.health`, `horizon.research.health`, ….
- Confidence: high (directly observed in output)
- Closure: add an explicit `operation` field to each descriptor so middleware and the check compare identity, not spelling. Size S.

## D-025 The `horizon.view` MCP tool is hand-listed and copies the role vocabulary (2026-10-20)
- Date: 2026-10-20
- Location: `src/ui/surface2/render.ts` (`mcpTools`, first element)
- Debt: The eleven operation tools are derived from `HORIZON_OPERATIONS`, but `horizon.view` is a literal with a hand-written `inputSchema` naming `["agent", "human", "system"]` — a second copy of the role vocabulary. A role added to the grammar would leave the MCP view tool advertising a stale set while every check stayed green.
- Evidence: code reading of `mcpTools`; `SURFACE_ROLES` in `grammar.ts` is the authority; the view tool repeats the three role strings literally.
- Confidence: medium (code reading, not observed failing)
- Closure: build the `horizon.view` descriptor from `SURFACE_ROLES` and `GUI_VIEW_SCHEMA`. Size S.


## D-026 Horizon declares no license of its own (2026-10-20)
- Date: 2026-10-20
- Location: repository root (no `LICENSE`), `package.json` (no `license` field), `NOTICE`
- Debt: The root `NOTICE` created for PE-08 records donor obligations but cannot state Horizon's own terms, because the repository declares none: there is no root `LICENSE` file and `package.json` has no `license` field. `docs/donors.md` records that Product Actualizer is Apache-2.0 and that donor material was relicensed by the owner, but Horizon's own outbound license is unstated, so a consumer cannot tell what Horizon grants. Found while authoring `NOTICE`; not fabricating terms here because license choice is an owner decision.
- Evidence: `ls LICENSE` -> no such file; `grep license package.json` -> no match; the `NOTICE` header states the absence explicitly rather than implying a grant.
- Confidence: high (directly observed absence)
- Closure: owner picks Horizon's license, adds root `LICENSE` and a `package.json` `license` field, then updates the `NOTICE` header. Size S.
- Resolution (2026-10-20, same day): NOT REPRODUCIBLE — see D-028. The repository does have a root `LICENSE` (Apache-2.0, added on the remote in `4702ada`); this entry observed a locally stale clone, not an unlicensed repository. Treat D-026 as refuted. The one part that survives is that `package.json` still declares no `license` field.
## D-028 D-026 was a false positive: the local clone was stale, not unlicensed (2026-10-20)
- Date: 2026-10-20
- Location: `.agents/DEBT.md` D-026; repository root `LICENSE`; `NOTICE`; `docs/donors.md`
- Debt: D-026 recorded that Horizon declares no license, and the `NOTICE` header was authored to state that absence. Both were wrong. The owner had added `LICENSE` (Apache-2.0) to the remote at least an hour earlier, but the local clone sat one commit behind and nothing forced a fetch, so the absence observed locally was a local-clone artifact reported as a repository fact. Left uncorrected, the `NOTICE` would have carried a false statement about Horizon's own terms into a file whose entire purpose is legal accuracy. D-026 stays in this log as a failed observation rather than being deleted.
- Evidence: `git fetch origin` reported `main ... [origin/main: ahead 4, behind 1]`; `4702ada Create LICENSE` (`SPRIME01`, Tue Oct 20 12:14:44 2026 -0400) adds 201 lines whose first lines are `Apache License / Version 2.0, January 2004`. Before the pull, `ls LICENSE` returned no such file. After merging `origin/main`, `LICENSE` exists locally.
- Confidence: high (directly observed, then directly refuted by the fetch)
- Closure: Done in the correcting commit — `NOTICE` now states Apache-2.0 and points at `LICENSE`. Still open: `package.json` has no `license` field, so tooling that reads the manifest alone cannot detect the license; adding `"license": "Apache-2.0"` is owner-gated because it asserts terms. Size S.

## D-029 Local state can be stale relative to origin, and nothing forced a fetch (2026-10-20)
- Date: 2026-10-20
- Location: repository-wide; the T05 verification loop (`just verify`, `just gate-t05`) and the evidence recorded from it
- Debt: Every T05 gate ran against a working tree one commit behind `origin/main`. The gates verify the tree, not the branch that will be pushed, so "verified" was true of local state and could have diverged silently from the shared branch. This time the divergence was a documentation fact (D-028); a source or spec divergence would have the same blind spot with worse consequences.
- Evidence: `git branch -vv` showed `[origin/main: ahead 4, behind 1]` only because the status line prints the upstream count; no gate or hook reported it. The stale commit was user-visible only because the owner said so.
- Confidence: medium (the staleness is directly observed; the general risk of a stale-tree green gate is a code/process reading, not an observed failure)
- Closure: Have `just verify` (or a pre-commit check) report ahead/behind and refuse to report green when behind on a fetched remote. Files likely touched: `justfile`, a small `scripts/check-sync.ts`. Size S.


## D-030 The T05 boundary check keeps its findings in module-level state (2026-10-20)
- Date: 2026-10-20
- Location: `scripts/check-t05-boundaries.ts` (`checkT05Boundaries`), and the pattern it sets for the newer T05 checks
- Debt: `checkT05Boundaries(root)` accumulates into module-scoped arrays, so calling it twice in one process mixes the first run's findings into the second. The teeth tolerate it today only because each tooth builds a fresh tree and reads `result.failures` before the next call. A caller that compares two trees in one process (which is what a coverage-of-coverage check would want to do) would read a merged result. `check-t05-prereg-coverage.ts` was written the same way and hit this during its own teeth; it now resets its buffers at entry and returns a copy, but the boundary check still has the hazard.
- Evidence: observed while writing `scripts/teeth-t05-prereg-coverage.ts` — a second call in the same process reported the first run's messages, and a hoisted duplicate `fail()` inside `gateProof` shadowed the collecting one so failures were printed but never recorded.
- Confidence: high (directly observed in the coverage check's own teeth; the boundary check's shape was read, not exercised twice)
- Closure: make both checks return their findings from a local accumulator instead of module state (or reset at entry and return a copy), then add a tooth that calls the check twice with different trees and asserts the second answer is not contaminated by the first. Files likely touched: `scripts/check-t05-boundaries.ts`, `scripts/teeth-t05-boundaries.ts`. Size S.



## D-027 No end-to-end journey exercises a conflicting human/agent layout claim (2026-10-20)
- Date: 2026-10-20
- Location: `behavioral/journeys/J02.yaml`, `.agents/plans/horizon.plan.yaml` T04 (`Exercise positive, blocked, unknown, conflicted, cancelled and contradicted routes`), `src/ui/surface2/reduce.ts` (`downgrade`)
- Debt: T05's NE-03 found that agent attribution was reported as a human-authored layout, and the fix caps a claimed layout at `agent_proposed`. That cap is currently proven only by a unit test that drives the reducer directly. No canonical journey contains a case where a human and an agent claim the same layout, so the end-to-end path — two claims arriving from a real source through the binder and reducer, and the agent's being visibly capped rather than silently dropped or silently winning — is unproven. J02 as written has no layout-claim conflict at all, so this is not merely unexercised: the case is not planned.
- Evidence: `behavioral/journeys/J02.yaml` contains no human/agent conflict or layout claim; `.sea/interaction/interaction-model.sea` mentions `conflicted` only as an availability value and `concurrency_conflict` only for reused intent ids; T05 `SUMMARY.md` records the gap under unknowns.
- Confidence: high (checked J02 and the canonical IDM for the case; it is absent)
- Closure: add the conflicting-claim route to the J02 journey fixtures and an end-to-end assertion at the transport boundary (human claim winning, agent claim capped at `agent_proposed`, both retained with provenance), then point `just gate-t06` or the J02 gate at it. Files likely touched: `behavioral/journeys/J02.yaml`, `.sea` if the route is canonical, `test/surface-negative.test.ts`, a journey fixture. Size M.
