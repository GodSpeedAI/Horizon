# T1 · Authority Mediation — Design (v5, under review)

* **Date:** 2026-11-05
* **Status:** v5, under the sequential EGM review of the revised design.
* **Review record:**
  * v1 review: `review/stage-reports.md` and `RESOLUTION.md`.
  * Review of the revised design: `review-v2/` — the Stage 5, 6 and 7 reports and their `stage*_resolution.md` files.
* **Input:** the concepts brief v4 and the owner's adjudication record, `../2026-11-04-egm-design-discovery/02-concepts-brief.md` and `04-adjudication-remaining.md`. The adjudication holds the owner decisions D-N1 (split identity into T2), D-N2 (T2's proof bar) and D-N3, plus seven numbered owner directions.

## Vocabulary

| Term | Meaning |
| --- | --- |
| **SEA-Forge** | The authority server (repo `sea-rs`). It decides whether a governed operation may run, and it records human approvals and settlement |
| **SFWP** | SEA-Forge's newline-delimited JSON protocol over a Unix socket. Each request names a `verb`, for example `authority_approval` |
| **CEP** | The authority-request and evidence envelope format SEA-Forge uses (`sea-forge-authority/src/cep.rs`) |
| **Cognate SDK** | The client library `@godspeedai/cognate-runtime-bun` and its sibling packages. Its `SeaForgeAuthority` class is the typed client; `approvalState` is its existing method that reads one escalation's state |
| **Front** | A product: Cognate Workbench or Horizon |
| **Protected gateway** | The SEA-Forge and Horizon systemd services on the owner's machine (`godspeed-sea-forge.service`, `godspeed-horizon.service`), installed by the **owner installer** `scripts/install-sea-forge-gateway.sh` per `Horizon/docs/gateway-runbook.md` |
| **RealityTrace / SXR** | The evidence-ledger CLI (`realitytrace`) that fronts use to record observed outcomes. The SDK wraps it as `createSxrCliPort` |
| **casework-go** | The Go casework app inside sea-rs (`apps/godspeed-casework-go`), which reads case-task approvals over SFWP |
| **Teeth** | An executable check that fails when an architectural rule is broken, plus a mutation script that breaks the rule on purpose to prove the check fails |
| **INV-2** | Horizon's mediation invariant from the architecture distillation (`../2026-11-04-egm-distillation/06-egm-design-boundary.md`, item 2): Horizon makes no raw SEA-Forge socket calls of its own; all authority I/O goes through the client Cognate exports |
| **T2** | The later identity-hardening transformation (see Non-Goals) |
| **SWE_SEED** | The native packaging and installer repo; `native-candidate.yml` is its packaging workflow |
| **Gauntlet** | The estate's verification harness |

## History referenced

| Ref | State | What it does |
| --- | --- | --- |
| sea-rs #74 | open | release-please's release PR for 0.4.0 |
| sea-rs #79 (`652ed710`) | merged | Binds an approval to the exact pending operation; refuses resolution if the content differs |
| sea-rs #81 | merged | Settles a failed resume's claim from the ledger |
| sea-rs #84 | open | Keeps the claim lease after an ambiguous declare failure; unrelated to T1; two open CodeRabbit Major comments |
| Horizon #14 | merged | Cockpit settlement-claims work, from branch `horizon-cockpit-projection-review` |
| Horizon #15 | open | Gates external settlement declarations behind operator approval; touches the gateway code T1 changes, so T1 waits for it |
| Horizon `087fecc` | committed | Terminal accounting in one commit; reconciles stranded holds. Its restart behaviour must survive T1 |
| Horizon `18f0c40` | committed | Refuses self-approval when the operator identity is unknown (fails closed) |

## Problem Statement

### P1 · Duplicated, unhardened authority clients

Two product fronts ship their own private SEA-Forge socket client: Cognate Workbench and Horizon. Workbench is the first dogfood product, per owner direction. Both copies lack the hardening the SDK's `SeaForgeAuthority` already has: retry with backoff on `server_busy` answers that carry `no_side_effect`, and a response-size cap.

Horizon does not meet INV-2. Its app code makes raw socket calls in three places beyond its adapter:

* `src/app.ts:776` — records an obligation window's closure (`authority_closure`).
* `src/app.ts:1011` — lists approvals to count the decided ones as the `steering_attention` capacity paid (REQ-NAV-010). This is a different use from the approval inbox.
* `src/adapters/delegating-authority.ts:27` — sends a governed decision on behalf of a signed-in operator (`authority_request` with `on_behalf_of`).

