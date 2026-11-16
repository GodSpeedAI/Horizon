# T1 Independent Review — raw stage reports (verbatim, unedited)

Five fresh-context Goldfish stages per the `egm-review` pipeline, dispatched 2026-11-05 against `design_draft.md` v1. Reading package: the draft + `02-concepts-brief.md` + `04-adjudication-remaining.md` + repo access. The six Phase-1 lens reports were withheld for independence. Verdicts: S5 SOLVE-WITH-CHANGES · S6 (Blocker found) · S7 SOUND-WITH-CHANGES · S8 CONVERGES-WITH-CHANGES · S9 READY-WITH-CHANGES.

---

## Stage 5 — Initial Zoom Out

**MAJOR 1 — Half the Workbench-first critical path is unowned.** Adjudication §1.1 names TWO critical-path consequences of direction 1: "(i) SWE_SEED native packaging must record a green run... (ii) Workbench adoption of the SDK client is now gated." The design carries (ii) (R2) but excludes SWE_SEED entirely and names no transformation that owns (i). Verified: `SWE_SEED/.github/workflows/native-candidate.yml` has exactly two runs, both **cancelled** (2026-10-31). T1 can complete fully and the dogfood product is no closer to a shippable packaging claim. Fix: bind the green run into T1's release-evidence row, or explicitly name its owning transformation.

**MAJOR 2 — Evidence-first sequencing silently inverted.** The concepts brief explicitly rejected "SDK work before live roundtrip" ("Rejected — evidence-first, runbook now, G-4") and its Stage 0 runs the roundtrip at current heads *before* Stage 1. The design's D5 starts with the sea-rs train; its only roundtrip execution is at the 0.4.0 tag. Verified: no roundtrip execution recorded in Horizon `.agents/CURRENT_STATUS.md`. Fix: execute at heads as step 0, or cite where that already happened.

**MAJOR 3 — The train's first step is unrelated, actively-iterating settlement work.** PR #84 is settlement correctness; no goal in this design depends on it except sharing the 0.4.0 tag. The mitigation default ("this session's review stands in") is not code review of a PR with two unresolved CodeRabbit Majors. Fix: land #84 as its own reviewed merge before T1 opens, or cut 0.4.0 without it.

**MINOR 1** — View-binding opt-in means any caller that omits it reinstates the stale-approval risk; require it when the standing row exposes `criteria_sha256`. **MINOR 2** — rename blast radius correctly small but under-argued: state explicitly that live JSON stays byte-identical; only schema `$id` churn, in-repo only. **MINOR 3** — preflight honesty is spec-mandated: cite frozen spec REQ-NAV-006 (verified `horizon.agent.spec.yaml:725` defines `deferred_to_invocation`); the computed-verdict display is the deviation. **MINOR 4** — R1's "no caller constructs ids outside the two fronts (verified)" doesn't name the verification.

Substrate checks: SDK hardening `sea-forge-authority.ts:216,321`; unhardened twins at `governance.ts:56` / `sea-forge-approvals.ts:110`; bypasses at `app.ts:776/1011`; stale 0.7.0 tarballs; Horizon's own adapter header declares the debt.

**Stage answers:** (1) Right problem, heavier wrapper than convergence requires. (2) Right level — SDK typed verbs + repo-local teeth; protocol-level enforcement unavailable (open socket, peers by design). (3) Creep: PR #84 rides the train by accident of the tag. Missing: SWE_SEED green run, heads-level roundtrip. (4) Strongest counter-argument: first transformation of the convergence era ships nothing user-visible, installable, or demand-validating; the design only earns its rebuttal if it binds the product evidence and early live proof into the train.

**Verdict: SOLVE-WITH-CHANGES** — decouple #84, restore evidence-first roundtrip, bind or assign the SWE_SEED green run.

---

## Stage 6 — Comprehension

Restatement broke at: (4) whether the approval-gate branch is landed or closed is explicitly undecided (D2/Q2); (5) what the exceptions file contains, given D4 also re-homes both direct call sites.

