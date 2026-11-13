# Horizon desk gaps (design v3): status, open issues, decisions needed

Date: 2026-11-08
Branch: `horizon-desk-gaps` (worktree `/home/sprime01/projects/Horizon-gaps`), HEAD `0eca3ed`
Base: `origin/main`
Status: **not merged, not pushed, no PR.** Merge is blocked by the open items in section 3.

## 1. Where it stands

- Branch size: 128 commits over `origin/main`, 160 files changed, +12,586 / -348 lines.
- Gates on HEAD, all exit 0 with zero failing tests: `just verify`, `just teeth-t05`, `just check-t05`, `bun run build:desk`, `bun x tsc --noEmit -p .`.
- Desk, question and panel suites: 564 to 570 tests passing in the last runs.
- Blind review (Codex CLI, read-only, `codex exec`): 5 rounds run.
  - Round 1: 15 findings (7 P1 blockers). All fixed.
  - Round 2: 11 findings. All fixed.
  - Round 3: 11 findings. All fixed.
  - Round 4: 5 findings. All fixed (commits 25b2793, e8ee327, a026136, a816630, 0fc371e).
  - Round 5: 4 findings (1 P1 blocker). All fixed (588463c, 5eebec0, 074fe4e, 932e465).
- Round 5 fixes have **not** been re-checked by a blind review. A round-6 review was not run because you asked me to stop the review cycle if this round did not resolve the issues.
- Regressions found by gates after round 5, both fixed: a fresh store logged a pause (0eca3ed, root cause: board read after `close()` in the `mcp` path); a stale-lock race (fixed in 5eebec0).

Migrations now in the store (versioned, append-only, each recorded with a marker):

| Version | Name |
|---|---|
| 1 | answer states |
| 2 | answers from before the upgrade |
| 3 | question states |
| 4 | sealed questions |
| 5 | reconciled identities |
| 6 | answers put off before the upgrade |
| 7 | operator scope (layout change: records are keyed by operator) |
| 8 | conflicts from deferred answers (repair: marks false conflicts `cleared`) |

## 2. What the work delivers

- One FIFO mutation queue for every answer, panel and question write (checked by a grep-style test and a blind review, round 5: no bypass found).
- Durable panel, question and answer records, scoped to the operator that wrote them (round-4 fix).
- Question states: waiting for you, put off, waiting for the agent, finished, withdrawn. Sealed identities cannot be answered again after republish.
- Reassignment with owner revisions and stale-revision refusal. Author fields are kept separate from current owner.
- Request-id de-duplication for every mutation on the agent door and the person's ops. The browser sends one id per command and reuses it on retry, for answer, stop-waiting, pin and close (see section 3, gap A).
- Single-writer lock: kernel-held `flock` child process on `<store>.lock` (round 5), plus the store-record lock as a second check. Refuses to start if `flock` is missing.
- Migration gate: changes are paused while migrations run or if they fail (503 with words), and the board is read after migrations.
- Read-only CLI open (`surface`): refuses stores older than this build, never writes, does not create or rotate secrets or agent keys.
- Pairing: code printed to the terminal only. No stdout fallback. With no terminal the server still listens, prints no code, and refuses pairing with a clear message.

## 3. Open items

### 3a. Decision needed: an agent in the paired browser can act as the person (critic item 4)

- Problem: human-only actions (answer, route, withdraw, reassign, stop-waiting, remove) are allowed with the pairing cookie. An agent that controls the paired browser can omit the `x-horizon-source` header and the same request succeeds (403 becomes 200). The review re-confirmed this in rounds 2, 3, 4 and 5. It is the only item that every round has kept open.
- Sol 6.1's recommendation (full text in `scratchpad/critic/sol-item4.out`, summary in `.agents/reports/2026-11-08-agent-authority-decision.md`): separate agent keys from browser sessions; every human action becomes a proposal the person confirms by typing a challenge in the operator's terminal; agents run in an OS sandbox that cannot reach the terminal, pairing output, process memory or writable storage.
- Impact: the core browser flow changes (every decision needs a terminal step); the sandbox is outside this repo; about seven steps of work with tests.
- Options:
  - **A.** Sol's design (terminal confirmation plus sandbox). Strongest protection, largest change.
  - **B.** Keep browser answers, make the agent door the only agent route, and document that a browser-controlling agent is trusted. Small change, does not stop a determined browser agent.
  - **C.** Leave as is and document the residual. No change.

### 3b. Gap A: browser has no request ids for some actions

- Route, reassign, withdraw, remove and put/publish have no browser UI. The server requires a request id from agents for them, so there is nothing to retry from the browser yet. Not a correctness problem today, but the browser cannot perform those actions.

### 3c. Gap B: no Reassign control for conflicted answers

- Conflicts are listed with the required words and a Stop waiting button. There is no Reassign button (the server operation exists; the client has no agent picker).

### 3d. Not verified

- Power-loss durability (writes interrupted mid-commit) was not tested on real hardware.
- Browser UI behaviour of the desk was not exercised end to end in a browser in this round.
- The round-5 fixes have not been reviewed blind by Codex.
- The new migration 8 and the operator-scope migration 7 were tested on fixtures only, not on a real legacy production store.

### 3e. Changes you should know about

- `scripts/teeth-t05-equivalence.ts` runs the desk server under `script(1)` so the pairing code reaches a pseudo-terminal (needed by the no-stdout-fallback change). It is a harness change made to keep the check meaningful, not a weakening.
- The desk lock now requires the `flock` binary (util-linux). On a system without it, the desk refuses to start.
- `test/support/write-token.ts` forgets a dead session when a pairing code is issued for an origin (test-only preload).

## 4. Recommended next step (my view, for your decision)

1. Decide item 3a (A, B or C). Nothing else is safe to merge without it, because the browser can still act as you.
2. If A or B: implement it, then run one more blind review of only the new authority code.
3. Run one blind review of the round-5 fixes (the operator-scope migration, the lock, the board reload) before merging.
4. Decide whether 3b and 3c (UI gaps) block the merge or go to a follow-up.
5. Then push, open a PR to `main`, and merge. The PR should carry a short summary of 3d as known limits.

Nothing in this report has been pushed or merged.

## 5. Related files

- `.agents/reports/2026-11-08-agent-authority-decision.md` (item 3a, options A to C)
- `.agents/reports/2026-11-08-gaps-review-round4.md` (round-4 review text)
- Review raw outputs: `scratchpad/critic/codex-r1.out` to `codex-r5.out`, and `sol-item4.out`, under `/tmp/claude-1000/-home-sprime01-projects-Horizon/153d70cd-d7e5-4657-8444-9a0c48bbc206/scratchpad/critic/`
- Design: `.agents/reports/v2-build/gaps/design-v3.md`
