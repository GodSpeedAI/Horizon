# Step 4: finishing the design v3 items (design v3, section 2 and section 4)

Branch horizon-desk-gaps. Starts after step 3 (c19fe43, 64ec4b6). Seven items, one commit each, plus a word-scan commit and this report.

## Commits

| Item | Commit | What |
|---|---|---|
| 1 | 88b3cc0 | An answer and its conversation row are one commit |
| 2 | 6c33e66 | A request id on an answer; a retry cannot answer twice |
| 3 | aad3023 | One writer per desk database |
| 4 | 07ae986 | Versioned migrations; changes refused until they finish |
| 5 | 2ca4b75 | Every question has an explicit stored state |
| 6 | 7f63fcd | An unanswered question can move to another agent |
| - | 423f546 | Word scan covers the new visible text |
| 7 | none | The desk bundle builds (exit 0). `dist/` is gitignored and not tracked, so nothing is committed |

## 1. Answer and its row in one commit

- The answer handler now makes one `store.commit`. It holds the answer record, the question's state, the panel's record, the panel's own conversation row and the answer's conversation row.
- If that commit fails, nothing is stored. The person gets HTTP 500 and "Nothing was sent. Try again."
- The separate row write, the `recorded: false` note for answers, and the separate panel-row write (`settlePanelRow`) are removed. Notes still use the `recorded` note; that is unchanged.
- Pinned test changed: `test/desk-recorded.test.ts`. It used to pin that an answer is saved even when its row fails. Reason (also in the commit message): design v3 requires one commit. Now a failed row refuses the answer as a whole, and a later answer is stored with its row.
- Tests: 4 pass in that file. The `test/desk*` subset was 389 pass after this item.

## 2. Request de-duplication

- The browser sends `request_id` with each answer (the client change is in `main.tsx`). The server also accepts requests without one; those behave as before, with no de-duplication.
- The answer's commit also writes a record in `horizon-desk-requests`. The record keeps the id, a fingerprint of the body (the body without the id, keys sorted) and the response.
- Same id, same body: the stored response is returned. Nothing is written.
- Same id, different body: HTTP 409, "That request id was already used for something else."
- A refused request stores nothing, so its id can be used again.
- An id that cannot be read (empty, too long, or with spaces) gets HTTP 400, "That request id could not be read. Nothing was sent."
- The record is durable, so a retry after a restart still replays.
- Tests: `test/desk-request-id.test.ts`, 7 tests pass. They cover same id twice (one answer, one row, same result), a lost response then retry, different contents refused, refused request keeps its id, unreadable id, and restart replay on the SQLite file.

## 3. Single writer

- At startup, a desk takes a lock record (`horizon-desk-lock`, id `desk`) with a compare-and-set commit, before anything is written.
- A second desk on the same store is refused: "Another Horizon desk is already using this database. Stop it first." The second desk closes its own store and does not start.
- The lock is released on close.
- A lock whose holder is a process that no longer exists does not block the next start. Within one process, a desk that is still open blocks another one.
- Tests: `test/desk-single-writer.test.ts`, 4 pass. Two app instances on one SQLite file; a restart after the first closes; a stale lock from a dead process; a lock held by another live process.

## 4. Versioned migrations and the pause

- Marker `marker:<tenant>` in `horizon-desk-migrations` holds the highest version that ran.
- Migrations (`src/capabilities/desk-migrations.ts`): 1 answer states (`migrateAnswerStates`), 2 answers from before the upgrade (`migratePreUpgradeAnswers`), 3 question states (item 5).
- A start runs each migration above the marker, in order, once; it writes the marker after each. A start with nothing pending writes nothing.
- Until the run finishes, every non-read request is refused with HTTP 503: "The desk is updating its saved records. Nothing was changed. Try again in a moment." Reads still answer.
- A failed run leaves changes paused with "The desk could not update its saved records, so changes are paused. ...". The next start tries again.
- Test seam: `createApplication` takes `migrationHold` so a test can hold a migration pending. `test/support/desk-app.ts` passes it through, and by default waits for the migration before returning.
- Tests: `test/desk-migrations.test.ts`, 6 pass. The first start migrates a legacy answer (no state) and writes the marker; a second start writes nothing (record versions compared before and after); while a migration is held, a change gets 503 with the words and a read still answers; the runner runs migrations in order once; a failing migration is not marked and runs again.

