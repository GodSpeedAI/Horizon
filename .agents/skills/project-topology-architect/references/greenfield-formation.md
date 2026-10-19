# Greenfield Formation — P0–P3, P6–P7 Detail

Load this reference when working a **greenfield / scaffold** run. It details only the
greenfield phases in the master workflow; the master workflow's phase list and the
invariants in `SKILL.md` govern. This file is procedural detail, not a second workflow.

Compose the bundled skills by reading their own SKILL.md; never re-implement their
grammar, CLI, or derivation method here. Freezing, criticism, and the Wayfinder live in
[gauntlet-formation-freeze](gauntlet-formation-freeze.md); verification structure and gates
in [verification-topology](verification-topology.md); ledger mechanics in
[requirement-ledger](requirement-ledger.md); the `AGENTS.md`/`.agents/` conventions in
[agents-workbench](agents-workbench.md). Hold the invariants stated in `SKILL.md` §1 and
echo them in every artifact you generate.

## P0 — Orient, gather, pin the ruler

1. Inventory every supplied input. Classify each item as exactly one of:
   - **Specification** — the normative ruler. What must be true. Highest normative weight.
   - **Plan** — the route. An intended implementation order or approach; subordinate to the
     spec where they conflict.
   - **Supporting evidence / projections** — use cases, user stories, workflows, domain
     descriptions, API descriptions, screen descriptions, architecture notes, reference
     material. Never treat these as normative; they are the raw material for semantic
     formation and verification arguments.
2. Identify gaps: is there a spec, a plan, both, or neither? Record the answer in the
   run's intake notes and in `.agents/OPEN_QUESTIONS.md` when the gap is materially
   important (see step 3).
3. Record **unresolved, materially important contradictions** verbatim in
   `.agents/OPEN_QUESTIONS.md` with a pointer to each side's source. Do not silently
   resolve them. A contradiction is materially important when a defensible choice in one
   direction changes freeze surfaces, shape, or external behavior.
4. For **reversible decisions**, pick a defensible minimum, record the choice and its
   reason, and continue. Reversible = a change of mind costs little and does not touch a
   frozen surface.
5. Do **not** freeze a ruler whose unresolved ambiguity makes it materially untrustworthy.
   When the specification cannot be read deterministically on a point that other
   components will depend on, escalate to the user rather than fabricate a reading.
6. Pin the ruler before forming semantics or topology. Freeze semantics describes what
   must hold, not how it is built — see [topology-principles](topology-principles.md).

**Failure modes, P0.** Silent resolution of a material contradiction (produce a
`CandidateRevision` or escalate, do not guess). Freezing an untrustworthy ruler. Missing
the distinction between spec and plan and collapsing a route into a normative claim.
Classifying use cases/stories as canonical entities before semantic formation (see P1).

## P1 — Semantic formation

Apply only when the source contains a **purposeful interaction surface** — actors
engaging the system to settle something they care about.

1. Follow the chain exactly:

   > source evidence → `deriving-interaction-domain-models` → canonical interaction/domain
   > representation → `domainforge-sea` → validated `.sea` in the project-local `.sea/` area

2. Load `deriving-interaction-domain-models`' SKILL.md and follow it. It owns the use-case
   to canonical-model method; do not invent an alternative derivation.
3. Author the `.sea` with `domainforge-sea` and validate with the `domainforge` CLI. The
   `.sea` DSL and CLI are that skill's authority; this reference does not restate them.
4. Treat use cases, stories, screens, API descriptions, workflows, and plans as **source
   evidence / projections** — inputs to derivation, never automatically canonical domain
   entities.
5. **Skip rule.** Skip `.sea` formation entirely when there is no purposeful interaction
   surface: pure infrastructure, libraries, tooling, CLI plumbing with no domain actor
   contract. Do not force semantics onto a substrate that has none. Say so explicitly in
   the topology record and in `.agents/OPEN_QUESTIONS.md`-adjacent notes if anyone might
   expect semantics: one sentence, three-part: which evidence was considered, why none of
   it forms a purposeful interaction surface, and the consequence (no `.sea`/canonical
   model; topology derives from spec + plan + ecosystem directly).
6. When `.sea` is skipped or absent, P2 derives topology from spec + plan + language
   ecosystem + toolchain + constraints + deployment intent alone.

**Failure modes, P1.** Generating a `.sea` for a pure infrastructure project. Elevating a
story/use-case/API description to a canonical entity without derivation. Duplicating
`deriving-interaction-domain-models` or `domainforge-sea` method content into this
reference or into generated artifacts.

