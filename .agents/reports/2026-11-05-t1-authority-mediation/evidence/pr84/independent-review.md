# Independent review: SEA-Forge PR #84 (pr84-work)

Verdict: REQUEST CHANGES (no Blocker; three Major findings, mostly test-proof gaps plus one policy gap).

Scope: `git diff origin/main...pr84-work`, crates authority, settlement, cli, server. Read-only; mutations reverted, `git status` and `git diff` empty afterwards.

## Findings

### Major
1. Test gap, CLI keep decision (`crates/sea-forge-cli/src/commands/resume.rs` ~1212, `if !call_started || unavailable`). Mutation M2 (`if true`, always settle/release the claim) passes all of `cargo test -p sea-forge-cli`. Nothing proves a started failure in `resume` keeps the claim and exits 1 with `settlement_authority_call_failed`. Scenario: a regression that releases after a started timeout lets a second resume declare twice, and CI stays green. Fix: add an m8 conformance test with an authority script that starts, exits nonzero or times out, then assert claim status is `Resuming`, exit code 1, class `settlement_authority_call_failed`, and that a second resume does not call the authority.
2. Test gap, server wiring (`crates/sea-forge-server/src/delegation.rs` ~1048 and ~1085). Only the predicate `ambiguous_after_call` is unit-tested (M1 is killed only by that test). The `call_started` flag set in the closure, and the early `return Err(error)` before `settle_unrecorded_claim`, have no integration test. Fix: drive `submit_swe_seed_declaration` with a failing command and assert the claim stays open and the ledger holds no `failed`/`released` close.
3. Policy gap, separation of duties in `resolve_uncertain_settlement_at` (`crates/sea-forge-authority/src/cep.rs` ~3160-3200). The resolver is only required to have `ActorRole::Operator` and pass the `approval_resolution` rule. There is no check that the resolver differs from `record.actor_id` (the requester). The normal `resolve_approval` path refuses self-approval (tested in `horizon_gateway_policy.rs`), but the uncertain path passes `requester_id` to policy only as a parameter. The gateway fixture rule `operator-approves` does not constrain it. Scenario: operator op-alice requests an external declaration, it goes uncertain, op-alice resolves it as `--not-declared` alone. Fix: refuse when `resolver.actor_id == record.actor_id`, with a test.
   Related: the CLI (`approve.rs` `resolve_uncertain`) hard-codes `role: Operator` for a free-text `--actor` (default `operator_local`). Any local caller can claim to be an operator. The `on_behalf_of`/gateway-uid and service-identity rejection claims are not in this diff and no test in the diff exercises them; I could not verify them here.

### Minor
4. Audit-before-effect ordering (`cep.rs` ~3185-3205). `commit_typed_once` writes the resolution audit, then `complete`/`release` closes. If the close fails (I/O error, ledger conflict), the audit says "resolved" but the claim is still open. A retry with the same resolution replays; a retry with the other resolution (Declared vs NotDeclared) is permanently refused by the create-once key, which can strand the claim. Fix: allow the other resolution to supersede when no close exists, or write the audit after the close with an idempotent key.
5. `call_started` in the server is set before `authority.declare`, which may fail on request validation before any transport submit. Those failures are now treated as ambiguous and keep the lease (conservative, safe, but contradicts "a failure before the call starts settles at once"). Fix: set the flag inside the transport, or document it.
6. Refusal path writes an `authority_decision` ledger record (`cep.rs` ~3150). This is an audit entry, not a state change, and the approval stays pending (tests confirm). Note only: "no write on refusal" is true for state, not for the ledger.
7. Behaviour change worth stating in the PR text: `reconcile_settlement_resume` never fails a lapsed claim any more, even a claim that crashed before the authority call. Every such claim now needs an operator. Doc comment at `resume.rs` ~1208 is a single over-long line (formatting).

## Decisions checked
- Server `delegation.rs`: started plus non-unavailable keeps the claim (returns before settle); unstarted non-unavailable fails; unavailable releases. Correct.
- CLI `resume.rs`: unavailable returns exit 5 `awaiting_approval` after release; other started errors return Err (exit 1) with the claim kept. Correct by reading, but unproven (finding 1).
- `declaration.rs`: every post-spawn failure reclassified to `settlement_authority_call_failed`; only spawn failure stays `unavailable`. Correct. Unit tests cover spawn failure, nonzero exit, invalid JSON, timeout.
- Races: close is fenced by attempt and by `status_in`; the concurrent-resolver test shows exactly one close and one audit. A worker finishing after lapse completes its own attempt once; double complete is rejected. I found no double-close or double-audit path.
- Policy before state change: evaluate precedes the status read, lease check, audit and close. Correct.

## Test results
- `cargo test -p sea-forge-authority -p sea-forge-settlement -p sea-forge-cli -p sea-forge-server`: 84 suites, 989 passed, 0 failed. The server doctest step failed to build (`E0463 can't find crate sea_forge_agent` in rustdoc); that is a toolchain/environment issue, not a test failure, and I did not check whether main has it too.
- `cargo clippy ... --all-targets` on the four crates: no code warnings (only existing manifest warnings).

## Mutations (all reverted; tree clean)
- M1 server `ambiguous_after_call` always false: killed (only by the unit test).
- M2 CLI `resume.rs` always settle: SURVIVED (finding 1).
- M3 skip the policy refusal in `resolve_uncertain_settlement_at`: killed (5 tests).
- M4 timeout reclassified as unavailable: INCONCLUSIVE. My sed hit the first occurrence (the stdin-pipe error), not the timeout line, so it proved nothing.
- M5 reconcile fails a lapsed claim instead of completing: killed (3 tests).

## Not verified
- The `on_behalf_of` gateway-uid rule and service-identity rejection (not in the diff).
- M4 and the server doctest failure on main.
- No live SWE_SEED round trip.
