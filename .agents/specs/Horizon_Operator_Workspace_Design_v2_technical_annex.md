# Technical Annex — Horizon Operator's Desk, v2

Companion to `Horizon_Operator_Workspace_Design_v2.md`. The design holds no file names, so this annex holds them all. Rulings D1–D12 of `.agents/reports/2026-11-06-v2-readiness-review/dispositions.md` are applied. Facts were checked in code on 2026-11-06 unless marked **check first** (CFn, listed in §H with the exact command). A check must be confirmed before its stage starts. If it fails, re-plan the stage; do not work around it.

## 0. Glossary (design word -> code name)

| Design word | Code name |
| --- | --- |
| Case keeper | SEA-Forge, repo `sea-rs`, binary `sea-forge-server`, socket protocol SFWP (NDJSON over a Unix socket) |
| Workshop | `cognate-workbench` (grew out of the "DeepSeek-derived agent tool"; there is no separate tool or repo) |
| Record keeper / record | RealityTrace, CLI `realitytrace` (not `sxr`); a record is one ledger entry |
| Check code / version code | `sha256:<hex>` digest of canonical content |
| Rulebook edition | the DomainForge snapshot id passed as `--snapshot` to `run begin` |
| Case / step | SEA-Forge case / `PlanItem` |
| Desk | the new Horizon UI under `src/ui/desk/` |
| Personal record | the operator's existing RealityTrace ledgers written by the `~/.agents` tap; read-only for Horizon, never cleared |
| Test setup record / production record | RealityTrace data under that setup's folder (D1) |
| Connector | `connectors/github/` in Horizon |
| Presenting | name stand-ins (D4) |
| Final sign-off | `POST /workspace/settle` (cannot be undone) |

## 1. Repositories and tools (absolute paths)

| Tag | Path | Role |
| --- | --- | --- |
| H | `/home/sprime01/projects/Horizon` | Horizon (this repo) |
| S | `/home/sprime01/projects/sea-rs` | SEA-Forge. Server crate `crates/sea-forge-server`, core crate `crates/sea-forge-core` |
| C | `/home/sprime01/projects/cognate` | Cognate and RealityTrace TS port (`packages/realitytrace`) |
| W | `/home/sprime01/projects/cognate-workbench` | Workshop |
| PA | `/home/sprime01/projects/product-actualizer` | Cockpit (`cockpit/protocol`, `cockpit/web`) |
| DF | `/home/sprime01/projects/domainforge` | DomainForge source (remote `GodSpeedAI/DomainForge`). The CLI is installed: `domainforge 0.21.2` on PATH (mise shim) |
| AG | `/home/sprime01/.agents` | Private. The tap lives in `lib/te-rt/` (`tap.py`, `drain.py`, `journeys.py`, `rtcore.py`). Structure and field names only |
| (none) | `gs-term` | Not used by any stage. Removed from the list (N3) |

Installed binaries: `sea-forge-server` (`~/.local/bin`, also built at `S/target/release/sea-forge-server`), `realitytrace 0.3.0`, `gh`, `bun`, `cargo`, `domainforge` (mise shims). `curl` is not used anywhere in this plan.

## A. Code facts the design relies on

| Fact | Evidence |
| --- | --- |
| 15 screen parts, strict checker, 64-part cap | `[H] src/ui/surface2/grammar.ts:350-366`, `:369` `MAX_BLOCKS = 64`; intents `:38` `SURFACE_INTENTS`; roles `:34` `SURFACE_ROLES`. `[H] test/surface-negative.test.ts:362` asserts `BLOCK_TYPES.length` is 15 |
| Parts layer kept free of app imports by guards | `[H] scripts/check-t05-boundaries.ts`, `scripts/teeth-t05-*.ts`, `.agents/prereg/horizon/T05.prereg.yaml` (`scripts/teeth-t05-mutation.ts` and the prereg also name the block list) |
| Cockpit has the same 15 names, different format | `[PA] cockpit/protocol/spec.ts:175` `BLOCK_TYPES`, `:181` intents, `:183` `max(12)`; zod 4 vs Horizon's 3.25.76; different reference shapes; web-coupled blocks; server-only binder; no client build in Horizon. **So there is no shared package.** |
| Seven checks | `[H] src/domain/navigation.ts:23-31` `GATE_KEYS`; test `test/navigation-controller.test.ts:171` |
| Approval inbox | `[H] src/domain/approval-inbox.ts:100` `buildInbox` |
| Case states | `[S] crates/sea-forge-core/src/types.rs:16` (active, awaiting_approval, completed, terminated) |
| Step kinds | `[S] crates/sea-forge-core/src/types.rs` `ItemKind` `:51-60` (seven kinds incl. `HumanTask`, `AgentTask`); `ItemMarkers` `:63` = `required`, `repetition`, `manual_activation`; `PlanItem` `:104` has `proposed_by` (overwritten by the verified actor) and no outside link. `proposed_by` is part of the plan's canonical hash |
| Adding a step | Wire verb `case_add_item` `{case_id, item: PlanItem, policy, request_id}` (`[S] crates/sea-forge-server/src/lib.rs:1156`, handler `:3237`). `PlanItem` needs `plan_item_id`, `name`, `settlement_criteria`. `case_commit` creates a case from a template and does not add steps |
| Wire client | `[H] src/adapters/sea-forge-approvals.ts:110` `seaForgeCall(socketPath, {verb, ..., request_id, actor, on_behalf_of})`; same in `[W] src/capabilities/governance.ts:56` |
| Preconditions | `[S] crates/sea-forge-server/src/sfwp/precondition.rs`: `Precondition{policy_bundle_digest, records: Vec<RecordDigest>}` `:18`, `RecordDigest{ref, expected_digest}` `:36`, `RejectedAsStale` `:56` (`outcome: "rejected_as_stale"`, `code: "precondition_failed"`), `digest_of` `:82`, `evaluate` `:119`, max 16 records. `case_commit` takes `preconditions` (`lib.rs:1084`, handler `:3175`, check `:3189`); `approval_decide` (`:1118`, `:3170`, `:3725`). `TemplateRecordResolver` (`lib.rs:3577`) resolves `template:` only; `LedgerRecordResolver` (`:3656`) resolves ledger refs. `preflight` is `[S] crates/sea-forge-server/src/sfwp/case.rs:184`, template digest `:149` |
| No preview verb for adding a step | The request enum has `CasePreflight` (`lib.rs:1058`) and `DelegationPreview` (`:1142`) only. See finding F1 in §H |
| Self-approval refused | Horizon commit `18f0c40` plus the SEA-Forge approval rule |
| Expectation before check | `[H] src/adapters/realitytrace-obligation.ts`: `declare(intentId, expectation)` `:100`, `run(threshold, argv, launcher, timeoutS)` `:116`; `TARGET = "concept:navigation_intent"` `:50` used in `run()`; snapshot literal `snapshot:horizon` in `run()`; private `sxr()` `:57` uses `spawnSync`, 120 s timeout; env `XDG_DATA_HOME`/`XDG_STATE_HOME` from `config.dataHome`/`stateHome` |
| Record write path (RealityTrace CLI) | `question declare`, `threshold declare`, `run begin --repo --snapshot --question --threshold [--require-declared]`, `plan create --run --verifier --target`, `verify run`, `ingest --run --verifier --stdin-format agent-event-v1 [--extensions JSON]`, `snapshot create --repo` |
| Record read path | CLI only: `repo list`, `ledger export --repo <id> --json`, `projections export`. No date filter. Allow-list `READ_ONLY_COMMANDS` `[H] src/adapters/realitytrace-economics.ts:53` (+ `src/config/types.ts:42`). Readers: `realitytrace-economics.ts:56,:93` (512MB buffer, `rowsOf`) and `src/adapters/settlement.ts:159`. **Extend these; no third reader.** Ledgers: ~204MB total, largest 45.7MB. Fixture rows: `[H] test/support/economics-fixture.ts` (`sampleLedger()`, `agentEvent`, `observation`) |
| Tap rows | Tap writes `ingest ... --verifier agent-tap/<runtime> --stdin-format agent-event-v1` (`AG lib/te-rt/drain.py:757`). Event fields: `schema, event_id, source, runtime, native_session_id, native_event_ref, kind, ts, observed_at, case_id, unit_id, te_session_id, role, arm, repo, worktree, branch, tokens, token_quality, owner, payload_ref, exit_code`. Per (session, question) it already writes one `journey_check` event (`drain.py:870` `journey_event`, `:909` `journey_pass`) with `payload_ref` `journey:<question id>` and `exit_code`. Score is computed at read time (`journeys.py:1285` `build_score`; `read_observations` `:1259`). Tap tests: `AG tooling/te-integration/tests/test_journeys.py` |
| Store interface | `[C] packages/events/src/types.ts:191` `DurableStore`: `commit(request)` atomic (`CommitRequest.records` `:154`, `RecordWrite` `:76`), `getRecord`, `listRecords(collection, where)`, `claimOutbox`/`settleOutbox`. Pattern: `[H] src/capabilities/workspace-records.ts` (`horizon-cases`, `horizon-onboarding`, `checkPurpose`) |
| Transport | `connectTransport` (`@godspeedai/cognate-protocol-connect-bun`) -> `createRemoteRuntimeService` (`@godspeedai/cognate-protocol-connect`) -> `createClient` (`@godspeedai/cognate-client`). All vendored in `[H] .cognate/vendor/` (`package.json` lines 18, 40, 42-43); Horizon already calls `createClient` (`src/ui/workspace/render.tsx:15,:952`). Auth: `Bearer` `wbs1.` session token. Example: `[W] test/J-AUTH-SESSION.test.ts:19,:46` |
| Workshop session issue | Capability `identity.session.issue` (`[W] src/capabilities/identityAdmin.ts`): input `{tenant, actorId, label?, ttlHours? (1..2160), cause?}`; operator only; returns the token once. The operator's boot token exists only inside the served browser bundle (`[W] src/server.ts:743`, `:972-981`) - see F2 |
| Workshop record location | Workshop writes its own record under `<COGNATE_WORKBENCH_HOME>/sxr-data` and `/sxr-state` (`[W] src/server.ts:872`), binary from `SXR_BIN` (`[W] src/observations.ts:56`). Sent: 14 event types only (`observations.ts:28-33`); model requests and user turns are not. Observations carry refs only (`inputRef`/`outputRef` strings, `[C] packages/realitytrace/src/types.ts:20-21`) |
| Workshop deep links | Only `#plugins/<id>` (`[W] src/ui/App.tsx:4452-4467`). Identifiers: `sessionId`, `runId`, `eventId`; correlation payload `extensions.cognate` (`[C] packages/realitytrace/src/sxr-cli.ts:183`) |
| Workshop start | `[W] src/cli.ts`: `start`, `launch`, `stop`, `doctor`; env `PORT` (3180), `COGNATE_WORKBENCH_HOME`, `COGNATE_POSTGRES_URL`, `COGNATE_NO_WINDOW`; `/health` answers when up. Packaged binary: `[W] dist-package/cognate-workbench-0.1.0-linux-x64/bin/cognate-workbench` (bundled pg0 only when packaged; a source run uses a development pg0 - CF3) |
| Reviewer memory | `[W] src/experts/service.ts:138` `context(state, expert, conversation)` includes team-scoped memory (`ExpertMemory{expertId, teamId, scope, by, sources}` `src/experts/types.ts:82`). `[W] test/J-EXPERT-memory.test.ts` tests the Critic role only |
| Assignment identity | `[W] src/experts/service.ts:167` throws "Assignment identity already exists". Assignments start through `expert.converse` / `team.converse` (`service.ts:~392-413`, takes `requestId`) |
| Placeholder rulebook | `snapshot:genesis` at `[C] packages/realitytrace/src/sxr-cli.ts:111`. Cognate owns the change. Tests: `[C] packages/realitytrace/test/sxr-cli.test.ts` |
| Failed delivery wording | Code says "poison"; desk says "set aside - needs you" |
| Org id | `[H] src/config/load.ts:320` `tenant: local:${hostname()}` |
| Store setting | `HORIZON_STORE` overrides `config/horizon.toml:6` (`runtime_store`) when set (`load.ts:308`) |
| Ignite | `[H] scripts/ignite.ts`: `--cell DIR` (default `$XDG_DATA_HOME/horizon/cell`), starts `sea-forge-server` (`SEA_FORGE_ROOT=cell`, `SEA_FORGE_SOCKET`) then `bun run src/main.ts` with `HORIZON_STORE=cell/app.sqlite`, `HORIZON_SECRET_FILE`, `COGNATE_SEA_FORGE_SOCKET`, `COGNATE_REALITYTRACE_DATA_HOME=cell/realitytrace/data`, `..._STATE_HOME=cell/realitytrace/state`; `--unisolated-development` runs the gateway as this account; honours `SEA_FORGE_SERVER_BIN`, `REALITYTRACE_BIN`, `HORIZON_CONFIG`. Horizon port comes from the config file (`port = 4319`); health `GET /health` |
| GitHub | No integration in Workbench or Cognate. `gh` logged in as `SPRIME01`; on 2026-11-06 `gh auth status` lists scopes `repo`, `project`, `read:org`, `workflow`, `gist`, `admin:public_key` (**`project` is now present**; no `delete_repo`). `GodSpeedAI/horizon-sandbox` does **not** exist yet. Sub-issue support unverified (CF2) |
| Cockpit agent-panel API | Agent tools `[PA] cockpit/protocol/tools.ts`: `show_surface` `:27`, `ask_human` `:33`, `arrange` `:35`, `annotate` `:37`, `read_responses` `:39`. Human ops `[PA] cockpit/protocol/actions.ts`: `human.answer` `:39`, `human.pin` `:53`, `human.close`, `human.open` `:56`. Panel type `[PA] cockpit/web/store.ts:4` |

