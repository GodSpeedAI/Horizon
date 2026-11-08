# Desk gaps: what changed, what was checked, what was not done

Branch horizon-desk-gaps, from origin/main at 822e349. One commit per item, in order. Every claim was checked against the code first; all nine were true for the code as it stood.

## 1. Human writes trust any local caller
- Changed: the desk page now carries a random write token (a meta tag in the served page, new on every start). These routes need it, sent back in `x-horizon-write`: /desk/handoff, /desk/handoff/preview (when the caller is not an agent), /desk/decide, /desk/note, /desk/draft, /desk/panels/op, /desk/conversation/discard, /desk/start, /desk/lesson, /intent, /surface/intent. No token or a wrong token is refused with "This did not come from the desk page, so nothing was changed. Reload the desk page and try again." The agent header is still refused first. /agent/panels keeps its own key and ignores the page token. The page script adds the token to its own writes and never to a call marked as an agent's.
- Tests: test/desk-write-token.test.ts (missing, forged, the page's own token accepted, agent header alone refused, agent header plus token still refused, agent door unaffected). Test clients now behave like the page: bunfig.toml loads test/support/write-token.ts, which reads the token from /desk before a write; a request with `x-test-no-token` skips it. scripts/teeth-t05-equivalence.ts reads the token the same way.
- Limit, stated plainly: a process on this machine that can read the desk page can still act as the operator (the single-operator model). This is a boundary against accidental and cross-origin writes and against callers that never loaded the page, not a sandbox. The token is in the HTML, not an HttpOnly cookie, because the page script has to send it.
- Not covered: /workspace/intent and other /workspace form posts (not in the list given); they keep the existing Host and Origin checks.

## 2. "I routed it" counts as proof
- Changed: the conversation row now reads "The agent says it took it to: ...". If the words name a step id that the case keeper really holds, the row adds "Checked: the step "<name>" is in the case "<title>"." and carries the step and case as links, and is marked Done. Otherwise it says "Not checked: Horizon found no step with that name." and gets a new status, Agent says so (`claimed`), shown apart from Done. The question block and the folded panel line say "The agent says it took it to:". Acceptance blocking is unchanged.
- Tests: test/desk-route-claim.test.ts; older tests updated for the new wording.
- Note: only step ids are checked, not decision ids (approval ids); the brief said "step or decision id" and I did the step.

## 3. A changed question erases the agreement
- Changed: each question gets a version (a 14 character fingerprint of question text, options, consequences and input kind) when it is put up. The page sends the version it showed; a mismatch is refused with "This question changed after you looked at it. Look again, then answer." The version is stored with the answer and shown to the agent in its responses. An agent cannot change (ask_human or show_surface) a question the person answered; it is refused with "The person already answered this question, so it cannot be changed. Ask a new question with a different id." Putting up the identical question again keeps the answer. A question the person put off or skipped starts again when the agent changes it.
- Tests: test/desk-question-version.test.ts.
- Note: an answer sent with no version at all is still accepted (older callers). The page always sends it.

## 4. Recording failures are silent
- Changed: the row write reports success or failure. When the move was done but its row could not be written, the answer carries `recorded: false` and `recorded_words` ("This was done, but it could not be added to the conversation. Check the desk log."). Covered: notes, answers to agent questions, Decide, hand off preview and send. The page adds the words to the status line.
- Tests: test/desk-recorded.test.ts, with a store whose conversation writes fail.
- NOT DONE: rebuilding a missing row after a crash between the action and the record. It is not small: it needs a replay of each durable action into rows and a rule for rows already there. Reported as not done.
- Not tested: the status-line wording itself in the browser script (it is a one-line append in the page script).

## 5. "Done" hides partial success
- Changed: a sent hand off row has stages: Sent, Started, Given to an agent (only if asked), Result seen. Each shows its own word (Yes, Failed, Not seen yet) and its own plain sentence. A failed Started offers Try again (it starts the case again); a failed Given to an agent offers Open the step (goes to Work). The row as a whole reads Partly done when any stage failed. Result seen turns to Yes only when the case keeper shows the step finished, checked each time the conversation is read; nothing is stored for it.
- Tests: test/desk-handoff-stages.test.tsx (all good, no agent asked, start failed, assign failed, result seen).

## 6. Waiting work below the 200 row limit
- Changed: the window keeps every row still waiting, then the newest others up to 200 in all (more than 200 waiting are all kept). An agent may leave at most 20 suggestions waiting on one case; the 21st is refused with "This case already has 20 suggestions waiting. Confirm or discard some first." Asking again about a draft that already has a waiting suggestion changes that one and is not counted twice.
- Tests: test/desk-window.test.ts.

## 7. Not yet, Skip, withdraw
- Changed: one sentence beside each control (Answer, Not yet, Skip) and on a withdrawn question, with the wording from the brief. An agent cannot withdraw a question that names the decision it settles. The grammar is frozen and has no "required" field, so "required decision" is a question with `resolves` set. The person can still skip it or close the panel.
- Tests: test/desk-control-words.test.tsx.

## 8. Presenting is not access control
- Changed: for an agent on the page, /desk/state.json is now a summary: case titles, step names, open items (decisions, open questions), counts, the agent's own waiting suggestions, and only notes marked shared. /desk/search returns case titles, counts and shared notes. /desk/conversation keeps the agent's own rows and strips the words from your rows. desk_inspect returns the row and a sentence, with nothing nested under it. Other desk reads (work, decide, lessons, draft, remote) are refused for an agent on the page. Notes have a new "Let agents read this note" setting (off by default, set only by the person; an agent cannot save a note). Presenting still swaps repository names in all of it.
- The agent door's reads: this note used to say /agent/panels/answers returned only that agent's own answers. That was false: it filtered by tenant and reply status only, so one agent could read another agent's answers (reproduced by the blind critic). Corrected in the fix after the first nine: each question now records the agent that first put it up (the name in `x-horizon-agent-name`, or "unnamed agent" when none is sent; it never changes on a later put), and `read_responses`, `answer.route` and `ask.withdraw` work only for that agent. Answers saved before this change carry no asker and are read by no agent. The key is shared, so two agents that send the same name, or none, are the same agent to Horizon. The catalogue is not private.
- Tests: test/desk-agent-reads.test.tsx.

## 9. Confirm does not explain the commitment
- Changed: a shared block above the button shows Action, Destination, What happens next and Can be undone. It is on the hand off preview, the agent's suggested hand off card (and your own waiting preview), and every Decide preview. Buttons are named for the action: "Send step to agent", "Add step to the case", "Run a review", "Preview this hand off", and the Decide choice names ("Accept: allow this move" and so on). A card that only opens a preview says that opening it sends nothing and that a sent step cannot be undone.
- Tests: test/desk-commitment.test.tsx; test/desk-gap-words.test.tsx runs the word scan over all the new sentences and a conversation with stages.

## Checks
See verify.out. `just verify` exit 0 (1028 pass, 16 skip, 0 fail in the unit suite), `just check-t05` 0, `just teeth-t05` 0, `bun run build:desk` 0, `bun x tsc --noEmit -p .` clean after each commit.

## Worktree note
The worktree had no node_modules; I ran `bun install --frozen-lockfile` in it (installs only what the lockfile names; the symlinked copy from the main checkout was an older Cognate version and failed). The operator's checkout and desk were not touched.
