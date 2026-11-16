# 02 · Drift and Structural Tension Report

Ordered by how much each would change the work if ignored. **[F]** observed · **[I]** inference · **[U]** unknown.

## Governance and evidence drift

**T-1. Horizon runs on two diverging execution ledgers.** The plan DAG says "next ready task T11" (status rev 32), but 48 commits on `horizon-cockpit-projection-review` execute a *different* plan: the production-readiness classes P1–P8 (`2026-11-02-production-readiness-plan.md`) and cockpit brief v3. Neither the P-classes nor the cockpit branch's settlement/approval/inbox/identity work has T-task IDs, preregistrations, or evidence directories (`.agents/evidence/horizon/` stops at T10; no T11 dir). Meanwhile SPEC-CR-003 and the settlement-external-approval-gate implementation live only in worktrees. **[F]** This is not yet dishonest — CURRENT_STATUS rev 32 explicitly frames the branch work as separate — but the DAG is no longer the map of what is being built, and gate-t11..t22 stubs will contradict the cockpit branch's actual settlement work when reached. **[I]**

**T-2. The whole-stack GO evidence is stale by its own rule.** godspeed-readiness recorded local_operator GO 30/30 at 2026-10-25 heads; every product head has since moved (8 cleanly forward; cognate off-history after its history rewrite; cep content-equivalent-but-different hash). REPORT.md's own rule: "only evidence at the currently pinned revisions counts." **[F]** There is currently **no valid whole-stack conformance evidence for any current head pair.**

**T-3. Horizon's own operating contract is stale.** Root `AGENTS.md` says the spec is frozen at 1.0.1 and T00 must verify that hash; actual spec is 1.2.0 (frozen 2026-11-02). Recorded as P6.1 with four more stale 1.0.1 references. **[F]**

**T-4. Settlement correctness work is spread across three competing sea-rs lineages.** `settlement-approval-gate` (21 commits, +4,280), `fix/settlement-resume-lease` (+509), `fix/server-ambiguous-declare-keeps-lease` (PR 84, active Nov 3–4), plus already-squashed #76–#81 on main, plus Horizon-side SPEC-CR-003 and gateway policy. The live roundtrip runbook that would prove the merged result is "prepared, not run," and CodeRabbit flagged two open Majors on PR #80 (`verify_one` doesn't recompute `declaration_hash`; concurrent-resume claim reconciliation). **[F]** Risk: lineages diverge faster than they land; local sea-rs main is already 8 behind origin/main.

**T-5. godspeed_agent's migration branch has been unmerged for a month** (2026-10-05, 1,131 tests, CEP-0008 world-ref gating) while its consumers moved to 0.21.x/0.8.0 worlds. Horizon T17/T21 (developmental rules, ML research subsystem) are unbuilt fail-closed gates. **[F]**

## Duplication and boundary tension

**T-6. Two Cognates disagree about the approval contract.** Workbench exports `governance.approvals.list` / `governance.approval.resolve` capabilities; the Cognate SDK repo exports neither — it only calls `authority_approvals` internally. Horizon mirrors Workbench's `seaForgeCall` by hand (`src/adapters/sea-forge-approvals.ts:10`) because the SDK exports none. Brief v3 flags this as Blocker 1 and it still has no recorded owner decision. **[F]**

**T-7. Three approval shapes on one wire.** The live list row (`ApprovalStanding::to_json`, sea-rs `cep.rs:727-741`: `approval_id/state/requester/world_ref/.../resolved_by`) vs `PendingApproval.schema.json` (`case_id/run_id/decision_id/criteria_ref/...`, no `state`) vs consumers reading different fields (Cognate reads `state`, Horizon reads `resolved_by`). Brief v3 Major 9/10; unresolved. **[F]**

**T-8. Two parallel operator UIs for the same governance vocabulary.** Horizon's approval inbox / settlement stages vs Workbench's `GovernanceApprovalCard` / `SettlementCard` / `GovernancePane`. Same domain (approve/deny/escalate/settle), separate codebases, separate design systems, deliberately no shared code. P5.2/P8 defer the convergence decision. **[F]** This is justified *for now* (different users: organizational operator vs accountable coding-agent operator) but the identity layer is about to fork too (see T-9). **[I]**

**T-9. Shared operator identity is stranded in a worktree.** `cognate-identity-wt` holds `horizon/shared-identity` @ f4d4db6 (shared operator identity, pairing, WebAuthn contract; 2 commits atop cognate HEAD) — unpushed, because Cognate origin history was rewritten and the push-safety check hasn't been done (P4.1). Meanwhile Horizon shipped its own WebAuthn/identity-store in spec 1.2.0, and Workbench has its own single-operator authenticator. **[F]**

**T-10. Horizon's authority reads bypass Cognate more widely than the invariant admits.** Beyond the two adapters named in P3.1, `app.ts:913` (`authority_approvals`) and `app.ts:678` (`authority_closure`) make raw-socket calls (brief v3 Major 8). The RealityTrace economics adapter is a CLI spawn blocked upstream (token fields missing from ledger export). **[F]**

**T-11. sea-rs carries three UI programs of its own** — `workbench/` (Bun/React renderer with **no backend bridge since Tauri removal**, per OBSERVED_DEBT), `apps/godspeed-cognitive-ui` (TS), and gauntlet's separate `gauntlet-workbench` TUI — none of which are the product fronts (Horizon, Workbench). **[F]** Architectural overpayment unless one of them is the intended operator surface for SEA-Forge itself. **[I]**

