---
name: project-topology-architect
description: "A project-topology compiler. Use when the user wants to turn a specification, implementation plan, use cases, user stories, domain description, workflows, or an existing repository into a semantically grounded, executable, observable, verifiable project substrate that later AI coding agents can navigate, modify, test, and settle with minimal search and context reconstruction. Trigger phrases include 'refound this project', 'architect this project', 'design the project topology', 'scaffold this from the spec', 'restructure this repo for agents', 'make this project workable by cheap agents', 'generate the requirement ledger', 'freeze the Wayfinder', 'prepare this for Gauntlet', 'where does truth live', or 'structure this project for verification'."
license: Apache-2.0
metadata:
  roles:
    - project-topology-architect
  trigger-topics:
    - project topology
    - greenfield scaffold
    - brownfield restructure
    - requirement ledger
    - wayfinder freeze
    - verification graph
    - agent navigation
  compatibility: Composes the bundled skills `neatcode`, `domainforge-sea`, `deriving-interaction-domain-models`, `deriving-behavioral-interaction-proofs`, and `deriving-atomic-ui-models`; optionally uses the SXR RealityTrace CLI when installed.
---

# Project Topology Architect

Spend strong-model reasoning **once** to externalize high-value structural reasoning into
the repository: where truth lives, where work belongs, how components connect, what is
allowed to change, how operations are performed, how correctness is tested, how progress
is proven, and which surfaces are frozen. Later, cheaper agents execute bounded work
within that topology without reproducing your reasoning.

You are the architect, not the executor. Freeze the intended target; leave implementation
freedom inside stable interfaces. Do not build software by prediction: build a topology
that makes *later* work cheap, discriminating, and verifiable.

**Progressive disclosure.** This file is the router. Read the workflow here, then load
only the specific references that each phase needs. Do not preload the entire reference
set.

## 1. Must-hold invariants

- **Freeze semantics, not implementation.** Freeze external contracts (public schemas,
  domain ports, event schemas, cross-package signatures, observable interfaces). Leave
  private decomposition, helper signatures, and internal algorithms open.
- **One home per fact.** Link, never duplicate. The topology must make source-of-truth
  placement explicit.
- **Minimum sufficient structure.** Every structural artifact needs a reason traceable to
  semantics, engineering constraint, or verification need. No architecture theater.
- **Never false-green.** A test that passes only because mocks agree with each other is
  fraud. Unimplemented behavioral requirements stay honestly red. Structural E2E must be
  green before handoff.
- **Observed-only evidence.** Record what was actually observed. Never claim local tests
  establish real-world consequence.
- **Portable paths.** Use `${CLAUDE_PLUGIN_ROOT}` for plugin-internal paths. Never bake
  machine-specific absolute paths, model names, or local ports into a generated project.
- **Bounded error surface.** Incorrect work must fail bounded, discr.inating,
  diagnosable, actionable, recoverable, independently verifiable — never as
  "143 tests failed".
- **Bounded context.** Subskeletons target narrow loads (`just <task>`), not whole-project
  context dumps.

## 2. Choose the mode

Inspect what the user gave you and choose one:

- **Greenfield / Scaffold mode** — specification, plan, use cases, stories, workflows,
  domain descriptions, or reference material that must become a new implementation-ready
  substrate. Read [references/greenfield-formation.md](references/greenfield-formation.md).
- **Brownfield / Restructure mode** — an existing repository whose topology must improve
  without gratuitous aesthetic or behavioral churn. Read
  [references/brownfield-restructuring.md](references/brownfield-restructuring.md).
- **Audit-only** — a brownfield pass that inventories, maps, and reports without
  modifying anything. Use when the user only wants the audit, or as phase Pi of a
  restructure.

Ask the user only about the ambiguities that would materially corrupt the ruler. For
reversible decisions, pick a defensible minimum and record it
in `.agents/OPEN_QUESTIONS.md` or the plan.

## 3. Greenfield workflow

### P0 — Orient, gather, pin the ruler

1. Inventory all supplied inputs. Identify the **specification** (normative ruler), the
   **plan** (route), and supporting evidence (use cases, journeys, domain notes).
2. Record unresolved, materially important contradictions explicitly in
   `.agents/OPEN_QUESTIONS.md`. Do not silently resolve them; continue through reversible
   decisions where safe.
3. Do not freeze a ruler whose unresolved ambiguity makes it materially untrustworthy.

### P1 — Semantic formation

Where the source contains purposeful domain interactions, derive the canonical semantic
model **before** directory structure:

> source evidence → `deriving-interaction-domain-models` → canonical interaction model →
> `domainforge-sea` → validated `.sea`

