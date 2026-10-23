# src/agents

Cognate `AgentDefinition`s. `health.ts` is the deterministic T04 structural agent: it
invokes the read-only semantic capability, emits a `horizon.health.checked` observation and
returns the pinned world reference plus run-scoped checkpoint. Business agents arrive in
later settlement tasks.

`navigation-commit.ts` is the governed commit (readiness P04): with SEA-Forge governance on, a typed
intent is committed inside this run, so SEA-Forge's `escalate` parks it on a durable approval until
the operator decides. It writes the intent record itself, in a recorded step, exactly once per
`intent_id`.