## B. Routes of the current desk and where each goes (stage 3)

All routes are in `[H] src/app.ts`.

| Route | Line | Lands in (desk file) |
| --- | --- | --- |
| GET `/workspace` | 1379 | Today (`src/ui/desk/views/Today.tsx`) |
| GET `/workspace.json` | 1417 | Kept as the read model (renamed after cut-over) |
| GET `/workspace/economics` | 1427 | Work -> cost per accepted outcome (`src/ui/desk/views/Cost.tsx`); guidance moves to "not recorded" reason lines |
| GET `/workspace/approvals` | 1435 | Decide (`views/Decide.tsx`) |
| GET `/workspace/inspect` | 1439 | `Inspector.tsx` |
| POST `/workspace/intent` | 1468 | `Composer.tsx` (Hand off -> preview) |
| POST `/workspace/case` | 1518 | Explore -> Cases (`views/Explore.tsx`), status bar "Case" |
| POST `/workspace/onboarding/skip`, `/resume` | 1526, 1530 | empty-state next steps in Today |
| POST `/workspace/approval` | 1534-1552 (`approvalInbox` at 1168) | `DecisionCard.tsx` confirm |
| POST `/workspace/settle` | 1553 | `DecisionCard.tsx` on an acceptance check, with preview and typed reason |
| `/workspace/remote` and `/status`, `/events`, `/start`, `/refresh`, `/stop` | 1570-1621 | **Kept**; moved under the status bar settings menu (`StatusBar.tsx`). `src/remote/panel.ts` unchanged |
| `/health` | 1300 | kept |

Old render files: `[H] src/ui/workspace/render.tsx` (D, stage 3), `approval-inbox.tsx` (D), `economics.tsx` (D after the cost view works). Kept: `model.ts`, `inspect.ts`. The `STYLE` export (`render.tsx:777`) is replaced by `import { stylesheetPaths } from "@godspeedai/cognate-ui-astryx/styles"` in `scripts/build-desk.ts` (same import as `[W] scripts/package.ts`).

Tests that import the old pages (the only ones affected): `test/workspace-render.test.tsx` (D, replaced by `test/desk-render.test.tsx`), `test/workspace-teeth.test.tsx` (D, replaced by `test/desk-teeth.test.tsx`), `test/economics-view.test.tsx` (D, replaced by `test/desk-cost.test.tsx`), `test/approval-inbox.test.ts` (M: import path). `test/ui.test.ts`, `workspace-model.test.ts`, `workspace-onboarding.test.ts`, `workspace-primary-action.test.ts` do not import the old pages and are kept unchanged.

### B.1 Desk views and components (all under `[H] src/ui/desk/`; created in the stage shown)

| File | Piece | Stage |
| --- | --- | --- |
| `client/main.tsx` | bundle entry; polling `GET /desk/state.json?since=<rev>` every 2000 ms | 2 |
| `Desk.tsx` | layout: status bar, left column, open view, inspector, composer | 2 |
| `StatusBar.tsx` | org, edition, open case, count waiting, per-part health words, Setup badge ("Setup: testing"), Presenting switch, key-expiry warning (<= 7 days), settings menu (remote) | 2 (Presenting switch from stage 1 on the compare page) |
| `Nav.tsx` | four views, Days/Cases/Tags lists | 2 |
| `views/Today.tsx`, `views/Explore.tsx` | Today, Explore | 2 |
| `views/Decide.tsx`, `DecisionCard.tsx`, `Preview.tsx` | Decide, decision card, preview | 3 |
| `views/Work.tsx`, `views/Cost.tsx` | Work, cost per accepted outcome | 3 |
| `ComparisonView.tsx`, `LabelControl.tsx` | comparison view and label control (model from stage 1) | 3 (stage 1 uses the server page) |
| `Inspector.tsx` | inspector | 2 |
| `Composer.tsx` | composer: Write, Find, Ask in 2; Hand off in 4 | 2, 4 |
| `NoteEditor.tsx` | note part | 2 |
| `Panels.tsx` | agent panels (<= 8 open) | 4 |
| `keys.ts` | key table of design §5.4 | 2 |
| `attention.ts` | pure functions for the nine rules | 2 |
| `model.ts` | desk view-model built from `src/ui/workspace/model.ts` | 2 |