Workbench also hand-rolls a RealityTrace CLI wrapper that duplicates the SDK's `createSxrCliPort`.

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
4. Workbench and Horizon adopt the typed client, delete their hand-rolled SEA-Forge clients, and Workbench drops its RealityTrace wrapper.
5. Both fronts gain teeth that fail on SEA-Forge socket code outside the SDK. Horizon replaces its vendored Cognate tarballs with registry pins, keeping one exception (Goal 4).

For operators, the planned visible change is one: Horizon's preflight shows authority as "decided at invocation", as frozen spec REQ-NAV-006 requires.

Two things change on the wire:

* The messages a front sends keep their current fields and request ids. Responses are now bounded in size (Goal 1). Busy answers are retried within the existing timeouts, so a call may take longer before it fails.
* sea-rs 0.4.0 changes one response: `system.get_schema` returns the new schema name and paths. Only in-repo code reads it.

## Goals

1. **One authority client.** `SeaForgeAuthority` is the only SFWP client code in either product front. Its hardened `exchange` carries every approval, closure and delegated-decide call. Responses are bounded:
   * Single-record calls keep the SDK's 256 KB cap.
   * `listApprovals` returns an unfiltered list that grows with history, so it gets its own bound, `maxListBytes`, defaulting to 8 MiB. At about 0.5–0.7 KB per row that is over 10,000 rows, against a 256 KB cap that would fail at roughly 400 rows. A listing over the bound fails closed with a typed `response_too_large` error; it is never truncated silently. The listing's actual size is measured at Stage 0 and recorded.
   * Server-side paging or a state filter is the long-term fix. It is a post-T1 sea-rs item.
2. **One wire vocabulary.** The two concepts are renamed apart, so each name means one thing:
   * The case task's contract is the generated `CaseTaskApproval.schema.json`.
   * The escalation standing's contract is the JSON emitted by `ApprovalStanding::to_json` (`cep.rs:711-741`; `to_json` at 727), as the owner's adjudication directed. It has one source of truth: a golden fixture, `contracts/fixtures/approval-standing.json`. The sea-rs conformance suite fails if the server's output differs from it. The SDK parity suite parses a byte-identical copy and records its sha256. The release gate also requires `listApprovals` to run against a real 0.4.0 binary.

   Generated SFWP schemas live in a server-owned `contracts/` home, which includes sea-rs's own workbench contract copies. The owner approved the home move as an addition to T1. Its benefit is that sea-rs's `workbench/` renderer can later be deleted without losing the contracts.
3. **Enforced mediation boundary in both fronts.** Each front has a static check that fails on SFWP socket code in its `src/` outside the SDK. Each check has teeth.
   * **Horizon** extends `scripts/check-boundaries.ts`.
   * **Workbench** adds the equivalent check to its test suite.
   * **No exceptions inside `src/`.** The owner's direction 3 allowed a dated exception list; review showed the last candidate, the delegated decide, can move onto the SDK (`review-v2/stage5_resolution.md` #1). `scripts/` and `test/` are allowlisted by directory, for fixtures and rigs.
4. **Subtraction.** Both hand-rolled SFWP clients and Workbench's RealityTrace wrapper are deleted, and all three Horizon raw call sites are re-homed. Approval-id and resolution validation moves into the SDK's `resolveApproval`, so each front stops carrying its own copy. Horizon's vendored Cognate tarballs are replaced by exact registry `0.9.0` pins for every package that release-please publishes at one shared version. There is one exception: `@godspeed/identity` 0.1.0. It is unpublished, owned by T2, and declares `^0.8.0` ranges on `@godspeedai/cognate-events` and `@godspeedai/cognate-runtime-api` that 0.9.0 does not satisfy. T1 keeps it vendored and adds a package-manager override resolving those two dependencies to the pinned 0.9.0. That is acceptable only under three conditions:
   * a diff of both packages between 0.8.0 and 0.9.0 shows only additive changes;
   * a clean install yields exactly one copy of each;
   * Horizon's identity tests are green.
