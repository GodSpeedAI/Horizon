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

## Operator decisions applied afterwards

1. Raw-socket exception (commit f3b39fe): the two files `src/adapters/sea-forge-wire.ts` and `src/adapters/sea-forge-events.ts` are named exceptions in `scripts/check-boundaries.ts`, with a plain-words comment there and a line in `src/adapters/EGM.md`. `scripts/teeth-inv2-mutation.ts` gained a fifth planted case (an allowed file name in the wrong directory) and now checks the planted path itself; any other `src/` file that opens the socket still fails (5 of 5 caught).
2. Attack tests (commit 71bea02): `scripts/teeth.ts` gives each synthetic root a clean `src/` so the wire scan has something to read; the fake runtime under `scripts/t04-attacks/fake-runtime/` now exports a refusing `SeaForgeAuthority`, so it loads and fails on behaviour (7 failing tests in the isolated tree). `teeth.ts` reports all attacks blocked; nothing was loosened.
3. Old pages (commit dd5a9f5), ported into the desk's plain words (`src/ui/desk/decision-words.ts`, `decide-build.ts`, `Decide.tsx`, `src/app.ts`, tests in `test/desk-decision-words.test.ts`):
   - Ported from #25: after an answer, the desk reads the case keeper's own list and says Done only when the list shows what you chose, with the resolver; otherwise "Not confirmed" with the listed state; a refusal says nothing changed unless the list shows the request decided; unreachable or unknown failures say to check the list; a later failing step is named and not mistaken for a failed decision; a "Already decided" list shows state and resolver.
   - Ported from #14: the older move with no verified approval is a notice in Decide (it was already on Today).
   - Already in the desk before the merge, so nothing to port: decided / recorded / observed claims and the observe-then-rule steps (acceptance cards), the assurance banner (Today), one next action (NextDecision), the unverified-approval text on Today.
   - Not ported: the old page's raw details list (world, request ref, subject) and its Approve/Reject form, because the desk's cards and typed-reason previews replace them and show those words in plain form; the primary-action panel text, because the desk's NextDecision does that job.

## Final checks

`just verify` exit 0 (977 pass, 16 skip, 0 fail; output in verify.out), `just check-t05`, `just teeth-t05` and `bun run build:desk` all exit 0 (other-checks.out).
