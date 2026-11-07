# Adapters

## Overview

Boundary modules that translate between Horizon's domain projections and the systems that own the
underlying facts: Cognate's durable store and projection runner, DomainForge semantic worlds, Context
Kernel reference retrieval, RealityTrace evidence/economics, SEA-Forge approvals, and the optional
Python research subsystem. Each adapter is the single place a foreign contract is spoken; the
navigation controller and renderers are expected to reach these only through registered capabilities.

Two shapes are used consistently. Read adapters return a closed, typed observation (`state` /
`outcome` unions) instead of throwing on a foreign failure, and they separate "nothing matched" from
"could not read". Write adapters validate before committing, so a refused record stores nothing.

## Interface

- `semantic.ts`: `loadWorld(pinnedWorldRef, root = "domain", worldName = "horizon"): LoadedWorld`
  reads every `.sea` file under `root`, calls `loadSemanticWorld({ entry: "interaction-model.sea", … })`
  and returns `{ worldRef, cognateWorldRef, projection, objectCount, relationCount, unmapped }`
  `[semantic.ts:loadWorld]`. Also `SemanticAdapterError`, `LoadedWorld`,
  `assertSemanticOutput(value)` which narrows a capability payload to
  `{ world_ref, cognate_world_ref, object_count, relation_count }` `[semantic.ts:assertSemanticOutput]`.
- `context-kernel.ts`: `createContextKernelAdapter(options): ContextKernelAdapter` speaking JSON-RPC
  lines `tools/call` with tool names `query_reference` and `get_status`
  `[context-kernel.ts:requestLine]`; `ContextKernelAdapter` exposes `scope`,
  `queryReference(request)` and `status()` `[context-kernel.ts:ContextKernelAdapter]`; schema literal
  `"horizon.context-reference/1"` `[context-kernel.ts:SCHEMA]`; closed outcome set
  `CONTEXT_OUTCOMES` = `results`, `no-match`, `unavailable`, `denied`, `invalid_response`,
  `invalid_argument`, `absent`, `scope_denied` `[context-kernel.ts:CONTEXT_OUTCOMES]`; zod contracts
  `CorpusId`, `CitationV1`, `ReferenceResultV1` `[context-kernel.ts:CorpusId]`.
- `navigation.ts`: source adapter for the navigation controller. `deriveOperationalNavigation(input)`
  returns `{ case, candidates, possible_operations }` from one operational projection read
  `[navigation.ts:deriveOperationalNavigation]`; `buildOperationalFrame(input, frame?, evaluated?)`
  returns `{ frame, navigation }` with `frame_id` defaulting to
  `frame:${world_ref}:${checkpoint_ref}:${focus_ref}` `[navigation.ts:buildOperationalFrame]`;
  `isOptionalOnly(navigation)` `[navigation.ts:isOptionalOnly]`. Only two candidate operation ids are
  produced: `"horizon.inspect.focus"` and `"horizon.inspect.neighborhood"`
  `[navigation.ts:deriveOperationalNavigation]`.
- `operational-objects.ts`: query/traversal/write layer over the operational projection.
  `DeclaredWorld` (`world_ref`, `tenant`, `types`, `relations`) `[operational-objects.ts:DeclaredWorld]`;
  `readProjection`, `readSnapshotAt`, `checkpointOf`, `queryObjects(store, world, worldRef, filter,
  options)`, `traverse(...)`, `recordObject`, `recordLink`, `recordLineage`, `OperationalObjectError`
  with `code: "undeclared" | "dangling" | "world" | "schema" | "graph"`
  `[operational-objects.ts:OperationalObjectError]`; schema literal
  `"horizon.operational-objects/1"` `[operational-objects.ts:SCHEMA_VERSION]`.
- `realitytrace-economics.ts`: `realityTraceEconomics(config, run?, pathExists?)` returning
  `EconomicsSource { read(): EconomicsReadout }` where `EconomicsReadout.state` is one of
  `"not_configured" | "unavailable" | "empty" | "ok"` `[realitytrace-economics.ts:EconomicsReadout]`;
  `READ_ONLY_COMMANDS` = `[["repo","list"],["ledger","export"],["projections","export"],["ledger","verify"]]`
  `[realitytrace-economics.ts:READ_ONLY_COMMANDS]`.
