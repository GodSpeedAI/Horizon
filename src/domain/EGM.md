# Domain

## Overview

Pure, typed domain vocabulary for the navigation environment. Nothing here reads a clock, a store or
the network except where a check explicitly hashes bytes; time, capacity ledger values, artifact
digests and verifier evidence all arrive as parameters or values. That purity is deliberate: a frame,
a case, an affordance assessment and a settlement judgment must be reproducible from their inputs.

The module set keeps the architecture's distinctions separate rather than merging them:

- **world / checkpoint** — `operational.ts` (semantic vs operational vs lineage graphs, composite
  checkpoint refs) and the projection read frames.
- **frame** — `navigation.ts` (gates, affordance status, choices) and `frame.ts` (the legacy
  structural frame shape).
- **intent** — `intent.ts` (typed `CommitIntentInput`, stale-frame and duplicate guard).
- **expectation / settlement** — `expectation.ts` (frozen expected outcome, verifier templates,
  window, discrimination, three-valued evidence classification, epistemic status).
- **approval inbox** — `approval-inbox.ts` (validates SEA-Forge's `authority_approvals` rows, groups
  them, and says which decision buttons may be offered; it never decides).
- **payment** — `payment.ts` (currency vector, declared bounds, capacity ledger, the payment gate).
- **debugger** — `debugger.ts` (seven read-only questions, each value labelled with its class).

## Interface

- `operational.ts`: `OBJECT_SCHEMA = "horizon.operational-objects/1"` `[operational.ts:OBJECT_SCHEMA]`;
  zod schemas `SemanticRef`, `ObjectRef`, `RelationTypeRef`, `ProvenanceV1`, `OperationalObjectV1`,
  `OperationalLinkV1`, `LineageEdgeV1` `[operational.ts:OperationalObjectV1]`;
  `INTEGRATION_LEVELS = ["bound","read_only","fixture","planned"]`
  `[operational.ts:INTEGRATION_LEVELS]`; `GRAPH_KINDS = ["operational","import","lineage"]`
  `[operational.ts:GRAPH_KINDS]`; `OUTCOME_STATUSES = ["empty","no-match","denied","blocked",
  "unavailable"]` `[operational.ts:OUTCOME_STATUSES]`; `QUERY_FAILURE_CODES = ["scope","limit",
  "checkpoint","undeclared","dangling","world"]` `[operational.ts:QUERY_FAILURE_CODES]`;
  `QueryScope`, `QueryResult<T>`, `ObserverState`, `ReadFraming` `[operational.ts:QueryScope]`;
  `CHECKPOINT_SCHEMA = "cognate-checkpoint/1"` with `parseCheckpointRef` /
  `formatCheckpointRef` `[operational.ts:parseCheckpointRef]`.
- `navigation.ts`: `NAVIGATION_SCHEMA = "horizon.navigation/2"` `[navigation.ts:NAVIGATION_SCHEMA]`;
  closed vocabularies `GATE_KEYS` (`visibility`, `reach`, `payment`, `authority`, `capability`,
  `recovery`, `settlement_access`) `[navigation.ts:GATE_KEYS]`, `AFFORDANCE_STATUSES` (`possible`,
  `available`, `blocked`, `unknown`, `conflicted`) `[navigation.ts:AFFORDANCE_STATUSES]`,
  `AUTHORITY_OUTCOMES` (`likely_allow`, `requires_approval`, `deferred_to_invocation`, `denied`,
  `unreachable`, `unknown`, `not_applicable`) `[navigation.ts:AUTHORITY_OUTCOMES]`,
  `REVERSIBILITY_CLASSES` `[navigation.ts:REVERSIBILITY_CLASSES]`, `NAVIGATION_RESPONSIBILITIES`
  (`orient`, `inspect`, `choose`, `commit`, `observe`, `review`)
  `[navigation.ts:NAVIGATION_RESPONSIBILITIES]`; `NavigationError` with codes `invalid_argument`,
  `undeclared_gate`, `stale_frame`, `unavailable_choice` `[navigation.ts:NavigationError]`;
  `assertGates`, `assessAffordance`, `deriveCase`, `planContextSelection`, `selectViewMode`,
  `buildNavigationFrame`, `reviseNavigationFrame`, `assertFrameChoice`
  `[navigation.ts:buildNavigationFrame]`; `NavigationFrame` carries literal
  `authority: { grants_authority: false }` `[navigation.ts:NavigationFrame]`; observer controls
  `horizon.navigation.inspect` / `.defer` / `.reframe` / `.disagree`
  `[navigation.ts:observerControls]`.
- `frame.ts`: `AffordanceStatus = "available" | "blocked" | "unknown" | "conflicted"`
  `[frame.ts:AffordanceStatus]`; `NavigationFrameV1` with
  `schema: "horizon.navigation-frame/1"` and `responsibility: "orient" | "decide" | "execute" |
  "monitor" | "journey.compare" | "develop"` `[frame.ts:NavigationFrameV1]`;
  `NavigationIntentRecord` in canonical field order `[frame.ts:NavigationIntentRecord]`;
  `buildStructuralFrame(options)` which offers `horizon.health` and `horizon.research.health` as
  `read_only` choices `[frame.ts:buildStructuralFrame]`.
