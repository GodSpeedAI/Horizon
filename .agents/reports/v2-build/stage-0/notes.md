# Stage 0 notes (spec deviations and choices)

- `HORIZON_SETUPS_BASE` (default `~/.horizon/setups`) is the injected base dir; tests use temp dirs only.
- Each script exports `run(args, env, out, err)` and runs it under `import.meta.main`, so tests call it in-process. `gh` is always resolved from PATH (tests put the fake first).
- `setup-check-empty`: Horizon has no SEA-Forge `case_list` client. A live socket at `<root>/cell/sea-forge.sock` is counted as one unanswered case (fails); an absent socket counts 0. Record counts use `realitytrace repo list` (repositories present), not ledger rows. GitHub production items are counted only when `<root>/github.json` exists (production repos are named at stage 6).
- `[records]` is written as `[[records.sources]]` tables; `HorizonConfig.records = {sources}`. `LoadedConfig.setup` was added so the status bar can show "Setup: not set" later.
- `setup-clear` deletes all issues in the sandbox repo (spec: "sandbox issues"), not only the ones created by setup-github.
- `setup-env` adds `HORIZON_SETUPS_BASE` when set, and `HORIZON_CONNECTOR_HEARTBEAT` for the connector (path from the spec's health check); the connector itself is stage 4.
- `config/horizon.toml` is unchanged; the setup copy gets the port and the three sections. `package.json` scripts unchanged.
- The testing board came back as project #2 (a project named differently, or an earlier one, already held #1).
