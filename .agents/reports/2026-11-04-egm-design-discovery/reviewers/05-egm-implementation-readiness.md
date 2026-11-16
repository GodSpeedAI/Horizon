# Goldfish Review — egm-implementation-readiness lens (raw, as returned)

Fresh-context reviewer, dispatched 2026-11-04 per `egm-brainstorm` Step 2. Unedited except for this header.

---

**Verdict:** The ownership-preserving core is right, but the hypothesis systematically understates *release choreography* and treats installability as a tagging exercise. As ordered, it reaches "one map of what is built" only after four other products have shipped coordinated releases. There is a cheaper first-shippable perimeter inside it that the hypothesis refuses to name.

## A. Findings

**Blocker 1 — C-6 is a release checklist, not an install story.** The actual burden (verified in `docs/gateway-runbook.md`: 234 lines; stage-bundle digest pinning, ~10 owner-run sudo steps, two systemd units, root-owned binaries under `/opt` and `/usr/local/lib`, manual `nsenter` containment test, manual rollback) is untouched by "sea-forge 0.4.0 tag, sxr tag, SWE_SEED green, Gauntlet tag-or-explain." Nothing in C-6 converges the deployment *mechanism*. Cheapest credible paths: (a) single-operator local — one `install.sh` laying a self-contained tree under `~/.local` with `systemd --user` units and user-owned sockets; zero sudo, zero `/opt`; the protected-socket two-account hardening is explicitly a multi-account feature and should not tax the local profile; (b) small-team server — keep the sudo model but collapse runbook + installer + check into one command with one digest (the runbook already generates the sudo line; make the script consume it). The hypothesis is silent on both profiles.

**Blocker 2 — Minimum cross-repo release count is unstated and understated.** M-1 alone requires: cognate push-safety check on rewritten history (P4.1, owner-only), landing `horizon/shared-identity`, SDK export work, a cognate 0.9.x release, Horizon de-vendoring, and Workbench registry adoption. C-1 requires sea-rs 0.4.0, which requires merging three lineages (MG-1) with two open CodeRabbit Majors. C-3 requires all heads converged *and* the readiness harness able to express post-rewrite cognate history. Realistic minimum to first shippable: **4 coordinated releases** (sea-rs 0.4.0, cognate 0.9.x, sxr tag, Horizon tag). The hypothesis lists the tags (C-6) but never states the dependency: C-6's tags are the *same events* C-1/C-2/M-1 block on — they are not sequential stages, they are one release train.

**Blocker 3 — The live roundtrip runbook is "prepared, not run" and is scheduled too late.** C-1 is called "the single highest-value completion," yet it sits third in the sequence behind M-1/M-2. The runbook is one owner session against already-installed binaries (sea-rs ≥ 09c2541b target noted in 01 §3). Running it *now*, even at imperfect heads, de-risks the runbook itself and surfaces real failures in the 3-way merge before that merge is done. Ordering it after the SDK work delays the cheapest evidence in the plan.

**Major 1 — T-13 version skew is a correctness unknown sitting under everything.** Horizon's vendored cognate 0.8.0 verifies worlds via DomainForge **0.21.1** while sxr pins **0.21.2**. If the two minors can derive different `world_ref`s for the same source, the spine's core invariant (identical verification at every boundary) is silently broken. The hypothesis's preserve-list asserts the spine "works" on the strength of J02-live, which ran on one host with one DF version. The 0.21.1→0.21.2 identity-chain equivalence check (or the cognate-domainforge bump) is a must-verify, and it drags a cognate release onto the critical path even under the most aggressive cutting.

**Major 2 — M-1's scope misses two of four raw-socket call sites.** Brief v3 Major 8 / T-10: `app.ts:913` (`authority_approvals`) and `app.ts:678` (`authority_closure`) also bypass Cognate. M-1 deletes the approvals adapter and Workbench's private path but leaves Horizon's own extra calls unassigned. "Cognate is the only process speaking to authorities" (§5) is stated stronger than the modify-list delivers.

**Major 3 — Workbench adoption is treated as free; it is a second product's release.** M-1 says Workbench merely "loses a local convenience." Workbench is at rev 39 with T12 in flight, its own release cadence, and no stated obligation to adopt the SDK export. If it slips, the estate ships with its second-largest consumer violating the one-export policy — dual approval shapes persist past C-3, exactly the perpetual-migration outcome the lens is charged with. The hypothesis needs an explicit rule: Horizon ships when *Horizon* is on the SDK path; Workbench convergence is tracked, not gated.

**Major 4 — Recovery triage is implicit, not decided.** Must-close-before-any-real-user: M-4 (non-atomic terminal accounting leaks reservations — money; `awaiting_authority` holds never reclaimed; restart resumes only stage `executed`) and the approval-identity boundary check (T-15: resolve carries no `decision_id`/`criteria_sha256`; staleness reads a cache). Can ride for single-operator local v1: `contract_version` 2 marker rollback-unsafety (no production data exists yet to migrate; a documented "reset the store" procedure is acceptable *only* while the operator is the only user — this converts to a blocker at the first small-team deployment); stale readiness GO rides *only* if replaced by pinned-tag release gating, otherwise it is an evidence hole that re-opens every time any head moves. The hypothesis gets M-4's urgency right ("before any capacity move") but ties it to the wrong gate — it is before any *real user*, capacity move or not.

