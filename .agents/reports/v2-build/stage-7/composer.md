# Stage 7: conversation and composer

## What changed
Only the composer area changed. Today, Explore, Decide, Work, Notes, nav, inspector and status bar are untouched.

- A conversation thread sits above the composer. Each turn shows what you sent (note, hand off or find), then the result as a quiet status line with a coloured dot (the words carry the meaning; colour is a second cue). Refusals show their plain words with the existing Details disclosure.
- The hand-off preview is now a card inside the thread: small uppercase label ("Needs your OK"), heading, the facts in a grid, then Confirm and Cancel. "Show the new preview" appears when the preview is out of date.
- The thread is hidden when empty, collapsible ("Conversation (n)", with Clear), capped at 45vh and scrolls, newest at the bottom. It is kept in memory for the page.
- When the thread is empty and the box is empty, a "Try ..." line offers 3 example phrases per mode. Clicking one fills the box and never sends.
- The composer bar: a status line (Ready / Sending... / the last result, with a right-aligned state word, announced through role status or alert), the box with chips (mode, case, "Also give to an agent" when agent work is connected, run a review), a textarea, a round send button with an arrow (accessible names kept: "Save note", "Find", "Ask", "Preview hand off"), and a footer with setup, case and view on the left and key hints on the right.
- Presenting: the thread never repeats your typed words while Presenting is on ("Hidden while Presenting is on."). The hand-off preview and result answers now pass through the Presenting stand-ins on the server (src/app.ts, presentedJson). The running desk server has to be restarted to pick this up; I did not restart it.
- Visual design: tokens scoped to a `.convo` root (`--cg-*`, light and prefers-color-scheme dark), system font stacks (Inter, Space Grotesk, JetBrains Mono with fallbacks, nothing loaded), 8 to 14px radii, the accent blue for the primary action.
- Behaviour kept: Write and Hand off (and Find, Ask), Tab changes mode, Ctrl+K, Enter and Shift+Enter, Esc, @ suggestions, drafts, attempt ids and out-of-date handling, the review option, the agent tick box ("Also give this step to an agent" in the card; the chip toggles the same choice), the empty-box hint after an empty send, data-confirm-handoff, data-live. The long help line is kept for screen readers (`#composer-hint`, visually hidden).

## Files
- src/ui/desk/Composer.tsx
- src/ui/desk/desk.css
- src/app.ts (presentedJson for the hand-off answers)
- .agents/reports/v2-build/stage-7/ (composer.ts, composer.md, axe.json, composer-walk.json, screenshots)

## Checks
- `bun x tsc --noEmit -p .`: clean.
- Desk, composer, hand-off and adversarial tests: 117 pass, 0 fail.
- Full `bun test`: see the end of this file.
- axe on /desk with the preview card open: 0 violations. With the thread showing after Cancel: 0 violations (axe.json).
- Keyboard walk (composer-walk.json): in Hand off mode with the card open, backward from the end of the page reached the send button, the box, the agent and review tick boxes, the case selector, the mode chip, Cancel, Confirm and the thread fold button; none lacked a focus ring. Tab inside the box changes the mode by design, so the send button is reached backward or by Enter.
- No horizontal scroll at 390px (empty and with a thread).

## Screenshots
- composer-empty-wide.png, composer-empty-phone.png
- composer-handoff-preview.png, composer-handoff-preview-dark.png
- composer-thread-after-cancel.png, composer-thread-phone.png
- composer-write.png
- composer-keyboard-focus.png

No hand off was confirmed on the live desk; previews were cancelled.
- Full `bun test`: 753 pass, 16 skip, 0 fail (769 tests, 81 files).