1. Invoke the bundled skill `deriving-interaction-domain-models` following its SKILL.md —
   use it rather than inventing your own use-case-to-domain method.
2. Always use `domainforge-sea` for `.sea` authoring and `domainforge` CLI operations;
   never duplicate its syntax rules here.
3. The canonical model lives in the project's `.sea/` area (topology decided with the
   bundled skills). Treat use cases, stories, screens, API descriptions, and plans as
   source evidence/projections, not automatically as canonical entities.
4. If the project has no purposeful interaction surface, skip `.sea` formation entirely —
   do not force semantics onto a pure infrastructure substrate.

For the rule details see [references/greenfield-formation.md](references/greenfield-formation.md).

### P1B — Behavioral formation for interactive systems

When the project contains meaningful purposeful interaction behavior, project the canonical interaction model into executable behavior **before** deriving interface-heavy topology:

> canonical IDM → `deriving-behavioral-interaction-proofs` → Behavioral IR per canonical journey → sequential behavioral proof

1. Invoke `deriving-behavioral-interaction-proofs` rather than embedding behavioral projection rules here.
2. Treat the eight behavioral responsibilities as a shared contract, not eight mandatory screens: context selection, preflight, authority resolution, capability invocation, state/artifact effect, evidence inspection, settlement/decision, and next-affordance selection.
3. Preserve unresolved authority, payment, capability, settlement, recovery, or next-affordance bindings as explicit gaps. Do not invent them to make the proof feel complete.
4. Exercise the important journeys through the lowest-bandwidth sequential proof and record projection pressure: where users repeatedly need persistence, simultaneous comparison, relationship views, temporal views, artifact inspection, or other richer representation.
5. Skip this phase for projects with no meaningful interactive or case/workflow behavior.

The Behavioral IR is a projection of the canonical IDM, not a competing semantic source.

### P1C — Atomic UI formation when richer interface representation is warranted

When the target includes a TUI, GUI, web, mobile, or other persistent interactive surface and the behavioral proof has earned richer representation:

> Behavioral IR + proof evidence + projection pressure → `deriving-atomic-ui-models` → renderer-neutral Atomic UI IR

1. Invoke `deriving-atomic-ui-models` rather than designing framework components directly from stories or mockups.
2. Keep the Atomic UI IR renderer-neutral. OpenTUI, React, Tauri, web, mobile, voice, and other renderers are downstream adapters.
3. Require UI responsibilities and richer spatial representations to trace back to behavioral necessity, explicit platform/accessibility constraints, or observed projection pressure.
4. Do not force this phase for headless, API-only, library, compiler, or infrastructure projects.

### P2 — Derive the software topology

From the spec, plan, `.sea`, applicable Behavioral IR / Atomic UI IR, language ecosystem, toolchain, and deployment intent, derive
the minimum useful topology: packages/crates/modules/services, boundaries, dependency
direction, domain ports, public types, schemas, persistence/transport seams, adapters,
composition roots, config structures, test fixtures, integration and E2E harnesses.

- Stabilize cross-component contracts. Keep private implementation freedom open.
- Every structural artifact must trace to a reason.
- Never impose an arbitrary directory template; derive topology from the work.

### P3 — Build an executable walking skeleton

Not folders-and-signatures. Prove the architecture composes:

- dependencies/imports resolve; public signatures agree; type relationships compile;
- config loads; composition roots construct; adapters satisfy contracts; fixtures
  initialize; processes/services boot; routes/commands/events register; integration and
  E2E harnesses reach real boundaries.

Prefer a trivial infrastructure vertical route (health/readiness or a minimal persistence
round-trip). Do **not** implement a large share of business behavior to demonstrate
topology. Use `neatcode` for generated implementation code.

At handoff there must be **no unexplained structural red**. Failures represent explicit
unsatisfied behavioral obligations, never broken wiring.

### P4 — Build a verification graph, not a tests folder

Derive verification alongside architecture:

- domain contract → reusable contract test → every adapter satisfies it;
- application capability → integration proof;
- external journey → E2E proof;
- architecture invariant → deterministic boundary check.

Distinguish **structural E2E** (system graph connected and executable — must settle before
handoff) from **behavioral E2E** (specified externally meaningful behavior — honestly red
until implemented). Design task-scoped gates so unsatisfied requirements can exist without
breaking baseline structural verification. See [references/verification-topology.md](references/verification-topology.md).

### P5 — Build the frozen convergence envelope

