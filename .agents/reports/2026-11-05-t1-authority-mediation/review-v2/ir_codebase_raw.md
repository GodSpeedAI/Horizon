# Stage 9 — egm-codebase-details — verbatim reviewer output (v6, lines 120-279)

REVIEW — egm-codebase-details, Stage 9 (Implementation Readiness)
Target: design_draft.md, lines 120-279. I read the persona, the standard, the whole target, and the code it references in the Cognate SDK, Workbench, Horizon and sea-rs.

**Blocker**

1. **Lines 127, 128, 186 (Workbench "built without an actor").**
   - Line 128 says Workbench's client "is built without one, so it sends no actor, as today." That contradicts the code. The `SeaForgeAuthority` constructor always sets an actor: `this.actor = { ...(options.actor ?? { actor_id: "cognate-service", role: "service" }) }` (`cognate/packages/runtime-bun/src/sea-forge-authority.ts:319`).
   - Building the client without an actor would also break resolve. Workbench sends `actor: a.service` today (`cognate-workbench/src/capabilities/governance.ts:140`), and `a.service` honours a `COGNATE_SEA_FORGE_ACTOR` override (line 44). The SDK default would drop that override.
   - Reuse: Workbench already builds `new SeaForgeAuthority({ socketPath, actor: options.authority.service, … })` at `cognate-workbench/src/settlement/orchestrator.ts:67`. The plan ignores this and says nothing about whether that client also needs `requestIdPrefix`.

2. **Line 127 (required `requestIdPrefix`) against line 146 ("extended in place").**
   - Making the option required breaks every existing constructor call. That includes the SDK's own `governanceFromEnv` (`cognate/packages/runtime-bun/src/governance-env.ts:32`), which builds the authority that both Horizon (`app.ts:300`) and Workbench rely on. It also includes Workbench's `orchestrator.ts:67` and roughly 15 Cognate tests.
   - The plan says neither how `governanceFromEnv` gets a prefix nor what the default is. It also doesn't say which instance Horizon's `listApprovals`, closure and delegated decide calls run on: the env-built one or a new one.

3. **Line 190 ("adopt the SDK's `createSxrCliPort`. The environment contract is identical").** This is false, and the swap would lose function.
   - Environment: `RealityTraceCli` builds a minimal environment with `XDG_DATA_HOME`/`XDG_STATE_HOME` from `COGNATE_REALITYTRACE_DATA_HOME`/`STATE_HOME` (`cognate-workbench/src/settlement/realitytrace.ts:17-29, 67`). `createSxrCliPort` inherits `process.env` plus `options.env`, and takes `{bin, repoDir}` (`cognate/packages/realitytrace/src/sxr-cli.ts:8-15, 83`).
   - Behaviour: the Workbench class reuses an existing enrollment (`repo list`) and declares the `workbench-task-proof` question and threshold. It then runs the declared `command` verifier under a containment launcher (`--argv-json`, `--launcher-json`, `verify run`) and checks `verifier_id === "command"`.
   - The SDK port does none of that. It runs `git init` plus an empty commit in `repoDir`, enrolls fresh, declares a fixed `concept:runtime_execution` question, and records by ingest on stdin. It has no `verify run` and no launcher.
   - The plan also skips the importers of the deleted file. `realityTraceFromEnv` is imported by `src/server.ts:44, 426` and `test/settlement-config.test.ts`, and `RealityTraceCli` is used by `src/settlement/orchestrator.ts:18, 66`.

4. **Line 182 (Workbench commits "only `src/`, `package.json` and the lockfile") against line 185 (delete `seaForgeCall`).**
   - `test/J-SEA-FORGE-AUTHORITY.test.ts:16, 135` and `test/J-SW01-SETTLEMENT.test.ts:19, 76, 96, 99` import `seaForgeCall` from `src/capabilities/governance.ts`. They use it for the adversarial self-approval and raw `authority_settle`/`authority_evidence` cases.
   - With test edits out of scope, the Workbench suite cannot stay green. Horizon gets a `test/support/` relocation for the same problem (line 206); Workbench gets nothing.

