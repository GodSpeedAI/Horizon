# Source

## Overview

Horizon's application layer: the composition root and the process entry point.

`app.ts` builds the walking skeleton — configuration, semantic world, Cognate runtime, frame register,
governance, RealityTrace and the remote controller — and exposes one `HorizonApplication` object whose
methods are the only seam the transports use. It also serves the cockpit's HTTP routes. `main.ts` is the
process entry: it resolves one CLI verb or starts the server, and it routes every verb through the same
`application.surface()` / `application.commitSurfaceIntent()` seam the GUI uses, so a verb cannot mean
something the GUI does not.

The directories beneath this one hold the domain vocabulary, the adapters to the systems that own the
facts, the capability registrations, the settlement flow, the UI compositions and the vetted verifier.

## Interface

- `app.ts`: `createApplication(options?): Promise<HorizonApplication>` `[app.ts:createApplication]`;
  options are `storePath`, `configPath`, `contextAdapter`, `governance`, `approvals`, `realityTrace`,
  `economics`, `seaForgeSocket` `[app.ts:createApplication]`.
- `HorizonApplication` members `[app.ts:HorizonApplication]`: `loaded: LoadedConfig`, `world:
  LoadedWorld`, `runtime: HorizonRuntime`, `caller: Caller`, `remote: RemoteController`, `research:
  ResearchStatus`, `frames: FrameRegister`, `frame()`, `navigationFrame(options?)`, `workspace(options?)`,
  `inspectFocus(operation, options?)`, `commitNavigationIntent(request)`, `submitIntent(intent)`,
  `resolveNavigationApproval(request)`, `settleNavigationIntent(intentId)`, `surface(role?)`,
  `surfaceSchema()`, `commitSurfaceIntent(submission)`, `startObservation(commit)`, `researchContract()`,
  `startServer(port?)`, `close()`.
- Result and request shapes: `FrameView` `[app.ts:FrameView]`; `SurfaceIntentRequestBody` with
  `transport: "gui" | "cli" | "mcp"` `[app.ts:SurfaceIntentRequestBody]`; `NavigationOptions` (`focusRef`,
  `caseRef`, `purpose`, `directionRef`, `directionStatement`) `[app.ts:NavigationOptions]`;
  `WorkspaceData` `[app.ts:WorkspaceData]`; `IntentCommit` `[app.ts:IntentCommit]`;
  `AwaitingAuthorityError` with `code = "awaiting_authority"` `[app.ts:AwaitingAuthorityError]`.
- HTTP routes served by `startServer()`: `GET /health`, `GET /frame`, `POST /intent`, `GET /surface`,
  `GET /surface/schema`, `POST /surface/intent`, `GET /workspace`, `GET /workspace.json`,
  `GET /workspace/economics`, `GET /workspace/inspect`, `POST /workspace/intent`,
  `POST /workspace/case`, `POST /workspace/onboarding/skip`, `POST /workspace/onboarding/resume`,
  `POST /workspace/approval`, `POST /workspace/settle`, `GET /workspace/remote`,
  `GET /workspace/remote/status`, `GET /workspace/remote/events`, `POST /workspace/remote/start`,
  `POST /workspace/remote/refresh`, `POST /workspace/remote/stop`, and `GET /` redirecting to
  `/workspace` `[app.ts:startServer]`.
- Internal helpers: `remoteRailOf(status)` `[app.ts:remoteRailOf]`; `themeOf(value)`
  `[app.ts:themeOf]`; `crossSiteRefusal(request, port, hostOnly?)` `[app.ts:crossSiteRefusal]`;
  `checkpointRefOf(storePath)` `[app.ts:checkpointRefOf]`; `lastPosition(runtime)`
  `[app.ts:lastPosition]`.
- `desktop.ts` and `runtime/resource-root.ts`: the `serve` verb's resource/data resolution
  (`prepareServe`), the ready line and stdin-close exit for the desktop shell, and `resourcePath()`,
  which finds `contracts/`, `domain/`, `config/` and `dist/desk/` from a checkout or from
  `HORIZON_RESOURCE_ROOT` (a compiled binary has no checkout). `startServer(port, { launch })`
  hands the one-time pairing code to the shell and serves `GET /desk/launch?code=`, which trades it
  for the ordinary pairing session cookie. See `docs/desktop.md`.
- `main.ts`: verbs `frame`, `surface`, `schema`, `act`, `mcp`, `serve`, and the default server branch
  `[main.ts:11]` `[main.ts:61]` `[main.ts:91]` `[main.ts:100]` `[main.ts:103]` `[main.ts:119]`
  `[main.ts:123]`; `roleFlag()` restricted to `human` / `agent` / `system`, default `human`
  `[main.ts:roleFlag]`; `flag(name)` / `hasFlag(name)` `[main.ts:flag]` `[main.ts:hasFlag]`;
  `runSequentialTui(session, onIntent)` `[main.ts:runSequentialTui]`.
