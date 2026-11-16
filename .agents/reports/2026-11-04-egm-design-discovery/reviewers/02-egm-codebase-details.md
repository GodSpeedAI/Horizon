# Goldfish Review — egm-codebase-details lens (raw, as returned)

Fresh-context reviewer, dispatched 2026-11-04 per `egm-brainstorm` Step 2. Charge: verify load-bearing claims against source; find what the recon missed. Unedited except for this header.

---

## (A) Verified / corrected claims

| # | Claim (source) | Verdict | Evidence |
|---|---|---|---|
| 1 | Authority reads bypass Cognate at `app.ts:913` / `:678` (T-10) | **Substance verified, lines wrong** | Raw `seaForgeCall` at `/home/sprime01/projects/Horizon/src/app.ts:1011` (`authority_approvals`) and `:776` (`authority_closure`); ~98-line drift, likely cited from brief v3 |
| 2 | Approval regex at `src/ui/workspace/model.ts:741` | **Wrong** | model.ts:741 is the settlement record type; approval-id/actor regexes live at `src/adapters/sea-forge-approvals.ts:14-15` (`ACTOR_ID`, `APPROVAL_ID`) |
| 3 | Non-atomic terminal accounting at `pending-intent.ts:124-127` (T-14, brief v3 Blocker 2) | **Stale/wrong at HEAD** | `terminate` is one `store.commit` (pending-intent.ts:137-146); fixed by 087fecc (2026-11-02, ancestor of HEAD 18f0c40); `test/pending-terminal-atomic.test.ts` (7 tests) exists |
| 4 | Capacity reserve single-commit at `pending-intent.ts:98` | **Verified** | pending record + ledger reservation in one `store.commit` at :98 |
| 5 | surface2 closed grammar | **Verified** | `src/ui/surface2/grammar.ts`: zod `.strict()`, closed 15-block discriminated union (:342, :613), closed op set, `<`/`>` refused in text |
| 6 | `WORKSPACE_REGION_ORDER` pinning | **Verified** | model.ts:20, frozen `fixedRegions()` at :354-359, `owner_pinned` for all but agent region, traced to contract yaml |
| 7 | runtime-bun exports no `seaForgeCall`/approval capabilities | **Verified, with nuance** | `packages/runtime-bun/src/index.ts:9-12` exports `SeaForgeAuthority` (decide/submitEvidence/settle) and an `approvalState(approvalId)` *read* helper (sea-forge-authority.ts:414-416); no resolve verb, no raw `seaForgeCall`, no `authority_closure` |
| 8 | Governance dispositions list | **Verified** | `governed-operation.ts:12`: allow/deny/escalate/unknown/constrained_allow/boundary/degraded |
| 9 | Outbox topic `observation.deliver` | **Verified** | `runtime-bun/src/index.ts:35`, `realitytrace/src/index.ts:7` |
| 10 | Identity worktree is shared, not Horizon-specific | **Verified** | `cognate-identity-wt` f4d4db6 adds `packages/identity` (+1,463 lines: pairing, WebAuthn, service over any DurableStore); zero horizon/workbench references in src; README: "One definition of the operator for Horizon and Workbench" |
| 11 | Workbench `governance.approvals.list/.resolve` (T-6) | **Verified** | `cognate-workbench/src/capabilities/governance.ts:13-14, 125-149`; resolve checks `ctx.actor.kind === "user" && !ctx.runId`, regex id, `on_behalf_of` operator; no eligibility/staleness client-side |
| 12 | Workbench settlement orchestrator duplicates SEA-Forge semantics | **Refuted** | `src/settlement/orchestrator.ts:153-158` delegates to SDK `seaForge.submitEvidence`/`seaForge.settle`; "Workbench never decides the outcome" (:9); it's orchestration glue, as is Horizon's `app.ts:571,637` — duplication is pattern-level |
| 13 | `ApprovalStanding::to_json` fields (T-7) | **Verified** | sea-rs `crates/sea-forge-authority/src/cep.rs:~721-737`: approval_id/state/requester/world_ref/operation_kind/operation_name/resource_id/subject_actor_ref/request_ref/expires_at/resolved_by |
| 14 | `PendingApproval.schema.json` divergence (no `state`) | **Verified** | `sea-rs/workbench/packages/contracts/schema/PendingApproval.schema.json`: case_id/run_id/plan_item_id/decision_id/criteria_*, no state/requester/resolved_by/world_ref. Note: it lives in the `workbench/` tree R-1 proposes to retire |
| 15 | Resolve verifies actor identity/freshness at boundary (T-15) | **Partially corrected** | Boundary DOES: require verified socket identity (`sea-forge-server/src/lib.rs:2697-2699`), require Pending state (cep.rs:1184-1189), enforce expiry (cep.rs standing_in), hard-code `requester != resolver` (`lib.rs:2977-2978` in `matches_approval_resolution_parameters`, landed as #76 "refuse self-resolution"), record refusals. Missing: resolve carries no `decision_id`/`criteria_sha256`, so approver's *view* isn't bound; local_operator uid-sharing remains |
| 16 | 0.4.0 release-please branch vs origin/main | **Verified current** | `origin/release-please--branches--main` 6b4fd7e8 = exactly one version-bump commit atop origin/main 22bf66a3 (0 main commits missing); local main 8 behind, as claimed |
| 17 | Cognate→RealityTrace outbox wire (charge 5) | **Real, not aspirational** | Consumers: Horizon `src/adapters/settlement.ts:88-119` (wired live via `realityTraceFromEnv`, app.ts:334/382, drained in `observe()`), Workbench `src/observations.ts:22-92`, cognate `tests/integration/governed-settlement.live.test.ts`; delivery spawns `realitytrace ingest --extensions` per observation (sxr-cli.ts:133; sxr main.rs:74-75, dedupe by run+verifier) |
| 18 | REQ-NAV-008..013 "specified but not implemented" (01 §3) | **Imprecise** | Implemented on the branch by aaa6164 ("implement payment capacity and IS7 settlement (SPEC-CR-002)", #5) + f434a2f (BM-SETTLE benchmark, #7); `payment-capacity.test.ts` 17 tests, `capacity-ledger-store.test.ts`; missing piece is a recorded live J02r2 pass (opt-in env), not the implementation |

## (B) New material findings

1. **The hypothesis's M-4 is already done at the HEAD it reviews.** Terminal atomicity + startup reconcile landed at 087fecc (Nov 2), two days before the recon. Worse, M-4 prescribes "startup reclaim for `awaiting_authority`", but the landed `pending-reconcile.ts:5-6` *deliberately refuses* that ("never released here (not on age alone); reported as a blocker") — a defensible policy the hypothesis would overwrite without noting the design decision. M-4 needs rewriting from "do it" to "confirm/decide hold policy"; the drift report's T-14 propagates a fixed defect.

2. **The recon's "not implemented" framing of the payment/settlement half understates shipped code.** Since C-2 is billed as "the genuinely missing," its real scope is a recorded live J02r2 roundtrip (plus runbook execution), not implementing capacity semantics — which shifts C-1/C-2 from build-work to proof-work. This matters for sequencing and for what "convergence" costs.

3. **The SDK gap is narrower than M-1 states.** `SeaForgeAuthority` already ships `submitEvidence`, `settle`, and an approval *read* helper. What's actually missing: `authority_approval` (resolve), `authority_closure`, and list-returning approvals — plus the raw `seaForgeCall` export. Small, targeted API surface, which strengthens M-1's feasibility, but the "export seaForgeCall" framing would export an escape hatch (arbitrary verbs) when two typed methods would do; the Horizon adapter needs it only because closure/list aren't typed.

4. **Brief-v3-derived line citations in the recon bundle are systematically stale.** app.ts:913/678 (now 1011/776), model.ts:741 (wrong file), cep.rs:727-741 (now ~721-737), governed-operation.ts:16 (now 12). The recon claims to describe HEAD 18f0c40 but repeats brief v3's pre-087fecc line anchors. Spot-check before any claim is acted on.

## (C) Architectural conclusions — supported / undermined

**Supported:**
- **M-1 (Cognate exports the SEA-Forge client + shared identity):** strongly. Both fronts hand-roll the same glue; `packages/identity` is genuinely consumer-agnostic; the SDK already carries most settlement verbs. M-1 is cheaper than the hypothesis implies.
- **M-2 (approval wire reconciliation):** confirmed three-shape divergence; also note `PendingApproval.schema.json` sits in the R-1 retirement zone, so M-2 and R-1 interact.
- **Alternative rejections:** "merge settlement into RealityTrace" and "keep capacity writes in Horizon for now" both rest on verified code (delegating orchestrators; single-commit reserve at :98).
- **MG-1:** release-please 0.4.0 branch is exactly current with origin/main (includes #76 self-resolution refusal, #81-83 settlement fixes) — cutting 0.4.0 is unblocked.
- **R-1:** nothing on the Horizon/Workbench paths consumes sea-rs `workbench/` contracts (the divergent schema lives there).

**Undermined / needs revision:**
- **M-4** is stale (done, minus a hold-policy decision the hypothesis gets backwards).
- **C-2's scope** is mis-stated as implementation; it is live-proof completion. The "settlement half missing" narrative in 01 §2 (✕ marks) overstates the gap at HEAD.
- **T-15's framing** ("identity asserted by configuration, not verified at the boundary") is overstated: the kernel enforces verified socket identity, Pending-state, expiry, and requester≠resolver structurally. The genuine residual is view-binding (decision_id/criteria_sha256 in resolve) and local_operator uid-sharing — narrower than Blocker 7 implies, and it changes M-2 from "add for safety" to "add for view-binding specifically."

**Net:** the hypothesis's load-bearing claim (ownership topology correct, defects are seams/duplication) survives source verification — every seam it names is real. But its work ledger mixes done work (M-4, much of C-2) with genuinely missing work (C-1 live roundtrip, M-1/M-2 API consolidation), and two of its inputs (T-14, T-15) are stale or overstated. Correcting that ledger makes the "convergence, completion, retirement" program smaller and more proof-weighted than written — which strengthens, not weakens, the central design answer.
