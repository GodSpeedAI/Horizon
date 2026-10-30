# Config

## Overview

Typed loading and validation of Horizon's single TOML configuration document, plus the identity and
launch-secret material derived from it. `types.ts` declares the shape; `load.ts` validates it with
hand-written checks that fail closed, converts domain validators' refusals into named config errors,
and resolves environment overrides.

Absence is meaningful and distinct from malformed: `context_kernel`, `settlement` and `economics` are
each optional as a whole but must be complete when present, and an absent Context Kernel is reported
downstream as `absent`, never as `unavailable`.

## Interface

- `types.ts`: `DeploymentProfile = "local_operator" | "shared_remote"`
  `[types.ts:DeploymentProfile]`; `HorizonConfig` with `deployment_profile`, `bind_host`, `port`,
  `world_alias`, `world_ref`, `runtime_store`, `research_command`, optional `context_kernel`,
  `identity`, `secrets`, `transports`, `operations`, `capacity`, optional `settlement`, optional
  `economics` `[types.ts:HorizonConfig]`; `IdentityConfig.source: "os_session" |
  "identity_provider"` `[types.ts:IdentityConfig]`; `SecretsConfig.mode: "per_launch"`;
  `TransportConfig` with `connect`/`http`/`gui` all typed `"loopback"` `[types.ts:TransportConfig]`;
  `ContextKernelConfig` = `{ command, corpus_id }` `[types.ts:ContextKernelConfig]`;
  `EconomicsConfig` = `{ realitytrace_bin, data_home?, state_home? }` `[types.ts:EconomicsConfig]`;
  `OperationBindingConfig` with `reversibility: "read_only" | "reversible" | "compensable" |
  "irreversible" | "unknown"`, optional `settlement: "required"`, `payment`, `verifier`,
  `verifier_paths` `[types.ts:OperationBindingConfig]`; `SettlementConfig` = `{ launcher,
  close_grace_s }` `[types.ts:SettlementConfig]`; `LoadedConfig` = `{ config, operator, launchSecret,
  secretPath }` `[types.ts:LoadedConfig]`.
- `load.ts`: `ConfigError` `[load.ts:ConfigError]`; `configFromDocument(document): HorizonConfig`
  `[load.ts:configFromDocument]`; `loadConfig(path = process.env.HORIZON_CONFIG ??
  "config/horizon.toml"): LoadedConfig` `[load.ts:loadConfig]`; `economicsFromEnv(env, fromFile?)`
  reading `HORIZON_ECONOMICS_REALITYTRACE_BIN` / `_DATA_HOME` / `_STATE_HOME`
  `[load.ts:economicsFromEnv]`; `operatorPrincipal`, `agentPrincipal`, `assertAgentPrincipal`
  `[load.ts:operatorPrincipal]`.
- Subdirectories: none.

## Invariants

- `deployment_profile` must be `local_operator` or `shared_remote` `[load.ts:PROFILES]`; a
  `local_operator` bind host must be loopback (`127.0.0.1`, `::1`, `localhost`)
  `[load.ts:LOOPBACK]` and its identity source must be `os_session`
  `[load.ts:configFromDocument]`; `shared_remote` requires `identity.identity_provider`
  ("refusing to start without a real IdP") `[load.ts:configFromDocument]`.
- `secrets.mode` must be `per_launch` `[load.ts:configFromDocument]`, and every transport must be
  `loopback` `[load.ts:configFromDocument]`.
- `port` must be an integer from 0 to 65535 `[load.ts:asPort]`; strings must be non-empty after trim
  `[load.ts:asString]`; `settlement.close_grace_s` must be an integer from 0 to 3600 (default 30)
  `[load.ts:asSettlement]`.
- Context Kernel is optional as a whole but complete when present: an opaque corpus id matching
  `^[A-Za-z0-9][A-Za-z0-9._:-]*$` is required and a path is refused
  `[load.ts:asContextKernel]`.
- Structural moves cannot be rebound: `horizon.health` and `horizon.research.health` are refused as
  operation bindings, and a duplicate `operation_ref` is refused
  `[load.ts:asOperations]`; `reversibility` must be one of `REVERSIBILITY_CLASSES`
  `[load.ts:asOperations]`; `settlement` may only be `"required"` `[load.ts:asOperations]`.
- Domain validators are the authority for payment entries, allowances and verifier templates:
  `assertPaymentEntry`, `assertAllowance`, `assertVerifierTemplate` are wrapped so their refusal
  becomes a config error naming the field `[load.ts:validated]`.
- Agent identity never collapses into the operator: `agentPrincipal` refuses an empty id or one that
  starts with `operator_prefix`, and `assertAgentPrincipal` requires `kind === "agent"` with the
  matching id `[load.ts:assertAgentPrincipal]`.
- `research_command` is optional; absent means an empty command, not a malformed one
  `[load.ts:asOptionalCommand]`.

## Side Effects

- File system: reads the TOML document with `readFileSync`
  `[load.ts:readText]`; writes the per-launch secret with `writeFileSync(..., mode: 0o600)` and
  `chmodSync(full, 0o600)`, creating parent directories `[load.ts:writeLaunchSecret]`.
- Randomness: `randomBytes(32).toString("hex")` generates the launch secret
  `[load.ts:writeLaunchSecret]`.
- Environment reads: `process.env.HORIZON_CONFIG` `[load.ts:loadConfig]`, `process.env.HORIZON_STORE`
  which overrides `runtime_store`, and `process.env.HORIZON_SECRET_FILE`
  `[load.ts:loadConfig]`; the economics override variables `[load.ts:economicsFromEnv]`.
- Host identity: `hostname()` forms the tenant `local:<hostname>` and `userInfo()` provides
  `username`/`uid` for the operator principal `[load.ts:loadConfig]` `[load.ts:operatorPrincipal]`.
- Process: `Bun.TOML.parse` is the only parser used for the config document
  `[load.ts:loadConfig]`.

## Verification

- Run: `bun test`
