# Capabilities

## Overview

Cognate kernel `Component` registrations plus the durable record helpers those components depend on.
Two distinct kinds live here: capability components that expose an operation to the runtime
(`horizon.semantics.world`, `horizon.context.query_reference`, `horizon.navigation.intent.commit`),
and store-facing modules that own a record collection's lifecycle (pending intents, capacity ledger,
settlements, cases, remote devices).

The split mirrors the architecture: a component answers a typed request and returns an observation,
while durable records hold operational state across restarts. Capabilities registered here do not
decide authority; `horizon.navigation.intent.commit` only validates a typed intent against the frame
register and leaves authority and settlement to SEA-Forge and the obligation flow.

## Interface

- `semantic.ts`: `SEMANTIC_WORLD` = `{ id: "horizon.semantics.world", version: "1.0.0" }`
  `[semantic.ts:SEMANTIC_WORLD]`; `semanticWorldComponent(world: LoadedWorld): Component` returns
  `world_ref`, `cognate_world_ref`, `object_count`, `relation_count`, `unmapped`, `correlation_ref`
  `[semantic.ts:semanticWorldComponent]`; component id `"horizon.semantic-adapter"`.
- `context.ts`: `CONTEXT_REFERENCE` = `{ id: "horizon.context.query_reference", version: "1.0.0" }`
  `[context.ts:CONTEXT_REFERENCE]`; `contextReferenceComponent(config, options)` registering
  component id `"horizon.context-adapter"` `[context.ts:contextReferenceComponent]`;
  accepted input fields are exactly `operation`, `corpus_id`, `query`, `top_k`
  `[context.ts:REQUEST_FIELDS]`; replies `outcome: "absent"` from memory when no binding is configured
  `[context.ts:ABSENT]`.
- `navigation-intent.ts`: `NAVIGATION_INTENT_COMMIT` = `{ id: "horizon.navigation.intent.commit",
  version: "1.0.0" }` `[navigation-intent.ts:NAVIGATION_INTENT_COMMIT]`; `FrameRegister`
  (`current`, `issue`, `retain`, `retained`) and `createFrameRegister()`
  `[navigation-intent.ts:FrameRegister]`; `frameForIntent(register, intent, prefix)`
  `[navigation-intent.ts:frameForIntent]`; `appendIntentRecord`, `appendIntentAttempt`,
  `readIntentRecords`, `readIntentAttempts`, `navigationIntentComponent(register?)`;
  `IntentAttempt.outcome` is `"accepted" | "refused" | "awaiting_authority"`
  `[navigation-intent.ts:IntentAttempt]`; `IntentContract` = `{ expectation, threshold, window }`
  `[navigation-intent.ts:IntentContract]`; collection/stream names `"horizon.navigation-intents"`,
  `"horizon.navigation-intent-attempts"`, `"horizon.navigation-intent-index"`,
  `"horizon.navigation-intent-audit"` `[navigation-intent.ts:INTENT_STREAM]`.
- `pending-intent.ts`: `PENDING_COLLECTION = "horizon-navigation-intent-pending"`
  `[pending-intent.ts:PENDING_COLLECTION]`; `PendingIntent` with `stage: "awaiting_authority" |
  "executed" | "terminal"` and the frozen expectation/threshold/window/verifier argv
  `[pending-intent.ts:PendingIntent]`; `readPending`, `listPending`, `reservePendingIntent`,
  `updatePending`, `terminate` `[pending-intent.ts:reservePendingIntent]`.
- `capacity-ledger.ts`: `CAPACITY_LEDGER_COLLECTION = "horizon.capacity-ledger"`,
  `STORE_META_COLLECTION = "horizon.store-meta"`, `CONTRACT_VERSION = 2`
  `[capacity-ledger.ts:CONTRACT_VERSION]`; `contractVersionOf`, `readStoreMarker`, `markStore`,
  `readLedger`, `ledgerWrite`, `consumeReservation`, `ledgerKey(tenant)`
  `[capacity-ledger.ts:readLedger]`; `ContractVersionError` `[capacity-ledger.ts:ContractVersionError]`.
- `navigation-settlement.ts`: `SETTLEMENT_STREAM = "horizon.navigation-intent-settlements"`,
  `SETTLEMENT_COLLECTION = "horizon.navigation-intent-settlement"` `[navigation-settlement.ts:SETTLEMENT_STREAM]`;
  `NavigationSettlement` = `{ intent_id, execution_record, realitytrace_observation,
  settlement_reference, observed_payment?, at }` `[navigation-settlement.ts:NavigationSettlement]`;
  `SettlementReference.status` is one of `"settled" | "unsettled" | "rejected" | "refused" |
  "unavailable" | "not_required" | "pending"` `[navigation-settlement.ts:SettlementReference]`;
  `latestSettlement`, `appendSettlement`, `readSettlements`, `settlementKey(tenant, intentId)`.
- `contract-upgrade.ts`: `NAVIGATION_COMMIT_AGENT_ID = "horizon.navigation.commit"`,
  `SUSPENSION_COLLECTION = "horizon-navigation-intent-suspension"`, `SUSPENDED_REASON`
  `[contract-upgrade.ts:SUSPENDED_REASON]`; `assertCurrentRunInput`, `listRunSummaries`,
  `activateContract(store, now)`, `readSuspensions`, `rollbackVerdict(store)`;
  `SuspendedIntentError` carries `code = "failed_precondition"`
  `[contract-upgrade.ts:SuspendedIntentError]`.
