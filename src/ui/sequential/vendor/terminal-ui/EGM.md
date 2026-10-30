# terminal-ui — vendored Clack-style prompt library

## Overview

A vendored copy of the terminal prompt library Horizon's sequential renderer draws with. The tree
provides a prompt shell, two interactive controls (`Select`, `Confirm`), a theme layer with a closed
state vocabulary, rail/text primitives, keyboard and width hooks, and styling/cell-width utilities.

This is **donor code**, not Horizon's authored surface. The directory README states that "Horizon's
sequential controller supplies the business state. Nothing under this directory reads a Horizon
frame, invokes a capability or decides availability; it only renders a prompt and emits the answer
the caller gives it." See `## Provenance` below.

The root barrel `[index.ts:components/index.js]` re-exports the components, the hint builders, the
prompt-state hook, both primitives modules, the whole theme layer, and both utils modules. It does
**not** re-export `./hooks/use-prompt-keys.ts` or `./hooks/use-available-width.ts`; those are
reachable only by deep import.

## Interface

- Root barrel re-exports `[index.ts:components/index.js]`: `./components/index.ts`,
  `./hooks/hints.ts`, `./hooks/use-prompt-state.ts`, `./primitives/index.ts`, `./theme/index.ts`,
  `./utils/style.ts`, `./utils/text.ts`.
- Public entry points used by Horizon: `Confirm`, `Select`, `ThemeProvider`, `type SelectOption`
  `[components/index.ts:Confirm]`, `[theme/context.ts:ThemeProvider]`.
- Child contracts: [components](./components/EGM.md), [hooks](./hooks/EGM.md),
  [primitives](./primitives/EGM.md), [theme](./theme/EGM.md), [utils](./utils/EGM.md).
- Attribution and scope: [README.md](./README.md) (unmodified donor note).

## Invariants

- The library holds no application state: no module in the tree reads a Horizon frame, a capability
  or an availability verdict; controls accept `phase`/`error` from a caller and emit
  `onSubmit`/`onCancel` `[components/select/select.tsx:Select]`,
  `[components/confirm/confirm.tsx:Confirm]`.
- Presentation is state-driven, never glyph-driven at the call site: components pass a `MarkerState`
  name and the theme supplies the glyph and paint `[theme/state.ts:MarkerState]`.
- Module resolution inside the tree uses explicit `.js` specifiers against `.ts`/`.tsx` sources,
  e.g. `../../hooks/hints.js` `[components/confirm/confirm.tsx:Confirm]`.
- `ThemeProvider` is the only required mount-time dependency for the primitives; without it
  `useTheme` falls back to `defaultTheme` `[theme/context.ts:useTheme]`.

## Side Effects

- Terminal interaction is confined to the hooks: keyboard subscription via `useKeyboard` and width
  measurement via `useTerminalDimensions`, both from `@opentui/react`
  `[hooks/use-prompt-keys.ts:usePromptKeys]`, `[hooks/use-available-width.ts:useAvailableWidth]`.
- Rendering targets OpenTUI layout primitives (`<box>`, `<text>`); no HTML, DOM or browser API is
  touched anywhere in the tree.
- No file system, network, clock or environment access in the tree.

## Provenance

`README.md` in this directory states the copy came from `GodSpeedAI/Terminal-UI` at commit
`793215499ef6149988711c92c935b06e13315eb9` (2026-10-20), "copied under the MIT license", and that
"only the prompt shell and the `Select` / `Confirm` controls, their shared theme, primitives, hooks
and utilities are included. The Workbench, scenarios, other controls and visual tests are not."
It also directs readers to `THIRD_PARTY_NOTICES.md` at the repository root for attribution and the
upstream license text. This contract adds nothing to that attribution and does not restate licence
terms; consult the notices file for the binding text.

## Verification

- Run: `bun test`
