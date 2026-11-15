# Design v3 (accepted): durable questions, one write path

Source: GPT-6.1-sol design review, accepted by the operator 2026-11-07. Supersedes store-design-v2.md where they differ.

Make the durable store own questions from the moment they are asked. Make the board a view of that state, and give all changes one controlled write path.

1. **Diagnosis**

Issues 1–7 come from splitting one decision across several authorities: the board owns question wording and visibility; answer records own delivery state; guards own uniqueness; separate conversation writes describe what happened. Each part can be correct while their combination is wrong. Checks also become detached from the exact record versions they authorized. Issue 8 adds a separate mistake: finding a named step is treated as proof that an answer reached it. More checks around these boundaries will keep exposing new gaps; the boundaries themselves need changing.

2. **The design**

**Keep the existing Cognate store.** Use one durable record per panel, including its questions, plus a small desk record containing the ordered visible panel IDs. Scope identities to the operator. A panel record survives closing, removal and automatic eviction.

Each question has one permanent identity within its panel and stores:

- Its complete wording, choices, consequences, input kind and decision target, including `resolves`.
- Its original author and current owner as separate facts.
- Its state, answer, deferrals and delivery history.
- Its revision and the conversation row associated with its answer.

Create this record on the first put, before showing the question. The same identity always means the same question and target. Different wording or a different target requires a new question ID. Repeating an unchanged question preserves its answer or reopens a deferred question without losing history.

Use explicit states: **waiting for you, put off, waiting for the agent, finished, withdrawn**. Keep why it finished separately: the agent reported a destination, or the person stopped waiting. Derive compatibility fields such as `replied`; do not maintain several independently writable descriptions of the same state.

**Use one server and one short FIFO mutation queue.** Every panel mutation goes through it, including browser operations, agent operations and internal callers. Step acceptance must use the same ordering when checking whether an answer is waiting.

For each command: authenticate, read current records, apply the rules, prepare writes, commit, then publish the result. Check credentials again when the queued command runs. Keep slow optional destination lookups outside this queue; their results cannot authorize a mutation.

Every write carries the version of the **exact value used for its checks**. Never fetch a newer version and attach it to an older value. Reject conflicts and ask the caller to refresh. Refuse a second server against the same desk database; this design deliberately supports one local writer.

**Commit the answer and its conversation row together.** The installed store already supports atomic writes across collections. One commit changes the question, saves its answer, updates the panel’s presentation state and creates or updates the conversation row. Routing, withdrawal, reassignment and stopping waiting follow the same rule.

Use the store’s durable request deduplication: retrying the same request returns its original result; reusing its identifier with different contents is refused. A browser losing the response after a successful commit therefore causes neither a duplicate answer nor a missing row.

**Check ownership inside that transition.** Panel ownership controls panel editing. Question ownership controls reading its answer, withdrawal and routing. A panel edit cannot replace or omit a question owned by someone else. Closing a panel never releases either identity for another agent to claim.

Reassignment changes only the current owner. It preserves who originally asked, what the person answered and all earlier actions. Routing never writes ownership fields. Agents remain unable to answer, confirm, send or reassign for the person.

Require the browser’s question revision on every answer. That revision must cover the decision target and ownership changes, not merely displayed wording. Show the target in plain words alongside the question using the existing grammar.

**Keep reporting separate from proof.** Routing means “The agent says your answer went here.” A real step may provide a link labelled “Step found.” Neither the original nor a replacement owner earns “checked” status merely by naming it. That would require independent evidence tied to this answer and destination.

**Derive the board from durable records.** Keep at most eight visible panels, retain the existing pinning and safe eviction rules, and preserve folding after answers. Eviction changes visibility only. Step acceptance remains blocked exactly while an answer waits for the agent.

At startup, complete migration and load durable state before enabling mutations. Restore panels, folds, owners, deferred questions and outstanding waits. A failed load shows an error; it must never become an apparently empty desk.

**Migrate honestly.** Pause mutations and import legacy answers, guards and any agreement records through a repeatable, versioned migration. Seal every previously answered or cancelled identity, even without a guard. Preserve original records.

Missing wording, targets or owners remain unknown. Do not derive them from a newly submitted question. Conflicting legacy answers require operator review. Previously lost unanswered questions cannot be recovered without surviving evidence. Record missing conversation entries as recovered history, without claiming an unknown destination.

