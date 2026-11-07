# Product Actualizer cockpit: recon for the Horizon redesign

Source: /home/sprime01/projects/product-actualizer (paths below are relative to it). Read-only review; nothing built or run. The cockpit.db was inspected by schema only.

## 1. Purpose, users, core loop

- **What it is for.** A shared screen where a person (the "owner") and an AI agent work on one incomplete product while a run is going. It is optional; closing it never pauses the run (docs/cockpit.md:3; docs/subsystems/cockpit.md:20).
- **Who uses it.** Two users in tension: the owner, who must decide what is actually true, and the agent, who tends to produce things that "read as finished". The design exists to make that failure hard (PRODUCT.md:9-15). Success is "an owner who can state what is true... and stop at a verdict they believe" (PRODUCT.md:27).
- **Core loop** (skills/cockpit/SKILL.md:13-18; docs/workflows/cockpit-session.md:14-95):
  1. Agent reads what the owner currently sees (`actualize ui context`).
  2. Agent composes a "surface" (a titled panel built from a fixed set of blocks) from data sources, never from HTML.
  3. Owner answers, rules, confirms or annotates. Each gesture is only recorded in an inbox file.
  4. Agent must route every inbox entry (to a proposal, a decision, an unknown, or "no action: why") and acknowledge it. Until then the release gate stays blocked (docs/workflows/cockpit-session.md:128-132).
- Three layers sit on top: the world debugger (ask "why / what depends / what if", read-only), the Case (where the work is heading and the one next move), and the Workbench with a Work Terminal (docs/world-debugger.md, docs/case-navigation.md, docs/workbench.md).

## 2. Layout, attention, truthfulness, decisions, preview, keyboard

- **Regions.** A fixed top rail (44px, never over a fifth of the screen), a docking workspace of surfaces below it, and a one-line Work Terminal at the foot (DESIGN.md:108; cockpit/web/App.tsx:36-52). The rail shows product, phase, the next action, counts of contradicted / stale / blocked items, a "needs you" button, and the gate verdict. The agent cannot edit or cover it: it is not part of workspace state (docs/cockpit.md:34).
- **Attention.**
  - The "Deviation-Leads Rule": the material problem and the next affordable fix are visually dominant, healthy state recedes, a contradiction outranks the owner's wish (DESIGN.md:117; docs/case-navigation.md "material deviation").
  - At most one primary move per view; it is guidance, never blocked, never the settling move (docs/case-navigation.md "affordance field").
  - Empty workspace offers one to four hints computed from state, "never a menu" (cockpit/server/templates.ts:34-49). New surfaces open beside the focused one without stealing focus; a table can pre-select its first row so the next thing to look at is already open (docs/subsystems/cockpit.md "Publish").
  - Hard cap of 8 surfaces; the oldest unpinned one without an open question is evicted, and eviction is undoable (workspace.ts:205-213).
- **Truthful state.**
  - Every claim carries one of seven evidence grades shown as a word, never colour alone; contradicted gets a tint (DESIGN.md:154).
  - `progress` blocks are bound to the live event stream; the agent cannot set the percentage (protocol doc:81).
  - Values the agent typed in are tagged "agent-supplied" with a dashed border (DESIGN.md Agent Tag; docs/cockpit.md:49).
  - An unrecorded check shows `unknown`, never pass (docs/workbench.md "evidence ledger"). No unmeasured number is turned into a score (tests/cockpit/case.test.ts:83-95).
  - Panels update from a file watcher with a 60ms debounce, no polling (docs/subsystems/cockpit.md "Internal operation").
