# 07 · Appendix — Per-Repo Dossiers (condensed recon evidence)

Produced 2026-11-04 by six read-only recon agents over the working checkouts. **[F]** observed fact · **[I]** inference · **[U]** unknown. Nothing was modified; no tests were executed. These dossiers back the claims in `01`/`02`; citations are as reported by the recon agents and were spot-verified where they drive decisions.

## sea-rs (SEA-Forge) — branch docs/egm-bootstrap-readmes @ b072ec50, clean

- 25-crate Rust workspace + `apps/` (godspeed-casework-go Go service, godspeed-cognitive-ui TS) + `workbench/`; sync-kernel rule enforced by `just no-async-kernel` (crates/AGENTS.md:7–14). [F]
- Surfaces: CLI `sea-forge` (30+ subcommands incl. Approve/Reject/Resume/Settle paths), `sea-forge-server` daemon (SFWP v1: NDJSON over Unix socket 0600, 4 MiB cap, idempotency keys; `docs/reference/sfwp-protocol-reference.md`), MCP server, agent delegation (OpenAI/Anthropic/ACP). [F]
- Authority: default-deny PolicyAuthorityEngine, verdicts allow/deny/escalate, pinned OPA 1.21.1 candidate, CEP authority loop with obligation settlement from RealityTrace's ledger (crates/sea-forge-authority). Settlement: `sea-forge-settlement` — `settle(claim, workspace, run_dir)`, hash-chained JSONL declaration ledger, pluggable SettlementAuthority (Local/SWE-seed). Ledger: append-only JSONL, crash-safe tail repair (7a344fc1/#62). **No dedicated affordability engine** (capacity lives in Horizon/Cognate instead). [F]
- Status: `.agents/CURRENT_STATUS` rev 183 (2026-10-30) — EGM drift pass over 150 contracts, 10 fixed, 3 triage open; no test run recorded in that rev. Historical revs carry real evidence (e.g. rev 154: 17 passed incl. 5 corroboration tests). Local main 8 behind origin/main 22bf66a3. [F]
- Unmerged lineages: settlement-approval-gate (21 commits +4,280), fix/settlement-resume-lease (+509), PR 84 fix/server-ambiguous-declare-keeps-lease (active Nov 3–4), security/permission-matrix (+219), horizon/socket-group-access (+269), feat/hardening-capability-harvest (36 commits +8,397), feat/arm64-jetson-packaging. Worktrees map onto these (sea-rs-fix=PR84; sea-rs-integrity=resume-lease; sea-rs-settlement-gate=pre-squash #81, superseded; sea-rs-permission-matrix=only a go-jose bump left; sea-rs-main=origin/main reference). [F]
- Installed: 0.3.0 in ~/.local/bin (Nov 1); no running process; stale `~/.sea-forge/server.sock` (Aug 31). Release-please 0.4.0 PR open. License: source-available (LicenseRef-SEA-Forge + EE). [F]
- Debt (OBSERVED_DEBT.md): workbench renderer no backend bridge since Tauri removal; readiness view never derives `overall:"stale"`; `events.get_range` lacks tail read; accept-loop resilience untested; readiness Playwright journey never talks to a real server. [F]

## cognate — security/repo-hygiene-2026-10-31 @ 87333bc, clean

- Bun monorepo; 43 packages `@godspeedai/cognate-*` all 0.8.0 (linked versions), tags v0.1.0 (10-09) → v0.8.0 (10-26). SDK facade `packages/cognate/src/index.ts` (createRuntime/createClient; heavy adapters opt-in). `createApplication` does not exist here — it is Horizon vocabulary. [F]
- Governance: fail-closed env (`governance-env.ts:6-35`: COGNATE_GOVERNANCE/SEA_FORGE_SOCKET/WORLD_REF `world:<name>@sha256:<64hex>`/ACTOR); dispositions incl. escalate/unknown/constrained_allow/boundary/degraded (`governed-operation.ts:16`); escalation carries approvalId + window; **"parking" is app-side vocabulary, not SDK**. Outbox→RealityTrace: `observation.deliver` topic, `realitytrace` package's OutboxDispatcher + `governedTraceFor`. No `seaForgeCall` export. [F]
- README invariants: "Governance is integration, not enforcement"; runs serial by default (maxConcurrentRuns 1–64 process-local); Connect unary+streaming only; RVF Bun binding experimental. [F]
- EGM: ~166 contracts (2026-10-30, cb8d763/92161ba); root contract cites status rev 74 vs ledger 78; drift report 7 findings, 6 fixed; **no mechanical gate over the EGM tree** (rev 75). Last green: rev 78 substrate 81/81 + 54-test harness; rev 75 `just verify` 79/0. [F]
- History rewritten via git-filter-repo and force-pushed (rev 76–78); bundle backup `cognate-all-refs-2026-10-26.bundle` (229 MB). Worktree `cognate-identity-wt` = branch `horizon/shared-identity` @ f4d4db6 (2 commits: shared operator identity/pairing/WebAuthn contract; hyphenated collection names fix) — **unpushed**. [F]

## cognate-workbench — feat/desktop-terminal-browser @ 96f7fb0, 48 dirty (40 = evidence PNGs; rest untracked dist packages)

- Product: browser app + docked PTY (xterm over authenticated stream) + shared managed browser sessions (JPEG viewport, inspect/annotate) + governed dev-server previews + **Tauri 2 desktop shell** (deb/appimage/nsis/app/dmg; sidecar lifecycle hardened at HEAD). pg0/PostgreSQL persistence; Linux-contained by default; local workspaces read-only to agents. React 19.3, Bun. [F]
- Capabilities working today (README): file/shell/code-exec in real dirs, streaming, cancellation, plans, subagents, hot-swappable providers, persistent Experts/Teams/Assignments, approval gates, steering. Limits honestly stated: capability substitution + parallelism plans "recorded, do not act". [F]
- Own SEA-Forge wiring independent of SDK: `src/capabilities/governance.ts:14,44-56` (COGNATE_SEA_FORGE_OPERATOR, seaForgeCall) exporting `governance.approvals.list/.resolve`; used by settlement orchestrator + UI (App.tsx:4611). [F]
- Status rev 39 (2026-11-04): T12 mission journey e2e; typecheck 0; domainforge validate 0; smoke 73/73; last full verify 1,571 tests (1,556 pass, 13 skip, 2 load flakes) at ec7fc4d; CI packaging qualified on 5 platforms (run 41168736030). Open: Tauri release build, WSLg real-window pass, failure-surface probe; **T6 center-view registry extraction skipped** (dock still in App.tsx). [F]
- Registry pins `@godspeedai/cognate-*: 0.8.0` (no vendoring). `.sea/interaction/interaction-model.sea` is its authoritative app model. Single-operator dev authenticator = stated security limitation. [F]

## domainforge — main @ f90905a, 6 dirty (agent tooling + a branch-reconciliation report; no source in flight)

- Single crate `domainforge-core` (python/ts/wasm are in-crate modules) **0.21.2** on crates.io/npm/PyPI (2026-10-26); pest grammar `domainforge-core/grammar/sea.pest` (582 lines, 29 declaration kinds; `intent` is a clause inside operation, not top-level; no world/affordance/proof grammar rules — world is application-layer `src/application/world.rs`). 31 projection formats. Identity chain: `Graph.parseSourceMap` (napi `src/typescript/graph.rs:427`) → `domainModelIdentityJson` → `worldRefFromIdentityJson` → `verifyWorldRef`. **`loadSemanticWorld`/`loadSemanticProjection` live in cognate's adapter package**, not DomainForge (pinned `@godspeedai/domainforge` 0.21.1). [F]
- Tests: 1,294 Rust green 2026-10-30 (`.agents/current_state.md`); PR #164 CI green. EGM: 61 contracts (0a5d71c, 2026-10-30); one source commit since (d0c1d41) — touch-up, not regen. [F]
- Debt: 23 OBSERVED_DEBT entries (open: D2, D3, D4, D5, D11 CodeQL napi FP, D12 Kleene consistency, D-serde-saphyr, D-native-1..4 unsigned pkgs, D-exit-1, D-doc-egm-3 partial). Legacy: `Kg` projection legacy; root package.json 0.15.0 vs typescript 0.21.2; empty `python/sea_dsl`. [F]
- Siblings: domainforge-lsp @ semantic-adapter (1e35f0c, Oct 4) real but pinned core =0.19.0 (pre-world_ref); domainforge-vsc-extension dormant since Feb (pre-0.16 `sea_core` WASM); tree-sitter-sea = 1 commit (Jan). [F]

## gauntlet — release/native-distribution @ 5842777, clean

- Bounded long-horizon harness; frozen content-addressed Reference (`.gauntlet/reference.lock`); budgets (8 rounds/3600s/2M tokens/$25); PostgreSQL required; CLI + OpenTUI workbench TUI; boundary per README:806–830 (SEA-Forge authorizes, RealityTrace binds expectation↔observation, SWE_SEED defines lighter work contract). [F]
- Native distribution **settled pending operator merge**: PR #7, package run 8 (40959948193) all five jobs green; aarch64 tarball byte-identical across runs 7/8; artifacts are CI artifacts only — no `gauntlet-v*` tag executed; not installed on this host (only a local `target/release` build). gauntlet-arch-tests 261/261. [F]
- gauntlet-game-studio: separate browser-native 3D game pipeline product (Koota/Three.js/Rapier), dormant since 2026-10-10; own `@gauntlet/runtime`, not the Rust harness. [F]

## sxr (RealityTrace) — feat/native-binary-distribution @ c239d5c, 1 dirty (opencode.json schema line)

- Engine "Semantic Exhaust Runtime": CEP-0008 validation, 26 record kinds, SHA-256 chain, threshold evaluator, SQLite ledger (STRICT, flock, transactional outbox, CAS `cas://sha256:`), G_declared/G_observed projections, FTS5; crates sxr-core/-ledger/-git/-df(pins domainforge 0.21.2)/-verify/-cli (`realitytrace`). Three-branch comparison; `settled_with_debt`, `observed_undeclared` tracked. RT-1 = Horizon SPEC-CR-002 verifier-timing requirement (commands.rs:1021, test command_verifier.rs:238). E8 `evidence_recorded` w/ `source_agent: sea-forge`; Cognate correlation ids via record `extensions`. Daemon Unix-only. [F]
- Distribution: PR #12 merged to origin/main (4d154b1) — local branch 2 behind; 8 assets w/ SHA-256 table; 13-check per-platform smoke incl. tamper-rejected + missing-ledger-fails-closed; **no release tag cut**. Installed: `~/.cargo/bin/realitytrace` 0.3.0 + root-owned gateway copy. [F]
- Status gaps recorded in-repo: no artifact published to any release; `real_domainforge_materializes_large_cas_carried_representation` untested; Windows DomainForge coverage absent; 7 pre-existing sxr-ledger Unix durability failures documented (not silenced). [F]

## SWE_SEED — feat/native-distribution @ dac8eb7, 1 dirty (jollimemory log)

- Software-work verification harness + capability-governance layer: routing/context-plan/trace lifecycle/`gate --verify` with Ed25519 two-phase ledger anchors (tamper-forging test requires gate FAIL); `.agent-harness/` canonical memory; federation hashing "exactly as Context Kernel does". Role: defines the work/proof contract between CK and SEA-Forge; external settlement-authority transport for SEA-Forge. [F]
- Native candidate workflow added 2026-10-31 (5-platform matrix, candidate-only permissions); `scripts/native-smoke.sh` (fresh-dir init/route/trace/gate incl. `--tamper`). **No green packaging run recorded** — one step behind gauntlet/sxr. Windows .exe and macOS .pkg/.dmg not yet produced. Last full test evidence: 158 tests green 2026-06-29 + later targeted proofs. [F]

## Context_Kernel — main @ 36bd8c8, 1 dirty (deleted telemetry queue)

- 21-crate Rust workspace, v0.1.0, single binary; SQLite+FTS5; MCP tools over stdio JSON-RPC + optional SSE (axum, bearer-gated): `store_context`, `recall_context`, `ingest_source`, `query_reference`, `resolve_reference`, `context_required` (→ CEP `godspeed.context_bundle`), `ingest_context_effects`. **No RuVector/zvec here.** github/web adapters implemented+tested but not composed into the binary. 302 test fns; last green [U] (CI remote). [F]
- Horizon consumes: spawns `context-kernal serve`, raw `tools/call` lines, **no MCP initialize handshake**, SIGKILL per request; 8-outcome closed set; corpus scope pinned client-side; -32001/-32003 → denied. [F]

## cep — profiles/context-bundle @ d7591c1 (content-equivalent to main's squash of it), 1 dirty (untracked OBSERVED_DEBT)

- Spec/schemas/benchmarks home (no runtime): 8 godspeed envelope schemas; `godspeed.context_bundle` semantics (complete/partial/none; "partial retrieval is never complete") in spec/profiles/GODSPEED-PROFILES-v1.md:43,59; validators in Py/Rust/TS + conformance corpus. **Debt: `content_hash`/`semantic_hash` have no algorithm/canonicalization outside DomainForge's 11-field digest — producers emit unverifiable hashes.** [F]

## godspeed_agent — migration/cep-world-required-evidence @ 4bfed12 (unmerged since 2026-10-05), 2 dirty (fixture timestamp churn)

- Predecessor controller: 1,131 tests / 2 skipped at CURRENT_STATE Stage 9. Developmental rules (T17 source): `agents/*.md` (navigator/evaluator/metabolizer/absorber/disintegrator/calibration_operator), `policies/generated/agenttrove_harness_policies.yaml` (evidence-mined, e.g. require_reflection_after_repeated_tool_errors, 100 traces), `godspeed_nav/developmental_{memory,events}.py`, `agentic_capability_loop/learning_proposals.py`. ML research (T21 source): `godspeed_nav/ml.py`, `scripts/settlement_datasets/run_v006..008`, calibration pipeline, `evals/agenttrove`, last settlement v008 SETTLED (held-out macro ROC-AUC 0.6013/0.6602/0.6370). **RuVector bridge lives here** (`godspeed_nav/ruvector_bridge.py` + `tools/ruvector/search_memory.cjs`). E2E world loop E1→E8 (`tests/test_e2e_world_loop.py`) driven by sea-rs `scripts/e2e-world-loop.sh`; refuses `world_ref_drift`/`world_ref_missing`. [F]

## godspeed-readiness — main @ ae90607

- `gsr` CLI, 31 YAML scenarios; evidence/REPORT.md: **local_operator GO 30/30 at 2026-10-25 heads**; shared_remote WITHHELD (identity gaps), hosted NOT SUPPORTED (license). Pinned heads vs 2026-11-04 actuals: all 8 product heads moved forward; cognate NOT an ancestor (history rewrite); cep content-equivalent/different hash. Per its own rule ("only evidence at currently pinned revisions counts") the GO is currently invalid for every live head. [F]

## Horizon — horizon-cockpit-projection-review @ 18f0c40 (48 commits ahead of origin/main 3a71fd2), 2 untracked reports

- T00–T10 settled with preregs+evidence; T11 next (P3, fresh independent adversarial); gate-t11..22 fail-closed stubs. Spec 1.2.0 (2026-11-02, REQ-SEC-006 WebAuthn). 105 requirements; REQ-NAV-008..013 not implemented (J02r2 gate exists, no recorded pass). Boundaries checker rejects donor servers/competing model dirs/layer violations; per-task mutation teeth. Three transports one surface (OpenTUI sequential; React 19 server-rendered workspace, no client bundle; phone remote w/ WebAuthn+QR+SSE). Product Actualizer = vocabulary donor only (Apache-2.0, c9df8d2, docs/donors.md). Live: J02-live vs real sea-forge-server; full suite 466/0 at ad1b139. Worktrees: Horizon-settlement-gate (SPEC-CR-003 @ 8894d6d), horizon-settlement-gate (implementation a2d98ff), approval-test checkout, gsr-heads snapshot. [F]

## Not inspected (out of core scope, noted for completeness)

`glengarry`, `gs-term`, `NeatCode`, `ponytail`, `replica-skill`, `godspeed-compass`/`growth`/`readiness-supporting repos`, legacy pre-SEA repos (`SEA`, `NewSea`, `XSEA`, `godspeed`, `hermes-agent-sea-forge`, `zeroclaw-sea-forge`). None appeared as a dependency of any core product in the manifests examined. [F]/[I]
