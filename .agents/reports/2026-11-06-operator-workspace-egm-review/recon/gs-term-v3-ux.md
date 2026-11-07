# gs-term and V3 mockup: attention, focus and composer patterns for Horizon

Sources: M = /home/sprime01/projects/Horizon/.tmp/sandbox/godspeed_terminal_v3.html. GS = /home/sprime01/projects/gs-term. CW = cognate-workbench. Read-only recon.

Caveat: M is a static, simulated mockup (M:261, 309). GS's shipped cockpit (src/ui) is small, with one hotkey and no notification system; its attention model lives in design docs and authority rules.

## 1. Layout and regions

Three columns plus header (M:28).
- Header (M:235-246): brand, views (Activity/Terminal/Files), preview label, Ctrl+K hint, density and inspector toggles. Peripheral.
- Left rail 226px (M:247-262): workspace, views, recent sessions, New session. Peripheral. No live status or badges; the one count ("08", M:251) is static.
- Center, primary (M:263-317): session heading with a mode button; a single chronological feed capped at 895px (M:68) holding user messages, agent prose, collapsed tool activity, a known/unknown strip, interactive cards and the decision panel; the composer pinned below (M:313-316) with a live-status line (spinner, phrase, timer) above the input and key hints below.
- Right inspector 266px (M:318-324): current request, progress bar, task list with done/busy/waiting dots, key-values (Review: Waiting). Toggle Ctrl/Cmd+I; becomes an overlay below 1030px (M:130, 376).
- Reader modal (M:327) and bottom-right toast (M:326).

Primary: feed plus composer, with the decision panel as the single focal point. Peripheral: rail, inspector. The inspector note states the rule: "Only the approval decision uses gold" (M:323). CW uses the same three-pane family (CW DESIGN.md "Navigation conventions").

## 2. Attention and focus rules

In M:
- Gold is reserved for the pending decision (M:95, 215, 323). Blue is activity, green is done. The inspector "Waiting" row is the only other gold (M:121).
- Agent work never moves focus. Events append to the feed; background state shows as a spinner, timer and an inspector busy dot (M:106, 122, 354, 385). One run at a time (M:355).
- Only operator gestures take focus: Ctrl/Cmd+K to composer (M:384), New session (M:381), reader opens onto its Close button (M:471).
- Return path: the reader saves `document.activeElement` and restores it on close (M:463-466); Escape closes layers (M:384, 559); the Activity feed is snapshotted and restored when switching views (M:362-366).
- Stale sources are flagged amber, not silently refreshed (M:223, 467, 482).
- Reduced motion honored (M:133).

Missing in M: no interruption queue, priorities, escalation, snooze, per-session unread badges, or way for a background session to signal. Toasts last 2.6s (M:335). Auto-scroll is unconditional (M:338, 347). This is a gap, not a pattern.

In GS (design level):
- Attention is separate from focus: a transient estimate with fixed precedence (explicit-selection, selected-text, focused-object, keyboard-focus, pointer-dwell, pointer-at-open, active-execution, shared-focus, recent-interaction, workspace-fallback), never a score (GS docs/subsystems/focus-engine.md:50-57).
- `AttentionSnapshot` freezes at `/` open, so "this" cannot drift (focus-engine.md:62-67; journey J13, docs/reference/journeys.md:29).
- SharedFocus is human-governed, enforced server-side in policy with a reducer backstop; agents can only `propose` an evidence-bearing `FocusCandidate`; no WebMCP accept tool exists (docs/explanation/why-human-governed-focus.md:16-37, 78-79).
- Anti-nag: a rejected candidate with the same `evidenceToken` cannot be re-proposed without new evidence (why-human-governed-focus.md:58-66).
- Typing guard: `/` opens search only when not typing in an input ("never steal normal typing", GS src/ui/focus.tsx:30-41). Escape closes it (focus.tsx:42) or deselects an execution (src/ui/main.tsx:89-92).
- Reload reattaches: bounded scrollback replay plus durable projections (docs/subsystems/cockpit.md:106-109).

## 3. Composer

M: one textarea with a `›` prefix and a send button (M:313-316). Enter sends, Shift+Enter newline, auto-grows to 140px (M:371). Ctrl/Cmd+K focuses it (M:384). Unification is regex keyword routing only: `help`, `clear`, `/help`, `/clear`, plus phrases like "design missing test", "show retry behavior", "release checklist" (M:372, 525-529, 685-690). A hint line teaches phrases (M:294). No real modes, slash menu, at-mentions, autocomplete, history or in-composer previews; the mode button is a toast stub (M:373).

What is worth keeping: one entry point whose response is an inline typed card in the feed, never another window (M:517), each labeled with provenance ("AGENT PROPOSAL · NOT EXECUTED", M:601).

GS has no composer: PTY input, a structured-run box (Enter runs, src/ui/executions.tsx:112), and the `/` palette (Enter searches, focus.tsx:99). Its transferable idea is deixis: "this" binds to a frozen semantic entity, then results arrive with a `SearchReceipt` (focus-engine.md:105-137).

Complete key map found: Enter send; Shift+Enter newline; Ctrl/Cmd+K focus composer; Ctrl/Cmd+I inspector; Escape closes menu, reader or inspector (M:384, 559); GS `/` open palette; GS Enter run or search; GS Escape close or deselect.

## 4. Agent work, progress, decisions, simulation

Real-state indicators:
- Meta line plus collapsed detail: "Inspected 6 files · 2 commands · 3.2s" (M:272-274).
- Results carry their limits: "Focused tests passed ... not a release decision" (M:277).
- Proof strip: CHECKED vs NOT YET CHECKED, "Unknown is not the same as passed." (M:286-289), repeated as ✓/? evidence cells (M:299-302).
- Checklist: unverifiable items disabled, notes cannot make a check pass (M:507, 630).
- Task states in words: "Complete", "In progress", "Queued in preview · not running" (M:321, 648). Footers: "0 live tests executed" (M:293).

