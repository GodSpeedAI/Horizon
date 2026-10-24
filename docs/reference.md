# Reference

Precision-oriented lookup: CLI, configuration, just targets, schemas, store layout.
For narrative and rationale, see [architecture](architecture.md) and
[explanation](explanation.md).

---

## CLI verbs (`src/main.ts`)

Invoked as `bun run src/main.ts <verb>` (or `bun run dev` for the server).

| Verb | Purpose | Key flags | Output | Errors |
| --- | --- | --- | --- | --- |
| *(none)* | HTTP server | — | banner: profile, listen URL, world refs, semantic counts | typed boot errors, exit non-zero |
| `frame` | issue a navigation frame, open a session | `--focus <ref>`, `--case <ref>`, `--purpose <text>`, `--json`, `--text`, `--tui` | `horizon.frame/1` JSON, or text, or interactive TUI | `NavigationError` for unknown refs |
| `surface` | render the role-bound closed surface | `--role human\|agent\|system` (default human) | text rendering | grammar-invalid surface → issues JSON on stderr, **exit 1** |
| `schema` | print the published surface schema | — | JSON | — |
| `act` | commit a surface intent via CLI | `--operation <op>` or `--node <id>`, optional `--frame <id>`, `--role` | outcome JSON | refusal → exit 1 (audit attempt still recorded) |
| `mcp` | print MCP tool manifest | — | JSON (tools derived from `HORIZON_OPERATIONS`) | — |

---

## Configuration

Parsed strictly by `src/config/load.ts` (unknown fields rejected; `ConfigError` on
violation).

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `deployment_profile` | enum | — | must be `local_operator` (only profile today) |
| `bind_host` | string | — | must be loopback (`127.0.0.1`) |
| `port` | int | — | bounded port range check |
| `world_alias` | string | `horizon` | display alias |
| `world_ref` | string | — | **must equal** the DomainForge `semantic_closure_hash` of the pinned `.sea`; asserted at boot |
| `runtime_store` | path | `.cognate/app.sqlite` | Cognate SQLite store; boundary-asserted |
| `research_command` | string[] | — | subprocess command for the research probe |
| `[identity] source` | enum | `os_session` | principal derivation source |
| `[identity] operator_prefix` / `agent_prefix` | string | `os:` / `agent:` | principal naming |
| `[secrets] mode` | enum | `per_launch` | secret issuance |
| `[secrets] path` | path | `.cognate/local-operator.secret` | written per launch; never committed |
| `[context_kernel] command` | string[] | — | CK subprocess transport |
| `[context_kernel] corpus` | string | — | corpus id passed with queries |

Test fixtures generate equivalent TOML documents (`test/support/config.ts`).

---

