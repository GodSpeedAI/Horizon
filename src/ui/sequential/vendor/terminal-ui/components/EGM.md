# components — prompt controls barrel (vendored)

## Overview

The public component surface of the vendored terminal UI: the prompt shell and the two interactive
controls built on it. `index.ts` is a three-line re-export barrel with no logic, no state and no
default export.

Donor code copied from `GodSpeedAI/Terminal-UI` (see `../EGM.md` and `../README.md`); not Horizon's
authored surface.

## Interface

- `Confirm`, `type ConfirmProps` `[index.ts:Confirm]` — see `./confirm/EGM.md`.
- `Prompt`, `type PromptProps` `[index.ts:Prompt]` — see `./prompt/EGM.md`.
- `Select`, `type SelectOption`, `type SelectProps` `[index.ts:Select]` — see `./select/EGM.md`.
- Child contracts: [confirm](./confirm/EGM.md), [prompt](./prompt/EGM.md), [select](./select/EGM.md).

## Invariants

- `index.ts` only re-exports; it declares no symbol, evaluates nothing and holds no state
  `[index.ts:Confirm]`.
- Both controls render their entire shell through `Prompt`, so no control reimplements the rail,
  marker, hint row or collapse `[select/select.tsx:Select]`, `[confirm/confirm.tsx:Confirm]`.

## Side Effects

- None observed in source. Importing the barrel evaluates only module-level declarations.

## Verification

- Run: `bun test`
