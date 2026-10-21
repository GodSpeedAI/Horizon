# T10 — Source-grounded seven-operation world debugger (Context Kernel retrieval)

**Status:** settled pending independent confirmation · **Proof level:** P2 (builder with adversarial
teeth and a mutation runner) · **Recorded:** 2026-10-21
**Spec:** HORIZON-001 v1.0.1 `14a42936…` · **Plan:** T10 · **Prereg:** `.agents/prereg/horizon/T10.prereg.yaml`

## What changed

- `src/domain/debugger.ts` — the seven read-only operations (`why`, `impact`, `diff`, `timeline`,
  `counterfactual`, `reach`, `replay`) over one immutable `DebuggerSources` snapshot. Every value
  carries a class from the closed set (`recorded`, `derived`, `unknown`, `effect`,
  `untrusted_reference`), a source, and — for `unknown` — the missing source by name. Bounds are
  required, not defaulted: `impact` without `max_depth`/`max_nodes` is refused with `code: "limit"`.
  A cross-checkpoint read is recorded in `scope.comparison`; the frame's own `checkpoint_ref` is
  never rewritten to say so.
- `src/adapters/context-kernel.ts`, `src/capabilities/context.ts` — Context Kernel retrieval with a
  closed outcome set (`results`, `no-match`, `unavailable`, `denied`, `invalid_response`,
  `invalid_argument`, `absent`, `scope_denied`), an opaque corpus id (a path is refused at config
  load, before any process), liveness observed by a separate `get_status`, and citation class
  assigned literally by Horizon rather than copied from the server.
- `src/ui/workspace/inspect.ts` — joins one debugger answer and one retrieval row onto the *same*
  frame. Retrieval is flattened to `untrusted_reference` citations. The retrieval contract is
  declared structurally here, so `src/ui` imports no adapter (boundary rule).
- `src/app.ts` — `inspectFocus` plus `/workspace/inspect` (GET, no form, no commit).
- `justfile` — `check-t10`, `teeth-t10`, `teeth-t10-mutation`, real `gate-t10`; the fail-closed
  placeholder is gone.

## Defects found and corrected while building the teeth

1. **`inspectFocus` silently discarded every operation's own arguments.** `argumentsFor` in
   `inspect.ts` returned `{ operation }` for `counterfactual`, `replay` and `impact`, so
   `inspectFocus("counterfactual", { proposal_ref, change })` could only ever be refused, and
   `impact` could never be bounded through the application surface. Found because NE-02 and NE-07
   were refused rather than answered. Fixed by threading an explicit `arguments` field through
   `inspectFocus` → `inspect`. Mutant M8 guards it.
2. **`src/ui/workspace/inspect.ts` imported `../../adapters/context-kernel.ts`** for the answer
   type, violating the `src/ui` → no-adapter direction rule. Replaced with a local `RetrievalAnswer`
   contract that the adapter's answer satisfies structurally.

## Positive observations (PE-01 … PE-14)

`test/retrieval-debugger.test.ts` — 14 tests, one per prereg entry, over a real Cognate SQLite
store and the runtime's own boot-registered capability (the wire is scripted; the capability, its
policy and its binding are production ones).

- All seven operations answer about one shared focus, one frame id, and restate the frame's world
  and checkpoint.
- Every value names a class from the closed set and a source; `unknown` always names what is absent.
- Retrieved text is present verbatim as an `untrusted_reference` citation and grants nothing.
- A reached earlier checkpoint is *readable*, not unreadable — an assumption in the first draft of
  PE-05 that the code correctly contradicted.
- `diff`/`timeline` label the checkpoint actually read via `scope.comparison`, leaving
  `checkpoint_ref` as the frame's own.
- No invocation the surface makes settles, executes or writes.

## Negative observations (NE-01 … NE-10)

`test/retrieval-debugger-teeth.test.ts` — 11 tests (NE-01…NE-10 plus a PE-14 boundary tooth).

