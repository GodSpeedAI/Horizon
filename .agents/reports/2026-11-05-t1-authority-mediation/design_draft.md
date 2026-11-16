# T1 · Authority Mediation — Design (v7.1, review complete)

* **Date:** 2026-11-05
* **Status:** v7.1. The sequential EGM review of the revised design (Stages 5-9) is complete; Stage 9 passed on re-audit with its last Major fixed in place.
* **Review record:**
  * v1 review: `review/stage-reports.md` and `RESOLUTION.md`.
  * Review of the revised design: `review-v2/`, the Stage 5-9 reports and their `stage*_resolution.md` files.
* **Input:** the concepts brief v4 and the owner's adjudication record, `../2026-11-04-egm-design-discovery/02-concepts-brief.md` and `04-adjudication-remaining.md`. The adjudication holds the owner decisions D-N1 (split identity into T2), D-N2 (T2's proof bar) and D-N3, plus seven numbered owner directions.
* **Line references** to sea-rs are to `origin/main`; references to the other repos are to their current local heads. All were re-verified on 2026-11-05.

## Vocabulary

| Term | Meaning |
| --- | --- |
| **SEA-Forge** | The authority server (repo `sea-rs`). It decides whether a governed operation may run, and it records human approvals and settlement |
| **SFWP** | SEA-Forge's newline-delimited JSON protocol over a Unix socket. Each request names a `verb`, for example `authority_approval` |
| **CEP** | The authority-request and evidence envelope format SEA-Forge uses (`sea-forge-authority/src/cep.rs`) |
| **Cognate SDK** | The client library `@godspeedai/cognate-runtime-bun` and its sibling packages. Its `SeaForgeAuthority` class is the typed client; `approvalState` is its existing method that reads one escalation's state |
| **Front** | A product: Cognate Workbench or Horizon |
| **Protected gateway** | The SEA-Forge and Horizon systemd services on the owner's machine (`godspeed-sea-forge.service`, `godspeed-horizon.service`), installed by the **owner installer** `scripts/install-sea-forge-gateway.sh` per `Horizon/docs/gateway-runbook.md` |
| **RealityTrace / SXR** | The evidence-ledger CLI (`realitytrace`) that fronts use to record observed outcomes |
| **casework-go** | The Go casework app inside sea-rs (`apps/godspeed-casework-go`), which reads case-task approvals over SFWP |
| **Teeth** | An executable check that fails when an architectural rule is broken, plus a mutation script that breaks the rule on purpose to prove the check fails |
| **INV-2** | Horizon's mediation invariant from the architecture distillation (`../2026-11-04-egm-distillation/06-egm-design-boundary.md`, item 2): Horizon makes no raw SEA-Forge socket calls of its own; all authority I/O goes through the client Cognate exports |
| **T2** | The later identity-hardening transformation (see Non-Goals) |
| **SWE_SEED** | The native packaging and installer repo; `native-candidate.yml` is its packaging workflow |
| **Gauntlet** | The estate's verification harness |
| **Result** | The SDK's existing failure shape: `{ok: true, …} \| {ok: false, errorClass, error}`, as `submitEvidence` and `settle` return today |

## History referenced

| Ref | State | What it does |
| --- | --- | --- |
| sea-rs #74 | open | release-please's release PR for 0.4.0 |
| sea-rs #79 (`652ed710`) | merged | Binds an approval to the exact pending operation; refuses resolution if the content differs |
| sea-rs #81 | merged | Settles a failed resume's claim from the ledger |
| sea-rs #84 | open | Keeps the claim lease after an ambiguous declare failure; unrelated to T1; two open CodeRabbit Major comments |
| Horizon #5 (`aaa6164`) | merged | Among other things, makes the authority gate emit `deferred_to_invocation` when SEA-Forge is configured (`src/app.ts:984`) |
| Horizon #14 | merged | Cockpit settlement-claims work, from branch `horizon-cockpit-projection-review` |
| Horizon #15 | open | Gates external settlement declarations behind operator approval; touches the gateway code T1 changes, so T1 waits for it |
| Horizon `087fecc` | committed | Terminal accounting in one commit; reconciles stranded holds. Its restart behaviour must survive T1 |
| Horizon `18f0c40` | committed | Refuses self-approval when the operator identity is unknown (fails closed) |

## Problem Statement

### P1 · Duplicated, unhardened authority clients

Two product fronts ship their own private SEA-Forge socket client: Cognate Workbench and Horizon. Workbench is the first dogfood product, per owner direction. Both copies lack the hardening the SDK's `SeaForgeAuthority` already has: retry with backoff on `server_busy` answers that carry `no_side_effect`, and a response-size cap.

Horizon does not meet INV-2. Its app code makes raw socket calls in three places beyond its adapter:

* `src/app.ts:776` records an obligation window's closure (`authority_closure`).
* `src/app.ts:1011` lists approvals to count the decided ones as the `steering_attention` capacity paid (REQ-NAV-010). This is a different use from the approval inbox.
* `src/adapters/delegating-authority.ts:27` sends a governed decision on behalf of a signed-in operator (`authority_request` with `on_behalf_of`).

### P2 · Two approval concepts under one name

SEA-Forge exposes two different approval concepts under one name:

* The **escalation standing** (`ApprovalStanding`) records that an authority decision is waiting for, or has received, a human resolution.
* The **case-plan human task** (sfwp `PendingApproval`) is a person-action item created with a case plan, carrying its own `criteria_sha256`.

No contract or type separates them. Consumers tell them apart only by which verb returned the row.

## Overview

The owner adjudicated the remedy. Both fronts move onto one typed, hardened SDK client. The two concepts are renamed apart, the mediation boundary is enforced by executable checks, and duplicated code is deleted rather than wrapped. One release train delivers it:

