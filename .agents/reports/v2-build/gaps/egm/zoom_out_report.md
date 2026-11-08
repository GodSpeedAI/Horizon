# Zoom-out review: store-design.md (answers and agent questions in one durable commit)

Reviewed: `.agents/reports/v2-build/gaps/store-design.md` (dated 2026-11-07). Code checked under `src/`. No edits made to the design.

## What is wrong, missing or risky

### 1. Major: the design adds a third home for answers and never mentions the one that already exists

Answers are already stored, durably and with version checks, in `horizon-panel-answers` (`src/capabilities/panel-answers.ts`, `PANEL_ANSWERS_COLLECTION`). That record already holds the answer, the question's owner key (`asked_by_key`), the question version, `replied` and `routed_as`. The acceptance block for a step reads that collection (`acceptanceBlocked`, `listAnswers`, used in `src/app.ts`). The route action writes it (`routeAnswer` / `markWhere`).

The design says none of this. It proposes a new `horizon-questions` record with its own `answer` and `routed_as` fields. Its migration covers only `horizon-agreed-answers`. After the change, the step-acceptance gate could still read the old answer record while the new code reads `horizon-questions`. Two sources of truth, and nothing says which one wins.

Ask the design to name one answer record and say what happens to `horizon-panel-answers`. If the answer record is extended instead of replaced, the new collection may not be needed.

### 2. Major: the design is larger than the bugs it fixes

The six problems in section 1 come down to one thing: an answer, its "agreed" record and its conversation row are written in separate steps. The store already commits several records in one call with a version check on each (`store.commit({ appends, records: [{ expectedVersion }] })`, as stated in the cognate-events README: "One atomic `commit` per decision, all of it or nothing"). `recordAnswer` already uses `expectedVersion`.

So the repair that fits the existing code is: put the answer record and the agreed record in one commit, and make the owner key part of the stored answer. That fixes the "answer saved but told Nothing was sent" bug (`src/app.ts`, the `rememberAgreed` call sits after `recordAnswer` in its own `try`, and its `catch` says "Nothing was sent" though the answer is already stored).

The design adds a collection, four new operations, a migration, a keeper-side change and a new panel-rebuild path. It does not explain why the smaller repair is not enough. Please justify the new collection against the smaller one, or cut it.

### 3. Major: "panels are rebuilt from horizon-questions at start" quietly adds panel persistence

Today the whole panel board is in memory only (`let panelBoard = NO_PANELS` in `src/app.ts`). Rebuilding panels from question records would only bring back the questions. Pins, titles, steps, notes, the panel cap, and non-question blocks would all be lost on restart, or the rebuild would invent defaults.

Section 6 treats this as a one-line migration step. It is a new feature: deciding what the store keeps about panels. Either say that panels stay in memory and only questions persist, or write the panel fields the rebuild needs.

### 4. Major: the word "version" means two different things

- Today a question's `version` is a content hash (`questionVersion` in `src/ui/surface2/panel-blocks.ts`). The person's page sends it back as `body.version`, and `reduceHuman` refuses a mismatch with "This question changed after you looked at it".
- The design's record field `version` is the store's own version number, used for expected-version checks.
- Section 4 says "expected version = the version the person saw". The page does not carry a store version today. Under the design's wording, a reader will assume either meaning.

Also, the existing stale check is optional: `if (op.version !== undefined && ...)`. A client that omits the version skips the check entirely. The design should require it.

### 5. Major: the conversation row is not really inside the commit

Section 3 says the conversation row "is written in the same commit". Today the row is built by `appendRow` in `src/capabilities/conversation.ts` after the answer is saved. Its content depends on the existing rows (`panelRowFor`, `answerRowFor`, `reduceConversation`). The app also has a fallback: if the row write fails, the reply says `recorded: false` with `NOT_RECORDED_WORDS`.

The design does not say how the row is built inside the commit, and does not say that the `recorded: false` path goes away. Section 5 claims "no reconciliation path", which is not true until that is done.

### 6. Major: the design's remove rule does not stop key B taking key A's question

Section 8 requires "Key B cannot remove and recreate key A's question". Section 4 says removing a panel "removes the panel view only" and gives no owner rule for it.

Today `arrange` with `surface.remove` in `src/ui/desk/panels-model.ts` (around line 180) has no key check at all. Only `answer.route` and `ask.withdraw` are checked against the owner key, in `src/app.ts` (around line 1911).

The owner-key rule in section 4 ("Put") protects recreation only if the stored record survives the removal. That is what the design says, so the test is possible. But the design should state the remove rule for a non-owner key, because the current code allows it and the test list assumes otherwise.

### 7. Major: the design leaves open a behaviour change for owners

Section 4 says that when a question record exists, the put must match the fingerprint. The design does not say this applies only to answered questions. Read literally, the owning agent could never reword an open, unanswered question. Today that is allowed: a changed question with the same id replaces the old block. Either this is a deliberate tightening, which the design should say and justify, or the rule should be limited to answered questions.

### 8. Minor: the double-answer race is real, and the design's wording should say why

The design says two answers can both succeed. That is correct. The cause in the code: `reduceHuman` runs on the in-memory board, then the request awaits `recordAnswer`, and only after that sets `panelBoard`. Two concurrent requests both pass the check. `recordAnswer` numbers answers as `answer:<panel>:<n>`, so both get stored. The design should name this cause, since the fix is an expected-version check on the answer record, not just "a second answer is refused".

### 9. Nit: key and fingerprint details do not match the code

- The design's key is `<tenant>|<panel_id>|<ask_id>`. The existing agreed key is `agreed:<panel>:<ask>` with no tenant. The migration needs to say how old keys map to new ones.
- Section 3 says the fingerprint includes "the step it resolves". The existing `agreedFingerprint` includes `resolves` but not a step field. Say which is meant.

### 10. Nit: the losing route call is not described

Section 8 says "exactly one succeeds". It does not say what the other caller gets. Today a lost version race inside `markWhere` throws, and `routeAnswer` does not catch it. The design should say the loser gets a refusal in words.

### 11. Nit: process detail in a design

Section 9 assigns Haiku agents and a blind Codex review. That is a work plan, not a design. Move it out of the design.

## Summary of the altitude problem

The design is written at the right level in sections 2 and 4. The trouble is that it does not look at what is already in the code. The existing answer collection, the existing expected-version commits, and the existing owner and version checks cover most of the rules it introduces. A reviewer who reads only the design would build a second copy. Before building, the design should list the existing records it replaces or keeps, and justify the new collection against extending `horizon-panel-answers`.
