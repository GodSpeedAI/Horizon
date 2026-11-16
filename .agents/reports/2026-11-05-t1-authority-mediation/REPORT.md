# T1 Authority Mediation: final report

**Result: T1 is released.** Both product fronts (Cognate Workbench and Horizon) now reach the SEA-Forge gateway only through the Cognate SDK's typed `SeaForgeAuthority` client. Their hand-rolled socket clients are deleted, and a check in each repo fails if one comes back. The approval flow was verified live on the deployed gateway, with SEA-Forge recording the operator as the resolver.

## What shipped

| Repo | Change | Ref |
|---|---|---|
| sea-rs | Case-task approval rename, approval-standing contracts, contracts home, self-resolution refusal (#84, #85, #87) | tag `v0.4.0` (`55bb3937`), deployed |
| cognate | Typed approval list, resolve and closure on `SeaForgeAuthority` (#75) | `0.9.0`, 48 packages published |
| cognate-workbench | Adopts the SDK client; raw helper moved to tests; check against raw socket code (#29) | main `39700cb` |
| Horizon | Two-account gateway, operator identity and inbox (#18); hardened root installer (#20, 4 review rounds); SDK adoption, de-vendor and checks (#22); unused tarball removed (#23) | main `6c7f065` |

## Evidence

See `EVIDENCE_INDEX.md`.
- **LIVE VERIFIED:** the approve, resume and reject roundtrip on the deployed v0.4.0 gateway.
- **INTEGRATION PASS:** correctness, idempotency, adversarial, regression and the cross-version recovery matrix.
- **SIMULATED PASS:** three cases that need sudo or clock control, and the gateway rollback, rehearsed with `--verify-only`.
- **FAILED:** nothing in T1. The only FAILED entry is the SWE_SEED packaging run, which is outside T1 and was escalated.

## Recovery

See `RELEASE_RECOVERY.md`. Each layer can be rolled back on its own: every pairing of front and gateway version passed with real binaries. The previous gateway binary and runtime tree are still in place, next to the current ones.

## Follow-ups: all resolved (2026-11-06)

| Item | Outcome |
|---|---|
| sea-rs #86 (crash orphan) | Fixed in #89 and **released as v0.4.1**. NotDeclared is refused while the command's process group is alive. The gateway unit stops the whole control group (Horizon #26). J02 live passes 12/12 against v0.4.1. |
| Horizon #19 (fail-open fallback) | Not a bug: the engine already fails closed. Pinned by a test in sea-rs #88; issue closed. |
| Horizon #21, #24 | Fixed in Horizon #25. |
| Workbench #30 | Fixed in Workbench #31 (lockstep DomainForge preflight). |
| SWE_SEED packaging | Fixed in SWE_SEED #14. `native-candidate` is green on all 5 targets: RELEASE PASS. |

## Deployed (2026-11-06)

The owner ran `OWNER_SUDO_SESSION.md`:
- v0.4.1 and the new gateway unit are **live** (`evidence/release/deploy-v0.4.1.log`);
- the second-account delegation probe is **LIVE VERIFIED**;
- rollback steps stay in that file.

Estate cleanup is done; see `../2026-11-05-estate-reconciliation/REPORT.md`. One side effect was found and repaired: Workbench PR #2 was closed by a base-branch deletion. LEDGER L-031 has the details.

**Process:** WSL ran out of memory once while suites ran in parallel. From then on, heavy builds and suites ran one at a time.

## Process record

The decision record is `LEDGER.md` (L-001 to L-030). Every merged PR had an independent review, in `evidence/reviews/` and `evidence/pr84/`. The T1 worktrees are retired; every branch is kept on its remote.
