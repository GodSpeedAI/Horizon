# T08 — Clack-style sequential renderer from the shared frame

**Status:** settled · **Proof level:** P1 (builder) · **Recorded:** 2026-10-20
**Spec:** HORIZON-001 v1.0.1 `14a42936…` · **Plan:** T08

## What changed

T07 produced a pure `horizon.navigation/2` frame. T08 adds the sequential half of the shared
behavioral contract:

- `src/ui/sequential/controller.ts` — renderer-neutral session. It turns one validated frame into
  one question and one answer into one typed intent. It owns no availability policy, no approval,
  no clock and no I/O. Blocked, unknown and conflicted choices remain visible and disabled; only
  an available choice can become an intent; a consequential choice must pass a review step first.
  Back, defer, cancel, resume, refresh and selection preservation are explicit state transitions.
- `src/ui/sequential/terminal.tsx` — real OpenTUI renderer using the vendored Clack shell. It maps
  controller options to `Select` and review to `Confirm`; it never decides what is available.
- `src/ui/sequential/vendor/terminal-ui/` — registry-copy subset of `GodSpeedAI/Terminal-UI`
  (commit `7932155`, MIT), including the prompt shell, `Select`, `Confirm`, theme, primitives,
  hooks and utilities. See `THIRD_PARTY_NOTICES.md`.
- `src/adapters/navigation.ts` — `buildOperationalFrame` derives the T08 input from a real T06
  projection read with a deterministic frame id. It derives only read-only inspection moves.
- `src/app.ts` — `navigationFrame()` reads the application's actual Cognate store and pinned
  semantic world. An empty projection becomes an honest absent-focus deviation.
- `src/main.ts` — `horizon frame [--json|--text|--tui] [--focus REF] [--case REF] [--purpose TEXT]`.
  JSON and text read the same frame and prompt; the TUI records typed intents and does not execute
  them.
- `tsconfig.json`, `package.json` — `jsxImportSource: @opentui/react`, React 19.3, OpenTUI 0.5.12,
  `@types/react`.
- `justfile` — `check-t08`, `teeth-t08`, `gate-t08`; the placeholder gate is gone.

## Positive observations

1. **One decision at a time.** `openSequential` yields exactly one `choice` prompt. The question is
   the primary label when one exists, an “inspect” question for an optional-only case, and “No move
   is available yet” when no path passes. Observer controls (inspect, defer, reframe, disagree)
   remain available without becoming world moves.
2. **Possibility is not affordance.** Blocked, unknown and conflicted choices are rendered as
   disabled options with a plain-language reason. Selecting one through the controller is refused
   with `unavailable_choice` and writes no intent.
3. **Consequential review.** A move with reversibility other than `read_only` produces a review
   prompt containing reversibility, payment and provenance, expected evidence, escalation behaviour,
   the next prerequisite when one exists, and the fact that confirming records an intent rather
   than granting authority or executing. The `confirm` intent exists only after the review.
4. **Typed intents.** `horizon.sequential-intent/1` carries `kind`, frame id, revision, operation
   ref, actor ref and an explicit `simulated` flag. The controller never invokes a capability.
5. **Stale revisions fail closed.** An answer naming an older frame or revision yields
   `stale_frame`, an empty intent log and a refresh prompt; the newer frame remains available.
   A review cannot survive `presentSequentialFrame`.
6. **Cancellation is safe.** Cancel keeps frame, latest frame, focus, history and selection, emits
   nothing, and offers resume. A second escape from the cancelled notice exits the renderer.
7. **Back preserves selection.** Presenting a successor pushes history; back restores the earlier
   frame and selected object, marks the frame historical, and refuses any action from it until the
   observer resumes the current frame.
8. **Known context is not asked for.** A known world/checkpoint/focus produces no context question;
   only an unknown checkpoint yields one. The prompt says when context is already known.
9. **Real source path.** `test/sequential-source.test.ts` seeds a real Cognate SQLite store, reads
   the T06 projection, builds the frame and emits an `inspect` intent. `integration_level` stays
   `fixture`; no product produced the events.
