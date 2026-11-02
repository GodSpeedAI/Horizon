# Settlement

## Overview

The obligation flow for a bound operation, plus the retry helper for a closure SEA-Forge has not
recorded yet. `obligation.ts` implements the order of operations of SPEC-CR-002 §4 — prepare, claims,
discrimination run, verification runs, closure — and records what it was told; it decides nothing that an
owner records. RealityTrace records every run and SEA-Forge reads the closure (C) and settles.

`settle-awaiting-closure.ts` is a bounded retry policy over that flow: `cep_settlement_pending` is a
pending outcome, not a refusal, so the caller retries with doubling backoff until the deadline and then
returns the pending result.

## Interface

- `obligation.ts`: `ObligationRefusal` with `code = "failed_precondition"` and message
  `INTENT: refused (<refusal>)` `[obligation.ts:ObligationRefusal]`; `ObligationDeps` = `{ store,
  tenant, realityTrace, settlement, allowances, settlementConfigured, now, digestOf? }`
  `[obligation.ts:ObligationDeps]`; `SeaForgeObligation` with `closure(operationId,
  discriminationObservationId, verificationObservationIds)` returning `{ b, c, committed_at, on_time }`
  `[obligation.ts:SeaForgeObligation]`.
- Steps: `prepare(deps, binding, intent, rawExpectation): Promise<PendingIntent>`
  `[obligation.ts:prepare]`; `claimsFor(pending, closeGraceS)` `[obligation.ts:claimsFor]`;
  `discriminateRun(deps, binding, pending)` `[obligation.ts:discriminateRun]`; `verifyRun(deps, binding,
  pending)` `[obligation.ts:verifyRun]`; `close(deps, pending, seaForge)` `[obligation.ts:close]`;
  `refuse(deps, intentId, refusal): Promise<never>` `[obligation.ts:refuse]`.
- Gates and digests: `bindingGates(deps, binding, expectation)` returning `{ payment,
  settlement_access }` `[obligation.ts:bindingGates]`; `fileDigest(path): string | null`
  `[obligation.ts:fileDigest]`; `observedDigests(binding, digestOf?)` `[obligation.ts:observedDigests]`;
  `argvFor(binding, intentId)` `[obligation.ts:argvFor]`; `argvDigest(argv)` prefixed `sha256:`
  `[obligation.ts:argvDigest]`.
- `settle-awaiting-closure.ts`: `settleAwaitingClosure(attempt, options): Promise<T>`
  `[settle-awaiting-closure.ts:settleAwaitingClosure]`; `SettleAwaitingClosureOptions` = `{ deadlineAt,
  now?, sleep?, initialDelayMs?, maxDelayMs? }` `[settle-awaiting-closure.ts:SettleAwaitingClosureOptions]`;
  `CLOSURE_PENDING_ERROR_CLASS = "cep_settlement_pending"`
  `[settle-awaiting-closure.ts:CLOSURE_PENDING_ERROR_CLASS]`; `isClosurePending(result)`
  `[settle-awaiting-closure.ts:isClosurePending]`.
- Consumed by `../agents/navigation-commit.ts` (the commit run) and `../app.ts` (close/settle routes).
- Subdirectories: none.

## Invariants

- `prepare` refuses unless **both** gates return `verdict === "pass"`, with the failing gate's name and
  reason in the refusal; a `fail` verdict is worded `blocked` `[obligation.ts:prepare]`.
- An operation that does not require settlement and carries no expectation reserves a pending intent with
  `expectation`, `threshold`, `window` and `verifier_argv` all `null`; anything else must carry an
  expectation that passes `assertExpectedOutcome` `[obligation.ts:prepare]`.
- The pending record and its capacity reservation are written in one commit by `reservePendingIntent`, and
  the flow is idempotent per intent (the same expectation replays the stored record)
  `[obligation.ts:prepare]`.
- `argvFor` throws `ObligationRefusal` when the binding declares no verifier template, and when the
  binding names no path for a named artifact; only the effect identity (the intent id) is substituted
  `[obligation.ts:argvFor]`.
- `claimsFor` returns `undefined` unless expectation, threshold, window and verifier argv are all present
  `[obligation.ts:claimsFor]`.
- A verifier run never happens after a digest mismatch: `artifactMismatches(...).length > 0` returns
  `null` before any invocation `[obligation.ts:runVerifier]`.
- A window already closed refuses the invocation: `discriminateRun` returns
  `{ proceed: false, refusal: "discrimination unknown" }` without running the verifier
  `[obligation.ts:discriminateRun]`.
- The discrimination run's timeout is capped at 120 s and is derived from the window and the settlement
  close grace `[obligation.ts:discriminateRun]`; a `null` timeout means the run does not happen at all.
- `close` is a no-op unless the window has closed **and** the pending record has both an
  `operation_id` and a discrimination run, and it never re-closes an already-closed record
  `[obligation.ts:close]`.
- Retry policy: only the error class decides — message text is never matched — and `settleAwaitingClosure`
  returns the result immediately when the remaining time is `<= 0`, sleeping at most the remaining time
  and doubling the delay up to `maxDelayMs` `[settle-awaiting-closure.ts:settleAwaitingClosure]`.
- `isClosurePending` requires both `ok === false` and the exact class
  `[settle-awaiting-closure.ts:isClosurePending]`.

## Side Effects

- Durable writes through the store: `reservePendingIntent(...)` in `prepare` `[obligation.ts:prepare]`;
  `updatePending(..., { discrimination: run })` after the discrimination run
  `[obligation.ts:discriminateRun]`; `updatePending(..., { verifications: [...] })` after each
  verification run `[obligation.ts:verifyRun]`; `updatePending(..., { closure })` in `close`
  `[obligation.ts:close]`; `terminate(..., "refused", refusal, deps.now())` in `refuse`
  `[obligation.ts:refuse]`.
- Process spawns by proxy: `deps.realityTrace.run(threshold, argv, launcher, timeoutS)` runs the pinned
  verifier under the configured launcher `[obligation.ts:runVerifier]`. Before each run `takeSnapshot` (`snapshot.ts`)
  copies the live WAL store (`VACUUM INTO`, renamed atomically) to `<settings.snapshot_dir>/app.sqlite`; the verifier's
  `--store` literal names that path and the launcher must `--ro-bind` the snapshot directory, not the live store's.
  A failed snapshot refuses the run (`discrimination unknown: <reason>`).
- Network: `seaForge.closure(...)` calls SEA-Forge to record the closure
  `[obligation.ts:close]`.
- Filesystem reads: `existsSync` + `readFileSync` + `createHash("sha256")` per artifact, returning `null`
  when the file cannot be read, because a missing artifact is a mismatch
  `[obligation.ts:fileDigest]`.
- Clock and timers: `deps.now()` for window and deadline arithmetic `[obligation.ts:discriminateRun]`;
  `Bun.sleep(ms)` as the default sleep `[settle-awaiting-closure.ts:settleAwaitingClosure]`.
- Ledger read: `readLedger(deps.store(), deps.tenant, deps.allowances)` before the gates are assessed
  `[obligation.ts:bindingGates]`.

## Verification

- Run: `bun test`
