# Design v2: agent questions and answers, in the existing store

Status: revised after the EGM review (comprehension, zoom-out, critic) of store-design.md. Not built. Owner: Horizon desk.

## 1. What this fixes, in plain words

Today an agent's question and the person's answer are kept in two places, and the desk can lose track of who may act on a question. Specifically:

- A question disappears from memory on restart or when its panel is rebuilt.
- An answer can be saved without its protection record, if the second write fails.
- Two answers to the same question can both succeed.
- A question's owner is not kept with the question.
- An agent can wipe another agent's unanswered question off a shared panel.

## 2. The rule

Keep one record per answer, in the store that already holds answers: `horizon-panel-answers`. Do not add a second store. Every change to a question, its answer, its owner or its status is one atomic commit to that store. Each record touched carries the version it was read at (expected version). The store refuses the whole commit if any version has moved. Memory is only a cache.

## 3. What a record holds

The existing fields stay: `tenant`, `panel_id`, `n`, `ask`, `outcome`, `value`, `note`, `at`, `version`, `replied`, `routed_as`, `asked_by_key`.

Added fields:

| field | meaning |
|---|---|
| `owner_key` | the agent key that owns the question. Set when the question is first put. Changed only by "Reassign owner" (section 4). |
| `fingerprint` | a hash of the question's text, input kind, options, consequences and what it resolves. |
| `history` | every earlier outcome of a deferred question, in order. |
| `waiting_on` | `agent` (an answer waits for the agent to say where it went), `person` (a question waits for an answer), or `none`. |

Rules:

- `outcome` is `answered` or `cancelled` only once committed. A deferred question ("Not yet") stays with `outcome` null and an entry in `history`. So a deferred question can still be answered (fixes review finding 1).
- One answer per question. A second answer to an answered question is refused.
- The acceptance rule is defined in one place: a step is blocked while any answer on it has `waiting_on = agent`. Nothing else blocks acceptance.
- Stop waiting (the person's choice) sets `replied` true and `routed_as` to "You chose to stop waiting for the agent." It is one commit.

## 4. Operations (each is one commit)

- **Put a question (agent).** If none exists, create it with `owner_key` = the caller. If one exists, the caller must be the owner. A matching fingerprint on a deferred question re-opens it and keeps `history`. A different fingerprint on an answered question is refused.
- **Put a panel (agent).** A panel has its own `panel_owner_key`, set on first creation. Another key is refused: "That panel belongs to another agent." A put cannot remove an unanswered question; only the owner can close its panel. Removing an answered question from a panel view is allowed, and the record stays.
- **Answer (person).** Expected version is the version the person saw. Sets `outcome`, `value`, `at`, `version`, and `waiting_on = agent`. Refused if the question changed: "This question changed after you looked at it. Look again, then answer."
- **Route (agent).** Owner key only. Sets `routed_as` and `replied` true, `waiting_on = none`. Refused if `routed_as` is under 6 characters.
- **Withdraw (agent).** Owner key only, unanswered questions only, never a question that resolves a required step.
- **Stop waiting (person).** Always allowed on a question waiting on the agent. Sets `replied` true and `waiting_on = none`.
- **Reassign owner (person, paired desk only).** Allowed only for a question with no answer or with `waiting_on = none`. Sets the new `owner_key`. Writes a conversation row. This is the recovery for a lost or replaced agent key (review finding 2).

Every operation also writes its conversation row in the same commit. If the commit fails, nothing is recorded, and the person is told "Nothing was sent. Try again."

## 5. Migration (existing data)

- Owner: read `asked_by_key` from each answer record. Questions with no recorded owner get `owner_key = null`.
- An unrouted answer with no owner is closed at upgrade time with `replied = true` and the words "Answered before the upgrade; the owner was not recorded." It must not block acceptance after the upgrade (review finding 5).
- The old agreed-answers store (`horizon-agreed-answers`) is read once to set each question's fingerprint. It is then kept read-only for one release.
- Panels are rebuilt from the store on start.

## 6. Failure behaviour

- Commit refused (version moved): the operation fails with its plain words, and the desk shows "Nothing was sent. Look again, then try."
- Commit succeeded but the page crashed before showing it: on restart the page reads the store, so the answer shows.
- Scale: the store is read by question id; the conversation shows the newest 200 rows plus every row still waiting (as built in the gap work). Store reads per question are constant, not a scan of all answers.

## 7. Not solved here

- Starting only the named steps needs a precondition in the case keeper. That is a keeper change, tracked separately.
- A local program that can read the operator's terminal can still pair. Unchanged, stated limit.

## 8. Tests

- Defer, re-put unchanged, answer: succeeds (review finding 1).
- Rotate the agent key, route refused, reassign owner, route accepted (finding 2).
- Stop waiting closes an answer whose agent crashed (finding 3).
- Panel owned by A: B's put on the same panel id is refused; A's unanswered question is never removed by a put (finding 4).
- Migration: an unrouted pre-upgrade answer does not block acceptance after the upgrade (finding 5).
- Two concurrent answers: exactly one stored.
- Restart and recreate with different wording: refused.
- A failed commit: nothing visible, and the person is told nothing was sent.

## 9. Open decisions for the operator

1. Should "Reassign owner" be allowed for a question whose answer is still waiting for the old agent? (This design says no; the person can stop waiting instead.)
2. Keep `horizon-agreed-answers` read-only for one release, or delete it at upgrade?
