# T1 Task Ledger

Durable state for T1 implementation. On a new session, rebuild state from this file, `design_draft.md`, Git history, and CI — not from conversation memory. Evidence states follow the addendum: NOT TESTED / FAILED / SIMULATED PASS / INTEGRATION PASS / RELEASE PASS / LIVE VERIFIED.

## Session 2026-11-05 (Opus 5.5 lead, Claude Code 2.1.318)

### L-001 · Review validity check — Opus (direct)
- Input: `design_draft.md` v2 (sha256 `bbcc077f…64c4`, snapshot `review-v2/design_draft.v2.reviewed-input.md`), `review/stage-reports.md`, EGM plugin 0.1.0 (`~/.claude/plugins/cache/egm/egm/0.1.0`, `docs/claude.md`, `skills/egm-review/SKILL.md`).
- Finding: the prior five-stage review ran against **v1** (stage-reports header: "dispatched 2026-11-05 against `design_draft.md` v1"). v2 was produced by resolution and **never independently reviewed**. EGM's Claude guide requires Stages 5→9 sequential; the prior record gives no evidence of sequential dispatch.
- Decision: run EGM review on v2, preset "Consolidated report" (uninterrupted; operator directed autonomy), stages strictly sequential, reports in `review-v2/`. Split: no standard boundary header; `## Technical Plan` (line 31) taken as boundary → FeatureRange 1..30, DetailedRange 31..End.
- Isolation note: a context-mode hook injects tool-routing guidance into every subagent prompt, including Goldfish reviewers. It adds no design content or parent deliberation; recorded as a known deviation.

### L-002 · Phase A baseline — Haiku
- Output: `evidence/phase-a/raw/*.txt` + `SHA256SUMS` (sha256sum -c passes). Status: **done** 2026-11-05 14:46Z. Read-only except `git fetch --all --prune`.
- sea-rs: local `docs/egm-bootstrap-readmes` @ `b072ec50`; origin/main `22bf66a3`; workspace version 0.3.0; #79, #81 merged 2026-11-03; **#84 open, #74 (release 0.4.0) open**; local-only branch `settlement-approval-gate`.
- cognate: `security/repo-hygiene-2026-10-31` @ `87333bce` = origin/main; published `@godspeedai/cognate-runtime-bun` latest **0.8.0**; release PR #72 open.
- Horizon: `horizon-cockpit-projection-review` @ `18f0c40` (48 ahead / 1 behind origin/main `3a71fd2b`); #14 merged; **#15 open**; package.json references `./.cognate/vendor/*.tgz`.
- Workbench: `feat/desktop-terminal-browser` @ `96f7fb0` (61 ahead / 6 behind origin/main `f0f27334`), 271 dirty paths (preserve; PRs cut from main per D3); open PRs #28, #27, #2.
- SWE_SEED: native-candidate.yml last two runs cancelled (2026-10-31).
- Env: git 2.53.0, gh 2.103.0 (auth OK), node 26.8.2, bun 1.4.0, rust 1.98.0, npm 12.0.2, just 1.58.0; go not installed (affects casework-go checks).

### L-003 · EGM Stage 5 (Initial Zoom Out) on v2 — egm-zoom-out (inherit)
- Output: `review-v2/zoom_out_report.md` (verbatim). Verdict REVISE: 1 Blocker, 3 Major, 4 Nit. Status: **done**.

### L-004 · Stage 5 resolution → design v3 — Opus (direct)
- Every finding verified against source (`sea-rs origin/main 22bf66a3`, `cognate 87333bce`, `Horizon 18f0c40`, `cognate-workbench 96f7fb0`); record in `review-v2/stage5_resolution.md`. 8 accepted, 0 contested.
- Material design changes (v2 → v3, sha256 `32f47582…6daa6`):
  1. INV-2 strict with zero exceptions. SDK `decide` takes an optional `delegation.onBehalfOf`; Horizon keeps its delegation guards.
  2. Request ids stay deterministic and byte-identical to today's formats (`${caller}:${approvalId}:${resolution}`, `${caller}:closure:${operationId}`). The server binds an id to its payload hash (`lib.rs:2010-2165`), so this keeps dedup across retries, restarts and the upgrade.
  3. `listApprovals()` takes no actor filter (the server has none) and sends the constructor identity; `approvalState` is rebuilt on it.
  4. The `system.get_schema` response change in 0.4.0 is acknowledged; its consumers are in-repo only.
- Proof obligations added to the acceptance table: an Idempotency row, plus real-server delegation cases in the Adversarial row.

### L-005 · EGM Stage 6 (Comprehension) on v3 — egm-comprehension (inherit)
- Input snapshot `review-v2/design_draft.v3.stage6-input.md`. Output → `review-v2/comprehension_report.md`. Status: running.

- Stage 6 done: no Blockers, 8 Major, 6 Nit, all accepted (`review-v2/comprehension_report.md`, `review-v2/stage6_resolution.md`). → design **v4** (sha256 `bd44cbdd…1990`, snapshot `review-v2/design_draft.v4.stage7-input.md`). Key change: rollback is two independent layers, verified because `sea-rs v0.3.0` already serves all three verbs. The Recovery gate becomes a cross-version matrix.

### L-005a · Owner authorization (2026-11-05, user message)
- "i will allow you to run the live approval roundtrip and the gateway deploy, for those you can't posibly do because of technical constraints require me using sudo then give me the command to run when the time comes, other than that, you are allowed todo it all yourself using your best expert judgement"
- Effect: the agent runs every unprivileged step of the live roundtrip and the deploy. `sudo` steps are handed to the owner as exact commands at the time they are needed. Supersedes L-005b's "owner-blocked" wording.

