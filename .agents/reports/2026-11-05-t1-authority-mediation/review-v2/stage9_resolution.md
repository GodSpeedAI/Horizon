# Goldfish Annotated Review Report — Stage 9 (v6 → v7)

Status: **closed** — re-audit done; design v7.1 (sha256 `8b495c30…65ecd4`, snapshot `design_draft.v7.1.final.md`)
**Target:** `design_draft.md` v6, lines 120-279 (snapshot `design_draft.v6.stage9-input.md`)
**Findings:**
* `ir_readiness_raw.md` (IR, egm-implementation-readiness: FAIL)
* `ir_codebase_raw.md` (CD, egm-codebase-details: FAIL)
* `ir_style_raw.md` (ST, egm-style: pass with 3 Majors)

Duplicates are merged; the IDs are those of each reviewer's report. Every code fact behind a disposition was re-checked by the orchestrator on 2026-11-05. sea-rs facts were checked on `origin/main`.

The owner's redesign addendum (received mid-stage) was applied as follows: each Blocker is fixed by the smallest change that reuses an existing mechanism, and two v6 items that did not earn their cost are dropped.

| Finding | Sev | Disposition | Resolution in v7 |
| --- | --- | --- | --- |
| IR1, CD2 · `requestIdPrefix` required, but `governanceFromEnv` and other callers build without it | Blocker | PROPOSE FIX | The option becomes optional. Only `resolveApproval` and `authorityClosure` use it, and they return `not_configured` without it. `governanceFromEnv(env, {requestIdPrefix?})` passes it through. Existing callers are unchanged. Rejected alternative recorded |
| IR2, CD1 · actor rules contradict the SDK default | Blocker | PROPOSE FIX | Per-method actor table. The class keeps the explicit actor; `listApprovals` and `approvalState` send only that explicit actor, and other methods send the defaulted one as today. The one wire change is stated, and its server acceptance is argued from per-uid claim validation and tested (new R9) |
| IR3 · error model undefined | Blocker | PROPOSE FIX | The new methods return the SDK's existing Result shape. The `errorClass` table is enumerated, including server passthrough. `approvalState` maps any failure to `"unknown"` as today. Workbench and Horizon failure mappings are given per call site |
| IR4, CD3 · `createSxrCliPort` swap is a redesign | Blocker | PROPOSE FIX (descope) | Dropped from T1. It moves to Non-Goals with the reason, and to E-4 (c) for owner ratification. The wrapper is kept unchanged |
| CD4 · Workbench commit scope excludes `test/`, but tests import `seaForgeCall` | Blocker | PROPOSE FIX | `test/` is added to the commit scope. `seaForgeCall` moves to Workbench `test/support/sea-forge-raw.ts`, and both test files are named |
| IR5, CD5 · typed row unspecified; Horizon's `parseApproval` ignored | Major | PROPOSE FIX | The row type is the 11 wire keys in snake_case, which is Horizon's `InboxApproval` moved into the SDK. The parse-rule table and `excluded` definition are given. `parseApproval` moves with its tests. The Workbench contract stays 1.0.0 |
| IR6, CD7 · delegation rewiring incomplete | Major | PROPOSE FIX | `delegatingAuthority` takes `client: Pick<SeaForgeAuthority,"decide">`. The `send` seam is deleted and replaced by `options.delegationClient`. `carry` is `undefined`, as today. `service` stays for the guard. The test migration is named |
| IR7, CD6 · per-call timeouts and sockets | Major | PROPOSE FIX | Per-call `timeoutMs` is added. One Horizon approvals client is built on `closureSocket`, with its existing precedence. The 30 s, 15 s and instance timeouts are preserved per call site |
| IR8, ST1 · golden fixture format; broken sentence | Major | PROPOSE FIX | Array of two objects, pretty-printed with a trailing newline. Comparison is `serde_json::Value` equality plus an exact key set, so byte order does not matter. The test file and the cognate copy path are named. Sentence rewritten |
| CD8 · contracts move misses the TS generator and justfile; the 789-803 test is name parity | Major | PROPOSE FIX | All four re-point sites are named. The test is correctly described, and a new `get_schema` path-exists test is added. "Moved, not copied" is stated |
| CD9 · rename scope misses `ApprovalInboxPage.tsx`, `$defs`, `SCHEMA_TYPES`, casework-go | Major | PROPOSE FIX | All are listed. casework-go Go identifiers are moved to Non-Goals: no wire effect, and the Go toolchain is absent |
| IR9, CD10 · teeth detection rule undefined | Major | PROPOSE FIX | Three regexes are given, with the scanned scope. The orchestrator verified that at current heads the matches are exactly the code to delete, with no false positive (Workbench `sshForward.ts` `node:net` is deliberately excluded). Workbench test path and the Horizon `verify` hook are named |
| IR10 · Horizon commit order | Major | PROPOSE FIX | Four commits in order, de-vendor first; each must pass check + test + boundaries |
| CD11 · de-vendor details and tag names | Major | PROPOSE FIX | The `overrides` block rewrite and its global scope are stated, and the second identity tarball is resolved. Component-prefixed tag names are fixed throughout, and sea-rs `v0.4.0` is named |
| IR11 · lineage "or tag" contradiction | Major | PROPOSE FIX | Pre-freeze landing depends only on Stage 0. A tag-roundtrip need ships in 0.4.1 |
| IR12, CD12 · preflight has no file target | Major | PROPOSE FIX (drop) | The code check found REQ-NAV-006 already met: `app.ts:984` emits `deferred_to_invocation` (since #5), the navigation tests assert it, and no UI renders the raw gate value. Dropped from T1, with a regression assertion kept |
| CD13 · Horizon importers omitted | Major | PROPOSE FIX | `app.ts:34/536/1171/1254`, `gateway-setup` script and test, `ApprovalAuthority` fields, `ENV_OPERATOR` and `SeaForgeActor` are all homed |
| ST2 · "SWE_SEED green run" in D5 | Major | PROPOSE FIX | "the SWE_SEED run recorded (pass or fail)" |
| ST3 · "written by a stranger" | Major | PROPOSE FIX | "executed by a reader with only this document and the named repos" |
| IR13 · "expired standing refused" by whom | Nit | PROPOSE FIX | Server refusal, passed through |
| IR14 · `test/support/` filename; stems | Nit | PROPOSE FIX | `test/support/sea-forge-raw.ts`; full paths |
| IR15 · "after #15 is resolved" | Nit | PROPOSE FIX | "merged or closed, whichever comes first; branch point recorded" |
| IR16, CD16 · `maxListBytes` and the UTF-16 unit | Nit | PROPOSE FIX | Named constant `LIST_RESPONSE_LIMIT`, with the unit stated (UTF-16 code units; equal to bytes for ASCII JSON); the test uses ASCII. Internal error class for `response_too_large` |
| CD14 · sea-rs line numbers | Nit | CONTEST | The reviewer read a local branch 8 commits behind. On `origin/main`: `AuthorityApprovals` at `lib.rs:917`, handler at `3003`, `request_id` at `2010`, `request_id_reused` at `2124`. v6's numbers are correct; v7 states that sea-rs references are to `origin/main` |
| CD15 · `pollApprovals` after resolve | Nit | PROPOSE FIX | Listed under Unchanged |
| ST4-ST19 · wording nits | Nit | PROPOSE FIX | All applied: "rotting", "L-size", the "(v2)" labels, "v5 positions", "operator's"→"owner's", R and E order, `maxListBytes`, the filler words, "bases on", "dispositioned", the REQ-NAV clause (now moot), "builds sea-rs at the tag", "verified by grep"→recorded search, and the dense lines split |

Counts: 5 Blockers, all accepted (3 fixed in place, 1 descoped, 1 test-scope fix); 12 Majors, all accepted (1 dropped as already met); 22 Nits (21 accepted, 1 contested).

**Owner-facing changes:** E-4 gains (c): the RealityTrace swap is descoped and the preflight item is dropped. E-3 notes the redesign addendum.

**Re-audit:** one, permitted by the stage rule. It is limited to the two FAIL reviewers (implementation-readiness and codebase-details) on v7's Technical Plan, plus the changed parts of Overview, Goals, Non-Goals and Risks.

## Re-audit (v7) and close-out (v7.1)

Raw outputs (model sonnet): `ir_reaudit_readiness_raw.md` (PASS) and `ir_reaudit_codebase_raw.md` (FAIL, on one Major). Both confirm all 5 earlier Blockers and all earlier Majors are resolved. Both found the same new Major. Because the one permitted re-audit is used, the fixes below were applied in place and checked by the orchestrator against the code.

| Finding | Sev | Disposition | Fix in v7.1 |
| --- | --- | --- | --- |
| N1 (both) · the delegation client depended on `approvals` and was built after delegation is wired | Major | PROPOSE FIX | One gateway client is built at `app.ts:307-308` from the existing `delegationSocket` and `serviceActor`, independent of `approvals`. `closureSocket` has identical precedence, so one instance serves both. The approval and closure call sites keep their `approvals` guards (`app.ts:775, 1002`). `options.delegationClient` overrides delegation only. Timeouts: `ApprovalAuthority.timeoutMs` is never set in `src/`, so 5 s everywhere, as today |
| N2 (both) · Workbench cannot reach `listApprovals` via the `GovernanceAuthority` type | Nit | PROPOSE FIX (simplify) | `ExternalAuthority` gains its own `client`, built like `orchestrator.ts:67`, with the actor rule of `governanceFromEnv`. The `governanceFromEnv` options change is removed from D1, so there is less SDK surface |
| IR-N3 · Workbench list failure mapping | Nit | PROPOSE FIX | Throws today's `governance.ts:126` message with the `errorClass` |
| IR-N4 · `buildInbox` signature | Nit | PROPOSE FIX | `rows: readonly ApprovalStanding[]` plus `excluded: number` |
| CD-N3 · drift test and doc paths not named | Nit | PROPOSE FIX | `conformance_sfwp.rs:721-729`, `crates/AGENTS.md:37` and the bin README added |
| CD-N4 · constants for `seaForgeActorOf` | Nit | PROPOSE FIX | `SEA_FORGE_ACTOR_ID` and `PRINCIPAL_PREFIX` move with it |
| CD · `app.ts:1254` is a wrapper, not a call site | Nit | PROPOSE FIX | Removed |
| CD14 · sea-rs `origin/main` lines unverifiable by reviewers (no shell) | — | Verified by orchestrator | `git show origin/main:crates/sea-forge-server/src/lib.rs`: `AuthorityApprovals` at 917, handler at 3003, `fn request_id` at 2010, `request_id_reused` at 2124; `sfwp/mod.rs` 380 and 463; tag `v0.3.0` exists |

**Stage 9 verdict: PASS.** The sequential review of the revised design (Stages 5→9) is complete.
