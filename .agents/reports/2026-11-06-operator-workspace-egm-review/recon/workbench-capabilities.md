# Workbench capability and plugin recon

Repo read: `/home/sprime01/projects/cognate-workbench`, branch `feat/desktop-terminal-browser`. The session's git status named a different branch (`horizon-cockpit-projection-review`), so this may not be the state you expect. Read-only; nothing was built or run.

## File inventory

All operator-named files exist. Line numbers are from the current working tree.

| File | Exists | What it does | Key exports |
|---|---|---|---|
| `src/workbench/skillOs.ts` (494 lines) | yes | Capability lifecycle, a seed catalog of capability contracts, binding substitution and conflict detection. | `advanceLifecycle` (:24), `canInvoke` (:50), `seedCatalog` (:62), `Substitution` (:323), `checkSubstitution` (:331), `detectConflicts` (:395) |
| `src/ui/workbench/CapabilityList.tsx` (218) | yes | Renders the capability list with lifecycle steppers and conflicts. Mounted from `Workbench.tsx:533`. | `CapabilityRecord` (:9), `CapabilityList` (:26) |
| `src/plugins.ts` (143) | yes | Pure catalog and lifecycle logic: `core`, `tool`, `optional`. Merges catalog with install records. | `PLUGIN_CATALOG` (:52), `pluginViews` (:105), `installRefusal` (:138) |
| `src/components/pluginRegistry.ts` (135) | yes | Merges plugin sources and verifies that a declared implementation exists in this build. | `PluginSource` (:22), `PluginRegistry` (:46), `activate` (:85), `planInstall` (:95), `verifyImplementation` (:112) |
| `src/capabilities/pluginInstall.ts` (122) | yes | Runtime component providing `plugin.install`, `plugin.uninstall`, `plugin.catalog`. Writes events through `startRun`. | `pluginInstallComponent` (:34), `PluginCatalogResult` (:26) |
| `src/projections/plugins.ts` (36) | yes | Folds `plugin.installed` and `plugin.uninstalled` into the `plugins` projection. | `pluginsProjection` (:9) |
| `src/agents/agentCoding.ts` (808) | yes | Agent coding engine. Defines the tool set and presets. Expert tools include `expert_memory_read`, `expert_memory_write`, `expert_return`, `team_delegate`, `team_message`. | `AGENT_CODING` (:28), `AgentPreset` (:35), `TOOL_DEFS` (:238), `EXPERT_TOOL_DEFS` (:316), `agentCodingAgent` (:440) |
| `domain/index.ts` (662) | yes | Loads the domain model and binds capability contracts to semantic anchors. `"team.review": "Team"` is at :383. | `loadDomain` (:21), many `bind*` functions |
| `src/server.ts` (1110) | yes | Boots the runtime, wires plugins (:544, :671), serves the Connect RPC path (:1048), `/health` (:1045), and the browser entry. | `startServer` (:411), `ServerOptions` (:168), `LOCAL_OPERATOR` (:120) |
| `src/experts/` | yes | Expert and Team service, state, persistence, types. About 2,300 lines. | `service.ts`, `state.ts`, `types.ts` |
| `docs/experts-and-teams.md` | yes (92 lines) | Describes Experts, Teams, Assignments, handoffs, memory and human settlement. | n/a |

Not found: any rubric, grader or evaluator for capabilities. The only "evaluator" is `ScheduleEvaluator` (`src/schedules/evaluator.ts`, wired at `server.ts:817`), which runs schedules and does not grade. The name `ExpertMemory` is a UI type in `src/ui/experts/ExpertsTeamsPanel.tsx:459`, and its underlying type lives in `src/experts/types.ts`.

## 1. Plugin definition, install, activation, substitution, reload

- **Defined:** in code. `PLUGIN_CATALOG` (`src/plugins.ts:52`) is a fixed list. Only `realitytrace` is optional. Sources can be added at boot via `PluginRegistry.addSource` (`pluginRegistry.ts:54`). The server constructs a registry with only the builtin source (`server.ts:544`). No external source is registered there.
- **Installed:** `plugin.install` validates the request, then starts an `agent.config` run with a `plugin.installed` event (`pluginInstall.ts:85`). The `plugins` projection writes the row (`projections/plugins.ts:17`). Install state is durable event data.
- **Activated:** `verifyImplementation` (`pluginRegistry.ts:112`) only checks that the claimed implementation exists in this build. For `tool`, the tool name must be in `TOOL_DEFS`. For `settings-toggle`, the key must be in `TOGGLEABLE_PLUGINS`. Nothing is downloaded or evaluated. The code comment says so explicitly.
- **Inert:** an entry with `kind: "none"` installs but reports itself inert.
- **Substitution:** not a plugin concept. It belongs to Skill OS. `checkSubstitution` (`skillOs.ts:331`) checks that a new binding for a capability has a different `implementationId`. It refuses a change of a `verify`-authority contract from deterministic to LLM. It reports changed fields. Whether the swap is durably applied at runtime is **UNCONFIRMED**; `Workbench.tsx` writes `capability/` rows, but I did not trace the write path.
- **Reload without restart:** **no file-watch or hot-reload mechanism was found** (no `fs.watch`, chokidar, `import.meta.hot`, or watch code in `src`). Settings changes do take effect in-process without restart for the RealityTrace drain gate, because it re-reads the `settings` projection every cycle (`server.ts:850`). The app also restarts from scratch, and boot re-mounts the last provider (`server.ts:798`).