3. **What to delete**

After migration and cutover, remove:

- The writable `panelBoard` and replacement snapshots computed before an `await`.
- Answer guard records as a separate uniqueness mechanism; the question now owns that rule.
- Agreement-store writers and competing question fingerprints.
- Lifecycle and ownership decisions inside the UI reducers; retain pure presentation helpers.
- Separate panel-related conversation commits and their repair warnings.
- Optional caller-key bypasses and migration that silently closes ownerless waits.
- “Checked” promotion based on finding a step.

Retain legacy data read-only until migration is verified.

4. **The smallest first step**

First, introduce the single mutation entry point and queue around the complete existing panel operations. Include answer, put, remove, withdraw, route, reassign, stop-waiting and the acceptance boundary. This removes the current in-process interleavings before changing storage.

Prove it with controlled pauses, through real application entry points:

- Reassign first, then route with the old key: refused; ownership stays changed.
- Pause an answer during storage and submit a panel update: neither change disappears.
- Race two answers: exactly one succeeds.
- Queue acceptance after an answer: acceptance sees the outstanding wait.
- Fail one command: the next queued command still runs.

Then implement durable question creation and atomic answer/conversation writes as separate bounded steps. Add real SQLite restart and crash/retry tests for those steps.

5. **What I would not do**

I would add neither another database nor an independent event-processing system. The existing transaction boundary is sufficient. I would avoid a durable job queue, distributed locking and automatic retries of stale decisions: they add machinery without improving this single-operator model. Memory may accelerate rendering, but must never decide ownership or whether an answer exists.

6. **Open decisions**

- **Reassign outstanding answers?** Recommend yes, with explicit confirmation naming the new recipient and preserving history. Moving an unanswered question should also be supported.
- **Ownerless legacy waits?** Recommend keeping them waiting until the person reassigns or stops waiting. Migration must not make that choice.
- **Edit an existing question?** Recommend immutable meaning from first publication; use a new ID for changes.
- **Legacy retention?** Recommend a verified backup and read-only retention through one successful upgrade cycle before considering deletion.
hook: Stop
hook: Stop Completed
tokens used
91,428
Make the durable store own questions from the moment they are asked. Make the board a view of that state, and give all changes one controlled write path.

1. **Diagnosis**

Issues 1–7 come from splitting one decision across several authorities: the board owns question wording and visibility; answer records own delivery state; guards own uniqueness; separate conversation writes describe what happened. Each part can be correct while their combination is wrong. Checks also become detached from the exact record versions they authorized. Issue 8 adds a separate mistake: finding a named step is treated as proof that an answer reached it. More checks around these boundaries will keep exposing new gaps; the boundaries themselves need changing.

2. **The design**

**Keep the existing Cognate store.** Use one durable record per panel, including its questions, plus a small desk record containing the ordered visible panel IDs. Scope identities to the operator. A panel record survives closing, removal and automatic eviction.

Each question has one permanent identity within its panel and stores:

- Its complete wording, choices, consequences, input kind and decision target, including `resolves`.
- Its original author and current owner as separate facts.
- Its state, answer, deferrals and delivery history.
- Its revision and the conversation row associated with its answer.

Create this record on the first put, before showing the question. The same identity always means the same question and target. Different wording or a different target requires a new question ID. Repeating an unchanged question preserves its answer or reopens a deferred question without losing history.

Use explicit states: **waiting for you, put off, waiting for the agent, finished, withdrawn**. Keep why it finished separately: the agent reported a destination, or the person stopped waiting. Derive compatibility fields such as `replied`; do not maintain several independently writable descriptions of the same state.

**Use one server and one short FIFO mutation queue.** Every panel mutation goes through it, including browser operations, agent operations and internal callers. Step acceptance must use the same ordering when checking whether an answer is waiting.

For each command: authenticate, read current records, apply the rules, prepare writes, commit, then publish the result. Check credentials again when the queued command runs. Keep slow optional destination lookups outside this queue; their results cannot authorize a mutation.

Every write carries the version of the **exact value used for its checks**. Never fetch a newer version and attach it to an older value. Reject conflicts and ask the caller to refresh. Refuse a second server against the same desk database; this design deliberately supports one local writer.

