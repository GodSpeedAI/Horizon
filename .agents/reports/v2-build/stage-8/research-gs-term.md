# Research: gs-term (conversation, user/agent interaction, WebMCP)

Source: a read-only study of `~/projects/gs-term`, 2026-11-07. Paths are relative to that project unless they start with `node_modules/`.

## Main finding
gs-term has no chat conversation or composer. Its screen is a terminal cockpit: a terminal on the left and panels on the right (Focus, Executions or Inspector, World, Timeline). The chat, approval and agent-built UI parts exist only in the Cognate packages it vendors (`node_modules/@cognate/*`). gs-term never mounts them (`.sea/interaction/assumptions-and-unknowns.md:25-28`).

## Design intent (read first)
- `docs/explanation/why-two-doors-one-world.md`: a command typed by hand and a command run by a tool produce one kind of execution record.
- `docs/explanation/why-human-governed-focus.md`: agents propose; only people decide.
- `docs/subsystems/webmcp.md`, `docs/reference/webmcp-tools.md` (schemas; "Deliberately absent" table ~:124-135), `docs/how-to/add-a-webmcp-tool.md`.
- `.sea/interaction/handoff.md:80-87` ("Surfaces → same path").

## Two doors, one record
- Every run emits the same three events (`src/semantic/contracts.ts:166-205`): `execution.started`, `effect.observed`, then `execution.completed` or `execution.failed`.
- **Human door:** terminal markers (`src/bridge/observation.ts`), handled by `agent.observe`.
- **Machine door:** a cockpit button or a WebMCP tool, through one invoker (`src/ui/invoker.ts:265-289`) to `agent.execute`.
- Only `source` (`pty|ui|webmcp`), `surface` and `requestedBy` differ. One read model, the `executions` projection (`src/projections/executions.ts`), serves both doors.
- Effects carry evidence with a confidence of `observed|derived|unknown` (`contracts.ts:104-132`).
- **The closest thing to a turn** is one execution row (`src/ui/executions.tsx:313-333`):
  - a status dot, the command and a source badge;
  - relative time, duration and effect count.
- Clicking a row opens the Inspector (`src/ui/inspector.tsx`): effect cards with an evidence line each, the output, the raw events, and a copy-as-JSON button.

## Proposals
- An agent proposes a focus candidate (`src/agents/focus.ts:81-98`, `src/semantic/focus.ts:95-113`). The candidate carries a reason, evidence, suggested next actions and an `evidenceToken`. The token stops the same thing being proposed again after a refusal.
- Only a person accepts, pins or rejects it. The rule is enforced on the server (`src/app/policy.ts:59-63`) and again in the reducer (`requireHuman`).
- **Gap:** proposals never reach the screen. `candidate` is only ever set to undefined (`main.tsx:148`, `main.tsx:180`).

## WebMCP
- **Tools:** described once (`src/webmcp/descriptors.ts`, `{name, description, inputSchema, invoke}`), each checking its input before any side effect.
  - Tool list: `execute_command`, `get_world_state`, `focus_search`, `focus_inspect`, `focus_propose_candidate`, `code_references`, `code_definition`, `code_diagnostics`.
- **Registration:**
  - The tools are registered on `document.modelContext` through `@mcp-b/webmcp-polyfill` 5.1.0, in `src/webmcp/project.ts`.
  - An architecture test bans `navigator.modelContext` and allows registration only in `project.ts`.
- **Shared invoker:** UI buttons and WebMCP tools use the same invoker.
- **How agent calls show:** only after the fact, as rows with a `webmcp` badge.
- **What stops an agent:**
  - There is no tool to accept, pin or reject.
  - Server policy denies by default.
- **Gap:** WebMCP calls run as the human. The page's client uses the `HUMAN` caller (`main.tsx:37`).
- **Gap:** `execute_command` runs with no confirmation.

## Agent-built UI (vendored Cognate packages)
- **`node_modules/@cognate/profile-copilot/src/index.tsx`:**
  - Tools can require approval. The agent waits on `ctx.waitFor("approval:<id>", {condition:{kind:"human_approval"}})`, and a refusal goes back to the model as "refused: X was not approved".
  - A finished tool can emit `ui.render {component, props}`.
  - `GenerativeSurface` draws these from a registry of components and shows a placeholder for an unknown component.
- **`@cognate/ui-astryx`:** `ChatPanel`, plus `ApprovalCard` and `Approvals` (Approve or Reject resumes the waiting step).
- **`@cognate/react`:** the hooks `useAgent`, `useRun`, `useProjection`, `useCapability` and `useContinuations`.
- **`@cognate/ag-ui`:** sends the event stream as AG-UI over SSE.

## Look
- Dark and dense (`src/ui/styles.css:3-28`). Inter for text and JetBrains Mono for code. Badge colour per source (pty, ui, webmcp).
- A `.state-chip.unknown` chip is dashed and italic: it means "not observed", not "false".

## Reuse for Horizon
- **Patterns to copy:**
  - one invoker for buttons and WebMCP tools;
  - one record shape for typed and agent-run actions;
  - proposals resolved only by a person, enforced on the server;
  - honest "unknown" states;
  - a source badge on every row;
  - architecture tests that pin the rules.
- **Build new:**
  - the composer;
  - a separate non-human caller for WebMCP;
  - a visible approve-or-refuse step for agent tool calls.

  gs-term has none of these three.
