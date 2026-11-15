# Design: answers and agent questions in one durable commit

Status: proposed, not built. Date: 2026-11-07. Owner: Horizon desk.
Problem source: the third blind review (see notes.md, "Third round" and its open items).

## 1. What is wrong today

- A question lives in memory (`panels-model.ts`). A restart or removal loses it.
- A separate record, `horizon-agreed-answers`, keeps a fingerprint of each answered question. It is written in a second step, after the answer.
- An answer is written in its own step. If the second step fails, the answer exists without its protection. The desk then says "Nothing was sent" although the answer was saved.
- Two answers to the same question can both succeed, because nothing checks the first one under the same version.
- A question's owner (the agent key that first put it up) is read from memory, so a removed and recreated question can be given to another key.
- The "resolves" target is outside the fingerprint, so changing the step a question resolves is not detected.

## 2. The rule

Every change to a question, its answer, its owner or its protection is one atomic commit to the durable store, with an expected version on each record it touches. Memory is a cache; the store decides.

## 3. Records

One record per question, in a new collection `horizon-questions`, keyed `<tenant>|<panel_id>|<ask_id>`:

| field | meaning |
|---|---|
| `owner_key` | the agent key id that first created it. Never changed. |
| `fingerprint` | hash of question text, input kind, options, consequences, `resolves` and the step it resolves. Never changed once answered. |
| `answer` | null, or `{ value, outcome, answered_at, routed_as, routed_by_key }`. Written once per answer; later answers are refused. |
| `withdrawn` | null, or `{ reason, by_key }`. Only the owner key can set it, and not on a required question. |
| `version` | the store's own version, used for expected-version checks |

The conversation row for an answer keeps its own record in `horizon-conversation`, as today. It is written in the same commit.

## 4. Operations (each one commit)

- **Put a question** (`ask_human`, `show_surface` with an ask): read the record. If none, create it with `owner_key` set. If one exists: the caller's key must equal `owner_key`, and the fingerprint must match. A matching fingerprint re-opens a deferred question and keeps `answer` as history.
- **Answer** (human): expected version = the version the person saw. Commit: `answer` set (only if it is null), conversation row, and nothing else. If the expected version is stale, refuse "This question changed after you looked at it. Look again, then answer." A second answer to an answered question is refused.
- **Route** (agent): caller key must equal `owner_key`. Commit: `answer.routed_as` set, conversation row updated. Expected version = current.
- **Withdraw** (agent): owner key only; not on a required question; not after an answer. Expected version = current.
- **Remove a panel**: removes the panel view only. The question record stays. Nothing in the store is deleted.

Every commit lists all records it touches with their expected versions. The store refuses the whole commit if any version moved, so there is no partial state.

## 5. Failure behaviour

- The store refuses a commit: the operation fails, nothing is recorded, and the words say so. The person is told "Nothing was sent. Try again." The desk never says "done" for a commit that failed.
- A commit succeeded but the desk crashed before showing it: on restart the desk reads the store, so the answer is there and the page shows it.
- A conversation row that cannot be written with the commit: none, because the row is part of the commit. This removes the reconciliation path for answers. (Hand-off stage rows keep their own path; see section 7.)

## 6. Migration

- The new collection is created on first start. Existing `horizon-agreed-answers` rows are read once and copied into `horizon-questions` with `owner_key` set to the key that answered them (or "unknown", which nobody can route).
- Panels in memory are rebuilt from `horizon-questions` at start.
- The old collection is kept, read-only, for one release.

## 7. What this does not solve

- Hand-off stages (send, start, assign, result) are not questions. They keep their own commit path. The "start only the named steps" fix needs a keeper-side precondition (a plan revision the keeper checks). That is a keeper change, not a desk change.
- A local program that can read the operator's terminal can still pair. Stated limit, unchanged.

## 8. Tests this design needs

- Two keys race to route one answer: exactly one succeeds.
- Answer, restart, recreate with different wording: refused.
- Answer, then a failing store write: the answer is not visible and the person is told nothing was sent.
- Two concurrent answers: exactly one stored.
- Changing `resolves` changes the fingerprint: the stale answer is refused.
- Key B cannot remove and recreate key A's question.

## 9. Work split

1. Store module + records + migration (one Haiku agent, with the store contract tests above).
2. Route the existing panel operations through it (one Haiku agent after 1).
3. Desk words and status lines for the refusals (Haiku).
4. Blind Codex review of the result before any pull request.
