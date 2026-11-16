# Stage 5 — Initial Zoom Out (v2) — verbatim reviewer output

Reviewer: `egm:egm-zoom-out` (fresh context, model inherit), 2026-11-05. Target: `design_draft.md` v2 (sha256 `bbcc077f…64c4`), full file. Standard: `zoom-out-standard.md`. GoldfishContext: `02-concepts-brief.md`, `04-adjudication-remaining.md`, referenced files, repo paths.

---

**Zoom Out Review (Stage 5): `/home/sprime01/projects/Horizon/.agents/reports/2026-11-05-t1-authority-mediation/design_draft.md`**

I read the persona, the zoom-out standard, the target, both GoldfishContext files and the referenced code. Horizon was checked on branch `horizon-cockpit-projection-review`. For sea-rs, cognate and cognate-workbench I read the local working trees and did not check which branch each was on.

Context is sufficient. The objective and the reason for it are clear, and the root problem (several duplicated, unhardened SFWP clients and one approval name covering two concepts) is the right target. Most of the scope cuts are sound: no raw-call export, no client-side criteria field, no feature flags. The findings below are where the plan is internally inconsistent, where it does not match the code, or where it adds machinery it doesn't need.

---

**1. Severity: Blocker**
**Affected Scope:** D4 bullet 1 ("Delete `src/adapters/sea-forge-approvals.ts` … five importing test files"), Goal 3 / Goal 4, D4 "`delegating-authority.ts` = the single named exception"
**Simplicity Rationale:** Deleting the adapter leaves the retained exception with no socket code. `src/adapters/delegating-authority.ts:13,27` imports `seaForgeCall` from the file D4 deletes. The design never says what that file sends through afterwards. That leaves two outcomes: a third hand-rolled, unhardened client survives (contradicting Goals 1 and 4, "both hand-rolled clients deleted"), or the PR does not compile.

The importer list is also incomplete:
- `test/support/j02r2-rig.ts:13` makes a raw `authority_settle` call.
- `scripts/gateway-setup.ts:24` imports `seaForgeActorOf`, alongside `test/gateway-setup.test.ts`.
- `J02-live` and `J02r2-live` need raw calls (self-approval, unscoped `authority_approvals`) that the typed verbs don't cover.

The simpler fix removes the exception instead of documenting it. `delegating-authority.ts` only sends `authority_request` with `on_behalf_of`, a wire field the server already accepts: both fronts' resolve calls send it today. One per-call or constructor-level `onBehalfOf` on the SDK's existing `decide` closes INV-2 completely and makes `docs/inv2-exceptions.md` unnecessary. The "needs its decide path until T2's capability" rationale isn't supported by anything in that file. The design should also name the hardened transport that test/script raw calls use. The SDK already has `exchange`, exported from `sea-forge-authority.ts:220` but not from `index.ts`, and that is acceptable for the `test/`/`scripts/` allowlist.

**2. Severity: Major**
**Affected Scope:** D1 "Request ids" bullet; D5 "id scheme divergence"
**Simplicity Rationale:** The new `<caller>:<op>:<uuid>` scheme adds machinery and loses idempotency the code has today. The existing ids are already deterministic, one per logical operation:
- Horizon resolve: `horizon:${approvalId}:${resolution}` (`sea-forge-approvals.ts:86`)
- Horizon closure: `horizon:closure:${operationId}` (`app.ts:776`)
- Workbench resolve: `workbench:${approvalId}:${resolution}` (`governance.ts:139`)

The only divergence is the prefix. A UUID minted per call means a caller-level retry after a timeout, or a double-submit, gets a fresh id, so server-side dedup no longer applies. Since the design already exempts content-derived ids to protect replay dedup, this is the same issue. Simplest unification: keep the content-derived ids and take the caller prefix from a constructor option. `listApprovals` is read-only and needs no id. "Minted at construction" is also ambiguous: construction of what?

