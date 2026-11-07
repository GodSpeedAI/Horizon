# Horizon: Operator Workspace, Daily Journal, and Governed Intelligence

**Status:** Design intent for independent interrogation, technical review, and implementation planning  
**Date:** 2026-11-06  
**Review path:** EGM interrogation and independent critique, using the operator's selected review model  
**Scope:** Horizon, Cognate Workbench, Cognate SDK, SEA-Forge, DomainForge, RealityTrace, GS Term, and the existing machine-wide agent environment  
**Visual reference:** The operator will supply the GS Term V3 prototype. Inspect it before finalizing the interaction design.  
**Interpretation rule:** This document states the intended product behavior and architectural invariants. Its proposed contracts and implementation order are design candidates, not claims that these interfaces already exist.

## 1. The product to build

Horizon is the **organization-aware working notebook and cognitive cockpit for a human operator**, especially a forward-deployed engineer (FDE). It is how a person understands a working environment, records thinking, revisits prior work, makes consequential decisions, and directs authorized intelligence and execution.

Horizon is primarily an **interface over other systems' information and capabilities**. It does not become a second agent harness, project-management engine, evidence ledger, semantic database, governance engine, or automation scheduler. It renders trustworthy, attributed views of the organizational world and offers typed, policy-checked actions into the systems that actually own those actions.

Its distinguishing experience is a **continuous daily working notebook**. The operator can write notes, ask a resident advisor questions, inspect cases and evidence, attach references, tag and organize material, and watch relevant work unfold as compact, interactive activity. Deep, sustained agent work is delegated to Cognate Workbench and continues when its window is closed, subject to a verified service-lifetime contract.

The operator should not need to remember where something was stored. Remembering *when* they worked on it, *what* it was about, or *which case or tag* it involved should be enough to recover the original material and its subsequent history.

### Primary jobs to be done

1. **Orient:** What world and case am I in? What changed, what is known, what is uncertain, and what requires my judgment?
2. **Capture:** Record a thought or decision immediately without choosing a form, folder, or ticket in advance.
3. **Recover:** Find work by date, content, tag, case, relation, actor, artifact, or the sequence of subsequent events.
4. **Understand:** Trace a claim back to its source, revision, observed event, verification and governing criteria.
5. **Decide:** See grounded alternatives, constraints, consequences, and available operations; accept or redirect outcomes within granted authority.
6. **Delegate:** Turn an authorized intention into bounded case work and send it to existing Cognate execution services.
7. **Supervise:** Follow background agents, inspect rich trajectories, respond to exceptions, and return to an unfinished case without losing context.
8. **Improve:** Use observations and measured results to refine procedures and context efficiency, without treating generated assertions as approved organizational knowledge.

## 2. Authority and system ownership

**The organization establishes the governed operating domain and policy through SEA-Forge. The human operator is the final case-outcome decision maker within the authority the organization has granted. Horizon is the interface through which the human exercises that judgment.**

A human decision does not bypass mandatory organizational policy. The distinction between the organization's delegation grant and the operator's case-outcome judgment must remain explicit.

| Concern | Source of authority / owner | Horizon's role |
| --- | --- | --- |
| Organizational domain and versioned semantic definitions | DomainForge model; organization-adopted versions through SEA-Forge | Render the pinned world, context, limitations and relations |
| Policy, mandates, permissions, case plans, sentries, legitimate transitions | SEA-Forge | Present eligibility, proposed actions, refusals, receipts and approvals |
| Final case outcome judgment | Authorized human operator in Horizon | Support the decision and record it through the owning governed command path |
| Specialist execution, tools, assignments, continuations, run history | Cognate SDK and Cognate Workbench | Prepare and reference assignments; show status and deep links |
| Execution evidence, provenance, ledger and observations | RealityTrace and other owning evidence systems | Inspect, correlate and cite; do not restate observations as settlement |
| Operator-authored notes, journal blocks, placement, tags and UI preferences | A small Horizon-specific capability implemented with existing Cognate durable facilities | Provide native authoring and retrieval, with proper provenance and access controls |
| Shared organizational knowledge publication | Organization-governed process | Propose promotion, distinguish personal draft from accepted knowledge |

Hard distinctions: **requested** is not **authorized**; **executed** is not **observed**; **observed** is not **verified**; **verified** is not **accepted**; **accepted** is not automatically **case closed**. Every status shown must have an attributable basis.

