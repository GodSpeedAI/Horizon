# Source map

Where concepts, capabilities, workflows, and subsystems live in the implementation.
Concept → evidence, not a directory listing.

## Entry points and composition

| Concept | Location |
| --- | --- |
| Process entry / transport dispatch | `src/main.ts` |
| Composition root / application | `src/app.ts` — `createApplication` (L144), `issueFrame` (L173), `submitIntent` (L189), `commitNavigationIntent` (L226), `startObservation` (L238), `routeContext` (L262), `surfaceFor` (L281), `commitSurfaceIntent` (L291), `inspectFocus` (L414) |
| Configuration load + validation | `src/config/load.ts` — `loadConfig` (L176), `writeLaunchSecret` (L144), `operatorPrincipal` (L154); types in `src/config/types.ts` |
| Runtime composition + policy | `src/runtime/create.ts` — `createHorizonRuntime` (L71), `assertStoreBoundary` (L57), `READ_ONLY_CAPABILITIES` (L25); pinned version `src/runtime/required-cognate.ts` |

## Semantic world

| Concept | Location |
| --- | --- |
| World load + identity assertion | `src/adapters/semantic.ts` — `loadWorld` (L35), `assertSemanticOutput` (L68) |
| Read-only semantic capability | `src/capabilities/semantic.ts` |
| Canonical semantic source | `.sea/interaction/interaction-model.sea` (+ products, contracts); world hash pinned in `config/horizon.toml` and `justfile` |
| Hash verification tool | `scripts/world-ref.py` |

## Navigation and intents

| Concept | Location |
| --- | --- |
| Frame schema | `src/domain/frame.ts` — `NavigationFrameV1`, `buildStructuralFrame` |
| Controller (gates, Case, choices, view mode, settlement) | `src/domain/navigation.ts` — `GATE_KEYS` (L23), `assessAffordance` (L219), `deriveCase` (L353), `buildNavigationFrame` (L575), `reviseNavigationFrame` (L697), `selectViewMode` (L508), `deepFreezeFrame` (L564) |
| Intent schema + validation | `src/domain/intent.ts` — `buildCommitIntent` (L48), `assertCommitIntent` (L67) |
| Projection → frame derivation | `src/adapters/navigation.ts` — `deriveOperationalNavigation` (L64), `buildOperationalFrame` (L149) |
| Durable intent/attempt streams + frame register | `src/capabilities/navigation-intent.ts` — `createFrameRegister` (L28), `appendIntentRecord` (L75), `appendIntentAttempt` (L147), `navigationIntentComponent` (L230) |
| Deterministic observation agent | `src/agents/health.ts` — `structuralObservationAgent` (L23) |

## Operational layer

| Concept | Location |
| --- | --- |
| Schemas (objects, links, lineage, checkpoints, scopes) | `src/domain/operational.ts` — `OperationalObjectV1` (L58), `parseCheckpointRef` (L202), `QUERY_FAILURE_CODES` (L155) |
| Projection handler | `src/projections/operational-objects.ts` — `operationalObjectsProjection` (L84), `tenantKey` (L47) |
| Read/query/traverse API | `src/adapters/operational-objects.ts` — `readProjection` (L85), `readSnapshotAt` (L149), `queryObjects` (L269), `traverse` (L376), `assertSameWorld` (L491), `commit` (L585) |
| Navigation-context projection | `src/projections/navigation-context.ts` |

## World debugger

| Concept | Location |
| --- | --- |
| Seven operations + value classes | `src/domain/debugger.ts` — `DEBUGGER_OPERATIONS` (L36), `VALUE_CLASSES` (L39), `runDebugger` (L698), `debuggerCatalogue` (L718) |
| Application inspection adapter | `src/ui/workspace/inspect.ts` — `inspect` (L185), `argumentsFor` (L157) |
| Teeth + mutation | `test/retrieval-debugger-teeth.test.ts`, `scripts/teeth-t10-mutation.ts` |

## Surfaces and transports

| Concept | Location |
| --- | --- |
| Closed grammar (blocks, roles, provenance, limits, refs) | `src/ui/surface2/grammar.ts` — `BLOCK_TYPES` (L351), `HORIZON_OPERATIONS` (L81), `parseSurface` (L836), `publishSurfaceSchema` (L809) |
| GUI view projection | `src/ui/surface2/project.ts` — `projectSurface` (L179) |
| Source binding | `src/ui/surface2/binder.ts` — `bindSource` (L138), `bindFile` (L197) |
| Attribution reduction | `src/ui/surface2/reducer.ts` — `reduceSurface` (L122), `authorityOf` (L82) |
| Text/HTML/MCP rendering | `src/ui/surface2/render.ts` — `renderText` (L32), `renderHtml` (L70), `mcpTools` (L118) |
| Cross-transport equivalence | `src/ui/surface2/equivalent.ts` — `intentsEquivalent` (L63); `scripts/teeth-t05-equivalence.ts` |
| T05 seam (role-aware surface, frame-from-checkpoint) | `src/ui/surface.ts` — `projectForRole` (L166), `frameFromCheckpoint` (L201) |
| Sequential controller | `src/ui/sequential/controller.ts` — `openSequential` (L377), `applySequential` (L450), `promptFor` (L265) |
| Sequential terminal (OpenTUI mount) | `src/ui/sequential/terminal.tsx`; vendored kit `src/ui/sequential/vendor/terminal-ui/` |
| Workspace model (regions) | `src/ui/workspace/model.ts` — `buildWorkspace` (L459), `workspaceState` (L420) |
| Workspace HTML renderer | `src/ui/workspace/render.tsx` — `Workspace` (L293), `renderWorkspacePage` (L619) |

