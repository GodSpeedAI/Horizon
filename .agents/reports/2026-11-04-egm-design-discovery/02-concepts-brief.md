# GodSpeed Convergence — Concepts Brief (system level, v4)

* **Mode:** BRAINSTORM (EGM `egm-brainstorm` Step 2 output, second generation — supersedes the 2026-11-02 cockpit brief v3 at system level; v3 remains authoritative for the cockpit slice)
* **Date:** 2026-11-04 · **Author:** Elephant (lead architect session), synthesized from six fresh-context Goldfish lenses (raw reports in `reviewers/`)
* **Inputs:** reconnaissance bundle `../2026-11-04-egm-distillation/` (facts + hypothesis under review), Horizon Master UI Specification v1.0, Horizon spec 1.2.0, cockpit brief v3, source verification by the codebase-details lens
* **Status:** awaiting owner adjudication of `03-adjudication-decisions.md` before `egm-draft`

## Overview

GodSpeed already contains one coherent system: a compiled immutable world (DomainForge), an application runtime (Cognate), an independent authority kernel (SEA-Forge), an independent evidence ledger (RealityTrace), and one product front that works end to end under governance (Horizon's cockpit on the live J02 path). Six fresh-context reviews confirmed the *ownership* of these pieces is right, and corrected the *work ledger*: much of what the previous hypothesis called "missing" is already built but unproven live, several duplications are actually two different concepts wearing one name, and the one thing no completion item supplies is a real world with real demand.

The design goal is therefore not new architecture. It is: **one authority client, one approval wire, one operator identity, one live proof at pinned tags, one install path — and one honest answer to what the first shipped product is for and for whom.** The last clause is the only part that changes the shape of the system rather than finishing it, and it is the owner's call (A-1).

## Analysis

**The spine is real.** The governed-commit path (typed intent → Cognate runtime → SEA-Forge decide/escalate → durable approval → operator resolve → single commit; rejection commits nothing) runs against a real server and survived adversarial source verification. world_ref immutability holds at every boundary that checks it. Terminal accounting atomicity and startup reconcile — believed missing — landed 2026-11-02 (087fecc). Payment capacity and IS7 settlement are implemented on the branch (aaa6164); what is missing is a *recorded live J02r2 pass*, not the code.

**The seams are exactly knowable.** (1) Two product fronts hand-copy the same SEA-Forge socket client, and both copies are *less hardened* than the SDK's existing `SeaForgeAuthority` (no busy-retry, no 256 KB cap) — the fix is two typed methods on that client, not a raw-call export. (2) "Three approval shapes" is really two server concepts — authority escalation standing vs case-plan human task — plus one genuine wire divergence; reconciliation requires a concept decision, not a schema overwrite. (3) Operator identity now exists in three implementations; the SDK's unpushed `packages/identity` is consumer-agnostic and tested, but Horizon's frozen spec 1.2.0 ships its own. (4) DomainForge 0.21.1 vs 0.21.2 across consumers has no recorded world_ref-equivalence proof — a cheap mechanical gate nobody has run. (5) Horizon's authority reads bypass Cognate at more sites than the invariant admits.

**Two structural gaps the previous hypothesis missed.** The Operate preflight cannot honestly show seven gates: SEA-Forge has no evaluate-only authority verb, and capability/recovery gates are hardcoded pass — so either the wire gains a preview verb or the UI honestly says "authority: decided at invocation." And the Work composition assumes an agent-session runtime Horizon does not have; the cheap honest v1 is a typed handoff into Workbench, not a duplicated session engine.

**The demand question stands in front of the architecture.** Every completion item perfects governance over a fixture world. The only real consequential-work domain available today is GodSpeed's own software development — which is exactly what Workbench already operates and SWE_SEED already proofs. Whether the first shipped product is Horizon-for-organizations, Workbench-for-dogfooding (with Horizon second), or a merged front is a portfolio decision, not an engineering one; the reviews converged on the fact that it must be made explicitly rather than inherited.

## Goals vs Non-Goals

**In-scope goals (v1, "convergence release")**
1. One authority client: `SeaForgeAuthority` gains `listApprovals`, `resolveApproval`, and a closure read; both fronts adopt; hand-rolled copies deleted; Horizon's extra raw calls (`authority_approvals`, `authority_closure`) re-homed; INV-2 boundary teeth enforce the chosen reading.
2. One approval wire: concept decision (A-3) implemented — both concepts renamed apart if kept; the live wire documented as the contract; resolve carries `decision_id`/`criteria_sha256` (view-binding); `PendingApproval.schema.json` regenerated from whichever subsystem owns it.
3. One operator identity: direction chosen (A-4), three-way reconciliation done, one package shipped and consumed.
4. One live proof: settlement-approval gate (SPEC-CR-003) live roundtrip run — *early*, at current heads, and again at the release tag; J02r2 recorded green; readiness re-run pinned to four release tags (sea-forge 0.4.0, cognate 0.9.x, sxr tag, Horizon tag) as the standing conformance gate.
5. One install path: two profiles (single-operator local, zero sudo; small-team server, one digest-pinned command). DomainForge corpus-equivalence gate added to C-2a so the world_ref chain is provably version-stable.
6. Execution-ledger integrity: plan DAG amended once to carry the cockpit/settlement work as tasks (no parallel ledgers); glossary single-meaning pass (settlement ×3, capacity, case, projection) before any case-binding work.

**Out-of-scope non-goals (v1)**
- Gauntlet and SWE-seed-settlement in the shipped perimeter (Local settlement authority ships v1; Gauntlet frozen until a live journey consumes it).
- Capacity/case write-moves to Cognate (interim stays; the atomicity analysis holds).
- An SFWP evaluate-only authority verb (v1 presents "decided at invocation" honestly; the verb is a post-v1 semantic revision unless the owner rules otherwise — A-7).
- A Horizon-internal agent-session runtime (Work surface is a typed handoff or honest-unavailable — A-8).
- Estate-wide affordability at SEA-Forge (per-front until a second front spends — X-2).
- Palantir-pattern presentation beyond the approval inbox and J02r2 surfaces; UI spec Phases 2+.
- Package folds, retirements (R-1/R-2 with contracts-home and pair caveats), godspeed_agent extraction + E2E test re-homing — batched post-v1.

## Alternatives Weighed

| Option | For | Against | Verdict |
| --- | --- | --- | --- |
| Portfolio: Horizon-first (previous hypothesis implicit) | Mission fidelity; cockpit is the strategic product | Ships a fixture-world machine; demand unvalidated; settlement evidence stays synthetic | Kept only if owner affirms mission-first explicitly (A-1a) |
| Portfolio: Workbench-first dogfood, Horizon second | Real work + real settlement evidence now; uses the estate's most finished product; validates the spine on non-fixture data | Horizon (the mission) slips; needs SWE_SEED packaging green; two-front tension persists by design | **Recommended (A-1b)** — cheapest path to evidence; Horizon continues J02-closure in parallel |
| Portfolio: merge fronts on one runtime | Deletes the whole duplication class; inherits Workbench packaging | Semantic risk: devtools and cockpit UX compromise; Horizon spec must admit Work as normative; large identity/spec reconciliation | Deferred — re-evaluate after the convergence release (A-1c) |
| Portfolio: freeze-and-finish-one (archive Gauntlet+SWE_SEED, all capacity to Horizon) | Fastest "finished Horizon" claim | Loses daily dogfood; payment gates need spec amendment; abandons the only real-work evidence source | Rejected as primary; its *freezing* instinct absorbed into v1 perimeter |
| Mechanism: export raw `seaForgeCall` from SDK (original M-1) | One-line unblock | Perpetuates unhardened copies; escape hatch invites a fourth client | **Rejected** — extend `SeaForgeAuthority` (reviewer-verified hardening gap) |
| Mechanism: M-2 as "make PendingApproval match ApprovalStanding" | Single shape | Erases the case-task concept casework-go consumes | **Rejected** — two-concept decision first (A-3) |
| Sequencing: SDK work before live roundtrip | Clean proofs at final heads | Delays the cheapest evidence; merges proceed un-de-risked | **Rejected** — evidence-first (runbook now, G-4) |
| Install: OCI compose now | One command both profiles | Socket/uid containment model must be re-proven in a namespace — security work, not packaging | Deferred post-v1 |
| Evidence: readiness at heads (C-3 as written) | Always current | Stale at the next commit; recreates T-2 forever | **Rejected** — pin to release tags |

## Key Decisions & Staging for Next Steps

**Owner decisions required before `egm-draft`** — full analysis in `03-adjudication-decisions.md`: **A-1** first product/portfolio, **A-2** INV-2 reading, **A-3** approval concepts, **A-4** identity direction. **A-5..A-9** (v1 perimeter, PR-14/roundtrip order, authority preview semantics, Work surface, ledger rebind form) carry evidence-backed recommendations the owner can ratify in the same pass.

**Staging (post-adjudication):**
- **Stage 0 — evidence + decisions (no product code):** run the live roundtrip runbook at current sea-rs heads; commit the Master UI Spec to version control; owner adjudications; glossary pass; DF 0.21.1/0.21.2 corpus-equivalence gate.
- **Stage 1 — sea-rs release train:** merge PR 84 → resume-lease → approval-gate as one reviewed story + CodeRabbit Majors + A-3 wire decision → 0.4.0 tag → roundtrip re-run at the tag.
- **Stage 2 — Cognate 0.9.x (the convergence release proper):** `SeaForgeAuthority` methods, identity direction landed, RealityTrace client/env dedup, optional package folds, DF pin 0.21.2 behind the equivalence gate; Horizon adopts, de-vendors, deletes hand-rolled clients; INV-2 teeth on.
- **Stage 3 — proof completion:** J02r2 recorded green; SPEC-CR-003 gate live; readiness run pinned to the four tags = standing P3 confirmation; install profiles shipped.
- **Stage 4 — post-v1:** authority evaluate-only verb (or standing deferral), Work-surface decision implementation, affordability provider design, UI Phases 2+, retirements batch, godspeed_agent extraction + E2E re-home.

**First formal `egm-draft` (recommended): the Cognate Mediation Release** — Stages 1+2 as one design document: "one authority client, one approval wire, one operator identity." It is the smallest coherent *architectural* transformation (one SDK minor release + one adoption PR + one schema regeneration, all mechanisms verified to exist), it unblocks everything else (inbox eligibility honesty, INV-2, identity, de-vendoring), and its negative cases are already half-built as live tests. Alternative first-draft (settlement approval gate) is now *sequencing work inside Stage 1/3*, not a design doc, because the gate is drafted (SPEC-CR-003) and only unproven.