**T-12. Grammar quadruplication around `.sea`.** Canonical pest grammar (CI-gated) + tree-sitter PoC (1 commit, Jan) + VS Code TextMate extension (dormant 9 months, references pre-0.16 `sea_core`) + domainforge-lsp pinned to core **0.19.0** (two minors stale, pre-world_ref). Only the pest grammar is alive. **[F]**

**T-13. Version skew across the world_ref chain.** DomainForge published 0.21.2; Cognate's `cognate-domainforge` 0.8.0 pins `@godspeedai/domainforge` **0.21.1** (so Horizon's vendored path verifies worlds against a one-minor-old compiler); sxr pins 0.21.2; domainforge-lsp pins 0.19.0. No recorded reason the adapter lags. **[F]**

## Product/substrate gaps

**T-14. The payment/settlement half of the Operate journey is specified but unimplemented, and its atomicity has a known defect.** REQ-NAV-008..013 unfrozen→unimplemented; terminal accounting is non-atomic (two commits in `pending-intent.ts:124-127`; up to three writes in `app.ts:702-703`); stuck `awaiting_authority` holds have no reclaim/TTL; capacity move to Cognate would break reserve+pending-record single-commit atomicity (brief v3 Blockers 2–4). **[F]**

**T-15. Approval identity is asserted by configuration, not verified at the boundary** (brief v3 Blocker 7): resolve carries no `decision_id`/`criteria_sha256`, staleness reads Cognate's cache not SEA-Forge live state; under `local_operator` service and operator share a uid. Partially addressed by commit 18f0c40 (refuse self-approval when identity unknown) but the boundary check design is still open. **[F]**

**T-16. Context Kernel integration spawns and SIGKILLs a process per request** (Horizon adapter, no MCP handshake, one-line-out/one-line-back). Deliberately minimal and fail-closed, but O(process-spawn) per citation and brittle against CK's SSE/MCP surface. **[F]**

**T-17. "Case" means three different things** (Horizon record w/ no lifecycle; SEA-Forge `CaseHorizon` states; Cognate proposed cross-stack case) and the glossary already forbids one of them (cases "do not mint identity"). Brief v3 Major 13; glossary fix is cheap and blocks the Stage-5 case binding. **[F]**

**T-18. CEP hash debt undermines cross-system verification in principle:** `content_hash`/`semantic_hash` have no algorithm/canonicalization outside DomainForge's 11-field digest, so producers emit unverifiable hashes (cep OBSERVED_DEBT, untracked). **[F]**

**T-19. Installation is an operator runbook, not a product path.** Horizon gateway deploy needs owner-run sudo/systemd steps; Gauntlet requires PostgreSQL and isn't installed; SWE_SEED packaging hasn't run green; sxr formal release tag not cut; sea-forge 0.4.0 release PR open. The "installable finished product" goal currently has exactly one deployable vertical (Horizon gateway + protected SEA-Forge + RealityTrace binary) and it depends on owner hands. **[F]**

## EGM-specific

**T-EGM-1. Nothing ranges over EGM trees mechanically** (Cognate status rev 75 admits it; sea-rs fixes were a one-time pass; Horizon's 48-commit branch isn't reflected in its EGM.md). Drift reports are point-in-time, not gates. **[F]**

**T-EGM-2. The theory and design sources exist locally but were initially missed by this recon (now read and incorporated):** CognitiveOS Manifesto **v17** (`godspeed-growth/world/cognitive_os_manifesto_v17.md`, 1,367 lines, status *unfrozen*), CognitiveOS Mathematical Specification Layer **v2.3** (`godspeed-growth/world/cognitiveos_math_layer_v2_3.md`), and the **Horizon Master UI Specification v1.0** (`Horizon/.tmp/Horizon_Master_UI_Spec_v1_0.md`, dated 2026-11-04, design-only, self-described as subordinate to source contracts). The `godspeed-growth/world/` directory also holds the strategic/theory set (developmental cybernetics manifesto, ADE/DE SOPs, governed structural revision theory, transformation-route measurement theory). "Unfrozen" manifesto vs frozen product specs is by design (source representation projects downward), not a defect. **[F]**

**T-EGM-3. Theory-version drift inside the UI spec's own register.** The Master UI Spec §15 cites "CognitiveOS Manifesto **v13.1** and Mathematical Specification v2.3" as its theory grounding, but the workspace's canonical manifesto is **v17** — four versions of theory movement not reflected in the design contract that projects it. Harmless today (the UI spec's invariants survive v17) but the citation should be rebased when the spec is next revised. **[F]**

**T-EGM-4. The operative UI design contract is unversioned and at risk.** The Master UI Spec — now the presentation-side roadmap (phases 0–6, verification matrix, A–E work-scope gate, UI-01..20 decision register) — lives in `Horizon/.tmp/`, which is **gitignored** (`CURRENT_STATUS.md:26-27`). A design contract this load-bearing should be committed (e.g. `docs/` or `.agents/reports/`) with its donor/provenance register intact. **[F]** **[P]** Recommend the owner commit it; it explicitly grants no implementation permission, so committing changes nothing operationally.

## Non-issues checked and cleared (avoid re-litigating)

- Cognate history rewrite: backup bundle `cognate-all-refs-2026-10-26.bundle` (229 MB) exists; gsr-heads snapshots present. Residual risk is only push-safety for `horizon/shared-identity` (T-9). **[F]**
- sea-rs `unimplemented!()` hits are test-only delegation stubs. `postgres.rs` is a real SEC-05 workload, not dead code. **[F]**
- DomainForge EGM drift is one small commit; no regen needed. **[F]**
- Workbench's 48 dirty files are 40 regenerated evidence PNGs + untracked release packages — no source in flight. **[F]**