**Commit the answer and its conversation row together.** The installed store already supports atomic writes across collections. One commit changes the question, saves its answer, updates the panel’s presentation state and creates or updates the conversation row. Routing, withdrawal, reassignment and stopping waiting follow the same rule.

Use the store’s durable request deduplication: retrying the same request returns its original result; reusing its identifier with different contents is refused. A browser losing the response after a successful commit therefore causes neither a duplicate answer nor a missing row.

**Check ownership inside that transition.** Panel ownership controls panel editing. Question ownership controls reading its answer, withdrawal and routing. A panel edit cannot replace or omit a question owned by someone else. Closing a panel never releases either identity for another agent to claim.

Reassignment changes only the current owner. It preserves who originally asked, what the person answered and all earlier actions. Routing never writes ownership fields. Agents remain unable to answer, confirm, send or reassign for the person.

Require the browser’s question revision on every answer. That revision must cover the decision target and ownership changes, not merely displayed wording. Show the target in plain words alongside the question using the existing grammar.

**Keep reporting separate from proof.** Routing means “The agent says your answer went here.” A real step may provide a link labelled “Step found.” Neither the original nor a replacement owner earns “checked” status merely by naming it. That would require independent evidence tied to this answer and destination.

**Derive the board from durable records.** Keep at most eight visible panels, retain the existing pinning and safe eviction rules, and preserve folding after answers. Eviction changes visibility only. Step acceptance remains blocked exactly while an answer waits for the agent.

At startup, complete migration and load durable state before enabling mutations. Restore panels, folds, owners, deferred questions and outstanding waits. A failed load shows an error; it must never become an apparently empty desk.

**Migrate honestly.** Pause mutations and import legacy answers, guards and any agreement records through a repeatable, versioned migration. Seal every previously answered or cancelled identity, even without a guard. Preserve original records.

Missing wording, targets or owners remain unknown. Do not derive them from a newly submitted question. Conflicting legacy answers require operator review. Previously lost unanswered questions cannot be recovered without surviving evidence. Record missing conversation entries as recovered history, without claiming an unknown destination.

3. **What to delete**

After migration and cutover, remove:

- The writable `panelBoard` and replacement snapshots computed before an `await`.
- Answer guard records as a separate uniqueness mechanism; the question now owns that rule.
- Agreement-store writers and competing question fingerprints.
- Lifecycle and ownership decisions inside the UI reducers; retain pure presentation helpers.
- Separate panel-related conversation commits and their repair warnings.
- Optional caller-key bypasses and migration that silently closes ownerless waits.
- “Checked” promotion based on finding a step.

Retain legacy data read-only until migration is verified.

4. **The smallest first step**

First, introduce the single mutation entry point and queue around the complete existing panel operations. Include answer, put, remove, withdraw, route, reassign, stop-waiting and the acceptance boundary. This removes the current in-process interleavings before changing storage.

Prove it with controlled pauses, through real application entry points:

- Reassign first, then route with the old key: refused; ownership stays changed.
- Pause an answer during storage and submit a panel update: neither change disappears.
- Race two answers: exactly one succeeds.
- Queue acceptance after an answer: acceptance sees the outstanding wait.
- Fail one command: the next queued command still runs.

Then implement durable question creation and atomic answer/conversation writes as separate bounded steps. Add real SQLite restart and crash/retry tests for those steps.

5. **What I would not do**

I would add neither another database nor an independent event-processing system. The existing transaction boundary is sufficient. I would avoid a durable job queue, distributed locking and automatic retries of stale decisions: they add machinery without improving this single-operator model. Memory may accelerate rendering, but must never decide ownership or whether an answer exists.

6. **Open decisions**

- **Reassign outstanding answers?** Recommend yes, with explicit confirmation naming the new recipient and preserving history. Moving an unanswered question should also be supported.
- **Ownerless legacy waits?** Recommend keeping them waiting until the person reassigns or stops waiting. Migration must not make that choice.
- **Edit an existing question?** Recommend immutable meaning from first publication; use a new ID for changes.
- **Legacy retention?** Recommend a verified backup and read-only retention through one successful upgrade cycle before considering deletion.