## 5. Explicit state for every question

- Five states: waiting for you, put off, waiting for the agent, finished, withdrawn (`QUESTION_STATES`).
- A question with an answer record keeps its state on that record, once (`finished_by` says why it finished). Its panel record keeps no copy of the state or of `answered`.
- A question with no answer record stores its own state on its panel record: `waiting_for_you`, or `withdrawn`.
- The board derives `answered` and `withdrawn` from the state. The stored field is never shown on the board.
- `questionStateOf` reads the state from the records.
- Migration 3 writes the state onto existing questions that have none.
- Tests: `test/desk-question-stored-state.test.ts`, 6 pass. Each of the five states is set through the desk's own entry points and reads back the same after a restart on the SQLite file. The board's derived fields match. A question from before this step gets its state from the migration.

## 6. Moving an unanswered question

- Reassign now accepts a question that is waiting for the person (no answer record). Its owner is the question's owner on its panel record.
- Checks are the same as for a waiting answer: paired desk, pairing no older than 10 minutes, registered target, explicit confirm, and the owner the person saw (409 if it changed).
- The owner change and the conversation row ("Moved the question ... from A to B.") are one commit. The row is a note-kind row, so a later answer does not overwrite the move in it.
- Behaviour change: an agent that does not own a question can no longer put it up again. Before, the panel's owner was the only check. The refusal is "That question belongs to another agent." (`QUESTION_OTHER_AGENT`, in `panels-model.ts`).
- Tests: `test/desk-reassign-open.test.ts`, 4 pass. Refusals leave the owner unchanged; the move is one commit that holds the panel record and the conversation row; the old key cannot withdraw or re-put, the new key can withdraw; the moved owner survives a restart.

## Word scan

- `test/desk-gap-words.test.tsx` now scans the new visible text: the request id refusals, the second-desk refusal, both migration messages, the other-agent refusal, and the move row and reply. 4 pass.

## Full suite

- `bun test` run once, under the build lock, before this report: **1244 pass, 16 skip, 0 fail** (1260 tests in 139 files). Step 3 ended at 1216 pass, 16 skip (1232 tests in 134 files).
- `bun x tsc --noEmit -p .`: exit 0 after the last code commit.
- `bun run build:desk`: exit 0.

## Not done, or done in part

- **Request ids** are only on the answer operation. Reassign, stop waiting, pin, close, and the agent's own operations do not use request ids yet.
- **Request ids are optional** on the server, so an old client without one keeps the old behaviour (no de-duplication).
- **Only successful requests are recorded.** A refused request can be sent again with the same id.
- **Move (item 6) is API-only.** No desk control calls reassign, for answers or unanswered questions. Put-off questions cannot be moved; only waiting-for-you ones can.
- **Two places hold a question's state**: an answer record (answered questions) and its panel record (unanswered questions). Step 3 made this split. Item 5 makes it explicit and derived, but it is not one field on every question.
- **Single writer uses the process id.** It protects one machine, not a network share.
- **Migrations are not run through the UI.** A paused desk shows its 503 words in the response; I did not check how the client displays them.
- **Migration 3 rewrites existing panel records** once, on the first start after this change.
- **Legacy data** stays as it was, apart from the derived fields the migrations remove. No backup step was added.
- **Design v3 items not in this brief** (for example showing a question's target in plain words) were not touched.
- Nothing was pushed. No servers were started or stopped. No keys, key files or pairing codes were read or printed.