Horizon preserves its existing renderer-neutral typed intentions, world/checkpoint/focus references, seven affordance gates, operator-pinned focus, and case-authority boundaries. A new UI must not create a shortcut around them.

## 3. Reuse-first engineering directive

**Inventory and use what already exists before designing a replacement.** The burden of proof is on adding a new component, abstraction, state store, scheduler, dispatcher, graph, or rendering grammar.

Apply this decision order to every feature:

1. **Reuse unchanged** when the existing interface and observed behavior satisfy the journey.
2. **Compose** existing primitives, projections and capabilities when their combination satisfies the need.
3. **Extend the owning component** when a narrow, verifiable gap remains; keep the change in the component that owns the responsibility.
4. **Introduce a small new component** only after documenting the missing capability, alternatives, maintenance cost, compatibility impact and an acceptance test that existing parts cannot meet.
5. **Reject duplication**, including a second case ledger, execution session store, event bus, note graph of organizational truth, or independent governance mechanism.

Use the existing `building-with-cognate` skill and its companion interaction-domain-model and DomainForge skills. Model the intended journeys before binding them to capabilities. Locate any available `replicator` and `leanrea` skills in the **actual local environment**; use them as research methods, not application dependencies. Compare observable behavior rather than importing an external product's architecture, packages, labels, or branding. Independently implement only the missing behavior, with a license review before copying any third-party source.

**No runtime dependency on the external methodologies or prototypes used for review.** The independent critique discipline, context-learning behavior, and event-driven coordination patterns should be expressed using existing Cognate agents, capabilities, events, continuations, artifacts, policies, and projections. They must remain understandable and operable without installing the reference systems.

### Donor map

| Internal source to inspect | What to adopt when fit | What not to transplant |
| --- | --- | --- |
| Cognate Workbench | Canonical Cobalt design system; layout, sidebar/inspector, approval and task cards, disclosure, streaming, execution panels, accessibility, React components | An entire second harness, competing session store or independent task authority |
| Supplied GS Term V3 prototype | Composer interaction, compact activity grammar, animations, contextual action/inspection, readable command-like text | PTY or shell mechanics unless a real Horizon journey needs them |
| GS Term source | Proven shell/semantic separation, projection and inspector practices; existing interaction primitives | Runtime shell ownership or terminal-specific abstractions imposed on cases |
| Machine-wide `~/.agents` installation and agents-setup source | Hook adapters, context efficiency, session learning, passive observations, case correlation, resilient delivery, safety defaults | Machine-local paths as product APIs, global leakage of learned context, a second organizational control plane |
| Cognate SDK and Cognate Workbench | Durable runs, projections, artifacts, teams, human continuations, idempotency, service and restart primitives | Shadow persistence or UI-only fabricated execution state |
| SEA-Forge Casework and Go frontend | Case/plan item/event/authority contracts, typed decisions and operational projections | Replicated case semantics or authority in a React component |
| RealityTrace | Immutable observed evidence, correlation, questions, ledger, lineage, graph and read projections | Treating observations as operator decisions, or creating a new evidence store |

The operator's V3 prototype is a **required reference input**. Do not invent its appearance or claim to match it before inspecting the supplied artifact. Workbench's design contract remains the visual system; V3 determines the composer's expressive interaction within that system.

## 4. Primary interaction model

Horizon keeps the organizational world, case and operator intent visible, but makes **the daily working notebook the natural entry point** rather than a form-heavy administration screen.

### Application shell

- **Left rail:** Journal by date, recent/pinned work, cases, tagged collections, saved views and navigation to world exploration. Respect tenant and operator scope.
- **Center workspace:** A continuous, block-addressable daily notebook combining operator-authored text, resident-advisor dialogue, selected references, relevant activity and decision requests. It is *not* an undifferentiated chat transcript.
- **Composer:** An interactive, keyboard-friendly V3-derived writing-and-command surface. The operator may write a note, ask a question, link an item, request analysis, or propose a governed action; the system must make the current interpretation visible before consequential effects.
- **Right inspector:** Selected note, case, artifact, trace, relation, policy basis, approval or evidence, including exact source and history. Collapsible on smaller screens.
- **Orientation strip:** Active organization, world, checkpoint, case, historical/current/degraded state, relevant data freshness and pending operator decisions.

