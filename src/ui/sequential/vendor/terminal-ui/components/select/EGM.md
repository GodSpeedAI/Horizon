# select — single-choice list control (vendored)

## Overview

The reference interactive control: a scrolling single-choice list with a keyboard model, its own
collapsed summary, and disabled-option handling. It contributes only the option list, the keyboard
map and the summary — the rail, question, hint row, error presentation and collapse belong to
`Prompt`, "which is what keeps the visual grammar from being reimplemented per control".

Donor code copied from `GodSpeedAI/Terminal-UI` (see `../../README.md`); not Horizon's authored
surface.

## Interface

- `SelectOption<TValue>` — `value`, `label`, `hint?`, `disabled?` `[select.tsx:SelectOption]`.
- `SelectProps<TValue>` — `message`, `options`, `initialIndex?`, `onSubmit?`, `onCancel?`,
  `validate?`, `phase?`, `error?`, `maxVisible?` (default `8`), `availableWidth?`, `disabled?`,
  `hint?` `[select.tsx:SelectProps]`.
- `Select<TValue>(props: SelectProps<TValue>)` — the component `[select.tsx:Select]`.
- Re-exported with its types by the sibling barrel `[../index.ts:Select]`.
- `ScrollHint({ direction, count })` is module-private and renders the literals `↑ {count} more` /
  `↓ {count} more` `[select.tsx:ScrollHint]`.
- Uses `useAvailableWidth` `[../../hooks/use-available-width.ts:useAvailableWidth]`,
  `navigateConfirmHints` `[../../hooks/hints.ts:navigateConfirmHints]`, `Label` / `Muted`
  `[../../primitives/label.tsx:Label]`, `Marker` / `RailRow` `[../../primitives/rail.tsx:RailRow]`
  and `Prompt` `[../prompt/prompt.tsx:Prompt]`.

## Invariants

- Navigable set is exactly the enabled options, memoised on `options`:
  `options.map((o, i) => ({ option: o, index: i })).filter((e) => !e.option.disabled)`
  `[select.tsx:Select]`.
- Initial cursor is `initialIndex ?? firstEnabled`, where `firstEnabled = enabled[0]?.index ?? 0`
  `[select.tsx:Select]`.
- `move(delta)` wraps at both ends with `(from + delta + enabled.length) % enabled.length` and is a
  no-op when `enabled.length === 0`; a cursor that is not in the enabled set restarts from position
  `0` `[select.tsx:move]`.
- `moveTo(edge)` selects `enabled[0]` or `enabled[enabled.length - 1]`, no-op when none are enabled
  `[select.tsx:moveTo]`.
- Type-ahead `jumpToPrefix(ch)` scans forward at most `enabled.length` steps for
  `option.label.toLowerCase().startsWith(ch)`; `print` passes `key.text.slice(0, 1)`
  `[select.tsx:jumpToPrefix]`.
- Submit refuses an absent or disabled choice before validating:
  `if (!chosen || chosen.disabled) return;` `[select.tsx:attemptSubmit]`.
- Control is controlled when `phaseProp !== undefined`; internal phase/error writes are skipped in
  that case, and `onSubmit` still requires a falsy validation message `[select.tsx:Select]`.
- Phase partition: `open` = `active | validating | error`; `resolved` = `complete | cancelled`
  `[select.tsx:Select]`.
- Key handlers are claimed only while `{ active: open && !disabled }`; the map is closed:
  `up`/`down`, `home`/`end`, `return`/`enter`, `escape`/`cancel`, `print` `[select.tsx:usePromptKeys]`.
- The visible window keeps the cursor inside it and is centred rather than pinned:
  `start = Math.max(0, Math.min(cursor - Math.floor(maxVisible / 2), options.length - maxVisible))`,
  `end = start + maxVisible`, `hiddenAbove = start`, `hiddenBelow = options.length - end`
  `[select.tsx:Select]`.
- Each option row is keyed `${String(option.value)}-${index}` and marked
  `option.disabled ? "disabled" : active ? "selected" : "unselected"` `[select.tsx:Select]`.
- `optionBudget` is `Math.max(0, width - railWidth - bodyIndent - 1 - optionGap)` and summary
  truncation is enabled only when that budget exists `[select.tsx:Select]`.

## Side Effects

- Measures the terminal through `useAvailableWidth(availableWidth)` →
  `useTerminalDimensions()` from `@opentui/react` `[../../hooks/use-available-width.ts:useAvailableWidth]`.
- Subscribes to OpenTUI keyboard events while active `[../../hooks/use-prompt-keys.ts:usePromptKeys]`.
- Reads the active theme from React context `[../../theme/context.ts:useTheme]`.
- Local React state: cursor, internal phase, internal error `[select.tsx:Select]`.
- Emits `onSubmit(value)` / `onCancel()`; renders the scroll hints as text rows
  `[select.tsx:ScrollHint]`.

## Verification

- Run: `bun test`
