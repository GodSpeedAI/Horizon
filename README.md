# Horizon

**Navigate the world you can actually change.**

Horizon is GodSpeed AI's operational navigation environment for people, organizations, and AI agents. It connects a shared semantic model of the world to contextual discovery, actionable affordances, independently governed execution, observed consequences, and developmental learning.

Horizon answers a more demanding question than "What can an AI do?":

> Given this observer, the world as currently represented, the direction being pursued, the resources and authority available, and the consequences of previous attempts, what is the next move that can be afforded, carried out, observed, and learned from?

Horizon is **world-first rather than chat-first**. An observer can start with an object, a relationship, an operational event, a case, a question, a desired change, or an unfinished piece of work. The interface maintains that context as the observer explores, compares, commits, verifies, recovers, and continues.

This README describes the **intended completed product**, not the repository's present implementation or a claim that every integration already works. Normative behavior, obligations, and evidence gates are defined in [Horizon Specification](.agents/specs/horizon.agent.spec.yaml).

## The experience

Imagine an operations analyst noticing that production orders are running late.

They enter Horizon, search production orders, filter the delayed set, and traverse the **requires material** relationship. They can inspect the same selected objects as a table, relationship graph, lineage view, or case. Contextual operations appear because they apply to those objects, not because an assistant invented a menu. If expediting is an available move, Horizon explains its prerequisites, predicted burden, actual authority conditions, recovery, and evidence requirements before anyone commits.

After a governed action, Horizon distinguishes **request accepted**, **operational obligations settled**, **material delay reduced**, and **durable capability improved**. These are different claims. A follow-up observation may contradict the original expectation. The case remains open, the contradiction remains inspectable, and the observer gets a revised set of next spendable possibilities.

The same pattern applies to software releases, data pipelines, manufacturing changes, service operations, organizational investigations, and other purposeful work modeled in the organizational world.

## One shared world; many ways to navigate

The experience is built around six interconnected affordances:

| Experience | What the observer does |
| --- | --- |
| **Explore** | Find semantic types, real objects, object sets, relationships, applications and lineage; filter and traverse without losing focus |
| **Operate** | Discover contextual actions, check reach/payment/governance/recovery/settlement gates, and commit only permitted work |
| **Build** | Examine the systems behind an operational resource; propose, validate, compare and govern semantic or workflow revisions |
| **Monitor** | Follow consequential events and changes; inspect conditions and choose or authorize bounded responses |
| **Compare** | Branch a pinned baseline into clearly hypothetical alternatives, compare assumptions and payment, and return to the real-world authority path before acting |
| **Develop** | Review evidence, failure, transfer and recovery across cases to discover what has actually become reliably possible |

A **Case** is a purposeful, observer-relative view over this world. A case helps the observer answer what matters now, but the observer may navigate the world without first creating one. Cases do not replace the canonical semantic model, operation records, or evidence.

## A Clack-shaped journey, projected into an Atomic GUI

Horizon uses a shared, renderer-neutral interaction contract.

In a **Clack-style sequential terminal**, the next meaningful question appears at the time it is needed. The user moves through small, bounded selections and decisions. The system skips already-resolved context and rejects missing or unauthorized action bindings instead of fabricating a smooth wizard.

In a **persistent graphical workspace**, the same behavioral contract is projected into atomic elements, groups, regions, and views. World identity, current focus, source evidence, object selections, work in flight, and navigation history can remain visible together. The observer can change from table to graph, inspector, timeline, or comparison without changing the underlying case or permission semantics.

Both experiences send the **same typed intents** and receive the **same source-grounded decisions**. The user interface cannot independently authorize actions, rewrite settled history, or decide what external evidence proves.

~~~mermaid
flowchart TB
  IDM["R1 · DomainForge Interaction Domain Model"] --> BIR["R2 · Behavioral IR per canonical journey"]
  BIR --> PROOF["R3 · Sequential Clack behavioral proof"]
  PROOF --> AIR["R4 · Atomic UI IR and projection-pressure decisions"]
  AIR --> TUI["R5 · Clack / OpenTUI projection"]
  AIR --> GUI["R5 · React / Astryx projection"]
  BIR --> NAV["Horizon navigation controller"]
  NAV --> FRAME["Versioned navigation frames and validated surfaces"]
  FRAME --> TUI
  FRAME --> GUI
  TUI --> INTENT["Typed, role-bound intent"]
  GUI --> INTENT
  INTENT --> NAV
