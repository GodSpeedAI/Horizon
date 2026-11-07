# workspace — GUI workspace model, comparison page and inspection

## Overview

The human GUI model (T09/T10). `model.ts` maps one navigation frame plus one closed `GuiView`
into a fixed six-region document and the read model behind `/workspace.json`; `inspect.ts` attaches two
read-only observations (a world-debugger answer and cited Context Kernel retrieval) to the same
frame the terminal and GUI already render. The page itself is the desk (`src/ui/desk/`): its Today,
Decide, Work and Inspector draw this model's moves, choices, debugger answer and citations
(`views/Home.tsx`, `NextDecision.tsx`, `Answers.tsx`, `views/Cost.tsx`, `ComparisonView.tsx`).
`compare.tsx` and `compare-model.ts` are the comparison model and its no-script server page.
The old `render.tsx`, `economics.tsx` and `approval-inbox.tsx` pages were removed in stage 3.

Owner pinning is structural, not a styling hint: the region list is a constant sequence and agent
contributions are collected into one append-only region, so no input order can move the owner's
decision. Every view is a pure function of stored facts and injected answers — nothing drawn can
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
- Rendering moved to the desk: `NextDecision` (the frame's choices and blocked list), `DebuggerAnswer`,
  `ReferenceCitations`, `InspectPanel`, `Cost`, `ComparisonView`, `GettingStarted`, `Receipt`, `Moves`
  `[desk/NextDecision.tsx:NextDecision]`, `[desk/Answers.tsx:DebuggerAnswer]`,
  `[desk/Answers.tsx:ReferenceCitations]`, `[desk/views/Cost.tsx:Cost]`.
- Comparison: `ComparePage`, `renderComparePage(props)` `[compare.tsx:renderComparePage]`.
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

**Desk views — no widening**

- The next decision is drawn only when the frame's state is `ready`, `partial` or `blocked`;
  `empty`, `unknown` and `error` show a status or alert paragraph instead
  `[desk/NextDecision.tsx:NextDecision]`.
- An available choice with `action_id === null` is plain text prefixed `Also possible from the
  terminal:`; an available one with an action posts to `/workspace/intent` with the operation and
  focus `[desk/NextDecision.tsx:Choice]`.
- The debugger answer is a table of labelled facts with the class and source of each value, and it
  restates "Grants no authority. Settles nothing." `[desk/Answers.tsx:DebuggerAnswer]`.
- Cited reference material is quoted text marked not canonical; with no citation, or no question
  asked, it says "No sources" and nothing is shown as fact `[desk/Answers.tsx:ReferenceCitations]`.
- Approval and final sign-off are never one click: they are decision cards with a preview, and
  sign-off needs a typed reason, posted to `/desk/decide` `[desk/DecisionCard.tsx:DecisionCard]`.
- Case-form refusals use a fixed copy table keyed by a typed reason (`empty`, `too_long`); the
  submitted text is never echoed `[desk/views/Home.tsx:CASE_ERROR]`.
- Missing cost data says "Not recorded" with a reason, never 0; observed and estimate stay separate
  badges and the detail tables (`cost`, `unattributed`, `lessons`, `journeys`, `residuals`,
  `ablation`) are never folded into a total `[desk/views/Cost.tsx:ModelView]`.

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

- The desk components render in the browser bundle (`bun run build:desk`) and, in tests, through
  `renderToStaticMarkup`; the server only supplies JSON (`/desk/*.json`).
- `inspect` awaits an injected capability (`runtime.invoke`) and an injected checkpoint read
  (`runtime.readSnapshotAt`); both are caller-supplied and nothing here opens a transport itself
  `[inspect.ts:InspectionRuntime]`.
- Environment-variable names (`COGNATE_SEA_FORGE_OPERATOR`, `HORIZON_ECONOMICS_REALITYTRACE_BIN`,
  `HORIZON_ECONOMICS_DATA_HOME`, `HORIZON_ECONOMICS_STATE_HOME`) appear only as user-facing
  instruction text in the rendered copy; no module in this directory reads the environment
  `[desk/views/Cost.tsx:Cost]`.

## Verification

- Run: `bun test`
