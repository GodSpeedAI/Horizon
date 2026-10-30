# hooks — keyboard, width and prompt-state hooks (vendored)

## Overview

Three concerns, one directory: key normalisation and routing to the active prompt, width
resolution with a simulated-width escape hatch, and the prompt lifecycle state machine wired to
the transition table in `../theme/state.ts`. `hints.ts` is deliberately not a hook — it is a set of
pure functions of the theme, so building a hint inline in a defaulting expression cannot create a
conditional hook call.

Donor code copied from `GodSpeedAI/Terminal-UI` (see `../README.md`); not Horizon's authored
surface.

## Interface

- `KeyName`, `NormalizedKey`, `normalizeKey(event)` — normalise an OpenTUI `KeyEvent`
  `[use-prompt-keys.ts:normalizeKey]`.
- `isPrintable(key)`, `isCancelChord(key)` `[use-prompt-keys.ts:isPrintable]`,
  `[use-prompt-keys.ts:isCancelChord]`.
- `KeyHandlerMap`, `PromptKeysOptions`, `usePromptKeys(handlers, options)`
  `[use-prompt-keys.ts:usePromptKeys]`.
- `useKeyEffect(active, fn)` — run `fn` on every key press while active
  `[use-prompt-keys.ts:useKeyEffect]`.
- `SimulatedWidthProvider`, `useAvailableWidth(override?)`, `useBodyWidth(availableWidth, gutter)`
  `[use-available-width.ts:useAvailableWidth]`, `[use-available-width.ts:useBodyWidth]`.
- `PromptStateOptions`, `PromptState`, `usePromptState(options)` `[use-prompt-state.ts:usePromptState]`.
- `navigateConfirmHints(theme, extra?)`, `submitHint(theme)`, `cancelHint(theme)`,
  `toggleHint(theme)`, `confirmHint(theme)` `[hints.ts:navigateConfirmHints]`.

## Invariants

- Routing precedence in `usePromptKeys` is fixed and enforced in this order: cancel chord → named
  `KeyName` handler → `command` → `print` (only if `isPrintable`) → `any`
  `[use-prompt-keys.ts:usePromptKeys]`.
- The keyboard listener is inert when `active` is false: the callback returns before reading the
  handler map `[use-prompt-keys.ts:usePromptKeys]`. Handlers are stored in refs and reassigned every
  render, so `handlers` identity does not need to be stable `[use-prompt-keys.ts:usePromptKeys]`.
- Ctrl+C is never swallowed implicitly: `isCancelChord` matches `ctrl` plus name `"c"` or text
  `"c"`, and only invokes `cancel` when the map supplies one `[use-prompt-keys.ts:isCancelChord]`.
- `isPrintable` refuses `ctrl`/`meta`, the named navigation/commit keys (`up`, `down`, `left`,
  `right`, `return`, `escape`, `tab`, `space`), `backspace`, `delete`, text beginning with `ESC`
  (`/^\x1b/`), and any first code unit below `0x20` `[use-prompt-keys.ts:isPrintable]`.
- `useKeyboard` is registered with `{ release: false }` `[use-prompt-keys.ts:usePromptKeys]`.
- Width precedence is `override ?? simulated ?? width`, and `undefined` is meaningful: it means
  "no simulation running" `[use-available-width.ts:useAvailableWidth]`.
- `useBodyWidth` clamps at zero and propagates `undefined` `[use-available-width.ts:useBodyWidth]`.
- `usePromptState` treats an illegal transition as a no-op, not an error: `nextPromptPhase`
  returning `null` returns the current phase `[use-prompt-state.ts:dispatch]`.
- `submit` returns `"submitted"` when the prompt was already `complete`, `"invalid"` otherwise,
  and only calls `onSubmit` after validation passes `[use-prompt-state.ts:submit]`.
- Derived flags are fixed: `interactive` = `active | validating | error`; `resolved` =
  `complete | cancelled` `[use-prompt-state.ts:usePromptState]`.
- `reset` clears the error and falls back to `"active"` when `nextPromptPhase` has no `reset` edge
  `[use-prompt-state.ts:reset]`.
- Hint builders are pure theme lookups; `confirmHint` advertises `${left}/${right}` with
  `format: "space"` and `navigateConfirmHints` advertises `${up}/${down}` then `theme.keys.enter`
  `[hints.ts:confirmHint]`, `[hints.ts:navigateConfirmHints]`.

## Side Effects

- `usePromptKeys` subscribes to the OpenTUI keyboard via `useKeyboard` and calls
  `event.preventDefault()` / `onHandled` for every handler it runs
  `[use-prompt-keys.ts:usePromptKeys]`.
- `useAvailableWidth` reads `useTerminalDimensions()` — a live terminal measurement
  `[use-available-width.ts:useAvailableWidth]`; `SimulatedWidthProvider` creates and provides a
  React context value `[use-available-width.ts:SimulatedWidthProvider]`.
- `usePromptState` calls `setError`, `validateRef.current` and `onSubmitRef.current` from **inside**
  the `setPhase` updater function `[use-prompt-state.ts:submit]`, and `onCancelRef.current` inside
  the `cancel` updater `[use-prompt-state.ts:cancel]`.
- `useKeyEffect` installs a subscription even when its `active` argument is false — it passes
  `{ active: true }` to `usePromptKeys` and gates inside the handler `[use-prompt-keys.ts:useKeyEffect]`.

## Verification

- Run: `bun test`