5. **Live runbook evidence before the train and at the 0.4.0 tag.** The live roundtrip runbook (`Horizon/docs/gateway-runbook.md` and `.agents/reports/2026-11-03-settlement-live-roundtrip-runbook.md`) runs twice: at current heads before the train opens, and again at the 0.4.0 tag after the gateway is deployed. The second run proves the released server and clients perform approve, reject and resume correctly against the live gateway. Recovery is proven separately (acceptance table, Recovery row).

   **SWE_SEED packaging evidence.** The SWE_SEED `native-candidate.yml` workflow is triggered, and its run and SHA256SUMS are recorded. A failed run does not block the T1 release: it is recorded as FAILED, with its cause, and escalated to the owner as a SWE_SEED fix, because SWE_SEED is outside T1. It does block any claim that Workbench is installable.

## Non-Goals

* **Identity unification.** Belongs to T2, under the owner's pre-agreed bar (D-N2):
  * The SDK identity package must pass Horizon's live-gateway WebAuthn end-to-end scenario and pairing round-trip before any Horizon-local identity code is deleted.
  * Spec HORIZON-001 is amended 1.2.0→1.3.0 to bind REQ-SEC-006 to that package.

  Until then, `on_behalf_of` remains a configured reference that the server checks against its gateway rules. T1 moves where it is sent from, not what it means.
* **An SFWP evaluate-only authority verb.** Post-v1. REQ-NAV-006 already defines the state to show instead ("decided at invocation").
* **Client-side approval-content view-binding.** The escalation standing has no server-side criteria referent (`cep.rs:711-741`). sea-rs #79 (see History) already provides stale-approval protection on the server; T1 exercises it through the typed client and asserts it by test.
* **Moving Horizon's capacity and case write operations into Cognate.** Horizon's interim implementations stay. The concepts brief's atomicity analysis is unchanged by T1.
* **Changing the architecture of Gauntlet or SWE_SEED.** The SWE_SEED run in Goal 5 is evidence only.
* **Estate-wide test infrastructure.** T1 uses each repo's existing suites.
* **A Horizon-internal agent-session runtime.** Out of v1 per the concepts brief.
* **Changes to CEP hashing.** T1 sends envelopes byte-for-byte as today.
* **Install profiles.** Owned by no transformation yet; escalated to the owner as E-2 (Risks and Open Items).

## Technical Plan

### D1 · SDK: complete the mediation surface (cognate → 0.9.0)

`SeaForgeAuthority`, over the existing `exchange` (busy-retry and 256 KB cap inherited):

* **Types.** `SeaForgeActor = {actor_id: string; role: string}` is the shape already on the wire. Every `onBehalfOf` below is a `SeaForgeActor`; the fronts pass `{actor_id: <operator>, role: "operator"}`, as they do today.
* **Constructor.** It gains a required `requestIdPrefix` option: `"horizon"` or `"workbench"`. The existing `actor` option stays the identity claim sent on every verb, as today.
* **`listApprovals()`** returns typed escalation-standing rows, an `excluded` count of rows that failed to parse, and the response `bytes`. It reads with the separate bound `maxListBytes` (constructor option, default 8 MiB) instead of `maxResponseBytes`. Over the bound it fails with typed `response_too_large`; it never truncates. It sends `authority_approvals`. The server applies no filter to this verb (`lib.rs:917, 3003`), so sending an identity never narrows the result. The identity sent is the constructor's `actor`: Horizon's client sends the service actor, as today, and Workbench's client is built without one, so it sends no actor, as today. The call is read-only and carries no request id. The existing `approvalState` method is rebuilt on `listApprovals`, so the SDK has one row parser.
* **`resolveApproval({approvalId, resolution, onBehalfOf})`** first validates its input and refuses before sending if it fails: `approvalId` must match `^[A-Za-z0-9_.:-]{1,200}$`, which is today's rule in both fronts, and `resolution` must be `approved` or `rejected`. It then sends `authority_approval` with:
  * request id `` `${requestIdPrefix}:${approvalId}:${resolution}` ``
  * `actor` = the constructor identity
  * `on_behalf_of` = `onBehalfOf`, which is required
* **`authorityClosure({operationId, discriminationObservationId, verificationObservationIds})`** sends `authority_closure` with request id `` `${requestIdPrefix}:closure:${operationId}` `` and returns `{b, c, committed_at, on_time}`. Refusals map to typed errors.
* **`decide(operation, worldRef, approval?, carry?, delegation?)`** gains an optional `delegation: {onBehalfOf}`. `carry` is the existing optional work-carry argument and is unchanged. When `delegation` is present, `on_behalf_of` is added to the `authority_request`. The envelope, request id and decision interpretation are unchanged. The request id is the envelope's own operation id, which is what "envelope-coupled" means below.

