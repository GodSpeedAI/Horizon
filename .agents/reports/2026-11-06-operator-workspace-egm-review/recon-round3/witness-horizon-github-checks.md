# Witness, Horizon and GitHub checks (read-only recon)

## 1. Do tapped sessions already carry a session id and the .sea journey scores?

Session id: yes. Journey scores: partly. A verdict is stored, but the "score" is computed when read.

- The tap (`~/.agents/lib/te-rt/tap.py:199`) writes a pointer with `sid` (from the hook's `session_id`), `cwd` and `root`. It only acts in repos that have `.sea/interaction/` (tap.py:12, 68-70).
- The drainer (`drain.py`) turns pointers and transcripts into `agent-event/v1` events and ingests them into RealityTrace. Event fields include `runtime`, `native_session_id`, `te_session_id`, `kind`, `ts`, `payload_ref`, `exit_code`, `role`, `source` (drain.py:206-236). Kinds: session_start, tool_post, tool_fail, usage, stop, session_end, journey_check (drain.py:19, 40-43).
- Ledger record kinds involved: `observation.recorded`, with the event under `payload.extensions.agent_event`; and `question.declared`. Ledger rows have `ledger_id`, `append_ordinal`, `record_kind`, `payload` (`journeys.py:1264-1269`, `rtcore.py:264`).
- `.sea` journey score per session: `journey_check` events carry `payload_ref = "journey:<question id>"` and an integer `exit_code`. The question id is `journey:<J>:<field>:<n>` (journeys.py:32-33, 64-66). Verdict comes from `read_observations()` (journeys.py:1258-1285): exit 0 is match, non-zero is mismatch, no event is "undefined". Newest per (session, question) wins.
- Gaps: the journey and clause structure (what was declared, and the uncheckable clauses) lives only in local state `~/.agents/state/rt/journeys/<repo-key>.json` (journeys.py:36-37, 138). There is no stored aggregate score.

Conclusion: a `ledger export --repo <id>` already has session id plus per-question verdicts, so Horizon needs no separate export file for those. If Horizon wants the journey/clause structure or a ready-made score, it must either recompute (as `read_observations` does) or read the journeys state file.

## 2. `ledger export`

- Options are only `--json` and `--repo <REPO>`. No date-range filter. Confirmed from the pinned binary's `--help`: `~/.agents/opt/realitytrace/4d154b12.../bin/realitytrace`. Wrapper call: `cognate/packages/realitytrace/src/sxr-cli.ts:153,169`.
- The binary is named `realitytrace`; `sxr` is not on PATH. The `sxr` name is the data directory and the cognate wrapper.
- Size: ledgers are per repo, `~/.local/share/sxr/repos/<repo-id>/ledger.db`. The directory totals about 204 MB across 539 repo dirs. The largest ledgers are about 45.7 MB and 17.9 MB. Record counts not measured.
- Location: no `REALITYTRACE_HOME`. The binary honours `XDG_DATA_HOME` and `XDG_STATE_HOME` (`rtcore.py:20-21`). The default is `~/.local/share/sxr`. The binary itself is chosen by `REALITYTRACE_BIN`, then saved config, then provisioned copy (rtcore.py:139-150).
- Side by side: yes. Set `XDG_DATA_HOME` and `XDG_STATE_HOME` to a temp dir; `rtcore.py:203` already does this for probing, and Horizon's adapter does the same (realitytrace-obligation.ts:59).

## 3. Horizon store and tenant

- Store path: `config/horizon.toml:6` `runtime_store = ".cognate/app.sqlite"`, read at `src/config/load.ts:236`.
- Configurable: yes. `HORIZON_STORE` overrides it (load.ts:308, 313). `HORIZON_CONFIG` picks the config file (load.ts:300). No CLI flag found (`src/main.ts:12` takes a command word only).
- Tenant: `src/config/load.ts:320`, `tenant: \`local:${hostname()}\``. Used in `src/app.ts:298`. Not configurable from what I saw.

## 4. `src/adapters/realitytrace-obligation.ts`

Confirmed.
- Fixed target: line 50, `const TARGET = "concept:navigation_intent"`, used in `plan create` at line 119.
- `declare()` (lines 100-112) uses fixed criteria: question `is_true` / `verification` / `boolean`, with empty `target_entities`; threshold `minimum_relevance: "medium"`, `minimum_reliability: "medium"`. Only the id and title vary.
- Uses `spawnSync` (import at line 11, call at line 58 in `sxr()`), with `--json` appended, 120 s timeout and a minimal env.

## 5. GitHub

- `gh` installed: yes (2.103.0).
- `project` scope: no. Scopes present: `repo`, `workflow`, `read:org`, `gist`, `admin:public_key`.
- Remote: `github.com`, owner `GodSpeedAI`, repo `Horizon` (HTTPS). It is GitHub.
- Sub-issues (UNVERIFIED, from documentation knowledge, not checked live): GitHub supports sub-issues through the REST and GraphQL APIs on github.com for all owners, no per-owner flag. Needs `repo` scope, which is present. Adding to Projects would need `project`, which is missing.
