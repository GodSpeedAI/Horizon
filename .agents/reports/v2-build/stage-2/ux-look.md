# Stage 2 desk: first look in a real browser (2026-11-07)

Captured by `look-desk.ts` (Playwright, headless Chromium 1243) against the running test setup at `http://127.0.0.1:4339/desk`, desktop 1440x900 and phone 390x844. A note was typed using only the keyboard (Ctrl+K, type, Ctrl+Enter). It saved and appeared under Today with "first version", and the Days list showed `2026-11-07 (1)`.

## Works
- Keyboard-only note writing. Focus returns to the composer, which has a visible focus ring.
- Plain words throughout, "Not connected" for missing parts, and empty states that each name a next step.
- The setup badge "Setup: testing" is visible.

## To fix (UX pass, Stage 3)
1. The top bar shows code-style names: the organization as `local:Yoga7i:testing`, and the rulebook as `Rules: horizon@0a10c20d`. Show the machine or organization name in plain words, and the rulebook as "Rulebook edition 0a10c20d".
2. "Rules" appears twice (the edition and "Rules: connected").
3. `#demo` typed in a note does not become a tag, so Tags stays empty. Inline `#tag` should make a tag.
4. Activity repeats the part health from the status bar ("Cases: connected", "Agent work not connected"). Show activity only, or one line saying why there is none.
5. On a phone, the composer sits below the long menu and the Days, Cases and Tags lists. Collapse the menu to one row, and keep the composer reachable at the bottom.
6. The browser console shows one 404 for a resource the page requests.