Decision card (M:295-310, 215-222): overline plus ref; plain heading; summary; evidence pair; "NEXT RECOMMENDED ACTION"; three ranked actions (gold safe primary "Design missing test", secondary "Keep merge on hold", tertiary "Request an exception..."); standing-consequence footer (M:309). Resolving turns it sage, retitles it "REVIEW NOTED" and updates the inspector row (M:635-642); it stays as the record. The risky path is behind a form requiring reviewer, expiry, reason, monitoring, rollback and acknowledgment, with the submit disabled and a visible reason (M:617-628, 653-665); even after submit it says nothing was approved (M:662).

Simulate before acting (strong): scenario tabs recompute a flow and numbers, with "a possibility, not a measured fact" and "Simulation only" (M:292, 485-498). The test-plan card gives start, pass condition, boundary, steps, and "What this would establish / would not establish", status "Proposed · No test written · No result recorded" (M:600-616). Queued work says "no agent has acknowledged" (M:646).

GS equivalents: effects always carry evidence, including `none`; output is literally `"unknown"` for PTY runs; `derived` vs `observed` settlement; intent vs observation as different log kinds (docs/mental-model.md "Intent versus reality"); `SearchReceipt` lists only stages that ran and reports unavailable mechanisms rather than substituting (focus-engine.md:129-137).

## 5. Adopt, do not impose, gaps

Adopt verbatim:
- One accent for the one unresolved human decision (M:323); CW: one filled-accent button per surface (CW DESIGN.md "CTA hierarchy"; UX.md rule 4).
- Decision-card anatomy with safe default, consequence footer and persistent resolved state.
- Known/unknown pair. Provenance labels on every generated object (SIMULATED, PROPOSED, QUEUED, EXECUTED, STALE).
- Snapshot-pinned references with visible staleness; focus restored on close (M:463-482).
- Agents propose, humans resolve, enforced server-side, plus evidence-token anti-nag.
- Frozen attention snapshot for "this". Typing guard on shortcuts.
- Words beside color, visible disabled reasons, teaching empty states, honest unknown (CW UX.md rules 6-9). Modal contract: focus trap, Escape, focus return; `aria-live="polite"` (CW DESIGN.md).

Terminal-specific, do not impose on a notebook:
- A single linear chat feed as the only surface; a notebook's document is the artifact.
- `›` prefix, PTY/shell view, `/` as a global hotkey (collides with prose in cells; scope it to the composer).
- Full-screen modal reader (use inline or side-by-side).
- Unconditional auto-scroll; elapsed timer; one-run-at-a-time gate.
- The xterm byte stream. The semantic layer (entities, receipts) transfers.

Gaps in M:
1. No interruption model: queue, priority, escalation, snooze, unread (rail shows only a selected dot, M:255-260).
2. No "N new" pill; auto-scroll steals reading position.
3. Composer is regex routing; no modes, slash, mentions, drafts (M:525-529).
4. Thin keyboard map; no keys or focus cue for the decision panel; code lines focusable (M:461) without an arrow model.
5. `aria-live` only on the toast (M:326); disabled reasons are tooltips (M:507), violating CW UX.md rule 7.
6. Status and timer come from the simulation, not a state source; "READY" overwrites the timer (M:354).
7. Results have no evidence ID or as-of time (only file snapshots).
8. Resolution has no undo, actor, timestamp or expiry on the hold.
9. Low-contrast 10px mono text (`--dim` #526774) and dot-only cues.
10. Inspector, the only "waiting on you" glance, goes off-canvas on narrow screens (M:130-131).

## 6. Ten testable UX rules for Horizon

1. One decision, one accent. At most one element in the viewport is styled "waiting on you"; others queue as "1 of N". Test: two pending decisions render exactly one primary.
2. Agents cannot take focus. Agent events change only badges, counters, inspector rows and appended items. Test: fire agent events while typing; `activeElement` and caret are unchanged and no modal opens.
3. Only operator gestures move focus, and each has a return. Test: open then Escape from three stacked layers; focus returns to the origin each time.
4. Interruptions are tiered: signal (badge), notice (persistent inbox), needs-decision (card). Each needs-decision shows age and can be snoozed or declined with a reason. Test: inject mixed events; assert badge counts, inbox order, no focus change.
5. Never scroll away from the reader. If more than one screen from the bottom, show an "N new" pill. Test: scroll up, append, `scrollTop` is unchanged and the count is right.
6. Every object states its reality in words: SIMULATED, PROPOSED, QUEUED, RUNNING, EXECUTED, VERIFIED, STALE, UNKNOWN. Test: each card type has a status string; none is color-only.
7. Preview before act, and approval is bound to the preview's ID or hash. Test: change input after preview; approve is disabled with visible "preview is stale". The safe action is default; Enter never triggers a destructive one.
8. Unknown is first-class. No evidence renders "unknown", never 0 or pass; a human note cannot satisfy a check. Test: item without evidence is unchecked, disabled with reason text, counted unverified.
9. Disabled and empty states explain themselves in visible text and name one next action; no tooltip-only reasons or inert controls. Test: every disabled control has adjacent text; every empty region has exactly one primary action.
10. Stale references are flagged, not refreshed. Pins show a revision and go visibly stale on change, with an explicit reload. Test: mutate source after pin; marker appears, content unchanged, reload action exists.

Composer corollaries (testable): shortcuts never fire while typing; one input accepts prose, `/` commands and `@` references with a visible mode chip showing how it will be interpreted before Enter; unsent drafts survive view switches.
