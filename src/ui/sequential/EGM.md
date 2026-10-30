# sequential — Clack-style sequential decision surface

## Overview

The terminal half of the shared behavioral contract (T08). Two files: `controller.ts`, a pure and
renderer-neutral state machine that turns one validated `horizon.navigation/2` frame into at most
one question and turns the observer's answer into one typed intent; and `terminal.tsx`, the
presentation layer that renders that prompt with the vendored Clack-style controls and translates
keys into controller commands.

The distinctions the controller refuses to flatten are load-bearing: blocked, unknown and
conflicted moves stay visible but are not selectable; a consequential choice gets a review step
before its intent exists; a stale revision refuses the answer and asks for refresh; cancel and back
change only the session, never the world; already-known context is displayed rather than asked for
again. The controller never decides availability, grants authority or invokes anything — execution
belongs to the capability path.

## Interface

- `SEQUENTIAL_SCHEMA = "horizon.sequential/1"`, `SEQUENTIAL_INTENT_SCHEMA =
  "horizon.sequential-intent/1"` `[controller.ts:SEQUENTIAL_SCHEMA]`,
  `[controller.ts:SEQUENTIAL_INTENT_SCHEMA]`.
- `SequentialIntentKind` = `"inspect" | "confirm" | "defer" | "reframe" | "disagree"`;
  `SequentialIntent` carries `schema`, `kind`, `frame_id`, `revision`, `operation_ref`, `actor_ref`,
  `simulated` `[controller.ts:SequentialIntent]`.
- `SequentialContext`, `SequentialChoice`, `SequentialError`, `SequentialSnapshot`,
  `SequentialSession`, `SequentialTransition` `[controller.ts:SequentialSession]`,
  `[controller.ts:SequentialError]` (codes `"stale_frame" | "unavailable_choice" |
  "invalid_intent"`).
- Prompt variants `ChoicePrompt`, `ReviewPrompt`, `NoticePrompt`, union `SequentialPrompt`
  `[controller.ts:SequentialPrompt]`; `NoticePrompt["tone"]` is closed to `"complete" |
  "cancelled" | "deferred" | "stale" | "error"` `[controller.ts:NoticePrompt]`.
- Commands: `select`, `confirm`, `cancel`, `cancel_review`, `back`, `resume`, `refresh`
  `[controller.ts:SequentialCommand]`.
- `openSequential(frame, options?)`, `applySequential(session, command)`,
  `presentSequentialFrame(session, frame)`, `renderSequentialText(prompt)`
  `[controller.ts:openSequential]`, `[controller.ts:applySequential]`,
  `[controller.ts:presentSequentialFrame]`, `[controller.ts:renderSequentialText]`.
- `plainReason(choice)`, `nextStep(choice)` `[controller.ts:plainReason]`, `[controller.ts:nextStep]`.
- `GATE_PLAIN` keys are exactly `visibility`, `reach`, `payment`, `authority`, `capability`,
  `recovery`, `settlement_access` `[controller.ts:GATE_PLAIN]`; `VIEW_QUESTION` keys are the six
  `NavigationResponsibility` values `orient`, `inspect`, `choose`, `commit`, `observe`, `review`
  `[controller.ts:VIEW_QUESTION]`.
- `SequentialTerminalProps` (`initialSession`, `onIntent`, `onExit`) and
  `SequentialTerminal(...)` `[terminal.tsx:SequentialTerminal]`,
  `[terminal.tsx:SequentialTerminalProps]`.
- Helper functions in `terminal.tsx`: `summaryLines`, `optionsOf`, `initialIndexOf` — module-private
  `[terminal.tsx:summaryLines]`, `[terminal.tsx:optionsOf]`, `[terminal.tsx:initialIndexOf]`.
- Child contract: [vendor](./vendor/EGM.md).

## Invariants

- Staleness is checked before any choice is honoured: `select` and `confirm` return
  `withError(session, "stale_frame", …)` when `session.frame.frame_id !== frameId ||
  session.frame.revision !== revision` **or** the session is not on `latest_frame`
  `[controller.ts:isStale]`, `[controller.ts:notCurrent]`.
- A choice id that the frame does not offer is refused with `"unavailable_choice"`, and so is an
  offered-but-unselectable choice: `if (!choice.selectable) return withError(..., "unavailable_choice",
  `${choice.label} is ${choice.status}; it cannot be selected.`)` `[controller.ts:applySequential]`.
