# Design critic review: store-design.md

Target: /home/sprime01/projects/Horizon-gaps/.agents/reports/v2-build/gaps/store-design.md
Standard: feature-spec-standard.md (Alternatives Rule, Risks and Limits, required sections)
Code checked: src/capabilities/panel-answers.ts, src/capabilities/conversation.ts, src/ui/desk/panels-model.ts, src/app.ts (deskPanelOp, around lines 1910-2050), notes.md "Third round".

Summary: the design correctly names the core problem (the answer, its second-step protection record, and the owner live in different places). But it fails the feature-spec standard on alternatives, has a self-contradiction on deferred answers, leaves no way to recover from a lost agent key, and drops two behaviours the code already has (stop waiting, and panel-level ownership). Fix these before any build agent starts.

---

## 1. Blocker: a deferred answer can never be re-answered

Problem. Section 3 says `answer` is "written once per answer; later answers are refused", and `answer` can hold outcome `deferred` (section 3 record shape, and section 4 "Answer"). Section 4 "Put a question" says a matching fingerprint "re-opens a deferred question and keeps `answer` as history". These two rules cannot both hold: a deferred question has a non-null `answer`, so the reopened question can never accept a real answer.

Failing scenario. Monday, the person clicks "Not yet" on question Q (outcome deferred, so `answer` is set). Tuesday, the agent re-puts the same Q unchanged. The design reopens it. The person clicks "Yes". Section 4 refuses: "a second answer to an answered question is refused". The person is stuck on a question they cannot answer, and the step stays blocked.

Fix. Keep `deferred` out of the one-shot `answer` slot. Store deferral as history (a list `history` of past outcomes) and keep `answer` null until an outcome of `answered` or `cancelled` is committed. Write this as an explicit rule and add a test: defer, re-put unchanged, answer, expect success.

---

## 2. Blocker: no recovery when an agent's key is lost or replaced

Problem. `owner_key` is "never changed" (section 3). Section 4 refuses any Put, Route, or Withdraw from another key. The design has no operation to move ownership, and no rule for a key that is retired. Current code already blocks acceptance of a step while any answer has `replied: false` (panel-answers.ts, `acceptanceBlocked`), so a waiting answer whose owner key is gone blocks the step forever.

Failing scenario. The operator regenerates the agent door key, or reinstalls the agent. The agent with the new key cannot Route the answer the person already sent (owner mismatch). The answer stays "Waiting for the agent". The step cannot be accepted. No button in the design fixes it.

Fix. Add two operations to the design: (a) "Reassign owner", available only to the person through the paired desk, recorded as a conversation row, and allowed only for a question with no answer or a routed answer; (b) "Stop waiting" (see finding 3), which the person can always use. Add a test: rotate key, route refused, reassign, route accepted.

---

## 3. Major: "Stop waiting" is dropped

Problem. The code has `human.stop_waiting` (app.ts, deskPanelOp) which calls `stopWaiting` in panel-answers.ts. It closes every open answer for a step and sets `replied` to true with the words "You chose to stop waiting for the agent." The design's operation list (section 4) has no such operation, and section 3 has no `replied` or equivalent field. It is not stated what happens to this behaviour.

Failing scenario. The agent crashes after the person answers. The person clicks "Stop waiting" to unblock the step. After the rebuild, no operation writes the closure, so the step stays blocked and the button has no effect.

Fix. Add "Stop waiting (human)" to section 4 as one commit: the answer's `routed_as` set to the stop words, expected version = current. Add a line to section 3 saying which field makes a question count as "waiting" for acceptance, so the acceptance rule is defined in one place.

---

## 4. Major: panel-level ownership is not covered

Problem. The design protects questions per record (`<tenant>|<panel_id>|<ask_id>`). It does not protect the panel. In panels-model.ts, `show_surface` on an existing panel replaces that panel's blocks with the blocks the caller sent. Only answered questions are protected (the loop before `kept`). An unanswered question owned by another key is removed from the card.

Failing scenario. Agent A puts question Q1 on panel P (unanswered). Agent B sends `show_surface` with id P and its own blocks. Q1 vanishes from the card. The person can no longer answer it. The store still has Q1 owned by A, so no one can route its answer, and the person has no screen to see why.

Fix. Add `panel_owner_key` to the design, set on first creation and checked on every `show_surface` and `ask_human` to that panel. A different key gets a refusal ("That panel belongs to another agent."). Also state that `show_surface` cannot remove an unanswered question; it can only close the panel by the owner (the open item "arrange surface.remove" in notes.md needs the same rule).

---

## 5. Major: the migration source does not hold the data the design says it does

Problem. Section 6 says existing `horizon-agreed-answers` rows are copied with `owner_key` set to "the key that answered them". The agreed record stores `{tenant, panel_id, ask, fingerprint, at}` only (panel-answers.ts, `rememberAgreed`). It has no key. The answer records carry `asked_by_key` (the asker), and older answers have none (their own comment says so). So the answering key is not recorded anywhere. Also section 6 ignores `horizon-panel-answers`, the collection that holds `replied`.

