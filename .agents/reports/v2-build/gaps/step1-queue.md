# Step 1: one queue for every panel command

Design reference: `design-v3.md`, section 4 "The smallest first step".

## What changed

Every panel command now waits in one first-in, first-out queue and runs alone. The queue is a small helper inside `createApplication` in `src/app.ts`. It chains each command after the one before it. If a command fails, the queue records that and moves on, so the next command still runs. Nothing else about the commands changed: the same rules, the same words, the same store writes, the same board updates.

The queue wraps these operations:

- **Agent door** (`POST /agent/panels`, and `GET /agent/panels/answers`): the whole request runs as one queued command. The agent key is checked inside the command, so it is checked when the command runs, not when it was queued. The tool call itself goes through `applyAgentOpNow`. This covers put (`show_surface`, `ask_human`), remove and annotate (`arrange`, `annotate`), withdraw (`ask.withdraw`) and route (`answer.route`).
- **Application entry point** `applyAgentOp` (used by in-process callers and tests): queued the same way.
- **Desk panel routes** (`POST /desk/panels/op`): the whole request runs as one queued command. This covers answer (`human.answer`), reassign owner (`human.reassign_owner`), stop waiting (`human.stop_waiting`), and pin, close and open.
- **Step acceptance** (`POST /desk/decide`): the card lookup and the accept, reject, hold and release decision run as one queued command, so acceptance reads the outstanding waits after every earlier command.

Reads are not queued. The board, state and conversation reads, and the decision list, still read directly from the store, as before.

## Tests

New file: `test/desk-mutation-queue.test.ts`, five tests, all through the application's own entry points. A helper holds one write to the panel answers collection at the store, so other commands arrive while it is in progress.

1. Reassign first, then route with the old key: the route is refused and the new owner's route is accepted afterwards.
2. An answer held in its store write, then a panel update submitted: both survive on the board, and the answer's wait is still listed.
3. Two answers raced at one question: one succeeds (200), the other is refused (409).
4. An accept sent while an answer is held in its store write: the accept is refused because it sees the wait the answer creates. The case keeper is not called.
5. A held answer whose store writes fail: the answer returns 500, and the next queued panel put still runs.

Results with the queue: the new file, 5 pass, 0 fail.

Discrimination check: with the queue temporarily turned into a pass-through, tests 1, 2 and 4 fail, so they do prove the ordering. Tests 3 and 5 still pass without the queue. Test 3 is already safe because the store refuses the second commit. Test 5 is a failure-handling check that holds in both cases. Both are kept as the brief asks.

Full suite (`bun test`, run once before the commit): 1189 pass, 16 skip, 0 fail, 1205 tests across 131 files.
Type check (`bun x tsc --noEmit -p .`): exit 0.

## Not done in this step

- No storage change. Questions are not yet durable records. Atomic answer-and-conversation writes, durable question creation, deduplication of retried requests, version checks, the migration and the restart tests are later steps.
- The desk's own router still checks the paired cookie before a request reaches the queue. The pairing age check for reassign runs inside the queued command.
- The queue lives in one process. It does not guard against a second server on the same database; the design's single-writer refusal is a later step.
- Acceptance holds the queue while the case keeper call runs, so a slow keeper call delays panel commands. Moving that call out of the queue needs the design's split between slow lookups and mutations, which is later work.
- The agent door reads the request body inside the queued command, so a slow client could hold the queue. This is acceptable for a single local operator; it should be revisited with the durable store.
- No change to the wording of any refusal or message, and no change to the reducers in `src/ui/desk/panels-model.ts` or to `src/capabilities/question-rules.ts`.