Preserve the Cognate Workbench Cobalt design language: cool paper and graphite registers, restrained cobalt accent, its typographic roles, hairline separation, consequential treatment only for decisions, consistent disclosure, accessible focus, quiet animation and meaningful empty states. Prefer sharing existing tokens and components over manually duplicating their values. Do not use third-party product names or borrowed terminology as Horizon navigation labels or canonical schema names.

### Composer semantics

The composer is not simply a chatbot prompt field. It operates on the selected context:

- **Capture:** Write one or more addressable notebook blocks, automatically associated with the chosen day and operator.
- **Ask:** Request an explanation, cross-reference or comparison; answer from authorized sources and expose citations.
- **Navigate:** Find a date, tag, case, object, evidence artifact or trajectory; keep historical scope visible.
- **Propose:** Describe a potential governed operation; present a typed preflight and operator choice before committing.
- **Delegate:** Request bounded specialist work only through authorized casework and Cognate Workbench interfaces.

Actions should appear as concise, readable cards or expandable rows embedded in the notebook activity, not as an endless form. A working indicator reflects real process state. Do not generate arbitrary executable UI markup. Bind generated presentation to Horizon's existing closed renderer grammar and typed action contracts; extend the grammar only through a separately reviewed change with security and compatibility proof.

The operator's focus is pinned. Background events may add a nonintrusive notice or update a projection but cannot reorder owner-authored blocks, steal focus, dismiss approvals or navigate away without explicit operator interaction.

## 5. The temporal notebook and organizing model

### Daily journal

The journal provides one discoverable view per `(organization, operator, local calendar day, recorded timezone convention)`. The exact identity scheme must be decided by the domain model; it must preserve stable references across timezone changes.

- Opening a day **reads** its available authored content and relevant activity. Merely viewing a date need not create a persistent empty page.
- The first authored entry creates the day entity and block(s) idempotently using existing Cognate facilities.
- Year/month/day navigation may be lazily generated as a hierarchy **of views**, not as a duplicate source of events.
- Events from SEA-Forge, Cognate Workbench and RealityTrace appear as attributed **references** or computed activity, never copied into editable notes as though Horizon authored them.
- A background task completed after the window closes can still appear under the correct event date, with occurrence time and ingestion time distinguished.
- The operator may create a retrospective entry for a past date; its authored timestamp, effective journal date and edit history remain distinct.
- Browsing a day with no entries reports whether no authorized activity exists, sources are unavailable, or the view is incomplete. No silent equation of absence with zero.

### Addressable blocks

A notebook entry is composed of addressable blocks (paragraphs, checklists, links, embedded projections, references to decisions, or artifact previews). A block can be referenced from a case or another entry without copying its content. Preserve authored ordering, indentation/outline where meaningful, stable identity and revision history.

### Multiple placements versus versions

Keep these **separate operations**:

- **Placement:** The same underlying note/block appears under a day, case, project collection or saved view. This creates a reference/relationship, not a new underlying note.
- **Revision:** An immutable historical version of author-editable content. Restoring an earlier version creates a new recorded change; it does not erase subsequent history.
- **Copy:** A genuinely distinct note with a new identity, explicit provenance and new independent revision history.
- **Link:** A typed relation to another object, not necessarily a parent-child placement.

A note may be seen in several contexts, but its access rules do not expand merely because a user adds a placement or tag. Deleting one placement must not accidentally erase the source note or immutable evidence.

### Tagging

Tagging is a first-class navigation dimension, complementary to dates, hierarchy, search and relations. Provide human-created and policy-approved organization tags, with explicit scope, creator, canonical identity, label, aliases/renames, optional hierarchy and revision/audit trail where consequential. Allow tags on notes, blocks and references to existing cases/artifacts only when the owning permission model permits them.

Tags are **classification and retrieval aids**, not authority grants, evidence, verified relationships, or substitutes for DomainForge types. A case tagged `approved` is not approved. A private tag must not expose a restricted item through global search, counts, autocomplete, graph edges or suggested results.

Preferred navigation combines **date + tag + case + source + actor + status**; search should preserve typed filters and return original source links. The operator must be able to traverse backlinks and a localized relationship map without manufacturing business facts from co-occurrence, shared tags or model speculation.

### Search and retrieval

Day-first retrieval is a hard product requirement. When asked, “What did I work on last Tuesday?” Horizon retrieves real, authorized, date-indexed entries and activity before asking the resident advisor to synthesize. Support approximate date ranges, full-text search, tags, case references, linked artifacts, task status, and actor filters. Summaries are a convenience; **the original records, timestamps, exact references and resulting changes are the product's evidence**.

