# Horizon glossary

Repository-specific terms. Each entry says what the term means here, what it does *not*
mean where confusion is likely, and where it lives in the implementation.

---

## World and identity

**World / `world_ref`**
The immutable semantic model of the application domain, compiled by DomainForge from
`.sea/interaction/interaction-model.sea`. Its identity is DomainForge's
`semantic_closure_hash`, surfaced as
`world:horizon@sha256:6c18d6a6…309f0`. Horizon asserts this exact value at boot
(`src/adapters/semantic.ts`) and in `just gate-t01` (`scripts/world-ref.py`).
*Not:* a database, a mutable graph, or anything Horizon itself can rewrite. A mismatch is
a startup failure, never a silent adoption of a different world.

**Cognate world**
The Cognate runtime's own registered world for events/store; Horizon prints both refs at
startup (`src/main.ts`). Related to but distinct from the DomainForge `world_ref`.

**Semantic world**
The in-memory projection of the canonical `.sea` source map loaded via Cognate's
`loadSemanticWorld` (`src/adapters/semantic.ts`). Served read-only through the
`horizon.semantic.world` capability.

## Navigation

**Navigation frame (`NavigationFrameV1`)**
A versioned, deep-frozen snapshot of the present decision: observer, focus, checkpoint,
optional case, assessed choices with gate verdicts, view mode, settlement judgment
(`src/domain/frame.ts`, `src/domain/navigation.ts`). Once issued it never changes; a new
situation yields a *new* frame via `reviseNavigationFrame`.

**Intent**
A typed, role-bound choice (`CommitNavigationIntent`, `src/domain/intent.ts`) validated
against the frame that issued it. Stale or unknown frame → typed refusal plus an audit
attempt event (`src/capabilities/navigation-intent.ts`).

**Affordance gates**
The seven verdict families assessed for every candidate operation: `visibility`, `reach`,
`payment`, `authority`, `capability`, `recovery`, `settlement_access` (`GATE_KEYS`,
`src/domain/navigation.ts`). Evaluated to `available`, `blocked`, `unknown`, or `conflicted`
(`AffordanceStatus`) — these are *distinct* states, never merged.

**Possibility ≠ affordance**
An operation can exist in the world yet be blocked (missing authority, evidence, or
affordability). Horizon refuses to render a possible-but-unaffordable operation as
available.

**Consequential operation**
An operation whose execution changes the world irreversibly or spends something
(`isConsequential`, `src/domain/navigation.ts`, mirrored in the surface grammar). These
require preflight, authority binding, evidence, and recovery semantics. Direct reads need
none of this.

**Case (`DerivedCase`)**
A purpose-relative derived view over authoritative facts plus declared direction
(`deriveCase`, `src/domain/navigation.ts`). *Not:* a container of truth, an identity
source, or a competing ontology. A Case references `world_ref`; it does not mint identity.

**Navigation frame vs Case vs checkpoint**
The frame is *the decision now*; the Case is *the purpose across decisions*; the
checkpoint is *where the data was read from*. They are separate references and Horizon
never conflates them.

## Operational layer

**Operational object / link / lineage (`*V1`)**
Typed runtime rows with provenance (`src/domain/operational.ts`), projected from events
into tenant-partitioned SQLite rows (`src/projections/operational-objects.ts`). Declared
world and declared relation types are enforced: undeclared relations are refused by name.

**Event-sourced projection**
All durable state lives in one SQLite store (`config/horizon.toml` → `runtime_store`,
default `.cognate/app.sqlite`); projections are derived views with checkpoint positions
and can be rebuilt from events (tested in `test/operational-objects.test.ts`).

**Checkpoint / composite checkpoint**
A read position in a projection stream (`parseCheckpointRef`, `formatCheckpointRef`,
`src/domain/operational.ts`). Reads name the checkpoint used; cross-checkpoint
comparisons record it in `scope.comparison` and never rewrite the frame's own checkpoint.

## Surfaces and rendering

**Surface (`SurfaceV2`)**
A validated, closed declarative composition: 15 block types (metric, callout, table,
tree, timeline, graph, chart, compare, media, document, entity, preflight, progress,
ask, form — with hard size limits), actions, provenance, and actor attribution
(`src/ui/surface2/grammar.ts`). The grammar is closed: unknown block types, executable
markup, and unattributed agents are refused at parse time.

**Actor attribution / reduction**
Every block and action carries an actor (`human`, `agent`, `system`). The reducer
downgrades agent-composed material: agent-owned blocks cannot claim human authorship, and
consequential operations offered by agents require human preflight
(`src/ui/surface2/reducer.ts`). The observer's pinned layout cannot be stolen by a
background agent update.

**Source binding**
The typed connection between a surface block and the value it displays
(`src/ui/surface2/binder.ts`). File-backed bindings are restricted to allowed roots
(realpath-checked) and size-bounded; refusals are typed (`refused`, `blocked`, `observed`).

