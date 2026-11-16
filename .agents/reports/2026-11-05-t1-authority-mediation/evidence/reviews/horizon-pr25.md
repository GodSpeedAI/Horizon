# Review of Horizon PR #25 (fixes #21, #24)

Verdict: REQUEST CHANGES (one Major, otherwise sound). Read-only review; no tests run.

## #21 installer
1. Required-set check: exact. scripts/install-sea-forge-gateway.sh:329-337 checks count equality, then PLAN_ROWS[i] == PLAN_TABLE[i] for every index. Dropped, extra, duplicated and reordered rows are all refused. Empty plan is refused earlier ("no rows", :323). Empty seam table with a non-empty plan fails the per-row whitelist (:324-328). Arrays from mapfile are contiguous, so indexing is safe.
2. Seam guard (:306) is untouched by the diff: still needs INSTALLER_TEST_MODE=1 and uid/ruid/EUID != 0.
3. Real table still exercised: makeStage() (test/gateway-installer.test.ts:23-69) stages all 25 production rows with no seam, so "clean stage passes" and the new required-set test (:309) run against the real PLAN_TABLE. The old append-a-bad-row tests still hit the "fixed table" message first (per-row check precedes the new one).

Minor
- test/gateway-installer.test.ts:22 hand-copies the table. Nothing asserts that `buildPlan(production layout)` (scripts/gateway-setup.ts:178) equals the installer table, so stager/installer drift would surface only on a live install. Order matches today. Suggest a test comparing buildPlan(prod) rows to PLAN_ROWS.
- No test for the seam with an empty table file (behaviour is correct; just uncovered).

## #24 approval inbox
1. Authority: no new route. The only server change is a `return_to=inbox` flag on the existing POST /workspace/approval (src/app.ts:1556) that changes the response (303 to /workspace/approvals) after the same intentId lookup and resolveNavigationApproval call. No new resolution or self-approval path. The redirect target is a fixed path, so no open redirect.
2. Escaping: all new fields (operation, requester, expiry, error message, resolver, ids) are React text children or attributes through renderToStaticMarkup, so they are escaped. No dangerouslySetInnerHTML. No XSS found. Not tested, though (see below).
3. Crafted links: cannot inject markup. A forged `resolved=` for a pending approval gives "Not confirmed" (approval-inbox.tsx:46-60), because the notice is checked against the listing. Verified.

### Major
- src/app.ts:1568-1572 with approval-inbox.tsx:33-39. After `seaForge.resolveApproval` succeeds (app.ts:~541), `pollApprovals()` or `settleCommitRun`/`runOutcome` can throw an error that does not start with "INTENT: governed commit refused". The catch then redirects with `error=`, and the banner states "That decision was not recorded ... Nothing was approved or rejected by this click." That claim can be false: SEA-Forge may have recorded the decision. This is the exact confusion #24 is about. The error banner is also never checked against the listing, unlike the success banner. Fix: for an error with an approval id, look the id up in the listing; if it is no longer pending, say "SEA-Forge now shows it as X" instead of "nothing happened". Or soften the copy to "may not have been recorded; check the list".

### Minor
- approval-inbox.tsx:46-52: the resolved banner ignores whether the claimed decision matches the listed state. `?resolved=apr-B&decision=approve` for an approval already rejected (or expired) earlier by someone else shows "Done. ... is now rejected ... You chose to approve it." Truthful state, misleading attribution. Require approve->approved, reject->rejected, else show "Not confirmed" or omit the "You chose" sentence.
- Error text (up to 400 chars) from the query string is shown in an alert styled as a system message. A crafted link can show arbitrary attacker-chosen plain text (social-engineering copy, no markup, no links). Prefer a fixed set of error codes mapped to server-owned copy, or label it "Reported error".
- src/app.ts:1568: raw internal error messages are now placed in the URL (browser history, referrer-free but logged).
- Tests (test/approval-inbox.test.ts:96-148, 244-272): no test feeds `<script>`/quote payloads through message, requester, operation or resolver; no test for the decision/state mismatch; the route test covers only the not-found path (not the 409 and invalid-argument paths); the excluded-count test is good; the "forged success is not believed" test is good.
- aria-describedby ids built from approval_id (`approve-${id}`) are not unique-safe if an id contains spaces. Not exploitable.
- Excluded rows appear only as a count (data-excluded, :122-ish); confirmed, no row content leaks.

# Round 2 (309ff4a vs 969f80c) - APPROVE

(a) Major closed. app.ts:560-567 wraps only pollApprovals/settleCommitRun/runOutcome after a successful resolve. `!resolved.ok` and a throw from `resolveApproval` itself are outside the try, so a failed resolve is never reclassified. "INTENT: governed commit refused" is rethrown unchanged (rejection receipt path kept). ApprovalFollowUpError maps to `followup_failed`, whose banner never says "Nothing was approved".
(b) Mostly. Error banners with a non-pending listed item say "SEA-Forge lists ... as X" and drop the "nothing changed" line; resolved banners require decision == state. Minor: `?error=followup_failed&approval=<pending id>` still asserts "the decision was recorded" with no listing support (text only, "Check the list below"). Also `not_pending` can sit beside a pending listing. Neither is exploitable.
(c) Only INBOX_ERROR_CODES render; unknown -> fixed copy. The approval id is not printed in error banners, and in the resolved/unconfirmed banners it is escaped.
(d) Tests match their claims: XSS, mismatch, followup_failed over three listing states, code mapping, hostile query. Minor gap: no test drives resolve-ok/follow-up-throws or resolve-fails through the real resolveNavigationApproval (only approvalErrorCode in isolation). Round 1 installer drift Minor is closed (installerTable() parsed from the script, buildPlan(prod) compared).
(e) Nothing new: no route, authority path unchanged.
