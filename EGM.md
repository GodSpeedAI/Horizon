# Horizon Blueprint

## System Overview

Horizon is GodSpeed AI's observer-relative navigation environment: a case-aware interface to semantic
objects, spendable affordances, governed execution, independent evidence and developmental feedback. It
is a separate application repository that composes, rather than replaces, the systems that own the
underlying facts.

The composition root is `src/app.ts`, which builds one Cognate runtime over the pinned semantic world and
exposes a single application seam. Every transport — the workspace GUI, the Clack-style sequential
terminal, the CLI verbs and the MCP tools — resolves its target through that same seam, so a verb cannot
mean something the GUI does not. Directory contracts under `src/` describe the domain vocabulary, the
adapters to the systems that own the facts, the capability registrations, the settlement obligation flow,
the renderer-neutral surface pipeline and the vetted verifier.

Three boundaries are load-bearing and must not be collapsed:

- **Ownership.** Horizon owns observer navigation and separate developmental interpretation. Cognate owns
  the application runtime, events and projections; DomainForge owns the semantic world; SEA-Forge owns
  independent authorization and operational obligations; RealityTrace owns its own evidence observations;
  Gauntlet owns frozen execution records. `.agents/` owns Horizon's normative spec, plan and evidence.
- **Possibility versus affordance.** `available`, `blocked`, `unknown` and `conflicted` are distinct
  states, and a consequential operation that cannot be governed is refused rather than presented.
- **Proof versus implementation.** A passing mock, an existing file or a finished agent does not settle a
  requirement; `requirements/ledger.yaml` and `.wayfinder/answer-key.md` are the frozen rulers, and the
  `just` gates are the declared proofs.

## Local Interface & Invariants

- `cognate.config.ts` — the Cognate CLI project config: `profile: "harness"`, a fixed `instructions`
  string, and the semantic world entry `domain/interaction-model.sea` under the name `horizon`
  `[cognate.config.ts:default]`. `domain` is a symlink to `.sea/interaction`, so the pinned world and the
  symlinked view are the same file.
- The entry's own instruction text states what this skeleton does *not* do — it "does not claim live
  settlement" — so no contract in this index may treat a simulated or fixture-backed result as a settled
  outcome `[cognate.config.ts:default]`.
- Invariants: the semantic world entry, profile and name are declared here rather than derived from the
  environment; changing the entry path changes what `loadWorld` boots `[cognate.config.ts:default]`.
- Side effects: none observed in source — the module exports a configuration object and performs no I/O,
  spawn, clock or environment read `[cognate.config.ts:default]`.

## Subdirectories & System Boundaries

- `.agents`: [`.agents/EGM.md`](./.agents/EGM.md) — the normative workbench: frozen spec, execution plan,
  preregistrations, settlement evidence, candidate revisions, bundled interaction/behavioral/UI/neatcode
  skills, and the append-only status ledger.
- `behavioral`: [`behavioral/EGM.md`](./behavioral/EGM.md) — the interaction-proof layer: journey
  fixtures J01–J06 and the fixture-backed PROVE-mode engine walking IS1–IS8 one decision at a time.
- `research`: [`research/EGM.md`](./research/EGM.md) — the Python developmental research subsystem, shipped
  as a transport-only typed process contract (`horizon.research/1`).
- `scripts`: [`scripts/EGM.md`](./scripts/EGM.md) — the Bun/TypeScript, Python and Bash checkers, teeth and
  generators that assert, mutate and freeze Horizon's formation artifacts.
- `src`: [`src/EGM.md`](./src/EGM.md) — the application: composition root, domain vocabulary, adapters,
  capabilities, settlement, surface pipeline and verifiers.
- `test/` — the Bun test suite and its fixtures (`test/support/`). Excluded from this contract set as a
  test-only tree; it is the executable half of the `bun test` gate.
- `config/horizon.toml` — the single typed configuration document, validated by `src/config/load.ts`
  (deployment profile, world ref, store, operation bindings, capacity, settlement, economics).
- `requirements/ledger.yaml` — the generated requirement ledger and its frozen hashes.
- `.wayfinder/answer-key.md` — the frozen critical checks for the current world ref.
- `ui-model/` — the renderer-neutral atomic UI IRs (`views/*.yaml`), the projection decisions, the
  traceability map and the handoff note; validated by the atomic-UI validator and the UI traceability
  teeth, not by a source-code contract.
