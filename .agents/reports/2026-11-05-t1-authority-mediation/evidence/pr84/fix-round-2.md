# PR #84 fix round 2

Pushed 0bf85050..58b8a662 to fix/server-ambiguous-declare-keeps-lease (no force).

## Commits
- 7126613d fix(authority): refuse self-resolution of an uncertain claim and audit only after the close
- 81f5ce98 test(cli): prove a started SWE_SEED failure keeps the claim and is not retried
- 58b8a662 test(server): drive submit_swe_seed_declaration with a command that starts then fails
Each bumps CURRENT_STATUS (revisions 219-221).

## Items
1. Self-resolution: resolver == record.actor_id refused with self_approval_refused, audited as approval_self_resolution_refused, after role check and before policy/status/close. Tests: requester refused (claim Resuming, no resolution record, one refusal audit); another operator still succeeds.
2. Close first, then create-once audit. Audit failure after a successful close returns an error saying the close took effect and the audit was not written. Comments corrected. Test uses a doc-hidden hook `resolve_uncertain_settlement_with_hook` that runs after the checks, before the close; the worker completes there; both resolutions are refused and no settlement_uncertain_resolution record exists. (A plain "complete first" call would stop at the status check and not prove the ordering.) Concurrent-resolver test still: 1 close, 1 audit.
3. CLI m8 test: command records each call, then exits 1 (and a sleep-60 timeout variant). Asserts exit 1, settlement_authority_call_failed, claim Resuming, second resume does not call again (marker count 1), no declaration.
4. Server: a unit test in delegation.rs drives submit_swe_seed_declaration through the policy's settlement_authorities command (no refactor needed): pending, approved by another operator, command starts and exits nonzero, claim stays Resuming, second submit makes no second call. Nonzero exit only; timeout is covered at the CLI.
5. Docs: resume.rs comment fixed and wrapped. PR #84 body updated (behaviour change, new proofs, five Limits).

## Tests
cargo test on the four crates: 993 passed, 0 failed. Server doctest step fails to build (rustdoc E0463, sea_forge_agent), environment issue, reported not fixed. Clippy --all-targets -D warnings clean; fmt clean.

## Mutations (by hand, reverted)
- M2 (`if true || !call_started || unavailable`): new CLI test fails on the claim-status assertion.
- M1 (`ambiguous_after_call` always false): new server test and the predicate unit test fail.

## Not done
PR threads not replied to or resolved; not merged. Audit-before-close ordering was not separately mutated (the hook test is constructed to catch it). Review items 8 (declared ref unchecked) and the policy-renderer tie remain documented Limits.