## 6. Resident cognitive partner

Horizon has a **resident advisor** as the operator's ongoing cognitive companion. It understands the selected organizational domain, case, goals, constraints, open questions and accessible history. It can investigate, synthesize, propose options, explain eligibility and prepare work for delegation.

The advisor does **not** own case outcomes or authorization. It is not a parallel execution harness. Implement the role with existing Cognate constructs where feasible; do not invent a separate agent runtime or its own long-term truth store.

Distinguish three responsibilities:

1. **Resident advisor:** Maintains continuity of *operator intent* across days and authorized cases, retrieves relevant sources, and synthesizes recommendations.
2. **Execution coordinator:** Operates within Cognate Workbench to break a bounded assignment into eligible specialist tasks, monitor progress and return results. Does not grant itself permissions or settle the case.
3. **Independent reviewer:** Receives the approved review target, rubric and allowed evidence with deliberately isolated context. It should not inherit the resident advisor's conclusions or unreviewed learned memories.

Specialists may produce code, analysis, documents or verification evidence. A specialist's reported success is never enough by itself to close the parent case.

### Context economy and learning

Reproduce useful behavior through Cognate's existing context assembly, capabilities, event hooks and durable state rather than depending on an external context optimizer:

- Assemble task-specific context from allowed semantic references, artifacts and verified environment facts.
- Maintain explicit tenant, organizational, case, team, role and trust scopes on stored/retrieved lessons.
- Prefer small deterministic environmental facts to speculative model-generated memories where those facts suffice.
- Measure actual input/output/cache token use when provided; unknown usage remains unknown.
- Separate learning capture from subsequent injection, so each role and policy can forbid inherited context.
- Never promote a machine-inferred lesson into accepted organizational policy or domain truth automatically.
- Keep personal/other-client content out of shared caches, logs and independent review sessions.
- Optimize for cost and effort per independently accepted outcome, not token minimization at the expense of correctness.

## 7. Governed case-to-execution coordination

A case consists of plans, plan items (including ticket-like work items), milestones, human tasks, events, decision checkpoints and referenced artifacts. SEA-Forge owns what those mean and which transitions are eligible. Avoid a second ticket database in Horizon or the coordinator.

### Proposed interaction

1. The operator describes a desired result in Horizon.
2. The resident advisor examines world/domain references, the current case, constraints and available moves.
3. The operator selects an appropriate governed action or delegation.
4. SEA-Forge checks scope, case state, mandate, policy revision, dependencies, evidence prerequisites, budget and actor authority.
5. An eligible plan item is bound to a durable Cognate Workbench assignment. The assignment names the task, work scope, acceptance criteria, permitted resources, source artifacts, time/budget envelope and correlation identifiers; it is **not** a forwarded transcript.
6. The Workbench coordinator routes to suitable specialists, with explicit limits and reviews. The Workbench service remains independent of its desktop window.
7. Runtime events, artifacts, observations and verification results are durably recorded in their owning systems and cross-referenced into the case.
8. Horizon renders progress and requests human attention only when a consequential question or exception arises.
9. The operator accepts, redirects or rejects the case outcome in Horizon, through SEA-Forge's governed command path.

### Event-driven follow-up

Use existing event streams, plan sentries, outboxes and Cognate continuations where they meet the need. A typed event (for example an artifact revision, verification result, human approval, timer, external change, or assignment completion) may enable a case operation. The event itself does not silently authorize execution.

Required properties: explicit source event identity; typed event and subject; declared predicates; source authorization; idempotent admission; bounded retries; replay and crash recovery; no duplicate assignments after redelivery; explicit refusal and uncertainty; and ability to interrupt, redirect or withdraw delegated work according to policy. Do not use the surface's local UI state as a dispatcher.

### Assignment lineage

The system must carry native identities across boundaries without guessing or minting fake replacements:

`organization → world/policy revision → case → plan item → assignment → run/session → step/event → observation/evidence → artifact/review → human decision`

An edge may be `unbound` or `unknown` until supported. Do not retroactively attribute old sessions to cases by matching timestamps or directory names. Allow documented manual reconciliation without rewriting historical source records. Respect the owning system's native IDs and establish typed cross-references rather than a single mutable all-purpose identifier.

## 8. Rich trajectories and RealityTrace