- **Decisions.**
  - An `ask` block has seven input types; every option can carry a `consequence` and a `hint`, and every ask can be deferred or skipped (protocol doc:83-103). Cons render in warning colour so the trade-off shows before the choice (DESIGN.md Option Rows).
  - Rejecting needs a 12+ character reason (workspace.ts:355).
  - Owner gestures state what they recorded and what they did not change (DESIGN.md Do's).
  - `preflight` is the heavy-friction panel for a state-changing action: class (reversible / state-changing / irreversible), target, current state, expected result, stop-if, bounds, recovery. The owner confirms; the agent still performs the action through the normal path (protocol doc:79).
- **Simulate / preview.** Yes, in three forms, all read-only:
  - `world:counterfactual?ref=proposal:Pn` previews an open proposal. Each effect is classed known / derived / expected / unknown / observation-required, with the evidence that would settle it (docs/world-debugger.md:59-72). Output is flagged `authoritative: false`.
  - Historical views (`at=`) and candidate views always show a banner, and the rail stays on the settled model (docs/world-debugger.md:96).
  - The Case computes, for each possible move, reachability, cost, who may do it, how to undo it, and what it opens next; a blocked move says what would unblock it (docs/case-navigation.md:67-79).
  - Gap: no what-if on a decision's downstream numbers, and "probed / reachable / authorized" checks are never actually run (docs/world-debugger.md reach).
- **Keyboard.** Thin. Only Ctrl/Cmd+K opens a command palette with arrow-key navigation (App.tsx:83-110), plus focus rings and an ARIA toolbar. No documented shortcuts for ruling, next item or pane focus. Horizon must supply those.

## 3. Protocol and data model

- **Objects.** Surfaces (id, title, intent of inspect / compare / decide / verify / monitor, 1-12 blocks) (spec.ts:178-193); 15 block types; refs (15 kinds such as `claim:C42`, `proposal:P17`, `artifact:...`, `gate`), where `[[C42]]` in text becomes a grade-coloured chip (refs.ts:8; ui.tsx:18-33); sources in six families (`pa:`, `graph:`, `case:`, `work:`, `world:`, `file:`) (spec.ts:28-32). Process entities: claims, unknowns, proposals, decisions, artifacts, lenses, waves, blockers, responses, evidence. Work requests have a lifecycle `queued, acknowledged, running, produced, ready_for_review, accepted` plus `blocked / cancelled / failed`; only the owner accepts (docs/workbench.md; protocol/work.ts).
- **Not present as first-class objects:** "sessions" or "steps". The run is the session; the nine workflow stages are projected, not stored (docs/workbench.md "The workflow is the real process"). Evidence exists, as graded claims plus cited files.
- **cockpit.db schema** (`.schema` only): `meta`, `entities(kind,id,ord,data)`, FTS5 `search`, `events(seq,ts,channel,type,subject,run,data)`, `ui_state`, `interactions`, and `control_executors / bindings / contracts / requests / reviews`. Projection tables are disposable; `ui_state` and `control_*` are durable but never settle truth (docs/workbench.md "Two kinds of data").
- **How agents talk.** One Zod-validated vocabulary over three transports: CLI (`actualize ui ...`), loopback MCP at `/mcp`, and in-page WebMCP (docs/cockpit.md:69). 11 agent operations, 18 human operations, 14 base tools (docs/subsystems/cockpit.md "Core abstractions"). Errors are structured `{code, issues[{path,message,expected}]}` so the agent can self-correct.
- **Authority by transport.** The browser holds a human token in the URL fragment; the agent token is in a file. A `human.*` operation from the agent returns `AUTHORITY_HUMAN` (docs/subsystems/cockpit.md "Position"). Tests hash every run file to prove only inbox.jsonl changes (tests/cockpit/authority.test.ts:54-69).

## 4. Live vs designed; stack; running

- **Live.** Server, reducer, 15 blocks, Dockview workspace, 18 templates, world debugger, Case, Workbench and Terminal, work-request lifecycle, hooks, compiled binary. Tests cover grammar, authority, live server, CLI, layout mapping, browser end-to-end via system Chrome, world, case, workbench, and hook behaviour (tests/cockpit/*).
- **Designed or partial.** Reach probes (never run). Executors are never started by the cockpit. The Terminal is rule-based and understands only a fixed phrase set (.agents/DEBT.md). `layout: columns` is documented as two columns but is an auto-fit grid (docs/subsystems/cockpit.md "Known discrepancy"). The cockpit cannot tell a delegate from the owner (DEBT.md:93). The long implementation prompt (.agents/prompts/product_actualizer_cockpit_implementation_prompt.md, 1001 lines) is the Workbench brief; docs say it is built.
- **Stack.** Bun >= 1.4 only (no Node): Bun.serve + WebSocket, bun:sqlite (WAL), React, `dockview-react`, `@xyflow/react`, `@tanstack/charts`, `zod`, `playwright-core` for tests (docs/cockpit.md:99). About 5.5k lines of TS in cockpit/*.
- **Run.** `just cockpit-up` or `actualize cockpit up|down|open|status|rebuild|reset`; localhost only, rejects non-loopback hosts and cross-origin requests (docs/workflows/cockpit-session.md:176-185). Light and dark themes, OKLCH tokens (DESIGN.md frontmatter).

## 5. What Horizon should do with it

**Adopt directly (concepts):**
1. The closed block vocabulary plus source binding: agents supply data and bindings, never markup. Horizon's trace, decision and agent-supervision views become ~15 typed blocks.
2. The three-tier authority model (system / agent / owner) with `AUTHORITY_*` refusals, and the rule that owner gestures are recorded, then routed, then acknowledged.
3. Rail + docking surfaces + one-line terminal as the shell; the 18-template idea ("open without an agent") for the notebook/composer views.
4. The grade-plus-word badge, "agent-supplied" tag, and ref chips. These map to RealityTrace evidence grades and `.sea` entity refs.
5. The `preflight` panel as the template for Horizon's governed-decision confirmation (class, bounds, stop-if, recovery).
6. Counterfactual classing (known / derived / expected / unknown / observation-required) for "simulatable outcomes".
7. Structured error contract and lint warnings on agent compositions.

**Overlap, merge rather than duplicate:**
- Work requests (queued to accepted) overlap Cognate Workbench agent runs. Use one lifecycle table; the cockpit's "agent can never accept its own work" rule should win.
- Inbox ack plus gate blocker overlaps Horizon's governed decisions. One approval record, not two.
- Event stream (process vs cockpit channel) overlaps RealityTrace; make RealityTrace the source and keep the cockpit-style diff-derived view as a projection.
- Case derived from a run directory vs SEA-Forge cases: treat the Case as a pure function of the SEA-Forge case, not a second store.
- Projection-in-SQLite-that-can-be-deleted pattern fits all four systems; use it once.

**Why it may be the better host for some features:** layout persistence and restore, command palette, search (FTS5), accessibility rules, loopback token security, and WebMCP/MCP exposure are done and tested. Not suited to host: the daily notebook and rich composer (it is explicitly anti-chat and has no editor), and Bun-only runtime if Horizon is Node.

## 6. Eight strongest UX rules (testable)

1. **Rail immutability.** No agent action may add, edit, hide or cover the status rail; ops naming rail/gate return `AUTHORITY_SYSTEM`.
2. **One primary.** A view shows at most one primary-styled action and at most one primary move; it is never a blocked or settling move.
3. **Evidence leads.** If a relied-on claim is contradicted, it sorts above the owner's goal and no copy softens the no-go.
4. **Grade never alone.** Every grade/status/verdict has a text cue; remove colour and each state must still be distinguishable.
5. **Unknown is a value.** An unrecorded check or unmeasured figure renders `unknown`, never pass or a derived score.
6. **Preview is labelled and inert.** Any historical, candidate or what-if view carries a banner derived by shared code and leaves all authoritative files byte-identical.
7. **Friction scales with consequence.** Reading is one click; ruling needs a stated reason (12+ characters); irreversible actions show recovery, bounds and stop-if before the confirm.
8. **Owner layout wins.** A surface the owner placed or pinned keeps its position when the agent updates content; at most 8 surfaces, and any eviction is undoable.

Horizon gap to fill: keyboard-first operation (next/previous item, rule, defer, focus pane) which this cockpit does not provide.
