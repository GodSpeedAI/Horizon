# Stage 9 — Implementation Readiness Report (Round 1)

- **Target:** `.agents/specs/Horizon_Operator_Workspace_Design_v1.md`, DetailedRange L299–411 (§12–15), plus the factual claims at L44, L49, L105, L125, and L213 that the slices depend on.
- **Reviewers** (all completed):
  - egm-implementation-readiness (Haiku), against `implementation-readiness-standard.md`
  - egm-codebase-details (Sonnet), same standard
  - egm-style (Haiku)
- **Goldfish context:** `intermediate_zoom_out_report.md`, `evals_requirement_brief.md`, `methodology_addendum_brief.md`. `capability_addendum_brief.md` arrived after dispatch, so its gaps G-7 and G-8 are added below by the Elephant.
- **Elephant spot-checks, both confirmed:**
  - `GATE_KEYS` at `src/domain/navigation.ts:23-31` lists the seven gates.
  - `MAX_BLOCKS = 64` is at `src/ui/surface2/grammar.ts:369`, and `SURFACE_INTENTS` is at `grammar.ts:38`.

## Verdict

**Not ready.** §13 is a statement of design intent, not an implementation plan. An engineer starting Slice A today would have to invent at least ten decisions. Three code facts change the design:

1. **There is no reusable Cognate notes facility** (CB-F1). Neither the SDK nor Workbench has a journal, annotation, tag, or revision store. L44 is false as written, so the journal is a new Horizon-owned store built on Cognate event and projection primitives. It needs the justification that §3 step 4 requires.
2. **The `horizon.surface/2` grammar cannot express notebook blocks** (CB-F2). It is a closed set of 15 block kinds with no paragraph, checklist, link, or reference kind. It caps a surface at 64 blocks, and its intents (`inspect | compare | decide | verify | monitor`) do not map to the composer modes. Slice C therefore requires a reviewed grammar extension, which L105 says needs its own security and compatibility proof.
3. **Cognate has no eval, grader, or rubric capability today** (CB-F9). The Stage 8 ownership row "Cognate owns eval sets and graders" describes a future state, not the current one.

## Facts confirmed in code (inputs for remediation)

| Claim | Status | Evidence |
|---|---|---|
| Seven affordance gates | ✅ | `src/domain/navigation.ts:23-31`: visibility, reach, payment, authority, capability, recovery, settlement_access. REQ-NAV-002 (`requirements/ledger.yaml:1068`). Test at `test/navigation-controller.test.ts:168` |
| world/checkpoint/focus references | ✅ | `src/ui/workspace/model.ts:32` (observer, world, checkpoint, focus, case, frame) |
| Typed intents | ✅ (contents not read) | `src/domain/intent.ts`, `src/capabilities/navigation-intent.ts` |
| `horizon.surface/2` closed grammar | ✅, but too narrow | `grammar.ts:27`, block union `:350-366`, `MAX_BLOCKS` `:369` |
| "Operator-pinned focus" | ❌ not found | The nearest is `owner_pinned` (layout authority, `grammar.ts:46-55`), which is not a focus pin |
| Workspace shell | ✅ already exists | `horizon.workspace/1` regions context/decision/evidence/inspector/lineage/agent (`model.ts:19-20`), plus `approval-inbox.tsx`, `economics.tsx` |
| Workbench session-trace | ✅ | `cognate-workbench/src/projections/sessionTrace.ts` (turns, invocations, tool calls, `recordedAt`) |
| RealityTrace outbox, delivery, reads | ✅ with limits | `cognate-workbench/src/observations.ts`. Only **14 event types** are observed, and model requests are not among them. Receipts live in the DurableStore and are "NOT the event log". Retry backoff is 250→4000 ms over 5 attempts, then the delivery is poisoned |
| Trace tests | ✅ | `test/J-T-trajectory.test.ts`, `J-RT-realitytrace.test.ts`, `J-COG-realitytrace.test.ts` (Workbench) |
| Context Kernel | ⚠️ client only | `src/adapters/context-kernel.ts` (JSON-RPC `query_reference`) behind `horizon.context.query_reference`. Server location not verified. Workbench context assembly is done by `ExpertsService.context` |
| Explore/Operate/Work compositions | ❌ not found | Only journeys J01–J06 exist (REQ-VERIFY-005, `ledger.yaml:5823`) |
| Stable run reference for eval labels | ⚠️ indirect | `(tenant, sessionId, turnIndex)`, `toolCallId`, and the RealityTrace `targetRef = ledger:<id>`, which is **null until delivered** |
| Eval/grader capability | ❌ none | Only a candidate `Ranker` (`cognate/packages/provider-typesafe/src/ranker.ts`) and a scale benchmark script |
| Workbench expert memory | exists, not a journal | `ExpertMemory` holds observation/assertion/inference/accepted items with a human-only promotion rule. Relevant to ZO-3 and lesson proposal |

## Consolidated findings

Raw finding prefixes: **IR** = implementation readiness, **CB** = codebase details, **ST** = style. Cross-references to earlier stages: ZO = Stage 5 zoom out, CT = Stage 6 comprehension, C7 = Stage 7 critics, S8 = Stage 8 zoom out.

