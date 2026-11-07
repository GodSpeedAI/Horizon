# Operator's desk v2: build status at pause (2026-11-06, about 21:00)

The work stopped because the usage limit was reached. **Production ready is not yet met.** This file records exactly where things stand.

## Done and committed (Horizon branch `horizon-desk-v2`, not pushed)

- `7cd7707` Stage 0, the test setup: `HORIZON_SETUP`, the setup-init, env, clear, check-empty, health and github scripts, and their tests. Also the design v2, its annex and the review records.
- `bfe5a48`, `ceeb6a2` Annex additions: §J (adversarial tests and seed recipes) and §K (the 14-point production-ready definition).
- `61194c2` Stage 1: the comparison view, labels, Presenting, the workshop adapter, and the timing, capture and scan scripts. The vendored Connect packages are declared.
- **Proof run by the author:** `tsc --noEmit` exits 0. The full `bun test` reported 515 pass, 0 fail and 16 skip before the package fix; `test/app.test.ts` was re-run after the fix with 0 fail. The 41 Stage 0 and 1 tests pass.
- **Real side effects:**
  - `~/.horizon/setups/testing` was created.
  - The private repository `GodSpeedAI/horizon-sandbox` was created.
  - The test board is #2, and sub-issues are confirmed.
  - The `gh` scope `project` was added by the operator.
- The operator's staged deletion of `.cognate/vendor/godspeed-identity-0.1.0-ed6c52a.tgz` is untouched.

## Partly done (uncommitted or failing)

- **Workshop:** worktree `~/projects/cognate-workbench-horizon`, branch `feat/horizon-connect`, commit `dd5f1fe` (WIP). It adds the Connect Horizon action and the session deep link. Typecheck passes, but **3 of 6 new tests fail**. Fix them before merging. The main checkout `~/projects/cognate-workbench` holds only the operator's own work: 22 screenshots that a test run had re-rendered were restored to HEAD.
- **Case keeper:** worktree `~/projects/sea-rs-horizon`, branch `feat/horizon-desk-support`. `external_ref` was added across about 31 `PlanItem` literals. It is **uncompiled and uncommitted**. Still to do: the review marker, the `plan:` preview digest, `dry_run` on `add_item`, the five tests and the protocol doc. CF9 answer: no read verb returns `case:` or `approval:` digests yet. `dry_run` needs a non-committing authority evaluation.

## Not started

- Stages 2–6.
- The `just seed` / `seed-status` / `seed-clear` / `seed-reset` recipes.
- The adversarial test files (§J.1).
- The browser walk-through, the screenshots and the accessibility scan.
- The production clean-start check (§K11).
- The runbook.
- Push and merge.

## Decisions made without explicit operator instruction

- The workshop and case-keeper work is done in separate git worktrees and branches, so the operator's uncommitted work is never mixed in.
- Only exact paths are committed, so unrelated staged and untracked files are left as they were.
- The 22 screenshots in the workshop's main checkout that a test run had re-rendered were restored to HEAD. That matches their state before this session.
- The Hand off preview comes from the case keeper (`dry_run`), not from Horizon.
- The workshop key is issued by a Settings button, not a CLI command.
- The session recorder (`~/.agents`) is left unchanged, so the journey-score row reads "not recorded".

## Next steps, in order

1. Fix the 3 failing workshop tests, then commit.
2. Finish the case-keeper changes: compile one build at a time, test and commit.
3. Stages 2–6, the seed recipes and the adversarial tests.
4. The §K proofs.
5. Push and open pull requests.
