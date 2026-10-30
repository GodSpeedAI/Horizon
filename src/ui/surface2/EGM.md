# surface2 — closed surface grammar, binding, reduction and projection

## Overview

One schema, one binder, one reducer, one projection, one equivalence rule for every transport. The
GUI, the CLI text renderer and the MCP tool list all read the same vocabulary from `grammar.ts`, so a
construct one route accepts cannot be rejected by, or absent from, another. `surface.ts` in the
parent directory is the only composer; nothing here composes.

"Closed" is enforced by construction rather than convention: `.strict()` on every object, no string
ever interpreted as code, and a closed discriminated union of fifteen block kinds. The only
executable consequence of a surface is an enum member of `HORIZON_OPERATIONS`.

## Interface

- `SURFACE_SCHEMA = "horizon.surface/2"`, `SurfaceV2`, `parseSurface(input)`,
  `publishSurfaceSchema()`, `describeIssues(error)` `[grammar.ts:SurfaceV2]`,
  `[grammar.ts:parseSurface]`, `[grammar.ts:publishSurfaceSchema]`.
- Closed vocabulary: `SURFACE_ROLES`, `SURFACE_INTENTS`, `LAYOUT_PLACEMENTS`, `LAYOUT_AUTHORIZED`,
  `isLayoutAuthorized`, `RESPONSIBILITIES`, `TONES`, `HORIZON_OPERATIONS`,
  `CONSEQUENTIAL_OPERATIONS`, `isConsequential`, `REVERSIBILITY`, `BLOCK_TYPES`
  `[grammar.ts:BLOCK_TYPES]`, `[grammar.ts:HORIZON_OPERATIONS]`, `[grammar.ts:LAYOUT_PLACEMENTS]`.
- Types and schemas: `DisplayText`, `SourceExpression`, `parseSourceExpression`, `SourceNamespace`,
  `SOURCE_NAMESPACES`, `FILE_ROOTS`, `ActorAttribution`, `Provenance`, `SurfaceBlock`,
  `SurfaceAction`, `SurfaceIssue`, `ParseSurfaceResult` `[grammar.ts:DisplayText]`,
  `[grammar.ts:parseSourceExpression]`, `[grammar.ts:ActorAttribution]`, `[grammar.ts:Provenance]`,
  `[grammar.ts:SurfaceAction]`.
- Reference patterns `[grammar.ts:SEMANTIC_REF]`: `SEMANTIC_REF`, `WORLD_REF`, `EVIDENCE_REF`,
  `FRAME_REF`, `EXECUTION_REF`, `CASE_REF`, `ACTOR_REF`, `OS_OPERATOR_REF`, `OBSERVER_ACTOR_REF`,
  `AGENT_ACTOR_REF`.
- Limits `[grammar.ts:MAX_BLOCKS]`: `MAX_TEXT = 2048`, `MAX_BLOCKS = 64`, `MAX_ROWS = 500`,
  `MAX_COLUMNS = 12`, `MAX_NODES = 500`, `MAX_FIELDS = 32`, `MAX_SOURCE_DEPTH = 8`.
- `BindingStatus`, `OBSERVATION_STATUSES`, `ObservedValue`, `RefusalReason`, `SourceBinding`,
  `BindingContext`, `bindSource(expression, context)` `[binder.ts:bindSource]`,
  `[binder.ts:OBSERVATION_STATUSES]`, `[binder.ts:SourceBinding]`.
- `ReductionKind`, `ReductionNote`, `AffordanceStatusOf`, `ReducedSurface`, `authorityOf`,
  `reduceSurface(surface, role)`, `placementsFor(role)` `[reducer.ts:reduceSurface]`,
  `[reducer.ts:authorityOf]`, `[reducer.ts:placementsFor]`.
- `GUI_VIEW_SCHEMA = "horizon.gui-view/1"`, `ProjectedNode`, `ProjectedAction`, `GuiView`,
  `sourcesOf(block)`, `projectSurface(reduced, bind, affordanceOf?)` `[project.ts:GuiView]`,
  `[project.ts:sourcesOf]`, `[project.ts:projectSurface]`.
- `renderText(view)`, `escapeHtml(value)`, `renderHtml(view)`, `McpTool`, `mcpTools(operations,
  consequential)`, `addressableNodes(view)` `[render.ts:renderText]`, `[render.ts:escapeHtml]`,
  `[render.ts:renderHtml]`, `[render.ts:mcpTools]`.
- `Transport`, `SurfaceIntentSubmission`, `SurfaceIntent`, `EquivalenceResult`,
  `canonicalIntent(submission)`, `intentsEquivalent(left, right)` `[equivalent.ts:canonicalIntent]`,
  `[equivalent.ts:intentsEquivalent]`.

## Invariants

**Grammar — closed by construction**

- Every object schema is `.strict()`, so an unknown property (`onClick`, `html`,
  `dangerouslySetInnerHTML`) is an error rather than ignored `[grammar.ts:SurfaceV2]`,
  `[grammar.ts:SurfaceBlock]`.