## P2 — Derive the software topology

Derive the **minimum useful topology** — not a template. Inputs: spec, plan, `.sea`
(if formed), language ecosystem, toolchain, constraints, deployment intent.

1. Derive the component units: packages / crates / modules / services. Justify every unit
   by a seam demanded by semantics (a domain boundary), an engineering constraint (build,
   deploy, trust), or a verification need (a boundary that must be provable). A unit with
   none of these reasons is architecture theater.
2. State **dependency direction** as a small set of rules (e.g. domain depends on nothing;
   adapters depend on ports; everything points inward). Record the rules; a cold actor can
   replay them.
3. Identify the public types and **freeze surfaces** — the set of interfaces whose change
   alters another component's expectations:
   - public API schemas, request/response contracts;
   - domain ports / interfaces (what the domain expects from the outside);
   - event schemas and message contracts;
   - cross-package / cross-crate / cross-service signatures;
   - externally observable interfaces (CLI, HTTP, file formats, network protocols).
   Freeze or strongly stabilize these. Record them in the ledger as frozen surfaces
   ([requirement-ledger](requirement-ledger.md)).
4. Do **not** freeze: helper-function signatures, private algorithms, internal data
   structures, local module decomposition. Leave implementation freedom inside the frozen
   bounds.
5. Derive the operational seams: persistence seams, transport seams, their adapters, and
   the composition roots that wire concrete adapters to domain ports.
6. Derive configuration structure (typed, schema'd — never config-as-prose), test
   fixtures, integration harnesses (reach real component boundaries), and the E2E harness
   (reach the application through its intended external surface).
7. Give every major structural artifact a **reason** traceable to semantics, an
   engineering constraint, or a verification need. Write reasons beside the artifact (in
   the topology record / ledger), not in a separate document that will drift.
8. Validate the result against over-engineering (see Decision rules) before building.

**Failure modes, P2.** Deriving from a directory template instead of from the work.
Freezing private decomposition and then needing to change it. Boundaryless design where a
verification or deployment seam existed. Unjustified packages/services added for novelty.

## P3 — Executable walking skeleton

Not folders-and-signatures. Prove the architecture composes by building a thin vertical
slice that executes end-to-end.

1. Prove, in this order, only what can be proven by executing:
   - dependencies/imports resolve; public signatures agree; type relationships compile;
     dependency-direction rules hold (deterministically — see `just boundaries`);
   - configuration loads; composition roots construct; adapters satisfy their contracts;
     test fixtures initialize;
   - databases / test containers initialize; processes/services boot; routes / commands /
     events register;
   - integration harnesses reach real component boundaries;
   - the E2E harness reaches the application through the intended external surface.
2. Prefer a **trivial infrastructure vertical route**: health/readiness, or a minimal
   persistence round-trip (write → read through the real stack). Do not implement a large
   share of business behavior to demonstrate topology; behavior is the work later phases
   and future agents should own.
3. Apply `neatcode` discipline to every piece of generated implementation code. Generated
   code must be boring, conventional, and reviewed by its toolchain, not clever.
4. **Honesty guard (never false-green).** Structure must settle before handoff: at handoff
   there is **no unexplained structural red**. Failures that remain must be explicit
   unsatisfied behavioral obligations — red by honest absence, not by broken wiring, mock
   echo-chambers, or scaffold misassembly.
5. Record observed observations only. A local test proves the local composition; it never
   claims real-world consequence ([verification-topology](verification-topology.md)).
6. Wire task-scoped gates so unsatisfied behavioral requirements can exist red without
   breaking the baseline structural pass.

**Failure modes, P3.** Signatures-and-folders with nothing that runs. Mock-only E2E whose
assertions assert each other. Business-behavior bloat in the skeleton. Shipping with a red
structural E2E and a story about why.

## P6 — Generated operating surface

Emit the durable router and workbench. Keep it a **router**, never a dump.

1. Root `AGENTS.md`, twelve concise categories, each a few lines pointing at truth:
   1. identity/priorities; 2. repository map; 3. dev loop; 4. build/validation;
   5. code conventions; 6. testing strategy; 7. documentation conventions;
   8. architecture/boundaries; 9. security/privacy; 10. git/change policy;
   11. operational constraints; 12. task completion criteria.
   Do not pour skills, plans, or history into it. Where a category has a home elsewhere,
   link. Exact editorial rules: [agents-workbench](agents-workbench.md).
2. `.agents/` durable workbench: `CURRENT_STATUS.jsonl` (append-only, one complete
   snapshot per line) plus its `CURRENT_STATUS.md` human mirror, `OPEN_QUESTIONS.md`,
   `DEBT_OBSERVED.md`, plus the **minimum applicable subset** of
   `specs/ plans/ skills/ roles/ reports/ evidence/ lessons/`. Never create empty
   directories. One home per fact — route to the canonical spec rather than duplicating
   it. `.agents/AGENTS.md` documents the workbench's maintenance invariants including
   the status protocol: `tail -n 1` reads latest, append one line with higher `revision`
   and full snapshot fields, mirror the `.md` in place in the same change.
3. Structured machine config: TOML / YAML / JSON / ecosystem-native for durable
   machine-consumed behavior (build, lint, test, format, CI, verification wiring). `.env`
   only for environment-local values and secrets, and never committed. Never
   Markdown-as-config. Prefer a config file over proliferating CLI flags. Never hardcode
   machine-specific absolute paths, model names, or local ports — use portable paths
   (`${CLAUDE_PLUGIN_ROOT}` for plugin-internal).
4. Validate the substrate against the plugin's `scaffold-check.py` (AGENTS.md, `.agents/`,
   `justfile`, structured config, verification map) where the run is expected to hold that
   standard.