**This is a required product capability, not an optional debug view.** The human should be able to inspect how important agent work unfolded, why it took a path, what it actually did, what was observed, and what the available evidence supports. Detailed trajectories belong primarily in **Cognate Workbench**, while Horizon presents summaries and deep links into the same referenced evidence.

### Verified starting point and gap

The present Workbench source already has a durable `session-trace` projection, recording session turns, model invocations, tool calls, result/error information and event timestamps. It also has an independent RealityTrace observation outbox, delivery state and read capabilities. Tests exist for trace projection persistence and RealityTrace integration. **Do not describe the entire trajectory subsystem as missing or rebuild the trace from scratch.**

The gap to verify on the target revision is whether Workbench's actual trajectory interface exposes **the rich RealityTrace evidence, run and case correlations, observed-vs-declared graph, checks, lineage, and reliability/receipt states** that an operator needs. The current separate facilities do not by themselves prove that complete user journey.

### Target trajectory view

The trajectory inspector should correlate, subject to access permissions:

- Original task and approved assignment scope, case/plan item and operator intent.
- Run, session, attempt and specialist identities, including parent-child delegation.
- Ordered model requests/responses, tools, duration, status, explicit errors and retries where recorded.
- Execution operations versus externally observed effects; evidence provenance and confidence.
- RealityTrace ledger/observation references, hashes, ingest status, verification results, declared questions, unmet/undefined checks, and trace/graph links where present.
- Produced artifacts, versions, diffs and the exact evidence used for a review or outcome.
- Actual known usage/cost with model/provider and uncertainty; context-injection/learning events only to the extent permitted and recorded.
- Gaps, delayed ingestion, out-of-order external observations, conflicts, orphan/unbound events, and missing receipts as honest states.
- Relevant case decisions before, during and after execution, without conflating governance, execution, observation, review and acceptance.

Offer a readable **chronological overview** with expand-on-demand steps, plus **relationship/lineage** inspection and links back to the case and date of work. Provide targeted filters by task, agent, operation, exception, evidence, artifact and date. Do not flood Horizon's notebook with raw debugging payloads; a compact trajectory reference or finding should open Workbench at the exact position.

### Correlation and read-side design

Prefer composing Cognate's durable native trace with RealityTrace observations through a **read-side join or adapter** that preserves both native event identities. Do not copy large traces into the journal, reinterpret RealityTrace's ledger as Cognate's run log, or claim cross-store atomicity. A combined view may contain partial information with source-specific freshness and watermarks.

The implementation must choose and document one stable join strategy, observability contract, access-control evaluation, pagination and cursor behavior, redaction policy, and recovery semantics. Payload contents, prompts, secrets, private paths and protected customer data must not be exposed merely because a trace exists. Preserve the passive, queued, at-least-once delivery properties already present.

## 9. Horizon is a projection and interaction surface

Use a source-to-surface contract:

- **Source identity:** owner, native object reference, version/checkpoint and timestamp.
- **Provenance:** direct, inferred, derived, reported, or unavailable, with suitable supporting references.
- **Scope:** tenant/organization/case/operator and policy grant at read time.
- **Freshness:** source watermark, occurrence versus observation versus ingestion time, historical/current/degraded.
- **Allowed interactions:** typed actions with preflight, required decision identity and explicit response/receipt.
- **Projection:** deterministic, rebuildable or refreshable presentation; no invented semantics or local policy fork.

The journal's native user-authored content is a small exception: it needs a durable write path. Use Cognate's event/capability/artifact mechanisms and existing notes-compatible constructs if found. Do not create a bespoke database merely because the UI resembles a notebook.

For organizational entities, tags and journal placements should be **links or read-side indexes**, not mutations to an owning Case or Evidence record. Any consequential publication, classification or revision that requires organizational authority must go through the actual governing service.

## 10. Operating cases that must work

### J1. Capture without form friction
An FDE opens the day, types a thought into the composer, receives a durable addressable note block, tags it `claims-intake`, and continues working. Restarting the app retains authorship, order, date, tag and revision history.

### J2. Return by day
A week later, the FDE remembers working on an exception analysis last Tuesday. Searching the day returns authored notes, relevant authorized case actions, assignments, artifacts and observed events. Choosing an artifact opens its exact provenance; choosing an assignment opens Workbench's trajectory. A delayed event is shown with truthful occurrence and ingestion times.