- `DisplayText` refuses empty strings, anything longer than `MAX_TEXT` (2048), any `<` or `>` (regex
  `MARKUP = /[<>]/`) and any NUL `[grammar.ts:DisplayText]`.
- The block union has exactly fifteen members `metric`, `callout`, `table`, `tree`, `timeline`,
  `graph`, `chart`, `compare`, `media`, `document`, `entity`, `preflight`, `progress`, `ask`, `form`
  and dispatches on `type`; there is no member for `iframe`, `script` or a developer-defined
  component `[grammar.ts:BLOCK_TYPES]`.
- `parseSourceExpression` enforces: `namespace:path` with a colon not at index 0; namespace in
  `semantic | horizon | file | agent`; non-empty path of at most 512 chars and 8 segments; no `\`,
  `?`, `#` or whitespace; not absolute; every segment matching `SEGMENT =
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/` so `..`, `.` and empty segments never parse;
  `file:` must start with `evidence | specs | plans | ui-model | sea | prereg`; `semantic:` names
  exactly one entity `[grammar.ts:parseSourceExpression]`, `[grammar.ts:FILE_ROOTS]`.
- `ActorAttribution` is closed and self-consistent: a `human` role must use an `actor:`/`os:` ref and
  must name no delegating agent; an `agent` role must use `agent:`, must name `agent_ref`, must name
  `on_behalf_of_ref`, and requires `agent_ref === actor_ref` and `on_behalf_of_ref === principal_ref`;
  a `system` role must name no agent `[grammar.ts:ActorAttribution]`.
- `Provenance` binds source kind to source namespace and to attribution: `agent_supplied` requires an
  `agent:` source **and** an agent role; `bound` may not use an `agent:` source; `owner_authored`
  requires a human role; an authorized layout placement (`owner_pinned`, `owner_laid_out`) requires a
  human role `[grammar.ts:Provenance]`.
- A `SurfaceAction` by an agent may not name a consequential operation: the schema fails with "an
  agent MUST NOT present a consequential operation as its own action; it may only propose it"
  `[grammar.ts:SurfaceAction]`; consequential = `horizon.decide.approve`, `horizon.decide.reject`,
  `horizon.authorize.confirm` `[grammar.ts:CONSEQUENTIAL_OPERATIONS]`.
- Cross-block rules in `SurfaceV2.superRefine`: block ids are unique and action ids share that id
  space; graph node ids are unique and every edge endpoint names a node in the same block;
  `preflight` with `availability === "available"` must have a `null` `first_blocker` and any other
  availability must name one; a `form` must submit a consequential operation; a `tree` `parent_ref`
  must name a node in that tree and must not be the node itself `[grammar.ts:SurfaceV2]`.
- `parseSurface` never coerces, strips or repairs: `safeParse`, and on failure returns
  `{ ok: false, code: "INVALID_SURFACE", issues }` with at most 32 issues whose paths are JSON
  pointers, escaping `~` as `~0` and `/` as `~1` `[grammar.ts:parseSurface]`, `[grammar.ts:describeIssues]`.
- `publishSurfaceSchema` returns only data (`schema`, `block_types`, `roles`, `intents`,
  `responsibilities`, `operations`, `consequential_operations`) and asserts no permission
  `[grammar.ts:publishSurfaceSchema]`.

**Binder — deterministic, refusing rather than guessing**

- `bindSource` is a pure function of (expression, context): it reads no clock, network, random or
  environment variable `[binder.ts:bindSource]`.
- An `awaiting` entry for a namespace short-circuits to `status: "blocked"` with an `awaiting` label
  before any resolution is attempted `[binder.ts:bindSource]`, `[binder.ts:blocked]`.
- `semantic:` resolves only through `context.resolveEntity`; `undefined` becomes
  `refused / unresolved_entity` and never an invented entity `[binder.ts:bindSource]`.
- `agent:` values resolve only from `context.agentValues` via an own-property check, and are always
  reported `agent_supplied: true` with observation `"available"` — never as a bound fact
  `[binder.ts:bindSource]`.
- `file:` reads are refused outright when `allowFileReads === false` (`not_permitted`), refused for a
  root outside `FILE_ROOTS` (`outside_scope`), refused when the file exceeds `maxFileBytes`
  (default `64 * 1024`, reason `source_too_large`), and refused when it does not resolve
  (`not_found`) `[binder.ts:bindFile]`.
- Containment is checked on the **real** path after symlink resolution, for both `root/<path>` and
  `root/.agents/<path>` candidates, so a committed symlink cannot tunnel out of the permitted root
  `[binder.ts:bindFile]`.
- A bound file carries `observation: "empty"` for zero-length content, otherwise `"available"`, plus
  a `sha256` digest of the text and `operation: "horizon.file.read"` `[binder.ts:bindFile]`.
- The eight observation statuses are the only values a bound source may report: `available`, `empty`,
  `no-match`, `blocked`, `denied`, `unavailable`, `contradicted`, `partial` — there is no `ok` or
  boolean `[binder.ts:OBSERVATION_STATUSES]`.

**Reducer — monotone down only**

- `AUTHORITY` ranks placements `owner_pinned 4`, `owner_laid_out 3`, `default_order 2`,
  `agent_composed 1`, `agent_proposed 0`; the reducer only ever moves a claim downward
  `[reducer.ts:AUTHORITY]`, `[reducer.ts:authorityOf]`.
- `downgrade` caps a claim that names an agent while claiming anything other than `agent_composed` at
  `agent_proposed`, whatever its rank `[reducer.ts:downgrade]`.
- For `role === "agent"`, a claim at or above `default_order` is capped at `default_order` and
  anything lower stays `agent_proposed`; for `human` and `system` the claim passes through
  `[reducer.ts:downgrade]`.
- Owner blocks keep submitted order — the reducer never sorts — and blocks introduced by the
  presenting agent are appended after every owner block: `blocks: [...ownerBlocks, ...agentBlocks]`
  `[reducer.ts:reduceSurface]`.
- Every downgrade and attribution change emits a typed note
  (`layout_authority_claimed`, `provenance_replaced`, `agent_block_appended`,
  `action_proposed_not_offered`) rather than happening silently `[reducer.ts:ReductionKind]`.
- An agent-presented `bound` value is re-kinded to `agent_supplied`, so the projection cannot show
  agent text as a bound fact `[reducer.ts:reduceSurface]`.
- A consequential action attributed to `role === "agent"` is moved to `proposed` and never offered;
  the reducer comment records that this is structurally forbidden by the schema, so reaching it
  means a hand-built object, and the reducer fails closed `[reducer.ts:reduceSurface]`.
- `presentingActor` is deterministic per role: `human` keeps the submitted attribution, `system`
  becomes `actor:horizon-system`, `agent` becomes `agent:<surface_id>` acting for the submitted
  principal `[reducer.ts:presentingActor]`.
- `placementsFor(role)` returns only placements that survive `downgrade` unchanged
  `[reducer.ts:placementsFor]`.

**Projection — neutral and complete about provenance**

- `ProjectedNode` carries `node_id`, `path`, `label`, optional `text`/`tone`, `source_kind`,
  `layout`, `attributed_to` and `bindings` — no markup, JSX, style string or handler name is
  representable `[project.ts:ProjectedNode]`.
- `unresolved` counts every binding whose `status !== "bound"` or whose `observation !== "available"`
  `[project.ts:projectSurface]`.
- `sourcesOf` preserves declaration order, collapses duplicates, and adds `source` for
  table/tree/timeline/graph/chart/document/progress, each media `item.src` and each form `field.source`;
  a metric's inline value names no further source `[project.ts:sourcesOf]`.
- Default `affordanceOf` is `() => "unknown"`: absent frame knowledge is never rendered as
  `available` `[project.ts:projectSurface]`.
- `posture` is `"offered"` for reduced actions and `"proposed"` for the reduced proposals; the final
  filter keeps proposed entries unconditionally `[project.ts:projectSurface]`.

**Render — every interpolation escaped, nothing evaluated**

- `escapeHtml` replaces `&`, `<`, `>`, `"`, `'` via a fixed `ESCAPES` table and leaves no other
  character to a second pass `[render.ts:escapeHtml]`.