1. Author the **requirement ledger** (structured, machine-readable; e.g. `topology.yaml`
   or `requirements/ledger.yaml`) binding each requirement to source file/section/digest,
   semantic binding, acceptance obligations, proof commands, mutable/frozen surfaces, and
   dependencies. Validate with
   `${CLAUDE_PLUGIN_ROOT}/skills/project-topology-architect/scripts/validate-requirement-ledger.py`.
2. Author the **candidate acceptance contracts** (AC-* ids).
3. Author or guide the **candidate Wayfinder** (frozen evaluation projection).
4. **Criticize before freezing.** Use fresh, context-isolated critics for independent
   predicates (source-fidelity, semantic-fidelity, contradiction/ambiguity, evasion,
   verification-quality). Critics are blind to implementation rationale; they may inspect
   the relevant source, artifacts, tests, and evidence. When the host lacks an isolatable
   subagent mechanism, run deterministic formation checks and record that independent
   critic formation is incomplete. Never fabricate critic independence.
5. **Freeze.** Record deterministic hashes (source spec, canonical `.sea`, ledger,
   Wayfinder, acceptance contracts, frozen verification artifacts) and write them into the
   Wayfinder freeze header. Inside an active run the ruler is immutable. Evidence of ruler
   defects becomes a `CandidateRevision`; a new run requires a new freeze boundary.

See [references/requirement-ledger.md](references/requirement-ledger.md) and
[references/gauntlet-formation-freeze.md](references/gauntlet-formation-freeze.md).

### P6 — Build the generated operating surface

Every generated substrate gets a concise router and a durable workbench:

- Root `AGENTS.md` — project-wide agent operating/router surface, twelve concise categories
  (identity, repo map, dev loop, build/validate, code conventions, testing strategy, docs,
  architecture/boundaries, security, git/change policy, operational constraints, task
  completion criteria). No dumping of skills/plans/history into it.
- `.agents/` — durable project/agent work memory (`CURRENT_STATUS.jsonl`
  append-only history plus its `CURRENT_STATUS.md` human mirror, `OPEN_QUESTIONS.md`,
  `DEBT_OBSERVED.md`, and the minimum applicable subset of
  `specs/ plans/ skills/ roles/ reports/ evidence/ lessons/`). Never create empty
  directories. `.agents/AGENTS.md` documents maintenance invariants including the
  status append/mirror protocol.
- Structured machine config (TOML/YAML/JSON/ecosystem-native) for durable machine-consumed
  behavior; `.env` only for environment-local values/secrets. Never Markdown-as-config;
  never hardcoded env values where durable config is better.

See [references/agents-workbench.md](references/agents-workbench.md) and
[references/topology-principles.md](references/topology-principles.md).

### P7 — Build the operational `just` surface

Generate a repository-level `justfile` derived from the real ecosystem — `just setup`,
`dev`, `build`, `check`, `fmt`, `lint`, `test` (+ `-unit/-integration/-e2e`), `boundaries`,
`verify`, task-scoped gates, `clean` — plus requirement-specific verification. A cold actor
runs `just --list` and gets a usable map. Recipes compose ecosystem-native tools; they
never replace them.

### P8 — Integrate RealityTrace/SXR only at the CLI boundary

Make the born-observable project capable of binding project identities (semantic snapshot,
requirement, run, contract, observations, evidence, settlements) to SXR. Never link
generated software to SXR crates; never fabricate evidence. Use the portable resolver:

> configured executable → `sxr` from PATH → fail-closed diagnostic

and thin `just` recipes (`sxr-doctor`, `sxr-snapshot`, `sxr-verify`, `sxr-evidence`,
`just sxr-settle`, `sxr-ledger`, …) only where they map to the live CLI. See
[references/realitytrace-integration.md](references/realitytrace-integration.md).

### P9 — Cold-agent topology evaluation

Prove a cold actor reaches the correct work/proof surface cheaply: where truth lives,
where change X belongs, what else it affects, the narrowest proof command, what must not
be modified, and how to tell whether a requirement settled. Measure navigation burden
(files inspected, irrelevant files, tool calls before correct action, instruction
conflicts, verification-discovery burden). Fix structural or routing debt the walk
reveals. See [references/cold-agent-evaluation.md](references/cold-agent-evaluation.md).

### P10 — Handoff report

Report: topology produced, semantic/canonical source, frozen vs mutable surfaces,
verification graph and its current green/red state, requirement→proof map, open questions,
SXR integration state, and the next highest-value settlement.

## 4. Brownfield workflow

1. **Inventory before modifying.** Map the tree, sources of truth, architecture and
   boundaries, duplicated or contradictory truth, oversized routing surfaces, missing
   local instructions, machine-config-as-prose, scattered commands, verification-discovery
   debt, and transient work mixed with durable truth. Inspect existing `.agents/`,
   `AGENTS.md`, `.sea`, specs, plans, tests, `justfile`/task runner, config.