**GUI view (`GuiView`)**
The projection of a surface into nodes/actions for HTML and MCP rendering
(`src/ui/surface2/project.ts`). One surface, three transports — text, HTML, MCP tools —
with cross-transport equivalence enforced by `teeth-t05-equivalence`.

**Sequential session / Clack renderer**
The one-question-at-a-time terminal experience (`src/ui/sequential/controller.ts` over a
vendored OpenTUI terminal kit, `src/ui/sequential/vendor/terminal-ui/`). The renderer
*records* typed intents; it never executes them (`src/main.ts` boundary).

**Workspace**
The server-rendered GUI page composed of fixed regions — attention, evidence inspector,
lineage graph, debugger answer, retrieval citations, choices, actions
(`src/ui/workspace/model.ts`, `render.tsx`). Region order and titles are fixed; the
observer's focus cannot be hijacked.

## Knowledge and evidence

**Value classes (debugger)**
Every debugger answer value is labelled: `recorded` (in the projection), `derived`
(computed), `unknown` (with the source that records nothing), `effect` (downstream
consequence), `untrusted_reference` (citation only) — `src/domain/debugger.ts`.

**Untrusted reference**
A Context Kernel citation. Horizon — never the kernel — assigns this class, so a
retrieved instruction can inform but never authorize or execute anything
(`src/capabilities/context.ts`).

**Context Kernel (CK)**
The external retrieval subsystem, reached only through the boot-registered
`horizon.context.query_reference` capability over a subprocess JSON-line transport
(`src/adapters/context-kernel.ts`). Denied, unavailable, and no-match are three distinct
observations.

**Behavioral IR / canonical journeys (J01–J06)**
Renderer-neutral interaction proofs derived from the canonical `.sea` model
(`behavioral/journeys/*.yaml`, proven by `behavioral/proof/`). Six journeys: explore,
operate, build, monitor, compare, develop. Canonical definitions:
`.sea/interaction/canonical-journey-catalog.md`.

**Atomic UI IR**
Renderer-neutral interface responsibilities (elements/groups/regions/views) projected
from proven behavior (`ui-model/`), with `forbidden_policy_keys` that make local
rendering policy (e.g. `enabled_when`, `is_authorized`) structurally illegal.

## Governance (this repository's distinctive machinery)

**Spec / plan / ruler**
`.agents/specs/horizon.agent.spec.yaml` (HORIZON-001, frozen v1.0.1) says what must be
true; `.agents/plans/horizon.plan.yaml` (HORIZON-PLAN-001) says in which order tasks may
settle. The spec wins on conflict (e.g. the J01–J05 vs J01–J06 count is resolved by the
spec: six journeys).

**Frozen vs mutable surfaces**
Frozen inside a run and across tasks: `.agents/specs/**`, `.agents/plans/**`,
`.agents/prereg/**`, `requirements/ledger.yaml`, `.wayfinder/answer-key.md`, the canonical
`.sea` after freeze, `scripts/ledger-policy.yaml`. Mutable: `src/**`, `test/**`,
`scripts/**`, `research/**`, `config/**`, `justfile`, `docs/**`.

**Requirement ledger / Wayfinder**
`requirements/ledger.yaml` — generated projection of every spec requirement with its
semantic binding, acceptance criteria, proof commands, and settling tasks.
`.wayfinder/answer-key.md` — the formation evaluation generated from the ledger. Both are
*generated* (`scripts/gen-requirement-ledger.py`, `scripts/gen-wayfinder.py`), freeze-hash
verified, and never hand-edited.

**Preregistration**
Task-scoped expectations written before implementation (`.agents/prereg/horizon/T*.yaml`),
shape-checked (`scripts/check-prereg-shape.ts`) and coverage-checked (each expectation
must be named by a test that names its anchors) before a gate can pass.

**Teeth**
Adversarial tests separate from coverage tests: a tooth asserts the *typed refusal* (and
usually that navigation still answers), and a mutation runner proves each tooth actually
bites by breaking the protected property and requiring failure. Coverage proves linkage;
mutation proves strength; neither stands for the other.

**P2 / P3**
Proof levels. P2 = builder-verifying with adversarial teeth and mutation. P3 = *fresh
independent/adversarial confirmation* by a party other than the builder. As of T10, P3 is
not yet claimed for recent tasks (`.agents/CURRENT_STATUS.md` limits).

**Settlement**
A requirement becomes settled only when its gate command, teeth, and applicable global
gates pass and evidence is recorded. Code existing is never settlement.

**Walking skeleton (T04)**
The first end-to-end thin slice (config → world load → capability → intent → projection →
server) whose freeze (`T04-CR-001`) pinned the substrate; its verification remains part of
every later gate via the `verify` prerequisites.
