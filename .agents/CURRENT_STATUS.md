# Horizon Current Status

**Revision:** 32 · **Recorded:** 2026-11-01T00:00:00Z · **Stage:** unchanged settlement state — spec HORIZON-001 **1.1.0** frozen (SPEC-CR-002: payment and IS7 settlement); REQ-NAV-008..013 not yet implemented; next ready task **T11**. Two **non-normative** recon reports added.

**Spec:** HORIZON-001 v1.1.0, frozen 2026-10-23; SHA-256 `d5ba60b08def01a4f996f6153b654a1e1148c3f2555ea32a61490a114f98a907`.

## Recon deliverable — Palantir Foundry + AI FDE (non-normative, no task settled)

Applied the owner-supplied `replica-recon` skill to the operator-confirmed slice *"the Ontology system that
encodes the data, logic, action and security of the enterprise to automate decisions across business
operations + the agent that builds it."* Output: `.agents/reports/2026-11-01-palantir-foundry-aifde-recon.md`
(54 screens, 12 flows, ~50 entities, UI/UX anatomy, evidence grades) and
`2026-11-01-palantir-foundry-aifde-features.csv` (65 rows). Public sources only: docs, architecture center,
one conference page, two official recordings, one practitioner recording, and 56 public product screenshots.

Three passes: docs and marketing; then official recordings plus the AI FDE screenshots; then the
ontology-half screenshots, which upgraded the type wizard, action authoring and submission criteria from
`[D]` to `[O]`. Pass 3 reversed six further inferences — most importantly that **security is authored with
the type** (step 6 of a six-step creation wizard, a per-property policy table) rather than configured
afterwards, that the wizard **generates Create/Modify/Delete action types and requires a submit authority**
(`Organization | Group | User`), and that submission criteria are a nested `MATCH ALL / MATCH ANY` predicate
tree over typed operands rather than a flat condition. It also produced the recon's only observed negative
state: a disabled action with tooltip `Invalid state to apply action`.

All 56 screenshots are staged in `.tmp/palintar-screens/` (six folders) with `INDEX.md` mapping every file to
its screen ID and public source URL. `.tmp/` is gitignored at `.gitignore:25`, so they cannot be committed
or shipped.

This changes no requirement, plan task, gate or proof level. It is comparative research recorded where
`.agents/AGENTS.md` says investigations live. Grading note for future readers: no Palantir account was used,
so empty/error/denied states remain unobserved; the report marks every claim `[O]`/`[D]`/`[I]`/`[?]` and
carries a corrections table against its own first pass.


## SPEC-CR-002 — spec 1.1.0: payment and IS7 settlement (normative, not yet implemented)

Six independent review rounds (Codex; final verdict ACCEPT; `.agents/candidates/horizon/SPEC-CR-002/REVIEW.md`). Payment is a list of per-currency entries checked against capacity with an atomic reservation at commit, never summed (REQ-NAV-008..010). An intent that needs settlement carries a frozen expected outcome: a pinned, read-only verifier template run by RealityTrace, a discrimination run after authority and before execution, and three-valued settlement by SEA-Forge from evidence completed before the window deadline (REQ-NAV-011..013). Ledger: 105 requirements, frozen `HORIZON-001-1.1.0@2026-10-23`.

Not yet implemented: the interaction-model migration (new world_ref), the capacity ledger, expected outcomes, IS7 settlement and RealityTrace RT-1. They ship together with gate J02 revision 2. Until then J02 reports IS2 and IS7 open.

## Readiness P04 steps 1-3 — SEA-Forge decides navigation commits; escalations wait for the operator; settlement is SEA-Forge's

Step 3: `settleNavigationIntent` records J02 IS6's `execution_record`, `realitytrace_observation` and `settlement_reference`. The governed commit's trace reaches RealityTrace through Cognate's outbox; RealityTrace's own evidence goes to SEA-Forge, which corroborates it against RealityTrace's ledger and answers `unsettled` (execution is not settlement). What cannot be obtained is `unavailable` with the reason. Live: `test/J02-live.test.ts`. Cognate SDK 0.6.3 makes the trace a pure function of the committed event, so the hash check holds at any later time (0.6.2 matched only within the same second).