## 5.2 Attention rules, copied from the design, with their tests

All in `[H] test/desk-attention.test.tsx`, run with `bun test test/desk-attention.test.tsx`. Test name = `attention rule N: <behaviour>`.

| N | Trigger | Expected behaviour | Test name | Stage |
| --- | --- | --- | --- | --- |
| 1 | Two decisions pending | At most one thing uses the highlight colour; others show "1 of N" | `attention rule 1: two pending decisions render exactly one highlighted card` | 3 |
| 2 | 50 agent updates arrive while the operator types | Only counts, list ends and inspector change; cursor, selection and open layers unchanged | `attention rule 2: 50 agent updates leave cursor, selection and layers unchanged` | 2 |
| 3 | Three layers open, Esc pressed three times | Each Esc closes one layer; focus returns to the start | `attention rule 3: Escape three times returns focus to where it started` | 2 |
| 4 | A mix of count, notice and decision events | Counts beside view names, notices wait in Decide, cards show age and can be held with a reason; right counts and order; focus unchanged | `attention rule 4: a mix of events gives the right counts and order without moving focus` | 3 |
| 5 | Scrolled up while items are added | Position holds; shows "N new" with a correct N | `attention rule 5: scroll position holds and N new is correct` | 2 |
| 6 | Colour removed | Every state is still told apart by words from §2 | `attention rule 6: with colour removed every state is distinguishable` | 2 |
| 7 | A step has no record | Shows "not recorded", counts as unchecked, never 0 or "passed"; a note cannot make a check pass | `attention rule 7: a step with no record shows not recorded and counts as unchecked` | 2 |
| 8 | A relied-on record is contradicted | It sorts first in its view (Work), in words | `attention rule 8: a contradicted record is the first item in Work` | 3 |
| 9 | Source of a pinned item changes | Mark "changed since you looked" appears; content unchanged | `attention rule 9: changing the source marks the pin and leaves content unchanged` | 2 |

Rules 6 and 7 need the stage-1 comparison model; rule 8 needs the stage-3 Work view.

## C. Setup mapping (D2). One table, one source of truth in `[H] src/config/setup.ts`

`HORIZON_SETUP` = `testing` | `production`, parsed in `[H] src/config/load.ts`. Unset: behaves as today (org id `local:<hostname>`, config as given) and the status bar shows "Setup: not set". Any other value is refused. When set, `<root>/SETUP.json` must exist.