10. **Agent/script surface.** `horizon frame --json` prints `horizon.frame/1`, the
    `horizon.navigation/2` frame, the prompt and the intent schema. `--text` prints a stable
    plain-text prompt. Both come from the application's actual store and world.

## Adversarial teeth (T08 plan)

| Attack | Observed |
| --- | --- |
| Terminal submits a stale frame revision after focus change | Refused `stale_frame`; no intent; refresh offered; new focus retained. |
| Cancel midway through a choice | No intent, no world effect; frame, selection and context retained; resume works. |
| Blocked move submitted as though available | Refused `unavailable_choice`; no intent. |
| Historical frame acted on after back | Refused `stale_frame`; must resume the current frame. |

## Commands and results

| Command | Result |
| --- | --- |
| `just check-t08` | exit 0 — 19 pass / 0 fail (4 files, 188 expects) |
| `just teeth-t08` | exit 0 — 4 pass / 0 fail (20 expects) |
| `just gate-t08` | exit 0 |
| `just verify` | exit 0 |
| `bun test` | 93 pass / 0 fail (15 files, 820 expects) |
| `bun x tsc --noEmit` | exit 0 |

Exact output: `check-t08.log`, `teeth-t08.log`, `bun-test.log`, `gate-t08.log`,
`just-verify.log` in this directory.

## Touched refs

- `horizon.navigation/2`: frame id/revision, `choices`, `allowed_choice_refs`,
  `primary_choice_ref`, `decision`, `settlement_reachable`, `authority.grants_authority`.
- `horizon.sequential/1`: prompt, options, blocked list, context questions, history.
- `horizon.sequential-intent/1`: typed answer.
- T06 projection checkpoint, object refs and link refs are carried as evidence refs unchanged.

## Remaining unknowns and limits

- **GUI equivalence is not proven here.** T08 proves the Clack half of REQ-UI-004/REQ-GOAL-003.
  T09 must consume the same frame and emit the same typed intents; until then no parity is claimed.
- **No consequential execution.** T08 creates intents only. It does not submit them, call
  SEA-Forge, or prove settlement. T10/T11 own that path. A `simulated` intent is visibly labelled.
- **The store is fixture-produced.** The real Cognate read path is exercised, but the T06 rows come
  from the fixture; `integration_level` remains `fixture`.
- **Terminal accessibility is keyboard-first only.** OpenTUI renders ANSI text; no screen-reader
  announcement was measured. WCAG 2.2 AA is a GUI obligation and remains T09's.
- **No light theme in the copied terminal theme set.** The vendored themes are `clack`, `ascii` and
  `high-contrast`; terminal colour is controlled by the host terminal profile. Light/dark theme
  proof is deferred to the GUI.
- **TUI launch path is not covered by an automated pty test.** The component is driven through
  OpenTUI's real test renderer; the `createCliRenderer` wrapper in `main.ts` is a thin mount and is
  not exercised by CI.
- **Default focus.** `horizon frame` without `--focus` reads the first object by ref, or a synthetic
  focus when the projection is empty. That synthetic focus produces a material deviation, not a
  fabricated move.

## Requirement settlement

Settled for this proof level: `REQ-UI-004`, `REQ-INT-002`, `REQ-GOAL-003`, `REQ-UX-008`,
`REQ-UX-005`.

- REQ-UI-004 / REQ-GOAL-003: sequential renderer consumes the shared frame and emits typed intents;
  GUI equivalence remains open for T09.
- REQ-INT-002: one next meaningful decision; context is persistent in the session and shown, not
  re-asked.
- REQ-UX-005: every blocked/pending choice leads with plain language and a single next prerequisite;
  gates and raw refs remain in the frame for drill-down.
- REQ-UX-008: keyboard-only terminal operation, Clack/ascii/high-contrast themes, deterministic
  frame changes. Screen-reader announcement and WCAG AA are GUI obligations for T09.
