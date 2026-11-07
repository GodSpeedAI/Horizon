# Horizon substrate inventory (2026-11-06)

Read-only recon. Nothing was built or run. Line cites are from skims, not exhaustive reads.

## 1. Architecture and how it runs

- Not Tauri or Electron. Horizon is a Bun/TypeScript process that serves HTTP on loopback 127.0.0.1:4319 (config/horizon.toml; docs/architecture.md:95). The browser at /workspace is the "desktop". A terminal UI (OpenTUI, vendored under src/ui/sequential/) and an MCP stdio verb exist too (src/main.ts: commands frame, surface, schema, act, mcp, serve).
- Entry points: src/main.ts (CLI and serve) calls createApplication() in src/app.ts. `bun run ignite` (scripts/ignite.ts) starts it, with `--remote` for the phone listener.
- Subsystems:
  - src/domain: pure types. navigation.ts has GATE_KEYS (visibility, reach, payment, authority, capability, recovery, plus one more), frame.ts, intent.ts, approval-inbox.ts, debugger.ts.
  - src/capabilities: Cognate-registered capabilities (context, semantic, navigation-intent, navigation-settlement, pending-intent, capacity-ledger, workspace-records, remote-records, contract-upgrade).
  - src/adapters: outward calls (context-kernel, sea-forge-approvals, settlement, realitytrace-obligation, realitytrace-economics, delegating-authority, research, semantic, operational-objects, navigation).
  - src/runtime (create.ts, required-cognate.ts): composes the Cognate runtime over SQLite.
  - src/settlement, src/economics, src/projections, src/verifiers, src/agents.
  - src/ui: surface.ts (single seam), surface2/ (grammar, binder, reducer, project, render, equivalent), workspace/ (model, render, inspect, approval-inbox, economics), sequential/ (TUI).
  - src/remote: a phone listener (server.ts 615 lines, webauthn, pairing, phone.ts, panel.ts, vendored QR code).
- Other top-level dirs: behavioral/ (journey yaml and proofs), domain/ (SEA models and docs), research/ (Python, pytest), graft/, requirements/, docs/, test/ (about 45 files).

## 2. Live-wired versus fixture

- Live in app wiring (src/app.ts):
  - Cognate runtime over `.cognate/app.sqlite` (config runtime_store).
  - Context Kernel, via a spawned process speaking JSON-RPC lines (src/adapters/context-kernel.ts:1-40). It is bound only if `context_kernel.command` is configured. Otherwise the outcome is `absent`.
  - SEA-Forge, via a Unix socket NDJSON call. Approvals are SEA-Forge records and Horizon keeps no approval state (sea-forge-approvals.ts:1-12). Gateway install and containment are documented as deployed (commits 3a575ee to 423ea3d, docs/gateway-runbook.md).
  - RealityTrace, via its CLI (realitytrace-obligation.ts, realitytrace-economics.ts). app.ts:334 builds it from env and a default repo path. Commit 423ea3d says RealityTrace is installed and used by the runtime.
  - Cognate-Workbench: no direct client in src. Sea-forge-approvals mirrors Workbench's `seaForgeCall`, and the doc comment lists exporting it from Cognate as readiness debt.
