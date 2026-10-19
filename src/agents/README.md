# src/agents

Cognate `AgentDefinition`s. `health.ts` is the deterministic T04 structural agent: it
invokes the read-only semantic capability, emits a `horizon.health.checked` observation and
returns the pinned world reference plus run-scoped checkpoint. Business agents arrive in
later settlement tasks.
