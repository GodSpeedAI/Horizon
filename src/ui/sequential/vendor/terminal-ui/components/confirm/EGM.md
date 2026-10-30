# confirm — two-way choice control (vendored)

## Overview

A single-line yes/no control over the vendored prompt shell. This package exports exactly one
component, `Confirm`, and its props interface. Both answers are always rendered and the marker
moves between them; the component's own doc comment states that a hidden alternative is "a guess"
and that confirming an invisible `false` is "the worst outcome this component can produce".

It is donor code copied from `GodSpeedAI/Terminal-UI` (see `../EGM.md` and
`../../README.md`), not Horizon's authored surface. Nothing here reads a Horizon frame, decides
availability or invokes a capability.

## Interface

- `Confirm(props: ConfirmProps)` — the exported component, a single-line two-way choice
  `[confirm.tsx:Confirm]`.
- `ConfirmProps` — `message`, `initialValue?`, `onSubmit?`, `onCancel?`, `validate?`, `phase?`,
  `error?`, `availableWidth?`, `disabled?`, `labels?`, `hint?` `[confirm.tsx:ConfirmProps]`.
- Default answer is `initialValue = true`; default labels are the literals `"Yes"` and `"No"`
  `[confirm.tsx:Confirm]` (`labels?.yes ?? "Yes"`, `labels?.no ?? "No"`).
- Re-exported by the sibling barrel `[../index.ts:Confirm]`.
- Delegates the visual shell to `Prompt` `[../prompt/prompt.tsx:Prompt]`, the marker to `Marker`
  `[../../primitives/rail.tsx:Marker]`, the cancelled label to `Muted`
  `[../../primitives/label.tsx:Muted]`, the default hint to `confirmHint`
  `[../../hooks/hints.ts:confirmHint]` and painting to `paint` / `joinStyled`
  `[../../utils/style.ts:paint]`.

## Invariants

- `open = phase === "active" || phase === "validating" || phase === "error"`; the answer row is
  rendered only while `open`, and `null` otherwise `[confirm.tsx:Confirm]`.
- The control is **controlled** when `phaseProp !== undefined`: `phase` and `error` are read from
  props and the internal `setInternalPhase` / `setInternalError` writes are skipped
  `[confirm.tsx:Confirm]` (`const controlled = phaseProp !== undefined`).
- Validation gates the callback in both modes: `onSubmit?.(value)` is reached only when
  `validate?.(value)` returns a falsy message `[confirm.tsx:attemptSubmit]`.
- `Complete` renders the chosen label as the collapsed summary, `cancelled` renders the literal
  `"cancelled"` `[confirm.tsx:Confirm]`.
- Keyboard handlers are claimed only while `{ active: open && !disabled }`
  `[confirm.tsx:usePromptKeys]`.
- Key map is closed and fixed: `left`/`up` → `false`, `right`/`down` → `true`, `tab` toggles,
  `return`/`enter` submit the current answer, `escape`/`cancel` cancel, and a printable character
  sets the answer only for `"y"` / `"n"` after `toLowerCase()` `[confirm.tsx:usePromptKeys]`.
- Row order never swaps: the Yes marker is `state={answer ? "selected" : "unselected"}` and the No
  marker is the inverse, so only the marker moves `[confirm.tsx:Confirm]`.
- Label text is truncated only when a width was supplied:
  `truncate={availableWidth !== undefined}` `[confirm.tsx:Confirm]`.

## Side Effects

- Subscribes to OpenTUI keyboard events through `usePromptKeys` → `useKeyboard(..., { release: false })`
  `[../../hooks/use-prompt-keys.ts:usePromptKeys]`.
- Reads the active theme from React context `[../../theme/context.ts:useTheme]`.
- Holds three pieces of local React state: `useState(initialValue)`,
  `useState<PromptPhase>("active")`, `useState<string | null>(null)` `[confirm.tsx:Confirm]`.
- Emits exactly two outbound callbacks, `onSubmit(value: boolean)` and `onCancel()`
  `[confirm.tsx:Confirm]`; it performs no I/O.

## Verification

- Run: `bun test`
