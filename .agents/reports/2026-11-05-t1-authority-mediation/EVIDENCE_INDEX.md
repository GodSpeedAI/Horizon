# T1 Authority Mediation: evidence index

One row per acceptance category of the design (`design_draft.md`, acceptance table). Each row gives the evidence state, using the strongest state reached: NOT TESTED < FAILED < SIMULATED PASS < INTEGRATION PASS < RELEASE PASS < LIVE VERIFIED. Paths are relative to this folder.

| Category | State | Evidence |
|---|---|---|
| Correctness: SDK parity suite | INTEGRATION PASS | cognate PR #75 (`bb692b3b`), released in 0.9.0; `evidence/phase-c/` |
| Correctness: Horizon J02 with the adapter deleted | INTEGRATION PASS | `evidence/d4/implementation.md` (12/12 against v0.4.0); `evidence/phase-f/logs/HZ-*` |
| Correctness: Workbench capability tests | INTEGRATION PASS | `evidence/d3/implementation.md` (1172 pass / 230 failing tests that were already there, identical names); `evidence/d3/live-test.md` (2/2 live) |
| Idempotency | INTEGRATION PASS | `evidence/phase-f/MATRIX.md` (replay deduplicated; `request_id_reused`; two client instances use the same id); Horizon `test/sea-forge-wire.test.ts` (decide, resolve and list bytes equal the pre-migration format, PR #22) |
| Negative states | INTEGRATION PASS, with one SIMULATED PASS | SDK fixture matrix (cognate #75); real-server cases in `evidence/phase-f/MATRIX.md`. The expired-standing case is SIMULATED PASS (sea-forge-authority expiry unit tests, `logs/sea-rs-expiry.log`), because the TTL floor is 1 hour. The case-task id case is weaker: it used an unknown id. |
| Adversarial | INTEGRATION PASS, with two SIMULATED PASS | `evidence/phase-f/MATRIX.md`, harness `evidence/phase-f/adversarial.ts`: 14 integration cases assert `errorClass`. SIMULATED PASS: unknown-identity self-approval (a pure function), and `on_behalf_of` from a non-gateway uid (server unit test, `logs/sea-rs-non-gateway-uid.log`), because a second OS uid needs sudo. Teeth mutation in both fronts: D3/D4 evidence. |
| Regression | INTEGRATION PASS | sea-rs v0.4.0 `conformance_sfwp` 20/20 and `approval_standing_fixture` 2/2 (`evidence/regression/sea-rs-v0.4.0-conformance.log`); Horizon full suite 518/16/0 at `ed69e8c`; single-cognate ok; cognate `events` and `runtime-api` tag diffs are additive only (`evidence/regression/cognate-events-runtime-api-tag-diff.md`) |
| Integration: roundtrip at heads (Stage 0) | INTEGRATION PASS | `evidence/stage0/j02-live-at-heads.log` (12/12 after #17) |
| Integration: roundtrip at the 0.4.0 tag, deployed | **LIVE VERIFIED** | `evidence/release/j02-live-v0.4.0.log` (12/12); `evidence/release/live-roundtrip-result-1.json` (approve and resume), `live-roundtrip-result-2-reject.json` (reject); SEA-Forge records `resolved_by: operator` |
| Recovery: cross-version matrix | INTEGRATION PASS | `evidence/phase-f/MATRIX.md`: both fronts' adoption commits × v0.3.0, and pre-adoption × v0.4.0, all green with no skips |
| Recovery: adoption reverts | INTEGRATION PASS | `evidence/phase-f/MATRIX.md`: the Horizon revert of `ed69e8c` (unit 514/16/0, live 12/12) and the Workbench revert of `39700cb` (same failing set, live 2/2) |
| Recovery: restart-resume / terminal accounting (`087fecc`) | INTEGRATION PASS | `test/pending-terminal-atomic.test.ts` 7/7 at adoption and on the revert |
| Recovery: gateway redeploy of the previous binary | SIMULATED PASS | `RELEASE_RECOVERY.md`, rehearsal record (`--verify-only` ok against `…replaced-20261105T224530Z`). It would be LIVE only if the owner runs the privileged redeploy. |
| Installer hardening (Phase E) | INTEGRATION PASS | `evidence/phase-e/installer-hardening.md` (rounds 1–4); `evidence/reviews/horizon-pr20*.md` (APPROVE on round 4); production stage `--verify-only` ok |
| Performance | not a goal | — |
| Release evidence | RELEASE PASS | sea-rs `v0.4.0` (release with 6 assets and `SHA256SUMS`, saved to `evidence/release/sea-rs-v0.4.0-SHA256SUMS`); Cognate 0.9.0 group, release run 42128568352 with 48/48 publish jobs; `evidence/release/tag-digests.txt`; Stage 0 listing measured at 26 bytes, 0 rows (`evidence/stage0/live-listing-result.json`); the `get_schema` consumer search (LEDGER, `evidence/phase-b/sea-rs-pr1-pr2.md`) |
| SWE_SEED packaging run | RELEASE PASS (it was FAILED; fixed in SWE_SEED #14) | `evidence/release/swe-seed-native-candidate.md` ("Resolved 2026-11-06") |
| sea-rs #86 fix, released as v0.4.1 and deployed | **LIVE VERIFIED** (deploy); INTEGRATION PASS (behaviour) | `evidence/release/deploy-v0.4.1.log`: installed sha `b0e9eb9f…`, `KillMode=control-group`, `TimeoutStopUSec=30s`, both services active, `check: ok`. Behaviour: `evidence/release/j02-live-v0.4.1.log` (12/12) and the `cep_settlement` race test. A live crash-orphan drill was not run, because it would mean killing the production gateway mid-settlement. |
| Adversarial: `on_behalf_of` from a non-gateway uid (live) | **LIVE VERIFIED** | `evidence/release/deploy-v0.4.1.log`: the owner ran `evidence/followups/second-uid-probe.py` as the temporary system account `gs-uid-probe` (uid 993, then removed). The deployed v0.4.1 gateway refused it with `identity_delegation_refused` and `no_side_effect: true`, and its journal records the refusal. This replaces the earlier SIMULATED PASS. |

## Reviews

Every merged PR had an independent review: `evidence/reviews/` (Horizon #18, #20 in rounds 1–4, #22; Workbench #29; Cline calibration), and `evidence/pr84/` for sea-rs #84.

## Follow-ups

All resolved: sea-rs #86 (#89, v0.4.1), Horizon #19 (#88, closed as not a bug), Horizon #21 and #24 (#25), Workbench #30 (#31), SWE_SEED (#14). Only the owner's sudo steps are left: `OWNER_SUDO_SESSION.md`.
