# Workbench and Cognate checks (read-only, round 3)

Paths: WB = ~/projects/cognate-workbench, CG = ~/projects/cognate. Nothing was built, run or changed. No secret values were read or printed.

## 1. How Horizon should talk to Workbench

- Workbench serves the Cognate RuntimeService over Connect RPC on its own HTTP port, at paths starting `/cognate.v1.RuntimeService/` (WB/src/server.ts:1048-1051). The router is built with `registerRuntimeService` (server.ts:915). The port comes from `PORT`, default 3180 (WB/src/cli.ts:93), loopback only.
- There is a runtime-service client. It has two layers:
  - `@godspeedai/cognate-protocol-connect` (CG/packages/protocol-connect/src/index.ts:557) exports `createRemoteRuntimeService(transport, tokenFor)`. It returns a normal `RuntimeService` backed by a remote Connect endpoint.
  - `@godspeedai/cognate-protocol-connect-bun` (CG/packages/protocol-connect-bun/src/index.ts:106) exports `connectTransport(baseUrl)`. It builds the transport.
  - `@godspeedai/cognate-client` (CG/packages/client/src/index.ts:700) exports `createClient({ service, caller })`, a headless client for runs, reconnecting event subscriptions and projections. Its `ClientOptions` is at index.ts:38-43. It takes any RuntimeService, so you pass it the remote one.
  - Workbench's own browser bundle does exactly this (WB/src/server.ts:354-369).
- Auth mechanism: `Authorization: Bearer <opaque token>` on every request (protocol-connect/src/index.ts:559). The token is a server-minted random string with the prefix `wbs1.` (WB/src/auth/identity.ts:19). The server stores only its SHA-256 hash. It resolves it to a live, unrevoked, unexpired session bound to one identity and tenant (identity.ts:1-10, authenticator at server.ts:905-911). A missing or bad token gives 401 (server.ts:991-992) or Connect "unauthenticated" (protocol-connect index.ts:355-356).
  - The legacy `Bearer <tenant>:<actor>` dev format is accepted only when `COGNATE_DEV_AUTH` is set (server.ts:904-914). Never use it outside tests.
  - Getting a token for Horizon: `identity.session.issue` is a capability that mints a token for a given tenant and actor (WB/src/capabilities/identityAdmin.ts:1-6, 22-26). It is operator-only: it refuses run contexts and any caller except the operator identity. So Horizon needs a token the operator issues once. The one issued at boot is injected into the browser bundle only (server.ts:718, 948) and is superseded on each restart (server.ts:716). I found no built-in service-account flow or CLI that prints a token. I did not read the rest of the issue handler.
- Usable from another repo: the packages are `"license": "Apache-2.0"`, `publishConfig.access: public`, `exports: ./src/index.ts` (TypeScript source, Bun >= 1.4) (CG/packages/client/package.json). Workbench consumes them as npm dependencies at 0.8.0, and its AGENTS.md says not to import monorepo source (WB/AGENTS.md:3). I did not check the npm registry to confirm 0.8.0 is published. Horizon would also need `@connectrpc/connect` 2.2.0 (WB/package.json).
- Caveat: Connect carries the generic RuntimeService (startRun, invoke capability, read projection, events). Workbench-specific actions are named capabilities (for example `session.create`, `team.*`, `expert.*`), called through the generic invoke method. There is no Workbench-specific REST API.

## 2. One assignment or run per (case id, step id)?

No. Workbench has no (case id, step id) key anywhere.
- Assignments are keyed by an id that is caller-supplied or a random UUID (WB/src/experts/service.ts:282). `makeAssignment` throws "Assignment identity already exists" for a repeated id (service.ts:166-167). That is the only uniqueness rule. Nothing stops two assignments with the same purpose or for the same task. `taskId` is only provenance (WB/src/experts/types.ts:74-76).
- Runs and sessions are deduplicated by idempotency key, not by (case, step):
  - Expert runs use key `expert-run:<assignmentId>:<attempt>` (WB/src/experts/bridge.ts:43).
  - `session.create` is deterministic on (workspaceId, requestId) and uses key `session-create:<sessionId>` (WB/src/capabilities/sessionCreate.ts:8-10, 60).
- "Case" in Workbench is the cognitive-navigation case (`case.open` with a `caseId`, WB/src/capabilities/cognitive.ts:147). It has no per-step run limit I found. Workflow nodes refuse advancing a node whose dependencies are not satisfied (capabilities/workbench.ts:439-440), which is not a duplicate guard.
- Implication: Horizon must enforce one-per-(case, step) itself, for example by deriving the assignment id or idempotency key from `case:step`.

## 3. Deep link to a session or turn

Not found. I searched `location.hash`, `searchParams`, `pushState` and `/session/` in WB/src.
- The only hash route is `#plugins/<id>` (WB/src/ui/App.tsx:4449-4468). The mobile app uses `#p=<pairing>` (src/ui/mobile/MobileApp.tsx:86). `?session=` at server.ts:1028 and 1037 belongs to the terminal and browser websocket streams, not the UI.
- Identifiers that exist: `sessionId` (a UUID, durable via `session.created`, src/projections/sessions.ts:63-76; correlationId is `session:<id>`, sessions.ts:25), `runId`, `workspaceId`, `eventId` and stream `position`. A turn is the `session.turn.started` event (sessions.ts:81). I found no turn index or turn id of Workbench's own (a `turnId` exists only inside the Codex harness adapter, agents/harness/adapters/codex.ts:25). A turn would have to be addressed as (sessionId, nth `session.turn.started`) or by event id. Horizon would have to add a hash-route in the UI.

## 4. ExpertsService.context and team memory