- `confirm` with no reviewed choice is refused with `"invalid_intent"`: `if (pending === null)
  return withError(session, "invalid_intent", "There is no reviewed choice to confirm.")`
  `[controller.ts:applySequential]`.
- Only consequential choices reach review: `needsReview(choice) = choice.selectable &&
  isConsequential(choice)`, and `isConsequential` is `reversibility !== "read_only"`
  `[controller.ts:needsReview]`, `[controller.ts:isConsequential]`.
- Intent kind is derived from the operation ref, not from the label: the literal refs
  `"horizon.navigation.defer"`, `"horizon.navigation.reframe"`, `"horizon.navigation.disagree"` map
  to their kinds, else consequential → `"confirm"`, else `"inspect"` `[controller.ts:intentKindFor]`.
- `simulated` is `session.simulate_consequences && isConsequential(choice)` — a read-only choice is
  never labelled simulated `[controller.ts:intentFor]`.
- `actor_ref` on every intent is the frame's `observer_ref`; `frame_id`/`revision` are the session's
  current frame `[controller.ts:intentFor]`.
- Non-choosing commands never yield an intent: `cancel`, `resume`, `back`, `cancel_review` and
  `refresh` all return `intent: null` `[controller.ts:applySequential]`.
- `back` with empty history is an error (`"invalid_intent"`), and a successful `back` pops exactly
  one snapshot: `history.slice(0, -1)` `[controller.ts:applySequential]`.
- Two ui-reserved ids are intercepted before frame lookup: `"ui:back"` and `"ui:resume"`
  `[controller.ts:applySequential]`; they are the only ids the controller synthesises itself
  `[controller.ts:optionsFor]`.
- `presentSequentialFrame` always pushes the outgoing frame into `history`, clears `pending_review`,
  and drops the selection unless the new frame still offers it as selectable
  `[controller.ts:presentSequentialFrame]`.
- Every returned session, prompt, context, body and intent is frozen: `Object.freeze` wraps each
  construction site `[controller.ts:openSequential]`, `[controller.ts:promptFor]`,
  `[controller.ts:reviewFor]`, `[controller.ts:notice]`.
- `openSequential` performs no I/O and defaults `source` to the literal `"fixture"`
  `[controller.ts:openSequential]`.
- Body copy states the authority boundary in words: `"Nothing here grants authority; a choice only
  records an intent."` `[controller.ts:bodyFor]` and `"Confirming records an intent; it does not
  approve or execute the operation."` `[controller.ts:reviewFor]`.
- `renderSequentialText` is byte-stable per prompt and ends with a single trailing newline; disabled
  options print with marker `x`, enabled with `>` `[controller.ts:renderSequentialText]`.
- `terminal.tsx` cannot widen anything: options are mapped straight from `prompt.options` with
  `disabled: option.disabled` `[terminal.tsx:optionsOf]`, and every submission goes through
  `applySequential` before `onIntent` is called `[terminal.tsx:dispatch]`.
- `terminal.tsx` intercepts the same two reserved ids, mapping `"ui:back"` → `{ type: "back" }` and
  `"ui:resume"` → `{ type: "resume" }`, and passes `frame_id`/`revision` with every `select`/`confirm`
  `[terminal.tsx:SequentialTerminal]`.
- A `"notice"` prompt whose `tone === "cancelled"` exits instead of cancelling: `onExit()` is called
  rather than `dispatch({ type: "cancel" })` `[terminal.tsx:SequentialTerminal]`.
- Both controls are remounted on identity change: `key` includes frame id, revision and either
  question or operation ref `[terminal.tsx:SequentialTerminal]`.

## Side Effects

- `terminal.tsx` renders React elements for the OpenTUI-style host (`<box>`, `<text>`) wrapped in
  `ThemeProvider theme="clack"` `[terminal.tsx:SequentialTerminal]`; it writes no stdout itself.
- Keyboard input is read only by the vendored controls (`Select`, `Confirm`), not by these files
  `[vendor/terminal-ui/components/select/select.tsx:Select]`.
- `dispatch` mutates a `useRef` session, calls `setSession`, then invokes the injected `onIntent`
  synchronously when a transition produced one `[terminal.tsx:dispatch]`.
- `renderSequentialText` returns a string for a non-TTY caller; the actual write happens outside
  this package `[controller.ts:renderSequentialText]`.

## Verification

- Run: `bun test`