- `intent.ts`: `IntentError` with codes `invalid_argument | failed_precondition | already_exists`
  `[intent.ts:IntentError]`; `CommitIntentInput` = the five canonical fields
  `[intent.ts:CommitIntentInput]`; `CommitIntentOutput` = `{ intent_id, correlation_ref? }`;
  `buildCommitIntent`, `assertCommitIntent(value, frame, callerActorRef, allowedExtra?)`
  `[intent.ts:assertCommitIntent]`.
- `expectation.ts`: `MODALITIES = ["obligation","prohibition","permission"]`
  `[expectation.ts:MODALITIES]`; `VerifierTemplate` (`kind: "command"`, `argv`, `artifacts`,
  `read_only: true`) `[expectation.ts:VerifierTemplate]`; `assertVerifierTemplate`,
  `artifactMismatches`, `instantiate`, `templateRef` `[expectation.ts:assertVerifierTemplate]`;
  `ExpectedOutcome` with `modality`, `statement`, `refuted_by`, `irrelevant`, `unaccounted`,
  `verifier.template_ref`, `window_s` `[expectation.ts:ExpectedOutcome]`; `expectationDigest`
  producing `sha256:<hex>` `[expectation.ts:expectationDigest]`; `settlementAccessGate`
  `[expectation.ts:settlementAccessGate]`; `SettlementWindow`, `openWindow`, `windowOpen`,
  `runTimeoutS` `[expectation.ts:openWindow]`; `discriminate`, `classify`, `judgeSettlement`
  `[expectation.ts:judgeSettlement]`; `EpistemicStatus` = `supported | contradicted | inconsistent |
  unresolved` and `OperationalSettlement` = `settled | rejected | unsettled | pending |
  not_required` `[expectation.ts:EpistemicStatus]`.
- `payment.ts`: `CURRENCIES` = `steering_attention`, `orchestration`, `compute`, `verification`,
  `recovery`, `structural_maintenance`, `representational_formation`, `risk_irreversibility`,
  `opportunity` `[payment.ts:CURRENCIES]`; `PaymentEntry` (`basis: "declared_bound" | "predicted"`,
  `amount: number | "unknown"`) `[payment.ts:PaymentEntry]`; `assertPaymentEntry`, `validateBinding`,
  `assertAllowance`, `available`, `judgeEntry`, `paymentGate`, `reserve`, `consume`,
  `holdsReservation`, `emptyLedger`, `capacityKey`, `formatPayment`
  `[payment.ts:paymentGate]`; `PaymentError` `[payment.ts:PaymentError]`; `ObservedPayment`,
  `PaymentView` `[payment.ts:PaymentView]`.
- `debugger.ts`: `DEBUGGER_SCHEMA = "horizon.world-debugger/1"` `[debugger.ts:DEBUGGER_SCHEMA]`;
  `DEBUGGER_OPERATIONS` = `why`, `impact`, `diff`, `timeline`, `counterfactual`, `reach`, `replay`
  `[debugger.ts:DEBUGGER_OPERATIONS]`; `VALUE_CLASSES` = `recorded`, `derived`, `unknown`, `effect`,
  `untrusted_reference` `[debugger.ts:VALUE_CLASSES]`; caps `MAX_IMPACT_DEPTH = 4`,
  `MAX_IMPACT_NODES = 64`, `MAX_TIMELINE_ROWS = 200`, `MAX_WHY_ROWS = 100`
  `[debugger.ts:MAX_IMPACT_DEPTH]`; `DebuggerSources`, `DebuggerAnswer`, `DebuggerScope`,
  `DebuggerValue`, `DebuggerArguments`, `runDebugger(sources, request)`
  `[debugger.ts:runDebugger]`, `debuggerCatalogue()` `[debugger.ts:debuggerCatalogue]`; `reach`
  rungs `installed`, `configured`, `probed`, `reachable`, `authorized` `[debugger.ts:REACH_RUNGS]`.
- Subdirectories: none.

## Invariants

- Graph kinds stay distinct: an operational link schema is literally `graph: "operational"` and a
  lineage edge `graph: "lineage"`; `import` and `lineage` are never operational links
  `[operational.ts:OperationalLinkV1]` `[operational.ts:LineageEdgeV1]`. A semantic ref and an object
  ref are distinct types with distinct regexes `[operational.ts:SemanticRef]`.
- Five outcome facts are never collapsed: `empty`, `no-match`, `denied`, `blocked`, `unavailable`;
  `denied` deliberately carries no count `[operational.ts:OUTCOME_STATUSES]`.
- A checkpoint is position **plus** projection names and versions, and formatting sorts projections so
  the string is order-independent `[operational.ts:formatCheckpointRef]`; `parseCheckpointRef`
  returns `null` for anything not matching `^cognate-checkpoint/1@(\d+);(.+)$`
  `[operational.ts:parseCheckpointRef]`.
- Every gate key must be present and no non-canonical key may appear; only the `authority` gate may
  carry `authority_outcome`, and a non-`pass` verdict requires a material reason
  `[navigation.ts:assertGates]`.