**Failure modes, P6.** An `AGENTS.md` that is a context dump instead of a router. Empty
`.agents/` subdirectories created for symmetry. Duplicated specs in workbench when the
canonical spec lives elsewhere. Config duplicated in prose and in files (one home per fact
binds here too).

## P7 — The `just` operational surface

1. Derive recipes from the **actual ecosystem** of the project (its real build system, its
   real tools), never from a generic template.
2. Provide the core concepts, with task-scoped variants:
   - `just setup`, `dev`, `build`, `check`, `fmt`, `lint`;
   - `just test` plus `test-unit`, `test-integration`, `test-e2e`;
   - `just boundaries` (deterministic dependency-direction / boundary check);
   - `just verify` (the task/requirement-scoped verification gates, per
     [verification-topology](verification-topology.md));
   - `just clean`; requirement/task-specific gates added as work appears.
3. Recipe discipline — recipes **compose ecosystem-native tools**, they never replace
   them, and they stay thin. A recipe is a route, not a wrapper that hides the underlying
   tool's flags.
4. Target narrow loads: `just <task>` should carry a bounded context, not a whole-project
   dump.
5. Acceptance test: a cold actor runs `just --list` and gets a usable, self-explanatory
   map of the project's operations. If `--list` does not teach the shape of the work,
   refine the recipe names and doc-comments.

**Failure modes, P7.** Recipes that reimplement tools the ecosystem already provides.
Flags proliferated in shell instead of one config file. A `--list` that reads like a prose
essay. Ports, model names, or machine paths baked into recipes.

## Decision rules and failure modes, greenfield

- **Spec-too-vague rule.** If the specification cannot be read deterministically on a
  point other components depend on, do not freeze it. Record the block in
  `OPEN_QUESTIONS.md` and ask the user. Freezing an untrustworthy ruler is worse than a
  visible open question.
- **Over-engineering guard.** Before adding any structure — package, boundary, seam,
  abstraction, harness, config knob — answer "which semantics, constraint, or verification
  need forces this?" No answer means drop it. Minimum sufficient structure is a hard
  invariant, not a preference.
- **Skip-`.sea` rule.** No purposeful interaction surface → no `.sea`. Pure
  infrastructure skips semantic formation; say so in one explicitly recorded sentence.
- **Template-imposition warning.** Never impose a directory/package template on a project.
  Structure derives from the work — its semantics, constraints, and verification needs —
  not from a scaffold the architect happens to know. A topology that looks identical to
  the last three projects simply for familiarity is a failure signal.
- **Walking-skeleton honesty guard.** The skeleton is honest only when it runs end-to-end
  through real boundaries: real config, real adapters, real containers, real external
  surface. If the E2E harness would not reach the intended surface without a mock, the
  skeleton is not built yet.
- **Operating-surface bloat warning.** Do not create empty directories or gratuitous
  files in `.agents/`, `references/`, `docs/`, or anywhere else. Every file must earn its
  reason, and one home per fact forbids duplicating content that belongs in the spec,
  ledger, or the primary skill's references.
- **Red is fine; broken wiring is not.** At handoff, every remaining red must be an honest
  unsatisfied behavioral obligation — never an unexplained structural red, and never a
  green bought with mock echo-chambers.
- **Ruler damage during work** is a `CandidateRevision`, not a silent re-freeze
  ([gauntlet-formation-freeze](gauntlet-formation-freeze.md)).