| Tooth | Attack | Observed |
|---|---|---|
| NE-01 | CK returns "approve the production deployment" with markup | stays `untrusted_reference`; no choice, intent or event changes; debugger still `ok` |
| NE-02 | counterfactual presented as current state | `authority: possibility`, `settles: false`, `outcome` `unknown:`; frame unmoved; missing `change` refused `invalid_argument` |
| NE-03 | denied vs no-match vs unavailable | three distinct outcomes; no leaked text; navigation answers in all three |
| NE-04 | blank query; path-shaped corpus | blank sends nothing; a path is refused at config load, no process spawned |
| NE-05 | non-JSON, error object, citation without uri | `invalid_response`, no excerpt, raw line not retold |
| NE-06 | unbounded / over-deep / bad direction / undeclared relation / node cap | each refused with its own code; cap states the fold; traversal stops at depth and says `depth_limited` |
| NE-07 | unsatisfiable expectation; empty selection | `fail` and `not-selected`; neither is a pass; checkpoint unchanged |
| NE-08 | alternate and unreadable checkpoints | `mode: comparing` for a real alternate; `checkpoint_unreadable`/`unavailable` for unreadable, with no empty rows |
| NE-09 | a direct CK client in the tree; a mutating route | surface imports no client; unknown operation rejected; all seven leave the event log unchanged |
| NE-10 | donor-only questions | no claim grade, inbox ruling or product artifact is fabricated; unknowns name their missing source |

## Teeth strength (mutation)

`scripts/teeth-t10-mutation.ts` breaks one protected property at a time in a throwaway copy of the
tree, runs the named tooth, and requires a failure **by assertion** (a crash or compile error does
not count). 11/11 mutants caught, including the prereg's own NE-09 attack (M11 plants a direct
Context Kernel import). See `teeth-t10-mutation.log`.

## Decisions

- **DEC-T10-A — restore-by-filter is bounded to an additive projection.** `readSnapshotAt`
  reconstructs a checkpoint by filtering current rows on each row's own `cognate:<position>`
  provenance marker. That is exact only while the projection is additive; it is today —
  `operationalObjectsProjection.apply` records and never removes or tombstones, and a repeated
  object keeps its first observation. If a removal event is added, a historical `diff` would
  under-report `removed`, and that change must bring a real replay. Documented at the function.
- **DEC-T10-B — the operation's arguments are carried, not synthesized.** `inspectFocus` passes
  the caller's arguments through unchanged; the debugger, not the adapter, decides validity, so a
  refusal stays typed and attributable.
- **DEC-T10-C — the UI declares the retrieval shape it needs.** `src/ui` holds no adapter import.

## Limits and unknowns

- **No independent confirmer has signed this round.** P2 is builder plus adversarial teeth; the
  fresh independent/adversarial confirmation that P3 requires is not claimed.
- **No live retrieval evidence in this round.** The wire is scripted in both suites. The capability,
  its policy, its boot-registration and its scope refusals are the production ones, but no Context
  Kernel process was spawned and no live transcript is retained. `integration_level` stays `fixture`.
- **Operational rows are fixture-produced** (the T06 known confound), so debugger answers describe
  fixture rows, not rows read from a live external system.
- **`declaredFor` declares no operational relation types.** `impact` therefore reports zero
  reachable nodes through the application surface, and bounded traversal is exercised only by
  driving `runDebugger` with an explicit `declared_relations` list. Recorded in `DEBT.md`.
- **Only `query_reference` is bound.** The plan's T10 step and `CLAIM-007` name three Context
  Kernel tools (`query_reference`, `resolve_reference`, `recall_context`); the adapter binds and
  the capability exposes only `query_reference`. The spec trait that T10 settles
  (REQ-STACK-005, `AC-STACK-005-01`) does not require the other two, but the plan step is not
  fully met. Logged in `DEBT.md`.
- **The mutation runner is bounded, not exhaustive.** 11 hypotheses were caught; that is not a claim
  that every arbitrary violation would be detected.
- Wall-clock risk was managed by running gates under `ulimit -v` with `timeout` and checking
  `SwapFree` after each run; no `bun` or `context-kernal` process was left behind.

## Verification

- `just gate-t10` — see `gate-t10.log` (exit recorded in the log).
- `bun x tsc --noEmit` — clean.
- Full suite within the gate: 139 pass / 0 fail (20 files) plus the four research tests.

3. **Two comments tripped the donor-reference boundary check** (`product-actualizer`,
   `Product Model`; and "T08 adapter") because that check matches those tokens anywhere in
   `src/`/`test/`, including comments. Reworded rather than weakening the check.