- `realitytrace-obligation.ts`: `RealityTraceObligation` class with `repo()`, `declare(intentId,
  expectation): DeclaredThreshold` and `run(threshold, argv, launcher, timeoutS): VerifierRun`
  `[realitytrace-obligation.ts:RealityTraceObligation]`; `RealityTraceError`,
  `RealityTraceObligationConfig`, `LedgerPosition`, `DeclaredThreshold`, `VerifierRun`; verifier
  target literal `"concept:navigation_intent"` `[realitytrace-obligation.ts:TARGET]`.
- `research.ts`: `observeResearch(command, cwd?)` returning `ResearchStatus`, a union over
  `status: "ok"` and `status: "unavailable"` with `code` in
  `research_source_absent | research_source_unavailable | research_contract_invalid`
  `[research.ts:ResearchStatus]`; `requireResearch(status)` throws `ResearchUnavailableError` on any
  non-healthy observation `[research.ts:requireResearch]`; `researchHealth` is an alias of
  `observeResearch` `[research.ts:researchHealth]`.
- `sea-forge-config.ts` (socket-free): `approvalAuthorityFromEnv(env, operatorRef)` / `approvalAuthority(options)` building
  `ApprovalAuthority { socketPath, service, operator, timeoutMs? }` `[sea-forge-config.ts:approvalAuthority]`;
  `seaForgeActorOf(principalRef)` `[sea-forge-config.ts:seaForgeActorOf]`; env var name
  `COGNATE_SEA_FORGE_OPERATOR` `[sea-forge-config.ts:ENV_OPERATOR]`. The wire (resolve, list, closure,
  delegated decide) is the Cognate SDK client `SeaForgeAuthority`, built once in `createApplication`;
  `src/` constructs no sockets (`scripts/check-boundaries.ts`).