- `renderHtml` emits no inline handler, script or style; ids travel in `data-*` attributes so a shell
  binds intent to ids, not text `[render.ts:renderHtml]`.
- `renderText` is deterministic and ends with a trailing newline; a binding prints as
  `bound:<observation>` or `<status>:<reason|awaiting|unknown>`, with the suffix `agent` for
  agent-supplied values `[render.ts:renderText]`.
- `mcpTools` derives one `horizon.view` tool plus one tool per operation, named by
  `operation.replaceAll(".", "_")`, so advertised tools cannot diverge from the grammar
  `[render.ts:mcpTools]`.
- An agent is labelled with its delegation: `agent:<ref> acting for <on_behalf_of_ref>`
  `[render.ts:actorLabel]`.

**Equivalence — an unprovable intent is refused**

- `canonicalIntent` refuses `role_mismatch` when the transport's role differs from the view's,
  `unknown_node` for an action id the view does not contain, `not_offered` for a `proposed` posture,
  and `operation_not_in_view` when no **offered** action carries the operation
  `[equivalent.ts:canonicalIntent]`.
- `intentsEquivalent` is false when either side failed, and otherwise requires equal `surface_id`,
  `role` and `operation` `[equivalent.ts:intentsEquivalent]`.

## Side Effects

- `binder.ts` performs real disk reads: `fs.realpathSync`, `fs.statSync`, `fs.readFileSync` and
  `createHash("sha256")` inside `bindFile` `[binder.ts:bindFile]`.
- `binder.ts` imports `node:fs`, `node:path` and `node:crypto`; `reducer.ts`, `project.ts`,
  `render.ts` and `equivalent.ts` import no runtime module beyond the local grammar/types
  `[binder.ts:bindSource]`.
- `render.ts` returns strings for a caller to write or serve; it performs no I/O itself
  `[render.ts:renderText]`, `[render.ts:renderHtml]`.

## Verification

- Run: `bun test`