**Request-id rule.** Every id is deterministic per logical operation. The same operation always sends the same id, across busy-retries, caller retries, process restarts, and the upgrade itself. The server binds an id to its first payload hash: a replay of the same payload is deduplicated, and a reused id with a different payload is refused as `request_id_reused` with no side effect (`lib.rs:2010-2165`). The resolve and closure formats above are byte-identical to what Horizon (`sea-forge-approvals.ts:86`, `app.ts:776`) and Workbench (`governance.ts:139`) send today. Unchanged:

* `submitEvidence` keeps its content-derived id.
* `decide` keeps its envelope-coupled id.
* `settle` keeps its existing per-call id.

**Compatibility rules:**

* No new fields on existing verbs, apart from the optional `on_behalf_of` that the server already parses for every verb.
* No new verbs on the wire: all three calls already exist server-side.
* Export: the existing `SeaForgeAuthority` export of `runtime-bun` is extended in place. No new package or entry point. Raw `exchange` is **not** added to the public index.

**Release.** Version **0.9.0**, released by release-please with all linked-versions packages at the same version. One PR, split only if review of the diff demands it.

### D2 · sea-rs: the 0.4.0 train

0. **Stage 0, before any T1 PR.**
   * Run the roundtrip runbook at current heads (Goal 5).
   * Merge PR #84 independently, with its two CodeRabbit Majors fixed in-branch.
1. **Contracts home move (mechanical PR, rider).**
   * `gen_sfwp_schema.rs` output moves to top-level `sea-rs/contracts/schema/`.
   * The schema files move byte-stable. The drift check, which regenerates the schemas and fails if the committed files differ (`tests/conformance_sfwp.rs` and the `justfile` recipe), is re-pointed.
   * `system.get_schema` path generation (`sfwp/mod.rs:463`) and its conformance test (`tests/conformance_sfwp.rs:789-803`) are updated.
   * The sea-rs desktop page `SystemContractPage` is updated in the same PR.
2. **Rename-apart.**
   * sfwp `PendingApproval` becomes **`CaseTaskApproval`**: the Rust type, schema title and filename, and docs. `ApprovalStanding` is unchanged.
   * sea-rs's own `workbench/packages/contracts/*` is regenerated in the same PR.
   * The golden fixture `contracts/fixtures/approval-standing.json` is added, with every `ApprovalStanding::to_json` field populated, including one resolved and one unresolved row. A conformance test fails if the server's serialization differs from it byte-for-byte.
   * The casework-go adapters (`apps/godspeed-casework-go/internal/adapters/sfwp/`) are updated.
   * **Wire compatibility.** Approval payload JSON bytes are identical across 0.4.0, because the fields are named and there is no discriminator. For SFWP clients, the one visible change of 0.4.0 is the `system.get_schema` response: the schema name `PendingApproval` becomes `CaseTaskApproval`, and its paths move. Its only consumers are in-repo; no consumer in Horizon, Cognate, Workbench or SWE_SEED reads it.
3. **Approval-gate lineage disposition (required before step 4).** The local-only `settlement-approval-gate` branch holds 25 files and about 4,280 insertions, branched from main before #81 merged. It must be dispositioned before the 0.4.0 contents are frozen in step 4, so that the release neither silently drops unique work nor ships a duplicate. Map each of its commits to one of three outcomes:
   * **Landed elsewhere.** For example, the content of `dcaf3049` landed via #79.
   * **Unique content.** Candidate: `cfb16c18`, CLI approve/resume of settlement pendings. It lands as its own small PR only if the Stage 0 or tag roundtrip needs it.
   * **Drop.**
4. **Release.** Rebase or regenerate release PR #74, then cut **0.4.0**. It contains no content foreign to T1, because #84 has already landed separately.
5. **Deploy 0.4.0 to the protected gateway.** The agent builds and runs `just gateway-stage`. The agent gives the owner the exact `sudo` installer and restart commands, per the runbook. After the owner runs them, the agent verifies the result. This happens before any front adopts.

**Rollback.** Two independent layers; either can be rolled back without the other, because every pairing works:

