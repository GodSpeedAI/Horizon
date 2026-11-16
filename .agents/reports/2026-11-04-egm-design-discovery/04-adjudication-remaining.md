# 04 · Adjudication Remaining (2026-11-05)

**Status:** owner provisional directions received and evaluated; this memo supersedes `03-adjudication-decisions.md` Part 2 where the directions resolve a decision, and names what still blocks `egm-draft`. No source modified; no draft started.

**Owner directions (verbatim, evaluated in §1):** Cognate Workbench first as the installable dogfood product · Horizon remains the intended world-first navigation product · Shared Cognate authority mediation, enforced in stages · Preserve distinct authority-escalation and case-plan human-task concepts · Prefer canonical SDK identity handling where its semantics are proven · Do not preserve or reject existing contracts merely because they were previously frozen · Favor subtraction, simplification, and completion over introducing more architectural machinery.

**State delta since the reviews:** sea-rs origin/main absorbed #81/#82/#83 (resume-lease settlement fixes, F-A/F-B closed) — **PR #84 is the one open settlement lineage**, plus release PR #74 (0.4.0). Horizon `settlement-external-approval-gate` is now open **PR #15**. All other HEADs unchanged from the dossiers.

## 1. Direction evaluation (each checked against review evidence — none taken on authority)

| # | Direction | Verdict | Consequence carried into the draft |
| --- | --- | --- | --- |
| 1 | Workbench-first dogfood | **Confirmed** (= A-1b, the reviews' strongest convergent challenge) | Two critical-path additions: (i) SWE_SEED native packaging must record a green run — workflow exists (`native-candidate.yml`), never run; (ii) **Workbench adoption of the SDK client is now gated, not "tracked"** — the implementation-readiness lens's "track, don't gate" rule inverts when Workbench is product #1. Horizon's J02r2 live proof continues in parallel, not first. |
| 2 | Horizon remains the intended product | **Confirmed** | J01/J03–J06 stay fixture-proven until a real-world connector exists (zoom-out N-7). That gap is now explicitly a *product-strategy* item, not an architecture defect — owned outside this transformation. |
| 3 | Shared Cognate mediation, staged enforcement | **Confirmed** (= A-2 strict-staged) | The boundary rule must name Gauntlet/SWE_SEED as exempt *peers* (they talk to SEA-Forge by design), not violations. v1 teeth = "no SFWP socket code in product `src/`" + a dated named-exception list for Horizon's two remaining app-voice calls (`app.ts:776` closure write, `:1011` approvals read at current HEAD). Exceptions close when resolve becomes a governed capability (identity transformation). |
| 4 | Keep both approval concepts | **Confirmed** (= A-3a) | Wire contract: `ApprovalStanding::to_json` documented as the contract for escalation standing; sfwp `PendingApproval` documented and regenerated as the case-plan human task. Rename-apart mechanics (e.g. `CaseTaskApproval` with one-minor wire alias) are draft detail, not an owner decision. |
| 5 | SDK identity where its semantics are proven | **Confirmed — the qualifier does real work** | "Proven" needs a bar. Proposed: SDK `packages/identity` must pass Horizon's **live gateway E2E WebAuthn scenario** (existing `test/E2E-remote.test.ts` path) plus a pairing round-trip before any Horizon local implementation (`src/remote/{webauthn,pairing,cbor}.ts`) is deleted; spec amendment 1.2.0→1.3.0 binds REQ-SEC-006 to the package (owner-gated re-freeze at resolution time). Until that bar passes, identity stays out of the shipping perimeter. |
| 6 | Contracts not sacred | **Consistent** with mission §Design authority | Bites in exactly two places now: the approval-wire documentation-as-contract (semantic, justified — the live wire becomes the contract) and the identity spec re-freeze (semantic, owner-gated). The SFWP evaluate-only verb (A-7) stays deferred — no need to spend this authority in transformation 1. |
| 7 | Subtraction / simplification / completion | **Confirmed** | Concrete subtractions in scope: both hand-rolled `seaForgeCall` copies (Workbench `src/capabilities/governance.ts:56`, Horizon `src/adapters/sea-forge-approvals.ts:110` — both verified *less hardened* than the SDK client); Horizon's vendored-tgz set (de-vendor to registry pins; stale 0.7.0 tarballs already present); Horizon local webauthn/pairing/cbor (post-swap, identity transformation); sea-rs `workbench/` renderer (after the contracts-home move); 7 zero-external-consumer Cognate packages (optional hygiene, same release). |

## 2. Decisions necessary to draft the first transformation

**D-N1 · Scope of the first formal transformation** *(the one blocking decision)*

- **Option A — Authority Mediation only (recommended).** sea-rs 0.4.0 train (merge PR #84 → resolve the two CodeRabbit Majors → approval-gate lineage disposition → contracts-home move → cut 0.4.0) + SDK `SeaForgeAuthority` gains `listApprovals`/`resolveApproval`/closure-read → both fronts adopt and delete hand-rolled copies → INV-2 teeth with dated exceptions → de-vendor Horizon. Identity explicitly excluded → becomes transformation 2.
  - *Why:* smallest coherent; every mechanism verified to exist; identity is L-size and implicates frozen spec 1.2.0 — a failure there would contaminate the mediation release; identity does not block dogfood (the boundary already enforces requester≠resolver; the `on_behalf_of` path works today). Two Cognate minors (release-please automation exists) are cheap.
- **Option B — Mediation + identity in one release** (the prior brief's Stage 1+2). One Cognate release instead of two; closes the "who resolves" question immediately. *Against:* L-size risk in the same envelope; the direction's own "where proven" qualifier argues for sequencing; the identity proof bar (§1.5) requires live-gateway work that is its own verification campaign.

**D-N2 · Pre-agree the identity proof bar + spec path** *(non-blocking; recommended now so transformation 2 can start the day transformation 1's review resolves)* — adopt §1.5's bar (live E2E WebAuthn + pairing round-trip before deletion; 1.2.0→1.3.0 amendment at resolution).

**D-N3 · Ratify Gauntlet excluded/frozen from the first shippable perimeter** *(one word; bundle with D-N1)* — implied by the dogfood choice and the subtraction direction; Gauntlet re-enters post-v1 unchanged if a journey consumes it.

## 3. Safely deferred (with riders)

| Decision | When | Rider |
| --- | --- | --- |
| A-6 cognitive-ui + casework-go pair | Retirement batch (post-v1) | Contracts-home move rides the 0.4.0 train regardless — it unblocks `workbench/` deletion and is provable-safe |
| A-7 authority evaluate-only verb | Post-v1 semantic revision | v1 ships honest "authority: decided at invocation" presentation; UI work sized accordingly |
| A-8 Work-surface handoff | Horizon UI phase (post-v1) | Typed cross-product handoff, honest-unavailable otherwise |
| A-9 ledger re-bind form | At resolution of transformation 1 | Amend the existing DAG once; owner signature then |
| sea-rs train reviewer designation | At draft | One designated reviewer for PR #84 + 0.4.0 |

## 4. Verification posture designed into the draft (per owner instruction)

Acceptance requirements embedded in the transformation design itself — no estate-wide test infrastructure is designed; every item names the repo-local suite that carries it: typed-client parity tests (both fronts, same verbs, same envelopes); wire-concept fixtures covering both approval concepts with negative cases (wrong-concept read, expired standing, malformed row excluded-from-count); INV-2 boundary teeth incl. mutation runner; existing green baselines regression on all touched repos (sea-rs, cognate, cognate-workbench, Horizon); the prepared live roundtrip runbook executed at the 0.4.0 tag (correctness + recovery + release evidence in one artifact); rollback path documented (0.4.0 revert + adapter restoration); idempotency/request_id unification tests (the `workbench:`/`horizon:` prefix divergence must resolve deliberately); performance non-goals stated explicitly (no new perf claims; existing busy-retry/256 KB-cap behavior asserted by test). Adversarial simulation: the stale-approval and wrong-actor refusal cases replayed against the typed client.

## 5. Stop

Awaiting D-N1 (optionally D-N2, D-N3 in the same pass) → `egm-draft` on the chosen scope → full independent `egm-review` → `egm-resolve`. No source modified, no draft started, no verification initiative launched.

## 6. Adjudicated (2026-11-05, owner)

- **D-N1: Mediation only.** Transformation 1 = Authority Mediation (sea-rs 0.4.0 train + SDK typed client + both-front adoption + INV-2 teeth + de-vendor). Identity excluded → transformation 2.
- **D-N2: Pre-agreed.** The §1.5 bar is adopted: SDK `packages/identity` must pass Horizon's live-gateway E2E WebAuthn scenario + pairing round-trip before any Horizon local deletion; spec amendment 1.2.0→1.3.0 binds REQ-SEC-006 to the package at resolution time.
- **D-N3: Ratified.** Gauntlet excluded/frozen from the first shippable perimeter; re-enters post-v1 unchanged if a journey consumes it.

Next per owner instruction: `egm-draft` on Transformation 1 → full independent `egm-review` → `egm-resolve`. Draft location: `.agents/reports/2026-11-05-t1-authority-mediation/`.