- Recent state (git log -20): approval inbox P2.1 (592915c), operator identity from config mapped to the SEA-Forge actor id (927fc99, 2223515, 341fb7b), a fail-closed self-approval refusal (18f0c40), and gateway hardening.
- Reports:
  - 2026-11-03 settlement live round-trip runbook: status "prepared, not run" (the doc's own header). Approve, reject and resume against the live socket are unverified, and the pending-record creation path is unconfirmed.
  - 2026-11-05 t1-authority-mediation and estate-reconciliation: branch and worktree cleanup, plus evidence and review folders.
  - Settlement is therefore code-and-test verified, but not live-proven.
- Fixtures are in test/support (economics-fixture, operational-fixture, sequential-fixture, j02r2-rig), and the J02-live tests exist. The REQ-VERIFY-005 gate is `just gate-t19`.

## 3. UI

- Routes (src/app.ts ~1336-1470):
  - /surface (GET; json, html or text by Accept), /surface/schema, POST /surface/intent
  - /workspace, /workspace/economics, /workspace/approvals, /workspace/inspect, POST /workspace/intent
  - /workspace/remote panel, phone at /m
- Two rendering stacks:
  1. workspace/ is the main GUI. model.ts builds `horizon.workspace/1`, with regions in WORKSPACE_REGION_ORDER (model.ts:20). render.tsx (972 lines) server-renders JSX with no client bundle (the comment at the top of the file says buttons are native form posts). approval-inbox.tsx and economics.tsx are read-only server-rendered pages.
  2. surface2/ is the closed `horizon.surface/2` grammar: zod, 15 block kinds, MAX_BLOCKS=64 (grammar.ts:369), intents inspect/compare/decide/verify/monitor (grammar.ts:38). The pipeline is parse, bind sources (binder.ts), reduce for role (reducer.ts), project to neutral `horizon.gui-view/1` (project.ts), then renderHtml or renderText (render.ts). `file:` sources are refused over the wire.
- Who emits blocks: only `composeSurface(frame)` (ui/surface.ts:73), a pure function of the navigation frame. No operator or agent authoring path exists. surface2 is a read projection of a navigation frame, not a document store.
- Does workspace/render.tsx consume surface2? It imports GuiView (render.tsx:19) and has a "surface-actions" area. The two stacks overlap but are not unified.
- Navigation and focus: `focus_ref` is carried in forms (render.tsx:63, 111). History is the lineage region. Keyboard support is native HTML: skip link, `:focus-visible` outlines, no JS. The TUI has real key handling through OpenTUI `useKeyboard` (sequential/vendor/.../use-prompt-keys.ts). There are no global shortcuts in the web workspace.
- Approval view: the page lists SEA-Forge approvals, offers decisions only where `buildInbox` marks them decidable, and posts to /workspace/approval. Economics: read-only table of RealityTrace-observed versus estimated cost, per case, session and journey (economics.tsx:1-8).

## 4. Identity and operators

- identity-store.ts is a passthrough over the single app DurableStore, using collections identity-operators, identity-sessions and identity-devices. The service is @godspeed/identity (vendored tgz).
- operators.ts maps durable operator ids to SEA-Forge actor ids from config only. It is validated at boot, with the dev default `operator`, and there is no fallback (operators.ts:1-79).
- Sessions come from phone WebAuthn pairing (remote/). The desktop uses `desktop_operator`. Config identity.source is currently "os_session"; commits 341fb7b and 2223515 move to a configured identity.
- A per-operator journal can be keyed by operator id (stable, validated, regex-bound). Caveat: on the desktop it is effectively a single operator, and the sessions-to-operator resolution is in remote/. Org/tenant exists as `caller.tenant` (app.ts:~380), with no org model beyond that.

## 5. Persistence

- Horizon uses Cognate's SQLite DurableStore at `.cognate/app.sqlite` (runtime_store). It holds identity, intent attempts, pending intents, the capacity ledger, workspace-records and remote-records capabilities, and frame state.
- package.json overrides list cognate-store-sqlite, store-postgres, store-memory, artifacts and continuations. Only the override entries name them; the direct dependencies are not listed for the store packages, but runtime-bun supplies SQLite.
- The settlement verifier reads a read-only snapshot of the store (settlement/snapshot.ts), never the live WAL file.
- There is no notes, journal or document collection. The existing DurableStore, with its collection API and transactions, is the substrate for one. The 2026-11-06 review's R9 report says there is no Cognate notes store.

## 6. Requirements ledger

- requirements/ledger.yaml is generated (scripts/gen-requirement-ledger.py) from .agents/specs/horizon.agent.spec.yaml and .agents/plans/horizon.plan.yaml, then frozen with a freeze_hash (scripts/freeze-formation.sh, check-ledger-freeze.sh). Each requirement has statement, source digest, semantic_binding, acceptance ids (AC-...), proof commands (`just gate-tNN`), settling_tasks, dependencies. See REQ-VERIFY-005 at ledger.yaml:4925, acceptance at ~5822.
- Journeys J01-J06 are in behavioral/journeys/J0N.yaml. Each has phases IS1..IS8, entry states, actor roles and consequential flags. Catalog: domain/canonical-journey-catalog.md. Proofs are in behavioral/proof/ with PROOF-REPORT.md.
- `bun run verify` chains check, bun test, boundaries, pytest, the ledger validator with --require-freeze, and the wayfinder validator.
- Adding a journey: the ledger is frozen, so it means a spec change (J07 in the spec yaml and the SEA interaction model), regenerating the ledger, new behavioral/journeys/J07.yaml and fixtures, a new gate, and re-freeze. Also count references like "six journeys" in REQ-VERIFY-005, docs/glossary.md:156, and catalog notes. This is heavy by design. A lighter route is to add requirements under existing journeys, or to treat notebook content as outside the frozen set.

## 7. Bloat and conflict candidates

- src/remote/ (about 1900 lines) plus docs/REMOTE.md: phone control with WebAuthn, QR and pairing. It is off by default. It is large relative to a notebook use case but is live infrastructure for identity, so it is not dead.
- src/ui/sequential/ with vendored terminal-ui: a second renderer (TUI) that duplicates the decision flow. It is tested (sequential-*.test.ts) but not part of a notebook design.
- Two UI stacks (workspace/render.tsx 972 lines versus surface2/render.ts): the main overlap. Workspace has its own model while surface2 is the "one seam" for CLI, MCP and GUI.
- `src/components/README.md` is the only file in src/components. It looks like an empty directory shell (src/components contains only README.md).
- research/ (Python, pytest, a horizon_research.contract command), graft/, domain/ and many scripts (check-t05..t07-*, apply-candidate-revision.py, gen-ledger-variant.py): process and proof tooling. Many are task-numbered (T05-T07), so they are likely only relevant while freezing.
- docs/designs/godspeed-egm-jetson-control-plane.md and docs/explainers: unrelated to workspace features.
- Version drift: docs/architecture.md says Cognate 0.6.1, adapters say 0.6.3, package.json has 0.8.0. Docs are stale.
- Conflicts with "Horizon only renders and authors operator content": Horizon currently also (a) runs the settlement verifier and reconciliation (settle-awaiting-closure.ts, obligation.ts), (b) spawns child processes for the Context Kernel and RealityTrace, (c) drives SEA-Forge approvals, (d) hosts the phone auth server, (e) owns the pending-intent and capacity ledger. (a), (b) and (e) are the sharpest; (c) is mediation over SEA-Forge, which holds the state.

## 8. Gaps for a daily notebook, composer and trace comparison

- Notebook: there is no notes or journal store, no dated entries, no per-operator content collection, and no editor. surface2 has `document`, `form` and `ask` blocks, but the grammar is a read projection with no write-back of content. Only fixed HorizonOperations can be submitted (grammar.ts:81, 563), so authored content needs either a new operation or its own route.
- Composer: nothing authors surface2 documents. composeSurface is the only emitter, and agents/operators cannot post a surface. The grammar is strong enough to validate an authored document, because parseSurface fails closed and MAX_BLOCKS bounds it. The reducer and projector can be reused as they are.
- Trace comparison: surface2 has a `compare` block and a `compare` intent, and J05 is Compare. RealityTrace evidence is read in the economics adapter and the obligation adapter, but no trace listing or diff view exists. The lineage region in workspace/model.ts (buildLineage, model.ts:481) is the nearest thing.
- Missing as well: client-side interaction (no JS), global keyboard shortcuts, search over operator content, and per-operator view state.
- Reusable as they stand: the DurableStore and identity (operator key), the surface2 grammar, binder, reducer and projector, the workspace region layout, STYLE/theme tokens, the approvals inbox pattern and capability registration.