- `workspace-records.ts`: `CASE_COLLECTION = "horizon-cases"`, `ONBOARDING_COLLECTION =
  "horizon-onboarding"`, `CASE_PURPOSE_MAX = 200` `[workspace-records.ts:CASE_PURPOSE_MAX]`;
  `OpenCase`, `PurposeCheck`, `checkPurpose`, `openCase`, `latestCase`, `setOnboardingSkipped`,
  `onboardingSkipped` `[workspace-records.ts:checkPurpose]`.
- `remote-records.ts`: `DEVICE_COLLECTION = "horizon-remote-devices"`, `AUDIT_COLLECTION =
  "horizon-remote-audit"` `[remote-records.ts:DEVICE_COLLECTION]`; `RemoteDevice` with
  `credential_id`, base64url `public_key`, `sign_count`, `generation`, `revoked_at`
  `[remote-records.ts:RemoteDevice]`; `addDevice`, `listDevices`, `updateDevice`, `auditRemote`.
- Subdirectories: none.

## Invariants

- Only the most recent frame may act: `issue` refuses a reissued frame at a revision it already had
  (`"frame … reissued at revision …"`) `[navigation-intent.ts:createFrameRegister]`; a commit that
  resumes on a retained frame must still be a choice of the current frame, otherwise
  `IntentError("failed_precondition", ...)` `[navigation-intent.ts:frameForIntent]`.
- Exactly once per `intent_id` per tenant: the intent event and an index record keyed
  `<tenant>/<intent_id>` at `expectedVersion: 0` commit atomically
  `[navigation-intent.ts:appendIntentRecord]`; the same id with different intent fields or a different
  `expectation_digest` throws `duplicate_intent` (`already_exists`)
  `[navigation-intent.ts:committedRecord]`.
- A refused intent writes no `NavigationIntentRecord`: the attempt record is a separate event
  (`horizon.navigation.intent.<outcome>`) `[navigation-intent.ts:appendIntentAttempt]`.
- A v1 or unknown contract version is refused: `assertCurrentRunInput` throws `SuspendedIntentError`
  unless `contractVersionOf(input) === CONTRACT_VERSION` `[contract-upgrade.ts:assertCurrentRunInput]`;
  an unknown `contract_version` is refused outright, `contractVersionOf` accepts only `1` and `2`
  `[capacity-ledger.ts:contractVersionOf]`.
- Pending intent identity is content-addressed: the same id with a different expectation digest or a
  different serialized intent is `duplicate_intent` with code `already_exists`
  `[pending-intent.ts:reservePendingIntent]`.
- The capacity ledger is written with the record's expected version, so a concurrent commit re-reads
  and re-evaluates instead of overspending `[capacity-ledger.ts:readLedger]`; becoming terminal
  converts a reservation into consumption idempotently `[capacity-ledger.ts:consumeReservation]`.
- Retrieval input is closed: any field beyond `operation`/`corpus_id`/`query`/`top_k` is rejected,
  the only accepted `operation` value is `"query_reference"`, and every answer carries
  `authority: { canonical: false, grants_authority: false }` `[context.ts:parseRequest]`.
- A throwing adapter is reported as `outcome: "unavailable"`, never as a crash that reads like success
  `[context.ts:contextReferenceComponent]`.
- Settlement parts that could not be obtained are `null` with a reason, never invented
  `[navigation-settlement.ts:NavigationSettlement]`; an uncommitted settlement record throws
  `"SETTLEMENT: the settlement record was not committed"` `[navigation-settlement.ts:appendSettlement]`.
- Case purpose must be one non-empty line within 200 characters, refused with `"empty"` or
  `"too_long"` rather than truncated `[workspace-records.ts:checkPurpose]`.

## Side Effects

- Durable store commits: intent events and the intent index `[navigation-intent.ts:appendIntentRecord]`,
  attempt events and the audit record `[navigation-intent.ts:appendIntentAttempt]`, the pending record
  plus its capacity reservation in one commit `[pending-intent.ts:reservePendingIntent]`, settlement
  event plus record `[navigation-settlement.ts:appendSettlement]`, case and onboarding upserts
  `[workspace-records.ts:openCase]`, device rows and remote audit rows
  `[remote-records.ts:auditRemote]`, the store marker `[capacity-ledger.ts:markStore]`, suspension
  records `[contract-upgrade.ts:activateContract]`.
- Store reads/streams: `readStream(INTENT_STREAM)`, `readStream(INTENT_ATTEMPT_STREAM)`,
  `readStream(SETTLEMENT_STREAM)`, `listRecords("runs")` and `readStream("run-<id>")`
  `[contract-upgrade.ts:listRunSummaries]`.
- Clock and identifier generation: `new Date().toISOString()` `[navigation-intent.ts:appendIntentRecord]`,
  `randomUUID()` for event ids and `case:${randomUUID()}` / `remote-audit:${randomUUID()}`
  `[workspace-records.ts:openCase]` `[remote-records.ts:auditRemote]`; `activateContract` takes an
  explicit `now: Date` `[contract-upgrade.ts:activateContract]`.
- Process-level memoization: `backfillIntentIndex` indexes pre-existing intents once per store per
  process via a `WeakSet` `[navigation-intent.ts:backfillIntentIndex]`.
- No subprocess, network or file-system access in this directory; the Context Kernel adapter (a
  subprocess owner) is reached only through `createContextKernelAdapter` in `../adapters`.

## Verification

- Run: `bun test`
