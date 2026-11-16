# 03 · Essential Design Hypothesis

Phase 2 reasoning from the whole system. **The claim:** the GodSpeed estate already contains one coherent essential system; it does not need new architecture, it needs *convergence, completion of the governed-commit-to-settlement path, and retirement of parallel surfaces*. EGM operators used: General (what must the system do) → Specific (which owner holds each responsibility) → Concrete (which existing code, unchanged, provides it), with concrete cases feeding back (brief v3 blockers revise the target).

Theory check: the capability list below is the **CognitiveOS Manifesto v17 §1 governing question** ("Given an observer's current horizon, desired direction, representational state, payment capacity, governance constraints, capability, and developmental memory — what is the next affordable move…") projected into product terms; the Math Layer v2.3's design contract ("continuous state, discrete settlement"; measurable inputs, calibration path, failure criteria) is the same discipline the settlement/evidence spine implements. The hypothesis is theory-consistent, not merely code-consistent. The **Master UI Specification v1.0** (2026-11-04, design-only) independently reaches the same boundary: its out-of-scope list ("no new authority, ontology, settlement engine, SurfaceV2 expansion") is this hypothesis's preservation set stated from the presentation side, and its A–E work-scope gate is the enforcement mechanism for P/UI work.

## 1. The essential capabilities (General)

Strip the estate to what a user must be able to *do*:

1. **Know the world** — a compiled, immutable semantic world (`world_ref`) that every participant verifies identically.
2. **See what is presently actionable** — observer-relative affordances, with blocked/unknown/contradicted states inspectable, not hidden.
3. **Commit consequential work under independent authority** — default-deny, escalate-to-human, fail-closed, once-only.
4. **Know what actually happened** — pre-declared expectations vs independently recorded observations; execution ≠ settlement.
5. **Recover** — interruption, stale frames, stuck holds, restart; nothing silently lost or double-done.
6. **Learn** — evidence over repeated settlement becomes developmental interpretation; failure stays in the record.
7. **Retrieve reference material without granting it authority** — cited, scoped, classed as `untrusted_reference`.

Everything else in the estate is a means to these, or is not essential.

## 2. Responsibility allocation (Specific) — the hypothesis

Each capability keeps exactly the current owner. This is the load-bearing claim: **the existing authority topology is correct and needs no re-architecture**; the defects are in *seams and duplication*, not in ownership.

| Responsibility | Owner (unchanged) | Concrete provider (exists today) |
| --- | --- | --- |
| Canonical semantics + world identity | DomainForge | `parseSourceMap → domainModelIdentityJson → worldRefFromIdentityJson → verifyWorldRef` (0.21.2) |
| Application events, projections, capabilities, continuations | Cognate SDK | 0.8.0, governed-operation dispositions, outbox |
| Authority (allow/deny/escalate), approvals, settlement declarations | SEA-Forge | SFWP v1, authority engine, declaration ledger |
| Evidence & observation truth | RealityTrace | hash-chained ledger, E8, three-branch comparison |
| Bounded long-horizon execution | Gauntlet | frozen Reference runs (optional engine; not required per-commit) |
| Software-work proof contract + capability governance | SWE_SEED | trace lifecycle + `gate --verify` + settlement transport |
| Cited reference retrieval | Context Kernel | `query_reference`, `context_required` |
| Envelope contracts | CEP | 8 godspeed schemas |
| Observer navigation, presentation, developmental interpretation | **Horizon** | cockpit (terminal/GUI/remote), frames, debugger |

## 3. Preserve / Modify / Merge / Retire / Complete

### Preserve (earned)
- The six-product authority spine as allocated above. Evidence: live J02 round-trip, world_ref enforcement at four boundaries, deterministic traces (see `01` §6).
- Two distinct product fronts: **Horizon** (organizational operator navigation) and **Cognate Workbench** (accountable coding-agent harness). They serve different users and different journeys; merging them would couple an operations product to a development tool. Keep both; converge *mechanisms* (identity, approval client, design tokens), not products.
- Horizon's proof-first UI pipeline (IDM → Behavioral IR → proof → Atomic UI IR → projections). It is slower per screen and it is why the cockpit's claims stay honest; do not let UI pressure invert it.

### Modify
- **M-1. Cognate becomes the single exporter of the SEA-Forge client + shared identity.** Land `horizon/shared-identity` (f4d4db6), export `seaForgeCall` and typed approval list/resolve from the SDK, adopt the Workbench capability contracts as the canonical approval surface. Deletes Horizon's hand-copied adapter (P3.1) and Workbench's private path. *Gained:* one approval shape, one identity story, INV-2 satisfied. *Lost:* none material; Workbench loses a local convenience. *Verify:* live suite in both consumers + the service-actor-refusal test (already exists at `cognate/packages/runtime-bun/test/sea-forge-live.test.ts:282`).
- **M-2. Reconcile the approval wire shape.** `ApprovalStanding::to_json` is the contract (it is what the live server emits); fix `PendingApproval.schema.json` to match; add `state`; carry `decision_id`/`criteria_sha256` in resolve so stale approvals are refused at the boundary. (Brief v3 Steps 0/3.)
- **M-3. Horizon's execution ledger re-binds to reality.** Give the cockpit/settlement work T-task identity (or a plan amendment): either fold P1–P8 into the DAG as T11a/T23+ or re-freeze the plan pointing at the production-readiness classes as the active plan. Preregister the settlement-approval gate as its task with evidence dir + independent confirmation. *Gained:* one map of what is being built; gate stubs stop contradicting reality.
- **M-4. Terminal accounting atomicity + stuck-hold reclaim** (brief v3 Blocker 2) before any capacity move. One commit; startup reclaim for `awaiting_authority`; local-store tests.
- **M-5. Context Kernel adapter moves from spawn-per-request to a persistent managed process** behind the existing capability + policy (scope pinning and the 8-outcome set stay). Cheaper than MCP handshake adoption and keeps Horizon's fail-closed classification.

