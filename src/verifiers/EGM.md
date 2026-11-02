# Verifiers

## Overview

The vetted verifier binaries Horizon pins into an operation binding. A verifier answers one falsifiable
question about the effect of a committed intent and exits with a three-valued verdict, so "could not
check" is never reported as a pass. `intent-recorded.ts` is compiled to one self-contained binary by
`bun run scripts/build-verifier.ts`, whose sha256 pins everything it executes.

## Interface

- `intent-recorded.ts` — `horizon-verify-intent`, the verifier for REQ-NAV-011
  `[intent-recorded.ts:1]`.
- CLI: `horizon-verify-intent --store <snapshot of the horizon store.sqlite> --tenant <tenant> --intent <intent_id>`
  `[intent-recorded.ts:arg]`; arguments are read positionally from `process.argv`
  `[intent-recorded.ts:arg]`.
- Exit codes: `0` the store records the committed `NavigationIntentRecord` for exactly this intent;
  `1` it does not; `2` the check could not be made `[intent-recorded.ts:32]`.
- Index read: `SELECT value FROM records WHERE collection = ? AND id = ?` against
  `INDEX_COLLECTION = "horizon.navigation-intent-index"` and the composite id `${tenant}/${intentId}`
  `[intent-recorded.ts:INDEX_COLLECTION]`.
- Consumed by the operation binding named in `config/horizon.toml` and run through
  `../settlement/obligation.ts:argvFor` / `runVerifier` `[../settlement/obligation.ts:argvFor]`.
- Subdirectories: none.

## Invariants

- A missing argument exits `2` with `horizon-verify-intent: missing <name>` on stderr; no argument is
  ever defaulted `[intent-recorded.ts:arg]`.
- The database is opened read-only: `new Database(store, { readonly: true })`
  `[intent-recorded.ts:32]`.
- Absence is a fail, not a pass: a `null` row logs `intent <intentId> is not recorded` and exits `1`
  `[intent-recorded.ts:36]`.
- The record must name the same intent: `value.intent_id !== intentId` logs
  `the index entry for <intentId> names <other>` and exits `1` `[intent-recorded.ts:41]`.
- Any throw — including a missing or unreadable store and malformed JSON — exits `2` with the error text
  on stderr, so an undefined check is never a pass `[intent-recorded.ts:47]`.

## Side Effects

- Filesystem read: opens the SQLite store named by `--store` read-only
  `[intent-recorded.ts:32]`; nothing else is touched `[intent-recorded.ts:11]`.
- Process exit: `process.exit(0|1|2)` `[intent-recorded.ts:32]`.
- Output: one line per verdict on stdout, diagnostics on stderr
  `[intent-recorded.ts:36]`.
- No network, clock, randomness or environment reads: the binary is run by RealityTrace under a launcher
  that gives it a read-only view and no network `[intent-recorded.ts:11]`.

## Verification

- Run: `bun test`
