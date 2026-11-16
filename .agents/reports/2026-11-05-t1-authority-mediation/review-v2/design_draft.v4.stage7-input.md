# T1 · Authority Mediation — Design (v4, under review)

* **Date:** 2026-11-05 · **Status:** v4 — under the sequential EGM review of the revised design (`review-v2/`). The v1 review is in `review/stage-reports.md` and `RESOLUTION.md`. Stage 5 and Stage 6 changes are in `review-v2/stage5_resolution.md` and `review-v2/stage6_resolution.md`.
* **Input:** concepts brief v4 + adjudication record (owner-resolved D-N1/D-N2/D-N3 + seven directions), in `../2026-11-04-egm-design-discovery/`.

### Vocabulary

| Term | Meaning |
| --- | --- |
| **SEA-Forge** | The authority server (repo `sea-rs`). It decides whether a governed operation may run, and it records human approvals and settlement |
| **SFWP** | SEA-Forge's newline-delimited JSON protocol over a Unix socket. Each request names a `verb`, for example `authority_approval` |
| **CEP** | The authority-request and evidence envelope format SEA-Forge uses (`sea-forge-authority/src/cep.rs`) |
| **Cognate SDK** | The client library `@godspeedai/cognate-runtime-bun`. Its `SeaForgeAuthority` class is the typed client, and `approvalState` is its existing method that reads one escalation's state. The SDK's packages are released together at one version by release-please's **linked-versions** plugin |
| **Front** | A product: Cognate Workbench or Horizon |
| **Protected gateway** | The SEA-Forge and Horizon systemd services on the owner's machine (`godspeed-sea-forge.service`, `godspeed-horizon.service`). The owner installs them with `sudo scripts/install-sea-forge-gateway.sh`, the **owner installer**, per `Horizon/docs/gateway-runbook.md`. Agents may not run its privileged steps |
| **RealityTrace / SXR** | The evidence-ledger CLI (`realitytrace`) that fronts observe outcomes with. The SDK wraps it as `createSxrCliPort` |
| **casework-go** | The Go casework app inside sea-rs (`apps/godspeed-casework-go`), which reads case-task approvals over SFWP |
| **Teeth** | An executable check that fails when an architectural rule is broken, plus a mutation script that breaks the rule on purpose to prove the check fails |
| **T2** | The later identity-hardening transformation. Its pre-agreed bar (D-N2): the SDK identity package must pass Horizon's live-gateway WebAuthn end-to-end scenario and pairing round-trip before any Horizon-local identity code is deleted, and spec HORIZON-001 is amended 1.2.0→1.3.0 to bind REQ-SEC-006 to it |

### History referenced

| Ref | What it is |
| --- | --- |
| sea-rs #79 (merged, `652ed710`) | Server binds an approval to the exact pending operation, and refuses resolution if the content differs |
| sea-rs #81 (merged) | "settle a failed resume's claim from the ledger" |
| sea-rs #84 (open) | "keep the claim lease after an ambiguous declare failure". Unrelated settlement fix with two open CodeRabbit Major comments |
| sea-rs #74 (open) | release-please's release PR for 0.4.0 |
| Horizon #14 (merged) | cockpit settlement-claims work. Horizon's current branch is its head branch |
| Horizon #15 (open) | gates external settlement declarations behind operator approval. It touches the same gateway code T1 changes, so T1 waits for it |
| Horizon `087fecc` | "terminal accounting in one commit; reconcile stranded holds". Its restart behaviour must survive T1 |
| Horizon `18f0c40` | refuses self-approval when the operator identity is unknown (fails closed) |

## The Problem

Two shipping product fronts each hand-roll a private SEA-Forge socket client: Cognate Workbench, the first dogfood product per owner direction, and Horizon. Both copies lack the hardening the SDK's `SeaForgeAuthority` already has: retry with backoff on `server_busy` answers that carry `no_side_effect`, and a 256 KB response cap. Horizon's invariant INV-2 says "all authority I/O goes through the Cognate-mediated client", but today it is aspirational. Horizon app code makes raw socket calls in three places beyond its adapter:

* `src/app.ts:776` — closure
* `src/app.ts:1011` — lists approvals to count the decided ones as the `steering_attention` capacity paid (REQ-NAV-010). This is not the inbox listing
* `src/adapters/delegating-authority.ts:27` — delegated decide

SEA-Forge exposes two different approval concepts under one name:

* The **escalation standing** (`ApprovalStanding`) records that an authority decision is waiting for, or has received, a human resolution.
* The **case-plan human task** (sfwp `PendingApproval`) is a person-action item created with a case plan, carrying its own `criteria_sha256`.

