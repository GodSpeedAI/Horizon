# Topology principles

The "why" behind Project Topology Architect. Load this reference when a phase decision
needs grounding in first principles, when you are about to add a structural artifact, or
when the plan's justification is thin. It generalizes the scheme; the phase references
carry the procedure.

## 1. What "project topology" means

"Project topology" is the set of structural, contractual, and routing facts of a
repository that let an actor:

- **find truth** — locate the canonical source for any fact, requirement, or decision;
- **place work** — know where a given change belongs and which boundaries it must respect;
- **understand connections** — read component boundaries, dependency direction, and
  contracts without reconstructing the whole system;
- **know what may change** — distinguish frozen surfaces from open implementation;
- **run operations** — discover and execute setup, build, check, test, and verify steps;
- **verify correctness** — find the narrowest proof for a change and run it;
- **prove progress** — tell whether a requirement has settled from recorded evidence.

A good topology is cheap to navigate, minimally ambiguous, and truthful about its own
frozen/mutable split. It encodes durable decisions once so that every later actor —
especially cold ones — does not re-derive them.

## 2. The compiler analogy

A task runner externalizes recurring **operational** knowledge. Remembering
"command + arguments + ordering" once into `just test` lets every actor stop re-finding
how to run the checks. It compiles a procedure into a name and a repeatable surface.

Project Topology Architect does the same for **project-navigation and architectural**
knowledge. Instead of re-running the expensive cognition on every visit, externalize it
once:

> reconstruct repository + infer boundaries + locate canonical truth + infer applicable
> instructions + discover verification
>
> → becomes a directly reachable work/proof surface

The operating model:

1. **Strong-model reasoning once.** Derive the semantic model, the topology, the
   contracts, the verification graph, the frozen surfaces — the durable judgment.
2. **Externalize.** Write that reasoning into structure, semantics, contracts, and
   verification artifacts that live in the repository.
3. **Freeze the target.** Pin the ruler, the acceptance contracts, and the Wayfinder
   evaluation projection.
4. **Hand to cheaper agents.** Delegate bounded implementation inside the frozen envelope
   until the software settles against it.

The expensive reasoning is spent once and amortized across every later cheap run. A
topology that requires each agent to think at full depth again is a topology that failed
to compile.

## 3. Optimization targets

State each goal with its rationale, then decide if every structural choice moves one.
If an artifact advances none of these, it is architecture theater.

- **Low navigation burden.** Fewer files an actor must inspect to act. Rationale: each
  inspection costs tokens, time, and misreading risk.
- **Low irrelevant context consumption.** Loading a narrow surface (`just <task>`) instead
  of a whole-project dump. Rationale: cheap agents stay cheap only if their context stays
  bounded.
- **Low ambiguity.** One reading per fact, no duplicated truth, no overlapping
  responsibility. Rationale: ambiguity converts to false-green risk or wasted cycles.
- **Explicit canonical truth.** Every fact has a named home and links point to it.
  Rationale: actors cannot invent divergent truth when the home is stated.
- **Explicit subsystem responsibility.** Each component's obligation is recoverable, not
  inferred. Rationale: responsibility disputes and boundary drift disappear.
- **Explicit dependency direction.** Boundaries say which way dependencies flow.
  Rationale: prevents the silent cycle formation that corrodes architecture.
- **Explicit verification.** The proof command for each requirement is discoverable.
  Rationale: unverifiable work cannot settle, and undiscoverable proofs cost search.
- **Small stable routing surfaces.** A concise router that rarely changes.
  Rationale: actors memorize the surface; churn in it is navigation cost for everyone.
- **Recoverable agent work.** Current status, open questions, and observed debt live in
  durable `.agents/` state. Rationale: a cold actor resumes rather than replays history.
- **Bounded implementation affordances.** Mutable surfaces are open; frozen surfaces are
  closed. Rationale: freedom inside stable interfaces is the working product.

## 4. Design principles

Each principle is an imperative with a why and a how. Apply them at decision time.

- **Establish one home per fact.** Why: multiple homes produce divergent truth and
  reconciliation cost. How: place the fact once in the canonical artifact; everywhere else
  use a relative link, never a copy.
- **Keep routing surfaces small and stable.** Why: actors depend on the router; its churn
  is navigation cost for every agent. How: keep `AGENTS.md` and `just --list` concise and
  category-stable; route to detail, never carry it.
- **Make context locality explicit.** Why: bounded loads are what make cheap agents
  cheap. How: expose narrow entry points per task/component and keep them named and
  discoverable.
- **Assign explicit structural responsibility.** Why: unstated responsibility is inferred
  differently per actor. How: name each subsystem's obligation at its boundary and in the
  router's architecture section.
- **Use minimum sufficient structure.** Why: each artifact costs creation, maintenance,
  and reading; unneeded structure is noise. How: add structure only when it traces to
  semantics, an engineering constraint, or a verification need.
- **Separate durable reference from transient work state.** Why: mixing them forces
  actors to guess what is authoritative. How: canonical specs/plans/contracts live apart
  from `.agents/` working state; sync status between the two deliberately.