**Blocker B1 — D4 contradicts itself on the two direct call sites.** D1 adds only read verbs — no closure *write* verb — yet D4 says "Re-home `authority_approvals` and `authority_closure` onto `readAuthorityClosure`/typed list", and the teeth then except "the two app-voice call sites until T2". If both are re-homed, the exceptions file has nothing to list; if the :776 write stays raw, the re-home sentence is false. The draft cannot be built without choosing one.

**M1** — "app-voice call sites" load-bearing, never defined; "two more" than what? **M2** — rename-apart wire story incoherent: "no alias needed" (wire unchanged) vs "one-minor consumer churn"; a stranger cannot tell whether old binaries keep working across 0.4.0. **M3** — Overview's "operator-visible behavior does not change except preflight" contradicted by view-binding refusals. **M4** — request-id scheme underspecified: who supplies caller/op; retry reuses or regenerates id? **M5** — "owner to name; default: this session's review" is a placeholder written as if resolved.

**Minor:** "escalation standing" undefined; "mediation" ambiguous in Goal 3 (code-location rule, not behavioral); opaque anchors (T10, 18f0c40, 087fecc, J02-live, runbook path); "malformed row excluded from counts" — which counts?

**Four divergent-implementation ambiguities:** (1) fate of `app.ts:776` (write verb invented vs living exception); (2) teeth mechanism (static scan vs runtime guard; fixtures exempt or not — four different teeth); (3) request-id ownership + retry idempotency; (4) rename consumer impact (cosmetic vs lockstep).

**Acceptance-row checkability (weak rows):** Correctness half-checkable (idempotency property unstated; "J02-live" unidentifiable to a stranger); Adversarial not stranger-writable; Integration not writable (runbook never located); Recovery ambiguous ("drill-asserted" — executed or documented?).

**Wording fixes named:** define "app-voice call sites" at first use; split the D4 re-home sentence per site; replace "no alias window" with an explicit wire-compatibility sentence; add view-binding refusal as second Overview exception; name the idempotency property; say whether rollback is executed or documented; locate the runbook; expand folklore anchors; define "escalation standing" at first use.

---

## Stage 7 — Design Critique

