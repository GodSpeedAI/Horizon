# Desk gaps: build report for the v2 store design

Branch `horizon-desk-gaps`, built on `36b406b` (the EGM review reports). Design: `store-design-v2.md` in this folder. Checks: `verify-6.out` in this folder.

## Commits, oldest first

| Commit | Subject |
|---|---|
| 0e8e9f2 | question record fields and pure rules for put, answer, route, withdraw, stop waiting, reassign |
| 481164d | Not yet keeps the question open and waits for nobody |
| 87e1905 | a put-off question no longer blocks its step (test change) |
| f57b1ed | a panel belongs to the agent that put it up |
| 51b2dc4 | one acceptance rule: a step is blocked iff an answer waits for the agent |
| 1f47be7 | the person can move a waiting question to another registered agent |
| 1c487dc | stop waiting closes an answer whose agent is gone (test only) |
| 64fa09e | upgrade closes ownerless old answers; one answer per question; fingerprint on the answer |
| b4be34c | step 9: store operations call the shared rules |
| 8a46e60 | test: an answer from before the upgrade keeps its agreement; step 9 refusals in the word scan |

The step numbers are the ones in the build brief. Commits 0e8e9f2 to 1c487dc are mapped to steps 1 to 6 by subject, and 64fa09e is steps 7 and 8, as its own message says.

## Steps 1 to 9

**Step 1, record fields and pure rules (0e8e9f2).** Answer records gain `owner_key`, `fingerprint`, `history` and `waiting_on`. Older records read with defaults. The rules live in `src/capabilities/question-rules.ts`. Verified by `test/question-rules.test.ts` (fingerprint, put, answer, route, withdraw, stop waiting, reassign, and the pre-upgrade defaults).

**Step 2, Not yet (481164d, 87e1905).** A put-off answer is a history entry with outcome null. It waits for nobody, so it no longer blocks acceptance. 87e1905 changed two older tests that asserted the old behaviour (a put-off answer blocks acceptance). Verified by `test/question-deferred-store.test.ts`, `test/desk-not-yet-reopens.test.tsx` and `test/desk-panels.test.tsx`.

**Step 3, panel owner (f57b1ed).** A panel records the key that first put it up. Another key's put is refused with "That panel belongs to another agent.", and an owner's put no longer removes a question the person has not answered. Verified by `test/desk-panel-owner.test.ts`.

**Step 4, one acceptance rule (51b2dc4).** A step is blocked only while an answer on it has `waiting_on = agent`. Verified by `test/acceptance-rule.test.ts` and the existing acceptance tests.

**Step 5, reassign owner (1f47be7).** The person can move a waiting question to another registered agent. Seven mitigations (from the commit): the target must be in the agent registry; a second confirm is required; routes commit when sent, so a late route by the old key is refused; the new owner's route keeps the "Not checked" label; the owner change and its conversation row are one commit against the versions read; the reassign needs a pairing no older than 10 minutes; tests cover each. Verified by `test/desk-reassign-owner.test.ts`. The desk page has no confirm screen yet (see Not done).

**Step 6, stop waiting (1c487dc).** Stop waiting closes an answer whose agent is gone, keeps its words and owner, and frees only that step. Verified by `test/question-stop-waiting.test.ts`.

**Steps 7 and 8, upgrade, one answer, fingerprint (64fa09e).**
- Upgrade: at start, an answer written before the upgrade with no owner and no route is closed with "Answered before the upgrade; the owner was not recorded." It stops blocking acceptance. It runs once. Verified by `test/question-migration.test.ts` on a fixture store.
- One answer per question: each committed answer also writes a guard record in the same commit, checked by version. Two racing answers: one is stored, the other is refused with 409 and nothing is stored. Verified by `test/question-concurrency.test.ts`.
- Agreement: an answer carries its question's fingerprint. A changed question is refused from the answer record, and an agent cannot recreate an answered question with other words, even after the panel was removed or the desk restarted. Verified by `test/desk-agreed-durable.test.ts`.

**Step 9, store operations call the shared rules (b4be34c).** Every store and board operation now calls its rule:
- answer: `checkAnswer` refuses a second committed answer. The guard record carries the answer's version.
- route (store and board): `checkRoute` (owner, then words, then waiting for the agent). `checkRouteWords` holds the length limits and the words.
- stop waiting: `checkStopWaiting` on each answer of the step.
- withdraw (board, and the agent door for a question only on record): `checkWithdraw` (owner, unanswered, not a required decision).
- reassign: `checkReassign`, as before.

Duplicated checks removed: the owner check for route and withdraw in `app.ts`, the route length checks in `panels-model.ts` and `panel-answers.ts`, and the answered and required checks in the board's withdraw. The old `markWhere` helper is replaced by `closeAnswer`.

Not wired: put. `checkPut` refuses different words on any open question, but the desk accepts a changed open question and starts it again (`test/desk-question-version.test.ts`). Design v2 section 4 refuses different words only on an answered question. The rule and the design disagree, and the tests pin the desk's behaviour, so the board's put is unchanged. This needs an operator decision.