- `sea-forge-wire.ts`: `seaForgeCall(socketPath, request, timeoutMs = 5_000)` for one NDJSON request over the
  Unix socket `[sea-forge-wire.ts:seaForgeCall]`. Only for the verbs the SDK client does not carry (the case
  keeper's `case_*`/`human_task_*`, the ledger reads, the event follower in `sea-forge-events.ts`); governance verbs
  never use it. `scripts/check-boundaries.ts` lets exactly these two files open the socket.
  These two (`sea-forge-wire.ts`, `sea-forge-events.ts`) make raw calls only for case steps, human tasks and the
  event stream, which the Cognate SDK does not offer yet; move them to the SDK once it does. Every approval and
  governance call goes through the SDK.
- `settlement.ts`: `realityTraceFromEnv(env, repoDir)`, `defaultRealityTraceRepo(storePath)`,
  `observationOutbox(capability)`, `RealityTraceEvidence` (`observe`, `evidenceFor`, `packet`),
  `authorityOf(invocation)`, and `SettlementAuthority = Pick<SeaForgeAuthority, "submitEvidence" |
  "settle">` `[settlement.ts:SettlementAuthority]`; env names `COGNATE_REALITYTRACE_BIN`,
  `COGNATE_REALITYTRACE_DATA_HOME`, `COGNATE_REALITYTRACE_STATE_HOME`
  `[settlement.ts:ENV_REALITYTRACE_BIN]`.
- Subdirectories: none.

## Invariants

- A loaded semantic world must match the pinned identity exactly: `canonical !== pinnedWorldRef`
  fails with `"world identity mismatch"`, and an empty `.sea` set fails with
  `"no .sea sources found"` `[semantic.ts:loadWorld]`.
- Declared semantics are a closed vocabulary: an undeclared semantic type is refused with code
  `"undeclared"` before any row is touched `[operational-objects.ts:queryObjects]`; an undeclared
  relation type is refused in traversal `[operational-objects.ts:traverse]`.
- A requested checkpoint that is not the projection's stored state is refused, not answered
  (`requested … is not the projection state`) `[operational-objects.ts:queryObjects]`; a checkpoint
  naming another projection version is `not_found` `[operational-objects.ts:readSnapshotAt]`.
- Traversal requires both bounds: a missing `max_depth` or `max_objects` returns
  `"traversal requires a bound"` `[operational-objects.ts:traverse]`; exceeding
  `max_objects` returns code `"limit"` `[operational-objects.ts:traverse]`. A link whose endpoint is
  not a projected object is `"dangling"` `[operational-objects.ts:traverse]`.
- Denial is decided from the request, not from rows, so a refusal cannot leak a count
  `[operational-objects.ts:queryObjects]`; results are sorted by `object_ref` so order is
  insertion- and replay-independent `[operational-objects.ts:queryObjects]`.
- Writes enforce world identity (`assertSameWorld`), object schema literal, declared type and, for
  links, `graph === "operational"` and both endpoints already projected
  `[operational-objects.ts:recordLink]`; lineage requires `graph === "lineage"` and an existing
  object `[operational-objects.ts:recordLineage]`.
- Context Kernel scope is fixed at construction: a different `corpus_id` yields `"scope_denied"`
  without a request, a malformed binding is also `scope_denied` (never `absent`), `top_k` must be an
  integer in `1..20`, and `query` must be non-empty and at most 2000 characters
  `[context-kernel.ts:createContextKernelAdapter]`. Every answer carries
  `authority: { canonical: false, grants_authority: false }` `[context-kernel.ts:REFUSED]`.
- The economics reader refuses any RealityTrace command outside the three read-only pairs
  `[realitytrace-economics.ts:assertReadOnly]`.
- A declared threshold without a ledger position throws
  `"threshold declare returned no ledger position"` `[realitytrace-obligation.ts:declare]`; a
  verifier run without an observation ledger position throws `"verify run recorded no observation"`
  `[realitytrace-obligation.ts:run]`.
- Research is optional: an empty command is `research_source_absent`, and a command that runs but
  breaks the contract is `research_contract_invalid`, never silently accepted
  `[research.ts:observeResearch]`; the contract requires `ml === false`
  `[research.ts:parseHealth]`.
- Approval authority is refused rather than guessed: `COGNATE_SEA_FORGE_OPERATOR` set without
  `COGNATE_GOVERNANCE === "sea-forge"` throws, and an operator equal to the service actor throws
  ("a requester cannot approve its own escalation") `[sea-forge-config.ts:approvalAuthority]`.
- RealityTrace configuration is all-or-nothing across the three env vars
  `[settlement.ts:realityTraceFromEnv]`; evidence packets are built only from rows RealityTrace's
  ledger actually holds `[settlement.ts:RealityTraceEvidence.packet]`. Execution success is not
  treated as settlement success — only the recorded trace is forwarded.

## Side Effects

- Adapter reads that touch the store: `readProjection` runs `ProjectionRunner.catchUp()` and a
  snapshot read `[operational-objects.ts:readProjection]`; `commit` appends one event per record with
  `occurredAt = new Date().toISOString()` `[operational-objects.ts:commit]`.
- Subprocess spawns: Context Kernel `spawn(command, [...args])` per request with `SIGKILL` on
  settle/timeout `[context-kernel.ts:spawnTransport]`; RealityTrace `spawnSync` with a 60 s timeout
  `[realitytrace-economics.ts:spawnRunner]` and 120 s timeout
  `[realitytrace-obligation.ts:sxr]`; research `Bun.spawn([...command, "--health"])` killed after
  15 s `[research.ts:observeResearch]`; `git init` / `commit --allow-empty` to enroll a repository
  `[realitytrace-obligation.ts:repo]`.
- Temporary files: `mkdtempSync(join(tmpdir(), "horizon-rt-"))` plus `writeFileSync` and `rmSync`
  for question/threshold payloads `[realitytrace-obligation.ts:withFile]`; `mkdirSync(repoDir,
  { recursive: true })` `[realitytrace-obligation.ts:repo]`.
- Network / IPC: SEA-Forge is reached only through the Cognate SDK client (`SeaForgeAuthority`); RealityTrace CLI invocations in
  `RealityTraceEvidence` (`Bun.spawn([bin, "ledger", "export", …])`)
  `[settlement.ts:RealityTraceEvidence.observationAt]`.
- Environment reads: `process.env` spread into the Context Kernel child
  `[context-kernel.ts:spawnTransport]`; `process.env.PATH` / `HOME` defaults in the economics reader
  `[realitytrace-economics.ts:realityTraceEconomics]`; `XDG_DATA_HOME` / `XDG_STATE_HOME` for
  RealityTrace `[realitytrace-obligation.ts:sxr]`; the governance and approval env vars
  `[sea-forge-config.ts:approvalAuthorityFromEnv]`.
- Durable observation writes: `ObservationDelivery` drains the outbox and records RealityTrace's
  observation in the Cognate store `[settlement.ts:RealityTraceEvidence.observe]`; `Bun.sleep(50)`
  polling loop up to `timeoutMs` (default 20 000) `[settlement.ts:RealityTraceEvidence.observe]`.

## Verification

- Run: `bun test`
