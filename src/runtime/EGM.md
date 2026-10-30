# Runtime

## Overview

The Cognate runtime boundary. `create.ts` builds the one `Runtime` the application uses: it declares the
capability policy, the action policy, the boot-registered components and the public projections, then
hands back the runtime, the caller and the resolved store path. Nothing here decides navigation
semantics, authority or settlement; it decides only what the local runtime is allowed to resolve.

`required-cognate.ts` is a single declarative list, not behaviour: it names the Cognate packages the
composition requires so that removing one from `package.json` fails a check even while an installed copy
still resolves.

## Interface

- `create.ts`: `createHorizonRuntime(config, world, options): Promise<HorizonRuntime>`
  `[create.ts:createHorizonRuntime]`; `HorizonRuntime = { runtime, caller, storePath }`
  `[create.ts:HorizonRuntime]`; `assertStoreBoundary(config, storePath): string`
  `[create.ts:assertStoreBoundary]`; `RuntimeBoundaryError` with `name = "RuntimeBoundaryError"` and the
  message prefix `RUNTIME: ` `[create.ts:RuntimeBoundaryError]`.
- Policy surface: `READ_ONLY_CAPABILITIES = new Set(["horizon.semantics.world",
  "horizon.navigation.intent.commit", CONTEXT_REFERENCE.id])` `[create.ts:READ_ONLY_CAPABILITIES]`;
  `policy: Policy` allowing exactly those ids for actor kinds `user`/`agent` under policy id
  `horizon.local.read-only-semantics`, everything else `horizon.local.default-deny`
  `[create.ts:policy]`; `actions: ActionPolicy` allowing only `"run.start"` and `"run.cancel"`
  `[create.ts:actions]`.
- Options accepted by `createHorizonRuntime`: `storePath`, `caller`, `components`, `agents`,
  `contextAdapter`, `governance`, `outboxFor` `[create.ts:createHorizonRuntime]`.
- `required-cognate.ts`: `REQUIRED_COGNATE` = `@godspeedai/cognate-cli`, `-domainforge`,
  `-runtime-bun`, `-projections`, `-kernel-api` `[required-cognate.ts:REQUIRED_COGNATE]`; consumed by
  `scripts/check-boundaries.ts` and `test/app.test.ts`.
- Subdirectories: none.

## Invariants

- `deployment_profile === "local_operator"` forbids a memory store and a non-local store: an empty,
  `:memory:` or `:memory:`-containing path fails with `"local_operator forbids an in-memory runtime; a
  durable SQLite store is required"`, and a path starting with `postgres` fails with `"local_operator
  supports the local SQLite store only"` `[create.ts:assertStoreBoundary]`.
- Every failure from `fail()` is a `RuntimeBoundaryError`, never a bare `Error`
  `[create.ts:fail]`.
- Capability authorization is default-deny: a capability outside `READ_ONLY_CAPABILITIES`, or a caller
  whose actor kind is neither `user` nor `agent`, is refused `[create.ts:policy]`.
- Action authorization is default-deny and structural-skeleton-scoped: only `run.start`/`run.cancel`
  for a `user`/`agent` principal `[create.ts:actions]`.
- Retrieval is registered at boot whether or not a Context Kernel is configured, so a route has exactly
  one path and no configuration branch; `contextAdapter` changes what the capability talks to, never
  whether it is registered `[create.ts:createHorizonRuntime]`.
- Governance is attached only when supplied: `governance` and `outboxFor` are spread conditionally, so
  an absent option leaves Cognate's own default rather than an explicit `undefined`
  `[create.ts:createHorizonRuntime]`.

## Side Effects

- Filesystem: `mkdirSync(dirname(absolute), { recursive: true })` creates the store's parent directory,
  and the returned path is `resolve(storePath)` `[create.ts:assertStoreBoundary]`.
- Process state: `await createRuntime(...)` opens the durable store at `storePath` and starts the
  runtime's tick loop with `tickMs: 5` `[create.ts:createHorizonRuntime]`.
- Registrations performed at construction: components `semanticWorldComponent(world)`,
  `contextReferenceComponent(config.context_kernel, …)` plus injected components; agents
  `options.agents ?? [healthAgent]`; public projections `navigationContextProjection` and
  `operationalObjectsProjection` `[create.ts:createHorizonRuntime]`.
- Reads no clock, randomness, environment or network directly; `storePath` defaults to
  `config.runtime_store` `[create.ts:createHorizonRuntime]`.

## Verification

- Run: `bun test`
