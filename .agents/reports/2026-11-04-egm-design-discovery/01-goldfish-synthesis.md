# 01 · Goldfish Synthesis — six-lens review of the Essential Design Hypothesis

Synthesizer: the Elephant (session context). Raw reviewer reports: `reviewers/01..06-*.md`. Lens attributions: **[D]** egm-design · **[C]** codebase-details · **[Z]** zoom-out · **[M]** comprehension · **[R]** implementation-readiness · **[S]** structural. Sections: convergent findings → accepted corrections (my hypothesis was wrong) → new material findings → contested findings (with my position) → what survived.

Per EGM discipline: reviewer agreement is not verification. Where a reviewer claim is checkable, it is marked **verified** (source citation) or **contested** (my counter-evidence). Same-model fresh-context agents are adversarial reviewers, not independent implementers; P3-style independent confirmation still requires the owner's separate process.

## A. Convergent findings (multiple lenses, independently)

**G-1. "Cognate as the only process speaking to authorities" is the right goal stated the wrong way — and the fix is typed methods, not a raw export.** [D][M][R][S] Four lenses converge: the ruler sentence is undecidable as written (M B2, ambiguity 1); M-1's scope misses `authority_closure`/`authority_approvals` raw calls (D F1, R Major 2); and the correct mechanism is adding `listApprovals`/`resolveApproval` (+ a closure read) to the existing hardened `SeaForgeAuthority` client — which already has busy-retry backoff and a 256 KB response cap that both hand-rolled `seaForgeCall` copies lack (S A-4, verified at `cognate/packages/runtime-bun/src/sea-forge-authority.ts:313`; copies at `Horizon/src/adapters/sea-forge-approvals.ts:110`, `cognate-workbench/src/capabilities/governance.ts:56`). **Accepted — M-1 is re-specified** (mechanism + scope + the INV-2 reading must be picked by the owner; see adjudication A-2).

**G-2. The v1 shippable perimeter excludes Gauntlet and SWE-seed-settlement.** [D F7][Z A3][R Minor 2/D] Three lenses independently reach this; the hypothesis's own responsibility table already says Gauntlet is "not required per-commit." SWE_SEED's genuine live role is settlement transport on the *Workbench/software-work path* — which matters for A-1 (portfolio) below. **Accepted; becomes adjudication A-5.**

**G-3. Version skew (DomainForge 0.21.1 vs 0.21.2) is a missing *equivalence proof*, not a pin bump.** [R Major 1][S A-6] The system's real compatibility ruler is world_ref equality; no corpus-equivalence gate exists. Cheap, mechanical (the identity chain makes it a test), must-verify before any cross-repo release claim. **Accepted — new completion item C-2a.**

**G-4. The live roundtrip runbook should run NOW, not after SDK work.** [R Blocker 3 / Alt 1] Evidence-first ordering: de-risks the runbook and surfaces merge failures while the three sea-rs lineages are still separable. **Accepted — restaged as Stage 0 evidence work.**

**G-5. Install needs profiles and a mechanism, not tags.** [R Blocker 1] Two profiles: single-operator local (user units, zero sudo) vs small-team server (one-command digest-pinned). The two-account protected-socket hardening is a multi-account feature and must not tax the local profile. **Accepted — C-6 re-specified.**

**G-6. Readiness must pin to release *tags*, not heads.** [R Major 5][Z A5] Otherwise T-2 (stale GO) recreates itself every commit; the tagged readiness run doubles as the P3 independent confirmation. **Accepted.**

**G-7. The theory-consistency paragraph overclaims.** [D B-4][M B10][Z A7] Unfrozen manifesto, v13.1-vs-v17 citation drift, unversioned UI spec. **Accepted — downgraded to "theory-consistent at weak strength, caveats inline" in the revised brief.**

## B. Accepted corrections — the hypothesis (and the recon bundle) were verifiably wrong