Behaviour changes in step 9. No test pinned the old behaviour, and the full unit suite passes:
- A question put off with Not yet can now be withdrawn by its owner. Design v2 section 3 says a deferred question stays unanswered.
- A withdraw by another key says "so you cannot withdraw it." It used to say "so you cannot answer for it."
- A route by another key on a question that has no recorded answer says "No answer to that question is waiting for the agent." It used to say the owner refusal. A route by another key on a question with an answer still gets the owner refusal.

Verified by: `test/question-rules.test.ts`, `test/desk-panels.test.tsx`, `test/desk-panels-asks.test.ts`, `test/desk-control-words.test.tsx`, `test/desk-question-version.test.ts`, `test/desk-agreed-durable.test.ts`, `test/desk-gap-words.test.tsx` (the owner words it pins are unchanged), and the full unit suite.

## The three claims, checked

**2a. Restart and recreate with different wording is refused.** Covered. `test/desk-agreed-durable.test.ts` has "the desk restarted on the same store: a changed question is still refused" (the second desk reads the same store, and a different question gets 400 with the answered-cannot-change words), and "the panel removed, an agent recreates the question with different wording: refused". No new test was needed.

**2b. The one-time copy of agreed-answer hashes.** Decision: as the design says, `horizon-agreed-answers` stays read-only for one release, and no copy was made.
- No code writes to it now. `rememberAgreed` is still exported but has no caller. Commit 64fa09e removed its only caller (the answer path).
- It is read in one place, `agreedAltered` in `app.ts`, and only for an answer that has no fingerprint. An answer with a fingerprint is checked against that fingerprint.
- Pre-upgrade answers have no fingerprint. Their protection is the old agreement record, read with the old hash formula, which includes the panel id. That hash is not the new fingerprint, so the copy would not have matched, which is why it was not made.
- Check: an answer recorded before the upgrade, with no fingerprint and an old-hash agreement on file, still refuses a changed question and lets the same one through. This is pinned by `test/desk-agreed-pre-upgrade.test.ts` (commit 8a46e60).
- What it does not cover: if an answer has no agreement record, it has no protection. The base code wrote one for each answered question, so this should not happen for answers made before the upgrade, but I did not check every stored answer against the agreement store.

**2c. Routes commit immediately, so nothing is pending to void (mitigation 3).** Confirmed by reading the path. The agent's route goes to `applyAgentOp` in `app.ts`, then `routeAnswer` in `panel-answers.ts`. `routeAnswer` runs the rule, then `closeAnswer` commits each answer that waits for the agent in one store commit. There is no queue and no pending state. The board is updated in memory afterwards. If the conversation row fails to write, the gap goes to the reconciliation list, and the route stays closed. A route by the old key after a reassign is refused by the rule, because the stored owner is the new key.

## Not done

- **Reassign confirm screen.** The API enforces the second confirm. No screen in the desk page sends it yet.
- **History per question.** Each answer record carries its own history of deferred outcomes. Nothing combines them into a history per question.
- **New server text in the word scan.** Added: the store and rule refusals (route, withdraw, put, answered twice, nothing sent, answered before the upgrade), in `test/desk-gap-words.test.tsx` (8a46e60). Not added: the reassign messages in `app.ts` ("Moved to ...", "Pair this browser again ...") and the stop-waiting reply.
- **Put through the rule.** Not wired, for the reason given under step 9. Needs an operator decision on different words on an open question.
- **Board answer on a put-off question.** `reduceHuman` refuses to answer a question put off with Not yet until the agent asks again. Design v2 section 3 says it can be answered. The store accepts it; the board does not. Unchanged in this step.
- **Store accepts Not yet after a committed answer.** `recordAnswer` does not check deferred outcomes. The board refuses first. Unchanged.
- **Dead export.** `rememberAgreed` has no caller. Kept, because it is part of the read-only decision; remove it when the agreed store is dropped.

## Decisions accepted by the operator

1. **Reassign allowed for a waiting answer, with the seven mitigations above.** The design said no (section 9, item 1); the operator accepted allowing it.
2. **Agreed-answers read-only for one release** (design section 5 and section 9, item 2). No copy of its hashes is made. Reads cover pre-upgrade answers, as 2b shows.

## Checks

- `bun x tsc --noEmit -p .` = 0 after b4be34c and after 8a46e60.
- Full unit suite (`bun test`, run by `just verify`): 1184 pass, 0 fail, 1200 tests in 130 files. Before step 9 I ran only the 32 tests in the rule, acceptance, word and agreement files (all pass). I did not run the full suite on the code before step 9, so the commit message's "before and after" overstates it.
- `just verify` exit 0. Output in `verify-6.out`, scanned for pairing-code and key text before saving: no matches.
- `just check-t05` ok. `just teeth-t05` ok (3 mutants, each caught).
- `bun run build:desk` ok (writes `dist/desk`, which is ignored by git).
