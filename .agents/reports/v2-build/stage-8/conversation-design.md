# Desk conversation: design

Status: approved for build by the operator, 2026-11-07 ("I leave it to you to do it the best way"). The EGM skill can only be started by the operator, so this design was not run through it. Owner: Horizon desk. Replaces the per-page thread built in stage 7 (`b9fc56f`).

Read with: `research-gs-term.md` and `research-cockpit.md` in this folder.

## 1. The problem

The desk's conversation (stage 7) is a per-page list of chat-like turns, laid out from a visual mock. It falls short in four ways:

- It forgets everything on reload, so it is not a record.
- It shows only what you typed. Work started by an agent, and the panels agents build, live elsewhere (the "From agents" list) or nowhere.
- Agents have no way into the page. Every agent action reaches Horizon through the server only, so the page cannot offer its own actions to an agent working beside you.
- It looks like a chat. The two systems the operator named as its basis, gs-term and the product-actualizer cockpit, both reject chat layouts on purpose.

## 2. What we take, and from where

| Idea | From | Why it fits Horizon |
|---|---|---|
| Two doors, one record: an action you type and an action an agent runs leave the same kind of row, and only the source differs | gs-term `docs/explanation/why-two-doors-one-world.md` | Horizon already has this split: the composer (you) and agent tools (agents). The desk just never shows them together. |
| Each row opens to its effects and the evidence for each one | gs-term Inspector | Horizon's moves already carry decided, recorded and observed (`WorkspaceMove`, `src/ui/workspace/model.ts:68`). |
| Honest "not seen yet" state, never shown as "no" | gs-term `.state-chip.unknown` | It matches Horizon's existing rule against making things up. |
| Agents compose UI from fixed parts as data. They never write page code. | cockpit `protocol/spec.ts` | Horizon already has the same 15 blocks (`src/ui/surface2/grammar.ts`). |
| Asks with Answer, Not yet and Skip; a short echo once answered; the agent must say where each answer went | cockpit `web/blocks/ask.tsx`, `hooks/src/lib/inbox.mjs` | Horizon's reply rule (`src/capabilities/panel-answers.ts`) is weaker: any later agent call counts as a reply. |
| WebMCP: the page offers its actions to an agent through `document.modelContext`, using the same code path as its buttons | gs-term `src/webmcp/*`, cockpit `web/webmcp.ts` | An agent beside you can find, read and propose through the desk instead of around it. |
| No tool can answer, approve or confirm for you | both | It matches Horizon's authority rule: agents propose, people decide. |

What we do not take:
- gs-term's terminal.
- The cockpit's docked tabs.
- Chat bubbles.

## 3. The design

### 3.1 The conversation is a record of moves

The conversation is one list, newest at the bottom, of everything moved through the desk:
- notes you write;
- hand-offs;
- searches;
- decisions (Mark done, Hold);
- agent proposals;
- panels agents put up;
- your answers to them.

It is stored, so it survives reload. The case keeper, the record keeper and the stored notes stay the authority; the conversation is a read model that points at them.

