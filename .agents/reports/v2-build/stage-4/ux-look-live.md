# Stage 4 desk on the live seeded test setup: findings (2026-11-07)

Captured by `live-handoff.ts` with Playwright against `http://127.0.0.1:4339/desk` after `just seed`. The steps were Ctrl+K, Tab three times to Hand off, typing, then Enter.

## Works
- Hand off mode, the case picker ("The newest running case") and the Not connected note for agent work.
- Case titles now come from the template ("Seed: triage inbox…", "Seed: weekly release…").
- A refusal is shown under the box in words.
- "Needs you: 3" matches Decide (3).

## Bugs (sent to the Stage 5/6 agent)
- **B1.** Every write is refused live with `missing_config_error`. The case keeper's default policy file is `sea-forge-policy.yaml`, but the cell has `policy.yaml`, and the client sends no `policy`.
- **B2.** The refusal text hides the file path (`/home/sprime01/.[hidden].yaml`), because the long-string mask also takes `/` and `.`.

## UX pass (final)
1. Getting started, step 3 has a button "Check the structural world and Cognate projection". This is jargon that the word scan missed, because the scan does not cover this onboarding state. Rename it ("Check that the rules and records are connected"), and add this state to `desk-words.test.tsx`.
2. The left Cases list shows whole template descriptions, wrapping over 5 lines. One example, "A governed draft write followed by a human sign-off gate (ItemKind HumanTask with require_…", is also jargon from a template. Show one line, clipped with an ellipsis, with the full text on focus or hover. Template text comes from outside, so pass it through the same plain-words filter, or fall back to the humanised template name when it contains a banned word.
3. Refusal text ends with raw system words ("missing_config_error: … No such file or directory (os error 2)"). Map known error classes to plain words: missing_config_error becomes "The case keeper's rules file is missing: <path>". Keep the raw text behind "Details".
4. The Notes list on Today shows three identical demo notes from the probe runs. That is test noise and is removed by `seed-clear`; no code change.