### J3. One identity in multiple contexts
A design block appears on its original journal day, a case and a knowledge collection. Editing the block updates its current representation in every placement while preserving revisions. Removing it from the collection does not delete the original; sharing the case does not broaden access to a private note.

### J4. Ask, decide, delegate
The FDE asks the resident advisor why a process failed. The advisor cites organizational observations and shows options. The FDE approves one governed investigation. SEA-Forge authorizes an eligible case work item; Cognate Workbench receives a bounded assignment; Horizon shows status without starting a competing job runner.

### J5. Deep execution with window closed
The Workbench desktop window closes while authorized specialist work continues in the verified background service. Horizon can be opened later and reconstruct assignment state. The same work is not dispatched twice after a crash or event redelivery. If service availability is not yet installed, the UI states that limitation accurately.

### J6. Inspect the rich trajectory
A specialist runs multiple tool operations, produces an artifact and encounters a failed check. The Workbench trajectory shows native execution steps plus separately attributed RealityTrace observations, proof/verification results, missing information and artifacts. Horizon links to the exact trace/step rather than copying the whole run.

### J7. Independence and learned context
A review specialist is launched with the approved artifact and rubric but without the advisor's accumulated conclusions or unauthorized shared lessons. The test proves isolation at actual context assembly, not only in prompt wording.

### J8. Event-driven continuation
An approved artifact revision or verification event satisfies a governed plan predicate. Exactly one eligible continuation is admitted, with correct correlation and policy evaluation. A duplicate, stale or malformed event cannot silently create another task or change authority.

### J9. Organization boundary
Two organizations each have journal entries, tags, cases and run evidence with similar names. Search, autocomplete, relationship maps, context injection, tags and trajectory links never reveal unauthorized records or even restricted counts.

### J10. Human outcome authority
All implementation tasks and verification gates pass. The case is shown as **ready for operator decision**, not automatically accepted. The operator reviews evidence and explicitly accepts, rejects or redirects; the governed receipt records who decided under which authority and policy revision.

## 11. Quality and compatibility requirements

- **Evidence-first:** Every consequential claim links to a source record; unknown is not false and absent data is not zero.
- **Durable:** Notes, assignments, action intents, replay cursors and trace joins survive process restart and interrupted delivery.
- **Cross-platform:** Do not hardcode personal paths, Linux-only assumptions or bundling constraints. Preserve support for desktop platforms and Linux ARM64 where applicable. Determine what requires per-platform GitHub Actions tests and what can only be verified on actual hardware.
- **Accessible:** Keyboard-first, screen-reader semantics, reduced motion, honest empty and disabled states, responsive inspection without lost operator focus.
- **Privacy:** Scope and redact before indexing or rendering; do not ingest the operator's entire local session archive into a product tenant without explicit consent and review.
- **Efficient:** Cursor-based incremental reads; lazy deep trace loading; bounded projections; recoverable cursors; avoid loading complete historical ledgers on each UI interaction.
- **Rebuildable:** Presentation projections and search indexes can be reconstructed without mutating canonical evidence or case history.
- **Upgradeable:** Prefer native API contracts over parsing private files, importing internal modules from another app, or pinning accidental implementation details.
- **No false affordances:** No decorative approvals, fictitious model costs, fake evidence, inert action controls, or optimistic claims of runtime capability.
- **License safety:** Independently apply studied interaction behavior. Do not copy external third-party code without explicit license compatibility review.

## 12. Required implementation reconnaissance

**Before prescribing a design or changing code**, the implementing agent must read and verify the *current local workspace*, not assume the connected repositories' default branch is identical. Produce a concise reuse/gap inventory with evidence from actual files, tests and live behavior.

### Repositories and contracts

1. Horizon: normative specification, current world/navigation models, typed intents, `horizon.surface/2` grammar, `src/ui/workspace/model.ts`, current source health, Casework adapter, authoring and identity hooks.
2. Cognate Workbench: `DESIGN.md`, `src/ui/app.css`, `src/ui/workbench/UX.md`, existing React components, `src/projections/sessionTrace.ts`, `src/observations.ts`, `docs/subsystems/observations-realitytrace.md`, team/assignment and service lifecycle interfaces, current Tauri/native packaging state.
3. Cognate SDK: `building-with-cognate` skill, runtime and event APIs, projections, artifacts, ownership/tenancy, continuations, outbox, concurrency, recovery and UI integration.
4. SEA-Forge: Case/CasePlan/PlanItem/AgentTask/sentry definitions, case events, Go Casework frontend and decision/approval routes, organizational domain/policy binding.
5. RealityTrace: current event-ingest, ledger, queries, observed/declared graphs, source references, trace/link APIs, projection rebuild, evidence and receipt contracts.
6. GS Term: actual source and supplied V3 artifact, including composer behavior, activity representation, focus, animation and inspector patterns.
7. Existing tests, GitHub Actions, release targets, and unresolved issue/technical-debt documents. Preserve settled contracts; do not infer a missing feature from filenames alone.