* **Gateway layer.** Redeploy the previous binary, v0.3.0 (staged digest recorded at deploy), through the same owner installer. No source revert is needed. Fronts on Cognate 0.9.0 keep working, because v0.3.0 already serves `authority_approval`, `authority_approvals` and `authority_closure`, and every field the new client sends.
* **Front layer.** Revert the front's adoption PR, which restores the adapter and the previous Cognate pin. It keeps working against 0.4.0 because approval bytes are unchanged.

Published npm and crate versions cannot be withdrawn, so rollback means pinning to a previous version, never unpublishing.

### D3 · Workbench adoption (first product)

PRs are cut from `main` in a separate worktree. They commit only the files this section names: `src/`, `package.json` and the lockfile. The working checkout's uncommitted screenshots and `dist-package/` build output are not part of T1 and are left untouched.

* `src/capabilities/governance.ts`:
  * Delete `seaForgeCall`.
  * Re-implement `governance.approvals.list` and `governance.approval.resolve` over the SDK client, built with `requestIdPrefix: "workbench"`.
  * **Unchanged:** the capability names, the startup checks at lines 43-45 (the operator is named, matches the actor rule, and differs from the service), and the line-132 guard that only a direct human operator may resolve.
  * `validateResolve` keeps rejecting malformed input for its own error messages. The SDK repeats the same validation before sending.
  * `src/capabilities/README.md` stops documenting `seaForgeCall` as an export.
* Delete the hand-rolled `RealityTraceCli` (`src/settlement/realitytrace.ts`) and adopt the SDK's `createSxrCliPort`. The environment contract is identical.
* **Teeth.** Add a boundary test to the Workbench suite that fails on SFWP socket construction or raw exchange in `src/`, with a mutation case that plants a raw call and expects the test to fail.
* Registry pins → exact Cognate `0.9.0`.

### D4 · Horizon adoption

This work bases on `main` after PR #15 is resolved. The state of #14 is re-verified at train time.

* Delete the socket code in `src/adapters/sea-forge-approvals.ts`: `seaForgeCall` and the resolve and list functions.
* Move its configuration and identity guards, unchanged and with their tests, to a socket-free module `src/adapters/sea-forge-config.ts`:
  * `approvalAuthorityFromEnv` and `approvalAuthority`: the `COGNATE_SEA_FORGE_OPERATOR` contract, the "refuse to guess" startup errors, the `ACTOR_ID` check, and the rule that the operator differs from the service.
  * `seaForgeActorOf`, used by `scripts/gateway-setup.ts`.

  This is where the `18f0c40` fail-closed behaviour lives after T1.
* Re-home everything else that imported the adapter, in the same PR:
  * `src/adapters/delegating-authority.ts` calls SDK `decide(..., {onBehalfOf})`. Its guards stay unchanged in Horizon: an unmapped operator is refused, and the service identity is never sent as the human.
  * The test files `J02-live`, `J02r2-live`, `approval-inbox`, `remote-sessions`, `gateway-setup` and `test/support/j02r2-rig.ts` move to the typed client. Where an adversarial case must send a raw message the typed verbs cannot express (self-approval, raw `authority_settle`), it uses a socket helper under `test/support/`, which the allowlist covers.
* The approval inbox reads approval ids from the typed `approvalId` field of `listApprovals` rows. The adapter's `APPROVAL_ID` regex is deleted, because the SDK's `resolveApproval` performs the same check before sending. `ACTOR_ID` moves with the config guards.
* Re-home the other two raw call sites:
  * `app.ts:776` → `authorityClosure`.
  * `app.ts:1011` → `listApprovals`, sending the service actor as today.
* The SDK client is constructed with `requestIdPrefix: "horizon"`.
* De-vendor per Goal 4, in one commit. That commit:
  * deletes the cognate `0.7.0`/`0.8.0` tarballs from `.cognate/vendor/`;
  * pins every published package to exact `0.9.0`;
  * keeps `godspeed-identity-0.1.0.tgz`, plus an `overrides` entry resolving its `@godspeedai/cognate-events` and `@godspeedai/cognate-runtime-api` to `0.9.0`;
  * adds a clean-install CI check asserting exactly one installed copy of each `@godspeedai/cognate-*` package.

  Before the commit, `git diff v0.8.0..v0.9.0 -- packages/events packages/runtime-api` in cognate is recorded and must contain additive changes only.
* **Teeth.** Extend `scripts/check-boundaries.ts` to fail on SFWP socket construction or raw exchange in `src/`. Add `scripts/teeth-inv2-mutation.ts`, named after the invariant so it cannot collide with the existing `teeth-tNN` task series. It reintroduces a raw call and must make the check fail.
* **Preflight.** The authority gate renders **"authority: decided at invocation"** plus the applicable policy summary. This corrects a deviation from frozen REQ-NAV-006 (`horizon.agent.spec.yaml:725`); it is not a UI preference.

