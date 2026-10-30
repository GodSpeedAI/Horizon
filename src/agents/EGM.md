# Agents

## Overview

Cognate `AgentDefinition` factories. Each export is a deterministic run body: it validates typed input,
invokes registered capabilities, and emits or records its observation through the run context. No
module here decides authority, execution or settlement; the governed commit delegates those to
SEA-Forge (through Cognate's Governor) and to the settlement obligation flow.

## Interface

- `health.ts`: `HEALTH_AGENT` = `{ id: "horizon.health", version: "1.0.0" }`
  `[health.ts:HEALTH_AGENT]`; `structuralObservationAgent(register: FrameRegister): AgentDefinition`
  `[health.ts:structuralObservationAgent]`; `StructuralObservationRequest` =
  `{ intent, world_ref, checkpoint_ref }` `[health.ts:StructuralObservationRequest]`; historical
  `healthAgent: AgentDefinition` built from a null frame register `[health.ts:healthAgent]`.
- `navigation-commit.ts`: `NAVIGATION_COMMIT_AGENT` = `{ id: "horizon.navigation.commit", version:
  "1.0.0" }` `[navigation-commit.ts:NAVIGATION_COMMIT_AGENT]`;
  `navigationCommitAgent(store: () => DurableStore, obligation?: CommitObligation): AgentDefinition`
  `[navigation-commit.ts:navigationCommitAgent]`; `CommitObligation = { bindingFor, deps }`
  `[navigation-commit.ts:CommitObligation]`; `NavigationCommitOutput` =
  `{ intent_id, correlation_ref, event_id, position }` `[navigation-commit.ts:NavigationCommitOutput]`.
- Connected contracts (not owned here): `horizon.semantics.world` is invoked by the health agent
  `[health.ts:structuralObservationAgent]`; `NAVIGATION_INTENT_COMMIT.id` is invoked by the commit
  agent `[navigation-commit.ts:navigationCommitAgent]`.
- Subdirectories: none.

## Invariants

- Observations are bound to a committed typed intent: the health run throws
  `"HEALTH: no navigation frame has been issued"` when the frame register is empty, requires
  `world_ref` and `checkpoint_ref` strings, and validates the intent with `assertCommitIntent(...,
  frame.observer_ref, ["correlation_ref"])` `[health.ts:readObservationRequest]`.
- The health agent reports the checkpoint as run-scoped, `cognate:${context.runId}`, and returns the
  input world/checkpoint refs alongside it rather than overwriting them
  `[health.ts:structuralObservationAgent]`.
- A v1 run (started before the 1.1.0 upgrade) is suspended and never executes even once approved:
  `assertCurrentRunInput(input, intent.intent_id)` is checked before anything else and again inside the
  record step `[navigation-commit.ts:navigationCommitAgent]`.
- A bound operation must already have a pending intent (`"INTENT: … is bound; its commit needs a
  pending intent"`), and a terminal pending intent is refused immediately
  `[navigation-commit.ts:navigationCommitAgent]`.
- An expired window is refused before invocation and again after approval, inside recorded steps
  `[navigation-commit.ts:navigationCommitAgent]`; a `decision.proceed === false` from the
  discrimination run is refused as `decision.refusal ?? "discrimination unknown"`.
- The commit must answer for the same intent: `result?.intent_id !== intent.intent_id` throws
  `"INTENT: the commit answered for a different intent"` `[navigation-commit.ts:navigationCommitAgent]`.
- `appendIntentRecord` is exactly-once per `intent_id`, so a replayed or crash-resumed run never
  writes a second record `[navigation-commit.ts:navigationCommitAgent]`; the audit attempt is written
  in its own step so a commit resumed by SEA-Forge polling is audited identically
  `[navigation-commit.ts:navigationCommitAgent]`.

## Side Effects

- Capability invocations through the run context: `context.invoke("horizon.semantics.world", {})`
  `[health.ts:structuralObservationAgent]` and `context.invoke(NAVIGATION_INTENT_COMMIT.id, …)` with
  optional `authorityClaims` `[navigation-commit.ts:navigationCommitAgent]`.
- Event emission: `context.emit("horizon.health.checked", { world_ref, correlation_ref, intent_id })`
  `[health.ts:structuralObservationAgent]`.
- Durable writes through the store: `appendIntentRecord` `[navigation-commit.ts:navigationCommitAgent]`,
  `appendIntentAttempt` with `at: new Date().toISOString()`
  `[navigation-commit.ts:navigationCommitAgent]`, and `terminate(..., "refused", refusal, deps.now())`
  inside the `refuse` step `[navigation-commit.ts:navigationCommitAgent]`.
- Reads of pending intent state: `readPending(store(), context.tenant, intent.intent_id)`
  `[navigation-commit.ts:navigationCommitAgent]`.
- Clock dependence: window expiry via `windowOpen(pending.window, obligation.deps.now())`
  `[navigation-commit.ts:navigationCommitAgent]`.

## Verification

- Run: `bun test`
