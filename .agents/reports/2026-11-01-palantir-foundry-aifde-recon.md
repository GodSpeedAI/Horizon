# Recon map: Palantir Foundry + AI FDE (web platform)

**Slice (confirmed by operator, 2026-11-01):** *The Ontology system — the data, logic, action and security of the enterprise encoded so decisions can be automated across business operations — plus the agent that builds it.*

For: a clean-room study of a comparable product surface for Horizon's observer-navigation and governed-execution model.
Date: 2026-11-01 (pass 1) · 2026-11-01 (pass 2, deeper: official recordings + product screenshots) · 2026-11-01 (pass 3: the ontology-half screenshots — type wizard, action authoring, submission criteria, object view hub)
Method: `replica-recon` Applied, three times. Public documentation, public marketing, public conference recordings, public product screenshots. No Palantir account, no login, no bundle reading, no endpoint probing, no crawler.

Source-path note: the skill's default output is `replica/recon.md` + `replica/features.csv`. Per operator instruction both live in `.agents/reports/`. Companion matrix: `2026-11-01-palantir-foundry-aifde-features.csv`. All 56 reference screenshots are staged in `.tmp/palintar-screens/` with an `INDEX.md` mapping each file to its screen ID and public source URL; `.tmp/` is gitignored, so they **cannot be committed** (the skill's `replica/screens/` rule: reference only, never shipped).

---

## 0. What this product is, in one paragraph

Foundry is an enterprise data-operations platform whose centre is the **Ontology** — not a semantic layer but a system that encodes four things at once: **data** (objects, properties, links), **logic** (business rules, ML models, LLM functions, optimizers), **action** (typed, parameterised, guarded transactions that write back to real systems), and **security** (roles, markings, purpose — reconciled per interaction). Palantir's own framing: the Ontology represents *"the complex, interconnected decisions of an enterprise, not simply the data."* Above it sit applications (Workshop, OSDK React, Slate, analytics) and the AI platform AIP. **AI FDE** is an agent inside that platform: a conversational surface that turns a request into platform operations — writing transforms, building ontology types, authoring logic functions, writing eval suites, editing Workshop apps, creating automations — through native tool calls, under the requesting user's own identity and permissions, landing changes on a branch for review.

The name is the tell. *Forward Deployed Engineer* is Palantir's human delivery model: engineers embedded in the customer's environment building beside the users. DevCon 5 billed AI FDE as *"Forward deployed engineering is no longer limited to humans."* The thing to replicate is therefore not a chat UI. It is **an agent that operates a decision-encoding platform, with that platform's own branch, review, permission and audit machinery as its guardrail, and with the ontology itself as the agent's memory of what went wrong.**

## 1. Sources

Pass 1 (documentation and marketing):

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | docs — AI FDE section (7 pages) | https://www.palantir.com/docs/foundry/ai-fde/overview/ | overview, navigation, modes-and-capabilities, aip-skills, security-and-governance, best-practices, prefill-sessions |
| 2 | docs — Foundry platform summary for LLMs | https://www.palantir.com/docs/foundry/getting-started/foundry-platform-summary-llm/ | a public page written *for* agents; terminology, architecture, app inventory |
| 3 | docs — Ontology building | https://www.palantir.com/docs/foundry/ontology/overview/ | semantic/kinetic split |
| 4 | docs — Use case development | https://www.palantir.com/docs/foundry/app-building/overview/ | Workshop / OSDK React / Pilot / Slate / Code Workspaces |
| 5 | docs — Workshop | https://www.palantir.com/docs/foundry/workshop/overview/ | builder principles and patterns |
| 6 | docs — AIP features | https://www.palantir.com/docs/foundry/aip/aip-features/ | AIP application reference |
| 7 | docs — Agent Stack | https://www.palantir.com/docs/foundry/aip/agent-stack/ | sessions, typed context items, events, state transitions |
| 8 | docs — Global Branching | https://www.palantir.com/docs/foundry/global-branching/overview/ | proposal/merge model |
| 9 | docs — Orientation and navigation | https://www.palantir.com/docs/foundry/getting-started/orientation-and-nav/ | platform shell |
| 10 | docs — Application reference | https://www.palantir.com/docs/foundry/getting-started/application-reference/ | app list by capability area |
| 11 | docs — Architecture center | https://www.palantir.com/docs/foundry/architecture-center/overview/ | three-platform model |
| 12 | docs — Security overview | https://www.palantir.com/docs/foundry/security/overview/ | projects, organizations, roles, markings |
| 13 | marketing — Foundry | https://www.palantir.com/platforms/foundry/ | positioning only; JS-rendered |
| 14 | API reference index | https://www.palantir.com/docs/foundry/api-reference/ | REST + SDK matrix |
| 15 | pricing page | https://www.palantir.com/pricing/ | **absent** — redirects to `/404` |
| 16 | release notes | https://www.palantir.com/docs/foundry/announcements/release-notes/ | client-rendered; not read |

Pass 2 (deepening, per operator):

| # | source | URL | notes |
| --- | --- | --- | --- |
| 17 | docs — **The Ontology system** | https://www.palantir.com/docs/foundry/architecture-center/ontology-system/ | the slice, in Palantir's own architecture language: four-fold integration, Language/Engine/Toolchain, security reconciled at time of interaction |
| 18 | docs — Integrated platforms | https://www.palantir.com/docs/foundry/architecture-center/platforms/ | nine capability sets; unified security spheres; "pursuing alpha" |
| 19 | docs — **AIP architecture** | https://www.palantir.com/docs/foundry/architecture-center/aip-architecture/ | 12 capability categories; enterprise-automation stance on AI FDE |
| 20 | docs — Multimodal Data Plane | https://www.palantir.com/docs/foundry/architecture-center/multimodal-data-plane/ | Iceberg, compute runtimes, south/north of the ontology |
| 21 | docs — Rubix substrate | https://www.palantir.com/docs/foundry/architecture-center/rubix/ | zero-trust infrastructure, node cycling |
| 22 | docs — Object types | https://www.palantir.com/docs/foundry/object-link-types/object-types-overview/ | objects may exist with **no backing datasource** if created by actions |
| 23 | docs — Link types | https://www.palantir.com/docs/foundry/object-link-types/link-types-overview/ | two-sided by default; no implicit reverse; M:N links are datasource-backed |
| 24 | docs — Action types | https://www.palantir.com/docs/foundry/action-types/overview/ | parameters, rules, side effects, submission criteria; **writeback dataset** |
| 25 | docs — Interfaces | https://www.palantir.com/docs/foundry/interfaces/interface-overview/ | polymorphic types + honest support matrix |
| 26 | docs — Functions | https://www.palantir.com/docs/foundry/functions/overview/ | server-side isolated logic, south and north of the ontology |
| 27 | docs — Agent Manager (page imagery) | https://www.palantir.com/docs/foundry/agent-manager/overview/ | agent page + session list |
| 28 | **DevCon 5** | https://www.palantir.com/devcon5/ | conference page; AI FDE and Orchestrator sessions |
| 29 | **"Product Launch: AI FDE" — DevCon 5** | https://www.youtube.com/watch?v=pyudERNI1Qo | official recording, 16 min. **The single best source for the real loop** |
| 30 | **"Palantir Ontology Overview"** | https://www.youtube.com/watch?v=YDAxITCNcko | official, 5 min. Decision-centric framing: data = state, logic = how to think, actions = affect the world |
| 31 | **"Getting Started with AI FDE"** — Ontologize | https://www.youtube.com/watch?v=Ta19YD794RY | third-party practitioner, 17 min. Tool count, thinking levels, branch defaults, merge flow |
| 32 | "How an FDE Uses AI FDE" — Ontologize | https://www.youtube.com/watch?v=_Zr2wjbenyU | listed, transcript unavailable on this pass |
| 33 | "Data Migrations with AI FDE" — Palantir | https://www.youtube.com/watch?v=e90qUUh8_us | listed, transcript unavailable on this pass |
| 34 | **product screenshots** (11) | `/docs/resources/foundry/ai-fde/*.png`, `…/workshop/object-apps-workshop-module.png`, `…/agent-manager/*.png` | observed UI, not described UI. Where this report says [O], it came from here |
| 35 | docs — Purpose-based access controls | https://www.palantir.com/purpose-based-access-controls/ | located via search; the third security axis |
| 36 | blog — Securing agents in production | https://blog.palantir.com/securing-agents-in-production-agentic-runtime-1-5191a0715240 | located via search; agentic runtime security |
| 37 | community — Agentic workflows Q&A | https://community.palantir.com/t/agentic-workflows-in-foundry-questions-answered/6973 | located via search; not read |