1. sea-rs renames the two approval concepts apart in its schema contracts, moves the generated contracts to a home the server owns, and cuts 0.4.0.
2. The protected gateway deploys 0.4.0.
3. Cognate 0.9.0 adds the missing typed calls.
4. Workbench and Horizon adopt the typed client and delete their hand-rolled SEA-Forge clients.
5. Both fronts gain teeth that fail on SEA-Forge socket code outside the SDK. Horizon replaces its vendored Cognate tarballs with registry pins, keeping one exception (Goal 4).

Operators see no planned change. Two items in the concepts brief are dropped after the code check in Stage 9 (`review-v2/stage9_resolution.md`):

* **The REQ-NAV-006 preflight change.** It is already met: the gate emits `deferred_to_invocation` (`app.ts:984`, since #5), and the navigation tests cover it.
* **Workbench's RealityTrace swap.** It is not a deletion: the SDK port lacks the verifier run and containment launcher that Workbench uses. It is deferred (Non-Goals, E-4 (c)).

Two things change on the wire:

* The messages a front sends keep their current fields, request ids and timeouts. There is one exception: `approvalState` and Workbench's listing gain an `actor` field, but only when that client was explicitly given an actor (D1, actor table). Responses are now bounded in size (Goal 1). Busy answers are retried within the existing timeouts, so a call may take longer before it fails.
* sea-rs 0.4.0 changes one response: `system.get_schema` returns the new schema name and paths. Only in-repo code reads it.

## Goals

1. **One authority client.** `SeaForgeAuthority` is the only SFWP client code in either product front. Its hardened `exchange` carries every approval, closure and delegated-decide call. Responses are bounded. Single-record calls keep the SDK's 256 KB cap; `listApprovals` gets the internal constant `LIST_RESPONSE_LIMIT` of 8 MiB (D1). Server-side paging or a state filter is the long-term fix, a post-T1 sea-rs item.
2. **One wire vocabulary.** The two concepts are renamed apart, so each name means one thing:
   * The case task's contract is the generated `CaseTaskApproval.schema.json`.
   * The escalation standing's contract is the JSON emitted by `ApprovalStanding::to_json` (`cep.rs:711-741`; `to_json` at 727), as the owner's adjudication directed. Its single source of truth is the golden fixture `contracts/fixtures/approval-standing.json` (D2 step 2).

   Generated SFWP schemas move to a server-owned `contracts/` home. The owner approved the home move as an addition to T1. Its benefit is that sea-rs's `workbench/` renderer can later be deleted without losing the contracts.
3. **Enforced mediation boundary in both fronts.** Each front has a static check, with teeth, that fails on SFWP socket code in its `src/` outside the SDK (detection rule in D4, Teeth).
   * **Horizon** extends `scripts/check-boundaries.ts`.
   * **Workbench** adds the equivalent check to its test suite.
   * **No exceptions inside `src/`.** The owner's direction 3 allowed a dated exception list; review showed the last candidate, the delegated decide, can move onto the SDK (`review-v2/stage5_resolution.md` #1). `scripts/` and `test/` are allowlisted by directory, for fixtures and rigs.
4. **Subtraction.**
   * Both hand-rolled SFWP clients are deleted, and all three Horizon raw call sites are re-homed.
   * Approval-id and resolution validation moves into the SDK's `resolveApproval`.
   * Horizon's escalation-row validator `parseApproval` becomes the SDK's row parser, so each concept has one parser and each front stops carrying its own copy.
   * Horizon's vendored Cognate tarballs are replaced by exact registry `0.9.0` pins for every package that release-please publishes at one shared version. There is one exception: `@godspeed/identity` 0.1.0. It is unpublished, owned by T2, and declares `^0.8.0` ranges on `@godspeedai/cognate-events` and `@godspeedai/cognate-runtime-api` that 0.9.0 does not satisfy. T1 keeps it vendored and overrides those two dependencies to 0.9.0 (D4, De-vendor). That is acceptable only under three conditions:
     * a diff of both packages between their 0.8.0 and 0.9.0 tags shows only additive changes;
     * a clean install yields exactly one copy of each;
     * Horizon's identity tests are green.
5. **Live runbook evidence before the train and at the 0.4.0 tag.** The live roundtrip runbook (`Horizon/docs/gateway-runbook.md` and `.agents/reports/2026-11-03-settlement-live-roundtrip-runbook.md`) runs twice: at current heads before the train opens, and again at the 0.4.0 tag after the gateway is deployed. The second run proves the released server and clients perform approve, reject and resume correctly against the live gateway. Recovery is proven separately (acceptance table, Recovery row).

   **SWE_SEED packaging evidence.** The SWE_SEED `native-candidate.yml` workflow is triggered, and its run and SHA256SUMS are recorded. A failed run does not block the T1 release: it is recorded as FAILED, with its cause, and escalated to the owner as a SWE_SEED fix, because SWE_SEED is outside T1. It does block any claim that Workbench is installable.

## Non-Goals

* **Identity unification.** Belongs to T2, under the owner's pre-agreed bar (D-N2):
  * The SDK identity package must pass Horizon's live-gateway WebAuthn end-to-end scenario and pairing round-trip before any Horizon-local identity code is deleted.
  * Spec HORIZON-001 is amended 1.2.0→1.3.0 to bind REQ-SEC-006 to that package.

  Until then, `on_behalf_of` remains a configured reference that the server checks against its gateway rules. T1 moves where it is sent from, not what it means.
* **Workbench's RealityTrace wrapper.** `RealityTraceCli` (`cognate-workbench/src/settlement/realitytrace.ts`) stays. The SDK's `createSxrCliPort` is a different port: it enrolls a fresh `git init` repo, declares a fixed question, and records by ingest. Workbench needs existing-repo enrollment, its `workbench-task-proof` question, and a `verify run` under a containment launcher. Making the SDK port cover that is SDK feature work, not mediation. It is a post-T1 item (E-4 (c)).
* **An SFWP evaluate-only authority verb.** Post-v1. REQ-NAV-006 already defines the state shown instead (`deferred_to_invocation`), and Horizon emits it.
* **Client-side approval-content view-binding.** The escalation standing has no server-side criteria referent (`cep.rs:711-741`). sea-rs #79 (see History) already provides stale-approval protection on the server; T1 exercises it through the typed client and asserts it by test.
* **Renaming casework-go's Go identifiers** (`PendingApprovalView`, `frame.go:761-775`; the `PendingApprovals` port methods). casework-go reads JSON fields, whose bytes do not change, and never reads schema names. Renaming them has no wire effect, and the Go toolchain is not installed on this machine to verify it.
* **Moving Horizon's capacity and case write operations into Cognate.** Horizon's interim implementations stay. The concepts brief's atomicity analysis is unchanged by T1.
* **Changing the architecture of Gauntlet or SWE_SEED.** The SWE_SEED run in Goal 5 is evidence only.
* **Estate-wide test infrastructure.** T1 uses each repo's existing suites.
* **A Horizon-internal agent-session runtime.** Out of v1 per the concepts brief.
* **Changes to CEP hashing.** T1 sends envelopes byte-for-byte as today.
* **Install profiles.** Owned by no transformation yet; escalated to the owner as E-2 (Risks and Open Items).

## Technical Plan

### D1 · SDK: complete the mediation surface (cognate → 0.9.0)

All new code goes in `packages/runtime-bun/src/sea-forge-authority.ts` and `governance-env.ts`, over the existing `exchange` (busy-retry and size cap inherited).

**Types.**

* `SeaForgeActor = {actor_id: string; role: string}` is the shape already on the wire. Every `onBehalfOf` below is a `SeaForgeActor`; the fronts pass `{actor_id: <operator>, role: "operator"}`, as they do today.
* `ApprovalStanding` is the row type, with the 11 wire keys of `ApprovalStanding::to_json` under their wire names (snake_case). It is Horizon's existing `InboxApproval` (`src/domain/approval-inbox.ts:19-31`) moved into the SDK:

  | Field | Type | Parse rule |
  | --- | --- | --- |
  | `approval_id` | string | non-empty; matches `^[A-Za-z0-9_.:-]{1,200}$` |
  | `state` | `"pending" \| "approved" \| "rejected" \| "expired" \| "used"` | one of the five |
  | `requester`, `world_ref`, `operation_kind`, `operation_name`, `resource_id`, `subject_actor_ref`, `request_ref` | string | non-empty |
  | `expires_at` | string | non-empty; `Date.parse` succeeds |
  | `resolved_by` | `string \| null` | `null`, or a non-empty string |

  The parser is Horizon's `parseApproval` (`approval-inbox.ts:56-90`), moved with its tests. A row that fails any rule is omitted and counted in `excluded`. That includes a case-task row and a row with an unknown `state`.
* Every new method returns a **Result**. It never throws. The `errorClass` values:

  | `errorClass` | Meaning | Sent? |
  | --- | --- | --- |
  | `invalid_input` | client-side validation failed; `error` names the field | no |
  | `not_configured` | `resolveApproval` or `authorityClosure` called on a client without `requestIdPrefix` | no |
  | `unreachable` | connect failure, socket error or timeout | maybe |
  | `response_too_large` | the response exceeded the call's size limit | yes |
  | `malformed_response` | the response is not a JSON object, or an `ok:true` body lacks its fields | yes |
  | *server passthrough* | `ok:false` from SEA-Forge: its `error_class` (for example `request_id_reused` or an identity refusal) and `error`, unchanged | yes |

  To tell `response_too_large` apart, the `exchangeOnce` size check throws an internal error class instead of the generic `Error` it throws today. Existing methods keep their current behaviour.

**Constructor.**

* Gains an optional `requestIdPrefix?: string`. Only `resolveApproval` and `authorityClosure` use it, and they return `not_configured` without it. Existing callers, including `governanceFromEnv`, cognate's own tests and Workbench's `settlement/orchestrator.ts:67`, compile and behave unchanged. `governanceFromEnv` itself is not changed: each front builds the client that needs a prefix directly (D3, D4).
* **Actor.** The class keeps the actor exactly as given (`explicitActor`), next to the defaulted one it uses today.

  | Method | `actor` sent |
  | --- | --- |
  | `decide`, `requestWorldTransition`, `submitEvidence`, `settle` | defaulted actor, as today |
  | `listTransitions` | no `actor` field, as today (corrected during D1 implementation; v7.1 listed it above) |
  | `resolveApproval`, `authorityClosure` | defaulted actor (Workbench sends this value today; Horizon passes its service actor explicitly) |
  | `listApprovals`, and `approvalState` on top of it | explicit actor if one was given, else no `actor` field |

  The one wire change in this table: `approvalState`, and Workbench's listing when `COGNATE_SEA_FORGE_ACTOR` is set, now carry the same actor claim that the same client already sends on `decide` and resolve. The server does not filter `authority_approvals` (`lib.rs:917, 3003` on `origin/main`). Actor claims are validated per uid (`identity.rs`), so a claim the server accepts on `decide` from that process is also accepted on the listing.

**Methods.**

* **`listApprovals(options?: {timeoutMs?})`** sends `{verb: "authority_approvals"}` plus the actor per the table. It sends no request id, because the call is read-only. It returns `{ok: true, approvals: ApprovalStanding[], excluded: number}` or a failure Result.
  * The size limit is `LIST_RESPONSE_LIMIT = 8 * 1024 * 1024`, in the unit `exchangeOnce` already measures: UTF-16 code units of the decoded response. SFWP JSON is ASCII, so for it the unit equals bytes.
  * At about 0.5-0.7 KB per row, the limit holds over 10,000 rows; the 256 KB cap would fail at roughly 400. Over the limit, the call fails closed and never truncates.
  * `approvalState` is rebuilt on it. Any failure Result still maps to `"unknown"`, as today, so the SDK has one row parser.
* **`resolveApproval({approvalId, resolution, onBehalfOf, timeoutMs?})`** first validates its input and returns `invalid_input` before sending if that fails: `approvalId` must match `^[A-Za-z0-9_.:-]{1,200}$`, today's rule in both fronts, and `resolution` must be `approved` or `rejected`. It then sends `authority_approval` with:
  * request id `` `${requestIdPrefix}:${approvalId}:${resolution}` ``
  * `actor` per the table
  * `on_behalf_of` = `onBehalfOf`, which is required

  It returns `{ok: true, response}`, where `response` is the server's `ok:true` body, or a failure Result. An expired or already-used standing is refused by the server, and its class is passed through.
* **`authorityClosure({operationId, discriminationObservationId, verificationObservationIds, timeoutMs?})`** sends `authority_closure` with request id `` `${requestIdPrefix}:closure:${operationId}` ``. It returns `{ok: true, b, c, committed_at, on_time}` or a failure Result.
* **`decide(operation, worldRef, approval?, carry?, delegation?)`** gains an optional fifth parameter, `delegation: {onBehalfOf}`. `carry` is the existing optional work-carry argument and is unchanged. When `delegation` is present, `on_behalf_of` is added to the `authority_request`. The envelope, request id and decision interpretation are unchanged. The request id is the envelope's own operation id, which is what "envelope-coupled" means below.
* `timeoutMs` per call overrides the instance `timeoutMs` (default 5,000 ms). This lets each front keep its current per-call timeouts (D3, D4).

**Request-id rule.** Every id is deterministic per logical operation. The same operation always sends the same id across busy-retries, caller retries, process restarts and the upgrade itself. The server binds an id to its first payload hash. A replay of the same payload is deduplicated; a reused id with a different payload is refused as `request_id_reused` with no side effect (`lib.rs:2010-2165` on `origin/main`). The resolve and closure formats above are byte-identical to what Horizon (`sea-forge-approvals.ts:86`, `app.ts:776`) and Workbench (`governance.ts:139`) send today. Unchanged:

* `submitEvidence` keeps its content-derived id.
* `decide` keeps its envelope-coupled id.
* `settle` keeps its existing per-call id.

**Compatibility rules:**

* No new fields on existing verbs, apart from the optional `on_behalf_of`, which the server already parses for every verb, and the `actor` change in the table above.
* No new verbs on the wire: all three calls already exist server-side, including on v0.3.0.
* Export: the `ApprovalStanding` type, the Result types and `LIST_RESPONSE_LIMIT` are added to the existing `runtime-bun` index. No new package or entry point. Raw `exchange` is **not** exported.

**Release.** Version **0.9.0**, released by release-please with all linked-versions packages at one version. Tags are component-prefixed (`include-component-in-tag`), for example `cognate-runtime-bun-v0.9.0`. One PR, split only if review of the diff demands it.

### D2 · sea-rs: the 0.4.0 train

0. **Stage 0, before any T1 PR.**
   * Run the roundtrip runbook at current heads (Goal 5), and record the `authority_approvals` response size and row count.
   * Merge PR #84 independently, with its two CodeRabbit Majors fixed in-branch.
1. **Contracts home move (mechanical PR, rider).** `workbench/packages/contracts/schema/` moves (not copied) to top-level `contracts/schema/`, with its files byte-stable. Everything that names the old path is re-pointed in the same PR:
   * the output directory of `crates/sea-forge-server/src/bin/gen_sfwp_schema.rs`;
   * `system.get_schema` path generation (`sfwp/mod.rs:463`);
   * the TS generator `workbench/packages/contracts/scripts/generate.ts:23`, which reads `../schema`;
   * the `justfile` recipes `workbench-contracts-generate` and `workbench-contracts-gate`, and the drift test `tests/conformance_sfwp.rs:721-729`, which regenerate the schemas and fail if committed files differ;
   * doc mentions of the old path (`crates/AGENTS.md:37`, `crates/sea-forge-server/src/bin/README.md`).

   A test is added to `tests/conformance_sfwp.rs` asserting that every path `system.get_schema` returns exists in the repo.
2. **Rename-apart.**
   * sfwp `PendingApproval` becomes **`CaseTaskApproval`**. This covers:
     * the Rust type;
     * its `SCHEMA_TYPES` entry (`sfwp/mod.rs:380`);
     * the schema title and filename;
     * `$defs/PendingApproval` in `ApprovalListResult.schema.json`, by regeneration;
     * docs.

     `ApprovalStanding` is unchanged. The name-parity test `tests/conformance_sfwp.rs:789-803` passes once `SCHEMA_TYPES` and the generator agree.
   * sea-rs's `workbench/packages/contracts` TS types are regenerated. Their consumers `SystemContractPage.tsx` and `apps/desktop/src/pages/ApprovalInboxPage.tsx:4, 26` move to the new name in the same PR.
   * **Golden fixture.** `contracts/fixtures/approval-standing.json` is a JSON array of two `to_json` objects, written by `serde_json::to_string_pretty` with a trailing newline. One object is `pending` with `resolved_by: null`; the other is `approved` with `resolved_by` set. Together they populate every field.
     * It goes in `contracts/`, not the existing `crates/sea-forge-server/tests/fixtures/`, because it is a cross-repo wire contract rather than a server test input.
     * `crates/sea-forge-authority/tests/approval_standing_fixture.rs` builds the same two standings and compares `to_json` with the parsed fixture as `serde_json::Value`, so key order does not matter. It also asserts that each object has exactly the 11 keys.
     * Cognate keeps a copy at `packages/runtime-bun/test/fixtures/approval-standing.json`, with the source commit and sha256 recorded in the test as a copy record.
   * **Wire compatibility.** Approval payload JSON bytes are identical across 0.4.0, because the fields are named and there is no discriminator. For SFWP clients, the one visible change of 0.4.0 is the `system.get_schema` response: the schema name `PendingApproval` becomes `CaseTaskApproval`, and its paths move. Its only consumers are in-repo. The search over Horizon, Cognate, Workbench and SWE_SEED for `get_schema` and `PendingApproval` is recorded in `evidence/`.
3. **Approval-gate lineage resolution (required before step 4).** The local-only `settlement-approval-gate` branch holds 25 files and about 4,280 insertions, branched from main before #81 merged. Each of its commits gets one of three outcomes before the 0.4.0 contents are frozen, so the release neither drops unique work nor ships a duplicate:
   * **Landed elsewhere.** For example, the content of `dcaf3049` landed via #79.
   * **Unique content.** Candidate: `cfb16c18`, CLI approve and resume of settlement pendings. It lands as its own small PR before step 4 only if the Stage 0 roundtrip needs it. If the tag roundtrip needs it later, it ships in 0.4.1.
   * **Drop.**

   The branch is kept under its estate recovery ref whatever the outcome.
4. **Release.** Rebase or regenerate release PR #74, then cut **0.4.0** (tag `v0.4.0`, following `v0.3.0`). It contains no content foreign to T1, because #84 has already landed separately.
5. **Deploy 0.4.0 to the protected gateway.** The agent builds sea-rs at the tag and runs `just gateway-stage`. The agent gives the owner the exact `sudo` installer and restart commands, per the runbook. After the owner runs them, the agent verifies the result. This happens before any front adopts.

**Rollback.** Two independent layers; either can be rolled back without the other, because every pairing works:

* **Gateway layer.** Redeploy the previous binary, v0.3.0 (staged digest recorded at deploy), through the same owner installer. No source revert is needed. Fronts on Cognate 0.9.0 keep working, because v0.3.0 already serves `authority_approval`, `authority_approvals` and `authority_closure`, and every field the new client sends.
* **Front layer.** Revert the front's adoption PR, which restores the adapter and the previous Cognate pin. It keeps working against 0.4.0 because approval bytes are unchanged.

Published npm and crate versions cannot be withdrawn, so rollback means pinning to a previous version, never unpublishing.

### D3 · Workbench adoption (first product)

PRs are cut from `main` in a separate worktree. They commit only `src/`, `test/`, `package.json` and the lockfile. The working checkout's uncommitted screenshots and `dist-package/` build output are not part of T1 and are left untouched.

* `src/capabilities/governance.ts`:
  * `ExternalAuthority` (`governance.ts:21-30`) gains a `client: SeaForgeAuthority`. `externalAuthorityFromEnv` builds it the way `settlement/orchestrator.ts:67` builds its own: `new SeaForgeAuthority({socketPath, requestIdPrefix: "workbench", ...(envActor ? {actor: {actor_id: envActor, role: "service"}} : {})})`, where `envActor` is `COGNATE_SEA_FORGE_ACTOR` exactly as `governanceFromEnv` reads it. So the client's actor matches `a.service`, and its listing sends no actor unless that variable is set, as today. `governance.approvals.list` and `governance.approval.resolve` call `a.client`, passing `timeoutMs: a.timeoutMs` as today. The governed-operation authority from `governanceFromEnv` is unchanged.
  * `governance.approvals.list` returns the parsed rows in the field it returns today. Malformed rows are now omitted. `excluded` is not exposed, so the capability contract stays `1.0.0`. A failure Result throws `SEA-Forge refused the approval list: <errorClass>: <error>`, the message `governance.ts:126` throws today.
  * `governance.approval.resolve` sends `onBehalfOf: a.operator`. It maps `invalid_input` to the capability error that `validateResolve` raises today, carrying the SDK's `error` text. Every other failure Result maps to the error its resolve path raises today for a not-ok answer.
  * Delete `seaForgeCall` and the regex and resolution checks in `validateResolve`.
  * **Unchanged:** the capability names; the startup checks at lines 43-45 (the operator is named, matches the actor rule, and differs from the service); the line-132 guard that only a direct human operator may resolve; and the `options.pollApprovals` call after a successful resolve (line 144).
  * `src/capabilities/README.md` stops documenting `seaForgeCall` as an export.
* `seaForgeCall` moves unchanged to `test/support/sea-forge-raw.ts`. `test/J-SEA-FORGE-AUTHORITY.test.ts` and `test/J-SW01-SETTLEMENT.test.ts` import it from there for their raw adversarial cases: self-approval, raw `authority_settle` and `authority_evidence`.
* `src/settlement/orchestrator.ts:67` keeps its own `SeaForgeAuthority` for decide, evidence and settle. It needs no prefix.
* **Teeth.** `test/boundary-sfwp.test.ts` applies the detection rule from D4 to every `.ts` and `.tsx` file in `src/`, and expects no match. A second case runs the same detector on a planted raw call and expects a match. `bun test` runs both.
* Registry pins → exact Cognate `0.9.0`.

### D4 · Horizon adoption

This work branches from `main` after PR #15 is merged or closed, whichever comes first; the branch point is recorded. The state of #14 is re-verified at train time.

**Commit order.** Each commit must pass `bun run check && bun test && bun run boundaries`:

1. De-vendor (below). The adapter is untouched in this commit.
2. Move the config guards to `src/adapters/sea-forge-config.ts`.
3. Adopt the SDK client, re-home every call site and test, and delete the socket code.
4. Teeth.

**De-vendor (commit 1).**

* Deletes the cognate `0.7.0` and `0.8.0` tarballs from `.cognate/vendor/`, and pins every published package to exact `0.9.0`.
* Rewrites the `overrides` block (`package.json:35-63`). Today it maps every cognate package to a vendor tarball. Afterwards it holds only `@godspeedai/cognate-events` and `@godspeedai/cognate-runtime-api`, each set to `0.9.0`. Bun overrides are global by name; that is intended here, because they equal the direct pins.
* Keeps `godspeed-identity-0.1.0.tgz`, the file `package.json:16` references. It deletes `godspeed-identity-0.1.0-ed6c52a.tgz` only if neither `package.json` nor the lockfile references it.
* Adds `scripts/check-single-cognate.ts`, run by `bun run verify` after a clean install. It asserts exactly one installed copy of each `@godspeedai/cognate-*` package.

Before the commit, `git diff cognate-events-v0.8.0..cognate-events-v0.9.0 -- packages/events` and the same for `cognate-runtime-api` are recorded in `evidence/`, and must show additive changes only.

**Config move (commit 2).** These move unchanged, with their tests, to the socket-free `src/adapters/sea-forge-config.ts`:

* `approvalAuthorityFromEnv` and `approvalAuthority`: the `COGNATE_SEA_FORGE_OPERATOR` contract, the "refuse to guess" startup errors, the `ACTOR_ID` check, and the rule that the operator differs from the service;
* the `ApprovalAuthority` type, including `socketPath` and `timeoutMs`, which now configure the client;
* `seaForgeActorOf` with the constants it needs (`SEA_FORGE_ACTOR_ID`, `PRINCIPAL_PREFIX`), and `ENV_OPERATOR`;
* `SeaForgeActor`, which becomes a re-export of the SDK type.

`scripts/gateway-setup.ts:24` and `test/gateway-setup.test.ts:3` import from the new path. This is where the `18f0c40` fail-closed behaviour lives after T1.

**Adoption (commit 3).**

* **One gateway client.** At the position of `app.ts:307-308`, `createApplication` builds `seaForge = new SeaForgeAuthority({socketPath: delegationSocket, actor: serviceActor, requestIdPrefix: "horizon", timeoutMs: approvals?.timeoutMs})`, reusing those two existing values.
  * `delegationSocket` and `closureSocket` (`app.ts:386`) have the same precedence: `options.seaForgeSocket`, then the approvals socket, then `COGNATE_SEA_FORGE_SOCKET`. `serviceActor` is `approvals.service` when approvals are configured, else the `COGNATE_SEA_FORGE_ACTOR` fallback. So one instance serves both roles, and `closureSocket` becomes an alias of `delegationSocket`.
  * The client is built whenever governance is `sea-forge` with an authority, as delegation is wired today, independent of `approvals`. The approval and closure call sites keep their existing `approvals` guards (`app.ts:775`, `1002`), so they still run only when approvals are configured.
  * `options.delegationClient`, when given, replaces it for delegation only.
  * Timeouts: no `src/` path sets `ApprovalAuthority.timeoutMs`, so the instance timeout is the 5 s default, the same as today's resolve and delegated-decide sends. If a test sets it, the delegated decide uses it too.
  * The governance authority from `governanceFromEnv` is unchanged and still serves undelegated decisions.
* **Call sites** (`app.ts` imports at line 34):
  * resolve (`app.ts:536`) → `resolveApproval({…, onBehalfOf})`, at the instance timeout as today;
  * inbox list (`app.ts:1171`) → `listApprovals({timeoutMs: approvals.timeoutMs ?? 15_000})`, as `sea-forge-approvals.ts:102` does today; a failure Result becomes `{state: "unreachable", message: "<errorClass>: <error>"}`;
  * `app.ts:1011` → `listApprovals({timeoutMs: 15_000})`; a failure Result returns `null`, as today;
  * `app.ts:776` → `authorityClosure({…, timeoutMs: 30_000})`; a failure Result raises the error the closure path raises today.
* **Inbox.** `buildInbox`'s `rows: unknown` parameter (`approval-inbox.ts:100`) becomes `rows: readonly ApprovalStanding[]` plus `excluded: number`; its other parameters are unchanged. `InboxApproval` becomes an alias of the SDK `ApprovalStanding`, and `malformed` becomes `excluded`. `parseApproval` and its `APPROVAL_ID` regex are deleted from `approval-inbox.ts`; their test cases move to the SDK parity suite.
* **Delegation.** `delegatingAuthority(inner, {client, service, actors, serverPrincipalId})`.
  * `client` is the gateway client (or `options.delegationClient`), typed `Pick<SeaForgeAuthority, "decide">`. It replaces the `send` seam: `DelegationOptions.send`, `delegationSender` and `options.delegationSend` are deleted. `createApplication` gains `options.delegationClient` for tests.
  * The delegated path calls `client.decide(operation, worldRef, approval, undefined, {onBehalfOf: {actor_id, role: "operator"}})`. `carry` is `undefined`, because the `GovernanceAuthority` interface does not carry it today either.
  * `service` stays for the guard. The guards are unchanged: an unmapped operator is refused before any send, and the service identity is never sent as the human. Undelegated operations still go to `inner`.
* **Tests.** These move to the typed client:
  * `test/J02-live.test.ts`, `test/J02r2-live.test.ts`, `test/approval-inbox.test.ts`, `test/remote-sessions.test.ts`, `test/gateway-setup.test.ts` and `test/support/j02r2-rig.ts`.
  * `remote-sessions.test.ts` replaces `delegationSend: wire.send` with a `delegationClient` fake. The fake records each `decide` call's arguments and returns the scripted decision. The exact wire bytes of a delegated decide are asserted in the SDK parity suite instead.
  * Raw adversarial cases that the typed verbs cannot express (self-approval, raw `authority_settle`) use the deleted adapter's `seaForgeCall`, moved unchanged to `test/support/sea-forge-raw.ts`. No new socket client is written.
* Delete `src/adapters/sea-forge-approvals.ts`.

**Teeth (commit 4).**

* **Detection rule**, shared by both fronts. Any match in a `.ts` or `.tsx` file under `src/` fails the check:
  * `/\bBun\.connect\s*\(/` (socket construction);
  * `/\bunix\s*:/` (a Unix-socket address);
  * `/\bverb\s*:\s*["'](authority_|system\.)/` (a hand-written SFWP message).

  The rule is a regex, so comments match too; that errs toward failing. Markdown, `node_modules`, `scripts/` and `test/` are not scanned.
* At today's heads, the rule's matches in both fronts are exactly the code T1 deletes (Horizon: `sea-forge-approvals.ts`, `app.ts:776`, `app.ts:1011`, `delegating-authority.ts:48`; Workbench: `governance.ts`). No other `src/` file matches. Workbench's `node:net` import in `preview/sshForward.ts` is deliberately not a rule.
* `scripts/check-boundaries.ts` gains this scan beside its existing import-path checks.
* `scripts/teeth-inv2-mutation.ts` copies `src/` to a temp directory, plants a raw `Bun.connect({unix: …})` call, runs the scan on it, and exits non-zero unless the scan fails. It is named after the invariant so it cannot collide with the existing `teeth-tNN` task series. `bun run verify` runs it.

### D5 · Sequencing

Stage 0 (evidence + #84) → sea-rs PRs 1-3 → 0.4.0 → gateway deploy → Cognate 0.9.0 → Workbench adoption → Horizon adoption (+ teeth) → roundtrip re-run at the tag, plus the SWE_SEED run recorded (pass or fail).

Mixed-state windows:

* **Post-0.4.0, pre-adoption.** Safe: approval bytes are identical, and only the in-repo `get_schema` changed.
* **Post-Workbench, pre-Horizon.** Safe: request ids are unchanged per front.
* **New client against a pre-0.4.0 server.** Also safe. Every verb and field the new client sends already exists on 0.3.x. Sequencing also places the deploy before adoption.

## Verification & Acceptance

Every row can be executed by a reader with only this document and the named repos, using only repo-local suites. Acceptance means all named suites are green and the artifacts are in this folder's `evidence/`.

| Category | Requirement |
| --- | --- |
| Correctness | **SDK parity suite** (`packages/runtime-bun/test/sea-forge-authority.test.ts`, with a scripted-socket fixture extracted from the existing fakes in that file and `sea-forge-busy.test.ts`): (1) each new or extended call's exact wire message: verb, fields, `actor` per the actor table, `on_behalf_of`, request id; (2) each `errorClass` in the D1 table; (3) the parse rules and `excluded` counting, using Horizon's moved `parseApproval` cases; (4) `response_too_large` at `LIST_RESPONSE_LIMIT + 1` code units of ASCII JSON, versus success at the limit; (5) `listApprovals` parses the cognate copy of the golden fixture into two rows with `excluded: 0`. **Horizon:** `test/J02-live.test.ts` is green with the adapter deleted. It needs the owner-opt-in env `SEA_FORGE_SERVER_BIN`, and a recorded run is required: a skipped CI run does not count. **Workbench:** capability tests are green with the rewired implementation |
| Idempotency | For resolve and closure, the same logical operation sends the same id across: (a) busy-retries; (b) two separate client instances, simulating a restart; (c) the pre-migration call sites, by byte-comparison against the old formats. Against a real SEA-Forge (`SEA_FORGE_SERVER_BIN`), a replayed resolve is deduplicated, and the same id with the other resolution is refused `request_id_reused` |
| Negative states | Fixture matrix in the SDK parity suite: a case-task-shaped row (the `CaseTaskApproval` fields) returned by `authority_approvals` is counted in `excluded`; a malformed row and an unknown `state` are counted in `excluded`; a malformed `approvalId` or `resolution` returns `invalid_input` before any send; a missing prefix returns `not_configured` before any send; unreachable; server `ok:false` passthrough. Against a real server: resolving an expired standing and resolving a case-task approval id each return the server's refusal class |
| Adversarial | Run against a real SEA-Forge through the typed client. Each case asserts `errorClass`, not prose. The cases: self-approval refused (sea-rs: requester ≠ resolver); unknown-identity self-approval refused (Horizon `18f0c40` behaviour); stale approval refused (sea-rs #79 content binding); delegated decide for an unmapped operator refused before any send; `on_behalf_of` naming the service identity refused; `on_behalf_of` from a non-gateway uid refused by the server. In each front, the teeth mutation plants a raw call in `src/`, and the check must fail |
| Regression | sea-rs workspace, `tests/conformance_sfwp.rs` (name parity, drift, and the new `get_schema` path test) and `approval_standing_fixture.rs`; Cognate substrate + harness suites; Workbench tranche suites + smoke; Horizon full suite at its branch baseline, including its identity tests under the 0.9.0 override, with the navigation tests still asserting `deferred_to_invocation`. Each at its recorded green state. `scripts/check-single-cognate.ts` passes after a clean install. The cognate `events` and `runtime-api` 0.8.0→0.9.0 tag diffs are recorded and reviewed as additive-only |
| Integration | Roundtrip runbook executed twice: at heads (Stage 0), and at the 0.4.0 tag after deployment. Pass = a recorded approve, reject and resume, with the operator actor recorded by SEA-Forge. Prerequisites: build at the tag → `just gateway-stage` → owner installer → restart |
| Recovery | Cross-version matrix executed with real binaries, not only documented: each front's adoption commit is run against the v0.3.0 server (gateway-rollback cell); each front's pre-adoption commit is run against the 0.4.0 server (front-rollback and mixed-state cell). Adoption against 0.4.0 is covered by the Correctness and Integration rows. Each front's adoption revert is executed in a scratch clone and its suite is green. Restart-resume and terminal-accounting tests are green (commit `087fecc` behaviour preserved). The gateway redeploy of v0.3.0 is owner-run and recorded as LIVE only if the owner performs it |
| Performance | Not a goal; no new claims. The existing `exchange` hardening is asserted by the existing `sea-forge-busy.test.ts` |
| Release evidence | Tags `v0.4.0` (sea-rs) and `cognate-runtime-bun-v0.9.0` with its linked group, with SHA256SUMS or attestation per the existing packaging flows; CHANGELOGs; `evidence/` holds the runbook outputs, suite logs, tag digests, the Stage 0 measured `authority_approvals` response size and row count, and the `get_schema` consumer search. The SWE_SEED `native-candidate.yml` run and its SHA256SUMS are recorded; per Goal 5 a red run is recorded and escalated, and does not block the T1 release |

## Alternatives Considered

| Alternative | Why rejected |
| --- | --- |
| Export a raw `seaForgeCall` (or `exchange`) from the SDK | Keeps unhardened, arbitrary-verb copies alive; typed methods keep the hardening in one place |
| Overwrite `PendingApproval.schema.json` to match `ApprovalStanding` | Erases the live case-task concept that casework-go consumes |
| Client-side `expectedCriteriaSha256` view-binding | No server-side referent on the escalation path; #79 already binds content server-side |
| Per-call UUID request ids (proposed in design v2) | Loses server-side dedup on caller retry and after a restart; the existing deterministic ids already give one id per logical operation |
| Keep `delegating-authority.ts` as a dated INV-2 exception (proposed in design v2) | Its only difference from SDK `decide` is the `on_behalf_of` block, which the server already accepts on every verb; an exception would keep a third hand-rolled transport alive |
| Required `requestIdPrefix` constructor option (design v6) | Breaks `governanceFromEnv`, Workbench's orchestrator client and cognate's own tests, all of which need no prefix; optional plus `not_configured` fails closed only where the prefix matters |
| Throwing typed errors from the new methods | The SDK's existing evidence and settlement calls return a Result; a second error style would split every caller's handling |
| Camel-case row fields | Every consumer (Horizon's inbox, Workbench's 1.0.0 capability output) reads the wire names; mapping would add a translation layer and change a contract for no reader |
| Swap Workbench's RealityTrace wrapper onto `createSxrCliPort` in T1 | The SDK port lacks existing-repo enrollment, the declared question and the launcher-contained verifier run; it would be a redesign of the port, not a subtraction |
| Include identity in this release | Large-scope risk touching frozen spec 1.2.0; owner adjudicated D-N1: split |
| Land PR #84 inside the 0.4.0 train | Unrelated settlement work, still iterating; decoupled into its own reviewed merge |
| Feature flags per front | The client is additive; flags would keep the duplicated paths alive |
| Refresh the vendored tarballs | The vendor set mixes 0.7.0 and 0.8.0; registry pins are the subtraction |

## Risks and Open Items

- **R1 · Cognate group publish stall.** 0.9.0 releases about 45 linked packages, and one publish failure stalls Horizon's pin sweep. Mitigation: verify the `release.yml` run immediately after the tag; the pin sweep waits for the full group.
- **R2 · Workbench is product #1.** Its adoption is on the critical path. Slippage delays the dogfood claim, not the SDK release.
- **R3 · Rename consumer hygiene.** sea-rs's internal contracts and their two desktop pages are updated in the same PR. `system.get_schema` is the only wire-visible change, and the recorded search shows only in-repo consumers.
- **R4 · Delegated decide moves transport.** If the SDK put `on_behalf_of` on the wrong verb or dropped it, the server would treat the request as the service acting for itself. Covered by the exact-wire assertions in Correctness and by the real-server delegation cases in Adversarial.
- **R5 · Privileged steps.** The owner authorized the agent, on 2026-11-05, to run the live roundtrips and the gateway deploy. The agent runs every unprivileged step itself: build, `just gateway-stage`, the live socket calls, and evidence capture. Only the commands that require `sudo` (installer apply, `systemctl` restarts, privileged rollback) are handed to the owner, as exact commands with the current stage digest, at the moment they are needed. A result counts as LIVE VERIFIED only after those steps run.
- **R6 · Approval listing growth.** `authority_approvals` is unfiltered, and its rows accumulate. `LIST_RESPONSE_LIMIT` (Goal 1, D1) fails closed above the limit; the Stage 0 measurement records today's headroom.
- **R7 · Identity override.** Running `@godspeed/identity` 0.1.0 against 0.9.0 of `cognate-events` and `cognate-runtime-api` is outside its declared range. It is accepted only under the additive-diff, single-copy and identity-tests gates. T2 replaces it with a published identity package.
- **R8 · SWE_SEED first run.** `native-candidate.yml` has never completed: its two runs, on 2026-10-31, were cancelled. A failure is escalated to the owner as a SWE_SEED fix and does not block T1.
- **R9 · Actor on the listing.** `approvalState`, and Workbench's listing when it has an explicit actor, now send an actor claim (D1, actor table). If the server refused a claim on the listing that it accepts on `decide`, those reads would fail; `approvalState` would then answer `"unknown"` and fail closed. Covered by the real-server `listApprovals` runs in Correctness and Integration.
- **E-1 (owner) — RESOLVED 2026-11-05.** No named human reviewer. Each PR gets an independent fresh-context Sonnet review, CodeRabbit and CI; the owner reads the final release summary.
- **E-2 (owner).** Sequence install profiles (T3 candidate) against T2 identity.
- **E-3 (owner).** Authorization to implement. Granted 2026-11-05 by the owner's T1 implementation instruction, subject to the evidence gates. The owner's later redesign addendum (2026-11-05) authorizes justified scope corrections within T1, recorded in `LEDGER.md`.
- **E-4 (owner) — RATIFIED 2026-11-05** (owner: "yes to all"). The three review-driven changes to owner directions:
  - (a) Direction 1: the SWE_SEED green run is recorded and escalated rather than blocking the T1 release, though it still blocks any "Workbench installable" claim.
  - (b) Direction 3: zero `src/` exceptions instead of a dated exception list.
  - (c) Workbench's RealityTrace wrapper is not deleted in T1 (Non-Goals). The REQ-NAV-006 preflight item is dropped as already met.

  Until ratified, the agent proceeds on these positions and treats them as reversible: (a) changes only a release gate; (b) can be relaxed by adding an allowlist entry; (c) defers work without removing anything.