Failing scenario. After migration, every old question gets `owner_key: unknown`, and any unanswered old answer keeps `replied: false`. Nobody can route them. Acceptance of those steps stays blocked after the upgrade.

Fix. Read the owner from `asked_by_key` on the answer record, not from the agreed row. For answers with no key, set `replied: true` with words "Answered before the upgrade; the owner was not recorded." Add a migration test that covers an unrouted pre-upgrade answer, so it cannot block acceptance after the upgrade.

---

## 6. Major: the problem statement is partly out of date, and one real gap is stated wrongly

Problem. Section 1 bullet 6 says the `resolves` target is outside the fingerprint. The current `agreedFingerprint` (panel-answers.ts) already includes `q.resolves`, and notes.md (second round, item 3) says it was fixed. The real gap is different: `recordAnswer` does not check whether the question already has an answer. It creates a new `n` each time and commits with `expectedVersion: 0` on a new id. Two answers to the same question can both succeed. Section 1 bullet 4 describes this in the design's own words, but the mechanism it names ("nothing checks the first one under the same version") is not the actual cause.

Failing scenario. Two browser tabs answer the same question at once. Both calls create answer records `n=1` and `n=2`. Both succeed. Routing closes both. The design's test "Two concurrent answers: exactly one stored" would catch this, but the problem statement would send a build agent after the wrong fix.

Fix. Rewrite section 1 bullet 6 to say the fingerprint already covers `resolves`, and rewrite bullet 4 to name the real cause: no per-question check before creating a new answer record.

---

## 7. Major: the spec fails the feature-spec standard

Problem. The standard requires a mandatory Alternatives Considered section with rejected options and reasons. The design has none. It also has no Goals and Non-Goals section, no component layout or data-flow diagram, and no security or scalability section (section 7 is a partial list of things not solved). The Work split (section 9) is a process plan, not design content.

Failing scenario. A reviewer asks why one record per question was chosen over keeping `horizon-panel-answers` and adding a reconcile job, or over using the store's commit idempotency key (the store supports it: see the events conformance tests). The document has no answer, so the reviewer cannot confirm the choice was made on purpose.

Fix. Add sections: Goals and Non-Goals; Alternatives Considered, with at least (a) a reconcile job over the current two collections, (b) per-commit idempotency keys over the current records, (c) one record per question (chosen), each with a stated rejection reason; Risks and Mitigations, covering the findings in this review; and a short data-flow description of the new commit path.

---

## 8. Major: scale is not addressed

Problem. The store here is queried by tenant and then filtered in memory. `recordAnswer` and `markWhere` call `listAnswers`, which loads every answer for the tenant. `appendRow` calls `everyRow`, which loads every conversation row for the tenant. The design adds "panels rebuilt from horizon-questions at start" with no bound and no note on how many questions a tenant can accumulate. Each operation reads all records.

Failing scenario. A tenant with several thousand past answers. Every new answer reads all of them before writing. Start-up reads all questions into memory. The design gives no limit and no query by key.

Fix. State the expected size (for example, questions per tenant per month), query by panel id or by key prefix instead of a full tenant scan, and load only open questions at start. Add a test or measurement target (for example, an answer write stays under a fixed number of reads with 10,000 history rows).

---

## 9. Major: the "same commit" conversation row is not guaranteed to be single

Problem. Section 4 says the conversation row is written in the same commit as the answer. The current `appendRow` finds an existing row by reading first (`panelRowFor`, `answerRowFor`), then writes a new row when none is found. The design does not say how the row is found inside the commit, or what its id is. Two concurrent answers can each find "no row" and each create one.

Failing scenario. Two answers to the same question race. Both commits succeed (the answer record check is fixed by the design, but the row is not). The conversation shows two answer rows for one question.

Fix. Give the answer row a deterministic id derived from the question record key (for example `answer-row:<tenant>|<panel>|<ask>`) and include its expected version in the commit. The store then refuses the second write, and the row cannot be duplicated.

---

## 10. Nit: "version" is used for two different things

Problem. Section 3 lists `version` as "the store's own version", but section 4 says the human answer's expected version is "the version the person saw". The code uses `askBlock.version`, a 14-character content fingerprint, for the human's check (app.ts, `body.version`), not the store's record version.

Failing scenario. A build agent uses the store's version for both checks. A person's stale answer to changed wording passes the store check, because the stored record version has not moved.

Fix. Name them apart: `content_version` (what the person saw, a fingerprint) and `version` (the store's record version). State which check uses which.

---

## Scope of this review

Checked: the design against the standard, the problem statement against panel-answers.ts, conversation.ts, panels-model.ts and app.ts, and the open items in notes.md. Not checked: the store's commit semantics beyond the conformance tests, the paired-desk UI wording, and whether the Haiku work split is feasible. The design is read-only in this review and was not edited.