**Major 5 — The verification strategy is itself the bottleneck and C-3 repeats the pattern.** One deployed gateway, owner-hands-only live proofs, 16 live tests skipped in the recorded run, J01/J03–J06 fixture-only, independent P3 confirmation never yet performed by a second party (CURRENT_STATUS T10: "No independent confirmer signed this round"). C-3 proposes one more owner-run whole-stack pass at converged heads — which is stale again at the next commit. Without pinning readiness to release *tags* and making it a release gate (or a second environment/runner), every future release recreates T-2.

**Minor 1 —** M-1's verify step cites the service-actor-refusal test as "already exists"; true, but it lives in the cognate repo and Horizon's recorded runs skip live tests. The evidence cited is not the evidence that will be collected.
**Minor 2 —** Decision D5 (Gauntlet PostgreSQL) is dodged, but the hypothesis's own responsibility table says Gauntlet is "optional engine; not required per-commit." That fact decides D5 for v1: Gauntlet is out of the first shippable perimeter. Say so.
**Minor 3 —** M-3 (ledger re-bind) is correct but the two ledgers will coexist until P4 lands; the hypothesis should state that the *plan DAG is amended once*, not kept in parallel with the production-readiness classes.

## B. Critical path to first shippable (as I see it)

1. **Owner decisions (days, no code):** Gauntlet and SWE-seed excluded from v1 perimeter (Local settlement authority for v1); commit the Master UI Spec (T-EGM-4); D2 = merge cockpit PR #14 after M-4, not before C-1.
2. **Horizon-only:** M-4 atomicity + startup reclaim (local store tests). T-15 resolve hardening (`decision_id`/`criteria_sha256`). Glossary pass (C-5 — cheap, unblocks case binding).
3. **Run the prepared live roundtrip runbook immediately** at current sea-rs candidate — de-risk before merging.
4. **sea-rs release train:** PR 84 → resume-lease → approval-gate merged as one story; fix the two CodeRabbit Majors; M-2 schema fix rides the same PR; cut **0.4.0**; re-run roundtrip at the tag.
5. **Cognate release:** push-safety check (owner), land shared-identity, export `seaForgeCall` + approvals, bump DF pin to 0.21.2 with an identity-equivalence test across 0.21.1/0.21.2; release **0.9.x**. Horizon adopts and de-vendors. Workbench adoption tracked separately.
6. **C-2:** REQ-NAV-008..013 + J02r2 recorded green against live binaries.
7. **C-3:** readiness re-run pinned to the four release tags; that run is the P3 independent confirmation.
8. **C-6:** one installer, two profiles (user-units local / sudo server); **sxr tag**; **Horizon tag**.

Releases: 4. Owner privileged actions: push-safety check, live roundtrip sessions (2), readiness run, server-profile install.

## C. Alternative sequencings

- **Alt 1 — Evidence-first (runbook now, merges after):** run C-1's runbook before any merge. *Risk:* proof at soon-dead heads; *payoff:* failures surface while the three lineages are still separable, and the runbook stops being untested prose. Strictly better than the hypothesis's order.
- **Alt 2 — Ship without M-1 (named exception + date):** keep Horizon's adapter, cut cognate 0.9.x from the critical path (3 releases). *Risk:* DF-skew check (Major 1) still forces a cognate touch, dual approval shapes entrench, INV-2 debt accrues interest; only worth it if cognate's release train stalls.
- **Alt 3 — Container-first install:** one OCI compose for sea-forge + sxr + horizon gateway; owner actions collapse to one command for both profiles. *Risk:* the Unix-socket/uid containment model must be re-derived inside the compose network namespace — this is security-model work, not packaging; the current runbook's guarantees (operator cannot reach the socket) must be re-proven. High payoff, must not be attempted before C-3.

## D. What to cut to converge fastest

Cut from the v1 perimeter: **Gauntlet** (own table says optional per-commit), **SWE-seed** (Local settlement authority ships v1; SWE-seed is the upgrade), **Workbench convergence** (track, don't gate), **C-4 CEP hash** (real payoff, not on the operate journey), **UI phases beyond the approval inbox + J02r2 surfaces**, **R-1..R-4 retirements** (do them, but batched after C-3 — they shrink future surface, not the critical path), **godspeed_agent** (extract-and-archive per R-3; do not "migrate"). Keep at all costs: M-4, T-15, M-2, C-1, C-2, the DF-skew verification, and a tagged-release readiness gate — those are the governance and recovery guarantees. The resulting v1 is one operator, one host, four binaries, one installer command, one pinned-tag whole-stack proof — which is the smallest system that is honestly shippable rather than perpetually converging.