**3. Severity: Major**
**Affected Scope:** D1 `listApprovals({actor?})` ("Horizon passes the operator reference, Workbench the server default"); D4 "`app.ts:1011` → `listApprovals` (operator actor)"
**Simplicity Rationale:** This doesn't match the code. Horizon passes the **service** actor (`sea-forge-approvals.ts:102`, `app.ts:1011`). Workbench passes no actor (`governance.ts:125`), and neither does the SDK's own `approvalState` (`sea-forge-authority.ts:416`). Re-homing `:1011` with the operator actor is therefore an unstated behaviour change, and a third operator-visible change if the server filters by actor.

There is also a reuse gap: `SeaForgeAuthority.approvalState` already calls `authority_approvals` and parses the rows. `listApprovals` should become the SDK's single row parser and `approvalState` should be built on it. Otherwise the SDK ends up with two parsers for the same rows, and the `excluded` count only applies to one of them.

**4. Severity: Major**
**Affected Scope:** D2 step 1 ("byte-stable-provable"), D2 step 2 ("JSON bytes are identical across 0.4.0"), R3 ("verified no external schema-fetch mechanism exists")
**Simplicity Rationale:** The compatibility claim is broader than the code supports. `system.get_schema` is a wire method (`crates/sea-forge-server/src/sfwp/mod.rs:452-470`). It advertises each schema's `name` from `SCHEMA_TYPES` and a hardcoded `path: "workbench/packages/contracts/schema/{name}.schema.json"` (line 463). A conformance test enforces it (`tests/conformance_sfwp.rs:789-803`). Both the contracts-home move and the rename change that response. The sea-rs desktop (`workbench/apps/desktop/src/pages/SystemContractPage.tsx`) consumes it.

The approval-row bytes are identical, but the release is not. Narrow the sentence to approval payloads, list the `get_schema` change, and add `mod.rs:463` to PR 1's scope (not just the generator output).

**5. Severity: Nit**
**Affected Scope:** Overview (two operator-visible changes), D1 `resolveApproval` `onBehalfOf?`
**Simplicity Rationale:** "Resolve now carries the operator reference the server requires" is not a change. Both callers already send `on_behalf_of` (`sea-forge-approvals.ts:88`, `governance.ts:141`), so there is one operator-visible change, not two. Also, every current caller needs `onBehalfOf`, so making it optional is speculative flexibility. Make it required, or a constructor option.

**6. Severity: Nit**
**Affected Scope:** Goal 3 / D4 teeth; Verification "Correctness" (`test/helpers/sfwp-fixture-socket.ts`, new)
**Simplicity Rationale:** The design doesn't say where the INV-2 static scan lives. Horizon already has a structural boundary checker, `scripts/check-boundaries.ts`, plus `check-t05-boundaries.ts`. Extend one of those rather than adding a new checker. The "new" fixture harness already exists twice, as the `fake` socket in `packages/runtime-bun/test/sea-forge-authority.test.ts:41-59` and in `sea-forge-busy.test.ts:24`. Describe it as extracting that, not new code.

**7. Severity: Nit**
**Affected Scope:** Goal 2 / D2 step 1 (contracts-home move)
**Simplicity Rationale:** The move's payoff, deleting the `workbench/` renderer, belongs to the post-v1 retirement batch, not to T1's root problem. The owner adopted it as a rider, so keep it, but say it is a rider, and note it is the source of the `get_schema` change in Finding 4.

**8. Severity: Nit**
**Affected Scope:** Throughout (Δ markers), Non-Goals ("see The Problem note below"), D4 file-level detail
**Simplicity Rationale:** Codes such as S5–S9, R-A and E-2 have no legend, which makes them hard for a new reader to follow. The Non-Goals cross-reference is dangling: The Problem is above it and has no such note. D4 drops into per-file and per-symbol detail (`seaForgeActorOf`, test filenames) that belongs in the plan. Move the review history to `RESOLUTION.md`, and keep the design at the level of components and interfaces.

---

**Verdict:** REVISE. One Blocker: the deleted adapter orphans the one exception, and the simpler fix removes the exception. Plus three Majors: the request-id scheme regresses idempotency, the `listApprovals` actor claim contradicts the code, and the `get_schema` wire change is unacknowledged.