## Environment variables

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DOMAINFORGE_BIN` | `justfile` (`domainforge_bin`) | path to the pinned DomainForge CLI; must be version **0.21.1** (`just check-toolchain`) |

---

## Just targets (full list, `justfile`)

Global:

| Target | What it runs |
| --- | --- |
| `default` | list targets |
| `setup` | `bun install` + `uv sync --project research --all-groups` |
| `check` | `bun run scripts/check.ts` (type/config/structural integrity) |
| `boundaries` | `scripts/check-boundaries.ts` (dependency rules) |
| `idm-integrity` | `scripts/check-idm-integrity.py` (+ debt file `scripts/idm-integrity-debt.yaml`) |
| `acceptance-claims` | `scripts/check-acceptance-claims.py` (AC polarity/coverage) |
| `witness-claims` | `scripts/check-witness-claims.py` against `scripts/witness-claims-baseline.txt` |
| `contract-modals` | `scripts/measure-contract-modals.py` (modal-loss baseline; only REQ-RES-001 baselined) |
| `test` | `bun test` + `uv run --project research pytest -q` |
| `ledger` | ledger freeze verification |
| `wayfinder` | wayfinder verification against the ledger |
| `teeth` | base teeth battery: `teeth-t05-boundaries`, `scripts/teeth.ts`, `teeth-ledger-freeze.sh`, `teeth-domainforge-gate.py`, `teeth-idm-integrity.py` |
| `verify` | `check boundaries idm-integrity test ledger wayfinder teeth` — the global gate |
| `status` | tail of `.agents/CURRENT_STATUS.jsonl` (the handoff snapshot) |
| `check-toolchain` | DomainForge binary present + exactly 0.21.1 |
| `freeze-t04` | `scripts/freeze-formation.sh` |

Task gates (T01–T10 implemented; T11–T22 are registered placeholders that print
"not implemented" and fail closed with exit 1 until their tasks settle):

| Gate | Narrow check | Teeth |
| --- | --- | --- |
| `gate-t01` | DomainForge validation of the `.sea`, `world-ref.py --expect`, IDM coverage/integrity | (toolchain check) |
| `gate-t02` | `behavioral/proof/run.py` (+ `teeth_authority.py`, `teeth_prompt_burden.py`) | — |
| `gate-t03` | atomic-UI-IR validation, `check-ui-traceability.py` | `teeth-ui-traceability.py` |
| `gate-t04` | global set | (formation freeze proof) |
| `gate-t05` | `check-t05` (boundaries + prereg coverage) | `teeth-t05-{boundaries,equivalence,prereg-coverage,mutation}` |
| `gate-t06` | `check-t06` (prereg shape + coverage) | `teeth-t06-{shape,mutation}` |
| `gate-t07` | `check-t07` | `teeth-t07` (mutation) |
| `gate-t08` | `check-t08` (sequential suites) | `teeth-t08` |
| `gate-t09` | `check-t09` (workspace model/render) | `teeth-t09` |
| `gate-t10` | `check-t10` | `teeth-t10`, `teeth-t10-mutation` |

Every task gate also runs the global set (`test check boundaries idm-integrity
acceptance-claims witness-claims contract-modals ledger wayfinder teeth`).

---

## Schemas and vocabularies

| Schema | Defined in | Notes |
| --- | --- | --- |
| `NavigationFrameV1` | `src/domain/frame.ts` | frozen frame; choices, gates, view mode, settlement |
| `horizon.frame/1` + `horizon.sequential-intent/1` | `src/main.ts`, `src/ui/sequential/controller.ts` (`SEQUENTIAL_SCHEMA`, `SEQUENTIAL_INTENT_SCHEMA`) | CLI frame document + intent wire |
| `CommitNavigationIntent` / `NavigationIntentRecord` | `src/domain/intent.ts` | typed intent + record |
| `horizon.surface/2` (`SurfaceV2`) | `src/ui/surface2/grammar.ts` (`SURFACE_SCHEMA`) | 15 block types, roles, intents, placements, attribution, provenance |
| `horizon.gui-view/1` (`GuiView`) | `src/ui/surface2/project.ts` (`GUI_VIEW_SCHEMA`) | nodes + actions projection |
| Operational `*V1` schemas | `src/domain/operational.ts` | objects, links, lineage, provenance, checkpoint refs |
| Debugger answer | `src/domain/debugger.ts` (`DEBUGGER_SCHEMA`) | operations, value classes, scope |
| `horizon.research/1` | `research/src/horizon_research/contract.py` | health/ping contract |
| CK wire (`CitationV1`, `ReferenceResultV1`) | `src/adapters/context-kernel.ts` | newline-JSON transport schema |

Surface block types: `callout, metric, table, tree, timeline, graph, chart, compare,
document, media, entity, progress, preflight, ask, form` (with size caps `MAX_BLOCKS`,
`MAX_ROWS`, `MAX_COLUMNS`, `MAX_NODES`, `MAX_FIELDS`, `MAX_TEXT`).

Operations (`HORIZON_OPERATIONS`): the horizon operation vocabulary in
`src/ui/surface2/grammar.ts`; consequentiality is declared per operation
(`CONSEQUENTIAL_OPERATIONS`) and drives MCP tool flags and preflight requirements.

---

## Canonical domain vocabularies

### 1. Affordance navigation (`src/domain/navigation.ts`)

| Domain set | Values | Role |
| --- | --- | --- |
| `GATE_KEYS` (7) | `visibility`, `reach`, `payment`, `authority`, `capability`, `recovery`, `settlement_access` | The closed set of gates assessed for every candidate operation. |
| `AFFORDANCE_STATUSES` (5) | `possible`, `available`, `blocked`, `unknown`, `conflicted` | Resolution status. Only `available` is spendable (`spendable === true`). |
| `AUTHORITY_OUTCOMES` (7) | `likely_allow`, `requires_approval`, `deferred_to_invocation`, `denied`, `unreachable`, `unknown`, `not_applicable` | Specific outcomes evaluated for the `authority` gate. |
| `REVERSIBILITY_CLASSES` (5) | `read_only`, `reversible`, `compensable`, `irreversible`, `unknown` | Consequentiality definition; `compensable`, `irreversible`, and `unknown` require hard recovery. |
| `NAVIGATION_RESPONSIBILITIES` (6) | `orient`, `inspect`, `choose`, `commit`, `observe`, `review` | Controller navigation phases across frames. |

Interactive model: **[Affordance Navigation & Frame Lifecycle Simulator](explainers/affordance-navigation-simulator.html)**.

### 2. World debugger (`src/domain/debugger.ts`)

| Domain set | Values | Bounds & limits |
| --- | --- | --- |
| `DEBUGGER_OPERATIONS` (7) | `why`, `impact`, `diff`, `timeline`, `counterfactual`, `reach`, `replay` | Read-only interrogation operations over operational projections. |
| `VALUE_CLASSES` (5) | `recorded`, `derived`, `unknown`, `effect`, `untrusted_reference` | Honest epistemic labels for every returned fact/row. |
| Bounds | `MAX_IMPACT_DEPTH = 4`, `MAX_IMPACT_NODES = 64`, `MAX_TIMELINE_ROWS = 200`, `MAX_WHY_ROWS = 100` | Mandatory bounds; unbounded queries fail closed (`missing_bounds`). |

Interactive model: **[World Debugger Workbench & Epistemic Truth Explorer](explainers/world-debugger-workbench.html)**.

### 3. Closed declarative surfaces (`src/ui/surface2/grammar.ts`)

| Domain set | Values | Role |
| --- | --- | --- |
| `SURFACE_ROLES` (3) | `agent`, `human`, `system` | Actor roles; bound to transport, not self-declared. |
| `SURFACE_INTENTS` (5) | `inspect`, `compare`, `decide`, `verify`, `monitor` | Closed intent taxonomy presented by a surface. |
| `LAYOUT_PLACEMENTS` (5) | `owner_pinned`, `owner_laid_out`, `default_order`, `agent_composed`, `agent_proposed` | Layout authority; agent claims are downgraded by reducer. |
| `SOURCE_NAMESPACES` (4) | `semantic`, `horizon`, `file`, `agent` | Allowed namespaces for data binding; no `js:`, `eval:`, or URLs. |

---

## Store layout (`.cognate/app.sqlite`)

| Content | Keying | Notes |
| --- | --- | --- |
| Event streams | stream id + version | intents, attempts, runs, objects/links/lineage |
| Projection rows | tenant prefix + kind prefix | `OBJECT_PREFIX`, `LINK_PREFIX`, `LINEAGE_PREFIX`, `ERROR_PREFIX` (`src/projections/operational-objects.ts`) |
| Checkpoints | per projection | composite refs via `formatCheckpointRef` |
| Runtime (Cognate) | Cognate-owned tables | version pinned by `src/runtime/required-cognate.ts` |

The store is the single durable asset; projections are rebuildable from streams.

---

## HTTP surface (`src/app.ts`, loopback only)

| Route (representative) | Purpose |
| --- | --- |
| health / application info | profile, world refs, research health |
| workspace page | server-rendered `renderWorkspacePage` HTML |
| surface views per role | role-bound surface rendering |
| intent POST (`SurfaceIntentRequestBody`) | `{transport, role, operation?, node_id?, frame_id?}` → outcome |

(Exact path strings live in `src/app.ts`; treat routes as internal to the local trust
boundary, not a public API.)

---

## Error taxonomy (typed, cross-cutting)

| Class | Raised by | Meaning |
| --- | --- | --- |
| `ConfigError` | `src/config/load.ts` | invalid configuration |
| `SemanticAdapterError` | `src/adapters/semantic.ts` | world load/identity failure |
| `ResearchAdapterError` / `ResearchUnavailableError` | `src/adapters/research.ts` | probe/health failure vs typed degradation |
| `NavigationError` | `src/domain/navigation.ts` | frame/gate/choice violations |
| `IntentError` | `src/domain/intent.ts` | intent shape violations |
| `OperationalObjectError` | `src/adapters/operational-objects.ts` | record/read violations |
| `RuntimeBoundaryError` | `src/runtime/create.ts` | store/policy boundary violations |
| Query failure codes | `src/domain/operational.ts` (`QUERY_FAILURE_CODES`) | `denied`, `unavailable`, `blocked`, `no_match`, … |
| Debugger failures | `src/domain/debugger.ts` (`Failure`) | typed refusals incl. undeclared relations, missing bounds |
| Context outcomes | `src/adapters/context-kernel.ts` (`CONTEXT_OUTCOMES`) | `denied` / `unavailable` / `no_match` |