### 🔴 Blockers

| ID | Sources | Lines | Problem | Fix |
|---|---|---|---|---|
| R9-1 | IR-F1, CB-F14 | L336–348 | Slices A–C have no inputs, outputs, files (Create/Modify/Delete), named tests, or done criteria. | For each v1 slice, add a table with inputs, outputs (path and format), files, named tests with pass criteria, and Done = tests pass + a recorded manual journey. D–G may stay as outlines with triggers. |
| R9-2 | CB-F1, IR-F6, C7-3 | L44, L250, L340 | No Cognate notes facility exists, yet L44 says one is reused and L250 says to reuse one "if found". | Rewrite L44: "a new Horizon-owned journal store built on Cognate DurableStore/event + projection primitives (pattern: `sessionTrace.ts:78-95`)". Add the §3 step 4 justification. Delete "if found". |
| R9-3 | CB-F2, CB-F11, IR-F4 | L105, L125, L97–103, L340 | The surface2 grammar has no notebook block kinds, caps a surface at 64 blocks, and its intents do not match the composer modes. | Add a Slice B exit decision: either map journal blocks onto `document`/`entity` with a field mapping, or specify a grammar extension (new kinds, a raised or paginated cap) with its own security and compatibility test as the entry gate for Slice C. |
| R9-4 | IR-F2, IR-F3, ZO-11, CT-7, ST-1, CB-F12 | L7, L79, L336–338, L350, L407 | The V3 prototype has no path, L407 points to this spec itself, and L350 makes the slice order negotiable. | Record the V3 path, or "not supplied — blocks Slice B". Define the Slice A freeze output as a table of observed behaviours. Fix the order as A→B→C, with any change made by recorded decision. |
| R9-5 | IR-F5, ZO-9, C7-14 | L113, L120, L340 | The day identity key is undecided. | Key = (organization_id, operator_id, local_date). The timezone convention is an attribute set at first write. The effective date is kept separate from the authored timestamp. |
| R9-6 | IR-F7, C7-10 | L121, L340, L360 | Access enforcement is undefined. | Apply the authorization predicate inside the query, before counting, grouping, or paging. Test: counts are identical with and without hidden items. |
| R9-7 | IR-F8 | L118, L121, L340 | "Source-attributed activity projection" names no source or adapter. | Name the v1 sources and their adapter paths, or show "not connected". Test: a source that is down renders as unavailable, not as zero. |
| R9-8 | IR-F9 | L97–103, L296, L338 | The v1 composer modes are undefined, and Ask/Propose/Delegate depend on deferred slices, while L296 forbids inert controls. | v1 offers Capture and Navigate. Other modes are hidden or shown as unavailable. List the keyboard bindings so Slice B's tests can assert them. |
| R9-9 | IR-F10 | L71, L338, L372 | How Cobalt design tokens are shared is undecided. | Before Slice B, name a pinned dependency or a generation step. A copy needs a stated reason. |
| R9-10 | IR-F11, S8 §6 (ZO-2 override) | L340, L342 | Addendum J1 requires one note→case placement, but placements sit in Slice D. | Add a single non-copy placement and its test to Slice C. |
| R9-11 | IR-F12, IR-F13, CB-F9, CB-F10, S8-1, S8-2, C7-28 | L47, L125, L340, L352–361 | The eval label has no spec text: no run-reference block, no attribute schema, no "operator-reviewed" state, no run-ID source, no evidence item, and no test. | Add to Slice C: a run-reference block holding `(tenant, sessionId, turnIndex)` with an optional `targetRef` that may be null, plus attributes for labeller, pass/fail, first-failure text, and rubric version. Add "operator-reviewed" to the state ladder. Add the test: "label a run; group by tag; case status unchanged; no aggregate pass rate". Correct the S8 ownership row to read "Cognate: proposed, not yet existing". |

### 🟡 Majors

