# Step 2: durable panels and the queue hygiene (design v3, section 2 and section 4 step 2)

Branch horizon-desk-gaps. Commits: 7e5d4fa (part E, queue hygiene), 40743df (parts A to C). Part D is partly done.

## E. Queue hygiene (commit 7e5d4fa)

- The agent door reads the request body before the command is queued. A body over 500,000 bytes that declares its size is not read at all; the queued command refuses it with 413 after the key is checked. A body with no declared size is still read in full before the queue (a known gap, see below).
- Step acceptance looks up its card outside the queue. The queued command re-reads the local waits the card depends on. A wait that exists now is refused with the existing words ("...has not replied yet..."). A wait that the lookup saw and that has gone since is refused as stale, with "The case changed after you looked. Look again, then start." The core decision then uses the looked-up state instead of looking again.
- Still inside the queue: the case keeper calls that make the decision itself (approval listing for case tasks, the decision, the human task completion, the observation and rule steps). Those are mutations, not lookups.
- Tests: test/desk-queue-hygiene.test.ts, 3 pass. (a) A held agent body does not block a queued panel command, and the held request completes when its body arrives. (b) A slow keeper lookup does not hold the queue: a panel put finishes while the lookup waits. (c) A lookup that saw a wait, followed by a stop-waiting that ran before the accept, is refused as stale.

## A. Durable panel record (commit 40743df)

- New module src/capabilities/panel-records.ts. One record per panel in `horizon-panels` (key `panel:<id>`), holding the panel and its questions as the board holds them: wording, choices, consequences, decision target (`resolves`), the original author (`asked_by_key`), the current owner (`owner_key` on the panel), the answer, deferrals (`earlier`), withdrawal and the version.
- A panel record is written on the first put, before the question is shown.
- Same question id with the same wording and target is the same question. Repeating it keeps an answer or reopens a deferred question, with history.
- Not done: the refusal "already used for different wording" (see Not done).

## B. The board is a view (commit 40743df)

- The board is rebuilt from the records at startup and after every committed change (loadBoard). The eight-panel cap, pinning, and safe eviction are unchanged. Eviction only removes a panel from the visible list in `horizon-desk-board` (key `board:<tenant>`); the panel record stays.
- A panel that is closed, removed or evicted keeps its record. When it comes back, withStored brings its stored questions with it, so the same question with the same words reopens with its answer.
- Folds: not stored. Folding is presentation and was not part of the durable record in this step.

## C. Startup load and failure (commit 40743df)

- The board is loaded before createApplication returns, so the server accepts no panel command before the load.
- A record that cannot be read, or a visible list that names a missing panel, is an error (PanelLoadError). The desk then shows the plain words in PANEL_LOAD_WORDS in place of the board (`panels.refused` in the state; a line in the conversation view), returns 503 for panel changes and agent panel calls, and never shows an empty board.
- Migration: no versioned migration was written. Before this step the board was only in memory, so no legacy board data exists to import. Legacy answers in `horizon-panel-answers` are left as they were. The pre-upgrade answer closing that already ran at startup is unchanged.

## Atomicity

- An answer and the panel record that shows it are one commit (recordAnswer takes the panel records as a callback and commits them with the answer). Test: restart tests below.

## D. Derived fields (partly done)

- The board's question state is derived from the stored `answered` and `withdrawn` fields. The compatibility fields for the answer collection (`replied`, `waiting_on`) are still stored separately by the answer records. That is two stored copies of the answer's wait state, so D is not complete.

## Tests

- test/desk-durable-panels.test.ts, 6 pass, all through the application's own entry points, with real restarts on the same store (startDeskApp with the same root):
  1. A question from agent Alice survives a restart with its words, owner and deferred history; another agent cannot put the same panel with other words (refused: "That panel belongs to another agent.").
  2. An unanswered question survives a restart and can be answered after it.
  3. A deferred question survives a restart, an unchanged re-put reopens it, it is answered, and the earlier deferral stays in its history.
  4. A closed panel keeps its record, and the same question re-put with the same words reopens it. An evicted panel keeps its answered question, and re-putting it brings the answer back; a changed wording is refused with the existing words.
  5. A corrupted board record: after the restart the desk shows PANEL_LOAD_WORDS, the board is empty only in the sense that nothing is shown and refused (`refused` is set), and pin and agent put are refused with 503.

## Full suite

- `bun test` after part A to C: 1198 pass, 16 skip, 0 fail, 1214 tests across 133 files (step 1 ended at 1205 tests in 131 files; this step adds 9 tests in 2 files).
- `bun x tsc --noEmit -p .`: exit 0 after each commit.

## Not done

- "Different wording needs a new question id" (refused as "already used for different wording") is not implemented. It conflicts with pinned tests: test/desk-question-version.test.ts ("a question nobody answered can be changed"; "a question put off with Not yet starts again when the agent changes it") and the same file's over-the-desk test, which all accept a same-owner rewording of an unanswered or deferred question. Keeping those tests means keeping the rule off. The operator needs to decide which rule wins.
- The explicit question state field (waiting for you, put off, waiting for the agent, finished, withdrawn) is not stored. The state is derived from `answered` and `withdrawn`, and the "why it finished" split is not stored as its own field.
- Only the answer path is one commit. Routing (answer.route), withdrawal, reassignment and stop-waiting commit their panel change separately from their answer or conversation records. A crash between the two leaves them out of step.
- The conversation row is not in the same commit as the answer.
- Request de-duplication and the version check on every answer request (the design's "exact value used for its checks") are not done beyond the existing answer version.
- No single-writer refusal for a second server on the same database.
- No migration pause and no versioned migration marker. The legacy guard and agreement records are read as before, not imported into the question record.
- The case keeper's own calls for the decision still run inside the queue, as noted in part E.
- A request body without a declared size is still read in full before the queue. The 500,000-byte limit applies after the read in that case.
- The desk client bundle was not rebuilt (`bun run build:desk`). The conversation notice is in source only, verified by type check, not by a built page.
- Frozen paths were not touched: .agents/prereg/**, .agents/plans/**, requirements/ledger.yaml, .wayfinder/**, src/ui/surface2/grammar.ts.
- Nothing was pushed. No servers were started or stopped. No keys were read or printed.