### Merge
- **MG-1. sea-rs settlement lineages → one reviewed lineage.** Land PR 84 (claim-lease) → resume-lease → approval-gate, then cut 0.4.0 and *run the prepared live roundtrip runbook*. The three branches implement one feature; they must arrive as one story with one live proof.
- **MG-2. Approval/settlement *presentation patterns*** (not code) between Workbench and Horizon: adopt Workbench's `DESIGN.md` tokens + card state machine as Horizon's P8 donor, with the existing spec-compatibility check per component. Owner's own work in both repos; attribution per donors policy.

### Retire (or archive)
- **R-1. sea-rs `workbench/` renderer + `apps/godspeed-cognitive-ui`** once confirmed not on any product path (backend bridge already gone). SEA-Forge's operator surface is Horizon/Workbench; a third UI in the kernel repo is overpayment. *Check before deleting:* whether casework-go or packaging consumes them.
- **R-2. `tree-sitter-sea` + `domainforge-vsc-extension`** → archive explicitly (dormant PoCs superseded by the CI-gated pest grammar and, if wanted later, a revived LSP). Decide `domainforge-lsp` separately: bump to 0.21.x and finish `semantic-adapter`, or archive. Recommendation: bump only when an editor integration is actually a product goal (it is not on any current journey).
- **R-3. `godspeed_agent` after T17/T21 extraction.** It is the predecessor by design; the migration branch should land *as a source for extraction*, not as a maintained system. RuVector bridge disposition: fold the derived-index capability into the research subsystem (T21) or Context Kernel's vector adapter — indexes are not authority either way.
- **R-4. Legacy pre-SEA repos in the workspace** (`SEA`, `NewSea`, `XSEA`, `godspeed`, `hermes-agent-sea-forge`, `zeroclaw-sea-forge`, …): out of the GodSpeed core list; recommend a workspace archive pass (move to an `archive/` root) — **owner decision, zero product impact**.

### Complete (the genuinely missing)
- **C-1.** SPEC-CR-003 settlement approval gate + live roundtrip (drafted, not run) — the single highest-value completion; it closes "external settlement escalates to a human."
- **C-2.** REQ-NAV-008..013 implementation: capacity ledger semantics, expected outcomes, IS7 settlement, RT-1, with gate J02r2 recorded green against live binaries.
- **C-3.** Whole-stack readiness re-run at converged heads (T-2) — this is also the natural P3 independent confirmation vehicle for C-1/C-2.
- **C-4.** CEP hash algorithm + canonicalization (T-18) — small spec fix, large verifiability payoff.
- **C-5.** Glossary single-meaning pass for case/capacity/projection/settlement/observer-local (T-17) — cheap, unblocks Stage-5 case binding.
- **C-6.** Installable distribution story: sea-forge 0.4.0 tag, sxr release tag, SWE_SEED candidate→green, Gauntlet tag-or-explain-PostgreSQL; then a single "GodSpeed operator install" path that doesn't require the owner's hands per machine (T-19).

## 4. Alternatives weighed (and why rejected)

| Alternative | For | Against | Verdict |
| --- | --- | --- | --- |
| Consolidate SEA-Forge settlement into RealityTrace | One evidence/settlement system | Different authorities: SEA-Forge declares *operational obligations from an authority decision*; SXR records *observations*. Merging erases the independent-observation invariant the whole spec rests on | **Rejected** — genuine difference in authority and failure domain |
| Merge SWE_SEED into Gauntlet | Both are "work contracts" | SWE_SEED = light, local, per-edit proof + capability governance; Gauntlet = bounded long-horizon loop w/ frozen Reference, budget, PostgreSQL. Different weight classes, different failure domains; SEA-Forge already consumes SWE-seed as a *settlement authority transport* | **Rejected** — keep both; document the boundary once (C-5 adjacent) |
| Move Horizon's capacity/case writes to Cognate now | Matches owner direction | Breaks single-commit atomicity, no migration spec, needs spec bump (brief v3 Blockers 3–6, Alternatives table row A) | **Rejected for now** — brief v3's Option C (read-only projection, Horizon keeps writing) is the interim |
| Generic resource/capability framework in Cognate | Reusable | "Framework in disguise" — brief v3 Option D, owner already warned | **Rejected** |
| Build Horizon's GUI-first, defer proofs | Faster visible progress | Inverts the R1–R5 chain that keeps UI claims honest; exactly what the spec's evidence gates exist to prevent | **Rejected** |
| Adopt MCP handshake for Context Kernel now | Standard | CK's own SSE/MCP composition isn't the bottleneck; spawn-per-request is. M-5 gets the win without a protocol migration | **Deferred** |

## 5. The minimum sufficient architecture, stated plainly

> DomainForge compiles the world; Cognate runs the application and is the *only* process speaking to authorities on applications' behalf; SEA-Forge decides and settles; RealityTrace observes; Gauntlet and SWE_SEED execute work under contract; Context Kernel cites; Horizon navigates and presents. Two product fronts (Horizon, Workbench) share identity, authority-client, and design tokens through Cognate. One live whole-stack proof at pinned heads is the conformance ruler.

Everything in the estate that is not in that sentence should either justify itself against a current journey or retire.

## 6. What this hypothesis deliberately does *not* answer

- Whether Horizon's cockpit branch work merges as PR #14 first or after SPEC-CR-003 lands (sequencing — Decision D2).
- Gauntlet's PostgreSQL requirement for non-developer installs (Decision D5).
- Editor-tooling revival (R-2) — no current journey needs it.

Those are owner calls; see `05-decision-register.md`.
