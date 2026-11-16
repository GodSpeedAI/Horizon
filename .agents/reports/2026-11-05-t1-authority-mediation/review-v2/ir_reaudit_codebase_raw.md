# Stage 9 re-audit — egm-codebase-details (model sonnet) — verbatim (v7, lines 127-389)

Stage 9 re-audit, codebase-details lens, on design_draft.md v7 (lines 127-389). I checked the code with Read and Grep only. I had no shell, so I could not run `git show origin/main:` for sea-rs. Everything below on sea-rs comes from the local checkout, which is 8 commits behind. Claims that depend on origin/main line numbers are unverified (see section 2).

## 1. Prior findings (v6 report, ir_codebase_raw.md)

- **CD1, Workbench "built without an actor": RESOLVED.** The D1 actor table matches the constructor (`sea-forge-authority.ts:319`), and Workbench's `actor: a.service` (`governance.ts:140`) equals the SDK's defaulted actor, since `governanceFromEnv` passes `COGNATE_SEA_FORGE_ACTOR` through (`governance-env.ts:28,32`).
- **CD2, required `requestIdPrefix`: RESOLVED.** The option is now optional, with `not_configured` as the failure. Existing constructors at `governance-env.ts:32` and `orchestrator.ts:67` are unaffected.
- **CD3, `createSxrCliPort` swap: RESOLVED.** It is descoped to Non-Goals and E-4 (c). The description of the SDK port (fresh `git init`, fixed question, ingest) matches my v6 findings.
- **CD4, `seaForgeCall` importers in Workbench tests: RESOLVED.** `test/` is now in scope and `seaForgeCall` moves to `test/support/sea-forge-raw.ts`. A search found importers only in `J-SEA-FORGE-AUTHORITY.test.ts`, `J-SW01-SETTLEMENT.test.ts`, `governance.ts` and the README, and v7 names exactly those.
- **CD5, row parser: RESOLVED.** The D1 field table matches `InboxApproval` (`approval-inbox.ts:19-31`) and `parseApproval` (56-90). It also matches the 11 keys of `ApprovalStanding::to_json` (`cep.rs:727-741`).
- **CD6, timeouts and failure semantics: RESOLVED.** Per-call `timeoutMs` is added, the 30 s and 15 s values are kept (`app.ts:776,1011`; `sea-forge-approvals.ts:102`), and the Result shape is specified.
- **CD7, delegation re-home: PARTIALLY RESOLVED.** The `send` seam deletion, `carry` undefined and the test migration are all specified correctly. The wiring has a gap, reported as new finding N1.
- **CD8, contracts move: RESOLVED, with one Nit (N3).** `sfwp/mod.rs:380,463`, `gen_sfwp_schema.rs`, `generate.ts:23` and the justfile recipes (lines 501, 523) are now named, and the `conformance_sfwp.rs:789-803` description is accurate.
- **CD9, rename scope: RESOLVED.** `ApprovalInboxPage.tsx`, `$defs` and the `SCHEMA_TYPES` entry are named, and casework-go is moved to Non-Goals.
- **CD10, teeth rule: RESOLVED.** I ran the three regexes over `src/` in both fronts.
  - Horizon matches are `sea-forge-approvals.ts:83,102,126,127`, `app.ts:776,1011` and `delegating-authority.ts:48`. The only other hit is `EGM.md`, which is not `.ts`.
  - Workbench matches are `governance.ts:68,69,125,136` only.
  - This agrees with v7's claim of exactly the to-be-deleted code and no other `src/` file.
- **CD11, de-vendor and tags: RESOLVED.**
  - The overrides block is at `package.json:35-63`, and the identity tarball reference is at line 16.
  - Tags `cognate-events-v0.8.0`, `cognate-runtime-api-v0.8.0` and `cognate-runtime-bun-v0.8.0` exist in `cognate/.git/refs/tags`.
  - `release-please-config.json` has `include-component-in-tag` and `linked-versions`.
  - `packages/events` and `packages/runtime-api` exist.
- **CD12, preflight: RESOLVED.** It is dropped, and `app.ts:984` emits `deferred_to_invocation`.
- **CD13, Horizon importers: RESOLVED.**
  - The `sea-forge-approvals` importers in `src/`, `scripts/` and `test/` are `app.ts:34`, `delegating-authority.ts:13`, `scripts/gateway-setup.ts:24`, `test/approval-inbox.test.ts`, `test/J02-live.test.ts`, `test/J02r2-live.test.ts`, `test/gateway-setup.test.ts`, `test/remote-sessions.test.ts` and `test/support/j02r2-rig.ts`.
  - v7 covers all of them; the line references `app.ts:34` and `gateway-setup.ts:24` are correct.
  - `gateway-setup.test.ts:3` is also correct.
