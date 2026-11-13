# Comprehension review: store-design.md (answers and agent questions in one durable commit)

Mode: REVIEW. Target: `/home/sprime01/projects/Horizon-gaps/.agents/reports/v2-build/gaps/store-design.md`, whole document. Reader: naive team member, no project history.

**What this proposes**

The design replaces the split way questions and answers are saved with one rule: every change to a question (its answer, owner, withdrawal, or the question being put up) is a single all-or-nothing write to a durable store. Each write checks a version number on every record it touches, so a stale write is refused, and the store, not memory, is the authority. Each question gets one record in a new collection, holding its owner key, a fingerprint, the answer, a withdrawn flag and a version. Removing a panel only removes the view. Old answers are copied across in a migration, and hand-off stages are left out of scope.

**How the existing system works, per this document**

Questions live only in memory (`panels-model.ts`), so a restart or a removal loses them. A separate record, `horizon-agreed-answers`, keeps a fingerprint of each answered question and is written in a second step after the answer. If that second step fails, the answer exists without its protection and the desk says "Nothing was sent" when it was saved. Two answers to the same question can both succeed, and a question's owner is read from memory, so a removed and recreated question can pass to another key.

## Findings

### 1. Route operation cannot be restated
- **Severity:** Blocker
- **Affected scope:** Section 4, "Route (agent)"; Section 3, `answer.routed_as` and `answer.routed_by_key`.
- **Discrepancy:** The reader can see that routing checks the caller's key against `owner_key`, sets `routed_as`, and updates the conversation row. The reader cannot say what routing does for the person or the agent. It is not stated who receives the routed answer, what happens next, or what a route is. Without that, the operation cannot be restated or built.

### 2. The durable store is never identified
- **Severity:** Major
- **Affected scope:** Sections 2, 3, 4, 5 ("the durable store", "the store decides", "the store's own version", "the store refuses a commit", "store module").
- **Discrepancy:** The reader does not know which system the store is, where it runs, or whether it is the same system as the keeper (Section 7). The design also depends on one commit spanning two collections (`horizon-questions` and `horizon-conversation`). It never states that the store supports this. A reader cannot tell whether the atomic guarantee holds.

### 3. "The desk" and "Horizon desk" are undefined
- **Severity:** Major
- **Affected scope:** Header ("Owner: Horizon desk"); Sections 1, 5, 9 ("Desk words and status lines").
- **Discrepancy:** The desk is used as the actor that shows pages, says "done", crashes, and restarts. It is also named as the owner. A naive reader cannot tell whether the desk is a person, a team, a screen, or a program. The reader cannot tell who is responsible for the design.

### 4. Actors are missing or unlabelled on several operations
- **Severity:** Major
- **Affected scope:** Section 4, "Put a question", "Remove a panel"; Section 4 labels "(human)", "(agent)" appear on some operations only.
- **Discrepancy:** The design does not say who performs "Put a question" (it lists `ask_human` and `show_surface` with an ask, which are names, not actors). It does not say who removes a panel, whether the person or the agent. The reader must guess who acts in each case.

### 5. "Key" and "agent key" are never explained
- **Severity:** Major
- **Affected scope:** Sections 1, 3, 4, 8 ("agent key id", "caller's key", "owner_key", "Key B", "key A").
- **Discrepancy:** The design depends on the idea that each question belongs to a key and that only that key can change it. The reader is never told what an agent key is, who issues it, how it relates to a person, or where it is checked. The migration also refers to an owner of "unknown" with no explanation of the key system behind it.

### 6. Core project terms are used without definition
- **Severity:** Major
- **Affected scope:** Throughout. Most important: "panel", "panel_id", "ask", "ask_id", "question" (as distinct from "ask"), "tenant", "surface", "step", "resolves", "required question", "deferred question", "keeper", "plan revision", "hand-off stage".
- **Discrepancy:** Each of these carries weight in a rule. "Required question" decides whether a question can be withdrawn. "Deferred question" is the state a matching re-put returns to. "Resolves" and "step" decide the fingerprint, which decides refusal. None is defined inline or linked, and the reader cannot find them elsewhere in the document.
- **Note:** Peripheral items (blind review, third round, notes.md, Haiku, Codex, "pair", "operator") are covered under findings 13 and 16 and are Nits.

### 7. The "deferred" state is never defined
- **Severity:** Major
- **Affected scope:** Section 4, "Put a question": "A matching fingerprint re-opens a deferred question."
- **Discrepancy:** The records table (Section 3) has no state called deferred. The reader cannot tell how a question becomes deferred, what the person sees while it is deferred, or what re-opening changes. The phrase "keeps `answer` as history" also does not say where the history is shown.

### 8. Fingerprint mismatch outcome is not stated for "Put a question"
- **Severity:** Major
- **Affected scope:** Section 4, "Put a question"; Section 3, `fingerprint` ("Never changed once answered").
- **Discrepancy:** The design says the fingerprint "must match" when a question already exists. It does not say what happens when it does not. The reader cannot tell whether the put is refused, whether a new question replaces the old one, or what the person sees. The rule "never changed once answered" implies that an unanswered question's fingerprint may change, but the design does not say what that means for the person.