### L-007 · EGM Stage 7 (Critic) on v4 — egm-design + egm-structural + egm-style, parallel within the stage
- FeatureRange 1-84. Output: `review-v2/critic_report.md` (+ `critic_structural_raw.md`, `critic_style_raw.md`). All three reviewers completed; 10 Major, 24 Nit; resolved in `review-v2/stage7_resolution.md`. Status: **done**.
- Design **v5** (sha256 `606b1c94…c1ed1`, snapshot `review-v2/design_draft.v5.stage8-input.md`). New proof obligations:
  - `listApprovals` reads with a separate bound, `maxListBytes` (8 MiB), and fails closed above it.
  - A golden `approval-standing.json` fixture is the single contract; sea-rs asserts against it, and the SDK checks its copy by sha256.
  - Workbench gets teeth.
  - The identity tarball gets an override, gated by an additive diff, a single installed copy, and identity tests.
  - SWE_SEED red runs do not block the release; they are escalated.

### L-008 · EGM Stage 8 (Intermediate Zoom Out) on v5 — egm-zoom-out
- Output → `review-v2/intermediate_zoom_out_report.md`. Status: running.

### L-005b · Stage 0 feasibility — Opus (direct)
- `Horizon/docs/gateway-runbook.md` and `.agents/reports/2026-11-03-settlement-live-roundtrip-runbook.md`: the gateway apply, the restart and the rollback need `sudo`/`systemctl`. The runbook bars agents from running them.
- Consequence: the agent can produce at most INTEGRATION PASS, using a real SEA-Forge binary spawned unprivileged (`SEA_FORGE_SERVER_BIN`) and real SDK/front code. **LIVE VERIFIED** for the roundtrip (Stage 0 and at the tag) and the D2.5 gateway deploy are **owner-blocked**. They will be prepared as an exact owner checklist with the stage digest, and gates that depend on them stay open until the owner runs them.

### L-006 · Estate reconciliation (operator addendum, 2026-11-05) — separate workstream
- Report dir: `Horizon/.agents/reports/2026-11-05-estate-reconciliation/`.
- Ordering rule: the inventory and additive recovery refs run now. Merging, branch or worktree deletion, and PR closure wait until T1 implementation and release complete, so active work is not disrupted.
- Inventory: Haiku, read-only. Status: running.

### L-008 (closed) · Stage 8 result
- 1 Major (owner ratification E-4) + 6 Nits; resolved in `review-v2/stage8_resolution.md`. Design **v6** (sha256 `84b48b52…75da`). Status: **done**.

### L-006 (update) · Estate inventory + checkpoint — Haiku
- Inventory: `inventory/summary.tsv` (101 rows; 63 in scope). Status: **done**.
- Checkpoint: 63 worktrees across 31 common dirs; refs CREATED 15 detached + 168 head + 16 stash, none EXISTS/FAILED; per-dir `for-each-ref` counts match the manifest. 8 WIP snapshots (`git stash create`, unstored-but-referenced) and 6 untracked archives (1,205,890 bytes; member counts verified). Working trees unchanged: 63/63 before/after equal. Non-additive operations: none.
- Gap: cognate-workbench untracked files (231 files, ~963 MB, mostly `dist-package/` build zips) were SKIPPED_TOO_LARGE (>500 MB cap). They are build output, not source; they stay untouched in the working tree and are never deleted by the cleanup phase without the owner's say. Status: **done**, one recorded gap.