## 2. `team.review` and ExpertMemory

- **`team.review`** is a capability (`src/experts/service.ts:506`), not a separate reviewer runtime. It records `{verdict, rationale, evidence, by}` on an Assignment. Verdicts are `revision`, `accept` or `escalate`. It requires prior handoff results (`:507`).
- **Accept gate:** `service.ts:298-308`. An `accept` needs evidence from descendant runs of a different Expert, where those runs completed `read`, `bash` or `run_code` tools, and where no failures or uncertainties remain. Model-only assertions are rejected.
- **Human settlement:** `team.settle` (`service.ts:514-517`) is the only path to `completed`. It requires a prior `accept` review. The docs state that the Orchestrator cannot accept its own work.
- **Isolated context for reviewers:** **UNCONFIRMED**. The docs say Assignments freeze their context and that Specialists do not get delegation authority. I did not confirm that a reviewer's context is separated from the builder's conversation history.
- **ExpertMemory:** entries have kinds `observation`, `assertion`, `inference`, `accepted` (`service.ts:526`). Only a user actor can write `accepted` (`:527`). Only a human can replace accepted knowledge (`:530`). Models can write the other three kinds through `expert_memory_write`.
- **"Propose a lesson" flow:** there is **no proposal or queue state** for memory found. A model writes an `assertion` or `inference`, and a human must later promote it by writing `accepted`. The promotion UI path was not traced, so this is **UNCONFIRMED**.

## 3. Endpoint to list capabilities and real availability

- **Plugins:** yes. `plugin.catalog` (`pluginInstall.ts:51`) returns per-entry `status`, `toggleable`, `reason`, install `records`, `installable` and `sources`. This is the best existing availability answer, and it is computed server-side.
- **Skill OS capabilities:** no dedicated list endpoint. Rows are read through the generic `readProjection` with name `workbench`, keyed `capability/<id>` (`src/capabilities/workbench.ts:96`). `canInvoke` (`skillOs.ts:50`) is a pure function, and I did not find a server path that enforces it on invocation. **UNCONFIRMED**.
- **Transport:** Connect RPC at `/cognate.v1.RuntimeService/<method>` (`server.ts:1048`), plus `/health` (`:1045`). Calls require the boot bearer token. `server.ts:713` says a restart invalidates the browser token. Do not expose the dev bearer service to untrusted callers (per `docs/experts-and-teams.md`).

## 4. Opening a Workbench session from another app

- **Deep link:** none found. No custom URL scheme in `src-tauri`.
- **Desktop shell:** Tauri `single-instance` plugin (`src-tauri/src/lib.rs:18`). A second launch only focuses the window and discards its arguments.
- **Web UI routes:** only `#plugins/<id>` (`src/ui/App.tsx:4454`). No session or trajectory ID is read from the URL. A search found no `sessionId` in URL handling.
- **Backend URL:** `127.0.0.1:${PORT ?? 3180}` (`src/cli.ts:95`). The app window is Chrome or Edge in `--app=` mode (`src/desktopWindow.ts:46-67`) with an OS-default-browser fallback.
- **Practical route:** the other app would call the Connect RPC with a valid boot token, then open the window at the root URL and steer the UI from there. **UNCONFIRMED**: whether a run/session can be focused by ID through RPC alone without the UI.

## How the Workbench is launched

Two paths, both confirmed:
1. **Desktop window:** the Tauri shell (`src-tauri`) spawns the backend, either `bun src/cli.ts start` or a bundled sidecar, and its webview loads `http://127.0.0.1:<port>`.
2. **Background service:** `bun src/cli.ts start` (`package.json` `dev`/`start`) runs the server and opens a Chrome or Edge app window. A lock file prevents two owners (`cli.ts:67-86`).

## Open items

- Whether `skill.bind` changes are applied at runtime, and whether `canInvoke` gates invocation: UNCONFIRMED.
- Reviewer context isolation and the memory promotion UI path: UNCONFIRMED.
- The branch mismatch noted above: confirm which checkout you intend to read.
