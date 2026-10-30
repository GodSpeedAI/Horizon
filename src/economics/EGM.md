# Economics

## Overview

A pure presentation model over what RealityTrace already recorded. `model.ts` takes the rows of
`realitytrace ledger export --json` and `realitytrace projections export --canonical-json` and arranges
them repo → case → session. It stores nothing, writes nothing, gates nothing and computes no
counterfactual; Horizon is not an evidence database.

The rules exist so every figure equals the audited data: an agent event is counted once per
`event_id`, a native cost is `owner = native` tokens only, an ESTIMATED figure keeps its own field and
is never added into an observed one, an unbound case is `null` rather than invented, and every total is
the sum of the rows beneath it.

## Interface

- `ECONOMICS_SCHEMA = "horizon.economics/1"` `[model.ts:ECONOMICS_SCHEMA]`.
- Closed vocabularies: `BUCKETS = ["input","output","cache_read","cache_write"]` `[model.ts:BUCKETS]`;
  `QUALITIES = ["EXACT","DERIVED","ESTIMATED","UNAVAILABLE"]` `[model.ts:QUALITIES]`;
  `RESIDUAL_KINDS = ["observed_undeclared","declared_unobserved","declared_contradicted",
  "settled_with_debt"]` `[model.ts:RESIDUAL_KINDS]`; `ARMS = ["B","T","G","F"]` `[model.ts:ARMS]`.
- Shapes: `TokenSums` `[model.ts:TokenSums]`, `Totals` (observed, observed_estimated, te_overhead,
  te_injection_attributed, other_owner, usage_events, tool_post, tool_fail, events_without_tokens,
  journeys, events) `[model.ts:Totals]`, `SessionModel` `[model.ts:SessionModel]`, `CaseModel` with
  `case_id: string | null` where `null` means unbound `[model.ts:CaseModel]`, `ResidualSummary`,
  `AblationRow`, `EconomicsModel` `[model.ts:EconomicsModel]`.
- Functions: `economicsModel(ledgerRows, projectionRows = []): EconomicsModel`
  `[model.ts:economicsModel]`; `zeroTotals()` `[model.ts:zeroTotals]`; `addTotals(into, from)`
  `[model.ts:addTotals]`; `journeyOf(questionId)` parsing `journey:<J>:<field>:<n>[@version]`
  `[model.ts:journeyOf]`.
- Consumed by `../adapters/realitytrace-economics.ts`, which reads the rows over the RealityTrace CLI;
  nothing in this directory spawns a process.

## Invariants

- One agent event counts once per `event_id`: rows are ordered by `append_ordinal` and the first append
  wins; a repeat with an identical payload increments `duplicate_rows`, a differing repeat increments
  `conflicting_rows` and is not merged `[model.ts:economicsModel]`.
- Only `record_kind === "observation.recorded"` rows with an `extensions.agent_event` object are agent
  events; a malformed one increments `ignored_rows` `[model.ts:economicsModel]`. A row missing
  `event_id`, `runtime`, `native_session_id`, `kind` or `owner` is ignored
  `[model.ts:readEvent]`.
- `case_id` of `"unknown"` (the tap's own sentinel) is treated as no case, i.e. `null`
  `[model.ts:readEvent]`.
- Native cost is `owner === "native"` only; TE overhead is `owner === "te"` with
  `kind === "te_overhead"`; TE injection is an input-token **estimate** recorded separately in
  `te_injection_attributed` and the session's `lessons`; any other owner's tokens go to
  `other_owner` and are never mixed into observed `[model.ts:economicsModel]`.
- ESTIMATED token quality is carried in `observed_estimated` as a subset of `observed`, never
  relabelled `[model.ts:economicsModel]`.
- `LessonRow.estimate` is typed `null` — Horizon never computes a counterfactual saving
  `[model.ts:LessonRow]`.
- A usage event without token counts increments `events_without_tokens` rather than counting as zero
  `[model.ts:economicsModel]`.
- Journey verdicts are the newest `journey_check` per (session, question), compared on `(ts, ordinal)`;
  a declared journey question never observed in a session is counted `undefined` exactly once per
  session, under the first case that session appears in, so the sums stay exact
  `[model.ts:economicsModel]`.
- Roll-up order is fixed and content-derived: sessions sorted by `first_ts`, then `runtime`, then
  `native_session_id`; cases sorted with bound cases first and the unbound case last
  `[model.ts:economicsModel]`.
- Overhead is `te_overhead.total / observed.total * 100`, and `null` when nothing was observed
  `[model.ts:overheadPct]`.
- Residuals are de-duplicated by `residual_id` (falling back to the row's JSON) and counted per
  `residual_kind`, with every `RESIDUAL_KINDS` entry pre-seeded at 0
  `[model.ts:economicsModel]`.
- Ablation is reported only when events carry an arm other than `"none"`: `ablation.run` is
  `rows.length > 0` `[model.ts:economicsModel]`.

## Side Effects

- None observed in source. The module is a pure function over arrays: no store, file, network,
  subprocess, clock or randomness. `unattributed_usage` copies token sums so the unbound case is
  repeated without being consumed `[model.ts:economicsModel]`; the function does mutate the
  caller-provided row objects only by accumulation into newly created `Totals`
  `[model.ts:addTotals]`.

## Verification

- Run: `bun test`