## Context Kernel retrieval

| Concept | Location |
| --- | --- |
| Transport adapter + wire schema | `src/adapters/context-kernel.ts` — `createContextKernelAdapter` (L267), `CitationV1` (L56), `CONTEXT_OUTCOMES` (L37) |
| Capability + request validation | `src/capabilities/context.ts` — `contextReferenceComponent` (L65) |
| Config | `src/config/types.ts` — `ContextKernelConfig` (L21) |

## Research subsystem

| Concept | Location |
| --- | --- |
| Typed contract (`horizon.research/1`) | `research/src/horizon_research/contract.py` |
| Probe + degradation | `src/adapters/research.ts` — `observeResearch` (L81), `requireResearch` (L129) |

## Behavioral proofs and atomic UI

| Concept | Location |
| --- | --- |
| Journey IRs (J01–J06) | `behavioral/journeys/J0*.yaml`; contract `behavioral/contract.yaml`; catalog `behavioral/catalog.yaml` |
| Proof engine + transcripts | `behavioral/proof/{engine,run,teeth_authority,teeth_prompt_burden}.py`, `behavioral/proof/transcripts/`, report `behavioral/PROOF-REPORT.md` |
| Atomic UI IR + traceability | `ui-model/` — `atomic-ui-contract.yaml`, `views/*.yaml`, `traceability.yaml`, `projection-decisions.yaml` |

## Governance and verification

| Concept | Location |
| --- | --- |
| Spec / plan (frozen) | `.agents/specs/horizon.agent.spec.yaml`, `.agents/plans/horizon.plan.yaml` |
| Requirement ledger (generated, frozen) | `requirements/ledger.yaml` ← `scripts/gen-requirement-ledger.py`, policy `scripts/ledger-policy.yaml` |
| Wayfinder (generated, frozen) | `.wayfinder/answer-key.md` ← `scripts/gen-wayfinder.py` |
| Preregistrations | `.agents/prereg/horizon/T*.prereg.yaml`; shape check `scripts/check-prereg-shape.ts`; coverage `scripts/check-t0{5,6,7}-prereg-coverage.ts` |
| Boundary checks | `scripts/check-boundaries.ts`, `scripts/check-t05-boundaries.ts` |
| Freeze verification | `scripts/check-ledger-freeze.sh`, `scripts/check-ruler.py`, `scripts/freeze-formation.sh` |
| Teeth (adversarial) | `scripts/teeth.ts`, `scripts/teeth-*.py`, `scripts/teeth-*.ts`, `test/*-teeth*.test.ts(x)`, `behavioral/proof/teeth_*.py` |
| Gates | `justfile` — `gate-t01`…`gate-t10` (implemented), `gate-t11`…`gate-t22` (registered stubs), `verify` |
| Handoff state | `.agents/CURRENT_STATUS.jsonl` + `.agents/CURRENT_STATUS.md` (semantics in `.agents/AGENTS.md`) |

## Test-to-contract map

| Test file | Establishes |
| --- | --- |
| `test/app.test.ts` | boot, world pinning, intent commit/refusal+audit, projection, HTTP server, research-degraded path, Cognate closure |
| `test/navigation-controller.test.ts` / `-negative` | gates, choices, view modes, settlement, stale frames |
| `test/operational-objects.test.ts` / `-negative` | projection reads, rebuild, bounds, denials, wrong-world |
| `test/surface-negative.test.ts` | grammar refusals, attribution, escaping, equivalence, binding |
| `test/sequential-*.test.ts(x)` | controller, terminal, source wiring, real CLI, teeth |
| `test/workspace-*.test.tsx` | model, render, forged/stale form teeth |
| `test/retrieval-debugger*.test.ts` | 7 operations + 11 teeth |
| `test/acceptance.test.ts` | acceptance-criteria observation wiring |
| `test/config.test.ts` | config validation, principals, secret issuance |
| `test/ui.test.ts` | frame→surface projection basics |
| `research/tests/test_contract.py` | research contract |