Consumers disentangle the two by folklore. Owner adjudication: one typed, hardened client; both fronts on it; the two concepts renamed apart; boundary enforcement; everything by subtraction.

## Overview

One release train makes the Cognate SDK the single owner of SEA-Forge mediation:

1. sea-rs renames the two approval concepts apart in its schema contracts, moves the generated contracts to a home the server owns, and cuts 0.4.0.
2. The protected gateway deploys 0.4.0.
3. Cognate 0.9.0 adds the missing typed calls.
4. Workbench and Horizon adopt the typed client and delete their hand-rolled clients.
5. Horizon drops its vendored Cognate packages and gains an executable check that fails on any SEA-Forge socket code outside the SDK.

For operators, exactly one change is visible. Horizon's preflight shows authority as "decided at invocation", as frozen spec REQ-NAV-006 requires. On the wire, every message a front sends keeps its current fields and request ids. Identity unification is out of scope: it belongs to T2 (see Vocabulary).

## Goals

1. **One authority client.** `SeaForgeAuthority` is the only SFWP client code in either product front. Its hardened `exchange` carries every approval, closure and delegated-decide call.
2. **One wire vocabulary.** The two concepts are renamed apart, so each name means one thing:
   * The case task's contract is the generated `CaseTaskApproval.schema.json`.
   * The escalation standing's contract is the `ApprovalStanding` struct as `authority_approvals` serializes it (`cep.rs:718`). It has no generated schema today and T1 does not add one. It is pinned by the SDK parity fixtures and the sea-rs conformance suite.

   Generated SFWP schemas live in a server-owned `contracts/` home, and that includes sea-rs's own workbench contract copies. The home move is an owner-adopted rider; its payoff is mostly the later retirement of sea-rs's `workbench/` renderer.
3. **Strict, enforceable mediation boundary.** A static check in Horizon fails on any SFWP socket code in `src/` outside the SDK. `scripts/` and `test/` are allowlisted by directory, for fixtures and rigs. The check is shown to have teeth by a mutation script, following the existing `teeth-tNN-mutation.ts` pattern. Zero exceptions: the delegated decide path moves onto the SDK.
4. **Subtraction.** Both hand-rolled clients are deleted, and all three Horizon raw call sites are re-homed. Approval-id and resolution validation moves into the SDK's `resolveApproval`, so each front stops carrying its own copy. The vendored tarballs are replaced by exact registry `0.9.0` pins, with one explicit exception: `@godspeed/identity` 0.1.0, which is not in Cognate's linked-versions group and belongs to T2.
5. **Evidence first and at the tag.** The live roundtrip runbook (`Horizon/docs/gateway-runbook.md`) runs twice. It runs at current heads before the train opens. It runs again at the 0.4.0 tag after the gateway is deployed, as the standing correctness, recovery and release artifact. The SWE_SEED `native-candidate.yml` workflow is triggered, and its green run and SHA256SUMS are recorded as dogfood packaging evidence.

## Non-Goals