Step 1: createHorizonRuntime and createApplication accept Cognate GovernanceOptions (default from COGNATE_GOVERNANCE / COGNATE_SEA_FORGE_SOCKET / COGNATE_WORLD_REF; off when unset). Cognate SDK 0.6.3.

Step 2: with governance on, a commit runs as `horizon.navigation.commit`, so SEA-Forge's escalate parks it on a durable approval. `submitIntent` throws `AwaitingAuthorityError` (audited `awaiting_authority`; `POST /intent` answers 202). `resolveNavigationApproval` records the human operator's decision at SEA-Forge (`on_behalf_of` the operator in `COGNATE_SEA_FORGE_OPERATOR`); SEA-Forge revalidates on resume and the run writes the record. A rejection commits nothing.

Exactly once per `intent_id` (per tenant): an index record written atomically with the intent event; the same intent returns the first record; a different intent under that id is `duplicate_intent` (audited, on both paths). The guard was documented before but not implemented. Horizon polls SEA-Forge, so an approval made there directly still resumes the commit; the run audits its own acceptance.

Live proof: `test/J02-live.test.ts` (real sea-forge-server): allow / deny / offline, and escalate -> self-approval refused -> operator approval commits once -> rejection commits nothing. Limits: an approval never revives a stale frame (the frame register is in memory); no HTTP approval route. Next: IS6 (RealityTrace observation, settlement reference); IS2/IS7 need a SPEC-CR candidate.

## T10 — Source-grounded seven-operation world debugger

The debugger answers `why`, `impact`, `diff`, `timeline`, `counterfactual`, `reach` and `replay`
from the T06 projection read behind the same T07 frame the terminal and GUI render. Context Kernel
retrieval sits beside that answer as cited reference material, reached only through the
boot-registered `horizon.context.query_reference` capability.

- **Every value is labelled.** `recorded`, `derived`, `unknown`, `effect` or `untrusted_reference`,
  each with a source; an `unknown` always names the source that records nothing.
- **Retrieval grants nothing.** Citations are classed `untrusted_reference` by Horizon itself,
  never by copying what the server said, so a retrieved instruction cannot become an action.
- **Refusals are typed.** Bounds are required rather than defaulted; undeclared relations are
  refused by name; denied, unavailable and no-match stay three distinct observations.
- **A cross-checkpoint read says so.** `diff`/`timeline` name the checkpoint actually read in
  `scope.comparison` and never rewrite the frame's own `checkpoint_ref`.

**Defect found and fixed while building the teeth.** `inspectFocus`'s `argumentsFor` returned
`{ operation }` for `counterfactual`, `replay` and `impact`, so every operation's own arguments were
silently discarded: a counterfactual with a proposal could only be refused, and `impact` could never
be bounded through the application surface. The caller's arguments are now passed through and the
debugger — not the adapter — decides validity. Two further boundary breaks were corrected: `src/ui`
imported the Context Kernel adapter (replaced with a local structural contract), and two comments
tripped the donor-reference check.

**Teeth.** 11 teeth (NE-01…NE-10 plus a PE-14 boundary tooth) each assert the typed refusal *and*
that navigation still answers, so a debugger that had simply broken cannot pass them. A mutation
runner then breaks one protected property at a time in a throwaway tree and requires failure by
assertion: 11/11 caught, including a direct Context Kernel import in the surface.

**Verified:** `just gate-t10` exit 0 · `just verify` exit 0 · 139 pass / 0 fail (20 files) plus
4 research tests · `tsc --noEmit` clean · boundaries ok · spec SHA-256 unchanged.

**Limits.** No independent confirmer signed this round, so P3 is not claimed. No live Context
Kernel process was spawned: the capability, its policy, its registration and its scope refusals are
production ones, but the wire is scripted, so `integration_level` stays `fixture`. Operational rows
remain fixture-produced. `declaredFor` declares no relation types, so bounded `impact` is exercised
only by driving `runDebugger` directly (logged in `DEBT.md`). Checkpoint restore filters current
rows, which is exact only while the projection is additive.

**Next:** T11.
