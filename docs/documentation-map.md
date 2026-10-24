# Documentation map

Every canonical documentation page, its purpose, reader need, Diátaxis classification,
prerequisites, related pages, and the concepts it owns. Use this to find the canonical
home for a topic and to avoid creating competing explanations.

Canonical owners *outside* this directory: `README.md` (product vision),
`AGENTS.md` (governance rules), `.agents/` (state, debt, evidence),
`.sea/interaction/` (semantic sources + journey catalog), `ui-model/` (atomic UI
contract), `behavioral/` (behavioral IR + proof report), `donors.md` (provenance).

## Learn the system

| Page | Purpose | Reader need | Type | Prerequisites |
| --- | --- | --- | --- | --- |
| [index.md](index.md) | Documentation home; orientation; what is real vs vision | "What is this and where do I start?" | Orientation | — |
| [glossary.md](glossary.md) | Precise definitions of every repository term | "What does this word mean here?" | Reference (vocabulary) | index.md |
| [architecture.md](architecture.md) | Canonical high-level architecture: logical, runtime, dependency, data, control, trust, governance | "How is the system structured?" | Explanation/Architecture | index.md, glossary.md |

## Interactive explainers (`explainers/`)

| Page | Purpose | Key affordance | Prerequisites |
| --- | --- | --- | --- |
| [explainers/index.md](explainers/index.md) | Explainer catalog and cognitive architecture index | Overview of interactive models | index.md |
| [explainers/affordance-navigation-simulator.html](explainers/affordance-navigation-simulator.html) | Live affordance evaluation laboratory | Toggle 7 gates, test blocker ordering, simulate intent commit and stale frame attacks | navigation.md |
| [explainers/world-debugger-workbench.html](explainers/world-debugger-workbench.html) | Seven-operation world debugger console | Interrogate projections, enforce query bounds, inspect 5 honest epistemic labels | world-debugger.md |

## Subsystems (`subsystems/`)

| Page | Concepts owned | Prerequisites |
| --- | --- | --- |
| [semantic-world.md](subsystems/semantic-world.md) | world_ref, semantic world, DomainForge pinning, semantic capability | architecture.md |
| [navigation.md](subsystems/navigation.md) | navigation frame, intents, affordance gates, Case, frame register, attempt audit | architecture.md |
| [operational-objects.md](subsystems/operational-objects.md) | operational objects/links/lineage, projections, checkpoints, tenant partitioning, rebuild | navigation.md |
| [world-debugger.md](subsystems/world-debugger.md) | the 7 debugger operations, value classes, bounds policy | operational-objects.md |
| [surfaces-and-transports.md](subsystems/surfaces-and-transports.md) | SurfaceV2 grammar, binding, reduction/attribution, GUI view, sequential session, MCP derivation, equivalence | navigation.md |
| [context-kernel-retrieval.md](subsystems/context-kernel-retrieval.md) | untrusted_reference, CK transport, distinct retrieval outcomes | world-debugger.md |
| [research-subsystem.md](subsystems/research-subsystem.md) | horizon.research/1, health probe, typed degradation | architecture.md |

## Follow execution

| Page | Purpose | Type |
| --- | --- | --- |
| [workflows.md](workflows.md) | Startup, frame→session, intent commit, inspection, verification gates — end to end | Workflow |

## Understand why

| Page | Purpose | Type |
| --- | --- | --- |
| [explanation.md](explanation.md) | Design rationale: frozen artifacts, one-frame-many-renderers, unknown vs blocked, refusals-as-events, labelled values, fail-closed, single store, vendoring | Explanation |

## Get something done

| Page | Purpose | Type |
| --- | --- | --- |
| [how-to.md](how-to.md) | Run, test, verify frozen artifacts, extend (block types, operations, capabilities, projections, debugger ops), regenerate artifacts | How-to |

## Look something up

| Page | Purpose | Type |
| --- | --- | --- |
| [reference.md](reference.md) | CLI verbs, config keys, env vars, just targets, schemas, store layout, HTTP routes, error taxonomy | Reference |
| [source-map.md](source-map.md) | Concept → implementation location map | Reference (traceability) |
| [troubleshooting.md](troubleshooting.md) | Symptom-driven diagnosis | How-to (troubleshooting) |

## Historical

| Page | Purpose |
| --- | --- |
| [topology.md](topology.md) | T04 freeze-time formation record (superseded by architecture.md for current truth) |
| [donors.md](donors.md) | Donor attribution and licenses |

## Rules this map enforces

- One canonical home per concept; other pages link instead of restating.
- `README.md` is vision, `AGENTS.md` is governance, `.sea/` + `ui-model/` + `behavioral/`
  are canonical sources — never copied into these pages.
- Update this map whenever pages are created, moved, split, merged, or removed.