### Local agent environment: mandatory read-only inspection

Inspect the actual `~/.agents` directory, especially:

- `~/.agents/AGENTS.md`, `manifest.json`, `tooling/`, `skills/`, `bin/`, and installed skill locations.
- `~/.agents/tooling/te-integration/`, including its version pin, patches, scripts, tests and documentation.
- `~/.agents/tokeneconomizer/` **if present**, including what capabilities are native, patched, invoked or disabled.
- `~/.agents/state/`, especially context-learning and RealityTrace state, case bindings, enrollment, queues, cursors, learning/savings evidence and historical drift information.
- `~/.agents/lib/te-rt/`, existing hook configurations and actual native CLI coverage, if present.
- Discover `replicator` and `leanrea` skills locally and read their real instructions. Do not assert the `replicator` skill is absent simply because it is not in the pushed source.

**Security:** Treat local state as private and potentially secret-bearing. Inventory filenames, schemas, versions and sanitized counts first. Do not dump session prompts, learned memories, credentials, raw customer data, entire transcripts or machine-specific private paths into a review document, commit, agent prompt, issue or model context. Do not rewrite this directory, install plugins, approve hooks, consume paid APIs, backfill data or run migrations as part of discovery without the relevant permissions and explicit mandate. Record which artifacts were inspected and which were deliberately withheld/redacted.

### Research output expected

Record a table of each desired capability with: existing owner, exact symbol/file/API, observed behavior, test/evidence, existing gap, proposed reuse or extension, and whether a new component is justified. Explicitly reconcile the actual Rich Trajectory screen against the independent `session-trace` and RealityTrace read capabilities.

## 13. Implementation approach and proof

The implementing agent should use expert judgment to refine this proposal after independent EGM review. Do not mechanically implement every suggested name, screen or interface here. Preserve the non-negotiable outcomes, ownership and authority invariants; challenge anything else that creates redundancy or compromises product fit.

Recommended dependency-ordered vertical slices:

**Slice A: Reuse and contract proof.** Verify native capabilities and current UX. Freeze observed donor behavior from the provided V3 artifact; audit Workbench trajectory and Horizon surfaces. Write interaction-domain model, ownership matrix and critical journey tests.

**Slice B: Unified design shell and composer.** Compose Workbench's design tokens/primitives with Horizon's existing renderer/typed-intent model. Prove note capture, context preservation, inspectable actions and keyboard behavior. No backend reinvention.

**Slice C: Minimal day journal.** Durable operator-authored blocks, stable day identity, day-by-day retrieval, tags, note revisions and source-attributed activity projection. Prove crash recovery and unauthorized-access denial before graph elaboration.

**Slice D: Cross-context organization.** Multiple placements, backlinks, relations, tagged filtering, authorized search, history and local relationship map. Prove one identity and permission invariants.

**Slice E: Deep execution handoff.** Resident advisor → governed case work → Cognate Workbench assignment → durable background run → Horizon status/decision. Prove replay, redelivery, failed authorization and operator outcome control.

**Slice F: Rich trajectory.** Extend existing Workbench trajectory read UI to join RealityTrace observations and evidence, with exact step links, unknown/error states, access enforcement and case/journal navigation.

**Slice G: Context efficiency and independent review.** Implement role-scoped learned environmental facts and context isolation with native Cognate facilities; validate real context assembly and measured usage without an external runtime dependency.

Sequence is negotiable on demonstrated dependency and risk. Every tranche must contain a real user journey and its negative/recovery tests. A read-only demonstration with fabricated values is not a completed tranche.

### Minimum evidence to claim success

