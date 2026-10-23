# Horizon Current Status

**Revision:** 27 · **Recorded:** 2026-10-23T03:35:06Z · **Stage:** T10 settled; readiness P04 step 2 (escalation waits for the operator's SEA-Forge approval) landed; next ready task **T11**

**Spec:** HORIZON-001 v1.0.1, frozen; SHA-256 `14a42936fe3a17c3726ee57fbc9278fd6f6e92276f67519fd9bf0f605f3324a4`.

## Readiness P04 steps 1-2 — SEA-Forge decides navigation commits; escalations wait for the operator

Step 1: createHorizonRuntime and createApplication accept Cognate GovernanceOptions (default from COGNATE_GOVERNANCE / COGNATE_SEA_FORGE_SOCKET / COGNATE_WORLD_REF; off when unset). Cognate SDK 0.6.2.

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
