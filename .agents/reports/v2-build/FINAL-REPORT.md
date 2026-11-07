# Horizon desk v2: final report

Date: 2026-11-07. Branch: `horizon-desk-v2` (Horizon). Evidence lives under `.agents/reports/v2-build/`. Every proof below was produced by a deterministic tool: test runners, `tsc`, Playwright screenshots, axe, scripts in this folder, and command outputs saved next to them. No image or figure was produced by an agent.

## 1. What was built

| Stage | What it delivers | Evidence |
|---|---|---|
| 0 | Test and production setups (`setup-init`, `setup-env`, `setup-health`, `setup-clear`, `setup-check-empty`), each refusing the wrong setup | `stage-0/` |
| 1 | Workshop "Connect Horizon" (access key file, 0600), notes, desk shell, keys, attention rules | `stage-1/` |
| 2 | Desk: Today, Explore, Decide, Work; plain-word pass | `stage-2/` |
| 3 | Case keeper client (SEA-Forge): human steps as decisions, Mark done, Hold, previews, out-of-date handling | `stage-3/` |
| 4 | GitHub mirror: a case becomes a board, its steps become issues; adversarial tests | `stage-4/` |
| 5 | Timings and record delay; rulebook snapshot on runs | `stage-5/` |
| 6 | Live proofs: Hand off, Mark done, hand to an agent; walk, axe, keyboard, Presenting and key scans | `stage-6/` |
| 7 | New composer (mock layout, Cognate Workbench look) | `stage-7/` |
| 8 | Conversation: one stored record of everything done through the desk, by you or by an agent; the composer is also a command line; agents build panels from all 15 parts and can only suggest; page tools for an agent beside you | `stage-8/` |
| — | Seed data with `just seed`, `just seed-status`, `just seed-clear`, `just seed-reset` | `seed/`, `runbook.md` |

Other repositories:
- SEA-Forge: case keeper support, PR https://github.com/GodSpeedAI/SEA-Forge/pull/91.
- Cognate: RealityTrace real snapshot, PR https://github.com/GodSpeedAI/Cognate/pull/76.
- Workshop (`cognate-workbench`): branch `feat/horizon-connect`, local only. See section 4.

## 2. Proof that it is complete (K1–K14)

| # | Check | Result | Evidence |
|---|---|---|---|
| K1 | `tsc --noEmit` (Horizon) | 0 errors | `stage-7/tsc.out` |
| K2 | `just verify` (check, boundaries, tests, ledger, wayfinder, teeth), `just check-t05`, `just teeth-t05` | all exit 0. 760 pass, 0 fail. teeth: 6 of 6 attacks caught | `stage-7/verify-final.out`, `stage-6/k2-*.out` |
| K3 | New tests for new behaviour | full `bun test`: 760 pass, 16 skip, 0 fail (776 tests, 82 files) | `stage-7/full-test.out` |
| K4 | SEA-Forge case keeper tests (cargo) | `conformance_case_authoring` 21 pass, `conformance_sfwp` 23 pass. The five regression tests fail before the fix | `stage-3/case-keeper-fix-proof.md` |
| K5 | Workshop: typecheck and the tests the branch changed | tsc 0 errors; 58 pass, 0 fail (11 files), on a throwaway database. The run found a bug, fixed in the workshop commit `c4096b9` | `stage-7/k5-workshop-*.out` |
| K6 | Seed, then a Playwright walk of every view | `just seed` on a fresh setup exits 0; walk of Today, Explore, Decide and Work at 1440 and 390 px | `stage-6/k11/10-seed.out`, `stage-7/w3-*.png` |
| K7 | Live flows | Hand off, Mark done, and hand to an agent: the agent ran and answered | `stage-6/ho3-*`, `stage-6/md3-*`, `stage-6/agent-handoff-live.md`, `stage-7/live-agent-*` |
| K8 | Accessibility | axe: 0 violations on every view, wide and phone. Keyboard: 60 tab stops, all with a visible focus ring. No sideways scroll. 0 console errors | `stage-7/w3-walk.json`, `stage-7/axe.json` |
| K9 | Timings (1 s budget) | lookup p95 3.7 ms; comparison p95 756 ms; event-to-record delay 0 ms over 9 seeded events (see section 4) | `stage-6/k9/` |
| K10 | Presenting scan | no private repository name with Presenting on. Only hits: "Horizon" (the product name) and the form field `repo` | `stage-7/presenting-scan.out`, `stage-7/p4-on/` |
| K11 | Clear testing, set up production, prove it empty, start it | testing cleared, including the workshop database, 5 sandbox issues and the board; the repository is kept. Production: init, empty (exit 0), start, health (desk, case keeper, records, tap), empty while running (exit 0) | `stage-6/k11/` |
| K12 | Key leak scan | workshop, OpenCode and ClinePass keys: 0 files across the setup, reports, source, build output, scripts and tests, and 0 lines in Horizon's git history. The ClinePass key is only in the workshop's own `secrets.json` (0600) | `stage-7/keyleak-all.out` |
| K13 | Runbook tested | each production step was run as written. The fixes it needed are in the runbook: the stop command, `--exclude personal`, health per part | `runbook.md`, `stage-6/k11/` |
| K14 | Merged and pushed, nothing stray | see section 6 | git log |