- The FDE can capture a block without a form, reload, find it by date/tag and inspect its revisions.
- One note is accessible from two authorized contexts without duplicate identity or accidental authority expansion.
- A real authorized case assignment is dispatched and survives a window close/restart without duplicate execution; the human still decides the final case outcome.
- Workbench exposes real, enriched trajectory information with RealityTrace receipts and explicit gaps, not merely the existing native tool-call log.
- Horizon displays trace findings and navigates to the exact Workbench trajectory without becoming the trace store.
- An independent review receives no forbidden inherited context, demonstrated by a negative isolation test.
- Source permissions hold across organization boundaries, including search, tags, graph links and model context.
- Existing tests and platform CI remain green; any skipped or untested required platform is reported as a gap.
- Measurements of latency, event ingestion lag, context efficiency, trace retrieval and restart behavior are based on observed runs and clearly identify the environment.

## 14. Review questions for the EGM process

The reviewer should interrogate the intent before finalizing architecture. Focus on these product questions rather than asking the operator to design low-level code:

1. When should the center show an editable notebook, a governed decision, an activity stream or an entity inspection? What transition best matches the FDE's work?
2. What is the smallest journal identity and indexing model that makes date recovery reliable without a parallel knowledge database?
3. Which existing Workbench components can be shared safely rather than copied? What API or package boundary preserves independent releases?
4. What exactly is missing between native session traces and rich RealityTrace-backed trajectories, and which component should own the join?
5. How should operator focus, case authority, external event routing and cross-client work survive restarts without competing controllers?
6. Which learned facts may cross runs, reviewers, cases and organizations, and what tests establish that isolation?
7. Which tags and relationships are user organization versus organizational semantic claims? How can the UI prevent conflation?
8. Which capabilities could be removed from this design because existing code already provides them?
9. What is the thinnest end-to-end demonstration that proves the product feels like a useful working notebook rather than a renamed chat or dashboard?
10. Which assumptions in this document conflict with current source or the supplied V3 artifact, and what evidence supports changing them?

### Expected reviewer/implementer deliverables

- Reconciled **product brief** preserving the intended operator experience and user jobs.
- Current **reuse/gap inventory** with explicit observed-versus-proposed status.
- **Interaction domain model** and canonical journeys with failure/recovery cases.
- **Component/authority architecture** and precise source-of-truth map.
- **UX specification** grounded in the supplied V3 artifact and the existing Workbench design system.
- **Trajectory integration design** grounded in current Cognate and RealityTrace code.
- **Security, scope, licensing and native-platform impact** analysis.
- Revised **vertical-slice implementation plan** with acceptance tests, checkpoints and rollback.
- Then implement only the approved/review-settled vertical slices under existing repository development rules, recording commands, evidence and remaining gaps. Do not substitute screenshots, mock data or prose claims for real end-to-end proof.

## 15. Source pointers for reconnaissance

These are repository-owned starting points, **not fixed API contracts**. Re-evaluate the current local tree and revisions before implementation:

- `https://github.com/GodSpeedAI/Horizon`
- `https://github.com/GodSpeedAI/Cognate-Workbench`
- `https://github.com/GodSpeedAI/Cognate`
- `https://github.com/GodSpeedAI/SEA-Forge`(locally ~/projects/sea-rs/)
- `https://github.com/GodSpeedAI/RealityTrace` (locally ~/projects/sxr/)
- `https://github.com/GodSpeedAI/gs-term` (locally ~/projects/gs-term/)
- `https://github.com/SPRIME01/agents-setup`(locally ~/.agents/)
- Cognate Workbench design: `DESIGN.md`, `src/ui/app.css`, `src/ui/workbench/UX.md`
- Cognate native trace: `src/projections/sessionTrace.ts`, `test/J-T-trajectory.test.ts`
- Cognate RealityTrace seam: `docs/subsystems/observations-realitytrace.md`, `src/observations.ts`
- Horizon authority/rendering: `src/ui/workspace/model.ts`, `src/ui/surface2/`
- Existing machine-wide agent integration: `tooling/te-integration/README.md`, `tooling/te-integration/rt/`, `skills/leanrea/SKILL.md`
- Composer/conversation panel mockup: /home/sprime01/projects/Horizon/.agents/specs/Horizon_Operator_Workspace_Design_v1.md (but use cognate workbench design style)

---

**Governing product sentence:** Horizon helps the operator understand, organize, recover, direct and judge work in the organization's governed world. It renders existing truth, authors only the operator's own workspace content, delegates deep execution to Cognate, and makes evidence and human authority legible without duplicating the systems that own them.