**Major**

5. **Lines 128, 207 (row parser; reuse).**
   - Horizon already has a complete escalation-standing row validator, `parseApproval`, in `src/domain/approval-inbox.ts:56-90`. It has its own `APPROVAL_ID` regex at line 16, checks the ten required fields, and validates state, `expires_at` and `resolved_by`. Its rules match `ApprovalStanding::to_json` (`sea-rs/crates/sea-forge-authority/src/cep.rs:727-741`).
   - The plan neither reuses it as the spec for the SDK parser nor deletes or re-homes it (Goal 4 subtraction). It also doesn't define which rows count as `excluded`, e.g. how a "case-task-shaped row" is recognised (line 240).
   - Line 207 says the inbox reads "the typed `approvalId` field". `buildInbox` and `InboxApproval` use snake_case `approval_id` (lines 20, 76, 120). The TS row type and its field mapping are never given.

6. **Lines 128, 133, 205, 209-210 (timeouts and failure semantics).**
   - Today the closure call uses a 30 s timeout (`app.ts:776`) and both listings use 15 s (`app.ts:1011`, `sea-forge-approvals.ts:102`). The SDK has one `timeoutMs` per instance, default 5 s (`sea-forge-authority.ts:320`). The plan sets no per-call timeouts, so "within the existing timeouts" (line 78) cannot hold without a design choice.
   - `listApprovals` failure semantics for unreachable or not-ok answers are unspecified (throw or result?). Current callers differ:
     - `observedSteeringAttention` returns `null` (`app.ts:1012`);
     - `approvalInbox` turns a throw into `unreachable` (`app.ts:1174`);
     - `approvalState` swallows to `"unknown"` (`sea-forge-authority.ts:421`).
   - Rebuilding `approvalState` on `listApprovals` also changes its size bound from 256 KB to 8 MiB, and it will now send an actor; today it sends none (`sea-forge-authority.ts:416`). Neither change is stated.

7. **Lines 134, 205 (delegated decide re-home).**
   - `delegatingAuthority` wraps a `GovernanceAuthority`, whose `decide` takes 3 arguments (`governed-operation.ts:113`). It cannot call the 5-argument SDK `decide` without a concrete `SeaForgeAuthority` instance. The plan doesn't say where that instance comes from.
   - The plan also doesn't say what happens to the injectable `send` seam: `DelegationOptions.send`, `delegationSender`, and `options.delegationSend` (`app.ts:291, 321`). `test/remote-sessions.test.ts:111, 381` uses that seam as its scripted wire.
   - The current wrapper drops `carry`, and the plan doesn't say whether it is now forwarded.

8. **Lines 157-158 (contracts home move).**
   - `conformance_sfwp.rs:789-803` checks that the names in `SCHEMA_TYPES` match the generator's output. It is not a `get_schema` path test.
   - The rename requires editing `SCHEMA_TYPES` (`sfwp/mod.rs:380`, `"PendingApproval"`), which the plan omits.
   - The move also breaks the TS generator, which reads `../schema` (`workbench/packages/contracts/scripts/generate.ts:23`). It is unnamed, as are the justfile recipes `workbench-contracts-generate` (lines 501-505) and `workbench-contracts-gate` (523-546).
   - Line 91 ("includes sea-rs's own workbench contract copies") leaves open whether `workbench/packages/contracts/schema` is moved or kept as a copy.

9. **Lines 161-164 (rename scope).**
   - Line 159 names only `SystemContractPage`. `workbench/apps/desktop/src/pages/ApprovalInboxPage.tsx:4, 26` imports the `PendingApproval` type from `@sea-forge/contracts`, so it will fail to compile after regeneration.
   - `ApprovalListResult.schema.json` holds `$defs/PendingApproval`.
   - On the Go side, "casework-go adapters are updated" is not actionable. The only related symbols are casework-go's own `PendingApprovalView` (`internal/adapters/sfwp/frame.go:761-775`) and `PendingApprovals` port methods, and the plan doesn't say whether they are renamed.

