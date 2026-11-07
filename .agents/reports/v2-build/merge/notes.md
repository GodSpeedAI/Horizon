# Merge of origin/main into the desk build

Merge commit 04d0f32 (parents: desk tip 73678b2, origin/main 4e19be5).

The desk branch already carried an earlier, pre-review copy of the gateway work (the same feature, before upstream's review rounds). So most conflicts were "old copy vs refined copy".

## Each conflicted file

- package.json: upstream's de-vendored Cognate 0.9.0 dependencies, plus the desk's `build:desk` script and `@mcp-b/webmcp-polyfill`. I also added `@godspeedai/cognate-protocol-connect` and `-bun` at 0.9.0, because `src/adapters/workshop.ts` imports them and a test (`app.test.ts`) requires every imported Cognate package to be declared. Upstream had dropped them.
- bun.lock: regenerated with `bun install`, not hand-merged.
- .gitignore: union.
- justfile: union (desk's seed recipes and upstream's additions).
- docs/gateway-runbook.md, scripts/gateway-setup.ts, scripts/install-sea-forge-gateway.sh, src/adapters/delegating-authority.ts, src/domain/approval-inbox.ts: took upstream's version (it is a strict refinement of the desk's older copy; I diffed the removed lines to check).
- test/gateway-setup.test.ts: upstream's, plus the desk's test that the ignite policy lets the operator and agents add and finish steps.
- test/remote-sessions.test.ts: upstream's (the desk had no changes of its own beyond the old copy).
- test/approval-inbox.test.ts: rebuilt from upstream's file. Dropped the tests of the retired approval-inbox page and the old `/workspace/approval` form. Kept upstream's buildInbox, SDK listing, follow-up failure, approvalErrorCode and self-approval tests, and the desk's decision-card tests and `/desk/decide.json` tests (adapted to the new `buildInbox(rows, excluded, ...)` signature).
- src/adapters/sea-forge-approvals.ts: deleted, as upstream did. Its jobs moved to `sea-forge-config.ts` and the SDK client.
- scripts/ignite.ts: kept the desk's `COGNATE_SEA_FORGE_OPERATOR: operatorRef` (configured operator ref) over upstream's literal "operator".
- src/config/types.ts, src/config/load.ts, test/config.test.ts: kept the desk's additions (records, workshop, ui, imports) next to upstream's.
- src/settlement/obligation.ts: kept the desk's async verifier run (it passes the RealityTrace target and snapshot); upstream's store-snapshot step is already present on both sides.
- src/app.ts: desk's file with upstream's changes applied: SDK client for delegation/resolve/list/closure, `afterRecordedDecision`, `settlementAuthority` rename, `delegationClient` option (the desk's `delegationSend` is gone). Kept the desk's `applyAgentOp`, workshop option and route set. Dropped upstream's `/workspace/approvals` page route, `inboxNotice` and the `/workspace/approval` and `/workspace/settle` POST routes, because the desk retired those pages (the desk's own routes serve `/workspace/approvals`). `approvalErrorCode` now owns its small `InboxErrorCode` type, since the page that defined it is gone.
- src/ui/workspace/render.tsx, test/workspace-render.test.tsx, src/ui/workspace/approval-inbox.tsx: stay deleted (desk retired them). Upstream's changes to them (primary-action panel, assurance banner, observe/rule settle buttons, inbox notices) are not ported to the old pages. The desk already shows assurance and settle phases itself.
- src/adapters/EGM.md, src/domain/EGM.md, src/ui/workspace/EGM.md: facts from both sides merged.
- src/ui/desk/decide-build.ts, test/desk-teeth.test.tsx (not conflicts, but needed): `inbox.malformed` is now `inbox.excluded`.
- Several desk tests and `connectors/github/index.ts`: import `ApprovalAuthority` / `seaForgeActorOf` from `sea-forge-config.ts`.

## Decision I made that needs your eye

Upstream added a boundary check (INV2): `src/` may not open the SEA-Forge socket. The desk's case keeper client and event follower need raw socket calls the SDK does not offer (`case_*`, `human_task_*`, event stream). I put the desk's `seaForgeCall` in `src/adapters/sea-forge-wire.ts` and made `scripts/check-boundaries.ts` allow exactly that file and `sea-forge-events.ts`. Governance verbs all use the SDK client. If you would rather keep INV2 absolute, the case keeper needs a different home or an SDK feature.

## Checks

- `bun install`, `tsc --noEmit`: 0.
- `just verify`: stops at `teeth` (scripts/teeth.ts), two leaks: `canonical-closure-control` and `fake-runtime-substitution`. These fail identically on a clean checkout of origin/main (checked in a throwaway worktree), so they are an upstream problem: the synthetic roots in teeth.ts have no `src/`, which upstream's new wire scan treats as a vacuous scan, and the fake runtime fails at import. I did not edit teeth.ts. Everything in verify before it passed (check, boundaries, idm, 966 tests pass / 0 fail / 16 skip, pytest, ledger, wayfinder); the recipes after it were run by hand and pass.
- check-t05, teeth-t05, build:desk: pass.
- Frozen files: upstream's changes to requirements/ledger.yaml and .wayfinder/answer-key.md merged without conflict (taken as upstream wrote them); ledger and wayfinder validators report 0 errors.