Persistent gaps, stated once: **no public price list** (Palantir sells enterprise contracts; the gating signal had to be read off admin switches), **release notes are client-rendered** and were not worked around, and **no live account** means no true empty/error/permission-denied capture.

## 2. Core loop

**Data → Logic → Action → Security**, encoded once as an ontology, consumed by both human-facing apps and agents, with decisions automated incrementally and every change reviewed on a branch.

Stated as Palantir states it (Ontology Overview, 2025): *"the data represents what the current state of my business is, the logic [is] about how do I think about those things, and the actions I can take to affect the real world."* The agent's job is to shorten the distance between a manual process and an automated one — and, per the DevCon 5 launch, to *keep* shortening it as operators reject its proposals.

The paid loop: integrate → model → build → operate → govern, and now **"ask the agent to do the middle three, then feed the failures back into the ontology."**

## 3. Evidence calibration (read before trusting any row)

- **[O] observed** — seen in a public product screenshot or official recording. Highest available grade here; still not my own account.
- **[D] documented** — a public doc page states it.
- **[I] inferred** — composed from several statements; layout or behaviour is a guess.
- **[?] unknown** — public sources are silent. Left as a hole rather than filled in.

Pass 2 upgraded the AI FDE surface from mostly [I] to mostly [O], and corrected two pass-1 inferences (§14).
Pass 3 did the same for the ontology half — the type wizard, action authoring and submission criteria are now
[O] rather than [D], and reversed six further inferences, including that security is authored *with* the type
rather than configured afterwards. Screen *states* remain the weak spot: docs and screenshots show the
populated happy path, plus exactly one blocked-action state; empty, loading and denied states are unobserved.

## 4. Screens

IDs are stable and referenced by §5–§7.