10. **Lines 191, 219 (teeth detection rule).** "SFWP socket construction or raw exchange" has no defined pattern: `Bun.connect`, `unix:`, `"verb":` literals, NDJSON writes? Today `check-boundaries.ts` checks only import paths (lines 116-135). The implementer must invent the detector.

11. **Lines 212-218 (de-vendor).**
    - Horizon's `package.json` already has a global `overrides` block, lines 35-63, mapping every cognate package to vendor tarballs. The plan says "adds an `overrides` entry" and doesn't say that this block must be rewritten.
    - Bun overrides are keyed by package name, so they are global, not scoped to identity.
    - `.cognate/vendor/godspeed-identity-0.1.0-ed6c52a.tgz` is not dispositioned.
    - Tags: Cognate's release-please uses `include-component-in-tag: true` (`cognate/release-please-config.json:6`), so tags are component-prefixed (e.g. `cognate-v0.8.0`). The `git diff v0.8.0..v0.9.0` on line 218 (repeated on 242) and the tag `cognate v0.9.0` on line 246 are probably wrong ref names.

12. **Line 220 (preflight).** No file or function is named. The gate already emits `authority_outcome: "deferred_to_invocation"` (`src/app.ts:984`), so the "deviation" is presumably in a renderer the plan doesn't locate. "The applicable policy summary" has no data source.

13. **Lines 198-211 (Horizon importers).** The re-home list omits these:
    - `app.ts:34` imports, and the call sites `app.ts:536`, `1171`, `1254`;
    - `scripts/gateway-setup.ts:24` and `test/gateway-setup.test.ts:3`, whose import paths must change to `sea-forge-config.ts`;
    - the fate of `ApprovalAuthority.socketPath`/`timeoutMs` once the socket code leaves.

**Nit**

14. **Lines 128, 136 (sea-rs line references).** In the local checkout:
    - the `AuthorityApprovals` variant is at `lib.rs:904`, not 917;
    - its handler is at `lib.rs:2825`, not 3003;
    - the dedupe/`request_id_reused` path is about `lib.rs:1928-1948`, not 2010-2165.

    The local branch is 8 commits behind origin/main, so these may match origin. They need re-verifying there. The claims themselves hold: `cep_authority::list` takes no actor filter, and a reused id is refused with `no_side_effect: true`.

15. **Line 129 (validation).** The `approvalId` regex and the resolution check do match both fronts (`governance.ts:95-96`, `sea-forge-approvals.ts:15, 78-79`). The Workbench resolve also calls `options.pollApprovals` after success (`governance.ts:144`), and the plan's "Unchanged" list (line 187) doesn't mention it.

16. **Line 238 (size bound).** `exchangeOnce` compares the cap against `buffered.length`, which counts UTF-16 code units, not bytes (`sea-forge-authority.ts:257`). It throws a generic `Error("response exceeds size limit")`. The "8 MiB above/below" test and the typed `response_too_large` error need a stated measurement unit and a mapping.

**Verified correct:**
- `sea-forge-approvals.ts:86`, `app.ts:776`, `app.ts:1011`, `delegating-authority.ts:27`, `governance.ts:139`, `governance.ts:43-45`, `governance.ts:132`.
- `cep.rs:711-741` and `to_json` at 727; `sfwp/mod.rs:463`; `horizon.agent.spec.yaml:725`.
- `submitEvidence`, `decide` and `settle` id schemes; runtime-bun exports only `"."`, and `exchange` is not in the index.
- The test files `sea-forge-authority.test.ts` and `sea-forge-busy.test.ts` exist; `SystemContractPage.tsx` exists.
- The Horizon test-file list on line 206 matches the actual importers.

Verdict: FAIL. Four Blockers: the line 128 statement contradicts the SDK constructor; the required `requestIdPrefix` breaks `governanceFromEnv`; the `createSxrCliPort` swap is not equivalent; and the D3 commit scope breaks the Workbench tests. Nine Majors leave design choices to the implementer.
