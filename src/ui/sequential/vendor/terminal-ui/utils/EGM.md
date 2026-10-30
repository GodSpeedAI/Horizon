# utils — styling bridge and cell-width arithmetic (vendored)

## Overview

`style.ts` is the single bridge from a theme's `MarkerStyle` to OpenTUI's styled-text model, which
is why no component names a colour or a glyph. `text.ts` is terminal cell-width arithmetic, written
because OpenTUI exports no string-width helper and a mis-measured label drifts the rail — "the
single most visible way a rail-based layout can break". Unclassifiable code points are measured as
one cell rather than throwing or guessing wide.

Donor code copied from `GodSpeedAI/Terminal-UI` (see `../README.md`); not Horizon's authored
surface.

## Interface

- `chunk(text, style)`, `styled(chunks)`, `paint(text, style)`, `joinStyled(parts)`, `plain(text)`
  `[style.ts:paint]`, `[style.ts:joinStyled]`, `[style.ts:plain]`.
- `markerStyle(theme, state)`, `statusStyle(theme, state)`, `markerGlyph(theme, state)`,
  `statusGlyph(theme, state)` `[style.ts:markerStyle]`, `[style.ts:markerGlyph]`.
- `repeatGlyph(g, count)`, `themeColor(color)` `[style.ts:repeatGlyph]`, `[style.ts:themeColor]`.
- `codePointWidth(cp)`, `stringWidth(input)`, `truncateToWidth(input, max, ellipsis = "…")`,
  `sliceToWidth(input, max)`, `padToWidth(input, width, fill = " ")`,
  `fitToWidth(input, width, options?)`, `splitLines(input)`, `wrapToWidth(input, width)`
  `[text.ts:codePointWidth]`, `[text.ts:stringWidth]`, `[text.ts:truncateToWidth]`,
  `[text.ts:sliceToWidth]`, `[text.ts:wrapToWidth]`.
- `WIDE_RANGES`, `ZERO_RANGES` and `inRanges` are module-private `[text.ts:WIDE_RANGES]`,
  `[text.ts:inRanges]`.

## Invariants

- `chunk` composes attributes as a bitmask from `bold`, `dim`, `underline`, `inverse` only; no
  other style field reaches OpenTUI `[style.ts:chunk]`.
- `markerStyle`/`statusStyle`/`markerGlyph`/`statusGlyph` always fall back rather than return
  `undefined`: to `theme.text.muted`, `theme.text.muted`, `theme.markers.muted`,
  `theme.statuses.muted` respectively `[style.ts:markerStyle]`, `[style.ts:markerGlyph]`.
- `repeatGlyph` floors and clamps: `Math.max(0, Math.floor(count))` `[style.ts:repeatGlyph]`.
- `codePointWidth` returns `0` for `NUL`, for `cp < 0x20` and for `0x7f ≤ cp < 0xa0`, `0` for
  combining/zero-width ranges, `2` for East-Asian wide/fullwidth/emoji ranges, `1` otherwise
  `[text.ts:codePointWidth]`.
- `truncateToWidth` returns `""` for `max <= 0`, returns the input unchanged when it already fits,
  hard-cuts without an ellipsis when `max <= ellipsisWidth`, and otherwise appends the ellipsis
  `[text.ts:truncateToWidth]`.
- `sliceToWidth` never splits a wide character: it breaks when `width + w > max` `[text.ts:sliceToWidth]`.
- `fitToWidth` truncates when too wide and only pads when `align === "right"`
  `[text.ts:fitToWidth]`.
- `wrapToWidth` returns `[input]` for `width <= 0`, hard-splits words wider than the budget by
  consumed cells, and returns `[""]` when the result would otherwise be empty `[text.ts:wrapToWidth]`.
- `splitLines` splits on `\r\n`, `\r` or `\n` and keeps empty lines `[text.ts:splitLines]`.

## Side Effects

- None observed in source: both modules are pure functions over their arguments and import only
  `@opentui/core` value types (`parseColor`, `StyledText`, `TextAttributes`) `[style.ts:chunk]`.
- `themeColor` is an identity function, returning the colour string unchanged `[style.ts:themeColor]`.

## Verification

- Run: `bun test`
