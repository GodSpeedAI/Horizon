# Follow-ups round 1 (#21, #19, #24)

Horizon PR #25 (branch fix/followups-19-21-24, not merged) fixes #21 and #24. #19: stopped, no code change, no sea-rs PR.

## #21
load_plan requires PLAN_ROWS == PLAN_TABLE, row for row, in order. test/gateway-installer.test.ts stages the full table. New test covers dropped, duplicated, swapped and replaced rows under --verify-only. Mutation (check removed) fails that test.

## #19 engine findings (sea-rs origin/main 55bb3937)
- First-match: crates/sea-forge-authority/src/lib.rs:2447 (`rules.iter().find(matches_rule)`); no match gives default deny (lib.rs:2529-2536, "default_deny").
- Dispatch for settlement_declaration: lib.rs:2989 -> matches_settlement_authority_class (lib.rs:3067-3080).
- Missing or unknown class: `_ => false` (lib.rs:3078), so no rule matches and the verdict is Deny. This holds for the current unconstrained `settlement` rule too.
- `local`: matches a rule with no class boundary or one naming local. `external`: matches only a rule that names external (lib.rs:3074); the unconstrained rule does not match it.
- Server emits only "external" or "local": SettlementAuthorityClass::as_str (cep.rs:2015-2021), derived at cep.rs:2125-2140.
- Policy load rejects any class other than external or local (lib.rs:1431-1441) and an ungated external allow (lib.rs:1445-1452).
Conclusion: the issue's premise is wrong. The fallback is not fail-open; the engine already fails closed. Adding `[local]` would change no behaviour (defense in depth only). Per the brief: stopped, no change, no policy-19.diff written (the render is unchanged). Suggest closing #19 as not-a-bug, or adding a sea-rs test pinning missing/unknown/local/external -> refuse/refuse/allow/approval-required if the owner wants it locked.

## #24
src/ui/workspace/approval-inbox.tsx, src/app.ts (presentation and redirect only), test/approval-inbox.test.ts (+7 tests). SEA-Forge rows carry no requested-at time, so the page says that and shows expiry. The post-click banner is read from the listing, not from the link. Screenshots: inbox-before.png, inbox-after.png, inbox-after-resolved.png, inbox-after-error.png (static render via headless Chrome; not a live run).

## Gates (Horizon worktree)
check ok; bun test 526 pass, 16 skip, 0 fail; boundaries ok; verify all pass.

## Round 2 (PR #25 review fixes)
- Major: resolveNavigationApproval wraps the steps after a successful resolveApproval in ApprovalFollowUpError (same message; "governed commit refused" still passes through). The route maps errors to fixed codes (refused, not_pending, invalid, unavailable, followup_failed); no error text travels in the URL. followup_failed banner says the decision was recorded and a follow-up failed, never "nothing was approved". Every banner is checked against the listing (a listed resolution is stated whatever the link says).
- Minor: a claimed decision that differs from the listed state shows "Not confirmed" plus the listed state. Unknown codes render generic fixed copy.
- Tests added: hostile payloads in all query params and row fields; decision/state mismatch; followup_failed on pending, resolved and absent listings; code mapping (refused, not_pending, unavailable); invalid-argument route (inbox and plain); not-found route. The 409 path is covered via the code-mapping unit test, not end to end (needs a live SEA-Forge). 
- #21: test parses PLAN_TABLE from the script and asserts buildPlan(production layout) and the test's hand copy both equal it.
- Gates: bun run verify passed in full (534 pass, 16 skip, 0 fail; check, boundaries, teeth, pytest, ledger, wayfinder ok).
