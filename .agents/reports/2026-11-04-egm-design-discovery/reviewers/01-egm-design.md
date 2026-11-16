# Goldfish Review — egm-design lens (raw, as returned)

Fresh-context reviewer, dispatched 2026-11-04 per `egm-brainstorm` Step 2. Received: central design question (verbatim), hypothesis `03-essential-design-hypothesis.md`, facts `01`/`02`/`07`, Master UI Spec. Excluded from its package: `04`/`05`/`06` (independence). Unedited except for this header.

---

**F1. Major — §5's "Cognate … the only process speaking to authorities" is overclaimed by its own modify list.** M-1 exports `seaForgeCall` + approval list/resolve only. Horizon's `authority_closure` write (`src/app.ts:776`) and `authority_approvals` economics read (`src/app.ts:1011`) remain raw app-voice calls with no Cognate API planned; nothing in M-1..M-5 covers them. Also "process" is the wrong unit: the Cognate runtime is *embedded* in Horizon's process (`runtime.runtime.service.invoke`), so INV-2 is about which code path holds the socket — and M-1 leaves at least two non-runtime paths. The ruler sentence states a property the modify list does not deliver.

**F2. Major — the Operate preflight cannot be realized as specified; the hypothesis misses the architectural defect.** UI spec INV-2 requires all seven gates visible "including non-pass reasons." Today `capability`, `recovery` (and all gates for read-only moves) are hardcoded `pass` (`src/adapters/navigation.ts:47-49`, `src/app.ts:988-990`), and authority is always `deferred_to_invocation` because — per Horizon's own comment — "SEA-Forge has no evaluate-only preview" (`src/app.ts:983`). SFWP has a dry-run only for case plans (`case.preflight`, `sea-rs/docs/reference/sfwp-protocol-reference.md:92`), not for governed-operation authority. So "who decides, before I commit" is structurally unanswerable; C-1/C-2 complete payment/outcome/settlement, not authority preview. This is an authority-surface API gap, not a seam.

**F3. Major — the Work composition has no mechanism, and the hypothesis's convergence set omits exactly that.** UI spec §7/Phase 3 requires "actual available sessions"; Horizon has no session runtime (`src/agents/` holds only `navigation-commit.ts`, `health.ts`), and the UI spec itself flags session/tool patterns "do not assume built into Horizon runtime" (§4.2). M-1/MG-2 converge identity, approval client, design tokens — none produces a session handoff or facade. Either Work-in-Horizon is class-D unavailable indefinitely, or a session facade is *new architecture*, contradicting "no re-architecture needed."

**F4. Major — operator identity is misallocated; "seams, not ownership" is wrong here.** Both fronts resolve approvals as the service actor `on_behalf_of` the operator over the same uid-owned socket (`cognate-workbench/src/capabilities/governance.ts:1-6`; `Horizon/src/adapters/sea-forge-approvals.ts:1-9`). M-2's `decision_id`/`criteria_sha256` fix staleness, not identity. The topology has no first-class operator principal at SEA-Forge; under `local_operator` the separation-of-duties check rests on convention plus one refusal commit (18f0c40). This is the most plausibly misallocated responsibility in the table.

**F5. Major — M-4 is stale and partially wrong against HEAD.** Terminal-accounting atomicity and stranded-hold reconcile landed 2026-11-02 (commit 087fecc; `test/pending-terminal-atomic.test.ts`), in the branch under review. And `pending-reconcile.ts:3-5` deliberately does *not* reclaim `awaiting_authority` holds ("never released here… reported as a blocker") because a late approval must find its capacity for once-only resume. M-4's "startup reclaim for `awaiting_authority`" as written would break resume. The hypothesis was argued from brief v3, not from HEAD; its "exists today" column is not fully reliable — which also taints T-14 in the facts baseline.

**F6. Minor — capacity is per-front, not systemic; Option C institutionalizes it.** The ledger governs only Horizon navigation intents (`src/capabilities/capacity-ledger.ts:1-10`). Workbench- and Gauntlet-originated consequential work passes SEA-Forge with no affordability check (sea-rs dossier: "No dedicated affordability engine"). AGENTS.md §10 demands fail-closed on a missing hard affordability gate — estate-wide in intent, one-front in fact.

**F7. Minor — SWE_SEED and Gauntlet are unearned in the "minimum sufficient architecture" sentence.** Neither is installed; SWE_SEED has no green packaging run (07 dossier); neither appears in J01–J06 (UI spec §8). SWE_SEED's load-bearing role is settlement transport for *software* work (Workbench path). Including them in §5's ruler and C-6's install path couples Horizon's completion to the two least-packaged components. Gauntlet's own README frames it as a consumer of SEA-Forge decisions, not a dependency of the product experience.