### L-009 · EGM Stage 9 (Implementation Readiness) on v6 — egm-implementation-readiness + egm-codebase-details + egm-style, parallel within the stage (models: inherit)
- Raw outputs: `review-v2/ir_readiness_raw.md` (FAIL), `review-v2/ir_codebase_raw.md` (FAIL), `review-v2/ir_style_raw.md` (3 Majors). Merged: 5 Blockers, 12 Majors, 22 Nits. Resolution: `review-v2/stage9_resolution.md`.
- The readiness report was recovered verbatim from the session transcript after a context compaction; all 16 findings are present.
- Design **v7** (sha256 `bcdbc131…88a1`, snapshot `review-v2/design_draft.v7.stage9-reaudit-input.md`).
- Owner addendum "Strategic Architectural Freedom" received mid-stage (2026-11-05). Applied as: Blockers fixed by the smallest change that reuses an existing mechanism. Design decisions:
  - **DD-1** `requestIdPrefix` optional, `not_configured` fail-closed where it matters.
  - **DD-2** per-method actor table; the only wire change is an explicit actor on listings (R9).
  - **DD-3** the new methods return the SDK's existing Result shape, never throw.
  - **DD-4** the row type is the 11 wire keys, which is Horizon's `parseApproval` moved into the SDK.
  - **DD-5** one Horizon approvals client on `closureSocket`, with per-call timeouts.
  - **DD-6** delegation through an injected `Pick<SeaForgeAuthority,"decide">`; the `send` seam is deleted.
  - **DD-7** the teeth regex rule is verified against heads, with zero false positives.
  - **DD-8** RealityTrace swap descoped (the SDK port is not equivalent).
  - **DD-9** preflight item dropped: REQ-NAV-006 is already met at `app.ts:984` (since #5).
  - **DD-10** casework-go Go identifiers not renamed: no wire effect, and no Go toolchain here.
  - DD-8 and DD-9 are added to owner ratification E-4 (c).
- Re-audit (the one permitted): egm-implementation-readiness + egm-codebase-details on v7, model **sonnet**. Status: running.
- Re-audit result: readiness PASS; codebase FAIL on one shared Major (N1, delegation client wiring), fixed in place with 6 Nits. Orchestrator verified the sea-rs `origin/main` references the reviewers could not reach. Design **v7.1** (sha256 `8b495c30…65ecd4`, snapshot `review-v2/design_draft.v7.1.final.md`). **Stage 9 closed: PASS. EGM review of the revised design complete (Stages 5→9, sequential).**

### L-010 · Pre-implementation findings (orchestrator, read-only)
- **Gateway down since boot 2026-11-03 15:41.** `godspeed-sea-forge.service` exits 226/NAMESPACE: `/run/godspeed-sea-forge` does not exist (tmpfs; the installer creates it once with `install -d`, and the unit has `ReadWritePaths=/run/godspeed-sea-forge` but no `RuntimeDirectory=`). `godspeed-horizon.service` is inactive (Requires the gateway). sea-rs's own `deploy/systemd/sea-forge-server.service` uses `RuntimeDirectory=`. Consequence: the gateway cannot survive a reboot; Stage 0 cannot run live until the fix is applied. Fix belongs in D2 step 5 (deploy). It is a prerequisite and is in T1 scope.
- **Merge gates.** sea-rs `Protect main`: squash only, linear history, required checks `gate` and `conventional-commit`, review threads must be resolved, 0 approving reviews required, no bypass actors. cognate `Protect Main`: CodeQL and code-quality thresholds, no fast-forward. cognate-workbench: ruleset disabled. Horizon: protection API unavailable on the plan. #84 is BLOCKED only on unresolved review threads (all CI checks green).
- Open: Horizon #15 is DIRTY (conflicts); cognate #72 is an open release-please PR (pending content to inspect before 0.9.0).

### L-011 · Gateway boot defect fix — Opus (direct)
- Horizon PR **#16** `fix/gateway-socket-dir-at-boot` (`374b58e`, worktree `../Horizon.wt-gateway-socket-dir`, from `origin/main` `3a71fd2`): the gateway unit gains `ExecStartPre=+/usr/bin/install -d -o <gw> -g <sock> -m 0750 <socketDir>`. `RuntimeDirectory=` was rejected because it would lose the `godspeed-sock` group.
- Evidence: `test/gateway-setup.test.ts` 55/55 pass; mutation (step removed) → exactly the new test fails (54/1); `systemd-analyze verify` on the scratch-rendered unit is clean; uutils `install -d -o -g -m` probed and idempotent. Installed binaries present (`sea-forge-server` sha256 `9d2487cd…`). State: **SIMULATED PASS** until the owner applies it, then LIVE.
- Owner action requested now (one-off recovery for Stage 0): recreate `/run/godspeed-sea-forge` and start both services. The durable unit lands with the next installer apply (the 0.4.0 deploy), so the owner runs `sudo` once more, not twice per fix.

### L-012 · Phase C start — D1 Cognate SDK — Sonnet (`sonnet-implementer`), background
- Worktree `cognate.wt-t1-sdk`, branch `feat/t1-authority-mediation` from `origin/main`. Proof obligations: the design's Correctness / Idempotency / Negative-states SDK rows, plus 4 named mutations. No push until the orchestrator review and an independent Sonnet code review. Evidence → `evidence/phase-c/d1-implementation.md`. Status: running.
- **D1 result:** commit `2362bd7` (cognate `feat/t1-authority-mediation`, not pushed). runtime-bun 191→225 pass, 17 skip, 1 pre-existing fail (`service-postgres.test.ts` needs `pg0`, unchanged); typecheck clean; `bun run check` + `tests/proof-routing.test.ts` pass; full `just verify` not run (needs db-up). 4/4 named mutations caught. Fixture copy sha256 `5a263f8b…6f06`. State: **SIMULATED PASS** (scripted socket).
- **Deviations reviewed by orchestrator, all accepted:**
  1. Size limit counts the line plus its newline (existing `exchangeOnce` semantics kept).
  2. `listTransitions` sends no actor: the design table was wrong; design corrected.
  3. `authorityClosure` validates `b`/`c` numbers, `committed_at` string and `on_time` bool strictly. Safe: the server's `ClosureAck` is `u64`/`u64`/`String`/`bool` (`obligation.rs`, `cep_authority.rs:328-338` on origin/main).
  4. `invalid_input` is checked before `not_configured`.
  5. Internal `MalformedResponseError`: non-JSON maps to `malformed_response` in the new methods; the old messages are kept and the classes are not exported from the index.
  6. `approvalState` requires a fully parsed row: fail-closed, acceptable.
  7. The scripted-socket fixture lives in the test file.
- Next: independent code review (Sonnet, fresh context).

### L-013 · Owner decisions (2026-11-05, user message "yes to all")
- E-4 (a) SWE_SEED non-blocking, (b) zero `src/` exceptions, (c) RealityTrace swap deferred, (d) preflight item dropped as already met: **ratified**.
- E-1: no named human reviewer; independent agent review + CodeRabbit + CI per PR; the owner reads the release summary.
- Gateway: the owner ran the one-off recovery. `godspeed-sea-forge` and `godspeed-horizon` are **active**. The agent is denied the socket directory, as designed.
- D1 review round 1: `bb02a05`, orchestrator re-ran 231 pass / 17 skip / 1 env fail (pg0); guards present at both delegation paths. Re-review requested.
- D1 re-review of `bb02a05`: **APPROVE** (`evidence/phase-c/d1-code-review.md`). Residual nit: the service-identity check is an exact string match; the server identity check remains the backstop. Accepted.
- Cognate PR **#75** opened (`feat/t1-authority-mediation`, 2 commits). Merging it does not publish anything; 0.9.0 is published when release-please PR #72 is merged later in D5.

### L-014 · DD-11: #84 decoupled from the T1 critical path — Opus decision
- Fact: #84 now has 4 unresolved threads (3 Major, 2 rated heavy-lift: post-start SWE_SEED failure releasing the lease; the CLI approve resolver identity; a denied-resolver no-side-effect proof) plus 1 Minor (audit records written by concurrent losers). All are settlement work, unrelated to T1.
- Decision: Stage 0 no longer waits for #84. #84 must simply not be inside 0.4.0 unless it is merged with its threads resolved. A Sonnet agent fixes it in parallel in `sea-rs.wt-pr84`; the orchestrator reviews, replies and merges.
- Rationale (redesign addendum, "bound"): gating T1 on unrelated concurrency work delays the train without improving T1 correctness.

### L-015 · Stage 0 integration run — in progress
- `sea-rs.wt-t1` at origin/main `22bf66a3`: release build of `sea-forge-server` (background). Next: Horizon `J02-live` with `SEA_FORGE_SERVER_BIN` + `REALITYTRACE_BIN` (escalate → approve, reject, resume; unprivileged spawned server) → INTEGRATION PASS at heads.
- Live gateway leg: reaching the socket requires the `godspeed-sock` group (the runtime account). The agent is denied it by design, so the LIVE leg needs one owner-run `sudo -u godspeed-horizon` command; it will be prepared as a single script.
- **Stage 0 integration result.** sea-forge-server built at origin/main `22bf66a3` (sha256 `7d3296aa…6a9e`). Horizon at origin/main `3a71fd2`: `J02-live` + `J02r2-live` first ran 4 pass / 8 fail. Cause: a pre-existing rig defect (`j02r2-rig.ts:161` passed the bare `"operator"`; `seaForgeActorOf` requires `actor:<id>` since `927fc99`; the suite is normally skipped). Fixed in Horizon PR **#17**. After the fix: **12 pass / 0 fail** → **INTEGRATION PASS** at heads, covering escalate → approve, reject, resume, settlement and closure. Log: `evidence/stage0/j02-live-at-heads.log`.
- Containment check: the login running the probe gets `EACCES` on the live socket, as designed.
- **LIVE leg (owner):** `evidence/stage0/live-listing-probe.ts`, staged at `/tmp/t1-live-listing-probe.ts` (sha256 prefix `6d5a1a2b…`). Read-only `authority_approvals` as `cognate-service`; prints counts, sizes and a state histogram only. Pending the owner's run. The live approve/reject/resume leg is done at the 0.4.0 tag (Goal 5, run 2), where the deployed binary is the one under test.
- Note for estate: local branch `horizon-cockpit-projection-review` tracks origin and carries 11 commits not on `main`, including `18f0c40`, which D4 depends on. These must reach `main` (via #15 or a PR) before the D4 Horizon adoption branches.
- **Stage 0 LIVE listing (owner-run, 2026-11-05T16:12:29Z):** first run failed through a probe defect (my own: `s.end()` fired `close()` before the answer was kept); fixed, tested against fake servers that close after answering and that stay open, re-staged (sha256 prefix `8015fec7…`). Second run: `ok:true`, rows 0, response 26 bytes → `evidence/stage0/live-listing-result.json`. **LIVE VERIFIED**: the deployed gateway (binary `9d2487cd…`) serves `authority_approvals` to the runtime actor `cognate-service`. R6 headroom: the listing is empty today, so the 8 MiB bound is not near.
- **Stage 0: complete.** INTEGRATION PASS (J02 12/12 at heads), LIVE VERIFIED listing. The #84 gate is removed (DD-11).

### L-016 · Phase B start + review routing
- Running in parallel:
  - D2.1 + D2.2 (sea-rs PR1 contracts home, PR2 rename-apart + golden fixture): **Sonnet**, `sea-rs.wt-t1`.
  - D2.3 lineage map of `settlement-approval-gate`: **Haiku**, read-only.
  - #84 fixes: **Sonnet**, `sea-rs.wt-pr84`.
- Review routing found:
  - Horizon is on CodeRabbit Free, which writes summaries only and does not review code. Every Horizon PR therefore gets a fresh-context Sonnet reviewer. #16 and #17 are under review.
  - Cognate #75: CodeRabbit's review failed to post during a GitHub outage ("4 inline comments" lost). Re-requested with `@coderabbitai full review`. #75 is not merged until those findings are read.

### L-017 · Blind-reviewer calibration, PR #85, #75 review fixes
- **opencode free models** (`deepseek-v4.1-flash-free`, `glm-5.3-flash-free`): **not capable**. A calibration review timed out or returned empty, even on a 2 KB diff, with both the `build` and `plan` agents.
- **Cline CLI 3.0.68 (owner's Cline Pass)**:
  - Settings: run in plan mode with `--auto-approve false`, cwd set to the scratchpad, diff given inline, no tools.
  - Calibration diff: the `sea-forge-authority.ts` diff of `2362bd7` (known Major: service identity accepted as `on_behalf_of`).
  - Result: **capable**, with 10 findings. Evidence: `evidence/reviews/cline-calibration-2362bd7.md`.
    - It found the known Major (#2).
    - Two more true findings had already been found by the Sonnet review and fixed in `bb02a05`: #1 delegation not validated, #9 timeoutMs not validated.
    - #3 (`listApprovals(null)` throws) matched CodeRabbit's later finding.
    - Rejected:
      - #5: a missing `resolved_by` is excluded by design (D1 parse rules).
      - #7: the server refuses a reused id with a different payload (`request_id_reused`), so it is not silent.
      - #10: the limit is in UTF-16 code units by design.
  - Use: an extra blind reviewer next to the Sonnet reviewer, not a replacement. Its findings are verified before acting.
- **Cognate #75**:
  - CodeRabbit's full review gave 2 Minors; both are valid and fixed in `ec7c38f`:
    - `listApprovals(null)` now returns invalid_input; a test was added.
    - The `maxResponseBytes` doc now names the listing cap.
  - Both threads are answered and resolved.
  - Fixture copy now equals the sea-rs bytes (`1e2ea00`, sha256 `a11a1733…`).
  - runtime-bun authority tests 58/58; tsc clean.
- **sea-rs PR #85 (D2.1)** opened after the orchestrator review:
  - It is a pure `git mv`. Every live reference is re-pointed, and the new get_schema path test exists.
  - No reference to the old path, and none to `PendingApproval`, exists in cognate, cognate-workbench or Horizon.
  - PR2 (D2.2, `5d1338c7`) has also passed orchestrator review. It is opened after #85 squash-merges, rebased onto main, because a stacked PR would conflict after the squash.
- **#84**: independent Sonnet review and blind Cline review running.

### L-018 · #75 merged; #84 blind review triage
- **Cognate #75 squash-merged** → `bb692b3b` (head `ec7c38fd`, merge state CLEAN, all checks green, CodeRabbit threads resolved). D1 is on Cognate main. The 0.9.0 release (release-please #72) stays queued until after the sea-rs 0.4.0 deploy.
- **sea-rs #85**: `verify (macos app sandbox jail)` was **cancelled at 15m03s** (a job timeout, not a test failure). main's last 5 runs of the workflow are green. Re-ran the failed job.
- **#84 blind Cline review** (`evidence/pr84/cline-review.md`), triaged by the orchestrator against the code:
  - **#2 VALID (Major):** `resolve_uncertain_settlement_at` (`cep.rs:3159`) never refuses `resolver == record.actor_id`, while `resolve_approval` refuses with `self_approval_refused` (`cep.rs:1239`). Fix: the same refusal, audited.
  - **#3 VALID (Minor):** the create-once audit record is written before `complete`/`release`. If the close is fenced (the worker completed first), the audit names a resolution that never took effect. Fix: close first, then audit; or an outcome record.
  - **#9 VALID (Minor):** the `resume.rs` comment still says lapsed-lease reconciliation settles the claim.
  - **#1 known limit:** a detached grandchild that outlives the process-group kill. The lease bound already names it ("authority call bounded by the descriptor timeout"). The NotDeclared path needs an operator attestation after the lapse. Record it in Limits; no code change.
  - **#4 not introduced here:** the CLI builds an operator from `--actor`, exactly as the existing `approve` CLI does (`approve.rs:174`). The local CLI trust model is unchanged.
  - **#5 not introduced here:** `resolve_approval` also sends `required_approver_roles: []` and `case_id: "cognate"`. The parameters mirror the approval path.
  - **#6/#7 fail-safe (Minor):** an unsent call is held for an operator rather than released. Record in Limits.
  - **#8 Minor:** the `--declared` ref is not checked against the ledger. Candidate fix if cheap.
  - **#10 Minor, cross-repo:** the Horizon renderer and the sea-rs policy fixture are not tied by a test. Follow-up.
- The Sonnet reviewer stopped on the 5-hour usage limit; resumed after the reset. The fix round waits for its report, so that both reviews feed one change.

### L-019 · CI glitch, hook switch, #85 merged, #84 fix round 2, #87 opened
- **GitHub glitch (16:43–16:56 UTC):** `pull_request` runs failed at startup ("workflow file issue"). Reruns repeated it, because they replay the old event. The run page showed a GitHub internal error, and githubstatus said all operational. A manual `workflow_dispatch` started fine. **Fix:** close and reopen #85, which sends a fresh event. All runs started. Not a bypass: the required checks ran for real on the same SHA.
- **Hook switch (owner request):** context-mode's PreToolUse Agent injection rewrites every Agent prompt after the auto-mode review, and the classifier refused twice. I added a flag-file guard in `~/.agents/tooling/node_modules/context-mode/hooks/core/routing.mjs` (the copy that runs) and in the plugin cache copy. While `~/.claude/context-mode-agent-injection.off` exists, the Agent prompt is left unchanged. Delete the file to restore. A context-mode upgrade overwrites the edit. Tested both ways; Bash routing is unaffected.
- **#85 squash-merged** → `b94e810a` (gate + conventional-commit pass, 0 threads).
- **#84 fix round 2** (Sonnet): `7126613d`, `81f5ce98`, `58b8a662`. Evidence: `evidence/pr84/fix-round-2.md`.
  - Self-resolution is refused (`self_approval_refused`, audited, before policy).
  - The claim is closed first, and the audit is written only after the close.
  - A CLI m8 test kills M2, and a server unit test through the policy command seam kills M1.
  - 993 pass; clippy and fmt clean. The orchestrator reviewed the cep.rs diff: OK. The doc-hidden test hook runs after every check, so it cannot skip one.
- **#84 CodeRabbit round 2:**
  - Two Minors fixed in `e3ff3b95` (Haiku): `#[cfg(unix)]` on `class_of`, and a complete status snapshot.
  - The Major, a SWE_SEED orphan after a server crash racing an operator NotDeclared, is **accepted as a documented limit**: the PR strictly narrows the window compared with main. Follow-up issue **#86**.
  - All 3 threads replied to and resolved.
- **#84 conflicted with main** on the status files (both had a revision 213). Merged main into the branch (`7ead22b2`, no rebase or force). Main's 213 is kept as 223, and 224 is a complete #84 snapshot. cep_settlement 76, conformance_sfwp 20, m8 7 pass. Now MERGEABLE.
- **PR2 → #87:** `5d1338c7` cherry-picked onto a fresh branch `t1/case-task-approval` from main after #85's squash (old branch kept). conformance_sfwp 20, fixture 2, contracts gate clean.

### L-020 · #84 + #87 merged, v0.4.0 cut, Horizon reconciled (#18)
- **#84 round 3** (Haiku, `a7791c9e`), reviewed by the orchestrator. 4 CodeRabbit threads resolved:
  - Unix-only test gates.
  - An empty `--declared` ref or `--not-declared` evidence is refused before any ledger read.
  - Two doc comments corrected (lease is a time bound, see #86; close-then-audit).
- **#87 squash-merged** → `1fe00c9c`. 10 code-quality threads on AJV-generated validators were answered as generated code (the drift gate requires byte equality with the generator) and resolved.
- **#84** conflicted again on the status files. Main merged in again (`28c4775b`, main's rev 214 kept as 226, rev 227 is the snapshot). gate pass, 0 threads → **squash-merged** `bdb42a52`.
- **Release PR #74:**
  - The bot-authored PR's workflows were `action_required`; I approved the 6 runs (the checks then ran for real).
  - gate + conventional-commit pass, 0 threads → **squash-merged** `55bb3937` → **tag `v0.4.0`** at `55bb3937`.
  - It includes #84, so the deployed gateway gets the safer claim handling.
- **DD-12 · Horizon deploy source (Opus).**
  - **Problem:** the deployed runtime was staged from `horizon-cockpit-projection-review`. That branch lacks #16 (socket-dir ExecStartPre; without it the gateway dies on reboot), and main lacks the branch's post-#14 work. Staging from either side alone regresses something.
  - **Decision:** merge main into the branch (`e9a29a0`):
    - The 4 add/add conflicts were resolved to the branch side.
    - #16 re-applied; #17 clean.
    - #15's single unique commit cherry-picked (`781231e`): external settlement declarations require approval. The rendered policy is **byte-identical** to the sea-rs v0.4.0 fixture `horizon-gateway-policy.yaml`.
  - Pushed as a fast-forward to `horizon-cockpit-projection-review`. **PR #18** opened against main; #15 marked superseded.
  - The deploy stages from `781231e`.
- **Clean-install defect found:** bun's global cache entry `~/.cache/.bun/install/cache/@T@112e8148e4e7c606@@@1` (keyed by the tarball path) held the pre-81c201c identity package with dotted collection names. A clean install therefore failed 36 remote and session tests. The owner's checkout passed only through its existing node_modules. Removing that cache entry fixed it: 477 pass, 0 fail. **Release-recovery note:** any fresh install must clear or bypass that cache entry; the stage step must be checked for it.
- **#18 review:** a fresh Sonnet reviewer is running (identity, gateway installer trust, policy, inbox). The owner's sudo step waits for its verdict.

### L-021 · v0.4.0 deployed; live round-trip LIVE VERIFIED
- **Owner decision:** deploy now and fix the installer gaps next (the #18 review's M1/M2, already present in the running deployment; this stage was checked clean first: 0 unlisted files, 0 unexpected symlinks).
- **Deployed by the owner:**
  - Installer apply (stage `6b235e6a…`, binary `2e755e82…` = v0.4.0, bun verified).
  - The new unit with the `ExecStartPre` socket-dir line is live.
  - Policy adopted from the generated render after a diff showed exactly the 2 external-settlement approval rules (sha256 `08c84612…`; previous kept as `policy.yaml.previous-20261105T224530Z`).
  - Both services active. `--check` ok as root and as the login; the login is still denied the socket.
- **INTEGRATION PASS at the tag:** J02-live + J02r2-live **12/12** against the v0.4.0 binary (needs `HORIZON_BWRAP`; without it 8 skip). Log: `evidence/release/j02-live-v0.4.0.log`.
- **LIVE VERIFIED**, through the deployed gateway and runtime:
  - **Approve and resume:**
    - A temporary one-line `requires_approval: true` on navigation-commit, reverted after (sha256 back to `08c84612…`).
    - The owner made commits in the cockpit and approved them. 3 approvals are `used`, requester `cognate-service`, resolved_by `operator`.
    - SEA-Forge records the human operator, not the service. Evidence: `evidence/release/live-roundtrip-result-1.json`.
  - **Reject:**
    - The 2 left-over pending approvals were rejected with `live-reject.ts` (as the cockpit sends it: service actor on behalf of `operator`). Both are now `rejected` and resolved_by `operator`.
    - Evidence: `evidence/release/live-roundtrip-result-2-reject.json`.
    - The cockpit's own Reject button was not exercised live: the integration test covers it.
- **UX finding:** the owner found the cockpit approval flow confusing and may not have used it correctly. Follow-up for the Horizon adoption (D4) work.
- **Runbook open item closed:** "live approve and reject round-trip … confirm SEA-Forge records the operator identity".

## L-022 · 2026-11-05 · PR #20 round 2 and D3 started
- Cognate `0.9.0` is on npm (release PR #72 → `bcef6637`).
- PR #20 fix round 2 dispatched (Sonnet): the Cline Majors #1, #2 and #4, minors #5–#10, and Sonnet's m1–m5. Cline #3 (mode bits) is downgraded to hardening: every install row sets an explicit `-m`, and the runtime tree is normalised to 0755/0644 after `cp -a`.
- D3 started in a new worktree, `cognate-workbench.wt-t1`, on branch `t1/sdk-adoption` from origin/main `f0f2733`. The owner's checkout (`feat/desktop-terminal-browser`, dirty) is untouched.

## L-023 · 2026-11-05 · PR #20 round 2 re-review → round 3
- Round 2 (`97c83ad`, `010b7ad`): 508 pass, 0 fail. Cline Majors #1, #2 and #4 are confirmed fixed by an independent Sonnet re-review (`evidence/reviews/horizon-pr20-round2.md`).
- New **Major**: root took the owner, group, mode and destination of each plan row from the agent-written `plan.tsv`, and the dry-run prose hid it. Decision: a fixed root-side table for each step kind. Plan rows only select entries from it, and any difference is refused. Round 3 was dispatched, together with m2–m7.
- The deployed v0.4.0 install was made from a stage built in this session and approved by digest. This finding is a hardening gap in the installer and does not mean the deployed gateway is compromised. Post-merge check: run `--verify-only` against the live stage.
- Cognate v0.9.0: release run 42128568352 succeeded (48/48 jobs); all Workbench dependencies resolve at 0.9.0. D3 was resumed.

## L-024 · 2026-11-05 · PR #20 round 3 → round 4; D3 PR open
- Round 3 (`e7ce6b8`, 511 pass): a fixed `PLAN_TABLE` closes the round-2 Major for every row the table check sees. The re-review then found **R3-1 (Major)**: an unterminated last plan line is skipped by `while read` but still read by two `awk` lookups (runtime account, socket group). The reviewer reproduced a substituted uid and gid rendered into server.yaml. **R3-2:** the `|` join lets fields merge.
- Decision (class fix): parse the snapshot plan once into validated rows (trailing newline, no CR, `|` or NUL, exact field counts, tab-preserving table equality); no other reader of `plan.tsv`. m4: stop carrying ACLs (`--preserve=mode` includes them). m7: a stage marker file gates `resetStageDir`. Round 4 dispatched.
- The INSTALLER_TEST_* seams are confirmed inert as root and under `--authorize-privileged` (refused at lines 109 and 112, plus per-seam uid checks).
- D3: Workbench PR #29 is open (4 commits). Test results:
  - Baseline: 1170 pass, 12 skip, 230 fail.
  - After: 1172 pass, 12 skip, 230 fail. The failing names are identical before and after.
  - Mutation: caught.
- The live J-SEA-FORGE-AUTHORITY test fails identically on baseline and PR #29: `cep_world_refused: unknown world`. It is pre-existing, and the CLI-version skew was ruled out. Diagnosis has been dispatched; PR #29 merges only after the live tests pass.

## L-025 · 2026-11-05 · #20 and #18 merged; production stage re-verified; #29 approved
- PR #20 round 4 (`82d587d`) was **APPROVED** on re-review. Its minor R4-1 (a required set rather than a whitelist) became Horizon issue #21: making the table strict breaks the 10-row test fixtures, and the reviewer showed there is no route across the root boundary. #20 was squash-merged into the #18 branch as `03a57da`.
- PR #18 was gated at its head `03a57da` (check ok, boundaries ok, 514 pass, 16 skip, 0 fail), then squash-merged to main as **`94748dc`**. PR #15 was closed as superseded; its branch is kept as a recovery reference.
- Production stage re-verified. The old stage was moved, not deleted, to `~/.cache/godspeed/gateway-stage.deployed-v0.4.0-20261105T224530Z` (digest 6b235e6a…). The stage was rebuilt from main with the new stager, digest `57bad1e574e12a87de4f120b686b622d0b6934ec7341f0117c9e467da475ab1a`. The new installer's `--verify-only` returns ok, so the fixed `PLAN_TABLE` matches the production layout. `--bun` must be the resolved path, not the `~/.local/bin/bun` symlink.
- D3 live-test root cause: the world ref digest includes `producer_version`. The CLI is at 0.21.2 while the server is built on core 0.21.1. With a 0.21.1 CLI, J-SEA-FORGE-AUTHORITY and J-SW01 give 2/2 on both the baseline and #29 (**INTEGRATION PASS** for D3). Filed as Workbench issue #30.
- Side finding for D4: Horizon `PINNED_WORLD_REF` (0a10c20d…) differs from what either CLI computes for the current `domain/`. J02 and the live roundtrip still pass; to be checked in D4.
- #29 review: **APPROVE**, with 4 minors. Minor 3 (the teeth test could pass vacuously) is fixed in `7f89b84`; the mutation is caught. Minors 1, 2 and 4 are accepted (per spec, or no consumer). CI pending.
- D3 merged: Workbench #29 squash-merged after CI green (verify, clean-install x2, arm64 x2) at head 7f89b84.

## L-026 · 2026-11-05 · D4 PR open
- Horizon PR #22 (`t1/sdk-adoption`, branched from main `94748dc`) has 4 commits, each green on check, test and boundaries:
  - de-vendor + single-cognate check (`12b9a8a`)
  - config move (`e58434d`)
  - SDK adoption (`1c1f51f`)
  - teeth (`7228224`)
- Unit: 514 → 511 pass, 16 skip, 0 fail. The 3 removed tests are the `parseApproval` and non-array cases, now covered by the cognate SDK parity suite.
- J02 live against a local v0.4.0 server: 12/12 at baseline and after (**INTEGRATION PASS**).
- Mutation: a raw `Bun.connect` in `src/app.ts` fails both boundaries and `teeth-inv2-mutation`.
- Pin finding resolved: `PINNED_WORLD_REF` (`0a10c20d…`) is the `semantic_closure_hash` checked by `loadWorld`, and it matches what `scripts/world-ref.py` gives for the current `domain/`. The earlier "differs" note compared a different field. The pin is not stale.
- Open item: the implementer's `git rm` of `.cognate/vendor/godspeed-identity-0.1.0-ed6c52a.tgz` (unreferenced) was blocked by the permission classifier. I did not perform it on the agent's behalf; it goes to the owner.
- Independent review of #22 dispatched.

## L-027 · 2026-11-06 · D4 merged; WSL OOM; SWE_SEED recorded
- PR #22 fixes (`f5ead45`..`7316b6e`): nested single-cognate check, a `.tsx` mutant, NOTICE, and wire-byte equality tests for decide, resolve and list against the pre-migration format. Gates: check ok, 518 pass, 16 skip, 0 fail, boundaries ok, 4/4 mutants caught, single-cognate ok. Squash-merged as Horizon main **`ed69e8c`**. D4 is done.
- **WSL crashed, most likely out of memory** (7 GB RAM total). Phase F ran two full Workbench suites while a Horizon `verify` was running. New rule from the owner: one heavy build or suite at a time, with RAM checked first (saved as memory `one-compile-at-a-time`). Phase F was resumed serially. Partial results kept: the v0.3.0 server sha `4540aa96…`, plus 5 logs. The HZ live cells showed 4 pass and need re-running with `HORIZON_BWRAP`.
- SWE_SEED `native-candidate.yml` run 42135941820: **FAILED**. Windows tests failed with exit 101; the `macos-13` runner never scheduled. Recorded in `evidence/release/swe-seed-native-candidate.md` and escalated to the owner; per Goal 5 it does not block T1.
- `.cognate/vendor/godspeed-identity-0.1.0-ed6c52a.tgz` is still on main and unreferenced. Removing it is the owner's decision (the classifier blocked it).
- RELEASE_RECOVERY.md written; gateway rollback rehearsed with --verify-only against the previous binary 9d2487cd… (SIMULATED PASS).

## L-028 · 2026-11-06 · Phase F complete; evidence indexed; T1 worktrees retired
- Phase F (`evidence/phase-f/MATRIX.md`): every cross-version cell, revert cell and `087fecc` test is INTEGRATION PASS with 0 skips. The adversarial harness gave 14 integration cases. Three cases are SIMULATED PASS: the unknown-identity self-approval (a pure function), the non-gateway uid (server unit test), and the expired standing (sea-forge-authority expiry unit tests, because of the 1-hour TTL floor). There are 0 FAILED and 0 NOT TESTED.
- Regression: sea-rs v0.4.0 `conformance_sfwp` 20/20 and `approval_standing_fixture` 2/2. Cognate `events` and `runtime-api` 0.8.0 → 0.9.0 change only docs and the version.
- Release evidence: the v0.4.0 `SHA256SUMS` was saved and the tag digests recorded. `EVIDENCE_INDEX.md` was written. Horizon #24 was filed for the cockpit UX.
- The v0.3.0 server binary was kept at `~/.cache/godspeed/bin/sea-forge-server-v0.3.0` (sha `4540aa96…`).
- T1 worktrees removed with `git worktree remove` (no force). All were clean, and every branch head is on its remote and merged. The 13 worktrees: Horizon.wt-{f-adopt,f-pre,f-revert,d4,installer,reconcile}, cognate-workbench.wt-{f-adopt,f-revert,base,t1}, sea-rs.wt-{v030,t1}, cognate.wt-t1-sdk. The scratch revert commits `222e901` (Horizon) and `6e7ba40` (Workbench) were evidence only and can be reproduced with `git revert`. Local and remote branches are kept.

## L-029 · 2026-11-06 · Follow-ups resolved (owner: "do the stuff you left for me … resolve them too")
- Horizon #21 and #24 were fixed in **#25** (`da683e0`) after 2 review rounds (APPROVE). Result: 536 pass, 16 skip, 0 fail; verify ok.
- Horizon #19 was verified as **not a bug**. At v0.4.0, `matches_settlement_authority_class` fails closed on a missing or unknown class. The issue stays open until the pinning test in sea-rs lands.
- Workbench #30 was fixed in **#31** (`74601f3`), which adds a lockstep DomainForge preflight and pins `setup-domainforge` to 0.21.1. Live run: 2/2.
- SWE_SEED **#14**: `native-candidate` is green on all 5 targets (run 42153072929) after 6 root-cause fixes. The review then asked for changes (Major: unbounded `linger_close` drain), and round 2 is in progress.
- sea-rs #86 decision: **option B** (create-only `launched:<attempt>` liveness record; `NotDeclared` refused while the process group is alive on the same boot), **plus** an explicit `KillMode=control-group` and `TimeoutStopSec=30` in the gateway unit, **plus** a documented dedup contract on `authorization_request_sha256` for external-authority implementers.
  - Why: option A (authority dedup) is the only complete fix, but the external authority is an out-of-repo command. Option B covers the CLI and non-systemd paths without `unsafe`; containment covers the deployed systemd path.
  - Bounds documented: `setsid` escapees, pid namespaces, and the fork-to-record window.
  - Design note: `evidence/followups/sea-rs-86-design.md`.
- Separate sea-rs PR: the #19 pinning test plus an INFO log of each registered world ref.

## L-030 · 2026-11-06 · Follow-ups merged and released; estate cleaned; owner sudo session prepared
- sea-rs **#88** (`bb0190ab`): a test pinning that a missing or unknown settlement class is denied. It also logs each world ref once the registry is complete. Status revision 228. The 3 CodeRabbit findings were fixed. Horizon **#19** is closed as not a bug.
- sea-rs **#89** (`7db070a5`, Fixes #86): the NotDeclared liveness guard. Status revisions 229 and 230. CI and review fixes:
  - a version on the test-only dev-dependency, for the cargo-deny wildcard ban;
  - `dead_code` allowed for `parse_ps_members` on non-Unix;
  - the no-launch-record exception recorded as a limit.

  One macOS jail job lost its runner; the re-run passed.
- **v0.4.1 released** (release PR #90, `595b5270`; release run 42173525269, 6 assets plus `SHA256SUMS`). The release-please PR needed a close and reopen by the owner account to trigger the required checks. The Linux server's sha is `b0e9eb9f…`, verified against `SHA256SUMS`. Horizon J02 and J02r2 live pass 12/12 (99 expects) against it: `evidence/release/j02-live-v0.4.1.log`. That is INTEGRATION PASS for the release, not LIVE VERIFIED until deployed.
- Gateway bundle restaged from Horizon main `c267302`, digest `b4d6be18…`. The dry run with the v0.4.1 binary is clean, apart from the expected `--replace-binary`. The owner's command sheet is `OWNER_SUDO_SESSION.md`: install, check and restart; an optional second-uid probe; rollback.
- Estate: 15 worktrees removed (6 from this session, 9 merged or superseded) and 52 local branches deleted, with recovery records. The remote deletion of 31 merged origin branches was **blocked by auto mode**. It is prepared for the owner in `../2026-11-05-estate-reconciliation/REPORT.md`.

## L-031 · 2026-11-06 · Owner sudo session: v0.4.1 deployed; second-uid probe LIVE; remote branch cleanup
- The owner ran `OWNER_SUDO_SESSION.md` steps 1 and 2. The install applied with `check: ok`:
  - binary v0.4.1, sha `b0e9eb9f…`; old copy at `sea-forge-server.replaced-20261106T131142Z`;
  - new unit, with the old one at `godspeed-sea-forge.service.generated-20261106T131142Z`;
  - runtime tree from `c267302`, with the previous one at `/opt/godspeed-horizon.previous-20261106T131142Z`.

  Both services are active, with `KillMode=control-group` and `TimeoutStopUSec=30s`. Evidence: `evidence/release/deploy-v0.4.1.log`.
- Second-uid probe: **LIVE VERIFIED**. uid 993 was refused with `identity_delegation_refused` and `no_side_effect`; the gateway journal agrees. The probe account was removed (`id gs-uid-probe`: no such user).
- The approve and reject roundtrip was not repeated. v0.4.1 changes only settlement NotDeclared resolution, and the roundtrip needs a temporary policy edit, cockpit clicks and `sudo -u godspeed-horizon`. The v0.4.0 LIVE result stands for the approval path.
- The owner ran the remote branch cleanup: 32 deleted. **Incident:**
  - Deleting `feature/expert-teams` closed cognate-workbench PR #2, which used it as its base. The script checked only PR heads.
  - Once #2 was closed, its head branch passed the open-PR check and was deleted too. This is why there were 32 deletions, not 31.
  - Both branches were restored at their recorded SHAs (`f071e673`, `332550db`), and #2 was reopened.
  - No other PR was closed: every affected repo was searched for PRs closed after 13:00Z.
  - `remote_cleanup.sh` now also skips any branch that an open PR targets as its base.
- Post-deploy owner check, 14:11Z: `--check` is ok as the login, and the login is denied the socket. The readback as `godspeed-horizon` against v0.4.1 returned ok, with the 5 T1 approvals intact (3 used, 2 rejected, all resolved_by operator). The runtime reaches the gateway, and ledger state survived the binary swap. Deploy: **LIVE VERIFIED**.
- Rollback option retired by the owner; `Horizon.wt-v041` removed (clean, detached at main `c267302`). Rollback is still possible from any Horizon main checkout, using the commands in `OWNER_SUDO_SESSION.md` step 3.