Each row shows:
- a status dot: done, waiting for you, refused, or not seen yet;
- the words of the move (with stand-ins while Presenting is on);
- a source badge: **You**, **Agent** (with the agent's name), or **Agent via the page** (a WebMCP call);
- the time;
- one line of outcome, such as "Added to Seed: triage inbox. It has started."

Selecting a row opens it in the existing Inspector, with three things:
- **Decided:** what the case keeper said.
- **Recorded:** what the record keeper holds.
- **Observed:** what was seen afterwards, or "not seen yet".

The raw answers sit behind Details. This reuses the Inspector and the `WorkspaceMove` claims; nothing new is invented for evidence.

### 3.2 Two doors

- **You:** the composer. Its modes stay: Write, Hand off, Find, Ask.
- **Agents:** server tools (unchanged) and WebMCP tools (new, section 3.4).

Both doors call the same desk operations (`/desk/note`, `/desk/handoff/preview`, `/desk/handoff`, `/desk/search`, `/desk/decide`), and each operation appends one conversation row with its source. A write never skips the preview. When an agent asks to hand off, the row shows the same preview card, and only your Confirm sends it.

### 3.3 Agent panels live in the conversation

- **Placement:** an agent panel appears as a row in the conversation at the moment it was put up, drawn inline from Horizon's blocks. It is no longer a separate "From agents" list.
- **Updates:** a new version replaces the panel in place and adds no new row.
- **Folding:** once a panel has no open ask, it folds to its title and summary. Panels the person pinned stay open.
- **Answering:** an ask offers Answer, Not yet and Skip. Once answered it folds to an echo:
  - "You answered: X";
  - then "The agent took it to: <where>", or "Waiting for the agent to say where it went".
- **Ask inputs:** add `confirm`, `multiselect` and `text` to the existing select. Options gain `consequence`. An ask gains `resolves` (the step or decision it settles). This is a grammar change, so it goes through the grammar's own version: `horizon.surface/2` becomes `/3`, still 15 blocks.
- **The agent must say where each answer went** (`routed_as`, at least 6 characters): for example "step handoff_0a49 in Seed: triage inbox", or "no action: <why>". An answer without that stays marked "waiting for the agent" in the conversation and in Needs you. It keeps blocking step acceptance, as today.
- **Eviction:** a panel with an open ask is never removed by the cap of 8. The agent can withdraw an ask, with a reason that is shown.
- **Unknown blocks:** a block type Horizon does not draw keeps today's plain "This part cannot be shown here" line. Drawing the other 10 block types is out of scope (section 6).

### 3.4 WebMCP: the page offers its actions to agents

- **Registration:**
  - The page registers tools on `document.modelContext` using `@mcp-b/webmcp-polyfill` 5.1.0, the version gs-term pins.
  - Registration happens in one file only, `src/ui/desk/webmcp.ts`.
  - An architecture test enforces this and bans `navigator.modelContext`.
- **Tools.** Each is one descriptor `{name, description, inputSchema, invoke}` that checks its input before acting:

  | Tool | Kind | What it does |
  |---|---|---|
  | `desk_state` | read | Today's notes, the open case, the waiting steps, and whether each service is connected |
  | `desk_find` | read | The same search as Find |
  | `desk_inspect` | read | One row's decided, recorded and observed |
  | `desk_propose_handoff` | proposal | Makes a hand-off preview row. Nothing is sent until you press Confirm. |
  | `desk_propose_note` | proposal | Puts suggested words in the composer for you to save or discard |

- **Never offered:** confirm, mark done, approve, answer, or settle. The descriptors file states this, and a test checks it.
- **Caller:** WebMCP calls carry their own caller (`actor.kind = "agent"`, surface `webmcp`), never your identity. gs-term mixed the two; Horizon does not.
- **Presenting on:** read tools return stand-ins for repository names, as the page does.

### 3.5 One place: record, command line and composer together (operator's ruling, 2026-11-07)

The record, the command line and the composer are one piece, called **Conversation** on screen. It looks like the operator's mock (`.tmp/sandbox/godspeed_terminal_v3.html`), drawn in Cognate Workbench's colours and type.

- **Nav:** a new **Conversation** item in the nav (after Today) opens it full height. The layout:
  - a header naming the setup and the open case;
  - a "Try …" line;
  - the rows (3.1). Agent panels and waiting proposals are drawn as cards, like the mock's "Review required" card: a small label, a heading, the facts, then the actions.
  - the composer pinned at the bottom: status line, the box with a round send button, and key hints.
- **Every other view** keeps the same composer bar at the bottom. Its status line shows the latest row, and a "Conversation (n)" button opens the full view. There is one composer and one record; nothing is duplicated.
- **The box is also a command line** (the gs-term door). A line starting with `/` runs a desk command:
  - `/find <words>`, `/handoff <words>`, `/note <words>`;
  - `/done <step>`, `/hold <step>`, which open the same preview as the buttons.

  A typed command and an agent's tool call leave the same kind of row. Plain words keep working as today, in the chosen mode.
- **Agent proposals:** a proposal from an agent (WebMCP or not) is a card waiting for you, with Confirm and Discard.
- **Badges:** **You**, **Agent**, **Agent on this page**. The word "WebMCP" never appears on screen.

The stage-7 per-page thread is removed.

## 4. Storage and clearing

- **Collection:** a new stored collection, `horizon-conversation`, one record per row, in the same store as notes.
- **Contents:** each record holds references (step id, intent id, panel id) and the words. It never holds the raw answers.
- **Shown:** the newest 200 rows; older ones are reached through Find.
- **Clearing:** `setup-check-empty` counts the collection. `seed-clear` and `setup-clear` remove it with the setup, and `seed` adds a few rows so the conversation is not empty.

## 5. Authority and safety

- **Agents propose, people decide.** Every write from an agent becomes a waiting row. Your Confirm is the only send.
- **The agent caller is separate from yours.** The server checks it on every desk operation: an agent caller cannot reach `/desk/handoff` (send), `/desk/decide` or `/desk/panels/op` with a human operation.
- **Words never carry raw error text** (as today).
- **Agent-supplied inline data is marked** "from the agent".

## 6. Out of scope

- Drawing the 10 block types the desk does not draw yet: chart, graph, compare, form, preflight and the rest.
- Streaming agent text.
- Consuming outside WebMCP tools: the gs-term consumption seam.
- A docked tab layout.

## 7. Proof

- Unit tests:
  - the conversation reducer;
  - each WebMCP descriptor: input checks, plus "no confirm tool";
  - the server refusing an agent caller on send and decide;
  - the `routed_as` rule;
  - eviction protecting open asks.
- Architecture test: one registration file, and no `navigator.modelContext`.
- Playwright, live:
  - you hand off, and it shows as a row with the You badge;
  - an agent proposes through WebMCP (the test calls `document.modelContext` tools), and the row shows "Agent via the page", waiting for you;
  - you Confirm, and the row turns done;
  - the agent puts up a panel with an ask, and it shows inline;
  - you answer; the agent routes the answer, and the echo shows where it went;
  - after a reload, everything is still there.
- axe, keyboard and Presenting scans as in stage 7.

## Detailed implementation plan

Each step is small enough for one agent. Steps 1-3 can run in parallel; 4 needs 1 and 2; 5 needs 1; 6 needs 3; 7 needs all of them.

1. **Store and model.**
   - **Files:** `src/capabilities/conversation.ts` (collection `horizon-conversation`, append and list), `src/ui/desk/conversation-model.ts` (row type, pure reducer, newest 200).
   - **Wiring:** append a row from each existing desk operation in `src/app.ts`.
   - **Read model:** a `GET /desk/conversation` route.
   - **Tests:** the reducer, and the append from each operation.
2. **Agent caller on the server.**
   - Read the source and caller from a header set only by the page's WebMCP bridge, and from server agent tools.
   - Refuse an agent caller on send, decide and human panel operations.
   - **Tests:** each refusal, plus the human path unchanged.
3. **Grammar v3 for asks.**
   - **Grammar:** add `confirm|multiselect|text` inputs, option `consequence`, ask `resolves`; answers get `routed_as`. The grammar stays at 15 blocks. Version `horizon.surface/3`, with `/2` still read.
   - **Panels model:** no eviction of open asks; `ask.withdraw`.
   - **Tests:** schema, eviction, withdraw, `routed_as` length.
4. **Conversation UI.**
   - **Composer.tsx:** draw the stored rows (badge, dot, outcome) instead of the per-page thread.
   - **Inspector:** the selected row opens its decided, recorded and observed.
   - **Proposals:** a proposal row has Confirm and Discard.
   - **Tests:** render tests, plus the word scan.
5. **WebMCP.**
   - **Dependency:** add `@mcp-b/webmcp-polyfill@5.1.0`.
   - **Files:** `src/ui/desk/webmcp-tools.ts` (descriptors), `src/ui/desk/webmcp.ts` (the only registration).
   - **Wiring:** start it from the desk client.
   - **Tests:** descriptors, input checks, "never offered" list, and the architecture test.
6. **Panels inline.**
   - **Placement:** draw panels as conversation rows and fold closed ones. Remove the separate "From agents" list, but keep its keyboard reach.
   - **Asks:** the new inputs and the routed echo.
   - **Tests:** render, and the answer flow.
7. **Proof.** Seed rows, the Playwright journeys in section 7, axe, keyboard, Presenting, and a report in `stage-8/`.