~~~

The R1–R5 distinctions are intentional. Interaction semantics are not inferred from button handlers. A richer GUI is earned by behavioral proof and projection pressure, not built first and rationalized afterward.

### Deterministic presentation instead of generated UI code

Horizon uses a **closed, versioned declarative surface vocabulary**, adapted from the Product Actualizer cockpit design. A surface is a bounded composition of meaningful blocks: metrics, callouts, tables, trees, timelines, graphs, charts, comparisons, media, documents, entities, progress, preflights, questions, and forms.

Its source data is bound through typed projection resolvers and validated object references. Agents may propose or compose a surface with those blocks; they cannot send executable HTML, CSS, JS, JSX or arbitrary DOM operations.

The system determines its primary interaction mode from the actual application state—orient, decide, execute, verify, complete—rather than asking an LLM to guess which interface should be shown. Every materially consequential result is linkable to its source or marked unknown, derived, hypothetical, or agent-supplied.

Horizon retains the cockpit's separation of **system state**, **agent-composed views**, and **human-controlled decisions and layout**. The observer's pinned panels and focus cannot be stolen by a background agent update.

## The GodSpeed stack behind Horizon

Horizon is the **experience and navigation controller**, not a new implementation of the entire platform.

| System | Authority and contribution |
| --- | --- |
| **DomainForge** | Compiles composed .sea semantic worlds and owns canonical concepts, relationships and the immutable world_ref |
| **Cognate** | Operates the application: capabilities, durable events, projections, scoped context, client protocols and continuations |
| **SEA-Forge** | Determines independent authority for consequential operations, governed execution boundaries and declared operational settlement |
| **Gauntlet** | Performs bounded long-horizon work against an immutable Reference with observation, verification, correction and recovery |
| **RealityTrace / SXR** | Preserves predeclared expectations, observations, residuals, evidence and provenance |
| **Context Kernel** | Retrieves scoped, versioned references and session context with citations; its retrieval does not become world truth |
| **RuVector** | Accelerates derived cognitive retrieval and graph queries where proven; indexes are not authority |
| **GodSpeed research subsystem** | The Python ML research infrastructure carried over from GodSpeed Agent: datasets, calibration, preregistered experiments and advisory estimators, reached through Cognate |
| **Your products** | Each product joins through the product integration contract (semantic module, read connector, governed actions, evidence hooks) at an integration level Horizon derives from what is proven |
| **Horizon** | Maintains observer-relative navigation, meaningful focus, affordance evaluation, case status, developmental interpretation and next moves |

~~~mermaid
flowchart TB
  O["Human or AI observer"] <--> UI["Horizon · Clack or Atomic GUI"]
  UI <--> NAV["Horizon navigation controller"]
  NAV <--> C["Cognate · scoped runtime, capabilities, events and projections"]
  D["DomainForge · canonical semantic world"] --> C
  CK["Context Kernel · scoped reference retrieval"] --> NAV
  C --> SEA["SEA-Forge · authority and operational obligations"]
  C --> G["Gauntlet · optional long-horizon execution"]
  C --> X["Direct domain capabilities / external systems"]
  G --> SEA
  G --> X
  C --> R["RealityTrace · evidence and discrepancy"]
  X --> R
  G --> R
  R --> NAV
  SEA --> C
  NAV --> C
~~~

The diagram describes **logical responsibilities and information paths**, not a claim that every direct endpoint or adapter already exists. Cognate can broker integrations without absorbing their authorities.

### Where you start

Opening Horizon lands on a home view that resumes where you left off and puts first what needs you: pending approvals, contradicted evidence, work in flight and degraded sources. A keyboard command palette reaches every object and every available move. Every focus has a stable link that reopens the same world, checkpoint and selection, and Horizon tells you when newer state exists instead of silently moving you.

### The three things Horizon will never confuse

**Possibility is not an affordance.** A candidate action becomes a present affordance only when visibility, reachability, payment, execution capability, governance, recovery and settlement access satisfy the applicable gates. A blocked action stays inspectable and explains its blocker; it is not offered as an executable choice.

**Execution is not settlement.** API acknowledgment, successful tool exit, an accepted governance operation, and verified change in the external world must be distinguished. RealityTrace evidence must be assessed against expectations frozen before observation.

