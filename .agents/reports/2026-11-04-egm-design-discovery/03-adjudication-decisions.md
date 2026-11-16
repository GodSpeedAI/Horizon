# 03 · Adjudication Set — decisions the owner must make before `egm-draft`

Reassessment of the distillation's D1–D8 against six Goldfish reviews. **Resolved-by-evidence decisions are listed first and are NOT put to the owner** (per instruction: do not manufacture decisions the implementation already answers). The adjudication set proper is A-1..A-9, each with: plain English · alternatives with benefit/cost · recommendation · what becomes possible/impossible · now-or-deferrable.

## Part 1 — Resolved by evidence (no owner judgment needed)

| Prior | Resolution and evidence |
| --- | --- |
| D4 (sea-rs landing order) | **Resolved:** PR 84 → resume-lease → approval-gate → 0.4.0, as one reviewed story. Release-please 0.4.0 branch verified current with origin/main (`6b4fd7e8` = one version-bump commit atop `22bf66a3`); nothing blocks the tag except the lineage merges and two open CodeRabbit Majors. Only residual owner bit: *who* reviews (one designated reviewer for the whole sequence — heavy overlap). |
| D7 (dormant tooling) | **Resolved:** archive tree-sitter-sea + vsc-extension (dormant PoCs, no consumer); LSP bump only when editor support is a journey goal. Amended by review: R-1 must first move the SFWP contracts home (provable-safe) and must decide cognitive-ui + casework-go **as a pair** (the retired UI's live backend) — the pair decision rides A-6. |
| M-1 mechanism | **Resolved (was D1's "how"):** extend `SeaForgeAuthority` with `listApprovals`/`resolveApproval` + closure read — *not* a raw `seaForgeCall` export. Verified: the SDK client already has busy-retry + 256 KB cap; both hand-rolled copies lack them. What remains of D1 is the INV-2 *reading* → A-2. |
| M-4 | **Resolved:** already landed (087fecc; 7 tests). Remaining work: *ratify* the landed hold policy (`pending-reconcile.ts:3-5` deliberately keeps `awaiting_authority` holds for once-only resume) by documenting it, not changing it. |
| C-2 scope | **Resolved:** implementation exists (aaa6164, f434a2f); the work is a recorded live J02r2 pass + roundtrip runbook execution. |
| CEP repo form | **Resolved:** keep as standalone spec/schema home (A-8 reviewer: "debt is content, not form"); the hash-algorithm fix is real work, scheduled post-v1. |
| Design-typo class | **Resolved:** stale line anchors from brief v3 corrected (W-4); rule adopted: re-verify anchors before acting. |

## Part 2 — Adjudication set

### A-1 · What is the first shipped product? *(the portfolio decision — biggest, gates everything)*

**Plain English:** Today both fronts have exactly one user: you. The estate can finish Horizon's governance over a fixture organizational world, or it can ship the governed-commit→settlement loop on the one real consequential work that exists — your own software development via Workbench + SWE_SEED — and let Horizon follow with a proven spine. No amount of internal completion supplies a real world for Horizon; a connector does not exist and is not in any plan.

**Alternatives:**
- **(a) Horizon-first (mission-first).** *Benefit:* the strategic product ships first; no scope change; README's promise demonstrated earliest. *Cost:* v1 governs a fixture/test world; settlement evidence stays synthetic; demand risk stays untested until after everything else is done. *Possible:* "finished Horizon" claim. *Impossible:* honest claims that settlement has ever closed on real work.
- **(b) Workbench-first dogfood; Horizon completes J02-closure in parallel (recommended).** *Benefit:* the spine records real, non-fixture settlement evidence immediately; uses the estate's most finished product (1,571 tests, 5-platform packaging); validates the authority/evidence machinery on data that can contradict it; SWE_SEED gets a live consumer (answering the zoom-out lens's freeze challenge); Horizon work continues unchanged on the convergence release. *Cost:* SWE_SEED packaging must go green (workflow exists, unrun); "GodSpeed ships" first means the harness product, not the mission product; two-front tension persists by design until A-1c. *Possible:* real evidence, real recovery cases, a credible v0.1 distribution. *Impossible:* claiming the organizational-cockpit mission is delivered.
- **(c) Merge fronts on one runtime.** *Benefit:* deletes the whole duplication class (clients, identity, approval UI); inherits Workbench's packaging for the combined product. *Cost:* large; semantic (Horizon spec must admit Work as normative; devtools and cockpit UX compromise each other); premature before the convergence release proves the shared mechanisms. *Possible:* one product, one install. *Impossible:* for v1 — the identity/spec reconciliation alone is L-size.

**Recommendation:** **(b)**, revisited against (c) after the convergence release. This is the reviewers' strongest convergent challenge (zoom-out Blockers A1/A2) and I concur with it.
**Now or defer:** **Now** — it determines whether SWE_SEED packaging is on the critical path and what "v1 shipped" means.

### A-2 · What does INV-2 ("Cognate mediates authority") mechanically mean?

**Plain English:** Two readings: **strict** — no product front contains SFWP socket code at all; every authority call, including the operator's approval resolve, runs through the embedded Cognate runtime as a governed capability. **convention** — fronts may call SEA-Forge directly provided they use the one SDK-exported typed client. Today Horizon has four raw call sites; the strict reading calls all four violations, the convention reading calls two of them fine.

**Alternatives:** *(a) Strict.* Benefit: one enforceable boundary (teeth = "no socket code in src/"), resolve becomes a governed capability with actor identity attached, INV-2 becomes real. Cost: resolve/list/closure must be exposed as Cognate capabilities; more moving parts before shipping; Gauntlet/SWE_SEED are outside the rule (they talk to SEA-Forge by design — the rule must name them exempt as *peers*, not *fronts*). *(b) Convention.* Benefit: cheapest; two typed methods and Horizon is compliant-ish. Cost: INV-2 stays aspirational; identity-at-resolve stays app-side (weakening A-4); every future front re-litigates it.
**Recommendation:** **Strict, staged** — v1 ships the typed client everywhere (convention-level compliance) *and* adds the boundary teeth with a dated named exception for the two remaining app-voice calls; the exception closes in the same release that lands A-4's identity direction (resolve becomes a capability). Strict-now would serialize A-2 behind A-4 with no v1 payoff.
**Now or defer:** **Now** (which reading), because the boundary teeth and the SDK API shape depend on it.

### A-3 · One approval concept or two?

**Plain English:** SEA-Forge has two different things both called an approval: the *authority escalation standing* (`ApprovalStanding`, what Horizon's inbox and Cognate read) and the *case-plan human task* (`PendingApproval` in sfwp::approvals, generated schema consumed by casework-go). They overlap in name only. Merging them into one shape would delete a live concept; keeping both means renaming one and fixing the real wire divergence.

**Alternatives:** *(a) Keep both concepts, rename apart* (e.g., "escalation standing" vs "case task"), document the live wire as the contract for each, fix consumers field-by-field. Benefit: no capability lost; each concept keeps its owner and failure semantics. Cost: a naming migration across three repos; two schemas to maintain. *(b) Unify into one approval concept.* Benefit: one shape, one schema. Cost: erases case-task semantics casework-go uses; semantic revision to SFWP; only defensible if casework-go is being archived anyway (couples to A-6).
**Recommendation:** **(a) Keep both**, unless A-6 archives the casework pair — then (b) becomes cheap. Decide A-3 and A-6 together.
**Now or defer:** **Now** — the sea-rs release train (Stage 1) carries the wire fix.

### A-4 · Which way does operator identity reconcile?

**Plain English:** Three implementations exist: Horizon's shipped spec-1.2.0 WebAuthn/pairing/cbor; Workbench's dev authenticator; the SDK's unpushed, tested, consumer-agnostic `packages/identity` (1,463 lines). One must win. Horizon's version is frozen in a spec; the SDK's is better factored and shared.

**Alternatives:** *(a) SDK `packages/identity` becomes the implementation; Horizon spec re-frozen at 1.3.0 binding requirements to it* (spec owns *what*, package owns *how*). Benefit: one identity story for both fronts; phone-remote + WebAuthn + pairing in one place; Workbench adopts later on its own cadence. Cost: a frozen-spec revision (owner-gated, new hash, plan rebind — your own governance ritual); Horizon's shipped code largely deleted in favor of the package's. *(b) Horizon's shipped implementation wins; SDK branch dropped.* Benefit: no spec churn; already live on the gateway. Cost: strands 1,463 tested shared lines; Workbench keeps its own authenticator; three-way fork becomes permanent. *(c) Defer; keep three.* Benefit: zero work now. Cost: identity is load-bearing for A-2's strict end-state and for shared_remote readiness (currently WITHHELD on identity gaps).
**Recommendation:** **(a)** — it is the only option that ever produces one operator identity, and the spec ritual is exactly what your process is built to absorb.
**Now or defer:** **Now** — it sizes the Cognate 0.9.x release.

### A-5 · v1 perimeter: exclude Gauntlet and SWE-seed settlement transport?

**Plain English:** Ship v1 with Local settlement authority, Gauntlet frozen, SWE-seed transport only if A-1(b) chosen (it is then *on* the dogfood path, not Horizon's).
**Benefit of excluding:** 4-binary install, no PostgreSQL, two fewer release trains on the critical path. **Cost:** "settlement authority is pluggable" is proven only by Local; external-authority escalation (SPEC-CR-003) is proven against SWE-seed and would need re-proving when it re-enters. **What becomes impossible:** nothing permanent — both re-enter post-v1 unchanged.
**Recommendation:** **Exclude from Horizon v1** (three lenses converged); **include SWE-seed on the dogfood path** if A-1(b).
**Now or defer:** **Now** (sizes the release train).

### A-6 · The cognitive-ui + casework-go pair: name a journey or archive?

**Plain English:** R-1 wanted cognitive-ui gone; verification found casework-go is its live backend and the SFWP schema home lives in the tree slated for deletion. Either these two apps have a product journey you intend (e.g., casework as a future product surface) or they are a self-referential pair to archive after the contracts home moves.
**Recommendation:** If no named journey: move contracts generation to a sea-rs top-level `contracts/` (provable-safe), then archive the pair together in the post-v1 batch. If a journey exists: keep both, and A-3 firmly becomes (a).
**Now or defer:** Deferable to the retirement batch, **except** the contracts-home move, which must precede any `workbench/` deletion and is cheap — fold into Stage 1.

### A-7 · Authority preview: add an SFWP evaluate-only verb, or make "decided at invocation" the honest presentation?

**Plain English:** The UI spec wants a seven-gate preflight including authority before commit. SEA-Forge cannot answer "would this be allowed" without doing it (`deferred_to_invocation` today). Either the wire gains an evaluate-only verb (semantic change to a frozen protocol) or the product honestly shows "authority is decided when you commit" plus the *policy* that would apply.
**Alternatives:** *(a) Verb (post-v1).* Benefit: true preflight; matches Foundry action-wizard pattern; `likely_allow ≠ granted` stays honest. Cost: SFWP v1 semantic revision; policy-vs-decision disclosure rules needed. *(b) Honest label v1.* Benefit: zero contract change; truthful now; the gate is shown as "decided at invocation" with policy visibility. Cost: preflight is 6/7 gates; the wizard pattern waits.
**Recommendation:** **(b) now, (a) as the first post-v1 semantic revision** — unless you rule the wizard pattern is a v1 product requirement.
**Now or defer:** The *ruling* is now (it sizes the UI work); the *verb* is post-v1.

### A-8 · Work surface v1: typed handoff to Workbench, or build a session facade?

**Plain English:** UI spec Phase 3 assumes agent sessions inside Horizon; Horizon has no session runtime. A typed handoff (case_ref + world_ref + session pointer into Workbench, honest-unavailable otherwise) is nearly free and truthful; a facade is new architecture.
**Recommendation:** **Typed handoff for v1** (UI spec's own availability rule permits it); revisit the facade only if A-1 lands on (c) merged-fronts.
**Now or defer:** **Now** (it sizes UI Phase 3 and de-risks the UI spec's plan).

### A-9 · Ledger re-bind form: fold into the existing DAG, or re-freeze a new plan?

**Plain English:** M-3 left two readings; the comprehension lens showed they fork the governance artifacts (prereg dirs, gate names, evidence tree).
**Recommendation:** **Amend the existing DAG once** — map the production-readiness classes and the convergence-release stages onto T-tasks (or T11a/T23+), keep spec 1.2.0 (or 1.3.0 after A-4) as ruler; do not run a parallel plan. Procedural, needs your signature per Horizon's contract.
**Now or defer:** Ratify with the A-1..A-4 set; the amendment itself lands in Stage 0.

---

**Minimum set to unblock `egm-draft`:** A-1, A-2, A-3 (+A-6 same pass), A-4. A-5..A-9 carry recommendations you may ratify in the same pass or defer individually; only A-5's ratification blocks sizing the release train.