**F8. Minor — M-1/M-2 tension.** M-1 canonicalizes "the Workbench capability contracts" while M-2 declares Workbench's generated `PendingApproval.schema.json` wrong (requires `case_id/run_id/plan_item_id/decision_id`; live server emits `ApprovalStanding::to_json`, `sea-rs/crates/sea-forge-authority/src/cep.rs:727-741` — verified). Canonicalize-then-rewrite needs explicit sequencing or consumers re-bind twice.

**F9. Minor — M-1 also collides with an existing deliberate decision.** The Cognate facade intentionally does not re-export heavy adapters (`cognate/packages/cognate/src/index.ts:8`) — today's duplication is partly policy, not pure drift; M-1 must say "new opt-in subpath package," not "export from the SDK."

**F10. Minor — M-5 keeps a private dialect.** A persistent process still speaking raw one-line `tools/call` without MCP `initialize` (CK dossier) remains brittle against CK's own versioning; persistence and handshake adoption are separable, and the "cheaper" argument conflates them.

**F11. Minor — CEP retained standalone while its hash debt (C-4/T-18) is exactly what M-2's `criteria_sha256` stale-refusal depends on. Dependency order is inverted: fix hashes before making approval staleness ride on them.**

## Assumptions rejected

1. "The existing authority topology is correct and needs no re-architecture" — rejected for operator identity (F4) and affordability (F6); both are allocation questions, not seams.
2. "Two product fronts… merging would couple an operations product to a development tool" — a false binary. The Master UI spec already couples them at the experience level (Work composition inside Horizon's shell); the real question is the missing session-runtime boundary (F3), which the hypothesis never addresses.
3. "Lost: none material" (M-1) — unproven while the contract being canonicalized is simultaneously declared wrong (F8).
4. The theory-consistency paragraph (Manifesto v17 §1, Math Layer v2.3) — decoration; the UI spec it cites as independently converging cites manifesto v13.1 (T-EGM-3). Drop it; it adds no defensive value.

## Structural alternatives

**Alt 1 — Operator as a first-class SEA-Forge principal.** Extend SFWP resolution to carry an operator credential verified by SEA-Forge (gateway-issued; Horizon's two-account hardening and WebAuthn pairing are half-built inputs; `sod_violation` already exists as an error class). *Consequences:* self-approval refusal becomes structural (closes T-15 at the boundary, not in each front); audit names the human; phone/remote approval becomes genuine; recovery improves (approvals independent of service identity and app restarts). *Costs:* frozen SFWP v1 revision, gateway key management, both fronts migrate resolve paths. *Migration:* medium; can ship behind the existing `on_behalf_of` path as fallback.

**Alt 2 — Affordability at the choke point.** Make capacity a SEA-Forge-side input: an `AffordabilityProvider` mirroring the existing pluggable `SettlementAuthority`, or an `authority_request` claim SEA-Forge refuses without a reservation proof. *Consequences:* one hard affordability gate over Horizon, Workbench and Gauntlet work uniformly; the Option C split brain is eliminated rather than interimed; Horizon's ledger code survives as the first provider implementation. *Costs:* SFWP/CEP change; observer-relative config becomes visible to the authority kernel (needs the provider pattern to keep SEA-Forge stateless). *This is the honest reading of AGENTS.md §10 if it means estate-wide fail-closed.*

**Alt 3 — Ship Work as a typed handoff, not a Horizon-internal surface (v1).** A minimal cross-product handoff contract (case_ref + world_ref + session pointer into Workbench); Work-in-Horizon renders honest unavailable until a session facade exists. *Consequences:* UI Phase 3 becomes truthful immediately; zero duplicated session runtime; six journeys stay green; cost is admitting the Work composition is not realizable from existing mechanisms — directly falsifying "convergence and completion suffice." *Migration:* near zero (UI spec §0's availability rule already permits omission); user burden is a context switch between products.

## Evidence that would change my mind

- A recorded J02r2-live pass plus the settlement roundtrip runbook run green (C-1/C-2) — downgrades the settlement half of F2's impact (not the authority-preview half).
- An SFWP evaluate-only authority verb, or an owner decision that `deferred_to_invocation` is the permanent intended semantics — collapses F2 to minor.
- A Workbench session facade or working handoff prototype showing Horizon can host real sessions without new architecture — collapses F3.
- Operator-credential design already present in the unmerged sea-rs settlement lineages (21 commits unread in detail) — shows F4 is owned, not missed.
- Evidence that Workbench/Gauntlet-originated work is refused by SEA-Forge today without a capacity proof — collapses F6.

Verdict: the spine (DomainForge/Cognate/SEA-Forge/RealityTrace/Horizon) is defensible and live-tested; the hypothesis is weakest exactly where it claims most confidence — "ownership is correct, only seams are wrong" — on operator identity, affordability scope, and the Work surface.
