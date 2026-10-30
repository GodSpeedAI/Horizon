# prompt — prompt shell and step line (vendored)

## Overview

The shared shell every other control renders inside: rail, marker, message, hint line, error
presentation and the active → resolved collapse. The collapse is the component's stated point — a
completed prompt becomes one rail line (`◇ message answer`) rather than freezing an interactive
list into the transcript. Controls supply only their body and their summary.

Donor code copied from `GodSpeedAI/Terminal-UI` (see `../../README.md`); not Horizon's authored
surface.

## Interface

- `markerForPhase(phase: PromptPhase): MarkerState` — the marker a question shows per phase
  `[prompt.tsx:markerForPhase]`.
- `PromptProps` — `message`, `phase`, `children?`, `summary?`, `error?`, `hint?`,
  `availableWidth?`, `disabled?` `[prompt.tsx:PromptProps]`.
- `Prompt(props: PromptProps)` — the shell component `[prompt.tsx:Prompt]`.
- `StepLineProps` — `state`, `message`, `availableWidth?`, `suffix?` `[prompt.tsx:StepLineProps]`.
- `StepLine(props: StepLineProps)` — a one-line rail message with no interactive body
  `[prompt.tsx:StepLine]`.
- `markerWidth(theme, state)` is module-private and is not exported `[prompt.tsx:markerWidth]`.
- Composes `RailRow` and `Marker` `[../../primitives/rail.tsx:RailRow]`, and `Label`, `Hint`,
  `ErrorText`, `Muted` `[../../primitives/label.tsx:Label]`.

## Invariants

- `markerForPhase` maps `complete` → `"complete"`, `cancelled` → `"cancelled"`, and **every other
  phase** (`idle`, `active`, `validating`, `error`) → `"active"`: a rejected answer does not paint
  the question as failed `[prompt.tsx:markerForPhase]`.
- `resolved = phase === "complete" || phase === "cancelled"` `[prompt.tsx:Prompt]`.
- `markerState = disabled ? "disabled" : markerForPhase(phase)`; `disabled` wins over the phase
  `[prompt.tsx:Prompt]`.
- Width budgets are derived from rail geometry and clamped at zero: `gutter =
  markerWidth(theme, markerState) + theme.spacing.labelGap`,
  `messageBudget = Math.max(0, availableWidth - gutter)`, `bodyGutter =
  railWidth + bodyIndent + 1 + labelGap`, `bodyBudget = Math.max(0, availableWidth - bodyGutter)`;
  each stays `undefined` when `availableWidth` is `undefined` `[prompt.tsx:Prompt]`.
- Resolved prompts render no body, no error row and no hint row: children are `{!resolved ? children
  : null}`, the error row requires `!resolved && error`, the hint row requires `!resolved &&
  hint.length > 0` `[prompt.tsx:Prompt]`.
- The hint row is passed `availableWidth - theme.spacing.railWidth - theme.spacing.bodyIndent`
  (not further clamped) `[prompt.tsx:Prompt]`.
- `StepLine` budget is `Math.max(0, availableWidth - railWidth - markerWidth(theme, state) -
  labelGap)`, and the label is muted when `state === "disabled" || state === "pending"`
  `[prompt.tsx:StepLine]`.

## Side Effects

- Reads the active theme from React context `[../../theme/context.ts:useTheme]`.
- Renders OpenTUI layout primitives (`<box>`, `<text>` with `content`, `wrapMode="none"`); no
  state, timer, disk, network or environment access `[prompt.tsx:Prompt]`.
- No keyboard subscription of its own: key handling belongs to the controls.

## Verification

- Run: `bun test`
