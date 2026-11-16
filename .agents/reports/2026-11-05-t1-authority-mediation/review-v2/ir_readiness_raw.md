# Stage 9 — egm-implementation-readiness — verbatim reviewer output (v6, lines 120-279)

**EGM Stage 9: Implementation Readiness review of `/home/sprime01/projects/Horizon/.agents/reports/2026-11-05-t1-authority-mediation/design_draft.md`, lines 120-279**

I read the persona, the standard, the whole target, `04-adjudication-remaining.md` and the code the target references in cognate, Horizon, cognate-workbench and sea-rs. I did not reopen `02-concepts-brief.md` after the start of the session; none of the findings below depend on it. Every code claim was checked against the local checkouts. The sea-rs claims come from a local branch that is 8 commits behind origin/main.

---

**1. Blocker. Lines 127, 211 and D3 line 186. The plan never says where `requestIdPrefix` gets set.**
- D1 makes `requestIdPrefix` a required constructor option, and D3/D4 say each front "constructs" the client with `"workbench"` or `"horizon"`.
- Neither front constructs `SeaForgeAuthority`. Both get it from cognate's `governanceFromEnv`, which builds `new SeaForgeAuthority({socketPath, actor?})` with no prefix (`cognate/packages/runtime-bun/src/governance-env.ts:32`). Horizon calls it at `src/app.ts:300`, Workbench at `governance.ts:9`, and Horizon's tests at `J02-live.test.ts:102` and `j02r2-rig.ts:157`.
- With the option required, this call breaks the compile, and the plan doesn't change `governance-env.ts`.
- The plan must decide how the prefix reaches the client: a new env var, a new `governanceFromEnv` parameter, or a second client per front. It must also say what cognate's own call and tests pass.

**2. Blocker. Line 128, with lines 131 and 210. The actor rules contradict the SDK.**
- Line 128 says Workbench's client "is built without [an actor], so it sends no actor, as today." But the SDK constructor always fills in an actor, defaulting to `{actor_id:"cognate-service", role:"service"}` (`sea-forge-authority.ts:319`). An "unset" actor doesn't exist.
- Today Workbench's `resolve` sends `actor: a.service`, which is `COGNATE_SEA_FORGE_ACTOR` or `cognate-service` (`governance.ts:44,140`). Its `list` sends no actor (`:125`).
- Under line 131 (`actor` = the constructor identity), one Workbench client can't do both: either `list` starts sending an actor, or `resolve` sends the SDK default.
- `approvalState` sends no actor today (`:416`). Rebuilding it on `listApprovals` adds one, which contradicts "messages keep their current fields" (line 78).
- The plan must state, per method, whether `actor` is sent, and how "absent" is represented in the options (for example, keep `options.actor` raw).

**3. Blocker. Lines 128, 133, 188, 240 and 241. The error model is undefined.**
- The plan says "typed `response_too_large`", "Refusals map to typed errors" and "typed refusal", and line 241 says tests "assert the typed error, not prose".
- It never says whether the methods throw (and which error class, with what discriminant field) or return an `{ok:false, errorClass}` union, as `submitEvidence` and `settle` do today.
- It never lists the error kinds: unreachable, denied, no match, `request_id_reused`, validation refusal, `response_too_large`, server error class passthrough.
- It never says what `approvalState` does with a `listApprovals` failure; today any failure returns `"unknown"`.
- Workbench "maps the SDK's typed refusal to its existing error messages" (line 188), but there's no mapping table.
- This is the "error handling strategy" decision the standard forbids leaving to the implementer.

**4. Blocker. Line 190. Swapping `RealityTraceCli` for `createSxrCliPort` is a redesign, not a deletion.**
- `RealityTraceCli` (`cognate-workbench/src/settlement/realitytrace.ts:62`) offers `run`, `ledger(repoId)` and `ensureRepo(root)`. That last one enrolls an existing checkout and declares a proof question/threshold. Its settings are `{bin, dataHome, stateHome}`, which become the XDG env vars.
- `createSxrCliPort` (`cognate/packages/realitytrace/src/sxr-cli.ts:73`) is an `ObservationPort` with a different API: `prepare`, `record`, `readEvidence` and the rest. It runs `git init` in `options.repoDir`.
- So "the environment contract is identical" is unsupported. The plan names none of the call sites to rewrite, no method mapping, no fate for the proof-question/threshold declarations, and no package dependency to add. `createSxrCliPort` lives in the realitytrace package, not `runtime-bun`.

**5. Major. Lines 128 and 207. The typed row isn't specified.**
- "Typed escalation-standing rows" and a "typed `approvalId` field" imply a camelCase mapping, but the TS type is never given.
- The plan should state, for each of the 11 `ApprovalStanding::to_json` keys (`cep.rs:728-740`), the TS field name, its type, and whether it is required for "parses". It also doesn't say whether `state` values outside the five-state enum count toward `excluded`.
- Consumers depend on this:
  - Horizon `app.ts:1013` filters on raw `resolved_by`.
  - Horizon's `src/domain/approval-inbox.ts` validates raw rows, and the plan doesn't say whether it now takes typed rows or its validation is deleted.
  - Workbench's `governance.approvals.list` returns raw rows under capability contract `1.0.0` (`governance.ts:127`). Changing the output shape, and whether `excluded` is exposed, is a contract decision the plan leaves open.