Confirmed. `context()` is at WB/src/experts/service.ts:138. The note filter (lines 139-142) is:
- Solo conversation: only that expert's `personal` memory.
- Otherwise: memory of the conversation's team where the scope is `team`, or where the scope is `private-team` and the memory belongs to this expert.
- Notes are sorted pinned first, wrapped as "UNTRUSTED RETAINED ..." data, and fitted to the context budget (service.ts:143-157).

Isolation tests exist, in WB/test/J-EXPERT-memory.test.ts (it covers the expert-memory path, not a role called "reviewer"):
- Lines 43-48: Builder's context has its private team note and the shared team note. Critic's context has the shared note but not Builder's private one.
- Lines 50-54: `expert.memory.read` as Critic returns nothing for Builder's private memory.
- Lines 56-61: a second team does not see the first team's private note.
- Line 68 checks the solo context. Lines 80-101 check that private-team conversations are hidden from the public view.
- I found no test where the role is literally "reviewer". The Critic case is the nearest. J-TEAM-evaluation.test.ts and J-WB-review-gate.test.ts also mention reviewers, but I did not check what they cover.

## 5. Data locations

- Workbench data home: `COGNATE_WORKBENCH_HOME`, falling back to `COGNATE_HARNESS_HOME`, then a computed default (WB/src/cli.ts:93, 149; src/resources.ts:25-30). The default is `<checkout>/.data` when run from source, and `$XDG_DATA_HOME` or `~/.local/share/cognate-workbench` on Linux when packaged. It holds the lock file, secrets, `sxr-repo`, `sxr-data` and `sxr-state` (server.ts:846-847).
- Cognate DurableStore (the database): chosen in WB/src/store.ts:25-33.
  - If `COGNATE_POSTGRES_URL` is set (a secret, redacted in the config UI: src/configFile.ts:21-26), it uses that external PostgreSQL.
  - Otherwise a packaged install uses its bundled pg0 instance (cli.ts:99-117), named per data home (src/pg0Launch.ts:39, name override `COGNATE_PG0_NAME`).
  - Otherwise (dev) it uses pg0 instance `cognate-dev` (store.ts:33).
  - Within a database, the schema is derived from the data-home path (`cognate_harness_<sanitised path tail>`, store.ts:9-12).
  - The Cognate runtime-bun also supports SQLite by file path (CG/packages/runtime-bun/src/index.ts:39-45), but Workbench does not use it.
- Port: `PORT` (cli.ts:93). The server refuses to start if the port is busy (cli.ts:81-86).
- Side by side: yes. Set a different `COGNATE_WORKBENCH_HOME` and `PORT` for the test instance. A packaged install then gets its own pg0 instance. An external PostgreSQL gets its own schema (derived from the home path), or use a different URL. The home lock only blocks two instances on the same home (cli.ts:67-72). In dev without the external URL, both instances would share pg0 instance `cognate-dev` unless `COGNATE_PG0_NAME` differs, though their schemas would still differ. I did not verify that two instances can share one pg0 safely.

## 6. Workbench to RealityTrace

- Only these event types are queued for RealityTrace (WB/src/observations.ts:28-33): `tool.call.started`, `tool.call.completed`, `tool.call.failed`, `message.completed`, `run.failed`, plus cognitive-navigation evidence (`verification.observed`, `world.*`, `sentinel.finding`, `experiment.round.completed`, `method.recommended`, `method.accepted`). The hook is `observationOutboxFor` (observations.ts:46-51; wired at server.ts:604-607).
- Confirmed not sent: model requests and user turns. `session.turn.started` (the user turn) and any model-request events are not in the allow-list, so no observation intent is created for them.
- Caution: `message.completed` is the assistant's final answer event (agents/agentCoding.ts:507, 597, 805; agentHarness.ts:158). The event is selected, but the intent carries identifiers and metadata only: ids, tenant, correlation and causation ids, run and scope ids, component, semantic ref, classification, capability id and timestamp (CG/packages/realitytrace/src/index.ts:16-34). Workbench passes no `inputRef`, `outputRef` or `trace`, so the message text is not in the observation. I did not trace what the SXR CLI port then writes.
- Delivery is an at-least-once background drain from the outbox to the SXR binary (observations.ts:92-105). It can be gated by the RealityTrace plugin setting (server.ts:848-856).
- Separate path: governed settlement (src/settlement/realitytrace.ts) has RealityTrace run a task's declared verifier and read the evidence back. It is off unless all three `COGNATE_REALITYTRACE_BIN`, `_DATA_HOME` and `_STATE_HOME` are set (realitytrace.ts:19-27), and it also needs `COGNATE_GOVERNANCE=sea-forge` (server.ts:426-427). That path is not covered by the allow-list above.
- Snapshot placeholder confirmed. `sxr-cli.ts:111` is `run begin ... --snapshot "snapshot:genesis"`. CG/packages/realitytrace/src/EGM.md:36 documents it. It is a constant, not a real semantic snapshot.

## 7. GitHub integration

None found. I searched WB/src, WB/scripts, CG/packages and CG/scripts for octokit, `api.github.com`, `gh` CLI calls, GITHUB_TOKEN and GH_TOKEN, and issues or projects URLs, in .ts, .tsx and .json files. All hits are incidental:
- A picomatch attribution URL (WB/src/workbench/glob.ts:1).
- Install hints for third-party agent CLIs: Copilot, Gemini, Qwen (WB/src/agents/harness/catalog.ts:166-232).
- The Copilot config roots in agent discovery (CG/packages/agent-discovery/src/index.ts:63).
- A pg0 URL comment (CG/packages/store-postgres/src/pg0.ts:2).

`gitOps.ts` is local git. Workbench has `.github/actions` and `.github/workflows` for its own CI.