- Subdirectories: [`./adapters/EGM.md`](./adapters/EGM.md), [`./agents/EGM.md`](./agents/EGM.md),
  [`./capabilities/EGM.md`](./capabilities/EGM.md), [`./config/EGM.md`](./config/EGM.md),
  [`./domain/EGM.md`](./domain/EGM.md), [`./economics/EGM.md`](./economics/EGM.md),
  [`./projections/EGM.md`](./projections/EGM.md), [`./remote/EGM.md`](./remote/EGM.md),
  [`./runtime/EGM.md`](./runtime/EGM.md), [`./settlement/EGM.md`](./settlement/EGM.md),
  [`./ui/EGM.md`](./ui/EGM.md), [`./verifiers/EGM.md`](./verifiers/EGM.md).
- Not a contract: `components/` holds only a human-maintained `README.md` (no source files), so it is
  not part of this index.

## Invariants

- The store guard is always exercised: tests supply `configPath`, never `storePath`
  `[app.ts:createApplication]`.
- A partial governance configuration is a startup error, never a silent fallback; governance is off
  when the Cognate governance environment is unset `[app.ts:createApplication]`.
- `deployment_profile` and the world ref come from configuration, and the world is loaded before the
  runtime is created `[app.ts:createApplication]`.
- Research is observed but optional: a failure degrades one typed observation and blocks only
  research-dependent operations `[app.ts:createApplication]`.
- A contract upgrade happens before anything is served: `activateContract(...)` suspends pending v1
  commit runs and marks the store at startup `[app.ts:createApplication]`.
- Governance polling is only added in `sea-forge` mode, with a 2 000 ms default
  `[app.ts:createApplication]`.
- Every cockpit request must come from this cockpit: the Host header must name `127.0.0.1:<port>`,
  `localhost:<port>` or `[::1]:<port>`, and unless `hostOnly` an `Origin` must be this cockpit's and
  `Sec-Fetch-Site` must be `same-origin` or `none`; a request with neither header is allowed on the Host
  check alone `[app.ts:crossSiteRefusal]`. A refusal is `403 forbidden_origin`, never a redirect
  `[app.ts:crossSiteRefusal]`.
- A surface the grammar refuses is a failure, not a degraded page: the `surface` verb writes
  `{ code, issues }` to stderr and exits 1 `[main.ts:91]`.
- One surface, three transports: the CLI and MCP verbs resolve their target through
  `application.surface()` and commit through `application.commitSurfaceIntent()` `[main.ts:11]`.
- MCP tools are derived from the grammar's operation vocabulary, never hand-listed `[main.ts:119]`.
- An unknown `--role` value throws rather than defaulting; a missing `--role` is `human`
  `[main.ts:roleFlag]`.
- `act` requires `--operation` or `--node` and exits 1 when the outcome is not `ok` `[main.ts:103]`.
- A non-TTY without `--tui` renders text rather than starting the renderer
  `[main.ts:83]`.
- The sequential TUI callback is a boundary: the intent is recorded by the caller and not executed, so
  no keystroke becomes a world mutation before a capability and authority bind one `[main.ts:runSequentialTui]`.
- `checkpointRefOf` never fabricates a checkpoint: an unreadable store yields `cognate:none`
  `[app.ts:checkpointRefOf]`.

## Side Effects

- HTTP server: `Bun.serve` bound to the configured host and port, stopped by `close()`; shutdown is
  guarded by a `closing` flag and wired to `SIGINT` and `SIGTERM` `[app.ts:startServer]`
  `[main.ts:132]`.
- Durable store: the runtime is opened on the resolved store path and the contract activation writes the
  store marker `[app.ts:createApplication]`; the event stream is read by `lastPosition`
  `[app.ts:lastPosition]`.
- Subprocesses: the research command is observed at startup, the Context Kernel adapter spawns per
  request, RealityTrace is spawned for evidence and economics, and the SEA-Forge socket is dialled for
  approvals and `authority_closure` — all through the adapters under `./adapters/`
  `[app.ts:createApplication]`.
- Filesystem: `statSync(storePath)` for the checkpoint ref `[app.ts:checkpointRefOf]`.
- Clock and identifiers: `new Date()` for contract activation and obligation timing, `randomUUID()` for
  frames and intents, `randomBytes` for launch material `[app.ts:createApplication]`.
- Environment reads: `HORIZON_STORE`, `HORIZON_CONFIG`, the Cognate governance/approval/RealityTrace
  variables and the economics overrides `[app.ts:createApplication]`.
- Process output: `process.stdout.write` for `--json` / text / schema / MCP output, `console.error` for
  refusals, `process.exit(1)` on a refused surface or act `[main.ts:68]` `[main.ts:94]` `[main.ts:118]`.
- Terminal: the sequential TUI creates an OpenTUI CLI renderer with `exitOnCtrlC` and
  `useKittyKeyboard: { disambiguate: true }`, destroys it on exit `[main.ts:runSequentialTui]`.

## Verification

- Run: `bun test`
