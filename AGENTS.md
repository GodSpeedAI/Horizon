# Horizon — Agent Operating Contract

Horizon is GodSpeed AI's observer-relative navigation environment: a world-first, case-aware interface to semantic objects, spendable affordances, governed execution, independent evidence, and developmental feedback. The intended product is in [README.md](README.md). **Do not mistake the README's future-state description for an implemented capability.**

This document is the **cold-agent router**, not a second specification, implementation plan, or status ledger. Read it before touching files.

## 1. Identity, authority and first action

- **Normative ruler:** [`.agents/specs/horizon.agent.spec.yaml`](.agents/specs/horizon.agent.spec.yaml) (`HORIZON-001`). Changes to meaning or acceptance require explicit review, new spec hash and a plan rebind.
- **Execution route:** [`.agents/plans/horizon.plan.yaml`](.agents/plans/horizon.plan.yaml) (`HORIZON-PLAN-001`). Use its DAG, preregistrations, task gates, evidence and falsifiers—not a linear to-do list.
- **Mutable execution state:** `.agents/CURRENT_STATUS.jsonl` and its `.agents/CURRENT_STATUS.md` mirror. Follow [`.agents/AGENTS.md`](.agents/AGENTS.md) for exact append/update semantics.
- **FIRST REQUIRED SKILL:** read **`~/projects/project-topology-architect/skills/project-topology-architect/SKILL.md`** from the executing machine, then its Greenfield Formation references. T00 begins here, *before* repo scaffolding, code, UI or agent implementation. This owner-designated location is authoritative for skill loading. If unavailable, report the blocker; don't quietly substitute an older vendored copy.
- The normative spec is **approved and frozen at 1.0.0** (owner, 2026-10-19). T00 MUST verify its SHA-256 matches `.agents/plans/horizon.plan.yaml` `source.spec.sha256`; on mismatch, **T01 and implementation tasks MUST NOT proceed**. Never edit a frozen spec in place: propose a new version for owner approval and rebind the plan.

## 2. Repository and workspace map

Horizon is a separate application repository in the shared GodSpeed stack workspace. Resolve local sibling locations at runtime; don't assume every checkout has the same capitalization or base directory.

- `README.md`: intended product, journeys and ownership map.
- `.agents/specs/`: normative contracts; `.agents/plans/`: dependency and settlement graph; `.agents/prereg/` and `.agents/evidence/`: prospective task-scoped proof artifacts.
- `.agents/skills/`: Horizon's bundled interaction, behavioral, atomic UI, DomainForge and review skills.
- **Cognate:** often `../cognate`; owns application runtime, events, projections, continuations and capability bindings.
- **Product Actualizer:** `SPRIME01/Product-Actualizer`, especially `cockpit/`, `docs/workbench.md`, `docs/case-navigation.md`, `docs/world-debugger.md` and `tests/cockpit/grammar.test.ts`. Donor, not application runtime authority.
- Workspace directory names differ from product names: SEA-Forge is `../sea-rs`, RealityTrace is `../sxr`, Context Kernel is `../Context_Kernel`, GodSpeed Agent is `../godspeed_agent`. The spec's `sources.existing_implementation.repositories` is the authoritative map.
- Local sibling checkouts may lag their remotes (Cognate and DomainForge did at spec 0.2.0). Pin published releases; never fetch or switch branches in a sibling without the operator.
- **godspeed_agent** is Horizon's predecessor: its developmental rules and Python ML research infrastructure move into Horizon (T17, T21). DomainForge, SEA-Forge, Gauntlet, RealityTrace and Context Kernel are independent owners. Inspect source and tests before assuming the integration APIs exist.
- Product dispositions (supersede, host, join, defer) live in `.agents/reports/horizon-product-integration-register.yaml`.

## 3. Mandatory method and skills

1. **Project Topology Architect** from the exact owner-provided `~/projects/project-topology-architect/skills/project-topology-architect/SKILL.md`. Use P0 → P1 → P1B → P1C → P2–P8 as applicable, frozen external contracts, executable walking skeleton, verification graph, requirement ledger, critical Wayfinder checks and independent formation criticism.
2. **Building with Cognate**: read `../cognate/.agents/skills/building-with-cognate/SKILL.md` or the corresponding pinned source in `GodSpeedAI/Cognate` and its CLI/API/IDM mapping references. This skill is REQUIRED for Cognate application architecture and implementation.
3. `.agents/skills/deriving-interaction-domain-models/SKILL.md` + `.agents/skills/domainforge-sea/SKILL.md` for canonical `.sea`; never invent grammar.
4. `.agents/skills/deriving-behavioral-interaction-proofs/SKILL.md` for six Behavioral IRs and one-decision-at-a-time proof (IS1–IS8).
5. `.agents/skills/deriving-atomic-ui-models/SKILL.md` for renderer-neutral atomic elements/groups/regions/views after proof and projection pressure.
6. Use `neatcode` and verification skills when their documented conditions apply.

**Current-source wins over stale skill examples.** In particular, Cognate's skill may mention DomainForge `0.19.0` and the legacy `loadSemanticProjection`. Inspect current package versions, `loadSemanticWorld`/`parseSourceMap`, real CLI help, and the source-verified API before binding a multi-module world.

## 4. Development loop

Read status → choose a dependency-ready task → confirm spec hash and predecessors → preregister where required → make the smallest coherent change → run narrow gate and deliberate teeth → run applicable global gates → independently confirm P3 → record evidence → append status and hand off. Never mark a task settled merely because code exists, the agent finished, or a passing mock did not test the external boundary.