- **CD14, sea-rs line numbers (contested): UNVERIFIABLE by me.** I had no shell for `git show origin/main:`, and the local checkout still differs from the lines v7 cites. v7 now says sea-rs references are to `origin/main`. The caller should spot-check `lib.rs:917, 3003, 2010-2165` there.
- **CD15, `pollApprovals`: RESOLVED.** v7 lists it under Unchanged (`governance.ts:144` confirmed).
- **CD16, UTF-16 unit and internal error class: RESOLVED.** The measurement is `buffered.length` (`sea-forge-authority.ts:257`), and the throw is a generic `Error`, as v7 says.

## 2. Reference checks

- **Correct:**
  - `approval-inbox.ts:19-31` and `56-90`.
  - `delegating-authority.ts:27`, `sea-forge-approvals.ts:86`, `governance.ts:132`, `governance.ts:43-45`, `governance.ts:139`.
  - `app.ts` lines 34, 386, 536, 776, 984, 1011, 1171.
  - `orchestrator.ts:67`, `cep.rs:711-741` with `to_json` at 727, `sfwp/mod.rs:380,463`, `conformance_sfwp.rs:789-803`, `generate.ts:23`.
  - `18f0c40`, the 11 keys, the `ApprovalAuthority` fields `socketPath` and `timeoutMs`, and the `^[A-Za-z0-9_.:-]{1,200}$` rule.
  - The runtime-bun index does not export `exchange`, and `ApprovalStanding`, `SeaForgeActor`, `LIST_RESPONSE_LIMIT` and `requestIdPrefix` do not collide with any existing symbol in cognate.
- **Unverified (no shell):** `lib.rs:917, 3003, 2010-2165` on origin/main, and the `v0.4.0` and `v0.3.0` sea-rs tags.
- **Imprecise (Nit):** D4 lists `app.ts:1254` as a call site, but 1254 is a property wrapper (`resolveApproval: async (...) => resolveNavigationApproval(...)`). The only adapter call is at 536.

## 3. New findings

**N1. Major. D4, "One approvals client" and "Delegation" (`app.ts:303-323` against `386`).**
- v7 builds the SDK client from `closureSocket` at line 386 and says it "exists only when `approvals` is configured".
- It then makes that client the `client` of `delegatingAuthority`, but that is constructed at `app.ts:317`, about 70 lines earlier. The client is also not in scope there.
- Today delegation does not depend on `approvals`:
  - `delegationSocket` (line 308) falls back to `options.seaForgeSocket` or `COGNATE_SEA_FORGE_SOCKET`.
  - `serviceActor` (line 307) falls back to `COGNATE_SEA_FORGE_ACTOR` or `cognate-service`.
  - It is wired whenever `configured.mode === "sea-forge"` and `configured.authority` exists.
  - `approvals` is undefined whenever `COGNATE_SEA_FORGE_OPERATOR` is unset (`sea-forge-approvals.ts:54`).
- As written, a sea-forge deployment without the operator variable loses signed-in-operator delegation, or the implementer must invent a second client.
- Needed: state that a delegation client is built at the line 308 position, from `delegationSocket` and `serviceActor`, independent of `approvals`. Say whether it is the same instance as the approvals client when `approvals` exists. Say whether `options.delegationClient` overrides it.

**N2. Nit. D3, Workbench governance wiring.**
- v7 says `governance.approvals.list` and `governance.approval.resolve` "call that `SeaForgeAuthority`". `governanceFromEnv` returns `GovernanceOptions`, whose `authority` is typed `GovernanceAuthority` (`governed-operation.ts:120`), and that interface has neither `resolveApproval` nor `listApprovals`.
- `ExternalAuthority` (`governance.ts:21-30`) carries no client.
- Needed: a cast or narrowing, or build a `SeaForgeAuthority` in `externalAuthorityFromEnv` the way `orchestrator.ts:67` does. Reuse `orchestrator.ts:67` as the template.

**N3. Nit. D2 step 1, re-point list.**
- `tests/conformance_sfwp.rs:721-729` (the drift test) reads `workbench/packages/contracts/schema`. It is not in the enumerated re-point sites.
- The "everything that names the old path" catch-all covers it, and the Regression row mentions drift, but naming it avoids a red test.
- `AGENTS.md` and README doc mentions of the old path (`crates/AGENTS.md:37`, the `src/bin/README.md` lines) are similarly implied.

**N4. Nit. D4, Config move list.**
- It omits `SEA_FORGE_ACTOR_ID` and `PRINCIPAL_PREFIX` (`sea-forge-approvals.ts:17-18`), which `seaForgeActorOf` needs.
- `APPROVAL_ID` (line 15) is deleted with `resolveApproval`.

No new Blocker.

Verdict: FAIL. One new Major (N1, delegation client wiring and scope) remains. It is a small text fix to D4. Everything else from v6 is resolved, apart from the sea-rs origin/main line numbers I could not check.