**D1 — SOUND in part, UNSOUND in two mechanisms.** Verified: `SeaForgeAuthority` (:313) with busy-retry `exchange` (:220-230) and 256 KB cap (:321); server verbs `authority_approvals`/`authority_closure` exist (cep_authority.rs:197, :306); #76 checks real (Pending-state cep.rs:1188; expiry; requester≠resolver sea-forge-authority/src/lib.rs:2968-2987). Failures:
- **`resolveApproval` cannot express delegation.** Both existing resolve callers send `on_behalf_of` (Horizon adapter:88, Workbench governance.ts:141); the SDK class has a single `actor`, no delegate field. As drafted, resolve goes out as the service actor — which Horizon's own adapter refuses (:65) and the server refuses when service is requester. Horizon's decide path needs it too (`delegating-authority.ts:52` sends `on_behalf_of` for session operators over a raw socket — a feature `decide` lacks).
- **`expectedCriteriaSha256` has no server-side referent.** `ApprovalStanding` (cep.rs:711-741) carries no criteria field; `resolve_approval` (cep.rs:1173-1256) has nothing to compare; the sfwp `PendingApproval.criteria_sha256` (:94) is captured at case-task request time — the cep escalation path has no equivalent capture. The matching acceptance row is unachievable as written.
- Request-id unification breaks `submitEvidence`'s content-derived replay-dedup id (:385) and ignores `decide`'s envelope-coupled id; `delegating-authority.ts:44-50` builds envelope + `request_id` itself (R1's "no caller constructs ids" false in letter).
- **Silent security downgrade:** the `Request` enum has no `deny_unknown_fields`, so a new client's new field is **silently dropped** by a pre-0.4.0 server — resolution proceeds with no view-binding, indistinguishable from enforced.
- Minor: "semantic SFWP addition" misnomer (`authority_approval` is the CEP authority verb).

**D2 — SOUND.** Rename claim TRUE (named-field JSON, no discriminator; casework-go parses by field names); schema carries `title: "PendingApproval"`, no `$id` (immaterial); contracts-home byte-stable-provable (`gen_sfwp_schema.rs:137-147` + `SFWP_SCHEMA_OUT_DIR` drift-diff). Approval-gate lineage: diverged at 11efa4b1 (pre-#81), ~4,280 insertions/25 files incl. CLI approve/resume (cfb16c18), promotion.rs, declaration.rs, thoth — **not demonstrably a subset of #81-83**; commit-mapping required before freeze, not at review.

**D3 — SOUND.** Capability IDs are the contract; actor checks stay app-side; `createSxrCliPort` exists. Note: `src/capabilities/README.md` (:55-58, :148) documents `seaForgeCall` as exported — rewire must update the README.

**D4 — PARTIALLY SOUND.** Typed `approvalId` TRUE (model.ts:740/756-758; stamped app.ts:439, read :494/:518). Vendored-rot TRUE; cognate 0.8.0 verified on public npm. But deletion blast radius exceeds the draft: importers include `src/adapters/delegating-authority.ts` (a **third** raw-socket site), `scripts/gateway-setup.ts` (`seaForgeActorOf`), app.ts env/actor exports, and 6 test files. Exceptions file must name three sites, not two.

**D5 — SOUND as order**; gateway deployment to 0.4.0 is an unstated prerequisite of the roundtrip row.

**Rollout-window analysis:** (1) mixed fronts mid-train: safe. (2) **new SDK vs pre-0.4.0 gateway: the real 3 AM failure** — unknown field silently dropped; the gateway upgrade must be an explicit train step. (3) 0.4.0 vs older clients (casework-go, SDK 0.8.x): safe. (4) schema-cache staleness: low risk. (5) de-vendor atomicity: `.cognate/vendor/` deletion + pins + lockfile in one commit; verify clean install in CI. (6) branch disposition timing: if the roundtrip's resume step needs unique approval-gate content (cfb16c18), the train discovers it after freeze — map commits before cutting 0.4.0.

**Verdict: SOUND-WITH-CHANGES** — name the delegate identity in the API; specify or descope the view-binding; exempt content-derived request ids; gate new fields on server version; widen deletion/exceptions to the real import graph.

---

## Stage 8 — Intermediate Zoom Out

**Mixed-state windows:** W0 status quo; **W1 — 0.4.0 cut, fronts not adopted: the rename has a verified unhandled consumer — sea-rs's own `workbench/packages/contracts/generated/PendingApproval.ts` + validator + schema + `ApprovalInboxPage.tsx` bind the old name inside sea-rs itself**; D2 names only casework-go; the re-pointed drift test watches only the new home, so no gate sees the divergence. W2 — Workbench adopted, Horizon vendored: harmless, but name it. **W3 — the whole train vs the deployed gateway: 0.4.0 is tagged but never deployed to the protected instance; the runbook's `expectedCriteriaSha256` meets pre-0.4.0 behavior — undefined. Largest unnamed window.**

**Convergence ledger:** moves closer — hardened approval path under dogfood load; tagged 0.4.0/0.9.0 (precondition for install story + tags-pinned readiness gate); contracts-home; RealityTrace dedup; de-vendored Horizon. Correctly deferred — identity (T2, starts at resolution), real-world connector (product-strategy). **Silently dropped — adjudication consequence (i), the SWE_SEED green run: appears only as a non-goal citing D-N3, which ratified Gauntlet's exclusion, not this.** **Never scheduled — install profiles (brief Stage 3) make the dogfood product installable; no transformation owns them.**

**Operational findings:** **Blocker — gateway deployment absent from the sequence** (add step; name who upgrades; rollback ordering: gateway-to-0.3.x vs adapter-restoration cannot be independent). **Major — D4 contradiction** (strict landed vs staged story; `readAuthorityClosure` a strange name for a verb whose existing usage is a write returning b/c accounting). **Major — rename misses sea-rs's own workbench contracts** (regenerate in-train or accept divergence until renderer deletion). **Minor** — runbook prerequisites (who executes; which identity resolves pre-T2; owner involvement for tagging/deploying per sibling-repo rules); id unification loses the content-derived evidence id — verify SEA-Forge replay dedup or preserve content-derived ids; vendor inventory also holds `godspeed-identity-0.1.0` (T2's deletion — list for exact scope).

**Debt-absorption audit:** teeth→T2 absorbed; rename absorption missing the renderer contracts; **`expectedCriteriaSha256` version-coupling creates debt absorbed by nothing** (no deploy step, no version-pair assertion); registry pins fine; lineage disposition correct.

**Verdict: CONVERGES-WITH-CHANGES** — add gateway deployment + rollback ordering; resolve the D4 contradiction; cover the workbench contracts in the rename; give SWE_SEED green run and install profiles an explicit owner.

---

## Stage 9 — Implementation Readiness

**Per-PR file-level changes:** sea-rs train — `sfwp/approvals.rs` (rename; the standing row already carries `criteria_sha256` at :94), `gen_sfwp_schema.rs`, `tests/conformance_sfwp.rs:721-772` re-point, `conformance_approvals.rs` negatives, justfile target, casework-go adapters + live tests. UNDER-SPECIFIED: (1) resolve view-binding named in D1 but absent from D2's train list; (2) `resolveApproval` omits `on_behalf_of` — both callers send it and requester≠resolver depends on it; SDK has only the `cognate-service` default; (3) `readAuthorityClosure` args/typed result unspecified; (4) `listApprovals` actor field (Horizon sends `actor`, Workbench none); (5) request-id scheme replaces today's deterministic ids (`horizon:<approvalId>:<resolution>`) — sea-rs correlation.rs pins request_id for SF-006 replay dedup; uuid-per-attempt changes retry idempotency; the design doesn't decide.

cognate — one PR acceptable (verbs + operator option + request-id + suites), consider splitting request-id; release-please group publishes ~45 packages at 0.9.0 (one failure stalls Horizon's pin sweep). Workbench — verified; base branch unstated. Horizon — **misses third raw client `delegating-authority.ts:27` (injects `seaForgeCall` as raw verb passthrough)**; **five test files import the adapter being deleted** (`J02-live.test.ts:25`, `J02r2-live.test.ts:11`, `approval-inbox.test.ts:5`, `remote-sessions.test.ts:18`, `gateway-setup.test.ts:3`) — deleting without rewiring breaks the cited acceptance suites; **`@godspeed/identity` pinned 0.1.0 and NOT in cognate's linked-versions group — blanket "registry pins 0.9.0" impossible for it**; 41 `file:` refs total.

**Acceptance mapping:** parity suite extends existing `sea-forge-authority.test.ts` (fixture-socket harness MISSING — name it); `J02-live` owner-opt-in only, Horizon has no CI workflows; negative matrix MISSING home; teeth mutation precedent is `scripts/teeth-tNN-mutation.ts` (design says "T10" — not the on-disk name); roundbook exists but prerequisite chain (build at tag → `just gateway-stage` → sudo installer → systemctl restart) unstated, sudo/machine-specific, never CI; perf row partially satisfied today (`sea-forge-busy.test.ts` exists).

**PR decomposition (12 PRs):** #84 (fix Majors in-branch) → contracts-home → view-binding resolve → rename-apart → lineage disposition (**evidence favors close-as-superseded: merged #79 (652ed710) already binds approval to the exact pending operation and refuses content that differs, duplicating the branch's `dcaf3049`**) → release PR #74 rebase → cognate verbs → group 0.9.0 → Workbench adoption → Horizon de-vendor → Horizon adoption+teeth+label → deploy gateway v0.4.0 + roundtrip. **Ordering constraint missed: gateway at 0.4.0 must deploy before fronts send new fields — additive-safety covers unknown verbs, not new fields on existing verbs.**

**Hidden blockers:** Workbench checkout 110 commits ahead of main + 48 dirty — adoption from `main` with commit-only-src discipline or the PR drags 110 feat commits; cognate group publish stall risk; #74 rebase collisions; Q3 cites "#14/#15" but only #15 is currently open (stale reference).

**Verdict: READY-WITH-CHANGES** — seven required changes listed (operator param; delegating-authority + test files in scope; view-binding enumerated in train with conformance tests; request-id idempotency decided vs SF-006; identity de-vendor exception; gateway-deploy-before-fronts ordering; name the missing test homes).