**6. Major. Lines 134 and 205. The delegation rewiring is incomplete.**
- `delegatingAuthority(inner: GovernanceAuthority, {service, actors, serverPrincipalId, send})` wraps a `GovernanceAuthority` in a Proxy and sends through the injected `send` (`delegating-authority.ts:17-58`). The plan doesn't say:
  - how it reaches `SeaForgeAuthority.decide`'s new 5th parameter, given the interface `decide` takes 3 arguments (an `instanceof` check, a cast, or a changed interface type);
  - what happens when `inner` isn't a `SeaForgeAuthority`;
  - whether `DelegationOptions.send`, `delegationSender` and `options.delegationSend` (`app.ts:321`, used by `test/remote-sessions.test.ts:379`) are deleted;
  - whether the `service` option stays, given the actor now comes from the SDK constructor.
- It also doesn't say what Horizon passes for `carry`, which is required positionally before `delegation`.

**7. Major. Lines 133, 209 and 210. Per-call timeouts and sockets aren't specified.**
- Today the closure uses a 30 000 ms timeout, and the approvals list at `app.ts:1011` uses 15 000 ms. Both go to `closureSocket` (`options.seaForgeSocket`, defaulting to the approvals socket), which may differ from the governance socket.
- The SDK client has one `timeoutMs` (default 5 000) and one `socketPath`.
- The plan must say which client instance serves closure and list, its socket, and its timeout. Otherwise a 5 s default quietly replaces 30 s and 15 s, which conflicts with "within the existing timeouts" (line 78).

**8. Major. Lines 163 and 89. The golden fixture's format is undefined, and line 163 has a broken sentence ("It is with every … field populated").**
- The file must hold "one resolved and one unresolved row", so its top-level shape is undecided: an array, the `{ok, approvals}` response, or one object per row.
- Byte-for-byte comparison also needs the serialization pinned: compact or pretty, trailing newline, and key order. `serde_json` key order depends on the `preserve_order` feature.
- The plan doesn't name the conformance test file or function, or where the SDK copy lives in cognate.

**9. Major. Lines 191 and 219. The boundary-check rule isn't defined.**
- "SFWP socket construction or raw exchange" isn't a detection rule. The plan should give the patterns: for example `Bun.connect({unix:` or `net.connect`, `verb: "authority_` literals, `exchange(`/`exchangeOnce(` imports, and how `node_modules` and type-only imports are treated.
- Horizon's `scripts/check-boundaries.ts` currently checks package boundaries driven by `package.json`, so extending it to scan `src/` is new logic.
- Workbench's test file path and name aren't given, and neither front says which package script or CI step runs the teeth mutation.

**10. Major. Lines 212-218 against 198-211. Phasing in the Horizon PR.**
- The adoption code needs Cognate 0.9.0 installed, but the de-vendor commit that installs it is listed after the re-homing.
- The plan doesn't fix the commit order inside the PR, or say whether each commit must build and pass.
- The standard requires each phase to leave the tree buildable. The plan should state "de-vendor first, then adoption".

**11. Major. Lines 166-170. The lineage disposition contradicts itself.**
- Step 3 must finish before 0.4.0 contents are frozen.
- But `cfb16c18` "lands … only if the Stage 0 or tag roundtrip needs it". The tag roundtrip runs after the freeze, so that branch of the condition can't feed the decision.
- The plan should drop "or tag", or define a post-tag path (0.4.1).

**12. Major. Line 220. The preflight change has no file target.**
- The plan doesn't name the file or component that renders the authority gate, the current string being replaced, the source of "the applicable policy summary", or a test.

**13. Nit. Line 240. "An expired standing is refused" doesn't say by whom:** `listApprovals` filtering, `resolveApproval` client-side, or the server.

**14. Nit. Line 206.** The destination filename for `seaForgeCall` under `test/support/` isn't named, and the test files are listed by stem only (`J02-live`, `approval-inbox`, …) rather than by path.

**15. Nit. Line 196.** "After PR #15 is resolved" is ambiguous, since merged and closed lead to different bases.

**16. Nit. Line 128, R6 line 267.** R6 calls the bound `maxListBytes`, but D1 never names that constant or says whether it is configurable. Also, the existing `exchangeOnce` measures `buffered.length` in UTF-16 code units, not bytes, so "8 MiB" and "256 KB" aren't byte bounds as written. State which one the bound and its test use.

**Verdict:** FAIL. Four Blockers leave core design decisions to the implementer: how the client gets its prefix and actor, the error model, and the RealityTrace port replacement.