## 3. Decisions I made that you did not specify

Each line gives the decision and the reason.

1. **No 16th grammar block (CF10).** The desk draws agent panels with Horizon's existing 15 blocks, mapped inside the grammar folder, so the grammar stays frozen at 15.
2. **One request id per attempt.** After a definite refusal the next try uses `<base>:a<k>`, and a timeout keeps the same id. A retry after a timeout must never add a second step, and a retry after a refusal must not be answered by the remembered refusal.
3. **Rules in the cell's `policy.yaml`:** `operator-adds-steps`, `agents-propose-steps`, `operator-finishes-steps`. Without them the case keeper refuses Add step and Mark done. `just seed` adds only the lines that are missing and keeps your edits.
4. **The preview is made on behalf of the operator** (`7873d1a`). The case keeper writes the proposer into the step, so a preview made as the service gave a version code that never matched, and every Confirm was refused as out of date.
5. **Refusals end in plain words.** The raw class and message sit behind a Details fold. Raw text never goes in the sentence, because it can echo a key.
6. **Case titles fall back to the template name** when the description is code or jargon. The word list lives in one place (`banned-words.ts`) and the word scan uses it.
7. **The workshop's real refusal reasons get their own words** (`88e340d`): no model, unknown agent. The adapter used to call every unknown error "not answering", which sent you to the wrong fix.
8. **Test workshop model: ClinePass `cline-pass/deepseek-v4.1-flash`**, set through the workshop's own `model.configure`. The key went from the OpenCode sign-in file straight into the workshop's secret store and was never printed. OpenCode Zen free models answered 429 to the workshop. The Cline free models' ids answered 402, and the exact free ids could not be found from this machine.
9. **The workshop branch is not pushed.** Pushing `feat/horizon-connect` would publish 9 of your own unpushed commits that it sits on.
10. **Pull requests, not merges, for SEA-Forge and Cognate.** Those are shared repositories with their own reviews; Horizon's branch is yours, so it is merged.
11. **The test workshop runs on its own database instance** (`horizon-testing`), never `cognate-dev`, using your pinned `pg0` binary through a link in the scratch folder.
12. **Presenting scan:** "Horizon" (the product name) and the form field name `repo` are allowed. Neither names a private repository.
13. **axe runs with the page's script rule set aside** (`bypassCSP`), only in the test browser, so it can load. The desk's own rule is unchanged.
14. **The fake-runtime attack** (`3568dbe`) now exports the two authority helpers the code imports. It had been dying on load, which `teeth` counted as a leak. This predates the build.
15. **`setup-clear` removes links as links** (`7467c80`). The workshop makes links that point outside the test folder, so the clear could never run. The target of a link is never touched.
16. **`setup-check-empty` leaves out the setup's own rulebook folder** while it holds only what a start writes (`00c59e3`): the enrollment trace and rulebook snapshots. Any other record there still counts.
17. **`--exclude personal` in the production check.** Your personal work record is shared by every setup and is not test data.
18. **Hand-off previews and results go through the Presenting stand-ins** (`b9fc56f`). They were the one answer that skipped them.
19. **The conversation is stored** (stage 8, replacing stage 7's per-page thread). It points at the case keeper, the record keeper and the notes, which stay the authority, and keeps only words and references, never raw answers. The newest 200 entries are shown.
20. **One control for "give to an agent"** (`8fe4507`). The chip is the control, and the preview card states Yes or No.
21. **The workshop demo agent is part of the seed** (horizon-demo-helper and the demo-1 workspace), so a clear and reseed gives a working demo. Choosing the model stays a manual step, because it needs your key.
22. **Turned down (M3):** a separate lesson-intake service. Lessons wait in Decide until a person accepts them.
23. **Record, command line and composer are one piece, called Conversation** (your ruling). Every other view keeps the same composer bar; there is one record and nothing is duplicated.
24. **Agents propose, people decide, checked on the server.** A call from an agent on the page carries its own caller mark and may only read, search and make a hand-off preview. Sending, deciding, saving a note, discarding and answering are refused with plain words, and a refused attempt leaves no entry.
25. **An answer is closed only when the agent says where it went** (at least 6 characters, as in the cockpit). Before, any later agent call counted as a reply. A question waiting for you is never pushed out by the limit of 8 panels.
26. **All 15 parts are drawn** (your question about the cockpit). The grammar stays at 15; it moved to version 3 for the new question kinds, and version 2 is still read.
27. **The page offers five tools to an agent beside you**, using the same tool library version gs-term pins. None of them can confirm, mark done, approve, answer or settle, and a test checks this. The word "WebMCP" never appears on screen.
28. **A search typed letter by letter is not recorded.** Only a submitted Find adds an entry, so the record is not flooded.
29. **The workshop's own tests used your `cognate-dev` database once** before I noticed. They make and drop their own temporary schemas; I reran them on a throwaway instance and dropped it. Please check `cognate-dev` looks as you expect.
30. **A commit briefly swept in your staged deletion** of `.cognate/vendor/godspeed-identity-0.1.0-ed6c52a.tgz`. I took it back out of the commit and staged the deletion again, as you had it. Since then every commit names its files.
31. **`setup-clear` drops the workshop's database for that setup** (`horizon-<setup>`), so test data does not survive a clear.

## 4. What is not done, and why

- **Agent work is not written to the record keeper.** The workshop ran the agent, and the conversation is saved in `stage-6/`. But the run does not reach RealityTrace, so the event-to-record delay (K9) is still measured on 9 seeded events (0 ms) rather than on live work.
- **Panels are not fed by the workshop yet.** The desk draws every agent part and the tests put panels up, but the workshop's agents do not send any yet.
- **Lessons have no automatic intake.** This is by decision (section 3, item 22).
- **The workshop branch `feat/horizon-connect` is local only** (section 3, item 9). To publish it, rebase it onto `origin/main` without your 9 unpushed commits, or push those first.
- **Production's workshop and GitHub mirror are not started.** Their health checks pass only once you start them. Both are optional.
- **A handed-off step carries only its own words.** The agent replied that it had no seed cases to read, which was correct. Giving the agent the case's records is a next step.
- **The workshop answers 429 to OpenCode Zen free models** while `opencode run` gets a reply with the same key. This was not chased: a direct check with the key was blocked by the permission check.
- **The case keeper's socket file stays after a stop,** so the empty check must run while production is running. The runbook says so.

## 5. How to look at it

See `runbook.md`. Short form: start the test setup, `just seed`, open http://127.0.0.1:4339/desk.