**Settlement is not developmental capability.** Capability requires repeated settlement under meaningful variation, less orchestration burden, transfer and recovery. An accepted operation does not automatically justify a claim of learned competence or expanded horizon.

## The canonical navigation journeys

Six foundational journeys express the platform without requiring one custom wizard or page per domain:

1. **Enter and explore:** Resolve observer and pinned world, search resources, filter typed operational objects, traverse semantic relationships, inspect references and preserve focus.
2. **Act under governance:** Discover a contextual operation, evaluate its spendability, freeze expectations, request SEA-Forge invocation authority, execute directly or through Gauntlet, correlate RealityTrace observations, and review consequences.
3. **Build and revise:** Navigate data lineage and semantic dependencies, propose a candidate change, validate its DomainForge closure, execute bounded work, and explicitly govern any promotion to a new active world_ref.
4. **Monitor and respond:** Receive a source event through Cognate, update projections, reassess relevant cases, and notify, request approval, or perform a specifically authorized idempotent response.
5. **Compare without committing:** Pin a baseline, test stated hypothetical assumptions, inspect uncertainty, and return through real-world authority before any actual side effect.
6. **Develop:** Review what repeated settlement has actually made reliable, run a preregistered research experiment in the GodSpeed research subsystem, and activate a predictive estimator only under governance.

Each journey is derived using eight reusable responsibilities: **context selection, preflight, authority resolution, capability invocation, state/artifact effect, evidence inspection, settlement/decision, and next-affordance selection**. These are semantic responsibilities rather than eight mandatory screens.

Detailed sequence diagrams, blocked branches, integration ownership and normative acceptance criteria for all six journeys are included in the [specification](.agents/specs/horizon.agent.spec.yaml) under **execution_integration_contract.journeys**.

## The operational world is not just one graph

Horizon differentiates:

- The **semantic composition graph** of DomainForge modules, concepts and relationships.
- The **operational instance graph** of current orders, people, resources, events and their relationships.
- The **data lineage graph** of sources, transformations, dependencies and downstream applications.
- The **evidentiary and developmental relationships** among expectations, attempts, observations, settlement events and learned capabilities.

These may be connected through typed references and scoped projections, but must not silently collapse into one graph with ambiguous meaning.

The immutable semantic **world_ref** also differs from an operational **checkpoint**: a semantic definition can remain unchanged while business objects move through time.

## A first-class world debugger

Every appropriate focus can answer seven inspectable questions:

| Question | Operation |
| --- | --- |
| Why is this currently believed? | **why** |
| What depends on this? | **impact** |
| What changed? | **diff** |
| How did we get here? | **timeline** |
| What would follow if a proposed revision held? | **counterfactual** |
| What capability and provider could obtain missing evidence? | **reach** |
| Does recorded evidence still satisfy the preregistered criterion? | **replay** |

The debugger does not change the world. Counterfactuals are labeled by what is recorded, derived, expected, unknown, or requires observation. A history view cannot impersonate the current world. An answer without a supporting source remains unavailable rather than becoming plausible filler.

## Trust is visible in the interaction

Horizon makes authority and provenance navigable.

A surface may be agent-composed without allowing the agent to approve its own action. A user may answer a prompt without authorizing a deployment. An authority preflight may be favorable without granting future authority. A RealityTrace delivery receipt may confirm that an observation was recorded without establishing that the result satisfied the declared criterion.

Each consequential episode preserves references linking observer, immutable world, operational checkpoint, optional case, intent, authority decision, execution, evidence, operational settlement, and separate developmental review. Failed runs and contradicted expectations remain part of the developmental record.

## What success means

Horizon succeeds when an observer can enter a real organizational world; discover and follow source-backed object relationships; find a presently affordable move rather than merely a desirable destination; understand why another move is blocked; commit only under independent authority; inspect what actually happened; resume after interruption; and choose again from an honestly updated present.

Success must be demonstrated in repeatable **Clack and GUI journeys**, real cross-system integrations, denied/unknown/contradicted/recovery tests, evidence readback and future variation. A visually convincing demonstration or a passing simulation alone does not establish the product claim.

The [normative specification](.agents/specs/horizon.agent.spec.yaml) is the contract for these outcomes. Plans, implementation notes and status records may evolve independently, but cannot silently weaken its acceptance and evidence requirements.

---

**Horizon is not where you declare that you have arrived. It is where you see what can actually be done next—and learn from what the world gives back.**