| Item | testing | production |
| --- | --- | --- |
| Root | `/home/sprime01/.horizon/setups/testing` | `/home/sprime01/.horizon/setups/production` |
| Marker | `<root>/SETUP.json` = `{name, root, createdAt}` | same |
| Org id | `local:<hostname>:testing` | `local:<hostname>` (unchanged) |
| Horizon config | `HORIZON_CONFIG=<root>/horizon.toml` (copy of `config/horizon.toml`, port and `[records]`, `[workshop]`, `[ui]` sections changed) | same |
| Horizon port / phone listener | 4339 / 4340 | 4319 / 4320 |
| `HORIZON_STORE` | `<root>/cell/app.sqlite` (ignite sets it) | same |
| Case-keeper data `SEA_FORGE_ROOT` | `<root>/cell` | same |
| `SEA_FORGE_SOCKET` | `<root>/cell/sea-forge.sock` (ignite may move it to `$XDG_RUNTIME_DIR` when the path is too long; ignite prints the final path) | same |
| `SEA_FORGE_SERVER_BIN` | `/home/sprime01/projects/sea-rs/target/release/sea-forge-server` | same until the gateway is rebuilt |
| Horizon's own record writes | `COGNATE_REALITYTRACE_DATA_HOME=<root>/cell/realitytrace/data`, `..._STATE_HOME=<root>/cell/realitytrace/state` (the adapter turns these into `XDG_DATA_HOME`/`XDG_STATE_HOME` for the child process only) | same under production root |
| Workshop home `COGNATE_WORKBENCH_HOME` | `<root>/workbench` | same |
| Workshop port `PORT` | 3190 | 3180 |
| Workshop database | bundled pg0 under `<root>/workbench` (packaged binary; CF3). No `COGNATE_POSTGRES_URL` | same |
| Workshop's own record | `<root>/workbench/sxr-data`, `sxr-state` | same |
| Workshop binary for RealityTrace | `SXR_BIN=$(command -v realitytrace)` | same |
| Personal record | no override (RealityTrace default location); read-only | same |
| Secrets | `<root>/secrets/workbench.key`, `workbench.key.json` (`{label, expiresAt}`, no secret), `presenting.key` | same |
| Exports | `<root>/exports/` | same |
| GitHub repo / board | `GodSpeedAI/horizon-sandbox` / "Horizon testing" | real repos / "Horizon" (named by the operator at ship time) |
| Record sources Horizon reads (`[[records.sources]]` in `horizon.toml`) | `personal` (no paths), `workshop` (workshop record dirs), `horizon` (Horizon's record dirs) | same |

The "production starts empty" check covers every path under the production root, Horizon's production store, the workshop and Horizon record dirs, and GitHub production items. The personal record is excluded by name (`--exclude personal`).

## D. Standing procedures

**Start (testing).** Four terminals, in this order. Each prints its URL.

| Service | Start | Health check |
| --- | --- | --- |
| Workshop | `cd /home/sprime01/projects/cognate-workbench && set -a && eval "$(cd /home/sprime01/projects/Horizon && bun run scripts/setup-env.ts testing --service workbench)" && set +a && COGNATE_NO_WINDOW=1 dist-package/cognate-workbench-0.1.0-linux-x64/bin/cognate-workbench start` | `cd /home/sprime01/projects/Horizon && bun run scripts/setup-health.ts --setup testing --only workbench` (GET `/health` ok, `doctor` shows bundled pg0) |
| Case keeper + Horizon | `cd /home/sprime01/projects/Horizon && set -a && eval "$(bun run scripts/setup-env.ts testing --service horizon)" && set +a && bun run ignite --unisolated-development --cell /home/sprime01/.horizon/setups/testing/cell --remote-port 4340` | `... --only horizon` (GET `http://127.0.0.1:4339/health` has `"status":"ok"`) and `--only seaforge` (socket listed by `ss -xl`; `case_list` answers) |
| Record keeper | `realitytrace repo list --json` works with each record source's env | `... --only records` (every `[[records.sources]]` answers `repo list`) |
| Session recorder (tap) | Already runs from the operator's AI-tool hooks; unchanged | `... --only tap` (`~/.agents/state/rt/drain-state.json` modified in the last 24 h) |
| GitHub connector (stage 4) | `cd /home/sprime01/projects/Horizon && set -a && eval "$(bun run scripts/setup-env.ts testing --service connector)" && set +a && bun run connectors/github/index.ts` | `... --only connector` (`<root>/run/connector.heartbeat` modified in the last 30 s) |

`setup-health.ts --setup testing` with no `--only` checks everything that exists for the current stage and exits non-zero on the first failure.

**Build-and-restart rule (D11).** Every stage that changes sea-rs, Cognate or Workbench ends with these steps, once, in this order. Run one build at a time.

1. Memory: `free -m | awk 'NR==2{print $7}'` must print at least 4000 (MB available). If not, close other work first.
2. Build once: sea-rs `cd /home/sprime01/projects/sea-rs && cargo build --release -p sea-forge-server`; Workbench `cd /home/sprime01/projects/cognate-workbench && bun run typecheck` then, to refresh the packaged binary, `bun scripts/package.ts bun-linux-x64 linux-x64` (CF12); Cognate: no build for tests (`bun test`); a Cognate change reaches the workshop through its package (CF4).
3. Stop that service: workshop `cognate-workbench stop` with the setup's `COGNATE_WORKBENCH_HOME`; case keeper: Ctrl-C the `ignite` terminal (it stops its children).
4. Restart with the setup's environment (start commands above).
5. Run the health check for that service.

**Operator-only steps** (an agent never does these; each is marked OP where it occurs):

| ID | Step | When |
| --- | --- | --- |
| OP1 | **Done 2026-11-06:** `GodSpeedAI/horizon-sandbox` was created (private). | Test setup |
| OP2 | `gh` project scope: `gh auth refresh -s project` (already present on 2026-11-06; re-check with `gh auth status`) | Test setup, only if the scope is missing |
| OP3 | In the workshop window started with the test setup's environment, open Settings and click **Connect Horizon** (CF1). The key file appears at `<setup root>/secrets/workbench.key`. | Stage 1 |
| OP4 | Read and confirm the `setup-clear` list, then re-run with `--yes` | Stage 6 |
| OP5 | Production: run `ignite` as the operator, or install the gateway units with `sudo` (`docs/gateway-runbook.md`) | Stage 6 |
| OP6 | Name the production GitHub repositories and board | Stage 6 |

## E. Stages

Reports for every stage go in `/home/sprime01/projects/Horizon/.agents/reports/v2-build/stage-<N>/` (`stage-0` for the test setup). Commands: Horizon tests `cd /home/sprime01/projects/Horizon && bun test <file>`; sea-rs `cd /home/sprime01/projects/sea-rs && cargo test -p <crate> --test <file>`; Workbench `cd /home/sprime01/projects/cognate-workbench && bun test --timeout 15000 <file>`.

### Stage 0 - Test setup (design §9.1; before stage 1)

| Mark | Path | Notes |
| --- | --- | --- |
| C | `[H] src/config/setup.ts` | `parseSetup(env)`, mapping table of §C, `setupEnv(name, service)` |
| M | `[H] src/config/load.ts` | parse `HORIZON_SETUP`; tenant from the table; `[records]`, `[workshop]`, `[ui]` sections. `HORIZON_STORE` still overrides `runtime_store` |
| M | `[H] src/config/types.ts` | types: `RecordSource{name, kind: "personal"\|"workshop"\|"horizon", data_home?, state_home?}`, `WorkshopConfig{url, key_path}`, `UiConfig{timezone}` |
| C | `[H] scripts/setup-env.ts` | `bun run scripts/setup-env.ts <name> [--service workbench\|horizon\|connector]` prints `KEY=VALUE` lines |
| C | `[H] scripts/setup-init.ts` | `--setup <name>`: creates root, `SETUP.json`, `cell/`, `workbench/`, `secrets/`, `exports/`, `run/`, `horizon.toml`, and `secrets/presenting.key` (32 random bytes, 0600, created once) |
| C | `[H] scripts/setup-clear.ts` | `--setup testing [--yes]`: prints every path and every GitHub item (sandbox issues, board "Horizon testing"); without `--yes` stops there. Refuses when the setup is `production`, the marker is missing, or a path resolves outside the root. Deletes the test folder, sandbox issues (GraphQL `deleteIssue`), the board (`deleteProjectV2`). Never deletes a repository; scopes used are `repo` and `project`, never `delete_repo` |
| C | `[H] scripts/setup-check-empty.ts` | `--setup production [--exclude personal]`: counts cases (SEA-Forge `case_list`), `horizon-cases`, `horizon-notes`, `horizon-labels`, ledger rows in the Horizon and workshop record dirs, GitHub production items; exits 0 only if all are zero |
| C | `[H] scripts/setup-health.ts` | checks of §D |
| C | `[H] scripts/setup-github.ts` | `--setup testing`: verifies `project` scope, repo exists, creates board "Horizon testing" if absent, creates two issues and tests sub-issue linking; writes `<root>/github.json` = `{repo, projectNumber, subIssues: true\|false}` |
| C | `[H] test/support/fake-gh.ts` | fake `gh` executable (placed first on PATH) used by connector tests; records calls, can fail on demand |
| C | `[H] scripts/walkthrough-capture.ts` | `--stage N ...`: fetches the listed desk URLs and saves HTML/JSON into the stage report folder |
| C | `[H] scripts/presenting-scan.ts` | `--dir <folder> --setup <name>`: exit 1 if any real repository or project name from `repo list` appears in the files |
| C | `[H] scripts/measure-timings.ts` | writes `timings.md` and `delay.json` (stage 1) |

New records: none. `SETUP.json` fields `name`, `root`, `createdAt`. `horizon.toml` sections as in `types.ts` above.

Tests (`[H] test/setup-config.test.ts`, `test/setup-scripts.test.ts`):

| Name | File |
| --- | --- |
| `HORIZON_SETUP accepts testing and production only` | setup-config |
| `testing setup gives org id local:<hostname>:testing and production keeps local:<hostname>` | setup-config |
| `HORIZON_STORE overrides config/horizon.toml runtime_store` | setup-config |
| `setup env maps every service to paths under the setup root` | setup-config |
| `setup-init creates marker, directories and a 32-byte presenting key once` | setup-scripts |
| `setup-clear lists everything and deletes nothing without --yes` | setup-scripts |
| `setup-clear refuses production` / `refuses a missing marker` / `refuses a path outside the root` | setup-scripts |
| `setup-clear leaves production paths byte-identical` (hashes the production tree before and after; personal record excluded by name) | setup-scripts |
| `setup-check-empty passes on a fresh production and fails when a note, case, label or record exists` | setup-scripts |

Must be running: nothing for the unit tests. For the named checks: `gh`.

Named checks (record the output in `stage-0/checks.md`):

| Check | Command | Pass when |
| --- | --- | --- |
| Project scope | `gh auth status 2>&1 \| grep -c "'project'"` | prints 1 (if 0: OP2) |
| Sandbox repository | `gh repo view GodSpeedAI/horizon-sandbox --json name` | prints the name (if missing: OP1) |
| Sub-issues | `bun run scripts/setup-github.ts --setup testing` | `<root>/github.json` exists; `subIssues` true, or false (then the connector uses the parent-body task list fallback, D6) |
| Board | same script | `projectNumber` is set |

Done when: `bun test test/setup-config.test.ts test/setup-scripts.test.ts` passes; `bun run scripts/setup-init.ts --setup testing && bun run scripts/setup-env.ts testing` succeeds; `stage-0/checks.md` holds the four named checks; `bun run scripts/setup-health.ts --setup testing --only records` passes.
Build-and-restart: none (Horizon only).
Operator-only: OP1 (OP2 only if the scope is missing).

### Stage 1 - See what really happened

Files:

| Mark | Path | Notes |
| --- | --- | --- |
| C | `[H] src/capabilities/labels.ts` | collection `horizon-labels` (below) and `putLabel`, `listLabels` |
| C | `[H] src/ui/workspace/presenting.ts` | `standIn(key, name)`, `applyStandIns(view, key, names)`; one function used by the view-model and by `export.ts`, never per page |
| C | `[H] src/ui/workspace/compare-model.ts` | comparison rows (below), workshop link `${workshop.url}/#sessions/<sessionId>/<eventId>`, "not recorded" with reasons |
| C | `[H] src/ui/workspace/compare.tsx` | server-rendered comparison page with label form and Presenting switch |
| C | `[H] src/adapters/ledger-day.ts` | day filter after `ledger export --repo <id> --json`; cache file `<root>/cache/ledger-<repo_id>.json` keyed by the ledger's last record number |
| C | `[H] src/exports/export.ts` | exports of labels and comparison; written under `<root>/exports/` |
| C | `[H] src/adapters/workshop.ts` | `connectTransport` -> `createRemoteRuntimeService` -> `createClient`, token read from `workshop.key_path`, never logged; key expiry from `workbench.key.json` |
| M | `[H] src/adapters/realitytrace-economics.ts` | `readLedger(source, repoId)` and a list of `RecordSource`s; allow-list unchanged |
| M | `[H] src/app.ts` | `GET /workspace/compare?source=&repo=&day=YYYY-MM-DD&session=`, `POST /workspace/label`, `POST /workspace/presenting`, `GET /workspace/export?kind=labels\|comparison&standins=0\|1` |
| M | `[H] src/capabilities/workspace-records.ts` | collection `horizon-ui-state` (key `presenting:<tenant>:<operator>`, field `on`) |
| M | `[H]` empty folders and stale version notes | find: `find /home/sprime01/projects/Horizon -path ./node_modules -prune -o -type d -empty -print` (expected output after the change: none outside `node_modules`, `.git`, `.cognate`); stale notes: list in `stage-1/cleanup.md` with path and one-line reason |
| C | `[W] src/capabilities/connectHorizon.ts` + a Settings button in the workshop UI | operator-only; calls `identity.session.issue` `{tenant, actorId: "operator", label: "horizon", ttlHours ≤ 2160}`; writes the token to `<dirname(COGNATE_WORKBENCH_HOME)>/secrets/workbench.key` (mode 0600) plus `workbench.key.json` `{sessionId, expiresAt}`; returns only `{sessionId, expiresAt}` to the browser |
| M | `[W] src/ui/App.tsx` | add `#sessions/<sessionId>[/<eventId>]` next to the `#plugins/<id>` hash route (`:4452-4467`) |
| M | `[AG] lib/te-rt/drain.py` | after `journey_pass` (`:909`) write one aggregate `journey_check` event per session: `payload_ref` `journey-score:<te_session_id>`, `exit_code` 0 if every observed declared check passed, else 1 (CF8). Until then the score row reads "not recorded - scored outside the record" |
| M | `[AG] tooling/te-integration/tests/test_journeys.py` | tests below |

Record collection `horizon-labels` (DurableStore, key `label:<tenant>:<sessionId>:<eventId>`): `tenant`, `session_id`, `event_id`, `record_seq` (number or null), `verdict` ("pass" or "fail"), `first_failure` (text, at most 600 chars), `operator`, `created_at`. A relabel is a versioned upsert.

Collection `horizon-ui-state`: `presenting:<tenant>:<operator>` -> `{on: boolean}`.

Comparison model (`CompareRow`): `{row: "expected"|"observed"|"difference"|"rules in force"|"allowed by"|"record intact"|"accepted", agentReports: string|"not recorded", recordShows: string|"not recorded", reason?: string}`. Columns shown: "What the agent reports" and "What the independent record shows". Stage 1 fills `observed` and `difference` from `journey_check` events and marks the rest "not recorded" with a reason.

Presenting: stand-in = `"Project " + first 4 base32 (RFC 4648 upper-case) characters of HMAC-SHA256(<root>/secrets/presenting.key, name)`. If two names in one view get the same stand-in, both extend by one more character. While Presenting is on, exports always use stand-ins. With Presenting off, the export request must carry `standins=0|1`, the UI offers 1 as the default, and a request with neither is refused (400).

Tests:

| Name | File |
| --- | --- |
| `label verdict must be pass or fail` / `recordSeq is optional` / `relabel keeps one current label per run` / `labels are scoped to the org` | `[H] test/labels.test.ts` |
| `day filter keeps only events of the chosen local date` / `cache is keyed by last record number and refreshes when it moves` / `ledger export is read through the allow-list only` | `[H] test/ledger-day.test.ts` |
| `stand-in is Project plus 4 base32 chars of the HMAC` / `stand-in is stable` / `another key gives another stand-in` / `colliding stand-ins extend` / `compare page text has no real project or repository name` / `export with Presenting on uses stand-ins` / `export with Presenting off needs an explicit choice and defaults to stand-ins` | `[H] test/presenting.test.ts` |
| `matched, contradicted and not recorded sessions give the right rows` / `workshop link is #sessions/<sessionId>/<eventId>` | `[H] test/compare-model.test.ts` (uses `test/support/economics-fixture.ts`) |
| `workshop key never appears in logs, records or exports` | `[H] test/workshop-key-secrecy.test.ts` |
| `connect-horizon refuses more than 90 days` / `writes the key with mode 0600` / `never returns the token to the browser` | `[W] test/J-AUTH-CONNECT-HORIZON.test.ts` |
| `deep link #sessions/<sessionId>/<eventId> resolves to the session view` | `[W] test/J-LINK-session-deeplink.test.ts` (render pattern: `[W] test/ui-experts.test.tsx`) |
| `test_session_aggregate_written_once_per_session` / `test_aggregate_ignored_by_read_observations` | `[AG] tooling/te-integration/tests/test_journeys.py` (run `cd /home/sprime01/.agents/tooling/te-integration && python3 -m pytest tests/test_journeys.py -q`) |

Must be running: workshop, case keeper + Horizon, record keeper, tap (start commands in §D).
Done when:
1. `bun test test/labels.test.ts test/ledger-day.test.ts test/presenting.test.ts test/compare-model.test.ts test/workshop-key-secrecy.test.ts` passes; the `[W]` and `[AG]` tests above pass.
2. `bun run scripts/measure-timings.ts --setup testing` writes `.agents/reports/v2-build/stage-1/timings.md` (fields `day_ms`, `lookup_ms`, `compare_ms`, `ledger_bytes`, `repo`) and `delay.json` (`median_ms`, `p95_ms`, `n`, `threshold_ms`). `threshold_ms` is 2000 unless the measurement shows otherwise (D10). If `day_ms` > 1000 on the 45.7MB ledger, the cache is enabled and re-measured.
3. `bun run scripts/walkthrough-capture.ts --stage 1 --sessions matched=<id>,contradicted=<id>,unrecorded=<id>` (three real sessions from the personal record) writes `walkthrough.md`, `compare-matched.html`, `compare-contradicted.html`, `compare-unrecorded.html` and `labels.json` into `stage-1/`. Each session is labelled.
4. With Presenting on: `bun run scripts/presenting-scan.ts --dir .agents/reports/v2-build/stage-1 --setup testing` exits 0, and so does the same scan on the file written by `GET /workspace/export?kind=comparison`.
5. `bun run scripts/setup-health.ts --setup testing` exits 0.
Build-and-restart (D11): workshop change (deep link, identity CLI) -> repackage and restart the workshop. Tap change: no build; run pytest.
Operator-only: OP3 (issue the workshop key and record its `expiresAt` date).

### Stage 2 - Notebook and live desk

Files:

| Mark | Path | Notes |
| --- | --- | --- |
| C | `[H] src/domain/note.ts` | Zod `NoteInput`, `NoteLink` |
| C | `[H] src/capabilities/notes.ts` | `saveNote`, `listDay`, `listCase`, `search`; one `commit()` per save |
| M | `[H] src/ui/surface2/grammar.ts` | add block type `note` (16th) and intent `write`; roles unchanged (notes are human-authored) |
| M | `[H] test/surface-negative.test.ts` | `:362` -> 16; `:354` comment |
| M | `[H] scripts/teeth-t05-mutation.ts`, `.agents/prereg/horizon/T05.prereg.yaml`, `T05.prereg.interpretation.yaml` | update the block list; CF10 on whether the prereg files are frozen |
| C | `[H] scripts/build-desk.ts` | `Bun.build` of `src/ui/desk/client/main.tsx` -> `dist/desk/app.js` plus the stylesheets from `stylesheetPaths()` -> `dist/desk/app.css`. `@godspeedai/cognate-react` and `cognate-ui-astryx` ship source (`src/index.tsx`), so they are bundled, not reused as prebuilt |
| C | `[H] src/ui/desk/**` | files of §B.1 marked stage 2 |
| M | `[H] src/app.ts` | `GET /desk`, `GET /desk/app.js`, `GET /desk/app.css`, `GET /desk/state.json?since=`, `POST /desk/note`, `GET /desk/search?q=` |
| M | `[H] src/config/load.ts`, `types.ts`, `config/horizon.toml` | `[ui] timezone` (default: system zone from `Intl.DateTimeFormat().resolvedOptions().timeZone`) |
| M | `[H] package.json` | script `"build:desk": "bun run scripts/build-desk.ts"` |

Collections (DurableStore, `workspace-records.ts` pattern; no raw SQL, no per-note record-keeper entries):

| Collection | Key | Fields |
| --- | --- | --- |
| `horizon-notes` | `note:<uuid>` | `note_id`, `tenant`, `operator`, `created_at`, `day` (YYYY-MM-DD in `ui.timezone` at write time), `case_ref` (or null), `head_rev` |
| `horizon-note-revisions` | `note:<uuid>:rev:<n>` | `note_id`, `rev`, `body`, `author`, `at`, `links[]` ({kind: case\|step\|session\|record\|day\|note, ref}) |
| `horizon-note-placements` | `place:<note_id>:<kind>:<ref>` | `note_id`, `kind` (day\|case), `ref`, `at` |
| `horizon-tags` | `tag:<tenant>:<name>` | `name`, `tenant`, `note_ids[]` |

Day key: `(tenant, operator, local date)`. Visibility is filtered before counting. Live updates: polling, 2000 ms.

Tests (`bun test test/notes.test.ts test/desk-attention.test.tsx test/desk-keys.test.tsx test/surface-negative.test.ts`):

| Name | File |
| --- | --- |
| attention rules 2, 3, 5, 6, 7, 9 (names in §5.2) | `test/desk-attention.test.tsx` |
| `shortcuts do not fire while typing` / `Ctrl+K focuses the composer` / `Ctrl+1..4 switch views` | `test/desk-keys.test.tsx` |
| `a save is one commit` / `crash in mid-save keeps the previous revision` (store wrapper throws inside `commit`) / `two-organization count: counts never include another org's notes` / `visibility is filtered before counting` / `day key follows the chosen time zone around midnight` / `tags and placements round-trip` | `test/notes.test.ts` |
| `note block is accepted and the vocabulary is closed at sixteen` | `test/surface-negative.test.ts` |
| `desk bundle builds and /desk/app.js is served` | `test/desk-render.test.tsx` |

Must be running: as stage 1.
Done when:
1. All tests above pass; `bun run scripts/check-t05-boundaries.ts` and `bun run scripts/teeth-t05-mutation.ts` pass; `bun run build:desk` succeeds.
2. `bun run scripts/walkthrough-capture.ts --stage 2` saves `.agents/reports/v2-build/stage-2/walkthrough.md` and the pages for: write a note, tag it, link it to a case, close Horizon (stop `ignite`), restart, find it by date (`/desk/search?q=...&day=`) and by tag. Author, revision history and case link are present in the saved JSON.
3. `bun run scripts/setup-health.ts --setup testing` exits 0.
Build-and-restart: none (Horizon only); restart `ignite` after `build:desk`.
Operator-only: none.

### Stage 3 - Decide with a preview

Files:

| Mark | Path | Notes |
| --- | --- | --- |
| M | `[S] crates/sea-forge-server/src/sfwp/case.rs` | `PreflightResult` gains `plan_precondition: Option<RecordDigest>` (`serde(default, skip_serializing_if = "Option::is_none")`): ref `plan:<template_ref>`, digest = `digest_of(canonical JSON {template_sha256, params, items})` |
| M | `[S] crates/sea-forge-server/src/lib.rs` | new `PlanRecordResolver{root, template_ref, params}` used by the `CaseCommit` arm (`:3189`) next to `TemplateRecordResolver` (`:3577`). A mismatch returns the existing `RejectedAsStale` (`outcome: "rejected_as_stale"`, `code: "precondition_failed"`); no other check or field is added. `ApprovalDecide` already evaluates preconditions (`:3170`, `:3725`) |
| M | `[S] docs/reference/sfwp-protocol-reference.md` | document `plan:` refs; also add `case.add_item` (missing) |
| C | `[H] src/adapters/sea-forge-case.ts` | over `seaForgeCall`: `preflight`, `commit` (with preconditions), `decide` (with preconditions), `addItem` (stage 4). Preview code = the `RecordDigest[]` the card was built from (CF9 for decisions) |
| C | `[H] src/ui/desk/views/Decide.tsx`, `DecisionCard.tsx`, `Preview.tsx`, `views/Work.tsx`, `views/Cost.tsx`, `ComparisonView.tsx`, `LabelControl.tsx` | §B.1 |
| M | `[H] src/app.ts` | routes of §B re-pointed to the desk; the three old page imports (`:80-82`) removed |
| D | `[H] src/ui/workspace/render.tsx`, `approval-inbox.tsx`, `economics.tsx` | only after `test/desk-parity.test.tsx` passes; `economics.tsx` only after `test/desk-cost.test.tsx` passes |
| D | `[H] test/workspace-render.test.tsx`, `workspace-teeth.test.tsx`, `economics-view.test.tsx` | replaced by `desk-render`, `desk-teeth`, `desk-cost` |
| M | `[H] test/approval-inbox.test.ts` | import path |

Parity = `test/desk-parity.test.tsx` passes. Its tests, one per row of §B: `GET /workspace content is in Today`, `workspace.json read model unchanged`, `economics content is in Work cost`, `approvals content is in Decide`, `inspect content is in the inspector`, `intent goes through the composer`, `open case is in Explore`, `onboarding skip and resume are in Today`, `approval confirm works from the card`, `settle needs preview and typed reason`, `remote panel is under settings`.

Tests:

| Name | File |
| --- | --- |
| `plan_digest_covers_template_params_and_items` / `plan_digest_mismatch_is_rejected_as_stale` / `plan_digest_match_commits` | `[S] crates/sea-forge-server/tests/conformance_sfwp.rs` (run `cargo test -p sea-forge-server --test conformance_sfwp`) |
| `preflight_returns_plan_precondition` | `[S] crates/sea-forge-server/tests/conformance_case_authoring.rs` |
| `confirm turns off when its preview changes and says preview out of date` / `stale decision is refused by the case keeper, not only on screen` | `[H] test/desk-decide.test.tsx` |
| attention rules 1, 4, 8 | `[H] test/desk-attention.test.tsx` |
| parity set above | `[H] test/desk-parity.test.tsx` |
| `cost per accepted outcome shows not recorded without a source` | `[H] test/desk-cost.test.tsx` |
| live accept-and-settle round trip: follow `.agents/reports/2026-11-03-settlement-live-roundtrip-runbook.md`; command and saved output in `stage-3/roundtrip.md` | `[H] test/J02-live.test.ts` (existing live test) |

Must be running: workshop, case keeper + Horizon (rebuilt sea-rs), record keeper.
Done when:
1. `cargo test -p sea-forge-server --test conformance_sfwp --test conformance_case_authoring` passes.
2. `bun test test/desk-decide.test.tsx test/desk-attention.test.tsx test/desk-parity.test.tsx test/desk-cost.test.tsx test/approval-inbox.test.ts` passes.
3. `bun run scripts/walkthrough-capture.ts --stage 3` saves an accept, a reject and a hold against the live case keeper into `.agents/reports/v2-build/stage-3/`, plus the saved "preview out of date" page.
4. `stage-3/roundtrip.md` holds the settle runbook output.
5. `bun run boundaries` and `bun run check` pass after the deletions.
Build-and-restart (D11): sea-rs change -> memory check, one `cargo build --release -p sea-forge-server`, stop `ignite`, restart `ignite` with the setup env, `--only seaforge` health check.
Operator-only: none.

### Stage 4 - Hand work to agents (needs stage 1 key and stage 3 case keeper)

Files:

| Mark | Path | Notes |
| --- | --- | --- |
| M | `[S] crates/sea-forge-core/src/types.rs` | `PlanItem.external_ref: Option<ExternalRef>` with `#[serde(default, skip_serializing_if = "Option::is_none")]`; `ExternalRef{kind: ExternalRefKind, id: String, url: String}`; `ExternalRefKind{GithubIssue, Ticket}` (snake_case on the wire) |
| M | `[S] crates/sea-forge-server/src/sfwp/case_mutations.rs` (`add_item`, `:198`) | carry `external_ref` through `case_add_item` |
| M | `[H] src/adapters/realitytrace-obligation.ts` | `declare(input: {intentId: string; statement: string; target: string; criteria: {minimum_relevance: string; minimum_reliability: string}}): Promise<DeclaredThreshold>`; `run(threshold, argv, launcher, timeoutS, opts: {target: string; snapshot: string})`; `sxr()` becomes `async` with `Bun.spawn` + `await proc.exited`, 120 s timeout kills the child. Callers updated |
| M | `[H] test/realitytrace-obligation.test.ts` | tests below |
| M | `[H] src/adapters/sea-forge-case.ts` | `addItem` with `request_id`, `external_ref` |
| M | `[H] src/app.ts` | `POST /workspace/intent` (`:1468`): Hand off: `request_id = "handoff:" + draftId` |
| M | `[H] src/ui/desk/Composer.tsx` | Hand off mode; `draftId` (UUID) made when a draft starts, stored in `horizon-ui-state` so it survives restart |
| C | `[H] src/ui/desk/Panels.tsx` | port of cockpit panels: agent tools `show_surface`, `ask_human`, `arrange`, `annotate`, `read_responses` (`[PA] cockpit/protocol/tools.ts:27-39`) and human ops `human.answer`, `human.pin`, `human.close`, `human.open` (`actions.ts:39-56`) mapped to Horizon's grammar; Horizon format stays canonical |
| C | `[H] src/capabilities/panel-answers.ts` | collection `horizon-panel-answers` |
| C | `connectors/github/` in `[H]`: `index.ts` (main loop), `sea-events.ts` (`events_subscribe {from_cursor}` stream; `events_get_range` to catch up), `gh.ts` (`Bun.spawn(["gh","api",...])`, REST and GraphQL, operator's login, no stored token), `cursor.ts`, `mapping.ts`, `board.ts` (one Projects v2 board per organization, fields Case and State) | no outbox |
| C | `[W] src/capabilities/caseProposeStep.ts` + register in `[W] src/server.ts` | agents in the workshop propose follow-up steps through `seaForgeCall` -> `case_add_item` (`proposed_by` is set by the case keeper). CF11 on the actor |
| M | `[H] src/adapters/workshop.ts` | `assign(caseId, stepId, ...)` calls `expert.converse` with `requestId = "assign:<caseId>:<stepId>"` (CF7); no Workbench change |

New records:

| Collection | Key | Fields |
| --- | --- | --- |
| `horizon-github-cursor` | `cursor:<setup>` | `name`, `from_cursor`. Saved after each successful write |
| `horizon-panel-answers` | `answer:<panel_id>:<n>` | `panel_id`, `ask`, `outcome` (answered\|deferred\|cancelled), `value`, `note`, `at`, `replied` (boolean) |
| (existing) `horizon-ui-state` | `draft:<tenant>:<operator>` | `draftId`, `text`, `mode` |

Acceptance blocked predicate: `panelAnswers.filter(a => a.step === stepId && !a.replied).length > 0`. Open panels cap: 8, enforced in `Panels.tsx` (`MAX_OPEN_PANELS = 8`).

Entries (D5): Hand off, GitHub issues (connector, `request_id = github:<owner>/<repo>#<number>`), agent proposals. No separate ticket list. Out: case = parent issue, steps = sub-issues (or a task list in the parent body when `github.json` has `subIssues: false`); state goes back as a GitHub tag plus a comment; closing an issue never accepts a step.

Hand off preview: `case_add_item` with `dry_run: true` (F1). The confirm sends the same item with the returned `plan:` digest as a precondition.

Tests:

| Name | File |
| --- | --- |
| `external_ref_absent_in_old_json_loads` / `external_ref_none_is_not_serialized` / `plan_hash_unchanged_without_external_ref` | `[S] crates/sea-forge-core/src/types.rs` (`mod tests`; `cargo test -p sea-forge-core external_ref`) |
| `add_item_carries_external_ref` / `add_item_same_request_id_replays` / `add_item_changed_payload_is_request_id_reused` | `[S] crates/sea-forge-server/tests/conformance_case_authoring.rs` |
| `the same Hand off request sent three times gives one step and one assignment` / `a new draft makes a new step` | `[H] test/handoff.test.ts` |
| `declare writes question and threshold before run` / `sxr does not block the event loop` / `a timeout kills the child` | `[H] test/realitytrace-obligation.test.ts` |
| `the same issue seen three times gives one step` / `an issue closed on GitHub leaves the step unaccepted` / `GitHub offline then back delivers the waiting updates in order` / `the cursor is saved only after a successful write` / `no sub-issues falls back to a task list` | `[H] test/github-connector.test.ts` (uses `test/support/fake-gh.ts`) |
| `at most 8 panels open` / `acceptance is blocked until the agent replies` / `a pinned panel keeps its place on update` | `[H] test/desk-panels.test.tsx` |
| `agent proposal arrives as a step with proposed_by set` | `[W] test/J-CASE-propose-step.test.ts` |
| `one assignment per step` (second assign refused with "Assignment identity already exists") | `[H] test/workshop-assign.test.ts` |

Must be running: all of §D including the connector.
Done when:
1. All tests above pass; `cargo test -p sea-forge-core external_ref` passes.
2. One real piece of work goes from words to an accepted outcome. `bun run scripts/walkthrough-capture.ts --stage 4` saves the comparison view as `stage-4/comparison.html` with every row non-"not recorded", and `stage-4/rows.json` listing the source record number for each row.
3. One GitHub issue labelled for Horizon in `GodSpeedAI/horizon-sandbox` arrives as a step and reaches a decision: `stage-4/github.md` holds the issue URL, the `case_add_item` request id and the saved decision card.
4. `bun run scripts/setup-health.ts --setup testing` exits 0 including `connector`.
Build-and-restart (D11): sea-rs (`ExternalRef`) -> full procedure; workshop (`caseProposeStep`) -> repackage and restart; `[H]` changes need only an `ignite` restart.
Operator-only: none new (key from OP3 must be unexpired).

### Stage 5 - Witness everything

Files:

| Mark | Path | Notes |
| --- | --- | --- |
| M | `[W] src/observations.ts` | add the event types for model requests and user turns to `OBSERVED_EVENT_TYPES` (names: CF5); `observationOutboxFor` passes `inputRef`/`outputRef` = `sha256:<hex>` of the canonical payload; no text leaves the workshop |
| M | `[C] packages/realitytrace/src/sxr-cli.ts` | `prepare()` runs `snapshot create --repo <repoId> --json` (DomainForge 0.21.2 on PATH) and passes the returned snapshot id to `run begin` instead of `snapshot:genesis` (`:111`). CF11 for the output field. CF4 for delivery to the workshop |
| M | `[C] packages/realitytrace/test/sxr-cli.test.ts` | test below |
| M | `[H] src/adapters/realitytrace-obligation.ts` | `snapshot` option from stage 4 is the real snapshot id (replaces `snapshot:horizon`) |
| M | `[H] scripts/measure-timings.ts` | rerun for the delay |

Tests:

| Name | File |
| --- | --- |
| `model request and user turn observations carry sha256 refs and no text` (asserts `inputRef` matches `^sha256:[0-9a-f]{64}$` and the outbox payload does not contain the prompt string) | `[W] test/J-RT-realitytrace.test.ts` |
| `prepare creates a snapshot and begins the run on it` | `[C] packages/realitytrace/test/sxr-cli.test.ts` (`cd /home/sprime01/projects/cognate && bun test packages/realitytrace`) |
| `horizon run begins on the real snapshot id` | `[H] test/realitytrace-obligation.test.ts` |

Must be running: as stage 4, with `domainforge` on PATH (`domainforge --version` prints 0.21.2).
Done when:
1. Tests above pass.
2. A record written during the stage carries the rulebook edition: `realitytrace ledger export --repo <id> --json` rows show a snapshot id that is not `snapshot:genesis` or `snapshot:horizon`; the output is saved to `stage-5/edition.json`.
3. Delay measured before and after: `bun run scripts/measure-timings.ts --setup testing` writes `stage-5/delay.json`. Batching is added only if `median_ms` is greater than `threshold_ms` from `stage-1/delay.json` (2000 unless stage 1 set another number).
Build-and-restart (D11): Cognate (`bun test`, then CF4 delivery) and Workbench (repackage) -> stop and restart the workshop with the setup env; health check `--only workbench`.
Operator-only: none.

### Stage 6 - Review and learn (needs stage 4's agent steps)

Files:

| Mark | Path | Notes |
| --- | --- | --- |
| M | `[S] crates/sea-forge-core/src/types.rs` | `ItemMarkers.review: bool` with `#[serde(default)]`, like the other three markers |
| M | `[W] src/experts/types.ts`, `service.ts` | `Assignment.reviews: string \| null` (id of the reviewed assignment); `context(state, expert, conversation, reviewing?: Assignment)` drops memory where `m.expertId === author.expertId` or `m.by === author.expertId` or `m.sources` includes any id of the reviewed assignment |
| M | `[W] test/J-EXPERT-memory.test.ts` | extended to review steps |
| M | `[H] src/ui/desk/Composer.tsx` / command menu | "Run a review" sets `markers.review` on the step it adds |
| M | `[H] src/ui/desk/views/Decide.tsx` | lessons appear as cards; only a person's accept makes one active |

Tests:

| Name | File |
| --- | --- |
| `item_markers_review_defaults_false_in_old_json` | `[S] crates/sea-forge-core/src/types.rs` (`mod tests`) |
| `add_item_keeps_review_marker` | `[S] crates/sea-forge-server/tests/conformance_case_authoring.rs` |
| `review step context excludes the author's memory` / `critic role still starts clean` | `[W] test/J-EXPERT-memory.test.ts` |
| `a lesson becomes active only after a person accepts` | `[H] test/desk-decide.test.tsx` |

Must be running: as stage 4.
Done when:
1. Tests pass.
2. One real review run and decided: `stage-6/review.md` holds the case id, the review step id, the findings and the decisions; `stage-6/memory-proof.json` is the output of the memory test.
3. Clear and ship clean, in this order (all saved in `stage-6/ship.md`): `bun run scripts/setup-clear.ts --setup testing` (list; OP4), then `... --yes`; `bun run scripts/setup-init.ts --setup production`; start production (OP5, OP6); `bun run scripts/setup-check-empty.ts --setup production --exclude personal` exits 0; saved `GET http://127.0.0.1:4319/workspace.json` shows zero cases and zero notes; Today, Decide and Work saved empty.
Build-and-restart (D11): sea-rs and workshop procedure.
Operator-only: OP4, OP5, OP6.

## F. Deferred, with the condition that brings each back

| Item | Comes back when |
| --- | --- |
| Shared parts package | Horizon and the cockpit share one format (zod major, reference shapes, caps) |
| Cockpit docking layout | The desk needs more than the fixed regions |
| An AI reviewer that scores runs | There are enough human labels to measure it against |
| Note restore and back-dating | After the first release |

## G. Production steps not covered by tests

Gateway units (`sudo`) are described in `[H] docs/gateway-runbook.md`; they run the installed binary at `/usr/local/lib/godspeed-sea-forge/bin/sea-forge-server`, so after a sea-rs change the gateway needs the runbook's reinstall step (OP5).

## H. Check first register and open findings

| ID | Question | Command or file that answers it |
| --- | --- | --- |
| CF1/F2 | **Settled (author, 2026-11-06).** A separate CLI has no operator token, so there is no CLI command. M (Workbench): a Settings action "Connect Horizon", run from the operator's own signed-in window. It calls `identity.session.issue` (`label: "horizon"`, `ttlHours` ≤ 2160) on the server. The server writes the key to `<setup root>/secrets/workbench.key` (mode 0600), where the setup root is the parent of `COGNATE_WORKBENCH_HOME`. **The key is never returned to the browser.** The action shows only the expiry date. Test: `connect-horizon writes key file and never returns token`. |
| CF2 | **Settled.** The GraphQL `Issue` type has `parent`, `subIssues` and `subIssuesSummary` (checked 2026-11-06). Sub-issues are used; the task-list fallback stays only as a guard in `setup-github.ts`. |
| CF3 | Does the packaged workshop keep its pg0 under `COGNATE_WORKBENCH_HOME` when started with the setup env? | start it, then `cognate-workbench doctor` (database mode "bundled pg0", data dir under the setup root) |
| CF4 | How does a Cognate change reach the workshop's installed `@godspeedai/*` 0.8.0 copies and Horizon's vendored tarballs? | `sed -n 1,40p /home/sprime01/projects/cognate/scripts/prepare-npm-package.mjs`; `ls -la /home/sprime01/projects/cognate-workbench/node_modules/@godspeedai/cognate-realitytrace` |
| CF5 | Exact event type names for a model request and a user turn | `grep -rn "eventType" /home/sprime01/projects/cognate-workbench/src --include=*.ts \| grep -i "model\|user\|run.start"` |
| CF6 | Which `extensions.cognate` field is the workshop `sessionId` (for the deep link)? | `sed -n 183,186p /home/sprime01/projects/cognate/packages/realitytrace/src/sxr-cli.ts` |
| CF7 | Is the assignment id derived from `requestId` in `expert.converse`? | `sed -n 380,392p /home/sprime01/projects/cognate-workbench/src/experts/service.ts` |
| CF8 | Does the tap's event schema accept the aggregate `journey_check` event, and does `read_observations` ignore `journey-score:` refs? | `sed -n 1259,1283p /home/sprime01/.agents/lib/te-rt/journeys.py`; run the new pytest |
| CF9 | How does a client get `expected_digest` for `case:`/`approval:` refs for decision previews? | `sed -n 3644,3720p /home/sprime01/projects/sea-rs/crates/sea-forge-server/src/lib.rs`; `grep -n "digest" /home/sprime01/projects/sea-rs/docs/reference/sfwp-protocol-reference.md` |
| CF10 | Are `.agents/prereg/horizon/T05.prereg*.yaml` frozen, so that a 16th block needs a new prereg? | `bash /home/sprime01/projects/Horizon/scripts/check-ledger-freeze.sh` and `sed -n 1,30p scripts/teeth-ledger-freeze.sh` |
| CF11 | Output field names of `realitytrace snapshot create`; the workshop agent's actor for `case_add_item` | run `realitytrace snapshot create --repo <id> --json` in the test setup; `sed -n 100,150p /home/sprime01/projects/cognate-workbench/src/capabilities/governance.ts` |
| CF12 | Exact arguments to repackage the workshop | `ls /home/sprime01/projects/cognate-workbench/dist-package` and `sed -n 1,12p scripts/package.ts` (usage `bun scripts/package.ts <bun-target> <tag>`) |
| F1 | **Settled (author, 2026-11-06).** The preview belongs to the case keeper, not Horizon. M (sea-rs): add `dry_run: bool` (default false) to `CaseAddItem`. With `dry_run`, it runs the same authority and policy checks and returns the item that would be added, the outcome and a `plan:` `RecordDigest`, without committing. The real call passes that digest as a precondition (D8). Tests: `add_item_dry_run_commits_nothing` and `add_item_with_stale_plan_digest_is_refused` in `crates/sea-forge-server/tests/`. |

No builds or test suites were run while writing this. One compile at a time applies when work starts.

## I. Stage 0 outcome (2026-11-06)

- **Built and passing:** 19 new tests and the 13 existing config tests pass, and the type check is clean after one fix in `scripts/setup-init.ts`. `~/.horizon/setups/testing` was created. The test board is GitHub board #2 in `GodSpeedAI/horizon-sandbox`, and sub-issues are confirmed.
- **Carried to stage 3:** `setup-check-empty.ts` has no case-keeper client yet, so it treats a live case-keeper socket as "one unanswered case". M (stage 3): call `case_list` through `src/adapters/sea-forge-case.ts` once it exists. Until then, the check fails safe: it never reports empty wrongly.
- **Accepted as built:** the record check counts repositories in a record dir (a fresh dir has none). `setup-clear` deletes every issue in the sandbox repository, which is test-only by definition.

## J. Added by the operator (2026-11-06): adversarial tests and seed data

### J.1 Adversarial tests for every outside service

Every adapter that talks to an outside service gets a test file named `test/adversarial-<service>.test.ts` (Horizon) or the repo's equivalent. Each file drives a fake of the service, or the real CLI with injected failures, through every case below. The rule each test proves: **Horizon shows the honest state in words, never shows stale data as current, never loses or doubles a write, and never leaks a key.**

| Service | Cases (each one is a named test) |
| --- | --- |
| Record keeper (`realitytrace` CLI) | binary missing; non-zero exit; timeout (hang longer than the limit); output that is not JSON; valid JSON of the wrong shape; a truncated ledger; a broken chain (one row edited); 50MB output; an unknown record kind; record dir not readable |
| Case keeper (SFWP socket) | socket missing; connection refused; reply never arrives (timeout); garbage frame; an error reply; `request_id_reused`; a stale `plan:` digest; the socket closing mid-reply; the events stream dropping, then resuming from the cursor with no gap and no duplicate |
| Workshop (Connect RPC) | down; `401` from an expired key; `401` from a revoked key; key file missing, world-readable (refused unless the mode is 0600) or empty; slow reply; a duplicate assignment id; an unknown session id in a deep link |
| GitHub (`gh api`, through the fake `gh`) | `gh` missing; not logged in; scope missing; rate-limited (`403` plus reset); `5xx`; `404` on the repo; an issue deleted on GitHub; an issue closed on GitHub (the step stays not accepted); the same webhook or poll seen 3 times; title or body with markdown and script injection (shown as text, never run); a body of 1MB or more; offline, then back: writes replayed in order exactly once |
| Reference service (Ask) | not configured; down; slow; an answer with no sources (shown as "no sources", never as fact) |
| Presenting | a project name inside an issue title, note, file path, export or error message: none leaks with Presenting on |
| Inputs from the operator | composer text with HTML or script (escaped); a 100KB note; unicode and right-to-left text; an empty note; a tag named like a permission ("approved") grants nothing |

The record of each stage lists its adversarial tests and their results.

### J.2 Seed data, made through the real interfaces

Seed data lets the operator see every screen working. It is made **only in the test setup**, and **only through the real interfaces**: case-keeper calls, the record keeper's CLI, the Horizon store and `gh` against the test repository. Nothing is drawn onto a screen directly. The seed is therefore an honest demonstration of the system, not a mock-up.

| Recipe | What it does |
| --- | --- |
| `just seed` | Refuses unless `HORIZON_SETUP=testing` and the test setup exists. Creates a seeded organization's cases with steps (including one from a GitHub test issue, one handed off and one agent proposal). Creates expectations and observations in the **test** record covering: matched, contradicted, expected but not seen, and seen but not expected. Creates notes on several days, tags, links and three labels. Creates one decision waiting for the operator. The demo issues in `GodSpeedAI/horizon-sandbox` are added to the test board. Running it twice changes nothing: every write carries a fixed request id. |
| `just seed-status` | Prints what the seed created and whether each part is present. |
| `just seed-clear` | Records cannot be removed one by one, so this clears the whole test setup (`setup-clear --setup testing`), shows the list, asks for confirmation, then re-creates it empty (`setup-init`). It never touches production or the personal record. |
| `just seed-reset` | `seed-clear`, then `seed`. |

The seed script is `scripts/seed.ts`, with its data in `scripts/seed-data/`. It is built in the stage where each piece first exists: records and labels in stage 1, notes in 2, decisions in 3, steps from GitHub and hand off in 4. Each stage extends it.

## K. Definition of production ready (operator, 2026-11-06)

The work is done only when every row passes. The final report shows the command and its real output for each row. Agent-written claims do not count as evidence.

| # | Check | Proof |
| --- | --- | --- |
| K1 | Horizon type check | `node_modules/.bin/tsc --noEmit` exits 0 |
| K2 | Horizon's existing gate still passes | `just verify` exits 0 (plus `just check-t05` and `just teeth-t05` for the parts-layer guards) |
| K3 | Every new test passes, including every J.1 adversarial test | `bun test` over the new files: zero failures, with counts listed |
| K4 | Case keeper changes | `cargo test` for the changed crates, plus `cargo build --release -p sea-forge-server` |
| K5 | Workshop changes | `bun run typecheck` and the changed tests in the workshop worktree |
| K6 | End to end in the test setup | `just seed`, then a scripted browser walk-through (Playwright) of Today, Explore, Decide and Work: real screenshots plus page-text assertions |
| K7 | The attention rules | the nine rule tests pass, and the screenshots show one highlight and "not recorded" rows |
| K8 | Accessibility | an automated accessibility scan (axe) of each view: no serious or critical violations. Keyboard-only walk-through: the full flow with no mouse |
| K9 | Speed | `measure-timings.ts` gives the day view, record lookup and comparison times. Each meets its budget (1 second), or the report shows the reason and the fix |
| K10 | Presenting | `presenting-scan.ts` finds no real names in the screenshots' page text or the exports |
| K11 | Clean production | `setup-clear`, then `setup-init --setup production`, then `setup-check-empty --setup production` exits 0. Production starts and answers its health check |
| K12 | Keys never leak | grep the logs, records, exports and page HTML for the key prefix: zero hits |
| K13 | Runbook | the operator's runbook for start, stop, seed, clear, connect and ship, tested by following it in the test setup |
| K14 | Merged and pushed | the branches are pushed, with pull requests or merges recorded, and the repos are left with no stray changes of ours |