| ID | Sources | Lines | Problem | Fix |
|---|---|---|---|---|
| R9-12 | CB-F3, CB-F13 | L88–91 | The shell (left rail, centre notebook, inspector) duplicates the existing `horizon.workspace/1` regions, approvals inbox, and economics view. | Add a mapping table from each existing region to its new role, marked Create/Modify/Delete. |
| R9-13 | CB-F4 | L49, L107 | "Operator-pinned focus" does not exist in code. | Mark it as new Slice B behaviour and name `owner_pinned` as the nearest existing mechanism. |
| R9-14 | CB-F5 | L213, L215 | The trace claims are true, but two limits go unstated: only 14 event types are observed (model requests excluded), and receipts are not stored in the event log. | Add both limits. They narrow what "RealityTrace evidence per trace row" can mean. |
| R9-15 | CB-F6, ST-9 | L398–404 | §15 attributes Workbench files to Cognate. | Prefix those lines with "Cognate Workbench:". Fix the missing spaces at L398 and L401. |
| R9-16 | CB-F7, G-1 | L166, §2 | The Context Kernel and the context assembly point are not named. | Add a §2 row: reference retrieval → Context Kernel via `horizon.context.query_reference`; assembly → Workbench `ExpertsService.context`. Point the J7 isolation test at that assembly point. |
| R9-17 | CB-F8, G-2 | §4 | The Explore/Operate/Work compositions are new names; only journeys J01–J06 exist. | Mark the compositions as proposed and map them to J01–J06 (REQ-VERIFY-005). |
| R9-18 | IR-F14 | L330–340 | Notes captured in Slice B are not durable until Slice C, yet J1 needs durability. | Either have Slice B persist notes through the R9-2 store, or label Slice B a fixture that does not count toward J1. |
| R9-19 | IR-F15, C7-13 | L256–284 vs L352–361 | There are two acceptance sets. | Use one v1 acceptance table: the seven addendum journeys plus the eval journey. |
| R9-20 | IR-F16 | L132, L340 | The crash-recovery test and revision semantics are undefined. | Name the kill point (SIGKILL mid-write), the restart, and the assertions. Define revisions: id, snapshot or diff, and restore creates a new revision. |
| R9-21 | IR-F17, ZO-7, C7-12 | L293, L362 | There is no paging default and no measurement task. | Slice A names a measurement script path. v1 default: fetch one day, no cursor, marked "assumption until measured". |
| R9-22 | IR-F18, ST-5 | L332, L350, L8 | "Expert judgment", "challenge anything", and "negotiable" license a redesign. | Split the text into fixed decisions (R9-2 to R9-11) and open items with owners. |
| R9-23 | IR-F19 | L366–377 | The §14 questions have no owners or deadlines. Q2, Q3, and Q7 block v1. | Map each to a Slice A exit gate with a decision-record path. Mark Q4–Q6 and Q9 as later. |
| R9-24 | IR-F20 | L313–328 | The §12 output has no path or format, and the `~/.agents` inspection is not assigned to any slice. | Name the output path and record format, and state whether the inspection gates v1. |
| R9-25 | IR-F21 | L361 | "Platform CI remain green" names no command or workflow. | Slice A records the exact commands and workflow files. |
| R9-26 | IR-F22, ST-1 | L398–400, L407 | Personal home paths appear in the spec, against L290 and L324. | Use repo-relative paths, and keep local paths in a private note. |
| R9-27 | ST-2, ST-3, ST-4, ST-5 | L301–389 | Qualifiers that cannot be measured (rich, deep, real, actual, simply, clearly) and an unprovable claim (L376 "feels like a useful notebook"). | Apply the style fixes as listed. L376 becomes "capture, find and revise a note without opening a chat or dashboard view". |
| R9-28 | G-7, G-8 (Elephant, from `capability_addendum_brief.md`) | §2, §4, §6 | The spec says nothing about capabilities or plugins. The Capability Architect must be reachable from Horizon. No ownership row covers the capability lifecycle. | Add a §2 row: capability/plugin lifecycle → Workbench (Plugins UI) and Cognate (bindings, kernel). Add a Horizon rule: the composer can open a Capability Architect conversation, Horizon has no second catalog, and capability availability is shown from the real lifecycle state. |

### 🟢 Nits

| ID | Sources | Fix |
|---|---|---|
| R9-29 | IR-F23 | Give each of Slices D–G one trigger line. |
| R9-30 | ST-7 | Change "tranche" to "slice" at L350. |
| R9-31 | ST-8, CT-18 | Define or replace donor, freeze (use "record"), native, V3, FDE, and graph elaboration at first use. |
| R9-32 | ST-10 | L389: "review-approved vertical slices". |
| R9-33 | CB-F12 | `building-with-cognate` exists only in the cognate repo's `.agents/skills`, and no `replicator` skill was found under `~/.agents`. State this at L63 and L322. |

### Rejected reviewer fix

- **ST-6** proposed "explicit approval from the operator for each action" at L324. **Rejected**, because it conflicts with the methodology addendum: routine work runs within its authority, and only consequential exceptions escalate. A better replacement for "the relevant permissions" is "permissions granted by SEA-Forge for the selected case".

## Traceability

| Raw | Consolidated |
|---|---|
| IR-F1, CB-F14 | R9-1 |
| IR-F2, IR-F3 | R9-4 |
| IR-F4, CB-F2, CB-F11 | R9-3 |
| IR-F5 | R9-5 |
| IR-F6, CB-F1 | R9-2 |
| IR-F7 … IR-F11 | R9-6 … R9-10 |
| IR-F12, IR-F13, CB-F9, CB-F10 | R9-11 |
| IR-F14 … IR-F22 | R9-18 … R9-26 |
| IR-F23 | R9-29 |
| CB-F3, CB-F13 | R9-12 |
| CB-F4 … CB-F8 | R9-13 … R9-17 |
| CB-F12 | R9-15, R9-33 |
| ST-1 | R9-4, R9-26 |
| ST-2 … ST-5 | R9-27 (ST-5 also R9-22) |
| ST-6 | rejected |
| ST-7 … ST-10 | R9-30, R9-31, R9-15, R9-32 |
