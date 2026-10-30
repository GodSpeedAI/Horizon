# theme — closed state vocabulary and theme tokens (vendored)

## Overview

The semantic layer of the vendored UI. Components name a state (`active`, `selected`, `error`, …)
and never a glyph or a colour; this directory decides what a state looks like. `state.ts` owns the
closed unions and the prompt transition table, `types.ts` owns the theme contract and the state
catalogues, `base.ts` completes partial themes with documented fallbacks, and `context.ts` supplies
the active theme to every primitive. Three themes ship: `clack` (default), `ascii` (7-bit) and
`high-contrast`.

Donor code copied from `GodSpeedAI/Terminal-UI` (see `../README.md`); not Horizon's authored
surface.

## Interface

- `LifecycleState`, `SelectionState`, `ToneState`, `StepState`, `VisualState`, `MarkerState`,
  `StatusState`, `PromptPhase`, `PromptEvent`, `PromptSubmitResult` `[state.ts:VisualState]`,
  `[state.ts:PromptPhase]`.
- `PROMPT_TRANSITIONS`, `nextPromptPhase(phase, event)` `[state.ts:PROMPT_TRANSITIONS]`,
  `[state.ts:nextPromptPhase]`.
- `Theme`, `MarkerStyle`, `Glyph`, `ThemeSpacing`, `ThemeColor` `[types.ts:Theme]`.
- `MARKER_STATES` (16), `STATUS_STATES` (7), `LIFECYCLE_STATES`, `SELECTION_STATES`, `TONE_STATES`,
  `isVisualState(value)`, `glyph(char, width = 1)` `[types.ts:MARKER_STATES]`,
  `[types.ts:isVisualState]`, `[types.ts:glyph]`.
- `baseSpacing`, `defineTheme(partial)`, `uniform(color, dim = false)` `[base.ts:baseSpacing]`,
  `[base.ts:defineTheme]`, `[base.ts:uniform]`.
- `clackTheme` `[clack.ts:clackTheme]`, `asciiTheme` `[ascii.ts:asciiTheme]`,
  `highContrastTheme` `[high-contrast.ts:highContrastTheme]`.
- `themes`, `ThemeName`, `defaultTheme`, `ThemeContextValue`, `ThemeProvider`, `useTheme`
  `[context.ts:themes]`, `[context.ts:ThemeProvider]`, `[context.ts:useTheme]`.
- Barrel re-exports every module except `context.ts`'s non-exported `ThemeContext`
  `[index.ts:context.js]`.

## Invariants

- `PromptPhase` is a closed union of six values and `PROMPT_TRANSITIONS` is a total record over it;
  `nextPromptPhase` returns `null` for any event not present in the row
  `[state.ts:PROMPT_TRANSITIONS]`, `[state.ts:nextPromptPhase]`.
- The allowed edges are exactly the table: `idle → active|cancelled`; `active →
  active|validating|error|cancelled|idle`; `validating → error|complete|active|cancelled`;
  `error → active|validating|cancelled`; `complete → active`; `cancelled → active`
  `[state.ts:PROMPT_TRANSITIONS]`.
- `defineTheme` fills **every** `MARKER_STATES` entry and every `STATUS_STATES` entry, so no theme
  can render `undefined`: missing glyphs fall back to `glyph("?", 1)`, missing statuses fall back to
  `markers[state]` then the same fallback, missing styles fall back to `{ color: "white" }`
  `[base.ts:defineTheme]`.
- `spacing` is `{ ...baseSpacing, ...theme.spacing }`, so `railWidth: 1`, `bodyIndent: 2`,
  `labelGap: 1`, `optionGap: 1`, `hintGap: 1`, `rowGap: 0`, `blockGap: 1` are the defaults
  `[base.ts:baseSpacing]`.
- `defineTheme` refuses an empty spinner frame list: `theme.spinnerFrames?.length ?
  theme.spinnerFrames : [glyph("|", 1)]` `[base.ts:defineTheme]`.
- `ThemeProvider` memoises on the `theme` argument identity, so a theme switch re-renders consumers
  once `[context.ts:ThemeProvider]`; a theme may be passed as a built-in name or as a full `Theme`
  `[context.ts:ThemeProviderProps]`.
- `useTheme` never throws when no provider is mounted: it falls back to `defaultTheme`
  `[context.ts:useTheme]`.
- `asciiTheme` declares `ascii: true`, uses 7-bit glyphs only, and declares multi-cell glyphs with
  their true width (`checked: glyph("[x]", 3)`, `unchecked: glyph("[ ]", 3)`)
  `[ascii.ts:asciiTheme]`.
- `highContrastTheme` is built by spreading `clackTheme` and then replacing every style with a
  non-`dim` variant, so it changes emphasis and not meaning `[high-contrast.ts:highContrastTheme]`.
- `isVisualState` is a membership test against `MARKER_STATES` `[types.ts:isVisualState]`.

## Side Effects

- `ThemeProvider` creates and provides a React context value `[context.ts:ThemeProvider]`; every
  other export here is a pure value or function.
- `asciiTheme` is never inferred from terminal probing — the module comment states it is "selected
  explicitly or forced from the Workbench", and no code reads the environment or a TTY to choose a
  theme `[ascii.ts:asciiTheme]`.

## Verification

- Run: `bun test`
