# Horizon Current Status

**Revision:** 24 · **Recorded:** 2026-10-21T14:55:00Z · **Stage:** T10 settled (P2 builder + teeth + mutation); next ready task **T11**

**Spec:** HORIZON-001 v1.0.1, frozen; SHA-256 `14a42936fe3a17c3726ee57fbc9278fd6f6e92276f67519fd9bf0f605f3324a4`.

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