**W-1. M-4 was already implemented at the HEAD under review.** [C B1, verified; D F5 independently] Terminal-accounting atomicity + startup reconcile landed 2026-11-02 (commit 087fecc; `test/pending-terminal-atomic.test.ts`, 7 tests). Worse: the landed `pending-reconcile.ts:3-5` *deliberately refuses* reclaiming `awaiting_authority` holds (a late approval must find its capacity for once-only resume) — my M-4 as written would have broken resume. M-4 becomes "ratify or amend the landed hold policy," and distillation `02` T-14 is corrected: the non-atomicity defect is fixed at HEAD; the open item is hold-policy *documentation*, not code.

**W-2. C-2 was mostly build-work already done.** [C #18, verified] Payment capacity + IS7 settlement implemented on the branch (aaa6164, f434a2f; `payment-capacity.test.ts` 17 tests). The genuinely missing piece is a **recorded live J02r2 pass**. C-2 shrinks from "implement the spec half" to "prove the implemented half live" — which changes sequencing economics substantially.

**W-3. T-15 overstated the boundary's weakness.** [C #15, verified] SEA-Forge *does* enforce at the boundary: verified socket identity (`sea-forge-server/src/lib.rs:2697-2699`), Pending-state requirement (`cep.rs:1184-1189`), expiry, and hard-coded `requester != resolver` (`lib.rs:2977-2978`, PR #76). Residual gaps: resolve carries no `decision_id`/`criteria_sha256` (view-binding), and `local_operator` uid-sharing. This narrows M-2's motivation from "safety" to "view-binding" — and reframes operator identity as the real allocation question (G-9 below).

**W-4. Brief-v3-derived line citations in the recon bundle are systematically stale.** [C B4] app.ts:913/678 → 1011/776; model.ts:741 → `sea-forge-approvals.ts:14-15`; cep.rs:727-741 → ~721-737; governed-operation.ts:16 → 12. The distillation bundle's `07` dossiers carry these anchors; corrected numbers recorded here; **any action item must re-verify its anchor before work starts.**

**W-5. The recon's "three approval shapes" framing was wrong in an important way.** [S A-1, verified] See new finding N-1 — this is simultaneously a correction and the review's most consequential discovery.

## C. New material findings (not in the hypothesis)

**N-1. There are two approval *concepts*, not one concept with three shapes.** [S A-1, verified] `ApprovalStanding` (authority crate — escalation standing) and `PendingApproval` (sfwp::approvals — case-plan human task, generated schema consumed by casework-go) are different server subsystems that happen to share a name. M-2 as written would delete a live concept. Requires an owner semantics decision before any wire reconciliation. **→ adjudication A-3.**

**N-2. R-1 is coupled: the SFWP schema home lives inside the renderer slated for deletion, and cognitive-ui/casework-go are a live pair.** [S A-2, verified] Resolution sequence: move contracts generation to a sea-rs top-level `contracts/` (provable-safe, byte-diff testable) → delete renderer → decide the pair as a pair. **→ folded into adjudication A-5/A-6.**

**N-3. The identity fork already landed, three ways.** [S A-3, verified] Horizon's shipped `src/remote/{webauthn,pairing,cbor}.ts` (spec 1.2.0), Workbench's dev authenticator, and the SDK's unpushed `packages/identity` (1,463 lines, tested, consumer-agnostic — verified zero horizon/workbench references [C #10]). Reconciliation implicates frozen spec 1.2.0. **→ adjudication A-4.**

**N-4. Undisclosed duplication: two RealityTrace CLI clients + env contract in three places.** [S A-5, verified] Horizon already uses the SDK's `createSxrCliPort`; Workbench hand-rolls. Small fix, rides M-1.

**N-5. The Operate preflight is structurally unanswerable today.** [D F2, verified] `capability`/`recovery` hardcoded `pass` (`src/adapters/navigation.ts:47-49`, `app.ts:988-990`); authority always `deferred_to_invocation` ("SEA-Forge has no evaluate-only preview", `app.ts:983`); SFWP dry-run exists only for case plans. The UI spec's seven-gate preflight (INV-2) needs either an SFWP evaluate-only verb (semantic revision) or an honest "authority: decided at invocation" presentation. **→ adjudication A-7.**

**N-6. The Work composition has no session runtime and the hypothesis never noticed it was promising one.** [D F3][Z A2] Horizon has no agent-session mechanism; UI spec §7/Phase 3 assumes one. Options: typed cross-product handoff v1 (near-zero cost, honest unavailable), or a session facade (new architecture). **→ adjudication A-8 (bound to A-1).**

**N-7. The demand-side blocker: no real organizational world is connected anywhere.** [Z A1] Every completion item perfects a machine that governs a fixture world; the one real consequential-work domain available today is GodSpeed's own software development (the Workbench path). This is the strongest challenge to the whole framing and is deliberately escalated, not absorbed. **→ adjudication A-1.**

**N-8. godspeed_agent's E1→E8 world-loop test must be re-homed before archive.** [S C-5] It is the only whole-chain world_ref proof. R-3 amended.

**N-9. Cognate has 7 zero-external-consumer packages eligible to fold.** [S C-1] `a2a, agent-discovery, cognitive-ruvector, cognitive-rvf, mcp, provider-openai-oauth, provider-typesafe`. Optional hygiene, rides the 0.9.x release.

**N-10. Vendored-tgz set is already rotting** (stale 0.7.0 tarballs beside 0.8.0 in `Horizon/.cognate/vendor/`). [S A-7] Symptom of the vendoring policy; de-vendoring (M-1 adoption) is the cure.

## D. Contested findings — where I dispute the reviewers

**X-1. [Z B / C-1] "The hypothesis is architecture-preserving because self-review preserves architecture" — partially disputed.** The zoom-out lens's demand-side analysis (N-7) is correct and escalated. But its counter-reading ("spine + one front + one real source, everything else frozen") and my hypothesis differ less than the reviewer claims once W-2 is absorbed: with C-2 shrinking to proof-work, the completion program is *already* mostly evidence-work, not build-work. Where I concede: the hypothesis never considered front-level portfolio alternatives (Z A6) — that was a real blind spot, now adjudication A-1. Where I hold: "ownership topology correct" survived verification by the source-checking lens on every seam it named (C net verdict); the reviewers' own structural lens concurs ("the authority topology *is* defensible — I concur with the load-bearing claim", S bottom line).

**X-2. [D Alt 2] "Affordability must move to SEA-Forge (estate-wide fail-closed)" — disputed on scope evidence.** AGENTS.md §10 is *Horizon's* operating contract; its fail-closed affordability clause binds Horizon, not the estate. Design F6's "estate-wide in intent" reading is the reviewer's extension, not the document's text. Per-front affordability for v1 is compliant as written. The `AffordabilityProvider` idea is retained as a post-v1 option (it is the honest end-state if a second front starts consequential spending) — but it is not a present defect. **Contested; owner may override.**

**X-3. [D B-4 / Z A7 / M B10] "Drop the theory-consistency paragraph entirely" — partially disputed.** Downgraded and caveated (G-7), not dropped: the manifesto's governing question genuinely is the general form of the capability list, and that kinship is cheap orientation for future readers. But it is weak evidence for the *architecture*, and the revised brief says so.

**X-4. [R Major 3] "Workbench adoption is a second product's release and must not gate Horizon" — accepted with a nuance.** Correct as a gating rule. But if the owner chooses the dogfood path (A-1 option b), Workbench *is* the product and its adoption is on the critical path by definition. The rule is conditional on A-1, not absolute.

## E. What survived review

1. The load-bearing claim — **the authority topology (who owns what) is correct; the defects are seams, duplication, and missing proofs** — survived the source-verification lens on every seam it checked, and the structural lens explicitly concurred. The zoom-out lens's challenge is to the *portfolio above* the topology, not the topology itself.
2. M-1 (Cognate owns the authority client + identity) and M-2 (approval wire reconciliation) both survived in *intent* and were re-specified in *mechanism* (G-1, N-1).
3. The retirement list survived with amendments (N-2 contracts-home coupling, N-8 E2E re-homing).
4. The rejection table (settlement-into-RealityTrace, SWE_SEED-into-Gauntlet, capacity-moves-now, generic framework, GUI-first) survived unchallenged on the merits.
5. What did **not** survive: the work ledger's accuracy (W-1/W-2), T-14/T-15 framing (W-1/W-3), M-2's concept model (N-1), M-1's mechanism (G-1), the §5 ruler sentence (comprehension B1/B5 fixes), and the absence of portfolio-level alternatives (N-7 → A-1).