### D5 · Sequencing

Stage 0 (evidence + #84) → sea-rs PRs 1-4 → 0.4.0 → gateway deploy → Cognate 0.9.0 → Workbench adoption → Horizon adoption (+ teeth + preflight label) → roundtrip re-run at the tag, plus the SWE_SEED green run recorded.

Mixed-state windows:

* **Post-0.4.0, pre-adoption.** Safe: approval bytes are identical, and only the in-repo `get_schema` changed.
* **Post-Workbench, pre-Horizon.** Safe: request ids are unchanged per front.
* **New client against a pre-0.4.0 server.** Also safe. Every verb and field the new client sends already exists on 0.3.x, and ordering puts the deploy before adoption anyway.

## Verification & Acceptance

Every row can be written by a stranger, and only repo-local suites are used. Acceptance means all named suites are green and the artifacts are in this folder's `evidence/`.

| Category | Requirement |
| --- | --- |
| Correctness | SDK parity suite: extend `packages/runtime-bun/test/sea-forge-authority.test.ts` with a scripted-socket fixture, extracted from the existing fakes in that file and `sea-forge-busy.test.ts`. It covers each new or extended call's exact wire message (verb, fields, `actor`, `on_behalf_of`, request id), error mapping, `excluded` counting, and `response_too_large` above `maxListBytes` versus success just below it. `listApprovals` parses a byte-identical copy of the sea-rs golden fixture `contracts/fixtures/approval-standing.json`, and the copy's sha256 equals the sea-rs file's. Horizon `test/J02-live.test.ts` is green with the adapter deleted; it needs the owner-opt-in env `SEA_FORGE_SERVER_BIN`, and a recorded run is required, not silence from a CI skip. Workbench capability tests are green with the rewired implementation |
| Idempotency | For resolve and closure, the same logical operation sends the same id across: (a) busy-retries; (b) two separate client instances, simulating a restart; (c) the pre-migration call sites, by byte-comparison against the old formats. Against a real SEA-Forge (`SEA_FORGE_SERVER_BIN`), a replayed resolve is deduplicated, and the same id with the other resolution is refused `request_id_reused` |
| Negative states | Fixture matrix in the SDK parity suite: an expired standing is refused; a case-task-shaped row returned by `authority_approvals` is not typed as a standing and is counted in `excluded`; resolving a case-task approval id through `resolveApproval` gives a typed refusal (real server); a malformed row is omitted and counted in `excluded`; a malformed `approvalId` or `resolution` is refused before any send; unreachable; denied; no match |
| Adversarial | Run against a real SEA-Forge through the typed client. Each case asserts the typed error, not prose. The cases: self-approval refused (sea-rs: requester ≠ resolver); unknown-identity self-approval refused (Horizon `18f0c40` behaviour); stale approval refused (sea-rs #79 content binding); delegated decide for an unmapped operator refused before any send; `on_behalf_of` naming the service identity refused; `on_behalf_of` from a non-gateway uid refused by the server. In each front, the teeth mutation reintroduces a raw call in `src/`, and the check must fail |
| Regression | sea-rs workspace + `tests/conformance_sfwp.rs` (including the re-pointed drift and `get_schema` tests); Cognate substrate + harness suites; Workbench tranche suites + smoke; Horizon full suite at its branch baseline, including its identity tests under the 0.9.0 override. Each at its recorded green state. Horizon clean install shows exactly one copy of each `@godspeedai/cognate-*` package. The cognate `v0.8.0..v0.9.0` diff of `events` and `runtime-api` is recorded and reviewed as additive-only |
| Integration | Roundtrip runbook executed twice: at heads (Stage 0), and at the 0.4.0 tag after deployment. Pass = a recorded approve, reject and resume, with the operator actor recorded by SEA-Forge. Prerequisites: build at the tag → `just gateway-stage` → owner installer → restart |
| Recovery | Cross-version matrix executed, not merely documented, with real binaries: each front's adoption commit is run against the v0.3.0 and the 0.4.0 server; each front's pre-adoption commit is run against the 0.4.0 server. Each front's adoption revert is executed in a scratch clone and its suite is green. Restart-resume and terminal-accounting tests are green (commit `087fecc` behaviour preserved). The gateway redeploy of v0.3.0 is owner-run and recorded as LIVE only if the owner performs it |
| Performance | Not a goal; no new claims. The existing `exchange` hardening is asserted by the existing `sea-forge-busy.test.ts` |
| Release evidence | Tags `sea-forge v0.4.0` and `cognate v0.9.0`, with SHA256SUMS or attestation per the existing packaging flows; CHANGELOGs; `evidence/` holds the runbook outputs, suite logs, tag digests, and the Stage 0 measured `authority_approvals` response size and row count. The SWE_SEED `native-candidate.yml` run and its SHA256SUMS are recorded; per Goal 5 a red run is recorded and escalated, and does not block the T1 release |

## Alternatives Considered

| Alternative | Why rejected |
| --- | --- |
| Export a raw `seaForgeCall` (or `exchange`) from the SDK | Keeps unhardened, arbitrary-verb copies alive; typed methods keep the hardening in one place |
| Overwrite `PendingApproval.schema.json` to match `ApprovalStanding` | Erases the live case-task concept that casework-go consumes |
| Client-side `expectedCriteriaSha256` view-binding | No server-side referent on the escalation path; #79 already binds content server-side |
| Per-call UUID request ids (v2) | Loses server-side dedup on caller retry and after a restart; the existing deterministic ids already give one id per logical operation |
| Keep `delegating-authority.ts` as a dated INV-2 exception (v2) | Its only difference from SDK `decide` is the `on_behalf_of` block, which the server already accepts on every verb; an exception would keep a third hand-rolled transport alive |
| Include identity in this release | L-size risk touching frozen spec 1.2.0; owner adjudicated D-N1: split |
| Land PR #84 inside the 0.4.0 train | Unrelated settlement work, still iterating; decoupled into its own reviewed merge |
| Feature flags per front | The client is additive; flags would keep the duplicated paths alive |
| Refresh the vendored tarballs | The vendor set is already rotting (0.7.0 and 0.8.0 mixed); registry pins are the subtraction |

## Risks and Open Items

- **R1 · Cognate group publish stall.** 0.9.0 releases about 45 linked packages, and one publish failure stalls Horizon's pin sweep. Mitigation: verify the `release.yml` run immediately after the tag; the pin sweep waits for the full group.
- **R2 · Workbench is product #1.** Its adoption is on the critical path. Slippage delays the dogfood claim, not the SDK release.
- **R5 · Privileged steps.** The owner authorized the agent, on 2026-11-05, to run the live roundtrips and the gateway deploy. The agent runs every unprivileged step itself: build, `just gateway-stage`, the live socket calls, and evidence capture. Only the commands that technically require `sudo` (installer apply, `systemctl` restarts, privileged rollback) are handed to the owner, as exact commands with the current stage digest, at the moment they are needed. A result counts as LIVE VERIFIED only after those steps actually run.
- **R6 · Approval listing growth.** `authority_approvals` is unfiltered, and its rows accumulate. `maxListBytes` (8 MiB) bounds it, and it fails closed above the bound. Server-side paging or a state filter is the long-term fix, a post-T1 sea-rs item.
- **R7 · Identity override.** Running `@godspeed/identity` 0.1.0 against 0.9.0 of `cognate-events` and `cognate-runtime-api` is outside its declared range. It is accepted only under the additive-diff, single-copy and identity-tests gates. T2 replaces it with a published identity package.
- **R8 · SWE_SEED first run.** `native-candidate.yml` has never completed: its two runs, on 2026-10-31, were cancelled. A failure is escalated to the owner as a SWE_SEED fix and does not block T1.
- **R3 · Rename consumer hygiene.** casework-go and sea-rs's internal contracts are updated in the same PR. `system.get_schema` is the only wire-visible change, and it has only in-repo consumers (verified by grep).
- **R4 · Delegated decide moves transport.** If the SDK put `on_behalf_of` on the wrong verb or dropped it, the server would treat the request as the service acting for itself. Covered by the exact-wire assertions in Correctness and by the real-server delegation cases in Adversarial.
- **E-1 (owner).** Name the code reviewer for #84 and the T1 PRs.
- **E-2 (owner).** Sequence install profiles (T3 candidate) against T2 identity.
- **E-3 (owner).** Authorization to implement. Granted 2026-11-05 by the operator's T1 implementation instruction, subject to the evidence gates.