### 4.1 Platform shell

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Workspace shell | default after login | home base | left sidebar (Home, Search, Notifications, What's New, Recent, Files, Applications), favourites, footer (AIP Assist, Support, Account, Other workspaces) [D] | collapsed/expanded; empty favourites on first use [D] |
| S02 | Home / landing | sidebar → Home | orient, jump into work | default page; org-custom pages; announcements [D] | default, customised, bespoke [D] |
| S03 | Quicksearch | ⌘J | find and jump | jump-to mode; full-results mode with filters and rank [D] | empty, results, no results [?] |
| S04 | Notifications | sidebar | platform notices, inline answers | newest-first, type grouping, per-type settings, unread badge, toast [D] | unread, read, answerable [D] |
| S05 | What's New | sidebar | in-platform release notes | announcement list [D] | — |
| S06 | Files / Compass | sidebar → Files | project filesystem = security boundary | Portfolios, Projects, Your files, Shared with you, star, permissions [D] | root, nested, shared, empty [?] |
| S07 | Applications portal | sidebar | discover apps | grid, suggested, star to promote [D] | suggested, promoted [D] |
| S08 | Account & settings | sidebar | identity, groups, prefs | user id, groups, settings, language, profile hover-card [D] | — |
| S09 | Support | sidebar | help routes | Ask AIP Assist, Training, Examples, docs, Report issue, tickets, updates, status, About [D] | — |
| S10 | Control Panel | Other workspaces | admin | AIP enablement, AIP settings, LLM capacity, markings, users/groups [D] | hidden without permission [D] |
| S11 | Carbon workspace | Other workspaces | curated experience | composition of apps + actions + analyses [D] | — |

### 4.2 Data and ontology build

| ID | screen | route | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S12 | Data Connection | app | connect sources, define syncs | source cards, sync config, agent/egress policy, listeners (HTTPS/WebSocket/Email) [D] | connected, failing [?], none [?] |
| S13 | Pipeline Builder | app | point-and-click pipelines | canvas: inputs → transform → preview → deliver → outputs; node palette; health checks; Use LLM node with row trials; embeddings expression; Assist (Explain, Regex Helper, Transform Assist) [D] | draft, previewed, delivered, build failed [?] |
| S14 | Code Repositories | app | web IDE for transforms/functions | file tree, editor, branches, PR + review, **CI/CD check list**, build output [D][O] | clean, checks running, checks failed, PR open, merged [D][O] |
| S15 | Code Workspaces | app | notebooks + Streamlit/Dash/Shiny | notebook, Jupyter/RStudio, publish-as-app [D] | — |
| S16 | **Ontology Manager — create-type wizard** | app → New → Object type | author a type in six steps | stepper `1 Datasource · 2 Metadata · 3 Properties · 4 Actions · 5 Save location · 6 Security`; step 1 offers *Use existing datasource* vs *Continue without datasource — generate a dataset for permissions purposes*; step 4 auto-generates `Create / Modify / Delete <Type>` action types with a per-action property set and **Choose who can submit this action type → Organization \| Group \| User**; step 6 is a policy table `Policy name \| Type \| Applies to \| Actions` defaulting to *Object security policy · All properties* [O] | mid-wizard, no-datasource path, default policy applied [O]; schema error [?] |
| S17 | Object Explorer | app | discover and bulk-act | keyword + property search, results, bulk actions, export [D] | results, none [?] |
| S18 | Object View | from explorer/app | single-object detail, reusable | property panel, links, actions, embedded charts [D][O] | — |
| S19 | Workflow Lineage | app | understand/manage a workflow | provenance graph, widget/variable provenance, upgrade tooling, 7-day history, traces, log search [D] | graph, filtered by status/user/duration/version [D] |
| S20 | Data Health | app | monitor at scale | monitoring views, health checks, alert routes (email/PagerDuty/Slack) [D] | healthy, degraded, alerting [?] |
| S21 | Model Catalog | app | browse/deprecate models | model list, deprecation notices [D] | — |

### 4.3 Application building

| ID | screen | route | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S22 | Workshop editor | app → module | author an operational app | widget tree + canvas; 60+ widgets; Variables panel (typed: object sets, filters, primitives, arrays, structs, geopoints, geoshapes, time series); Events panel; Layouts (columns, rows, tabs, flow, toolbar, loop); pages; overlays (drawer, modal); collapsible sections [D] | draft, unsaved, published [?] |
| S23 | Workshop runtime | published module URL | operator app | see §7.2 for the observed anatomy [O] | populated [O], **action blocked by submission criteria — disabled button + `Invalid state to apply action` tooltip on a `Status: Closed` ticket** [O], filtered-to-zero [I], action submitted [I] |
| S24 | Slate editor | app | drag-drop app with raw HTML/CSS/JS | canvas, custom code, public-app support [D] | — |
| S25 | Developer Console | app | OSDK + hosting | OSDK generation (TS/Python/Java/OpenAPI), entity picker, OAuth clients, hosting/custom domain, tokens, Ontology MCP config [D] | not generated, generated, deployed [D] |
| S26 | Pilot | app | describe an app, get a running one | prompt; ontology-generation, frontend-generation with live preview, seed-data agent in isolated container, production-data viewer requiring review, guided deployment with CI checks [D] | planning, generating, preview, review-gate, deployed [D] |
| S27 | Custom widget registry | via Workshop/Developer Console | extend Workshop | OSDK React widget (native) vs iframe widget (bidirectional via variables/events) [D] | — |
| S28 | Automate | app | condition → effect | condition builder (time/data/combined), effects (action, function, Logic, notification, fallback, **agent event**), run history [D] | enabled, paused, run history [?] |
| S29–S36 | Quiver, Contour, Insight, Notepad, Fusion, Solution Designer, Use Cases, Marketplace | app | analysis, documents, spreadsheets, diagrams, work organisation, distribution | each documented at overview level only [D] | — |
| S37 | Training application | app | in-product courses | course list [D] | — |

### 4.4 AI surfaces

| ID | screen | route | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S38 | **AI FDE session** | app; ⌘J → "AI FDE" (diamond icon) [O]; or `/workspace/ai-fde/prefill` [D] | conversational operation of the platform | composer, ribbon, mode selector, tools menu, outline — full anatomy in §4.7.1 [O] | empty, thinking, tool awaiting approval, running, mode-switch consent, context-pressure [O]; hard error [?] |
| S39 | Tool approval card | triggered by a tool call | consent before a mutation | inline transcript card; raw JSON viewer; "Always allow for this session"; Reject / Allow; "Waiting for tool approval…" status [O] | pending, allowed, rejected, auto per rule [O] |
| S40 | Tools menu | wrench icon, bottom-left of composer | choose tools and their permission rules | 3-column: groups with `n/m` counts → tool checkboxes → per-tool permission rule builder [O] | search empty [?], per-rule Allow/Ask [O] |
| S41 | Mode selector | `Modes` ribbon item | pick task bundle + config | left: Sub-agents (Generate plan), Modes list; right: description, segmented config, **"Adds 26 tools"**, Confirm [O] | auto-selected by agent, manual, switched mid-run with consent [O] |
| S42 | **AI FDE configurations** | settings | Models / Skills / Tool approvals | left nav: Models, Skills, Tool approvals; skill table (Name, Last updated, Enabled); "Apply to current session"; Cancel/Save [O] | empty skill set [I], populated [O] |
| S43 | AIP Skills manager | ribbon → Skills | create/share/reuse team instructions | skill (name, description, markdown body); Add skills; This session vs Skill set; enable toggle; Manage skill set [D][O] | enabled, disabled, session-only, in-set [D] |
| S44 | AIP Logic | app | no-code LLM functions | block canvas, prompt block, ontology query/edit blocks, staged writes, branching, execution-mode, metrics [D] | — |
| S45 | AIP Chatbot Studio | app | tool-using chatbots | retrieval context, tools (action, object query, function, variable update, command, request clarification), app variables, citations, session logging, publish-as-function, agent tiers [D] | — |
| S46 | AIP Evals | app | evaluate non-deterministic functions | suite builder, test cases, intermediate parameters, ontology-edit evaluation, run, experiments, results dataset, metrics dashboard [D][O] | not run, running, **9/10 failing** [O], passing [O] |
| S47 | AIP Threads | app | ad-hoc document/LLM work | drag-drop documents, resource/chatbot picker [D] | — |
| S48 | AIP Assist sidebar | any app; ⌘⇧U / ⌘U | in-context help | sidebar chat, aware of active app, **no access to the user's data** [D] | — |
| S49 | Agent Builder | app | visual agent definition | instructions, tools, preview, publish [D] | — |
| S50 | Agent Manager — agent page | app | inspect one agent | title + description; `Agent information`: Source card, Metadata (last edited by/date, created by, RID with copy), `Getting started → Start session in Agent Manager`; `Agent preview` pane showing the **actual SDK source** (`defineAgent`, `zodTool`, `zodContextItem`, `RenderResult`) with a version selector `0.0.1` [O] | — |
| S51 | Agent Manager — session list | app | monitor sessions | `Search by exact session ID`; `Version All` / `Origin All` filters; `+ New session`; columns Session \| Version \| Created at \| Created by \| Origin, where Origin is the spawning resource (`[WF] Weather Forecast Automation`, dashboard, or `No origin`) [O] | populated [O], empty [?] |
| S52 | Agent session raw view | from S51 | debug a session | typed context items, event payload, state updates, traces, logs [D] | active, waiting-for-review, resumed, failed [D] |

### 4.5 Change and release

| ID | screen | route | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S53 | Global Branch proposal | from a branch | review multi-app changes | proposal (PR analogue), resource list, per-resource reviewers by approval policy, merge [D][O] | open, awaiting review, approved, merged [D][O] |
| S54 | Release management | admin | move versions across environments | environment pipeline [D] | — |

54 screens for a platform documented as 300+ microservices with 60+ widgets and **"183 and counting"** agent tools. The visible surface is a fraction of the product.

## 5. Flows

Click counts only where a recording or doc step-list supports them; otherwise `n/a`.

```
F01 Connect a source and land a dataset
    S12 -> pick source -> configure sync -> run -> S06
    edge: no credentials, schema drift, mid-run failure, egress policy denies

F02 Build a pipeline and deliver it to an object type
    S13 -> inputs -> transform -> preview -> deliver -> output=object type
    edge: preview type-check fails; incremental + schema change; LLM node cost on full run

F03 Model the ontology  *** core of the slice ***
    S16 wizard: 1 Datasource (existing, or "continue without datasource")
        -> 2 Metadata -> 3 Properties (map columns, or add by hand; key + title)
        -> 4 Actions (auto-generated Create/Modify/Delete + who may submit: org | group | user)
        -> 5 Save location -> 6 Security (per-property policy table, default = all properties)
    then, outside the wizard: link types (two-sided, M:N needs its own datasource), other action
        types (parameters -> rules -> side effects -> submission criteria), interfaces, functions
    objects materialise on index; edits accumulate into a writeback dataset
    edge: duplicate primary key; backing-dataset swap breaks references; action rules violate a
          marking; interface implemented inconsistently; M:N link with no backing datasource;
          submission criteria unmet -> the action button renders disabled with a stated reason [O]

F04 Build an operational app
    S22 -> layout -> Object Table -> bind object set variable -> row-selection event
        -> variable update -> detail overlay -> Inline Action form -> publish -> S23
    edge: zero rows in scope; submission criteria unmet; permission denied on object type;
          variable type mismatch on binding

F05 Operator triages and acts  (observed shape: Flight Alert Inbox)
    S23 -> pick status chip (Open 230) -> facet filters (urgency, alert type) or histogram brush
        -> select row -> right-hand Object View -> action button (Escalate / De-Escalate)
        -> submit -> object updates everywhere
    happy path clicks: 3 (status chip, row, action) [O]
    edge: another user changed the object first; action rejected server-side; writeback to source
          system fails; filter combination yields zero rows

F06 *** Ask AI FDE for something (the loop the slice is about) ***
    S38 -> prompt -> agent picks mode (or user picks) -> plan (sub-agent) -> tool calls
        -> approvals (default branch / unbranched / side-effecting) -> lands on a branch
        -> S53 proposal or Code Repo PR -> human reviews -> merge
    edge: no permission (fails exactly as manual); clarification question; preview fails ->
          retry; context window pressure; approval denied; session pre-approval then scope
          escalation beyond the allowlisted branch; mode-switch consent requested mid-run [O]

F07 *** AI FDE builds an agent, end to end (observed, DevCon 5) ***  — the canonical loop
    1  user drags a Workshop module (S23) into S38; its ontology context comes with it
       (incident objects, linked regulations, the actions operators call)
    2  prompt: "here is my data, 50 safety incidents + OSHA docs, automate this process,
       I need incident type, severity, required actions"
    3  agent decomposes -> enters EXPLORATION mode: queries the ontology, finds what an
       incident looks like, sees category patterns, reads the regulations
    4  switches to LOGIC CREATION: builds a draft AIP Logic function — semantic search over
       the regulation docs, LLM block, a far more detailed prompt than the user wrote
    5  agent writes an EVAL SUITE unprompted: 10 representative cases spanning
       classifications/severities/required-actions, plus accuracy metrics
    6  runs it: 9 of 10 cases fail (required-actions wrong ~90% of the time)
    7  reads the logic execution details; asks the human clarification questions when a test
       case's correct answer is genuinely ambiguous — collaborative spec work
    8  synthesises the cause ("the LLM is categorically over-prescribing actions"), converts
       it into an action (rewrite the prompt with stricter rules), edits the function,
       re-runs evals — 90% failing to 90% passing in ONE iteration
    9  ships into an agent-first app: incidents left, AI recommendation right, human
       accepts/rejects, and can click through to the logic execution to see what context
       the agent fetched
    edge: agent retries a failed mode switch; eval cases the human disagrees with; agent
          disagrees with the human's own reading of a case

F08 *** Feedback closes the loop through the ontology (observed, DevCon 5) ***
    operator rejects a recommendation -> prompt for "what went wrong" appears inline
        -> free text ("should be sev critical when it happens three plus times")
        -> saved as an OBJECT in the ontology, linked to the incident AND to the agent's
           execution
        -> developer (or the agent) reads the feedback objects -> turns them into eval cases
        -> eval-driven loop -> the previously failing case passes
    edge: feedback arrives as "this is bad" with no actionable content -> a second,
          AI-FDE-built CLARIFYING AGENT intercepts and asks the operator for specifics
    note: this is the compounding mechanism. The ontology is the agent's defect tracker.

F09 Govern what the agent may do
    S40 tools menu -> enable a subset -> per-tool rule: If <condition e.g. on branches> in
        <allowlist e.g. master> then Allow|Ask, Else Allow|Ask
    plus S42 Tool approvals; plus S10 Control Panel: AIP enable, LLM capacity, markings
    edge: rule says Allow but the user lacks the permission (server still denies); a marking
          revoked mid-session loses session access

F10 Evaluate an LLM-backed function
    S46 -> suite -> test cases -> run -> experiment across models -> results dataset -> metrics
    edge: variance makes one run meaningless; ontology-edit evals must assert on edits, not text

F11 Long-running agent task with human handoff
    session -> typed context items accumulate -> agent reaches waiting-for-review
        -> human event from Workshop or Automate -> state transition -> work resumes
    edge: no response ever (sessions last indefinitely by design); two participants in two apps

F12 Enable the platform for agents at all
    S10 -> enable AIP -> enable Global Branching -> set LLM capacity + rate limits
        -> register/allow models -> set markings that control LLM data access
    edge: model enabled for enrollment but not for AI FDE; capacity exhausted mid-session
```

**The number to beat.** In F06 the count that matters is not clicks — it is **approvals**. Approvals fire on: default-branch changes, unbranched changes, and side-effecting operations; read-only operations are auto-approved; file edits and builds auto-approve on feature branches and require approval on protected ones. A clone that copies the chat and skips approval scoping copied the demo, not the product.

And in F07 the number that matters is **one**. One prompt to a validated agent, because the agent wrote the tests, ran them, found its own 90% failure rate, and fixed it. That is the capability gap most replicas will not close.

## 6. Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Left sidebar nav | expanded, collapsed | default, active, badge, empty favourites | S01 |
| Quicksearch overlay | jump-to, full-results | empty, results, none | S03 |
| Notification bell + panel | panel, toast, inline-answerable | unread, read, grouped | S04 |
| **Composer ribbon** | Modes (active pill), Skills, Documentation, Files, Ontology, Functions, overflow `⋯`; right-side icon actions [O] | item idle, item active-with-chevron, popover open | S38 |
| Ribbon popover — Documentation | Custom documentation (org links) + Foundry documentation (bundles, pages) [O] | empty org list [?] | S38 |
| Ribbon popover — Modes | left: Sub-agents + Modes list; right: mode detail + config + "Adds N tools" + Confirm [O] | auto-selected, manual, mid-run switch | S41 |
| Mode config controls | segmented (Python transforms \| Pipeline builder), segmented (Foundry branching \| Local branching), segmented (Code workspaces \| Authoring), checkbox (Create and edit object types and links), collapsed Advanced settings [O] | per-mode variations | S41 |
| **Composer input** | placeholder "Ask a question or prompt an agent to perform a task on your Foundry instance…" [O] | idle, focused, streaming, disabled | S38 |
| Composer footer-left | wrench (tools) + six typed resource counters (e.g. `▦ 0`, `⑃ 0`, `⬡ 0`, `▢ 0`, `</> 8`, `⚙ 0`) + one distinct counter at `7` [?]; counter highlights when that category has context [O] | zero, non-zero, highlighted | S38 |
| Composer footer-right | list icon, **model pill with dropdown** (`GPT-5.3 Codex ⌄`), **thinking-level control (automatic / low / medium / high)** [O], microphone (dictation), send [O] | — | S38 |
| **Tools menu** | 3 columns: groups with `n/m` counts → tool checkboxes → tool detail [O] | search, `Clear`, group partially/fully enabled | S40 |
| Tool permission rule | `If <condition ▾> <value chips ×> then Allow \| Ask`, `Else Allow \| Ask`, Revert / Add [O] | no rules, one rule, several | S40 |
| Tool approval card | inline transcript card: wrench + `Tool: <name>`, `</>` raw-JSON toggle, delete, JSON viewer with copy, `Always allow for this session`, `✕ Reject` / `✔ Allow` [O] | pending, allowed, rejected | S39 |
| Status line | `◆ Waiting for tool approval…` [O] | thinking, working, waiting, error | S38 |
| Thinking disclosure | `💡 Thinking` collapsible [O] | collapsed, expanded | S38 |
| **Outline panel** | header + expand; `Context:` chips (branch chip, resource chips with type icon); tree of user turn → assistant turn → tool → typed artifact; per-node token counts; bottom `Preview` disclosure; **context meter `~33.1K / 200K tokens`** [O] | collapsed rail labelled "Outline", expanded, long-session pressure | S38 |
| Session menu | `◆ AI FDE` + `⊕ New session` + named sessions with delete; `Show system prompt` toggle [O] | empty list [?], populated | S38 |
| Model selector | model names + thinking level [O] | — | S38 |
| Skill card | name, description, body; enabled toggle; last updated by + timestamp [D][O] | enabled, disabled, session-only | S42, S43 |
| **Skill set table** | columns Name \| Last updated \| Enabled; `+ Add skills`; footer `Apply to current session`, Cancel, Save [O] | one row, many rows | S42 |
| Branch chip | `⑂ ai-fde/user-task` [O] | on-main, on-branch, proposal open | S38, S53 |
| Resource chip | typed icon + truncated name, e.g. `⚒ Change Proces…` [O] | added, removed | S38 |
| Plan card (sub-agent) | "Generate plan" produces a plan used as a task list [O][D] | proposed, accepted, revised | S38 |
| Widget catalogue item | 60+ widgets across display/viz/filter/nav/embed [D] | unbound, bound, unconfigured, error | S22 |
| Variable editor | typed (object set, filter, primitive, array, struct, geopoint, geoshape, time series) [D] | unset, set, invalid binding | S22 |
| Event binding editor | row select, button, object select [D] | unbound, bound, chained | S22 |
| Layout container | columns, rows, tabs, flow, toolbar, loop [D] | — | S22 |
| Overlay | drawer, modal [D] | open, closed | S22, S23 |
| **Filter rail (inbox)** | status chips with counts, faceted checkbox lists with counts + bar, `(n/m)` + `Clear`, `Show more`, date histogram with brush, `Add filter` [O] | unselected, partially filtered, zero-result [I] | S23 |
| **Object table** | sortable headers `⇅`, row icons, text truncation with ellipsis, lozenge badges, zebra rows, selected-row highlight, horizontal scroll [O] | filled, sorted, filtered, empty, permission-masked | S23 |
| **Object View panel** | header action buttons (amber "De-Escalate", red "Escalate Alert"), star favourite, tabs (Overview \| Properties \| Alert Details), `Properties` card (2-col grid, ISO-8601 timestamps, badge values, `View all…`), `Links` card grouped by link side with type icons + drill chevrons [O] | — | S18, S23 |
| **Lozenge / severity badge** | Low (green outline), Medium (amber), High (red/pink) [O] | — | S23, S18 |
| Branch / proposal banner | branch chip, proposal link, reviewer list [D][O] | on-main, on-branch, approved, merged | S53 |
| Diff / review surface | per-resource [D] | unchanged, changed, conflict, approved | S53 |
| Pipeline canvas node | input, transform, preview, deliver, output, LLM node [D] | configured, erroring, validated | S13 |
| CI check row | per-check status, code diff, branch link, merge control [O] | running, passed, failed [O] | S14 |
| Lineage graph | provenance, widget/variable provenance [D] | whole, filtered | S19 |
| Health-check row | content, schema [D] | pass, fail, alerting | S20 |
| Session row (agent manager) | Session \| Version \| Created at \| Created by \| Origin [O] | `No origin`, resource origin | S51 |
| Session timeline | raw view, event payload, state transition [D] | active, waiting, resumed, failed | S52 |
| Token / usage meter | per-node counts, aggregate budget bar, user attribution [O][D] | roomy, near-limit | S38 |
| Access / permission denial | — | silent absence vs explicit denial [D] | all |

## 7. UI/UX anatomy (observed)

The heart of pass 2. Everything here is [O] unless marked.

### 7.1 AI FDE session (S38)

Vertical stack, bottom-anchored. The conversation grows upward; the composer never moves.

```
┌──────────────────────────────────────────────────────────────┬────────────┐
│ ◆ AI FDE   ☰  New session                     [Show system prompt]  🛎   ⇱ │  header
├──────────────────────────────────────────────────────────────┼────────────┤
│                                                              │  Outline   │
│  ◆ AI FDE · GPT-5.3 Codex                    ← attribution    │            │
│  ┌────────────────────────────────────────────────────────┐  │ Context:   │
│  │ 💡 Thinking                                        ⌄   │  │ [⑂ branch] │
│  └────────────────────────────────────────────────────────┘  │ [⚒ action] │
│                                                              │            │
│  🔧 Tool: create_object_type_permissions_datasets  </>  🗑   │ ⓘ System   │
│  ┌────────────────────────────────────────────────────────┐  │   Prompt   │
│  │ { "folderRid": "ri.compass.main.folder.…",             │  │            325+31.5K│
│  │   "datasetNames": ["user-object-type-permissions"] }   │  │ ○ Create a │
│  └────────────────────────────────────────────────────────┘  │   new branch│
│  ┌────────────────────────────────────────────────────────┐  │ ◈ I'll…  33│
│  │ ☐ Always allow for this session                        │  │  └ 🔧 Tool │
│  │  [ ✕ Reject ]                    [ ✔ Allow ]           │  │     create_…│
│  └────────────────────────────────────────────────────────┘  │     └⑂ branch│
│  ◆ Waiting for tool approval…                                │            │
│                                                              │ ▓▓▓░░ ~33.1K│
│                                                              │ Preview ⌃  │
├──────────────────────────────────────────────────────────────┴────────────┤
│ [▦ Modes][💡 Skills][📖 Documentation][📁 Files][⬡ Ontology][ƒ Functions][⋯]  ⑃  🔗 │ ribbon
│ ┌────────────────────────────────────────────────────────────────────────┐ │
│ │ Ask a question or prompt an agent to perform a task on your Foundry…   │ │
│ │ 🔧 ▦0 ⑃0 ⬡0 ▢0 </>8 ⚙0 │ ⇄7        ☰ [GPT-5.3 Codex ⌄] 🎤  ➤        │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

Seven design decisions worth copying, each with its rationale:

1. **The ribbon is a context editor, not a toolbar.** `Modes · Skills · Documentation · Files · Ontology · Functions · ⋯` each opens a picker for one *kind* of context. Agents get bad when fed everything; this makes "what does the model know" an explicit, per-session, per-category act.
2. **Modes are presented as tool bundles with a price.** Selecting `Transform data` shows `Adds 26 tools` before `Confirm`. The user sees the blast radius of the mode in the same breath as its name.
3. **Per-tool permission is a rule, not a checkbox.** `If <on branches> in <master> then Allow | Ask · Else Allow | Ask`. Note the binary is **Allow vs Ask** — there is no silent third state, and denial lives in the platform, not in the dialog.
4. **The approval card is inline and reversible.** It expands to raw JSON, carries `Always allow for this session`, and the transcript then shows `Waiting for tool approval…` so the human sees the agent blocked on them, not merely idle.
5. **Token cost is visible per node and in aggregate.** The outline shows `325 + 31.5K` on the system prompt, `33` on a turn, `659` on a tool, and a bottom bar `~33.1K / 200K tokens`. Context pressure becomes a UI state with a solution attached (summarise/remove), not a mystery failure.
6. **The outline is a tree of typed artifacts.** Under `Tool: load_action_types` sits `⚒ Change Process State`; under `Tool: create_foundry_branch` sits `⑂ Foundry branch: ai-fde/user-task`. What the agent *created* is a first-class transcript object you can click.
7. **Provenance is on the surface.** `◆ AI FDE · GPT-5.3 Codex` sits above every block, `Show system prompt` is user-toggleable, and the session menu names sessions after intent (`Create New Ontology Request`).

Secondary but telling: reasoning effort is a user control (`automatic / low / medium / high` thinking) next to the model picker; a microphone sits beside send; `Sub-agents → Generate plan` sits above the modes as a distinct species of thing; and the Documentation popover mixes **org-authored** docs (`Important Information`, `AI FDE 3.7 Tool Guidance`, `Data Integration`) with platform docs — custom grounding is a first-class content type, and its presence leaks the product version (3.7).

### 7.2 Workshop operator app (S23) — the "inbox" pattern

Three columns, filter rail left, table centre, object view right, actions pinned to the object-view header.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ❌ Flight Alert Inbox                                              ✏ Edit    │
├───────────────┬──────────────────────────────────┬───────────────────────────┤
│ ▽ Filters     │ ▦ Table                          │ ⚓ Object View  [De-Escalate][⚠ Escalate]⇱│
│               │                                  │ ❌ Cancellation: Mechanical Issue… ☆      │
│ 🚩 Open   230 │ Title  Date Of Alert⇅  Alert Type│ Overview│Properties│Alert Details│
│ ⌃ Escalated 1 │ ❌Delay: Mechan…  May 22 2020  …  │ ☰ Properties                    ⇱ │
│ ✓ Resolved 69 │ ❌Cancellation…   May 22 2020  …  │ Action Required   Re-book passengers│
│               │ ▸ selected row highlighted       │ Arrival Apt Code  ATL              │
│ URGENCY (3)   │ Urgency: [Low][Medium][High]     │ Scheduled Arrival 2020-05-22T06:27…│
│ ☐ Medium 25 ▂ │ Status / Action Taken            │ Urgency           [High]           │
│ ☐ High    7 ▂ │ Departure Apt Code               │ View all…                          │
│ ☐ Low     3 ▂ │ Arrival Apt Code                 │ ⚭ Links                        ⇱ │
│ ALERT TYPE(2/6)│                                 │ Flight:      ✈ MCI-ATL-2012-11-22 │
│ ☐ Delay: Weather 39 ▄│                           │ Arrival Apt: 📍 Hartsfield Jackson│
│ ☑ Delay: Mech… 28 ▄│                            │ Departure:   📍 Kansas City Intl  │
│   Show more   │                                  │                                   │
│ DATE OF ALERT │                                  │                                   │
│ ▁▃▅▂▆▁ (brush)│                                  │                                   │
│ [Add filter]  │                                  │                                   │
└───────────────┴──────────────────────────────────┴───────────────────────────┘
```

Observations: the filter rail carries **counts on every facet** (including `(2/6)` selected-of-total and a `Clear` per group) so the operator knows the consequence of a filter before applying it; the date filter is a **histogram with a brush**, not two date pickers; severity renders as a **colour-coded lozenge in both table and object view**; and the two mutating actions are colour-coded by risk (amber de-escalate, red escalate) and pinned in the object-view header rather than buried in a menu. This is the surface an agent-built app must land in: the agent writes the module, the human uses it, and per F08 the human's rejection is captured **in this same surface**.

### 7.3 Code review and merge (S14, S53)

The agent's output is reviewed like a colleague's: branch link → **CI/CD check list** (checks created, running, results) → code view (`clean.py`) → `Open proposal` → the agent-written PR description (the recording notes, drily, that "unlike humans, AI does write a nice description of its PRs") → `Merge proposal` → `Next`. The merge control is the only place a change becomes real, and the branch chip persists in the outline so the user always knows which world they are in.

### 7.4 Agent observability (S50, S51)

The agent page splits **what the agent is** (source resource, RID, creator, last editor, version `0.0.1`) from **what it is made of** (a live read-only `Agent preview` of the TypeScript: `defineAgent`, `zodTool`, `zodContextItem`, `RenderResult`, `AgentStateSchema`). The session list is deliberately plain — no charts — with `Search by exact session ID` (exact, not fuzzy), `Version` and `Origin` filters, and an `Origin` cell that names the resource that spawned the session or says `No origin`. Every session is attributable to an app and an agent version. That triple — agent version, origin resource, creator — is the minimum viable audit surface for an agent fleet.

### 7.5 Interaction inventory (what the user can actually do)

| # | interaction | surface | notes |
| --- | --- | --- | --- |
| I1 | open AI FDE from anywhere | ⌘J → search name → diamond icon | global reach, not a nav destination [O] |
| I2 | attach typed context | ribbon pickers; drag-drop from other apps; paste URLs | six categories + org docs [D][O] |
| I3 | manually create a branch | Files/Functions ribbon | agent never works on main [O] |
| I4 | pick mode or let the agent pick | Modes popover / prompt only | agent may switch mid-run **with consent**; "Always allow" offered [O] |
| I5 | approve or reject a tool call | inline card | per-call, or session-scoped [O] |
| I6 | set standing tool policy | tools menu rule builder | per-tool, condition + branch allowlist, Allow\|Ask [O] |
| I7 | watch/steer context budget | outline meter + summarise/remove | per-node token counts [O] |
| I8 | inspect the system prompt | session menu toggle | transparency affordance [O] |
| I9 | switch model and reasoning effort mid-session | composer footer | `automatic/low/medium/high` thinking [O] |
| I10 | dictate | microphone in composer | [?] exact behaviour |
| I11 | reuse a starting point | prefill URL with `prompt`, `skillRid`, `autoStart` | shareable; also from a Workshop button [D] |
| I12 | reuse team conventions | Skills: create, enable, add to personal set | description drives auto-load [D][O] |
| I13 | accept/reject an AI recommendation | Workshop right pane | rejection opens a "what went wrong" prompt [O] |
| I14 | drill into why the agent decided | click through to logic execution | shows fetched context [O] |
| I15 | review and merge agent work | proposal / PR | checks + agent-written description [O] |
| I16 | start a session from a resource | Agent page → `Start session in Agent Manager` | origin is recorded [O] |

### 7.6 Ontology authoring wizard (S16) — where security and authority are declared

The type-authoring flow is a modal wizard, not a settings page. Two of its six steps carry the ideas
that make the ontology a *decision* system rather than a schema.

```
┌ Create a new object type ──────────────────────────────────────────────────────────┐
│ ① Datasource    │ STEP 6                                                         ✕ │
│ ② Metadata      │ Security                                                        │
│ ③ Properties    │ Configure security policies that control which users can read    │
│ ④ Actions       │ or write properties on this object type. Because this object     │
│ ⑤ Save location │ type has no backing dataset, a default policy will be applied    │
│ ⑥ Security  ◀   │ to all properties unless you customize it here.                  │
│                 │                              ⊕ Add property security policy     │
│                 │ ┌ Policy name ────────┬ Type ─────────────┬ Applies to ───┬ ⚙ ┐    │
│                 │ │ Object security     │ [Object security  ] │ All properties│ ✎🗑│   │
│                 │ └─────────────────────┴─────────────────────┴───────────────┴───┘    │
│                 │                                          [ Back ] [ Create ]      │
└────────────────────────────────────────────────────────────────────────────────────┘
```

Step 4 is the one to study:

```
│ STEP 4                                                                          │
│ Generate action types                                                           │
│ Select action types to generate  ⓘ                                              │
│  ☑ ✥ Create Aircraft   Set Aircraft id, Owner id, Date of manufacture, +1 more   │
│  ☑ ✎ Modify Aircraft   Modify Owner id, Date of manufacture, and Display name    │
│  ☑ 🗑 Delete Aircraft   Allows deleting object instances and all of their props    │
│                                                                                 │
│ Choose who can submit this action type                                          │
│  ┌ Organization ┐  ┌ Group ┐  ┌ User ┐                                          │
└─────────────────────────────────────────────────────────────────────────────────┘
```

Three consequences for anyone copying this:

1. **Authority is authored with the action, in the same form.** `Create / Modify / Delete` are generated
   for you, each declaring the exact property set it writes, and the submit-authority is a required pick
   (`Organization | Group | User`). There is no path where an action type exists without a stated subject.
   A clone that adds a permission tab later has already lost the property.
2. **The "no datasource" path is first-class and still materialises a permission boundary.** Step 1 offers
   *Continue without datasource — generate a dataset for permissions purposes*; step 6 then explains that
   "because this object type has no backing dataset, a default policy will be applied to all properties".
   So an action-only object type still has a dataset behind it — for permissions, not for facts. The
   objects come from actions; the security still comes from a dataset. That nuance is easy to get wrong.
3. **Security is per-property, and additive.** The policy table is keyed by property scope (*All properties*
   vs a subset), and further policies can be stacked. Security is not a flag on the type.

### 7.7 Submission criteria (S16 authoring, S23 enforcement) — a nested predicate tree

The clearest "guarded action" surface in the product. Submission criteria are authored as a boolean
expression over **typed operands**, not as a script and not as a free-text rule:

```
┌ Execution ──────────────────────────────────────────────────────────────────────┐
│ Match ALL conditions below:                                                     │
│  ⣿ 👤 Current User  groups  is part of  Administrators                            │
│  ⣿ Match ANY conditions below:                                                   │
│      ⣿ 🏷 Support Ticket ▸ ❞ Request Type  is  Customer Request                   │
│      ⣿ 🏷 Support Ticket ▸ ❞ Request Type  is  Mechanic Request                   │
│      ⊕ Add a condition or a logical operator                                    │
│  ⣿ 🏷 Support Ticket ▸ ⏱ Requested At  is  2022-03-01T00:00:00+01:00              │
│  ⊕ Add a condition or a logical operator                                        │
└─────────────────────────────────────────────────────────────────────────────────┘
```

Operand kinds visible: **current user → group membership**, **object instance → property**, **object
instance → timestamp**. Operators include `is`, `is part of`. Nesting via `MATCH ALL / MATCH ANY` blocks
with indeterminate-depth `Add a condition or a logical operator`. This is the same visual grammar as the
tool-permission rule builder (§7.1) — Palantir reuses one condition-builder idiom for *who may run this
action*, *which tool calls need approval*, and *which objects an automation fires on*. That reuse is worth
copying on its own.

The negative state is observed, which matters more than the happy path: on a ticket whose `Status` is
`Closed`, the `Change Ticket Priority` action renders **disabled** with the tooltip
`Invalid state to apply action`, while the object still displays `Priority P1`. The refusal is
**local, explained, and attached to the affordance** — the button that cannot be pressed says why, in the
place where the user tried to press it.

## 8. Inferred data model

```
Enrollment        id, name, url, enabled_apps, enabled_models, llm_capacity, rate_limits
                  evidence: S10; "requires AIP enabled on your enrollment"   confidence: high
Organization      id, enrollment_id, name              (mandatory user silo)
                  evidence: security overview                                 confidence: high
User              id, groups, settings, markings_granted
                  evidence: S08, S04                                          confidence: high
Group             id, members, roles                       evidence: S08       confidence: high
Marking           id, label, classification                 evidence: AI FDE security, purpose-based page
                                                                              confidence: high
Purpose           id, description                          (purpose-based access control axis)
                  evidence: arch-platforms "role-, marking-, and purpose-based"
                                                                              confidence: medium
Project           id, parent_folder, name             (primary security boundary)
                  evidence: S06, security overview                            confidence: high
Resource          id, kind, project_path, permissions, rid
                  evidence: universal; AI FDE context categories              confidence: high

Dataset           id, schema, parent_ids, transaction_id, branch, format(Iceberg)
                  evidence: llm-summary, S13                                  confidence: high
Transaction       dataset_id, commit_time, files, mode(append|overwrite|update)
                  evidence: llm-summary                                       confidence: medium
Transform         id, language, inputs[], output, mode(batch|incremental|streaming)
                  evidence: S14                                               confidence: high
Build             id, target, status, started_at, logs        evidence: S20, S19 confidence: high
Schedule          id, trigger, target, enabled                 evidence: S28      confidence: high
Connector         id, kind, credentials_ref, egress_policy     evidence: S12      confidence: high
Sync              id, connector_id, mode(batch|streaming|cdc|media), target
                  evidence: llm-summary                                       confidence: high
Listener          id, type(https|websocket|email), target      evidence: llm-summary confidence: high

ObjectType        id, api_name, primary_key, title_property, backing_datasource(s) OPTIONAL,
                  properties[], implements_interfaces[], rid, writeback_dataset
                  evidence: object-types ("create the object type without a backing datasource
                  if every object will be created through actions"); action-types (writeback)
                                                                              confidence: high
Property          object_type_id, name, type(string|int|double|bool|date|timestamp|array|
                  struct|geoshape|geopoint|...), required, derived/shared?
                  evidence: llm-summary, interfaces                            confidence: high
LinkType          id, side_a(type, display_name, api_name), side_b(...),
                  cardinality(1:1|1:n|n:1|n:n), key_cols, object_backed?, backing_datasource?
                  evidence: link-types ("a link type is bidirectional: it always has two sides";
                  "no implicit reverse link type"; M:N "datasources back the link types")
                                                                              confidence: high
Interface         id, interface_properties[], link_type_constraints[], action_type_constraints[],
                  extends[], implemented_by[], ontology_roles
                  evidence: interfaces                                        confidence: high
Object            object_type_id, primary_key_value, property_values, mark_refs
                  evidence: llm-summary                                       confidence: high
ObjectSet         filter/search expression (not a stored entity)              confidence: high
ActionType        id, parameters[], rules[], side_effects(notification, webhook),
                  submission_criteria[], schedule_rules[], function_backed?
                  evidence: action-types, llm-summary                         confidence: high
Action            action_type_id, instance_params, applied_at, applied_by, result, edits[]
                  evidence: llm-summary                                       confidence: high
Function          id, language(ts_v1|ts_v2|python|ontology_sql), inputs, output, edits_ontology?
                  evidence: functions overview, llm-summary                   confidence: high
LogicFunction     id, blocks[], prompt, retrieval_context[], staged_writes?, execution_mode
                  evidence: S44, DevCon 5                                     confidence: high
EvalSuite         id, test_cases[], metrics[], runs[]         evidence: S46, DevCon 5 confidence: high
EvalCase          id, input_objects[], expected, actual, pass/fail, provenance(feedback_id?)
                  evidence: DevCon 5 (cases traceable to a user's feedback)    confidence: high
EvalRun           id, suite_version, logic_function_version, model, metrics, variance
                  evidence: S46                                              confidence: high
FeedbackItem      id, target_agent_execution_ref, linked_object_ref(incident), author,
                  free_text, resolved_by_eval_case_id?
                  evidence: DevCon 5 ("codified and encoded as an object… linked to the
                  incident, linked to the agent's execution")                 confidence: high

Branch            id, base(main for global), scope(repo|global), name(e.g. ai-fde/user-task)
                  evidence: global branching, S38 branch chip                 confidence: high
Proposal          id, branch_id, resources[], reviewers[] per approval policy, status,
                  description (agent-authored)
                  evidence: global branching, S53, DevCon/Ontologize         confidence: high
Release           id, version_set, environment                 evidence: global branching confidence: medium

Model             id, provider, enabled_for_enrollment, rate_limit, zdr?
                  evidence: AI FDE overview, model catalog                    confidence: high
Chatbot           id, retrieval_context[], tools[], app_variables[], distribution[]
                  evidence: AIP features, S45                                 confidence: high

Agent             id, name, instructions, tools[], source_resource, rid, version(0.0.1),
                  state_schema, build_mode(builder|sdk|third-party), published_rid
                  evidence: S50 (source card, RID, version, SDK preview)      confidence: high
Session           id, title, agent_id, agent_version, state, participants[], context_items[],
                  event_history[], created_by, origin_resource_ref, markings_applied[]
                  evidence: S51 (Version, Origin, Created by), agent-stack     confidence: high
ContextItem       session_id, type, payload, produced_by      (strongly typed)
                  evidence: agent-stack                                       confidence: high
Event             session_id, type, payload, from_participant  evidence: agent-stack confidence: high
StateTransition   session_id, from_state, to_state, handler, at evidence: agent-stack confidence: high
Trace/Log         session_id, spans across functions/actions/LLM calls, durations, errors
                  evidence: agent-stack, S52                                  confidence: high

FdeSession        id, title, owner_user_id, model, thinking_level, mode, enabled_tools[],
                  tool_permission_rules[], messages[], tools_used[], artifacts_created[],
                  token_usage{per_node, total, budget}, branch_ref?, markings_applied[]
                  evidence: S38 (all fields visible in screenshot/recording)   confidence: high
Mode              id, name, doc_bundle, tool_subset[], config_options[], tool_count
                  evidence: S41 ("Adds 26 tools"; recording says 27 and 37 for ML)  confidence: high
Capability        id, kind(agent|domain), tools[]              evidence: modes-and-capabilities
                                                                              confidence: high
SubAgent          id, kind(Generate plan), output(task list)   evidence: S41      confidence: medium
ToolApprovalRule  tool_id, condition(on branches|...), values[], then(allow|ask),
                  else(allow|ask), scope(session|branch|project)
                  evidence: S40 rule builder ("If on branches master → Ask, Else Allow")
                                                                              confidence: high
Skill             id, name, description, body(markdown), rid, project_path, updated_by, at
                  evidence: AIP skills, S42 skill table                       confidence: high
SkillSet          user_id, skill_ids[], enabled_flags[]        evidence: S42      confidence: high
DocBundle         id, title, kind(custom|foundry), pages[]     evidence: S38 Documentation popover
                                                                              confidence: medium
PrefillLink       prompt, skill_rids[], auto_start (stateless URL)             confidence: high

AuditEvent        actor_user_id, action, resource, at, source(manual|agent)
                  evidence: AI FDE security                                   confidence: high
ComputeUsage      user_id, model, tokens, compute_seconds
                  evidence: AI FDE security                                   confidence: high
```

Relationships: `Enrollment 1-n Organization 1-n User n-n Group n-n Marking`; `Purpose n-n Marking`;
`Project 1-n Resource`; `User n-n Project (role)`; `ObjectType 1-n Property`;
`ObjectType n-n ObjectType via LinkType` (two sides, no implicit reverse);
`ObjectType 1-n Object`, `ObjectType 1-n ActionType`, `ActionType n-1 Function (optional)`;
`Resource 1-n Branch 1-n Proposal`; `Agent 1-n Session 1-n ContextItem`, `Session 1-n Event 1-n StateTransition`;
`User 1-n FdeSession n-n Skill (via SkillSet)`; `FdeSession 0..1 Branch`;
`FdeSession 1-n ToolApprovalRule (session-scoped)`; `EvalSuite 1-n EvalCase`;
`EvalCase 0..1 FeedbackItem`; `FeedbackItem n-1 Object (target)` and `FeedbackItem n-1 Session (execution)`.

Three structural observations:

1. **The ontology is the agent's defect tracker.** `FeedbackItem` is an *ontology object* linked to both the incident and the agent execution (F08). Because feedback is modelled data, it can be queried, evaluated and turned into test cases — which is why the compounding loop closes. Most agent products store feedback in a column nobody reads.
2. **AI FDE has no shadow data model.** Its sessions, modes, tools and approval rules are ordinary platform resources, permissioned by project, audited by the platform, governed by markings. That is why the docs can say "If you do not have permission to create a repository, neither does AI FDE" without qualification.
3. **`Mode` scopes context, never authority.** Modes swap documentation and tool subsets; permissions and markings stay orthogonal. A clone that merges the two leaks capability where it meant to restrict context. Note the modes also carry a **tool count** (`Adds 26 tools`) — the blast radius is data, not copy.

## 9. Feature matrix

`2026-11-01-palantir-foundry-aifde-features.csv` — 65 rows: must 24, should 20, could 12, skip 9. Every row starts `original: yes`, `clone: no`; the `clone` column is filled during the build and scored by `replica-diff`.

## 10. Out of scope — cannot or should not be cloned

- **The 300+ microservice estate, MMDP, and Apollo/Rubix.** Iceberg/Flink/Spark at scale, autoscaling, blue/green zero-downtime, node cycling inside 48h with zero-trust gating. Not reconstructible from a recon map.
- **The security guarantee, as distinct from its shape.** Roles, markings and purposes can be rendered in a weekend; reconciling them *at the time of interaction* across tens of thousands of humans and agents, plus row/column enforcement, is the product.
- **Regulated certifications** — FedRAMP High, DoD IL-5/IL-6, CMMC. Contractual, not technical.
- **Model access and contracts,** including no-retention/no-retraining terms. Commercial relationships.
- **The FDE human service model** — bootcamps, embedded engineers, Customer Success Services. The practice is not in the software.
- **The 300-connector catalogue**, partner marketplace, and the customer systems they reach.
- **The installed base** of other organisations' ontologies and operating habits.
- **Palantir's own documentation corpus** and the org-specific doc bundles that ground agents. This report paraphrases; it does not transplant.

## 11. Where the real difficulty is

1. **Governed execution in the write path.** Every agent action is an ordinary platform call under the user's identity, so permission, marking, branching and audit apply without trusting the agent. Architectural, and pre-agent. Retrofitting is a rewrite.
2. **Branch + proposal + review as the default.** The agent never works on main: global branch where supported, local branch where not. This requires a versioned ontology from day one — and Palantir is honest that it is ragged (TS v2 and Python functions can't be edited on a branch; OSDK isn't branchable).
3. **Eval-driven development inside the agent loop.** The agent writes the suite, runs it, reads the failures, forms a diagnosis ("categorically over-prescribing actions"), converts it to an edit, re-runs. Without this you have a code generator; with it you have something that reaches 90% in one iteration.
4. **Feedback as modelled data.** The rejection path is not a thumbs-down event. It is a prompt for specifics, an ontology object, a link to the execution, and a future test case.
5. **Context as a first-class, measured resource.** Minimal baseline, explicit per-category context, per-node token counts, a budget meter, summarise/remove, and a tool subset with a stated count.
6. **Approval-scoping UX.** Rules, not dialogs; branch-aware; conservative defaults ("maximally conservative; nothing that could impact production workflows is auto-approved"); Allow-vs-Ask binary; denial owned by the platform.
7. **Ontology indexing and materialisation.** One row = one object; edits over materialised state; a writeback dataset; re-index on backing-dataset change.
8. **Typed sessions with human handoff.** Sessions that live indefinitely, pause into waiting-for-review, and resume when another participant — in another application, named as `Origin` — sends an event.
9. **Scale compute** — out of scope here, but the reason the platform sells on data volume.

## 12. Size

For the confirmed slice: **54 screens** mapped across the platform (of which ~20 are load-bearing for the slice), **12 flows**, **~50 entities**. Hard parts as §11.

Size for the slice *as stated* — all of the four-fold ontology plus an agent that builds it: **XL**. Stated plainly: the four-fold ontology is a multi-team data platform, and the agent is a second product that only pays off once the first exists. A recon map cannot close that gap, and anyone who says otherwise is selling something.

**What "cut" means here.** The slice is one product, not five. A *cut* does not reduce the scope — all five
stages together **are** the confirmed slice. A cut decides only two things: **what order the parts get
built**, and **where you stop to prove the last part works before starting the next**. The alternative to a
cut is not "the whole thing at once"; it is an unsequenced backlog where nothing is demonstrable until
everything is.

The practical test for a stage boundary is: *can a person watch it work and tell whether it failed?*
Each stage below has such a test. If you cannot state the test, the stage is a work package, not a cut.

**Recommended cut of the confirmed slice:**

| stage | what | size | the test that says it worked | why this order |
| --- | --- | --- | --- | --- |
| 1 | Ontology alone, authored declaratively: object types (backed **and** action-only), properties, key/title, link types (two-sided, M:N), action types with parameters, submission criteria and writeback, plus the per-property security policy authored **with** the type — interfaces optional | **L** | A type can be created through a form and then read back as JSON with its security policy and its submit-authority attached; an action that fails its submission criterion is refused with a reason | nothing above it is meaningful without it |
| 2 | One operator surface rendered from the ontology: the inbox pattern (facet-counted filter rail → sortable table → object view → actions pinned in the header, disabled-with-reason when blocked) | **M** | Build one real screen by writing only ontology JSON. If a component change is needed for a new screen, the surface is not declarative yet | proves the ontology is operational, not decorative |
| 3 | Agent harness v1: composer, modes-as-tool-bundles with a visible tool count, per-tool approval rules, inline approval cards, outline with per-node token counts and a budget meter | **M** | The agent can be told to do something over-permissioned and is *stopped by a rule, not by a prompt*, with the approval visible in the transcript | the governance skeleton, before autonomy |
| 4 | Branch / proposal / review, agent never on main | **M** | Every agent write appears as a reviewable diff and nothing reaches the main world without an explicit merge | the safety property that makes stage 5 tolerable |
| 5 | Eval-driven loop + feedback-as-ontology-object | **M–L** | Point the agent at a failing function; it writes cases, reports its own failure rate, edits, and improves — and an operator rejection in stage 2's surface becomes a test case | the actual differentiation; do not defer past stage 4 |

Skip the analytics suite, Slate, Pilot, the analytics apps, Connectors beyond one, and every certification ambition.

**The honest warning about stage 1.** Stage 1 is the largest stage and the least impressive. It produces
no chat, no agent, no screenshots worth showing. Two thirds of the platforms that attempt this slice lose
their budget there and ship a schema editor nobody uses. That is the argument for front-loading stage 2's
*test*, not stage 2 itself: decide before you write stage 1 which single inbox screen you will render from
it, and refuse ontology features that screen does not need. Otherwise "the ontology" quietly becomes the
product, and the agent — the reason the slice exists — never arrives.

## 13. What this recon still does not have

- **No live account.** No true empty, loading or hard-error capture, and no genuine permission-denied
  page. One negative state *is* now observed rather than inferred: a **blocked action** (disabled button,
  `Invalid state to apply action`) from a submission criterion, because Palantir publishes that image.
  Filtered-to-zero results, failed builds and denied-access screens remain inferred. Per the skill's rule:
  an unrecorded state is an unrecorded state.
- **Mobile.** Workshop ships "interactive web and mobile applications"; no mobile surface was mapped.
- **Two recordings unwatched** (transcript unavailable this pass): "How an FDE Uses AI FDE — voice-enabled OSDK app" and Palantir's "Data Migrations with AI FDE" (36 min). Both are likely to add real flow detail.
- **Not yet read:** the purpose-based access-controls page, the agentic-runtime security blog post, the community Q&A thread — all located, all relevant to §11.1 and §11.6.
- **Release notes unread** (client-rendered), **no pricing** (none exists publicly), **widget catalogue unenumerated** (60+ named, a dozen detailed).
- **One unresolvable figure:** the trailing composer counter reads `7` while the mode claims 26/27 tools; ambiguous between "attached context items" and something else. Marked `?` rather than guessed.

## 14. Corrections to pass 1

Recorded because a recon map that silently changes is worse than one that shows its corrections:

| pass-1 claim | now | evidence |
| --- | --- | --- |
| Ribbon items are "datasets, functions, branches, interfaces, action types, object types, doc bundles, media" | Ribbon is six **categories** — Modes, Skills, Documentation, Files, Ontology, Functions, plus `⋯` — each a picker over those resource types | screenshot [O] |
| Context management = "drag folders, datasets, docs" | Plus paste URLs, manual branch creation, org-authored custom documentation | recording, screenshot [O] |
| Tool approval is per-action or session-scoped | Plus a **standing per-tool rule builder** (`If <condition> in <allowlist> then Allow\|Ask · Else …`) | screenshot [O] |
| Mode config = language choice / transforms-vs-Pipeline-Builder / Model-Studio-vs-pro-code | Also **branching mode** (Foundry vs local) and **code editing mode** (Code workspaces vs Authoring) | screenshot [O] |
| Outline shows prompts, tools, tokens | It is a **tree with typed artifact rows and a global context-budget meter** | screenshot [O] |
| "Sub-agents" | Not in pass 1 at all; `Generate plan` is a sub-agent, above modes | screenshot [O] |
| Reasoning effort | Not in pass 1; user-selectable `automatic / low / medium / high` thinking | recording [O] |
| Tool count | "183 and counting" tools; modes bundle them (26–27 for transforms, 37 for ML) | recording, screenshot [O] |
| Object-type creation = one form over a backing dataset | A **six-step wizard** ending in Security; step 1 has a first-class *"continue without datasource — generate a dataset for permissions purposes"* path | screenshot [O] |
| Security is configured after the ontology exists | Security is **step 6 of type creation**, a per-property policy table (`All properties` by default); an action-only type still gets a permissions dataset | screenshot [O] |
| Action types are hand-authored one at a time | The wizard **generates Create / Modify / Delete** for the new type, each declaring its property set, plus a required submit-authority (`Organization \| Group \| User`) | screenshot [O] |
| Submission criteria = "a condition checked before submit" | A **nested `MATCH ALL / MATCH ANY` predicate tree** over typed operands (user→group, object→property, object→timestamp), same idiom as the tool-permission rule builder | screenshot [O] |
| Object detail is a property panel with links | The Object View **hub** adds tabs per concern, a paged Timeline (searchable, `Showing 25 of 24196 events`), and a right rail of state-coloured **Management Consoles** that jump into the apps acting on this object | screenshot [O] |
| Denied / blocked action states unobserved | **Observed**: disabled `Change Ticket Priority` + tooltip `Invalid state to apply action` on a `Status: Closed` ticket, object still showing `Priority P1` | screenshot [O] |

## 15. Horizon relevance (interpretation — not source fact)

Palantir's object/link/action/security quadruple maps closely onto Horizon's semantic objects, affordances, governed execution and independent evidence. Two sharper parallels:

- **`FeedbackItem` as a linked ontology object** is the cleanest instance of Horizon's *developmental feedback* requirement — the defect is modelled data with references to both the world and the execution that got it wrong, so it can become a test.
- **Allow-vs-Ask with a branch allowlist** is a concrete shape for Horizon's fail-closed authority: there is no "third state" of permission, and the *platform*, not the dialog, is where a denial lives.

Where Palantir is weaker than Horizon's spec intends: Foundry documents `available` and permission-denied, but the `unknown` and `conflicted` affordance states that Horizon treats as first-class are not visible in the public model — a mode is either permitted or not; an object either exists or is masked. Treat that as a hypothesis for the plan, not a finding.

---

Five-line summary: **Core loop** — encode data, logic, action and security once as an ontology, then let humans and agents decide from it, with every change reviewed on a branch and every failure fed back as an ontology object. **Scale** — 54 screens mapped (~20 load-bearing), 12 flows, ~50 entities, 183 agent tools, 60+ widgets. **Three hardest parts** — governed execution inside the write path, eval-driven development inside the agent loop with feedback modelled as data, and a versioned/branchable ontology with review as the default. **Out of scope** — the microservice estate, MMDP/Apollo, certification, model contracts, connectors, the FDE service model, the installed base. **Next step** — confirm the five-stage cut in §12, then `/replica-architect`.