### 9. Withdrawal effects are unstated
- **Severity:** Major
- **Affected scope:** Section 3, `withdrawn`; Section 4, "Withdraw".
- **Discrepancy:** The design says the owner key can withdraw a non-required question that has no answer. It does not say whether the withdrawn question disappears from the person's screen, stays visible with a reason, or whether the reason (`reason`) is shown anywhere. The reader cannot tell what the person experiences.

### 10. "Outcome" and "routed_as" values are not listed
- **Severity:** Major
- **Affected scope:** Section 3, `answer` ("`{ value, outcome, answered_at, routed_as, routed_by_key }`").
- **Discrepancy:** The fields are named but their possible values are not. The reader cannot tell what an outcome can be or what routed_as holds. This matters for finding 1, because the route operation depends on these values.

### 11. "Protection" is used without saying it is replaced
- **Severity:** Major
- **Affected scope:** Section 1 (bullet 2 and bullet 3, "without its protection"), Section 2 ("its protection").
- **Discrepancy:** The rule in Section 2 refers to "its protection" as if the reader already knows what protection is. The reader must infer that protection means the fingerprint record in `horizon-agreed-answers`, and that the fingerprint moves into `horizon-questions`. The design never says that the old record stops being the source of protection. Section 6 keeps the old collection read-only, which implies this, but the reader has to assemble it.

### 12. Expected version mechanism is not explained
- **Severity:** Major
- **Affected scope:** Section 4, "Answer": "expected version = the version the person saw."
- **Discrepancy:** The design does not say how a version reaches the person's view or how the desk carries it into the answer. It is also unclear whether the version is per question or per store. The reader cannot tell what the desk must change to make the stale-answer refusal work.

### 13. Conversation row is unclear
- **Severity:** Major
- **Affected scope:** Section 3 ("keeps its own record in `horizon-conversation`, as today"); Section 4, "Answer" ("conversation row"); Section 5 ("A conversation row that cannot be written with the commit: none").
- **Discrepancy:** The reader does not know what a conversation row holds or what "as today" means, because today's behaviour is not described. The sentence in Section 5 is hard to parse. It seems to say that no conversation row can fail to be written, because it is in the same commit, but the reader has to work this out.

### 14. Migration leaves consequences open
- **Severity:** Major
- **Affected scope:** Section 6.
- **Discrepancy:** Three things are unstated. (a) Rows with owner "unknown", which the design says "nobody can route", are not said to be dead, hidden, or shown to the person, and the reader cannot tell what the person sees. (b) The migrated fingerprint may not match the new fingerprint, which now includes `resolves` and the step. The design does not say whether old answers still protect anything. (c) "For one release" does not say which release.

### 15. Section 7 dependency on the keeper is not explained
- **Severity:** Major
- **Affected scope:** Section 7 ("the keeper-side precondition", "a plan revision the keeper checks", "a keeper change, not a desk change").
- **Discrepancy:** The reader cannot tell what the keeper is, who owns it, what a plan revision is, or what the "start only the named steps" fix does. The design says the fix is out of scope, but it is unclear whether the design can ship without it. The reader also cannot tell what the person would see if the keeper change were missing.

### 16. Section 7 last bullet is unclear
- **Severity:** Nit
- **Affected scope:** Section 7, last bullet ("A local program that can read the operator's terminal can still pair. Stated limit, unchanged.").
- **Discrepancy:** "Pair", "operator" and "terminal" are undefined. "Unchanged" implies a comparison with an earlier version of the design that the reader does not have.

### 17. "Remove" means two things in the document
- **Severity:** Major
- **Affected scope:** Section 4, "Remove a panel" (view only, record stays); Section 8, last test ("Key B cannot remove and recreate key A's question").
- **Discrepancy:** In Section 4, removing a panel never deletes the question record. In Section 8, "remove and recreate" a question implies that a question can be removed. The reader cannot tell whether removing a question is an operation the design allows, or whether the test refers only to removing a panel. The test is not clear about what is being refused.

### 18. Decided and open items are not separated
- **Severity:** Major
- **Affected scope:** Whole document. Status line says "proposed, not built."
- **Discrepancy:** Sections 2 to 6 read as settled rules. Section 7 lists what is not solved. Nothing marks which items are decided and which are open. Open items that a naive reader would notice include: the store product and its multi-collection commit support (finding 2), the hash used for the fingerprint, the handling of "unknown" owners (finding 14), the meaning of "required question" (finding 6), the keeper precondition (finding 15), and whether the Codex review (Section 9, step 4) can change the design. The reader cannot tell which parts are fixed.

### 19. Work split is hard to follow
- **Severity:** Nit
- **Affected scope:** Section 9.
- **Discrepancy:** "One Haiku agent," "one Haiku agent after 1," and "Blind Codex review" name tools and models without saying what they are or why each step depends on the one before. "Desk words and status lines for the refusals" does not say what is being written. The reader can see the order but not the reason for it.

### 20. Peripheral references point outside the document
- **Severity:** Nit
- **Affected scope:** Section 1 header ("see notes.md, 'Third round' and its open items"), Section 9.
- **Discrepancy:** The problem source is in a file the reader does not have. Some of the problem statement depends on that file. The reader cannot check the claims in Section 1 against it.
