# Stage 3 desk on the live test setup: findings (2026-11-07)

Captured with Playwright (Chromium) at `http://127.0.0.1:4339/desk`. The test setup was restarted on the case keeper built from `feat/horizon-desk-support`. One live case was created through `src/adapters/sea-forge-case.ts` (see `live-probe.md`). Views were reached with the keyboard only (Ctrl+2/3/4). No console errors.

## Fixed since the Stage 2 look
The plain status bar ("This computer: Yoga7i", "Rulebook edition 0a10c20d"), the `#tag` in a note now making a tag, and the missing-resource 404 (gone).

## To fix

**Wrong or contradictory state**
1. A live case exists at the case keeper (Work lists it), but the status bar says "Case: none open", the left Cases list says "No case is open" and Explore says "Cases (0)". All three must read the case keeper's cases, not only Horizon's own case records.
2. The Work row for that case reads "waiting" and "Running" at the same time. Give one state, in the §2 words.
3. The case title is a file path: "Execute plan drafts/draft_eaa7a3.json". Show the template's description or the plan's purpose. Never show a path as a title.

**Jargon and product names on screen** (the design allows product names only in its §1 table)
4. Today's Getting started says "SEA-Forge governs commits and RealityTrace observes them", "Commit your first governed move" and "Approval isolation: not verified". Rewrite them with the §2 words: case keeper, record keeper, step, check.
5. Decide shows "Also possible from the terminal: Defer this decision, Disagree with this representation, Inspect another alternative, Reframe the problem." It is unclear and not actionable from the desk. Either make each one a desk action with plain words, or remove the line.
6. Work, "Cost is not set up", lists shell commands and environment variable names (`te-agents install`, `HORIZON_ECONOMICS_DATA_HOME`, ...). Say "Cost is not recorded yet: the session recorder is not sending costs to Horizon" and add a link to Settings or the runbook for the setup steps.
7. Inspector: "Ask about the focus" has a bare dropdown of question types and a free-text "reference library" box, even though the reference library is Not connected. Disable it with the reason shown, as the composer does.

**Noise**
8. Work, Record and Repository: the repository list shows every repository in the personal record, including dozens of `/tmp/cognate-sxr-*` test repositories, as raw paths. Hide the temporary ones (under the system temp dir) behind "show test repositories", and show folder names rather than full paths.
9. The Repository and Day pickers sit above "No sessions are recorded on this day" even when the record has nothing for any day. Say what exists ("Last recorded session: <date>") so the operator can jump to it.

**Keyboard**
10. Esc followed by Ctrl+N switches views, as specified. Check that the visible focus lands on the view heading after switching (the screenshots show no focus ring).
