# SWE_SEED native-candidate.yml run: FAILED (recorded and escalated; does not block T1, per design Goal 5)

- Run: https://github.com/GodSpeedAI/swe_seed/actions/runs/42135941820 (workflow_dispatch, ref `feat/native-distribution` @ `dac8eb7`, 2026-11-06T00:19Z). The workflow exists only on that branch, not on `main`.
- Results by job:
  | Job | Runner | Result |
  |---|---|---|
  | build x86_64-unknown-linux-gnu | ubuntu-22.04 | success |
  | build aarch64-unknown-linux-gnu | ubuntu-22.04-arm | success |
  | build x86_64-pc-windows-msvc | windows-latest | **failure** in step "Test workspace", exit code 101 (a cargo test failure); the job log could not be downloaded through the API |
  | build aarch64-apple-darwin | macos-14 | cancelled (matrix fail-fast after the Windows failure) |
  | build x86_64-apple-darwin | macos-13 | **never scheduled**: queued for more than 15 min. The `macos-13` hosted label is most likely retired, so this job can never start. The run was cancelled by the agent at 00:35Z. |
- No SHA256SUMS were produced, because the packaging job needs every build to pass.
- Escalation for the SWE_SEED owner:
  - (1) the Windows workspace tests fail;
  - (2) the `macos-13` runner label must be replaced (for example by `macos-15-intel`, or by cross-compiling x86_64 on macos-14);
  - (3) `actions/checkout@v4` is being forced from Node 20 to Node 24.
- The "Workbench installable" claim stays blocked until a green run exists.

## Resolved 2026-11-06

swe_seed PR #14 was squash-merged into `feat/native-distribution`. The `native-candidate` run 42155885648 at head `1c71936` is green on every job: x86_64 and aarch64 Linux, x86_64 (macos-15-intel) and aarch64 (macos-15) macOS, Windows msvc, and SHA256SUMS.
- Root causes and fixes are in `../followups/swe-seed.md`.
- Independent review: `../reviews/swe-seed-pr14.md`, APPROVE after 2 rounds, and its last 3 minors were closed.
- The packaging run is now **RELEASE PASS** for the candidate branch. The "Workbench installable" claim is no longer blocked by this run.