- Availability is the **last** outcome: all failed and unknown hard gates are collected before a
  status is chosen `[navigation.ts:assessAffordance]`; a consequential operation declaring authority
  `not_applicable` is a blocker `[navigation.ts:assessAffordance]`; `selectable` is true only for
  `status === "available"` `[navigation.ts:buildNavigationFrame]`.
- A frame cannot claim authority: the field is the literal `{ grants_authority: false }`
  `[navigation.ts:NavigationFrame]`; ranking never creates eligibility — the primary choice is the
  first available move ordered by `operation_ref` `[navigation.ts:buildNavigationFrame]`.
- A case is derived, never stored, and cannot become an ontology: unknown keys on the case, its
  direction or its facts are refused and `ontology` is literally `null`
  `[navigation.ts:deriveCase]`; a material fact must also be a deviation
  `[navigation.ts:deriveCase]`; an empty fact list is refused
  `[navigation.ts:deriveCase]`.
- A context carries either a checkpoint or an explicit unknown reason, never both and never neither
  `[navigation.ts:assertContext]`; a consequential assessment must carry a payment view, expected
  evidence and escalation behavior `[navigation.ts:assertReviewable]`; duplicate candidate operation
  refs are refused `[navigation.ts:buildNavigationFrame]`; a case's `world_ref`, `focus_ref` and
  `case_ref` must match the context `[navigation.ts:buildNavigationFrame]`.
- Frames are frozen on return, including nested arrays and the authority object
  `[navigation.ts:deepFreezeFrame]`; a choice made against another revision is
  `NavigationError("stale_frame", …)` and a non-selectable choice is `unavailable_choice`
  `[navigation.ts:assertFrameChoice]`.
- A typed intent carries no authority: undeclared fields (other than `correlation_ref` and
  `allowedExtra`) are refused, `intent_id` must be a UUID, `frame_id`/`frame_revision` must match the
  frame, `actor_ref` must equal the authenticated observer, and `operation_ref` must be a choice of
  that frame `[intent.ts:assertCommitIntent]`.
- An expectation is frozen before observation: unknown fields are refused, `verifier` must be exactly
  `{ template_ref }` (never free text), `window_s` must be a positive integer, and the digest is
  sha256 over canonical JSON `[expectation.ts:assertExpectedOutcome]`
  `[expectation.ts:expectationDigest]`. A verifier template must be `kind: "command"`,
  `read_only: true`, pin at least one sha256 artifact with unique names, start argv with a pinned
  artifact and check the effect identity `[expectation.ts:assertVerifierTemplate]`.
- Only `modality: "obligation"` is supported in this version; other modalities are `blocked` at the
  settlement-access gate rather than executed `[expectation.ts:settlementAccessGate]`; an unconfigured
  settlement is `unknown`, never `pass` `[expectation.ts:settlementAccessGate]`.
- Evidence admissibility is positional, not wall-clock: a run outside `(B, C]` is excluded, and a
  missing or late `completed_at` is `undefined` rather than a result `[expectation.ts:classify]`;
  exit 0 in the discrimination run refuses with `"expected outcome already holds before acting"`
  `[expectation.ts:discriminate]`; `known_0` plus `known_nonzero` is `inconsistent`, and no known
  result is `unresolved` → `rejected` `[expectation.ts:judgeSettlement]`.
- Payment is a vector of non-fungible currencies: nothing sums or converts across currencies, a
  binding is valid only with exactly one `declared_bound` per currency and `predicted` entries never
  count toward coverage `[payment.ts:validateBinding]`; a `reserve` for an intent that already holds a
  reservation or consumption is refused `[payment.ts:reserve]`.
- The debugger labels every value with its class and never claims authority:
  `authority: { grants_authority: false }` and `settles: false` are literals
  `[debugger.ts:DebuggerAnswer]`; bounds are required, not defaulted
  `[debugger.ts:MAX_IMPACT_DEPTH]`; `impact` refuses a missing bound with code `"limit"` and an
  undeclared relation with `"undeclared"` `[debugger.ts:impact]`; an unread comparison checkpoint is
  `unavailable` with code `"checkpoint_unreadable"`, never an empty diff `[debugger.ts:diff]`; an empty
  `replay` selection is `not-selected`, never a pass `[debugger.ts:replay]`; `reach` reports
  `probed`/`reachable`/`authorized` as unknown because no prober runs
  `[debugger.ts:reach]`.

## Side Effects

- Hashing only: `createHash("sha256")` in `expectationDigest` is the sole crypto call
  `[expectation.ts:expectationDigest]`. No file, network, clock or environment access: window and
  capacity functions take `Date` values as arguments `[expectation.ts:windowOpen]`
  `[payment.ts:available]`.
- No durable writes and no mutation: results are returned frozen
  `[navigation.ts:deepFreezeFrame]` `[payment.ts:emptyLedger]` `[debugger.ts:answer]`.
- No subprocess or IPC. `debugger.ts` consumes an already-read `DebuggerSources` snapshot; the
  projection reads it describes happen in `../adapters/operational-objects.ts`.

## Verification

- Run: `bun test`
