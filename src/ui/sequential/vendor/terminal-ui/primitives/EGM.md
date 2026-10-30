# primitives — rail and text primitives (vendored)

## Overview

The two lowest visual units of the grammar. `rail.tsx` owns the spine: one `RailCell` at column 0
of every prompt row, a state `Marker`, a severity `Status`, and the `RailRow` composition unit that
notes, logs and task lists all stack. `label.tsx` owns text: one `StyledText` implementation behind
`Label`, `Muted` and `ErrorText`, plus the key-hint line, a separator and a blank row.

State is expressed by `state` name only; the glyph and paint come from the theme, so adding a theme
never requires touching a component.

Donor code copied from `GodSpeedAI/Terminal-UI` (see `../README.md`); not Horizon's authored
surface.

## Interface

- `RailProps`, `Rail({ variant = "bar", muted = false })` `[rail.tsx:Rail]`.
- `MarkerProps`, `Marker({ state, glyph?, muted? })` `[rail.tsx:Marker]`.
- `StatusProps`, `Status({ state, glyph? })` `[rail.tsx:Status]`.
- `RailRowProps`, `RailRow({ children, variant = "bar", rail = true, indent?, gapBefore = 0, muted = false })`
  `[rail.tsx:RailRow]`.
- `LabelProps`, `Label`, `Muted`, `ErrorText` `[label.tsx:Label]`, `[label.tsx:Muted]`,
  `[label.tsx:ErrorText]`.
- `KeyHintPair` (`key`, `description`, `format?: "colon" | "space"`), `HintProps`,
  `Hint({ hints, terminated = false, compactBelow = 28, availableWidth?, separator? })`
  `[label.tsx:Hint]`.
- `hintWidth(hints, separator)` — the cells the full hint would occupy `[label.tsx:hintWidth]`.
- `Separator({ width?, char? })`, `Blank({ rows = 1 })` `[label.tsx:Separator]`,
  `[label.tsx:Blank]`.
- `StyledText` and `emphasis` are module-private `[label.tsx:StyledText]`, `[label.tsx:emphasis]`.
- Barrel re-exports both modules wholesale `[index.ts:label.js]`.

## Invariants

- `Marker` and `Status` resolve glyph and paint through the theme helpers, with fallbacks
  `[../utils/style.ts:markerGlyph]` / `[../utils/style.ts:markerStyle]`; `muted` keeps the state's
  colour and forces `dim: true` `[rail.tsx:Marker]`.
- `Rail` sizes its cell from the glyph's declared width (`width={g.width}`), which is what keeps
  ASCII multi-cell glyphs aligned `[rail.tsx:Rail]`.
- `RailRow` preserves the rail column even when the glyph is hidden: `rail ? <Rail .../> : <box
  width={theme.spacing.railWidth} />` `[rail.tsx:RailRow]`.
- `gapBefore` and `Blank.rows` are clamped with `Math.max(0, ...)` before `Array.from`
  `[rail.tsx:RailRow]`, `[label.tsx:Blank]`.
- `emphasis` returns a **new** style object, copying `color`, and only re-applies `bold` / `dim`
  when the source style had them `[label.tsx:emphasis]`.
- `StyledText` sets `flexShrink={0}` and `flexGrow={raw === null ? 1 : 0}`: a measured string is
  never squeezed below its budget, an unmeasured child fills the row `[label.tsx:StyledText]`.
- Truncation happens only for string/number children and only when `maxWidth` is defined:
  `truncateToWidth(raw, maxWidth)` plus `truncate={maxWidth !== undefined}`
  `[label.tsx:StyledText]`.
- `Hint` drops empty pairs where both `key` and `description` are `""`, and joins with the theme
  separator as ` ${sep} ` `[label.tsx:Hint]`.
- Compact hint form is taken when `shown.length > 1` **and** a width exists **and**
  (`availableWidth < compactBelow` **or** `hintWidth(shown, sep) > availableWidth`); the compact
  form keeps the first pair only `[label.tsx:Hint]`.
- `hintWidth` is `0` for an empty list and otherwise sums `key + description + 1` per pair plus
  `(n - 1) * (separator width + 2)` `[label.tsx:hintWidth]`.
- `Separator` repeats `Math.max(0, width ?? 20)` cells `[label.tsx:Separator]`.

## Side Effects

- Every primitive reads the active theme from React context `[../theme/context.ts:useTheme]`.
- Renders OpenTUI elements only (`<box>`, `<text content=... />`) and converts styles to
  `StyledText` chunks via `paint` `[../utils/style.ts:paint]`.
- No state, timers, disk, network or environment access in either module.

## Verification

- Run: `bun test`