2. Preserve what genuinely works; propose the **smallest useful structural revision**.
   Never rearrange code because another layout is prettier.
3. Migrate without aesthetic churn; verify behavior has not unintentionally changed.
4. Run the cold-agent topology evaluation.

Details: [references/brownfield-restructuring.md](references/brownfield-restructuring.md).

## 5. Composition of the bundled skills

This plugin ships six skills. The primary skill (this file) orchestrates; the bundled
reusable skills are never re-implemented here:

| Skill | Role when composing |
|-------|---------------------|
| `deriving-interaction-domain-models` | Canonical interaction/domain derivation from evidence (P1). Needs `domainforge-sea` + DomainForge CLI. |
| `domainforge-sea` | Authority for `.sea` syntax and `domainforge` CLI/validation (P1). |
| `deriving-behavioral-interaction-proofs` | Renderer-neutral Behavioral IR plus sequential behavioral proof for canonical journeys (P1B). |
| `deriving-atomic-ui-models` | Renderer-neutral Atomic UI IR derived from proven behavior, projection pressure, and interface constraints (P1C). |
| `neatcode` | Implementation discipline for the walking skeleton and any generated code (P3, brownfield repairs). |

Load a bundled skill by reading its own SKILL.md:
`${CLAUDE_PLUGIN_ROOT}/skills/<skill-name>/SKILL.md`. Follow its instructions as
authoritative for its domain; do not duplicate its content into this skill.

## 6. References

Load only when the phase needs them:

- [references/topology-principles.md](references/topology-principles.md) — generalized
  topology principles; provenance of ICM ideas and what is deliberately retired.
- [references/greenfield-formation.md](references/greenfield-formation.md) — P0–P3, P6–P7
  detail: semantic formation, topology derivation, walking skeleton, workbench, `just`.
- [references/brownfield-restructuring.md](references/brownfield-restructuring.md) — audit
  and restructure procedure, preserving working behavior.
- [references/verification-topology.md](references/verification-topology.md) — the
  verification graph, structural vs behavioral E2E, task-scoped gates, proof kinds.
- [references/requirement-ledger.md](references/requirement-ledger.md) — ledger schema and
  obligations; validation entry point.
- [references/gauntlet-formation-freeze.md](references/gauntlet-formation-freeze.md) —
  Wayfinder formation, independent criticism, freeze boundary, CandidateRevision flow.
- [references/agents-workbench.md](references/agents-workbench.md) — `AGENTS.md` and
  `.agents/` conventions for generated projects.
- [references/realitytrace-integration.md](references/realitytrace-integration.md) — SXR
  CLI contract, resolver, born-observable recipes, proof-claim separation.
- [references/cold-agent-evaluation.md](references/cold-agent-evaluation.md) — walking a
  topology cold; navigation-burden measurement.
- [references/icm-lineage.md](references/icm-lineage.md) — preservation/attribution of the
  former ICM Architect material; how the ontology changed.

## 7. Deterministic scripts

These are machinery, not judgment. Run them; do not re-derive their checks by hand.
Semantic judgment (criticism, ruling fidelity) is model reasoning and is never delegated
to a script.

- `scripts/validate-plugin.py` — plugin layout, manifest, skill frontmatter, stale
  activation references, duplicate primary skill, portable paths.
- `scripts/validate-requirement-ledger.py` — ledger schema, digest verification, source
  traceability, frozen/mutable coherence, duplicate requirement IDs.
- `scripts/validate-wayfinder.py` — Wayfinder integrity: freeze header, hash binding,
  requirement cross-reference.
- `scripts/freeze-hash.py` — deterministic content hashes for freeze artifacts.
- `scripts/scaffold-check.py` — generated substrate invariants (AGENTS.md, `.agents/`,
  `justfile`, structured config, verification map).
- `scripts/sxr-resolve.py` — portable SXR executable resolution and availability report;
  fail-closed diagnostics.

## 8. Stopping rules

- Do not call the substrate complete while structural E2E is red for wiring reasons.
- Do not claim a requirement has settled without its gate passing and its evidence
  recorded.
- Do not silently rewrite a frozen ruler; produce a `CandidateRevision`.
- Do not preserve ICM naming/ontology as governing architecture (lineage lives in
  `references/icm-lineage.md`).
- Do not create plugin `agents/`, `hooks/`, MCP, or LSP surfaces without a concrete,
  evidence-backed reason in the plan.