* **Identity unification.** Belongs to T2. Pre-T2, `on_behalf_of` remains a configured reference that the server checks against its gateway rules. T1 moves where it is sent from, not what it means.
* **An SFWP evaluate-only authority verb.** Post-v1; REQ-NAV-006 already defines the honest state.
* **Client-side approval-content view-binding.** The escalation standing has no server-side criteria referent (`cep.rs:711-741`). Merged sea-rs #79 (`652ed710`) already binds an approval to the exact pending operation server-side and refuses content that differs. Stale-approval protection is therefore existing server behaviour, which T1 exercises through the typed client and asserts by test.
* **Capacity and case write-moves.**
* **Architecture of Gauntlet (the estate's verification harness) and SWE_SEED (the native packaging and installer repo).** The packaging-green rider in Goal 5 is evidence, not architecture.
* **Estate-wide test infrastructure.**
* **Horizon session runtime.**
* **CEP hashing.**
* **Install profiles.** Owned by no transformation yet; escalated as E-2.

## Technical Plan

### D1 · SDK: complete the mediation surface (cognate → 0.9.0)

`SeaForgeAuthority`, over the existing `exchange` (busy-retry and 256 KB cap inherited):

* **Types.** `SeaForgeActor = {actor_id: string; role: string}` is the shape already on the wire. Every `onBehalfOf` below is a `SeaForgeActor`; the fronts pass `{actor_id: <operator>, role: "operator"}`, as they do today.
* **Constructor.** It gains a required `requestIdPrefix` option: `"horizon"` or `"workbench"`. The existing `actor` option stays the identity claim sent on every verb, as today.
* **`listApprovals()`** returns typed escalation-standing rows, plus an `excluded` count of rows that failed to parse. It sends `authority_approvals`. The server applies no filter to this verb (`lib.rs:917, 3003`), so sending an identity never narrows the result. The identity sent is the constructor's `actor`: Horizon's client sends the service actor, as today, and Workbench's client is built without one, so it sends no actor, as today. The call is read-only and carries no request id. The existing `approvalState` method is rebuilt on `listApprovals`, so the SDK has one row parser.
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
* De-vendor per Goal 4, in one commit, with a clean-install CI check.
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
| Correctness | SDK parity suite: extend `packages/runtime-bun/test/sea-forge-authority.test.ts` with a scripted-socket fixture, extracted from the existing fakes in that file and `sea-forge-busy.test.ts`. It covers each new or extended call's exact wire message (verb, fields, `actor`, `on_behalf_of`, request id), error mapping, and `excluded` counting. Horizon `test/J02-live.test.ts` is green with the adapter deleted; it needs the owner-opt-in env `SEA_FORGE_SERVER_BIN`, and a recorded run is required, not silence from a CI skip. Workbench capability tests are green with the rewired implementation |
| Idempotency | For resolve and closure, the same logical operation sends the same id across: (a) busy-retries; (b) two separate client instances, simulating a restart; (c) the pre-migration call sites, by byte-comparison against the old formats. Against a real SEA-Forge (`SEA_FORGE_SERVER_BIN`), a replayed resolve is deduplicated, and the same id with the other resolution is refused `request_id_reused` |
| Negative states | Fixture matrix in the SDK parity suite: an expired standing is refused; a case-task-shaped row returned by `authority_approvals` is not typed as a standing and is counted in `excluded`; resolving a case-task approval id through `resolveApproval` gives a typed refusal (real server); a malformed row is omitted and counted in `excluded`; a malformed `approvalId` or `resolution` is refused before any send; unreachable; denied; no match |
| Adversarial | Run against a real SEA-Forge through the typed client. Each case asserts the typed error, not prose. The cases: self-approval refused (sea-rs: requester ≠ resolver); unknown-identity self-approval refused (Horizon `18f0c40` behaviour); stale approval refused (sea-rs #79 content binding); delegated decide for an unmapped operator refused before any send; `on_behalf_of` naming the service identity refused; `on_behalf_of` from a non-gateway uid refused by the server. The teeth mutation script reintroduces a raw call in `src/`, and the check must fail |
| Regression | sea-rs workspace + `tests/conformance_sfwp.rs` (including the re-pointed drift and `get_schema` tests); Cognate substrate + harness suites; Workbench tranche suites + smoke; Horizon full suite at its branch baseline. Each at its recorded green state |
| Integration | Roundtrip runbook executed twice: at heads (Stage 0), and at the 0.4.0 tag after deployment. Pass = a recorded approve, reject and resume, with the operator actor recorded by SEA-Forge. Prerequisites: build at the tag → `just gateway-stage` → owner installer → restart |
| Recovery | Cross-version matrix executed, not merely documented, with real binaries: each front's adoption commit is run against the v0.3.0 and the 0.4.0 server; each front's pre-adoption commit is run against the 0.4.0 server. Each front's adoption revert is executed in a scratch clone and its suite is green. Restart-resume and terminal-accounting tests are green (commit `087fecc` behaviour preserved). The gateway redeploy of v0.3.0 is owner-run and recorded as LIVE only if the owner performs it |
| Performance | Not a goal; no new claims. The existing `exchange` hardening is asserted by the existing `sea-forge-busy.test.ts` |
| Release evidence | Tags `sea-forge v0.4.0` and `cognate v0.9.0`, with SHA256SUMS or attestation per the existing packaging flows; CHANGELOGs; the SWE_SEED `native-candidate.yml` green run and its SHA256SUMS; `evidence/` holds the runbook outputs, suite logs and tag digests |

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
- **R3 · Rename consumer hygiene.** casework-go and sea-rs's internal contracts are updated in the same PR. `system.get_schema` is the only wire-visible change, and it has only in-repo consumers (verified by grep).
- **R4 · Delegated decide moves transport.** If the SDK put `on_behalf_of` on the wrong verb or dropped it, the server would treat the request as the service acting for itself. Covered by the exact-wire assertions in Correctness and by the real-server delegation cases in Adversarial.
- **E-1 (owner).** Name the code reviewer for #84 and the T1 PRs.
- **E-2 (owner).** Sequence install profiles (T3 candidate) against T2 identity.
- **E-3 (owner).** Authorization to implement. Granted 2026-11-05 by the operator's T1 implementation instruction, subject to the evidence gates.
