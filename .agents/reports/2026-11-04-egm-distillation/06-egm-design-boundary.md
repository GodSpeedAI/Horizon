# 06 · Proposed EGM Design Boundary — first formal design document

## 1. The boundary

**Title:** *Governed commit → approval → settlement closure on the live gateway: one contract, one client, one live proof.*

**Scope in (the smallest coherent design that unlocks the most):**
1. The SEA-Forge approval wire contract as a single shape (M-2): `ApprovalStanding::to_json` reconciled with `PendingApproval.schema.json`; `state`; eligibility semantics; resolve carrying `decision_id`/`criteria_sha256` so stale approvals are refused **at the authority boundary**.
2. Cognate as the sole exporter of the SEA-Forge client + shared operator identity (M-1, D1, D8): land `horizon/shared-identity`, export `seaForgeCall` + typed list/resolve; Horizon deletes its raw-socket adapters (INV-2); Workbench adopts the same export.
3. SPEC-CR-003 settlement-approval-gate (D2) + the prepared live roundtrip runbook as the design's live proof, jointly proving the sea-rs settlement convergence (D4).
4. The Horizon execution-ledger rebind (D3) so the above lands as settleable tasks with preregs and evidence.

**Scope out (explicitly):** capacity/case moves to Cognate (brief v3 Option C interim stands), J03–J06 surfaces, Palantir presentation (P8), Gauntlet/SWE_SEED projection contracts, editor tooling, install packaging beyond what the roundtrip touches.

**Why this boundary:** it sits at the intersection of five repos but changes ~hundreds of lines, not thousands; it converts the estate's biggest *verified strength* (the authority spine) into its biggest *missing product capability* (external settlement escalates to a human, proven live); and every Phase-3 gap that matters downstream (inbox eligibility, honest settlement stages, readiness GO) is blocked on it. It also retires the two sharpest duplications (T-6, T-7) in the same motion.

**Relation to the Master UI Specification v1.0 (2026-11-04):** the UI spec is the companion *presentation-side* contract to this *substrate-side* boundary — design-only, self-subordinate to source contracts, no implementation permission. Its Phase 1 (Operate/approval-inbox recompose) *requires* this boundary's M-2 output: "use actual `InboxApproval` fields" and "a typed verified approval-ID relation, not matching labels" (§6) are only truthful once the wire shape is reconciled and the typed approvalId exists. Sequence: this design doc first (or in parallel with UI spec Phase 0's traceability baseline, which is already satisfied by this bundle's recon), UI Phase 1 implementation after. Its A–E work-scope gate governs any UI work that follows.

## 2. Recommended next EGM command and input

```
egm-draft        # input: this bundle's 03 (hypothesis) + 01 §3 (Horizon state) as the concepts basis,
                 #        plus the already-reviewed cockpit brief v3 (do not re-brainstorm it)
then
egm-review-loop  # Goldfish fresh-context review with the curated reading package below
then
egm-resolve      # contest/accept findings, escalate trade-offs to the owner via 05-decision-register.md
```

Note: `egm-brainstorm` is **not** needed first — brief v3 already completed all six lenses for the cockpit concept (2026-11-02). Start at `egm-draft` with the boundary above; the draft must incorporate brief v3's blockers as settled constraints, and this bundle's M-1/M-2 as the design moves.

**Owner decisions required before design approval** (from `05-decision-register.md`): **D1** (Cognate owns approval contract), **D2** (settlement-gate sequencing), **D3** (ledger rebind), **D8** (identity/design convergence). D4/D5/D6/D7 can ride along but D4's landing order should be settled before the live-proof section is drafted.

## 3. Curated reading package for the Goldfish reviewers (source-grounded, independence-preserving)

Reviewers get *only* this package — not this bundle's reasoning (preserve their independence from the Elephant):

| # | Document | Why |
| --- | --- | --- |
| 1 | `Horizon/.agents/specs/horizon.agent.spec.yaml` (1.2.0; journeys + REQ-NAV-008..013, REQ-SEC-006) | The ruler the design must satisfy |
| 2 | `Horizon/.tmp/Horizon_Master_UI_Spec_v1_0.md` (Master UI Spec v1.0, design-only) | The presentation-side companion contract; §6 approval records + §11 work-scope gate + §12 verification matrix constrain what this design must make truthful |
| 3 | `godspeed-growth/world/cognitive_os_manifesto_v17.md` (§1 governing question, §7 affordance, §8 payment, §9 gates, §10 settlement/typed statuses, §13 anchor/freezing) + `cognitiveos_math_layer_v2_3.md` (§0 design contract) | Theory grounding — the distinctions this design must preserve (note T-EGM-3: the UI spec cites manifesto v13.1; v17 is canonical) |
| 4 | `Horizon/.agents/reports/2026-11-02-horizon-cockpit-concepts-brief-v3.md` | Prior six-lens findings = constraints |
| 5 | `sea-rs/docs/reference/sfwp-protocol-reference.md` + `crates/sea-forge-authority/src/cep.rs:700–760` (`ApprovalStanding::to_json`) | The actual wire truth |
| 6 | `sea-rs` `PendingApproval.schema.json` + Horizon `src/adapters/sea-forge-approvals.ts` + Workbench `src/capabilities/governance.ts` | The three divergent consumers |
| 7 | `Horizon/.agents/candidates/horizon/SPEC-CR-003/{CANDIDATE.yaml,DELTA.md}` (worktree `Horizon-settlement-gate`) | The drafted gate design |
| 8 | `Horizon/.agents/reports/2026-11-03-settlement-live-roundtrip-runbook.md` | The live proof procedure |
| 9 | `cognate` `packages/runtime-bun/src/{governance-env.ts,governed-operation.ts,sea-forge-authority.ts}` + worktree `cognate-identity-wt` `horizon/shared-identity` diff (2 commits) | The SDK/identity side of M-1 |
| 10 | `Horizon/test/J02-live.test.ts` + `test/J02r2-live.test.ts` + `cognate/packages/runtime-bun/test/sea-forge-live.test.ts` (incl. :282 service-actor refusal) | Existing executable evidence |
| 11 | This bundle's `01-actual-system-map.md` §3–§4 only (facts, not proposals) | Orientation without steering |

**Reviewer charges (per Phase 4):** (1) right problem? (2) simpler without losing capability? (3) responsibilities/interfaces correctly allocated — esp. is Cognate the right sole client owner? (4) UX realizable — inbox eligibility honesty? (5) install/config/security/recovery/upgrade properly engineered — esp. upgrade/rollback around contract_version 2 and the rewritten Cognate history? (6) plan preserves capability and covers negatives — esp. the four skipped/refused paths (stale, offline, concurrent-resume, self-approval).

## 4. Success criterion for this design (preregistered)

The design is done when: one approval shape exists in schema+code; Horizon has no raw authority socket; the live roundtrip runbook has run green at converged heads with the actor recorded by SEA-Forge; and godspeed-readiness GO 30/30 is re-established at those heads — that run serving as the P3 independent confirmation.
