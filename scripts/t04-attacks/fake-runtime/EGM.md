# fake-runtime — memory-only Cognate runtime test double

## Overview

This directory is a deliberate **test double**, not a runtime. `index.js` models the
fake described in the T04 review (`codex-root-20261019-7b4d110`, F1): Horizon's real
agents, components and projections run, but runs and projection rows live in `Map`s,
emitted events are discarded, and a plain-text file stands where the SQLite database
would be. `package.json` reuses the real package's name and ESM type so the double
loads wherever the real runtime does.

Its only consumer in source is `scripts/teeth.ts`, which copies this directory into an
isolated dependency tree as `node_modules/@godspeedai/cognate-runtime-bun` and requires
`test/app.test.ts` to fail — a control run with the real runtime must pass first.
`[../../teeth.ts:fake-runtime-substitution]` `[../../teeth.ts:checkControl]`

The surface below is documented factually from `index.js`; it is deliberately
*sufficient* for the real code to boot, so a failure is attributable to behaviour rather
than to a missing export.

## Interface

- `governanceFromEnv()` — exported; returns `{ mode: "off" }`, reducing the real
  package's governance parser to "disabled". `[index.js:governanceFromEnv]`
- `createRuntime(options)` — exported async factory. Accepts `options.store` (a string
  path, or `{ sqlite: { path } }`, default `/tmp/fake.sqlite`), `options.agents`,
  `options.components`, `options.projections` and `options.actions.authorize`.
  `[index.js:createRuntime]` `[index.js:storePath]`
- Returned `service`:
  - `invoke(caller, {capability, input})` — resolves a providing component and calls its
    activated handler. `[index.js:invoke]`
  - `startRun(caller, request)` — consults `options.actions.authorize` for
    `run.start`, allocates `run-<seq>` ids, applies every projection to a
    `run.started` event, calls `agent.run` and stores the terminal status.
    `[index.js:startRun]`
  - `getRun`, `listRuns`, `readProjection(caller, {name})` returning
    `{rows, checkpoint: null}`, and an async generator `events()` that yields nothing.
    `[index.js:readProjection]` `[index.js:events]`
- Returned object also exposes `kernel.scopeId`, an empty `store`, `inspect()`,
  `rebuildCognition()`, `erase()`, `pollApprovals()`, `idle()` and `close()`; the last
  group are no-ops. `[index.js:service]` `[index.js:close]`
- `package.json` declares `name: "@godspeedai/cognate-runtime-bun"`, `version: "0.6.1"`
  and `type: "module"`. `[package.json:name]` `[package.json:type]`

## Invariants

- Export parity is intentional: the comments state the fake must load wherever the real
  runtime does, so the structural E2E fails on behaviour and not on a missing export.
  `[index.js:governanceFromEnv]`
- No durable state. Runs, rows, agents and projections live only in module-level `Map`s
  and an array, so a restart loses everything. `[index.js:runs]` `[index.js:rows]`
- Events are dropped rather than recorded: the run context's `emit` resolves without
  writing. `[index.js:emit]`
- The "store" is a text file whose content is `FAKE: memory-only runtime`, never a
  database. `[index.js:writeFileSync]`
- Authorization is still consulted for `run.start`, so the fake cannot be used to bypass
  a denial. `[index.js:startRun]`
- An unknown capability or run id throws rather than returning an empty result.
  `[index.js:invoke]` `[index.js:getRun]`

## Side Effects

- Creates the parent directory of the store path and overwrites that path with a
  plain-text marker. `[index.js:mkdirSync]` `[index.js:writeFileSync]`
- Generates correlation ids and run ids with `randomUUID()` and a module counter.
  `[index.js:randomUUID]`
- In-memory mutation of the module-level `runs`, `rows`, `agents`, `components` and
  `projections` collections; nothing is written anywhere else. `[index.js:agents]`
- No network access, no child processes.
- Filesystem writes occur in an isolated temporary tree because `teeth.ts` copies this
  directory there; running it against the real repository would still write
  `/tmp/fake.sqlite` by default. `[../../teeth.ts:isolatedTree]`

## Verification

- Run: `just verify`
