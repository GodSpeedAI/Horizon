# 05 · Decision Register

Only decisions that materially require owner judgment. Each is decision-ready: evidence, alternatives, recommendation, and what changes depending on the answer. Ordinary technical facts were resolved by investigation (see `01`/`07`).

---

## D1 · Which Cognate repo owns the approval contract surface? *(blocks M-1, M-2, and the inbox's live verification)*

- **Evidence:** Workbench exports `governance.approvals.list/.resolve` (`src/capabilities/governance.ts:12-13`); the Cognate SDK exports neither, only calls `authority_approvals` internally (`packages/runtime-bun/src/sea-forge-authority.ts:416`). Horizon hand-copies Workbench's `seaForgeCall` (`src/adapters/sea-forge-approvals.ts:10`). Brief v3 Blocker 1; unresolved since 2026-11-01.
- **Options:**
  - **(a) Cognate SDK exports it (recommended).** The SDK already owns governance integration; both fronts consume one typed contract; INV-2 satisfied for approvals. Cost: small SDK release (0.8.1) + both consumers migrate.
  - (b) Workbench is the target; Horizon consumes Workbench capabilities. Cost: couples the operations product to a coding harness process — wrong direction of dependency.
- **What changes:** (a) unblocks deleting Horizon's raw-socket adapters and the typed-approval-id fix in one move; (b) freezes Horizon's INV-2 debt indefinitely.

## D2 · Settlement-approval-gate sequencing: SPEC-CR-003 → PR #14 merge, or the reverse?

- **Evidence:** SPEC-CR-003 candidate revised 2026-11-03 in worktree (`Horizon-settlement-gate` @ 8894d6d); implementation already written on `settlement-external-approval-gate` (a2d98ff, +21 lines policy renderer); live roundtrip runbook prepared-not-run; sea-rs side needs ≥ 09c2541b deployed to the protected gateway; 48-commit cockpit branch (PR #14) open against main.
- **Options:**
  - **(a) Freeze SPEC-CR-003, run the live roundtrip, then merge PR #14 including the gate (recommended).** The runbook already exists; owner runs the redeploy steps; merging first risks landing a policy whose live behavior is unproven.
  - (b) Merge PR #14 now, gate lands as a second PR. Faster merge cadence; risks the approval-gate drifting from sea-rs's still-moving settlement branches (PR 84 open).
- **What changes:** (a) makes the whole 48-commit branch's settlement claims live-proven at merge time; (b) accepts a second verification cycle.

## D3 · Horizon's execution-ledger governance: fold the production-readiness classes into the plan DAG, or re-freeze the plan to point at them?

- **Evidence:** T-1. Plan says T11 next; the actual work is P1–P8 + brief v3 staging; gate-t11..22 stubs will contradict the cockpit branch's settlement work. Horizon's own contract requires plan rebinds on meaning changes; the cockpit branch *is* a meaning change to "what is being settled."
- **Options:** (a) amend plan: map P-classes onto T11+/T23+ tasks with preregs per task (**recommended** — keeps one ruler); (b) declare the production-readiness plan the active plan and let the DAG trail (cheap now, two-ledgers problem compounds); (c) revert to strict T-order (rejects real, good work).
- **What changes:** determines whether "settled" continues to mean preregistered+evidenced+independently confirmed for the cockpit work, or only for the older tasks.

## D4 · SEA-Forge settlement branch landing order and reviewer

- **Evidence:** T-4. Three lineages (PR 84 claim-lease, active Nov 3–4; resume-lease +509; approval-gate +4,280) over already-squashed #76–#81; 0.4.0 release PR open; CodeRabbit Majors on PR #80 unaddressed in-repo.
- **Recommendation:** PR 84 → resume-lease → approval-gate → 0.4.0 tag → deploy to gateway → run Horizon's roundtrip runbook as the joint live proof. One owner-designated reviewer for the sequence (they overlap heavily); anything else diverges again.
- **What changes:** if approval-gate lands first, the Horizon-side gate (a2d98ff) can be proven sooner but against an un-converged kernel.

## D5 · Gauntlet's posture for the Horizon product: optional engine now, or first-class + keep PostgreSQL?

- **Evidence:** direct actions already bypass Gauntlet by design (AGENTS.md §9); Gauntlet requires PostgreSQL, is untagged, and is not installed on this host; Horizon P5 keeps Gauntlet read-only. Gauntlet's own loop is green and its discipline (frozen Reference, budgets) is what T12/J03 would need for long-horizon build work.
- **Options:** (a) **optional engine (recommended)** — Horizon doesn't require it until J03/T12; defer the PostgreSQL decision to when Gauntlet is actually on a product path (possibly sqlite-backed state backend by then); (b) first-class now — adds an install + ops burden to every deployment for capability no current journey uses.
- **What changes:** (a) keeps the composed install at three components; (b) grows it to four and adds a database to operate.

## D6 · godspeed_agent disposition: extract-and-retire now (T17/T21), or keep warm?

- **Evidence:** T-5. Unmerged month-old branch; 1,131 tests; developmental policies + ML pipeline + RuVector bridge live only here; Horizon gates fail closed; e2e world loop is the only whole-stack world_ref chain test and is *driven by sea-rs*.
- **Recommendation:** land the migration branch as-is (it is a prerequisite for T17/T21 extraction regardless), then extract: developmental rules → Horizon T17; ML pipeline → T21 research subsystem; RuVector bridge → fold into T21 or Context Kernel's vector adapter, then archive the repo. Keep the e2e world-loop script as a readiness scenario.
- **What changes:** determines when J06/Develop stops being 🔴 and whether RuVector survives as a named product in the README stack table (currently it overstates — it is a bridge inside the predecessor).

## D7 · Dormant tooling disposition: domainforge-lsp, tree-sitter-sea, vsc-extension, sea-rs UIs

- **Evidence:** T-11, T-12. LSP pinned 0.19.0 (fails world_ref APIs); tree-sitter = 1 commit; vsc extension dormant 9 months on pre-0.16 names; sea-rs `workbench/` renderer has no backend bridge; `apps/godspeed-cognitive-ui` role unclear.
- **Recommendation:** archive tree-sitter + vsc-extension explicitly; decide LSP at the time editor support becomes a journey goal (not now); delete/archive sea-rs UIs after the consumption check (R-1).
- **What changes:** mostly hygiene; the material part is R-1 (kernel repo should not own product surfaces).

## D8 · Horizon ↔ Workbench convergence level for identity + design system

- **Evidence:** T-8, T-9; P8 scoped Workbench `DESIGN.md`/`PRODUCT.md` as donors "as a decision, not a copy"; shared-identity work stranded (f4d4db6 unpushed after the Cognate history rewrite).
- **Options:** (a) **shared mechanisms, separate products (recommended)** — land shared identity in Cognate (after push-safety check vs the rewritten history), adopt Workbench design tokens + card state patterns under Horizon's spec-compatibility check; (b) full visual convergence — premature; different users; (c) no convergence — three identity systems and two design systems persist.
- **What changes:** (a) makes "approve the same request from either front" coherent and halves the P8 work.

---

### Explicitly *not* escalated (resolvable without the owner)

Workbench's 40 dirty screenshots (leave untouched), readiness re-run timing (follows D2/D4 convergence — it is the confirmation vehicle), CEP hash algorithm choice (spec work, propose in C-4), Context Kernel adapter pattern (M-5, engineering), stale AGENTS.md spec references (P6.1, mechanical).
