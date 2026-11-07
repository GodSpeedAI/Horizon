# RealityTrace recon: what it records and how it differs from an ordinary agent trace

Paths: SXR = /home/sprime01/projects/sxr; CP = cognate/packages/realitytrace/src; WB = cognate-workbench/src.

## Short answer
An ordinary trace says "the agent did X and the tool said Y". RealityTrace is built to say "we wrote down what we expected BEFORE acting, then recorded what happened, and kept the difference, with proof the record was not edited afterwards". Today the Cognate/workbench wiring delivers only the second half in thin form (a tamper-evident receipt that a step happened). The expectation-versus-outcome part is live only in Horizon's settlement path.

## 1. Data model (SXR)
- Ledger: an append-only, hash-chained file per enrolled repo. Each row (sxr/schemas/sxr-record-v1.json): ledger_id, append_ordinal (position), entry_ulid, record_kind, idempotency_key, subject_refs, payload, payload_hash, previous_entry_hash, entry_hash, committed_at, writer_identity_ref. Altering a past row breaks the chain (`sxr ledger verify`).
- 26 closed record kinds (sxr/docs/reference/record-kinds.md). The ones that matter in plain terms: semantic.snapshot (the declared model), question.declared and threshold.declared (what we want to know, and what counts as enough proof, fixed first), run.started, plan.created, observation.recorded (what actually happened), evidence.created (an observation tied to a question, with relevance, reliability, and supports/contradicts/unknown), settlement.registered (a verdict, only after evidence), residual.computed (the declared-vs-observed gap), debt.recorded.
- Order is enforced: evidence needs an earlier observation, settlement needs an earlier threshold (record-kinds.md section 2, predecessors). That is the "expectation frozen before outcome" guarantee.
- Discrepancy: `sxr residual compute` produces residuals: declared_contradicted, declared_unobserved ("undefined, not success"), observed_undeclared, observed_consistent (README comparison table, ~lines 125-140; cli.md section 9). Diagnostic commands then enumerate possible causes and can raise repair proposals.
- Lineage: previous_entry_hash chain plus predecessor rules; CEP envelopes carry lineage_refs and provenance (CP/godspeed.ts).
- Questions: a question has form (is_true), type, target entities, title; thresholds hold minimum reliability and rule (e.g. AllEvidenceSupports).
- Query/read API: CLI only, no server. `sxr ledger export --repo` (JSON rows), `sxr projections export --canonical-json`, `ledger verify`, `diagnostic status`, `await`, `doctor`, `--json` on everything (cli.md). Cognate and Horizon read by shelling out and parsing ledger export (CP/sxr-cli.ts readEvidence/readCorrelation).

## 2. One tool call, side by side

Ordinary trace (WB/projections/sessionTrace.ts, TraceTool):
| Field | Meaning |
|---|---|
| toolCallId, eventId, tool | which call |
| args | JSON of the arguments |
| status | running, success, failed |
| result or error | the output text |
| startedAt, completedAt | timing |
It also stores chat turns (userText) and model requests (messages, toolNames, response, tool calls).

What RealityTrace adds today (CP/index.ts observationIntent, CP/types.ts Observation, CP/sxr-cli.ts record):
| Field | Meaning |
|---|---|
| observationId (obs-<eventId>) | stable id, safe to retry |
| tenant, correlationId, causationId, runId, scopeId, componentId, fiberId | who and what caused it, chain to the cause |
| capabilityId (tool.read) | which capability |
| semanticRef {namespace, id, kind, source{uri,digest}, projectionVersion} | link to a DomainForge object, only if the event carries one |
| classification | reversible_effect, durable_fact, external_commitment (workbench always sends durable_fact) |
| ledger position (ledger_id:ordinal), entry hash, committed_at | tamper-evident proof it was recorded, and when |
| delivery state | queued, accepted, duplicate, retrying, failed |

Honest caveat: in the workbench, record() sends the bare Observation as content (CP/sxr-cli.ts, `observation.trace ?? stripTrace`); the workbench passes no trace, inputRef or outputRef (WB/observations.ts). So the ledger holds correlation and metadata, NOT the arguments or result text. The ordinary trace is richer on content. The difference today is proof and independence, not more detail. Evidence derived from such a row would be "unknown" direction (Horizon/adapters/settlement.ts header comment). UNCONFIRMED: whether stdin JSON content is stored whole or hashed in the ledger payload.