- **Freeze semantics, not implementation.** Why: freezing internals strangles evolution
  while failing to stabilize what others rely on. How: pin public schemas, domain ports,
  and observable contracts; leave private decomposition open.
- **Derive structure from actual work, not imposed templates.** Why: applied templates
  carry shape that fits nothing; derived shape fits the work. How: derive boundaries from
  the spec, plan, domain model, ecosystem, and deployment intent.
- **Shape the error surface for bounded, diagnosable failure.** Why: an unbounded error
  surface ("143 tests failed") is useless to a cheap agent. How: gate tasks so failures
  localize, identify the violating obligation, and name the next action.
- **Make cold-agent navigability a first-class property.** Why: the topology's whole value
  is that an unprepared actor lands on truth and proof cheaply. How: run the cold-agent
  evaluation and fix what the walk reveals.
- **Keep human-editable artifacts human-editable; otherwise use structured config.**
  Why: prose duplicates and decays; machine-consumed state in Markdown is unparsable.
  How: Markdown/TOML only where humans edit, structured YAML/JSON/TOML plus tooling (and
  `just`) where machines consume.

## 5. Deliberate non-principles

Project Topology Architect is defined as much by what it is not. These ideas from the ICM
lineage and common practice are retired as governing ontology — they may appear as
incidental implementation details, never as the default architecture:

- **Numbered folders as the default architecture.** The topology derives from the work,
  not from a folder numbering scheme.
- **A CONTEXT.md in every folder.** Context is provided by the router and local
  instructions where a real reader needs them; a uniform context file per folder is
  machinery without purpose.
- **Markdown as the state machine.** Durable machine-consumed state is structured config
  and scripts; Markdown tracks intent, not transitions.
- **Human approval after every stage as a universal requirement.** Ask only where the
  answer materially corrupts the ruler; otherwise record a defensible minimum and proceed.
- **A sequential pipeline ontology.** The workflow is a guided decomposition, not a rigid
  stage machine every project must transit end to end.
- **The six ICM workspace forms as the governing classification.** Lineage is preserved in
  [icm-lineage.md](icm-lineage.md); it does not organize new projects.
- **Claude-specific CLAUDE.md as the default project instruction surface.** The router is
  an agent-universal `AGENTS.md`; CLAUDE-only content stays out of the substrate's default
  navigation surface.
- **Markdown where TOML/YAML/JSON/executable tooling is more appropriate.** Configuration
  is parsed and validated, not read tolerantly.

## 6. Boundaries

This plugin does **not** do the following. Do not let a generated substrate drift toward
them:

- **Multi-agent orchestration.** Sequencing, coordinating, or supervising agent runs is
  out of scope; this plugin prepares a repository for any bounded actor.
- **Generic project generation.** No universal folder template or empty scaffolding
  business; structure is derived per project from its actual sources of truth.
- **Universal folder template.** See above — there is no one correct layout.
- **DomainForge / SEA-Forge.** `.sea` formation and validation are the bundled
  `domainforge-sea` skill's and the `domainforge` CLI's domain. This reference does not
  restate them; only composes their output.
- **Replacing task runners.** `just` composes ecosystem-native tools; it never substitutes
  for them ([greenfield-formation](greenfield-formation.md)).
- **Replacing build systems.** Advanced build orchestration is out of scope; `just` exposes
  the ecosystem's own commands.
- **Markdown-based configuration framework.** No config-behavior encoded in prose; durable
  behavior is structured and tool-validated ([agents-workbench](agents-workbench.md)).

## 7. Failure modes

Anti-patterns to catch during formation and audit ([brownfield-restructuring](brownfield-restructuring.md)
describes the inventory that finds them):

- **Truth scattered across duplicates.** The same fact in N homes, diverging over time.
  Fix: collapse to one home, link elsewhere.
- **Giant routing files carrying payload.** The router grows until it is a whole-project
  dump. Fix: keep the router a stub that points to detail.
- **Speculative depth.** Structure created for subsystems no work touches yet. Fix: apply
  minimum sufficient structure; grow only on evidence.
- **Private implementation frozen by habit.** Internal surfaces pinned alongside public
  contracts. Fix: freeze semantics and interfaces only; leave internals open.
- **Architecture theater.** Artifacts that trace to no semantic, constraint, or
  verification need. Fix: require the trace or delete the artifact.
- **Verification debt disguised as tests.** Mock-mock agreement, empty assertions, or a
  harness that proves wiring only. Fix: apply the four proof kinds and keep structural E2E
  green before handoff — see [verification-topology](verification-topology.md).
- **False-green claims.** Reporting settlement without the gate passing and evidence
  recorded. Fix: never claim a requirement settled without observed proof; keep
  unimplemented behavioral obligations honestly red.

Cross-cutting reminder: deterministic machinery is scripted
([requirement-ledger](requirement-ledger.md), [gauntlet-formation-freeze](gauntlet-formation-freeze.md));
semantic judgment is model reasoning and stays in the model.