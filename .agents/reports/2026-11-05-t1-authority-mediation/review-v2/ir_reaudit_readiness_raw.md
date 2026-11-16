# Stage 9 re-audit — egm-implementation-readiness (model sonnet) — verbatim (v7, lines 127-389)

**Stage 9 re-audit of design_draft.md v7, lines 127-389: PASS**

All 5 prior Blockers are resolved. v7 introduces one new Major and three Nits, and no new Blocker.

One limit on the checks: I had no shell tool. The sea-rs `origin/main` line numbers (`lib.rs:917/3003/2010-2165`, `sfwp/mod.rs:380/463`, `cep.rs:711-741`, `conformance_sfwp.rs:789-803`, `gen_sfwp_schema.rs`) are NOT re-verified by me. I rely on the orchestrator's recorded check and my v6 audit. Every cognate, Horizon and Workbench claim I read directly.

**Prior findings**

| ID | Verdict | One-line evidence |
|---|---|---|
| IR1 (Blocker, prefix) | RESOLVED | `requestIdPrefix` is optional. `governanceFromEnv(env, {requestIdPrefix?})` is the stated route. Workbench passes `"workbench"` (D3). Horizon builds its own client (D4). `governance-env.ts:32` builds with no prefix, which stays valid. |
| IR2 (Blocker, actor) | RESOLVED | The per-method actor table (lines 166-170) matches the code. Today Workbench's resolve sends `a.service`, which equals the SDK default. `list` and `approvalState` send no actor, and the plan makes them send one only when an explicit actor exists. The single wire change is stated and covered by new R9. |
| IR3 (Blocker, errors) | RESOLVED | The Result type is defined (line 28). The `errorClass` table is at lines 149-156, and `approvalState` still maps any failure to `"unknown"`. Horizon failure mappings are given per call site (lines 299-302). The existing `submitEvidence`/`settle` style (`{ok:false, errorClass, error}`) is real. |
| IR4 (Blocker, RealityTrace) | RESOLVED | Descoped to Non-Goals and E-4(c). The wrapper is kept. |
| IR5 (Major, typed row) | RESOLVED | 11 snake_case keys and a parse table. These match `approval-inbox.ts:19-31` and `:56-90`. `buildInbox`, `excluded` and the Workbench `1.0.0` contract are addressed. |
| IR6 (Major, delegation) | RESOLVED, but see N1 | `client: Pick<…,"decide">` replaces `send`, `delegationSender` and `options.delegationSend`. `carry` is `undefined`. `service` stays. The test migration is named. |
| IR7 (Major, timeouts and sockets) | RESOLVED | Per-call `timeoutMs`. One client on `closureSocket`, with precedence matching `app.ts:386`. The 30 s, 15 s and 5 s defaults are all mapped. |
| IR8 (Major, fixture) | RESOLVED | Array of two objects, pretty-printed with a trailing newline, compared as `Value` equality plus a key-set check. Test file and cognate copy path are named. |
| IR9 (Major, teeth rule) | RESOLVED | Three regexes, scanned scope and the mutation script are given. I re-ran the patterns over Horizon `src/` and Workbench `src/`. Matches are exactly `sea-forge-approvals.ts:83/126/127`, `app.ts:776/1011`, `delegating-authority.ts:48` and Workbench `governance.ts:68/69/125/136`. The only other hit is `adapters/EGM.md`, a markdown file the rule does not scan. |
| IR10 (Major, commit order) | RESOLVED | De-vendor is commit 1, and each commit must pass check, test and boundaries. |
| IR11 (Major, lineage) | RESOLVED | Pre-freeze landing depends on Stage 0 only. A tag-roundtrip need ships in 0.4.1. |
| IR12 (Major, preflight) | RESOLVED (dropped) | `app.ts:984` emits `deferred_to_invocation`. `navigation-negative.test.ts:149` and `navigation-controller.test.ts:240` cover it. |
| IR13-IR16 (Nits) | RESOLVED | Server refusal is passed through. `test/support/sea-forge-raw.ts` is named, with full test paths. #15 reads "merged or closed, whichever comes first". `LIST_RESPONSE_LIMIT` is named with the UTF-16 unit stated. `exchangeOnce` at `:257` uses `buffered.length`, which matches. |

The CD-series gaps in my brief are covered by the same checks. Workbench `test/` is in the commit scope, and all of these exist as named:
- `J-SEA-FORGE-AUTHORITY.test.ts`
- `J-SW01-SETTLEMENT.test.ts`
- `orchestrator.ts:67`
- the Horizon test files
- `scripts/gateway-setup.ts`
- the `package.json` overrides at lines 35-63

**New findings in v7**

- **N1. Major. Lines 294-307, D4 Adoption.** The plan builds the Horizon approvals client "only when `approvals` is configured", and `delegatingAuthority` now requires `client`. Today delegation does not depend on `approvals`.
  - Without `COGNATE_SEA_FORGE_OPERATOR`, `approvalAuthorityFromEnv` returns undefined (`sea-forge-approvals.ts:54`). Delegation still works, because `app.ts:307-308` falls back to the env actor and `COGNATE_SEA_FORGE_SOCKET` and builds `delegationSender(delegationSocket)`.
  - The plan never says what `client` is when `approvals` is undefined and governance is `sea-forge`.
  - The options are to build a delegation client from the same fallback socket and actor (`serviceActor`, `delegationSocket`), or to refuse delegation. The implementer would have to choose, and a wrong choice silently disables delegated commits.
  - Fix: add one sentence. Suggested wording: "the delegation client is built from `delegationSocket` and `serviceActor` (the existing fallbacks) whenever `configured.authority` exists. The approvals-only client stays gated on `approvals`."
  - This has a narrow, mechanical fix. I do not rate it a Blocker.

- **N2. Nit. Line 252, D3.** `governanceFromEnv` returns `GovernanceOptions.authority?: GovernanceAuthority` (`governed-operation.ts:120`), not `SeaForgeAuthority`. The plan says `governance.approvals.*` "call that `SeaForgeAuthority`" but not how the type is narrowed. State an `instanceof` check and what happens if it fails.

- **N3. Nit. Line 253, D3.** The failure mapping for `governance.approvals.list` is not stated. Today it throws `SEA-Forge refused the approval list: …` (`governance.ts:126`). Only the resolve mapping is given.

- **N4. Nit. Line 303, D4.** `buildInbox` currently takes `rows: unknown` and computes `malformed` itself (`approval-inbox.ts:100-129`). "Takes the `listApprovals` result" does not give the new signature, namely rows plus `excluded`.

**Verdict: PASS.** Every prior Blocker is closed and no new Blocker exists. Please fix N1 in place before implementation, since it is the only item that could change behaviour silently.