Where the represented problem changes, preserve failed evidence and classify the defect (implementation, test oracle, semantic representation, prerequisite or environmental confound). If normative meaning is wrong, stop, propose an explicit revision and re-freeze instead of rewriting an active ruler.

## 5. Build, CLI and verification

Use Bun/TypeScript and Cognate's actual supported distribution and CLI as confirmed by the mandatory skill. The topology formation step creates a `justfile` backed by real tools. After that, the stable commands are:

- `just check` — type/config/structural integrity
- `just test` — behavioral tests
- `just boundaries` — authority and topology invariants
- `just verify` — full applicable gate
- `just gate-tNN` — individual settlement task proof, defined as that task is implemented

**These `just` targets are expected outputs of T04, not evidence that they currently exist.** Before T04 use the exact narrow T00–T03 task commands and the installed skill's verified CLI. Do not create pass-through commands that return green with required checks skipped.

Scaffold Cognate using its actual `cognate create` contract. Use Product Actualizer to reconstruct/scaffold the *cockpit's deterministic UI vocabulary, reducer, source bindings and useful layout mechanics*, not to replace Cognate's starter or steal Product Actualizer's Product Model/approval engine. Confirm donor license and provenance.

## 6. Code and domain conventions

- Prefer the smallest sufficient typed representation. Stable behavior comes from `.sea` and Behavioral IR, not route names or React components.
- Keep I/O, time, LLM calls and randomness behind observed/recorded Cognate capabilities or steps; UI composition/reducers should be pure and testable.
- Preserve separate `world_ref` (immutable semantic model), checkpoint (operational time), Case (derived purpose), navigation frame (present decision), intent (typed choice), authority, execution, evidence, and settlement references.
- Treat `available`, `blocked`, `unknown`, and `conflicted` as distinct; **possibility ≠ affordance**.
- Prefer `.yaml`, `.toml`, `.env` and typed code for runtime config; docs are not configuration.

## 7. Testing and evidence

Every settlement task must name its spec IDs, positive observation, falsifier/teeth, redesign trigger, evidence path and confirmation. P2 requires adversarial evidence; P3 requires **preregistered expectations and a fresh independent/adversarial confirmation**, not self-attestation.

Run the six canonical journeys (J01 Explore, J02 Operate, J03 Build, J04 Monitor, J05 Compare, J06 Develop), at minimum across happy, blocked, unknown, denied, contradicted, duplicate, interruption and recovery states. Test Clack/GUI intent equivalence and old-world pinned execution. A skipped required integration blocks final conformance.

Use real source observations, retained trace IDs, and explicit proof levels. A mocked SEA-Forge or simulated RealityTrace result cannot establish live settlement. Preserve failed proof rounds when corrected.

## 8. Documentation and single-source ownership

The spec owns **what must be true**. The plan owns **dependency order and settlement work**. `.sea` owns canonical interaction semantics. Cognate owns application events. SEA-Forge owns independent authorization and applicable operational obligations. RealityTrace owns its own evidence observations. Gauntlet owns frozen execution records. Horizon owns observer navigation and separate developmental interpretation.

README is an aspirational product description. Source code, implemented checks and evidence define the current reality. Keep `.agents/` records concise; do not duplicate canonical texts or store machine-specific paths other than the owner's explicit skill-resolution instruction.

## 9. Architecture boundaries

- Horizon **MUST NOT** become an alternative DomainForge compiler, Cognate state runtime, SEA-Forge policy authority, Gauntlet harness, or RealityTrace evidence database.
- Closed declarative surface blocks only. Never let an agent author runtime JS/JSX/HTML, mutate the DOM as an action API, impersonate a human approval, or alter a pinned owner layout.
- Context Kernel citations are scoped reference material, not canonical operational truth. RuVector is a derived index, not truth.
- Direct actions need not pass through Gauntlet. Only bounded longer work requires it; SEA-Forge applies at consequential invocation, never merely at preflight.
- Frozen Gauntlet Reference and active `world_ref` are immutable inside a run; flaws become candidate revisions for a higher observer.

## 10. Security and governance

Fail closed for unknown/denied authority, stale frame, missing hard affordability gate, invalid world scope, duplicate uncertain external commitment, and absent settlement evidence. Protect secrets, private records and cross-observer isolation. Reject untrusted source expressions and agent-generated code. Product Actualizer's loopback/local token trust model is not a remote/multi-user security model.

## 11. Git and change policy

Keep work scoped to a dependency-ready task. Avoid unrelated refactors, silent framework changes and breaking frozen signatures. Prefer reviewable focused commits/PRs and document donor attribution. Do not force-push or silently promote an alternate world. Report exact hashes and test outputs. The latest status snapshot belongs in `.agents/CURRENT_STATUS.jsonl` (append-only `---` plus JSON object) and `.agents/CURRENT_STATUS.md` (single mirror), following `.agents/AGENTS.md`.

## 12. Task completion and handoff

A task is done **only** when its narrow gates, negative teeth, applicable global gates, evidence, and required independent confirmation are satisfied. Record which requirement IDs became settled and which remain open. If blocked, state exactly what is unavailable and the next affordable remediation. Set next action to `none — plan settled` only when final T19 meets the fresh whole-stack conformance gate; otherwise report the next dependency-ready task.

**Start with T00 and the exact Project Topology Architect skill. Do not build the GUI first.**
