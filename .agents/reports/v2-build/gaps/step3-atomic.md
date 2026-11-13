# Step 3: one stored state per question, and one commit per desk change (design v3, section 2 and section 4)

Branch horizon-desk-gaps. Code commit: c19fe43 (after step 2, 9121670). This report is the second commit of the step.

## 1. Same id, different wording is refused

- A question id keeps its first wording, choices, consequences, input kind and target, whatever its state (unanswered, put off, or answered).
- A changed put is refused with: "That question id was already used for different wording. Use a new question id." The same words are kept as the refusal for answered questions too, as the operator's decision lists them. The name ANSWERED_CANNOT_CHANGE is kept, and its value is now these words.
- The same words still work: an unchanged put keeps an answer, and a put-off question reopens with its history kept.
- This replaces the old behaviour, where an unanswered or put-off question could be reworded under the same id. The pinned tests that accepted rewording now expect the refusal (test/desk-question-version.test.ts). The two agreement tests (desk-agreed-durable, desk-agreed-pre-upgrade) carried the old answered-question words as a literal, and now carry the new ones.

## 2. The state, stored once, and the rest derived

- The five states are: waiting for you, put off, waiting for the agent, finished, withdrawn (src/capabilities/question-rules.ts).
- An answer record stores `state`. A put-off answer is `put_off`. An answer the person sent or cancelled is `waiting_for_agent`. A route or a stop finishes it, and `finished_by` says why: `reported` (the agent named where it went) or `stopped` (the person stopped waiting). Words that name no destination count as stopped.
- `replied` and `waiting_on` are no longer stored. They are derived from the state (compatOf). `answered` and `withdrawn` on the board are derived from the state when loaded (derivedBlock in src/capabilities/panel-records.ts). The board no longer stores `answered`.
- Records from before this step are read once: their state is derived from their old fields and written back, and their derived copies are dropped (migrateAnswerStates). A second run writes nothing. The pre-upgrade closing runs after it.

## 3. One commit per transition, with the row inside it

- Route (`answer.route`): the answer's finish, the conversation row and the panel's own row are one store.commit. The panel record itself does not change, because `answered` is derived.
- Withdraw: the panel record, the question's state, the conversation row and the panel's row are one commit. A row is now always written for a withdrawal (before, only when an answer row already existed).
- Move to another agent (reassign): the owner on the answers, the owner on the panel, and the conversation row are one commit.
- Stop waiting (by step): the finish of each answer on the step and its conversation row are one commit. Stopping now writes a row (STOPPED_ROW), which it did not before.
- Each planned write carries the version it was checked against (expectedVersion). A failed commit changes nothing and returns "Nothing was sent. Try again." (NOTHING_SENT).
- The conversation module now has plan functions (planAppend, planUpdate) that return a row write without storing it, so a commit can hold it (src/capabilities/conversation.ts). appendRow and updateRow are unchanged in behaviour.

## 4. Not changed, and why

- Answer and its row: the answer's commit holds the answer, the panel record and the state. Its conversation row is still written after the commit. test/desk-recorded.test.ts pins that an answer whose row fails is still saved, with recorded: false. The operator's rule here was not to weaken tests, so this stays as it was. This is the one transition that is not one commit with its row.
- Agent puts (show_surface, ask_human): the board change is one commit; the panel's conversation row is written after it, as before.

## Tests

- New file test/desk-question-states.test.ts: 18 tests, all pass.
  - Same id, different wording, refused in each state (unanswered, put off, answered). Same words keep or reopen the question, with history.
  - Each of the five states derived from the store and the desk's state; why it finished is kept apart (reported, stopped); the compatibility fields follow from the state.
  - One commit per transition, counted by wrapping the store's commit: route, withdraw, reassign, stop waiting. Each commit holds the row.
  - A route whose row cannot be written changes nothing: the answer, the rows and the panels are unchanged; the answer still waits; a later route goes through.
  - Restart after each transition (withdrawn, routed, moved, stopped, put off then reopened) loads the same panels and rows. These use the desk's real SQLite file on restart.
  - A legacy answer record gets its state once; a second run writes nothing; statusOfLegacy keeps a stored state.
- Pinned tests changed, with the reason (each one encodes replaced behaviour):
  - test/desk-question-version.test.ts: the two same-owner rewording tests now expect the refusal; the stale-answer test uses a version the question never had; the over-the-desk test no longer reword an unanswered question under its id.
  - test/desk-answered-immutable.test.ts: "an unanswered question can still be removed or changed" now expects the rewording to be refused, and a new id to be accepted.
  - test/desk-panels.test.tsx: a stored record no longer carries `replied` or `waiting_on`; it carries `state`.
  - test/desk-reconciliation.test.tsx: a route whose row fails is now refused as a whole (503, "Nothing was sent. Try again."); no gap is logged or kept.
  - test/desk-agreed-durable.test.ts, test/desk-agreed-pre-upgrade.test.ts: the answered-question words are the new ones.
  - test/desk-gap-words.test.tsx: the word scan now includes the same-id words and the stopped-waiting row.
- Full suite before the code commit: `bun test` = 1216 pass, 16 skip, 0 fail (1232 tests in 134 files). Step 2 ended at 1214 tests in 133 files (1198 pass).
- `bun x tsc --noEmit -p .`: exit 0 after the code commit.
- Panel and question subset during the work: 107 tests in 20 files, all green after the pinned changes.

## Not done

- Explicit state on every question. Answered, put-off and finished questions have `state` on their answer record. An unanswered question has no stored state (it is "waiting for you" by having no answer record and no withdrawal). A withdrawn question stores its reason on its panel block; that presence is its state. So the state is not one field on every question; it is on the answer record where one exists, and otherwise on the panel block.
- Migration: no versioned migration marker, no pause of mutations during migration. Legacy `answered` on stored panel blocks is read only when there is no answer record, and it is dropped on the next write.
- Answer row atomicity: see section 4.
- Request de-duplication and the version check on every request beyond the existing answer version: not done.
- A single-writer refusal for a second server on the same database: not done.
- Moving an unanswered question (only waiting questions can be moved): not done.
- Owner stored in two places (on the answers and on the panel block) is unchanged from step 2; they are now written in one commit.
- Withdrawing a put-off question moves its answer to withdrawn (stateWrites), but no test covers that path directly.
- The desk client bundle was not rebuilt (`bun run build:desk`). The new visible row (STOPPED_ROW) and the new refusal words are in source and in the word scan, not in a built page.
- Nothing was pushed. No servers were started or stopped. No keys or pairing codes were read or printed.
