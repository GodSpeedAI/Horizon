# PR 84 review-thread fixes (GodSpeedAI/sea-rs, branch fix/server-ambiguous-declare-keeps-lease)

Worktree: /home/sprime01/projects/sea-rs.wt-pr84 (local branch `pr84-work`, because the PR branch is checked out in /home/sprime01/projects/sea-rs-fix). CARGO_TARGET_DIR=.target-pr84 (git-excluded locally). Pushed with a normal push: 961dd478..0bf85050. No thread resolved, no GitHub reply, no merge.

## Baseline (head 961dd478, before edits)
`cargo test --no-fail-fast -p sea-forge-authority -p sea-forge-server -p sea-forge-cli`: 956 passed, 0 failed.
(A first, fail-fast baseline run showed conformance_m8_cli_parks_external_gate_profiles failing; that run overlapped my first source edit, so it was discarded and re-run on a stashed clean tree: 0 failures. The same test did fail deterministically later, caused by fix 1, see below.)

## Dispositions
1. delegation.rs:1102 (Major) FIXED, claim valid. Verified in sea-forge-settlement/src/declaration.rs: timeout, nonzero exit, output limits, invalid JSON, stdin/stdout piping and reader failures all returned `settlement_authority_unavailable`, the class `ambiguous_after_call` treats as "nothing declared" and releases. Fix: only a failure to start the command (`spawn`, `spawn_in_job`) stays `settlement_authority_unavailable`; every failure after it started is the new class `settlement_authority_call_failed`, which keeps the lease. The same release rule exists in sea-forge-cli resume.rs (`!call_started || unavailable`), so the fix applies there with no logic change. Behaviour change: a started command that fails now returns an error (exit 1) instead of parking with exit 5, and the claim is held until reconciliation or operator resolution. The reviewer's pointer to conformance_m16.rs:1379 is a comment about a missing authority config (fails before any call), so no change there. Collateral: conformance_m8_artifact simulated an outage with a command that ran and exited 1; that is now (correctly) ambiguous, so the test simulates the outage with an authority command (copy of the binary) that is removed, i.e. cannot start. That test change was forced by the intended semantics, not a weakened assertion (same exit 5, same released/no-declaration checks, same resume to completion).
2. cep.rs:3192 (Minor) FIXED, claim valid. Status check and audit write were not atomic; N racing operators each appended `settlement_uncertain_resolution`, only one `closed:{attempt}` won. Fix: audit is `commit_typed_once` under key `settlement-uncertain:{pending_id}:{attempt}` (first wins, identical retry replays, conflicting resolution refused). Trade-off: if an operator crashes between the audit write and the close, a different resolution for that attempt is refused until the identical one is retried (fail closed).
3. horizon_gateway_policy.rs:176 (Major) FIXED, claim valid (test gap, no product bug). Added `assert_still_pending` (reads `settlement_status`, requires `Pending`) to both refusal tests. Finding while verifying: the "gateway" test is refused by the self-approval branch (gateway is the requester), not by policy, so a new test covers the policy-only refusal (service actor that is not the requester, no approval_resolution rule).
4. approve.rs:110 (Major) FIXED, claim valid. The CLI only loaded the policy; authorization was the hard-coded Operator role from `--actor`. Fix done in the shared API as the reviewer preferred: `resolve_uncertain_settlement(_at)` now takes `engine` and `bundle` and evaluates the `approval_resolution` decision (resource = settlement approval id, requester = pending record actor, resolution "approved" because the engine rule only matches approved/rejected, plus `uncertain_resolution` declared/not_declared) before reading attempt state. Denial is audited as `authority_decision` and leaves the claim open. API signature change: only the CLI and tests call it. Side effect of the engine rule: the original requester cannot resolve the uncertain claim.

## Mutation table
| mutation | test that fails |
|---|---|
| call_failed constructor emits class `settlement_authority_unavailable` (thread 1) | sea-forge-settlement `declaration::tests::failures_after_the_command_started_are_not_unavailable` |
| audit write back to plain `commit_typed` (thread 2) | cep_settlement `lease_and_fencing::concurrent_operator_resolutions_of_a_lapsed_claim_close_it_exactly_once` (audit count) |
| policy-denied branch in `resolve_uncertain_settlement_at` disabled (`&& false`) (thread 4) | cep_settlement `an_operator_without_an_approval_resolution_rule_cannot_resolve_an_uncertain_claim` |
| self-approval refusal also commits an approving resolution (thread 3) | horizon_gateway_policy `a_gateway_cannot_approve_its_own_external_declaration`, `an_operator_cannot_approve_their_own_request` |
| policy-deny branch of `resolve_approval` also commits an approving resolution (thread 3) | horizon_gateway_policy `a_service_actor_without_an_approval_resolution_rule_cannot_resolve_an_operator_request` |
Note: the delegation.rs helper test `a_failure_after_the_call_started_keeps_the_lease_unless_unavailable` already passed before the fix (the helper was right, the transport mapping was wrong), so the transport tests carry thread 1; I added the `call_failed` case to the helper test as documentation. No end-to-end server test drives `submit_swe_seed_declaration` through a real transport (existing limit, still open).

## Results on final head 0bf85050
- `cargo test --no-fail-fast -p sea-forge-authority -p sea-forge-server -p sea-forge-cli -p sea-forge-settlement`: 989 passed, 0 failed (baseline 956 over three crates; settlement crate added, new tests included).
- `cargo clippy --all-targets -p sea-forge-authority -p sea-forge-settlement -p sea-forge-server -p sea-forge-cli -- -D warnings`: rc 0, no warnings.
- `cargo fmt --check` and the repo pre-commit (status check, fmt, gitleaks) passed on every commit.

## Commits (each ends with the Co-Authored-By / Claude-Session trailers)
- 91fa25a5 fix(settlement): keep the claim lease when a started SWE_SEED call fails
- 9b5c3e07 fix(authority): prove a refused approval resolver leaves the approval pending
- 820a0d28 fix(authority): audit an uncertain-claim resolution once per attempt
- 0bf85050 fix(authority): evaluate approval_resolution policy before resolving an uncertain claim

## Notes
- The repo pre-commit requires an `.agents/CURRENT_STATUS.yaml`/`.md` revision per commit; revisions 215-218 were appended (one per commit) with the repo's own script format.
- Commit 820a0d28 was staged from a T2-only blob of cep.rs/cep_settlement.rs, so that intermediate commit was not compiled standalone; the head was fully tested.
- A pre-existing unrelated stash (casework/live-wiring-clean) exists in the shared repo; untouched.