Where the full value is already real: Horizon obligation settlement (Horizon/src/adapters/realitytrace-obligation.ts). Per intent it declares a question and threshold first (position T), then runs the verifier command under confinement as its own run, and records exit_code, argv, started_at, completed_at, crashed, ledger position. SEA-Forge then settles from that ledger. Example of what a person sees: Expected "tests pass" (frozen at ledger position 41); Observed exit code 1 at position 47; difference kept; verdict unsettled.

## 3. Binding to .sea / DomainForge / SEA-Forge
- SXR side exists: `sxr semantic configure --entry <file>.sea` then `sxr snapshot create` compiles via DomainForge into a semantic.snapshot (declared graph, closure hash, model validation status). A run binds a snapshot, question, threshold (README mental-model stage 1; cli.md sections 2-3). Settlement is refused if the model was invalid.
- Cognate/workbench side: NOT bound. The port uses `--snapshot snapshot:genesis` (CP/sxr-cli.ts prepare) and a fixed target `concept:runtime_execution`. Horizon uses `snapshot:horizon` and target `concept:navigation_intent`. No .sea is configured by either adapter (grep found no `semantic configure` call). The only world link is the optional semanticRef copied into extensions.cognate (correlation, not verification). Per-capability semanticRef binding exists in the workbench observation:read component options.
- SEA-Forge: Horizon passes the RealityTrace head (C) and SEA-Forge reads RealityTrace's ledger and stamps a closure (Horizon/settlement/obligation.ts lines ~11-13, 224).

## 4. Coverage and delivery
Captured by workbench (WB/observations.ts OBSERVED_EVENT_TYPES): tool.call.started/completed/failed, message.completed (final answer), run.failed, verification.observed, world.baseline/candidate frozen, world.candidate.rejected, world.settled, sentinel.finding, experiment.round.completed, method.recommended/accepted.
Not captured: run.invocation (model requests and their messages), session.turn.started (user prompts), subagent runs as separate items, settings changes. The set is "deliberately small" because each observation is one `sxr` subprocess (observations-realitytrace.md). Horizon's own path additionally records governed commits via `observationOutbox` (Horizon/adapters/settlement.ts line 62) and verifier runs.
Delivery: at-least-once, outbox committed in the same decision as the event, background drain every 1 s, backoff 250 ms to 4 s, 5 attempts then "failed" (poisoned, needs a person). Idempotent per observation (duplicate reports same position). Never blocks the app; no binary means queued. A plugin switch can pause the drain without loss. Receipt means "recorded", not "true" or "settled".
Enrich ALL logging: hook points that already exist: (a) runtime `outboxFor` hook, generic, per event (cognate/runtime-bun/src/runtime.ts ~228); (b) `OBSERVED_EVENT_TYPES` set, add run.invocation and session.turn.started; (c) `observationIntent` already accepts inputRef, outputRef, trace so content or a CEP execution_trace can ride along; (d) `executionTraceEnvelope` / `governedTraceFor` for governed calls; (e) Horizon `observationOutbox`. Missing: a declared expectation per call (needs question and threshold registered before the call; today only obligations do this), a .sea snapshot configured at enrollment, batching (one subprocess per event is a cost), and the daemon/queue/spool (sxr daemon, spool drain, in cli.md section 11) for lower per-event cost, UNCONFIRMED whether Cognate could use them.

## 5. Value without SEA-Forge
- Tamper-evident audit log with ordered positions (`ledger verify`); independent of the app's own store.
- Honest "unknown": missing evidence stays missing, not success.
- Expected-versus-observed for any command-verifiable claim ("tests pass", "file unchanged") via plan --argv-json and verify run, with exit code, digest of the repo before the run (target_digest), stdout/stderr refs.
- Export for decisions or training data: `sxr ledger export` (JSON rows), `projections export --canonical-json`, `projections export-anti-collapse-corpus --question --snapshot` (cli.md section 10; a corpus export aimed at labelled collapse cases; UNCONFIRMED what exactly it contains). Rows with supports/contradicts/unknown plus residual kinds are natural labelled outcomes for agent training or for choosing which tools/methods to trust. No Horizon or workbench export built on this exists (UNCONFIRMED; grep of Horizon/src found only settlement and economics adapters).

## Suggested side-by-side for Horizon
Left "What the agent log says": prompt, tool, args, result, timing. Right "What RealityTrace adds": expected (frozen before, at position N), observed (exit code, time), difference (matched, contradicted, not observed), proof (ledger position, chain verified), delivery status. Be honest in the UI that for ordinary tool calls today only the proof and delivery parts exist; expected and difference appear for verifier-backed obligations.