- `docs/` — human documentation: architecture and topology notes, subsystem explainers, glossary,
  reference, workflows and the two HTML explainers. Documentation, not configuration.
- `.sea/interaction/` — the canonical DomainForge interaction model and the frozen DomainForge output;
  owned by the `.sea` source, not by a README contract.
- `.cognate/`, `.tmp/`, `.jolli/`, `.serena/`, `.horizon/` — local runtime state, scratch space and tool
  metadata; ignored by git and out of scope for this index.

## Global Invariants

- `.agents/specs/horizon.agent.spec.yaml` (HORIZON-001) owns **what must be true**;
  `.agents/plans/horizon.plan.yaml` owns dependency order and settlement work; `.sea` owns canonical
  interaction semantics; Cognate owns application events; SEA-Forge owns authorization; RealityTrace owns
  its evidence; Gauntlet owns frozen execution records. No document in this index may become a second
  source for any of those.
- The frozen spec is verified by SHA-256 against the plan's `source.spec.sha256` before any implementation
  task proceeds; a mismatch blocks implementation rather than being edited around.
- Fail closed for unknown or denied authority, a stale frame, a missing hard affordability gate, an
  invalid world scope, a duplicate uncertain external commitment, and absent settlement evidence.
- `available`, `blocked`, `unknown` and `conflicted` remain distinct everywhere, and no renderer or
  transport may present a possible operation as an available affordance.
- I/O, time, LLM calls and randomness stay behind observed or recorded Cognate capabilities; UI
  composition and reducers are pure and testable.
- `world_ref`, checkpoint, Case, navigation frame, intent, authority, execution, evidence and settlement
  references are preserved as separate concepts; a frame never grants authority and a completion trace is
  not a settlement.
- The declarative surface stays closed: no runtime-authored JS/JSX/HTML, no DOM mutation as an action API,
  no impersonation of a human approval, and no alteration of a pinned owner layout.
- `.agents/CURRENT_STATUS.jsonl` is append-only and its `.agents/CURRENT_STATUS.md` mirror is the single
  status snapshot; a task is settled only when its narrow gates, negative teeth, evidence and independent
  confirmation are satisfied.

## Global Side Effects

- **Durable local store.** A single SQLite store (default from `config/horizon.toml`, overridable by
  `HORIZON_STORE`) holds Cognate events, projection state, navigation intents and attempts, pending
  intents, the capacity ledger, settlements, cases, remote devices and the contract marker. The store is
  the only operational state Horizon owns.
- **Local HTTP listeners.** The cockpit server (`src/app.ts:startServer`) and the optional loopback-only
  phone remote (`src/remote/`) both bind loopback; the remote additionally requires a passkey-paired
  session.
- **External systems.** RealityTrace is spawned for evidence, economics and obligation runs; SEA-Forge is
  reached over its Unix socket for approvals and `authority_closure`; the Context Kernel is spawned for
  reference retrieval; the optional research command is spawned for its health observation. All four are
  reached through `src/adapters/` or the registered capabilities, never from a renderer.
- **Files and processes.** The generated requirement ledger, the Wayfinder answer key, the compiled
  verifier binary and the DomainForge output are written by `scripts/`; the semantic world is read from
  `.sea/interaction/`.
- **Terminal and process state.** The sequential surface drives the OpenTUI renderer and reads keystrokes;
  the server handles `SIGINT`/`SIGTERM` for a single graceful shutdown.
- **Environment.** `HORIZON_CONFIG`, `HORIZON_STORE`, `HORIZON_SECRET_FILE`, `HORIZON_ECONOMICS_*`,
  `HORIZON_REMOTE_*`, `COGNATE_GOVERNANCE`, `COGNATE_SEA_FORGE_SOCKET`, `COGNATE_SEA_FORGE_OPERATOR`,
  `COGNATE_WORLD_REF`, `COGNATE_REALITYTRACE_*` and `DOMAINFORGE_BIN` select behaviour or toolchain
  locations. Secrets live in a per-launch file written `0600`; none are stored in the repository.

## System Verification

- Run: `bun test && uv run --project research pytest -q`
- Full applicable gate: `just verify` (check, boundaries, idm-integrity, test, ledger, wayfinder, teeth).
