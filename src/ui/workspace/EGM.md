# workspace — GUI workspace model, server-rendered page, economics and inspection

## Overview

The human GUI surface (T09/T10). `model.ts` maps one navigation frame plus one closed `GuiView`
into a fixed six-region document; `render.tsx` server-renders that document as semantic HTML with
no client bundle; `economics.tsx` renders a read-only case-economics page; `inspect.ts` attaches two
read-only observations (a world-debugger answer and cited Context Kernel retrieval) to the same
frame the terminal and GUI already render.

Owner pinning is structural, not a styling hint: the region list is a constant sequence and agent
contributions are collected into one append-only region, so no input order can move the owner's
decision. Every page is a pure function of stored facts and injected answers — the renderer cannot
enable an action, evaluate a gate or approve anything.

## Interface

- `WORKSPACE_SCHEMA = "horizon.workspace/1"`, `WORKSPACE_REGION_ORDER`, `WorkspaceRegionId`,
  `WorkspaceScope`, `WorkspaceState`, `WorkspaceTheme` `[model.ts:WORKSPACE_REGION_ORDER]`,
  `[model.ts:WORKSPACE_SCHEMA]`.
- Document types: `WorkspaceSnapshot`, `WorkspaceInput`, `WorkspaceChrome`, `WorkspaceStatus`,
  `WorkspaceClaim`, `WorkspaceMove`, `WorkspaceReceipt`, `WorkspaceOnboardingStep`,
  `WorkspaceRemoteRail`, `WorkspaceContextElement`, `WorkspaceRegion`, `WorkspaceNotice`,
  `WorkspaceChoice`, `WorkspaceBlocked`, `WorkspaceReview`, `WorkspaceAction`, `WorkspaceEvidence`,
  `WorkspaceSource`, `WorkspaceLineage`, `WorkspaceGraphNode`, `WorkspaceGraphEdge`
  `[model.ts:WorkspaceSnapshot]`.
- Builders: `buildWorkspace(input)`, `loadingWorkspace(frame, current, theme?)`,
  `buildLineage(objects, links, limit = 24)`, `workspaceState(input)`, `scopeOf(frame, current)`,
  `statusOf(input)`, `onboardingOf(input)`, `moveOf(facts, context)` `[model.ts:buildWorkspace]`,
  `[model.ts:loadingWorkspace]`, `[model.ts:buildLineage]`, `[model.ts:workspaceState]`,
  `[model.ts:moveOf]`.
- Formatters and classifiers: `shortRef(value)`, `readableTime(iso)`, `refusalText(reason)`,
  `refusedBy(reason, governed)` `[model.ts:shortRef]`, `[model.ts:readableTime]`,
  `[model.ts:refusedBy]`, `[model.ts:refusalText]`.
- `StoredMoveFacts`, `WorkspaceDebugger`, `WorkspaceReference`, `WorkspaceRetrieval`
  `[model.ts:StoredMoveFacts]`, `[model.ts:WorkspaceDebugger]`, `[model.ts:WorkspaceRetrieval]`.
- Rendering: `WorkspaceProps`, `Workspace`, `STYLE`, `ProjectionWorkspaceProps`,
  `ProjectionWorkspace`, `WorkspacePageInput`, `renderWorkspacePage(input)` `[render.tsx:Workspace]`,
  `[render.tsx:ProjectionWorkspace]`, `[render.tsx:renderWorkspacePage]`.
- Economics: `ModelView`, `EconomicsPage`, `renderEconomicsPage(readout, theme?)`
  `[economics.tsx:EconomicsPage]`, `[economics.tsx:renderEconomicsPage]`.
- Inspection: `RetrievalAnswer`, `debuggerView(answer)`, `retrievalView(answer)`,
  `InspectionRuntime`, `InspectionRequest`, `inspect(request, runtime)`,
  `missingRetrieval(outcome, detail)` `[inspect.ts:debuggerView]`, `[inspect.ts:retrievalView]`,
  `[inspect.ts:inspect]`, `[inspect.ts:missingRetrieval]`.

## Invariants

**Model — fixed order, no second layout policy**

- The region list is the constant six-tuple `context`, `decision`, `evidence`, `inspector`,
  `lineage`, `agent`, and `owner_pinned` is `id !== "agent"` `[model.ts:WORKSPACE_REGION_ORDER]`,
  `[model.ts:fixedRegions]`.
- No path exists from `view.nodes` to the owner region order: nodes are partitioned by
  `isAgentNode`, which routes `agent_composed`/`agent_proposed` **and** any agent-attributed block
  claiming `owner_pinned`/`owner_laid_out` into `agent_contributions`
  `[model.ts:isAgentNode]`, `[model.ts:buildWorkspace]`.
- `actionOf` sets `submit` only for `posture === "offered" && affordance === "available"`, so a
  `proposed` or blocked action is never submittable `[model.ts:actionOf]`.
- `choiceOf` attaches an `action_id` only when the choice is selectable **and** an offered,
  `available` action exists for the same operation ref; `reason`/`next_step` are populated only for
  unselectable choices `[model.ts:choiceOf]`.
- `workspaceState` precedence is fixed: error → empty (no objects and no choices) → unknown
  checkpoint → `no_affordance` → unresolved > 0 gives `partial` → otherwise `ready`
  `[model.ts:workspaceState]`.
- `buildLineage` bounds by identity, never by arrival: objects sorted by `object_ref`, links sorted by
  `${from}/${relation_type}/${to}`, `bound = Math.max(1, limit)`, edges filtered to the kept node set,
  and `table.rows` built from **every** row before the bound so aggregation never loses the list
  `[model.ts:buildLineage]`.
- `omitted_nodes` / `omitted_edges` are clamped with `Math.max(0, ...)` and `aggregated` is
  `sortedObjects.length > bound` `[model.ts:buildLineage]`.
- Scope is exact identity, not recency: `current` only when both `frame_id` and `revision` match
  `[model.ts:scopeOf]`.
- `moveOf` keeps four claims apart and never merges them: `decided`, `recorded`, `observed`,
  `settlement` `[model.ts:moveOf]`.
- `settleable` requires all of: governed, realitytrace, a committed record, not already final, and a
  settlement status in `null | "pending" | "unavailable"` `[model.ts:moveOf]`.
- `refusedBy` attributes a refusal only from the recorded text: Horizon's own checks are recognised by
  `IntentError|failed_precondition|invalid_argument|^(INTENT|HEALTH|SURFACE|WORKSPACE):`, SEA-Forge by
  `deny|denied|authority refused` or the literal `SEA-Forge` `[model.ts:refusedBy]`.
- `SETTLEMENT_MEANING` maps each settlement status to a statement no stronger than the status
  `[model.ts:SETTLEMENT_MEANING]`.
- `readableTime` returns an unparseable ISO string unchanged rather than inventing a date
  `[model.ts:readableTime]`.
- `buildWorkspace` and `loadingWorkspace` return frozen documents; `unresolved` is copied from
  `view.unresolved`, never recomputed `[model.ts:buildWorkspace]`.

**Render — no client code, no widening**

- The decision region is rendered only when `current` — i.e. state is `ready`, `partial` or `blocked`;
  `loading`, `empty`, `unknown` and `error` show a status or alert paragraph instead
  `[render.tsx:Workspace]`.
- An available choice with `action_id === null` is removed from the submit list and rendered as plain
  text prefixed `Also possible from the terminal:` `[render.tsx:Workspace]`.
- Agent contributions are shown but unsubmittable: the branch renders text
  `proposed by an agent; not offered to the human` for a `proposed` posture
  `[render.tsx:Workspace]`.
- Every submitted form posts `frame_id` (in `ActionForm`) or the operation plus `focus`, `evidence`
  and `theme` back to the server; approval and settlement are separate posts to
  `${basePath}/approval` and `${basePath}/settle` `[render.tsx:ActionForm]`, `[render.tsx:Receipt]`.
- Case-form refusals use a fixed copy table keyed by a typed reason (`empty`, `too_long`); the
  submitted text is never echoed `[render.tsx:CASE_ERROR]`.
- Only the six owner regions carry `data-owner-pinned="true"`; the agent region carries
  `data-owner-pinned="false"` `[render.tsx:Workspace]`.
- `queryOf` produces a stable ordered query string, dropping a key when the override value is `null`
  `[render.tsx:queryOf]`.
- The theme link is an inversion: `THEME_LABEL` maps `light` → `"Dark"` and `dark` → `"Light"`
  `[render.tsx:THEME_LABEL]`.
- `ProjectionWorkspace` treats `useProjection` returning `undefined` as loading, not empty
  `[render.tsx:ProjectionWorkspace]`.
- A malformed projection row is recorded once as `invalid_object` / `invalid_link` and the first
  error wins (`parseError ??= …`) `[render.tsx:ProjectionWorkspace]`.
- `waitForProjection` resolves only when the store publishes at least `expectedObjects` rows and
  rejects with `PROJECTION: <name> did not publish …` on timeout `[render.tsx:waitForProjection]`.

**Economics — read-only, observed and estimate never summed**

- The page contains no form and no action; the header states it "never gates or authorizes anything"
  `[economics.tsx:EconomicsPage]`.
- `Observed` and `Estimate` are separate badges, and the sessions table renders a per-case
  `no estimate recorded` badge rather than a computed figure `[economics.tsx:ModelView]`.
- `ModelView` renders six distinct tables (`cost`, `unattributed`, `lessons`, `journeys`,
  `residuals`, `ablation`) so unattributed usage and lessons cannot hide inside a total
  `[economics.tsx:ModelView]`.
- Journey `undefined` is described as "neither a pass nor a failure" and the residual kind list is
  `RESIDUAL_KINDS` plus any extra observed keys, sorted `[economics.tsx:ModelView]`.
- Ablation renders `not run` when `model.ablation.run` is false rather than an empty table
  `[economics.tsx:ModelView]`.
- `SkippedNote` names how many enrolled repositories are not shown and returns `null` when none are
  skipped `[economics.tsx:SkippedNote]`.

**Inspection — reference material cannot become a fact**

- `retrievalView` sets `class: "untrusted_reference"` as a literal and `canonical: false` as a
  literal, so the Context Kernel cannot promote its own text by asserting a class
  `[inspect.ts:retrievalView]`.
- `debuggerView` restates `authority: false` and `settles: false` literals and carries
  `missing_source` for every unknown, so an absence never reads as "no relation"
  `[inspect.ts:debuggerView]`.
- `argumentsFor` passes a caller's arguments through unchanged and injects `checkpoint_ref` only for
  `diff` and `timeline`; the debugger, not this module, judges validity
  `[inspect.ts:argumentsFor]`.
- `inspect` reads a named checkpoint through `runtime.readSnapshotAt` and passes
  `other_checkpoint: { ref, read: read.ok, … }`; an unreadable checkpoint is reported as
  `read: false`, not as an empty comparison `[inspect.ts:inspect]`.
- A retrieval call is made only for a non-blank query (`query.trim() !== ""`); absent means "do not
  ask", not "ask for nothing" `[inspect.ts:inspect]`.
- A capability failure becomes `missingRetrieval("unavailable", …)` and is never reported as
  `absent`: "nobody configured a kernel" and "the kernel did not answer" stay different facts
  `[inspect.ts:inspect]`, `[inspect.ts:missingRetrieval]`.
- Nothing in this module can change availability: it returns flattened observations only
  `[inspect.ts:inspect]`.

## Side Effects

- `render.tsx` and `economics.tsx` call `renderToStaticMarkup` from `react-dom/server` and emit an
  HTML string; `renderWorkspacePage` additionally creates a Cognate client with
  `createClient({ service, caller })` and always `await client.close()` in a `finally`
  `[render.tsx:renderWorkspacePage]`.
- `waitForProjection` subscribes to a projection store and installs a `setTimeout` that is cleared on
  success — a real timer with a default 2000 ms budget `[render.tsx:waitForProjection]`.
- `ProjectionWorkspace` reads shared runtime state through `useProjection("horizon.operational-objects")`
  `[render.tsx:ProjectionWorkspace]`.
- `inspect` awaits an injected capability (`runtime.invoke`) and an injected checkpoint read
  (`runtime.readSnapshotAt`); both are caller-supplied and nothing here opens a transport itself
  `[inspect.ts:InspectionRuntime]`.
- Environment-variable names (`COGNATE_SEA_FORGE_OPERATOR`, `HORIZON_ECONOMICS_REALITYTRACE_BIN`,
  `HORIZON_ECONOMICS_DATA_HOME`, `HORIZON_ECONOMICS_STATE_HOME`) appear only as user-facing
  instruction text in the rendered copy; no module in this directory reads the environment
  `[render.tsx:Receipt]`, `[economics.tsx:Body]`.

## Verification

- Run: `bun test`
