SUMMARY (120 words or fewer)
Reviewed /home/sprime01/projects/Horizon/.agents/specs/Horizon_Operator_Workspace_Design_v2.md (559 lines, read in full) against the owner's no-jargon rule and the §2 glossary. Findings: 13 RED, 28 YELLOW, 8 GREEN. Most serious: file names in the body (l.5–7); the "no importer" rule (§7.4) contradicts the GitHub connector (§7.5); §9.1 says the witness can never be deleted, yet the clear command deletes "every file" including its witness record; §5.1 and §10 disagree on whether exports hide names; "case keeper", "workshop" and "label" are undefined or used in several senses.
The requested report file was NOT written. I have no write tool, and report files are barred in this run. The full report follows.

NOTES ON FORMAT
- Line numbers are the file's own line numbers (cat -n).
- Tags are RED, YELLOW, GREEN in place of emoji, per the no-emoji rule. Mapping to the persona's scale: RED = Blocker, YELLOW = Major, GREEN = Nit.
- Annex and other files were not reviewed; they are not standards for this review.

=====================================================
RED
=====================================================

R1. Header, l.5–7. File names in the body, and the header contradicts itself.
Quote l.5: "holds every file name, command and code fact. This document holds none, so anyone can read it."
Quote l.6: "`.agents/reports/2026-11-06-operator-workspace-egm-review/goldfish_review_report.md`"
Quote l.7: "`docs/design/reference/godspeed_terminal_v3.html`"
Rewrite l.5: "Companion document: the technical annex, kept with this one. It holds the file names, commands and technical facts, so this document holds none of them."
Rewrite l.6: "How the review findings were settled: the 6 November 2026 review report, kept with the project's review records."
Rewrite l.7: "Visual reference: the operator's third screen mockup, kept with the design files."

R2. §7.4 vs §7.5 vs §11 vs §12. "No importer" conflicts with the GitHub connector.
Quote l.405: "There is no importer and no second list to keep in step."
Quote l.422: "a small connector watches marked issues and adds them as steps through the same door as Hand off."
Quote l.520 (§11): "A separate ticket list or importer | Not built."
Quote l.536–537 (§12): "An importer (a second path that drifts)" is turned down, and "Issues come in as steps" is chosen.
Problem: a connector that adds GitHub issues as steps is an importer. §11 and §12 reject importers outright.
Rewrite l.405: "The case keeper is the only list of work. Tickets from the agent tool go into it directly. The one exception is GitHub: a connector copies marked GitHub issues in as steps (§7.5)."
Rewrite §11 l.520: "A separate ticket list. The one allowed intake is GitHub issues (§7.5)."
Decision needed: either keep the connector and say so in §7.4, §11 and §12, or drop it from §7.5.

R3. §9.1. The witness "cannot be deleted," but the clear command deletes everything the throwaway setup owns.
Quote l.488: "The witness's record cannot be edited or deleted, by design. So test data cannot be cleaned out of it afterwards."
Quote l.490: "its own witness record"
Quote l.491: "It deletes every file the throwaway setup owns and nothing else"
Quote l.493: "The clear command deletes them" (the GitHub sandbox, which is not a file, so l.491 is also wrong about GitHub).
Rewrite l.491: "One step clears the throwaway setup's working data. The throwaway setup's record cannot be deleted, so it is sealed and kept apart, and production never shows it."
Rewrite l.493: "The clear step also removes the sandbox repository and the sandbox board."
Decision needed: allow deletion (and remove l.488), or keep the sealed record (and say what the l.495 "witness is empty" check covers).

R4. §9.1 vs §3 vs §9 stage 1. Where the real sessions live during building is unclear.
Quote l.490: "All building, testing and demonstrating runs in a throwaway setup".
Quote l.496: "The operator's real sessions from other AI tools are not test data. During building they are only read, never written to."
Quote l.156 (§3): "Read them from the witness".
Quote l.479 (§9 stage 1): "A recorded walk-through of three real sessions".
Quote l.475: "A stage that works only on made-up data does not count."
Problem: if the real sessions sit in the throwaway record, the clear step (l.491) deletes them. If they sit in production, the throwaway setup cannot show them, so stage 1 cannot run there as l.490 requires.
Rewrite l.496: "The operator's real sessions from other AI tools are kept in [name the one record]. During building, Horizon reads them from there and never changes them."

R5. §5.8 vs screen text. The rule "No outside product names on screen" is broken elsewhere in the body.
Quote l.336: "No outside product names on screen. The status bar uses plain words: 'Rules', 'Cases', 'Records'."
Quote l.326 (§5.7): column "What the witness recorded".
Quote l.363–365 (§6.3): screen sources named "Case keeper", "Workshop", "Witness".
Quote l.423 (§7.5): status bar shows "GitHub: N updates waiting".
Rewrite l.336: "Screen labels use plain words, never product names. GitHub is the one exception, because the operator must recognise it."
Rewrite l.326: "What the agent reported" and "What the independent record shows".
Rewrite l.363–365 sources: "Cases", "Agent work", "Records".

R6. §5.1 vs §10 vs §12 vs §13. Presenting mode and exports.
Quote l.225: "This applies on screen and in every exported file." Then: "Exported files are hidden this way unless you choose otherwise when exporting."
Quote l.506 (§10): stand-ins are used "in exported files" with no exception.
Quote l.538 (§12) and l.553 (§13): exports are always stand-ins.
Problem: the same paragraph says exports always hide names and also that they can be shown. This is a privacy rule, so it must be consistent.
Rewrite l.225 (last sentence): "Exported files always use stand-ins while Presenting is on. Real names can be exported only with Presenting off."
Decision needed: if an opt-out is wanted, change §10, §12 and §13 to match.

R7. §8.2 (and l.330, l.534, l.11 table). Undefined jargon: "evals", "eval set", "grading", "AI judge", "pass rate", "re-runs".
Quote l.442: "### 8.2 Evals: knowing whether the agents work"
Quote l.330: "builds the eval set (§8.2)"
Quote l.450: "An AI judge comes later"
Quote l.534 (§12): "A judging service first"
Quote l.521 (§11): "full re-runs of all labelled runs"
Rewrite heading: "8.2 Checking whether the agents work"
Rewrite l.330: "builds the set of labelled runs (§8.2)"
Rewrite l.450: "An AI reviewer that scores runs comes later."
Rewrite l.534: "A scoring service first"
Rewrite l.521: "re-running all labelled runs"

R8. §2 glossary. "Case keeper" and "workshop" are used throughout but never defined. The glossary defines "Case" only.
Quote, for "case keeper": used at l.32, 82, 97, 105, 128, 133, 154, 163, 164, 318, 363, 376, 381–386, 405, 414, 439 and others.
Quote, for "workshop": used at l.33, 84, 129–131, 154, 364, 377, 385, 393, 438–439 and others.
Also, "keeper" means two things: "record keeper" (l.92, the witness) and "case keeper" (the case part).
Rewrite: add to §2 under People and things:
"**Case keeper**: the part that holds all cases and their steps, decides who may move them, and makes the final acceptance check."
"**Workshop**: the place where agents do the work."
Rewrite l.92: "**Witness**: the independent, unchangeable record of what was expected and what happened."

R9. Other undefined terms (used with no definition anywhere in the body).
- "connector" (l.158, 418, 422). Rewrite: "a small program that copies data between GitHub and the case keeper".
- "repository" (l.420, 422, 426, 493). Rewrite: "project" (or "GitHub project folder") in plain words.
- "issue", "sub-issues", "parent issue" (l.158, 418–419). Rewrite: "GitHub issue" with an explanation: "a GitHub task. Sub-tasks are 'smaller tasks inside it'."
- "settle", "accept-and-settle" (l.481, 514). Rewrite: "finalise and record" if that is the meaning, or define it.
- "Context Kernel" (l.157). Rewrite: "the reference library Horizon already uses".
- "DeepSeek-derived agent tool" (l.185, 407, 409, 504, 536). Rewrite: "the ticket-making agent tool". Name it in the annex.
- "tool use" (l.181, 550). Rewrite: "an agent's use of a tool, such as running a command".
- "throwaway setup" and "production" have no glossary entries. Add them.
- "Elephant-and-Goldfish" (l.434). See R11.

R10. "Label" means four things. The glossary definition does not match the other uses.
Quote l.99: "**Label** | The operator's verdict on one agent run: pass or fail"
Quote l.142: "A label puts 'reviewed by operator' next to a piece of work."
Quote l.267: "The link shows as a small label that opens the inspector."
Quote l.118: "**Mode tag** | The small label on the composer"
Quote l.418: "An issue marked for Horizon (by a label) becomes a step."
Quote l.449: "appear as automatic labels next to yours."
Rewrite: "verdict" for the operator's pass or fail (l.99, 330, 448, 454). "Automatic verdict" for the checks (l.449). "Mark" for "reviewed by operator" (l.142). "GitHub label" for GitHub only (l.418, 422). "Small box" or "link box" for the composer mode tag (l.118) and the link chip (l.267).

R11. Engineering vocabulary in the body, which the owner's rule forbids. Each needs a plain rewrite.
- l.498: "Paging, caching and batching are added only when those numbers show they are needed." Rewrite: "Speed-up measures are added only if the measurements show they are needed."
- l.483: "The delay between an event and its record is measured before and after (batching is added only if that delay is too long)." Rewrite: "The time between something happening and its record appearing is measured before and after. Grouping records is added only if that time is too long."
- l.554: "Measure first, batch only if needed." Rewrite: "Measure first. Speed up only if needed."
- l.530: "Plain tables in Horizon's existing database, each save done in one go | A new database (more to run). An event log (more than needed)." Rewrite: "Kept in Horizon's existing store, each save completed in full | A new store (more to run). A running log of every change (more than needed)."
- l.184: "A notes store". Rewrite: "A place to keep notes".
- l.490: "its own Horizon database file". Rewrite: "its own copy of Horizon's stored data".
- l.393: "If the workshop's background service is not installed, the status bar says so." Rewrite: "If the workshop is not set to keep running when Horizon is closed, the status bar says so."
- l.174: "a strict checker that rejects anything malformed" and "a different internal format". Rewrite: "a strict rule-check that rejects badly built parts" and "built differently inside".
- l.519: "A shared parts package". Rewrite: "A shared set of standard screen pieces".
- l.531: "Agents sending page code (unsafe)". Rewrite: "Agents writing their own screen code (unsafe)".
- l.535: "Desk shell | The current desk's regions, made live and keyboard-driven | The cockpit's docking layout". Rewrite: "The current desk's areas, made live and usable from the keyboard | The cockpit's movable window layout".
- l.226: "reuse the regions Horizon's current desk already defines (context, decision, evidence, inspector, history, agent), so no new layout model is needed." Rewrite: "These views reuse the areas the current desk already has (context, decision, evidence, inspector, history, agent), so no new screen design is needed."
- l.254: "The parts library carries the general rules... every disabled control says why". Rewrite: "The shared list of standard screen pieces sets the general rules: every greyed-out button says why it is off..."
- l.334: "Its colour and type settings are taken from the workshop's style file rather than redrawn." Rewrite: "Its colours and text settings are taken from the workshop's existing design settings, not redrawn."
- l.335: "Text is at least 12 pixels." Rewrite: "Text is large enough to read easily (at least 12 pixels)." (The unit remains; state it as a design target.)
- l.93: "Records are numbered in order, and each one carries a code computed from the one before it, so an edit anywhere breaks the chain and is detected." Rewrite: "Records are numbered in order, and each one carries a check-number made from the record before it. Any change to an earlier record is detected."
- l.94: "**Version code** | A short code computed from some content. ... the content cannot be worked out from the code." Rewrite: "**Check-number** | A short number made from some content. The same content always gives the same number, any change gives a different one, and the number cannot reveal the content."
- l.389, 408, 422, 548, 550: "Every request carries an id" / "request id" / "ids". Rewrite: "Every request carries a unique reference number."
- l.434: "(The operator calls this the Elephant-and-Goldfish method: the author remembers everything, the reviewers remember nothing.)" Rewrite: "(The operator calls this the 'fresh eyes' method: the author keeps the full history; the reviewers see none of it.)"
- l.439: "Today the workshop gives a reviewer the team's shared memory, which can include the author's conclusions. One kind of reviewer (the critic) is tested to start clean, but review steps are not." Rewrite: "Today a reviewer is given the team's shared notes, which can include the author's conclusions. One reviewer type is already tested to start with no history. Review steps are not. Stage 6 fixes that, and extends the same test to prove it."
- l.550: "A test confirms a record of a tool use holds no input or output text". Rewrite: "A test confirms that a record of an agent's action holds none of the words it was given or returned."

R12. The central demonstration names each column three ways.
Quote l.53: "'What the agent says happened' next to 'What really happened.'"
Quote l.55 (table) and l.326 (§5.7): "What the agent's log says" | "What the witness recorded"
Quote l.15: "without reading their chat logs"
Rewrite everywhere: left column "What the agent reports"; right column "What the independent record shows". Use the same two labels in §1 (l.53, 55, 57), §5.7 (l.326) and §5.5 if it appears.

R13. Code and product names in the body.
- l.31–37 (§1 table): "DomainForge", "SEA-Forge", "Cognate Workbench (built on the Cognate toolkit)", "RealityTrace", "gs-term", "the product-actualizer cockpit".
- l.36: "gs-term" is a code name, so it is a code term in the body.
- Also l.174, 397 ("cockpit") and l.157, 185 (see R9).
Rewrite: use plain role names in the body (rulebook, case keeper, workshop, record, command entry point, agent panel builder, reference library, ticket tool). Move all product and code names to the annex.

=====================================================
YELLOW
=====================================================

Y1. §1 l.31. "version code" appears before the glossary, and its meaning is inconsistent. Here it names an edition label. In §2 (l.94) it is a content check-number. Also "edition 1.0.0" (l.57, 298) is a version number.
Rewrite l.31: "Each checked edition carries a check-number, so everyone can confirm they are reading the same edition."

Y2. §1 l.37. "makes them answer every response from the owner". Unclear, and "owner" vs "operator" vs "person" vs "you" are used for the same user (l.37, 134, 163–164, 2).
Rewrite l.37: "requires the agent to reply to every answer you give it."
Rewrite: use "you" in the body; use "a person" only for people other than the operator.

Y3. Synonyms for the workshop. "workshop" (l.33, 84, etc.), "Cognate Workbench" (l.33, 154, 334), "workbench" (l.334).
Rewrite: "the workshop" everywhere. Keep "Cognate Workbench" in the annex.

Y4. "Stage" / "build stage" is used from l.63 but never defined in §2.
Rewrite: add to §2: "**Build stage**: one of the six planned steps in §9. Each ends with a working demonstration."

Y5. §2 l.86: "Journey" is defined but never used in the body. "Explore" is a journey (l.86) and also a view (l.217).
Rewrite: delete the Journey entry, or move it to the annex.

Y6. Three meanings for "check": "verification check" (l.65, 179, 518), "acceptance check" (l.97, 133, 153, 386), "the seven checks" (l.98, 314), and the state "checked" (l.133) vs "checked just now" (l.57).
Rewrite: "automatic check" for Horizon's existing verification checks (l.65, 179, 518); keep "acceptance check" and "the seven checks".

Y7. Synonyms for approval: "approve" (l.164), "Approvals" page (l.177, 514), "accept" (many), "allow" / "allowed" (l.106, 128, 163), "grants authority" (l.163), "grants permission" (l.348).
Rewrite: "accept" when a person decides; "allowed" when a rule permits; "approve" removed. Rename "Approvals" to "Decisions waiting". l.164: "The case keeper refuses to let anyone accept their own work." l.348: "A tag never allows anything."

Y8. "version" means four things: document version (l.3), rulebook edition (l.85), version code (l.31, 94, 318, 549), and pinned item version (l.251). Also "version notes" (l.515) and "an earlier version" (l.349).
Rewrite l.251: "A pinned item shows the date it was pinned." Rewrite l.318: "the preview's check-number". Use "edition" for rulebook versions.

Y9. "witness" is used as a noun, a verb ("witnessed", "Witness everything") and a screen word, and it collides with "record" and "Records" (l.92–93, 199, 365, 42, 385, 483, 558). Also "Stop the witness" (l.549).
Rewrite: "record" for the thing and "record keeper" for the part (see R8 rewrite). Use "recorded" as the verb. Use "Records" on screen.

Y10. Four phrases for "not available": "not connected" (l.157, 264, 363), "not reachable" (l.364), "unavailable" (l.365), "not installed" (l.393), "not set up" (l.157, 264).
Rewrite: "not connected" everywhere.

Y11. "ticket" (l.83, 185, 407–410), "issue" (l.418–426), and "bug report" (l.83) are used for the same thing.
Rewrite: "ticket" for a request from another tool; "GitHub issue" only for GitHub. Keep "bug report" as an example only.

Y12. "project" means two things: a customer or work project (l.225, 553) and a GitHub Project (l.420, 493). Also "Project" is a board (l.420).
Rewrite: "GitHub board" everywhere for the GitHub item. Keep "project" for the work.

Y13. "command" is used for three things: the command entry point (l.36), the "command menu" (l.270, 277), and "One command clears" (l.491). Also "Ctrl/Cmd" notation (l.277).
Rewrite l.36: "Typed-command entry point: makes a typed command and the same command run by a tool leave the same kind of history." Rewrite l.277: "Quick menu (Control or Command, then P)". Rewrite l.491: "One action clears".

Y14. "view", "page", "screen", "desk", "panel", "layer", "region" are used loosely (l.37, 114, 201–219, 226, 481, 514, 553). Rewrite: define "view" (one of the four main sections), "page" (an old separate screen to be retired), "desk" (all of Horizon). Use "panel" only for agent-built screen pieces.

Y15. "setup" has two meanings: the operator's agent setup (l.35, 156, 182, 465) and a test or production environment (l.490–495). Also three names for the test environment: "throwaway setup" (l.409, 488–495), "testing" (l.492), "sandbox" (l.493). Also "live" means "running" (l.480 "new live desk") and "production" (l.481 "live case keeper", "planned live test").
Rewrite "agent setup" to "the operator's agent tools" (l.35, 156, 182, 465). Use "test setup" everywhere for the throwaway setup. Use "running" for "live." Note: l.481 "live case keeper" should say "test case keeper" if stage 3 runs in the throwaway setup (l.490).

Y16. §5.1 l.212 and l.223. "There is one way to move around: the left column." But the keys (l.277–278), Find mode (l.263) and the command menu (l.277) also move the user. Also the status bar list (l.223) omits "which setup is active", which §9.1 l.492 says the status bar shows.
Rewrite l.212: "The main way to move around is the left column. Keyboard shortcuts also work (see §5.4)."
Rewrite l.223: add "which setup is active" to the list.

Y17. §5.2 rule 2 (l.234): "Agent activity may only change counts, add items at the end of a list, or update the inspector." But §7.3 l.399: the agent's panel "opens it beside the current view". Rewrite §7.3 l.399: "opens it beside the current view, only after you have asked for it." Or add "open a panel you asked for" to rule 2.

Y18. §5.3 l.262 "Write... on the open case if there is one" vs §6.1 l.347 "Adding a note to a case as well as its day shows the same note in both." Rewrite: decide whether a note is linked to the open case automatically. If yes, change l.347 to "A note written on an open case also appears on that case."

Y19. §6.1 l.355 "Notes are not sent to the witness. They are your own writing, not evidence." vs §7.5 l.425 "Comments on an issue arrive as notes on the step, marked with their author." Rewrite l.425: "Comments on an issue appear on the step, marked with their author. They are never decisions." Rewrite l.355 to: "Your own notes are not sent to the record."

Y20. §7.5 l.420 "A large case that spans several repositories can get its own Project on request." vs §12 l.537 "One Project per case (too many boards)" turned down. Rewrite l.420: "All cases share one board. No per-case boards are made." Or change §12 to allow the exception.

Y21. §8.2 l.446 "Three kinds of grading are applied, in this order" vs l.450 "It is not part of the first release" and l.444 "Evals are part of the product from the first stage." Rewrite l.446: "Two kinds of checking apply in the first release, in this order. A third, an AI reviewer, comes later."

Y22. Stage 5 and §4. "Tool use and final answers are recorded" (l.181, "Partly") vs "A test confirms a record ... holds no input or output text" (l.550) and "records hold version codes, not text" (l.483). Whether existing records contain text is unclear.
Rewrite l.181: "Partly. Actions and final answers are recorded now. Stage 5 changes them to check-numbers only." (Author to confirm the current state.)

Y23. §9 stage 5 l.483: "See AI requests and typed messages in the witness" vs "A test confirms records hold version codes, not text" (same line). You cannot see words that the record does not hold.
Rewrite: "Each AI request and each message you type leaves a record, tied to the rulebook edition. You can see that it is recorded, but not its words."

Y24. §9 stage 2 l.480 "Write a note in one keystroke" vs §6.1 l.344 "Type and press Enter in Write mode."
Rewrite l.480: "Write a note by typing and pressing Enter."

Y25. §4 l.185: "Tickets... | No import exists anywhere | None." But §7.4 l.409 and §9 stage 4 l.482 say the ticket path is built new in stage 4.
Rewrite "Missing" to: "A ticket path into case steps (stage 4)."

Y26. Loop word "Judge" (l.42, 46) vs the "Decide" view (l.218) vs "AI judge" (l.450). Rewrite the loop step "Judge" to "Decide".

Y27. "dry run" (l.107 and l.178) is used before it is defined. §2 l.138 defines "preview" as "not real yet", which is a second meaning of "preview" (l.107 defines it as a dry run).
Rewrite l.107: "**Preview** | A trial run that shows what an action would change, who may do it, how to undo it and what it opens next. Nothing happens." Rewrite l.138: "Not real yet: this shows a preview, and nothing has happened." Rewrite l.178: "Trial runs of case actions".

Y28. Row labels used but not defined in §2: "observed" (l.57, 96), "record intact" (l.57, 65, 327), "rules in force" (l.57, 327), "allowed by" (l.327) vs "allowed-by rule" (l.59, 66). Rewrite: add these to §2, and use "allowed by rule" in every place.

Y29. "merge" is a software term in the headline demo (l.57 "tests before merge"; l.293 "Step: merge the fix"; l.298 "Rule: tests before merge"). Rewrite: "Step: add the fix to the main code" and "Rule: tests must pass before the fix goes in."

Y30. Undefined terms, each with a plain rewrite needed:
- "session recorder" (l.35, 65, 182, 449). Rewrite: "the tool that copies sessions from other AI tools into the record".
- "cost tracker" (l.35, 183, 461). Rewrite: "the cost log".
- "Presenting" (l.225, 479, 506, 538, 553). Add to §2.
- "plugin" and "agent skills" (l.154, 270). Rewrite: "add-on packs that give agents extra abilities."
- "governed work" (l.82, 186). Rewrite: "work run through a case".
- "criteria" (l.97, 383–384). Rewrite: "the agreed tests for success".
- "attention rules" (l.230–254 and §9 and §13). Add to §2.
- "reference service" (l.157, 264). Rewrite: "the reference library".
- "placeholder rulebook" (l.181). Rewrite: "a stand-in rulebook".

Y31. Keyboard notation and code formatting in the body: "Ctrl/Cmd+K" and the table (l.274–286), "`@`" (l.267), and the "Ctrl/Cmd" forms (l.270, 277). Rewrite: "Control or Command, then K". Move the full key table to the annex, or keep it as plain words.

Y32. §11 plain-language rewrites needed. "Empty folders and out-of-date version notes" (l.515 → "Empty folders and out-of-date notes about past versions"). "Terminal interface" (l.516 → "The typed-command screen"). "Phone pairing" (l.517 → "Signing in from a phone"). "Horizon's verification checks" (l.518 → see Y6).

Y33. §1 l.42 vs l.46. The loop says "Judge", and step 4 says "A person decides". See Y26. (Covered above.)

Y34. §5.2 rule 3, rule 9. Other unclear phrases: "focus" (l.236) and "keyboard focus" (l.335). Rewrite l.335: "You can always see where the keyboard cursor is."

Y35. §5.5 l.293–299 (decision card). Uses "merge" (see Y29). Also "Known: tests ran on the latest version" fine. No other change.

Y36. §9 stage 3 l.481 "The planned live test of the full accept-and-settle path passes." "planned" and "live" and "settle" (see R9, Y15). Rewrite: "The scheduled test of the full accept-and-settle path passes." Define "settle" or replace with plain words.

=====================================================
GREEN
=====================================================

G1. §10, l.504–506. Items are numbered 1, 3, 2. Renumber to 1, 2, 3.

G2. §1 l.23. "You decide every outcome that matters." Absolute claim. Rewrite: "You decide the outcomes that matter."

G3. §1 l.59. "valuable", "good evidence", "good material" are subjective. Rewrite: "It gives a record of expected against observed that cannot be quietly edited. That can support decisions and training of agents."

G4. §5 intro l.192. "A good system with a bad interface is useless. This section is binding." Rewrite: "A system with a poor interface is hard to use. This section is required."

G5. §8.3 l.? table. "retries" is a technical word. Rewrite: "repeat attempts".

G6. §8.2 l.448. "a structured entry holding pass or fail..." Rewrite: "a short written record with the pass or fail, the first thing that went wrong, and links to the session and record".

G7. §8.2 l.454. "Labelled runs is a list in Work." Grammar. Rewrite: "Labelled runs are listed in Work."

G8. §5.6 l.318. "the case keeper refuses it if they no longer match." "They" for a singular noun. Rewrite: "if the two no longer match" or "if the case keeper finds they no longer match."

G9. §4 l.180. "(stage 1, small)" is vague. Rewrite: "(a small change in stage 1)".

G10. §8.4 l.469. "Notes and agent guesses never become rules on their own." "Rules" is a different concept from "lessons". Rewrite: "never become active lessons on their own."

G11. Pronouns. "we" (l.49, 192 etc.) and "you" are mixed. Rewrite: use "you" for the operator and "we" only for the team, or use "you" throughout.

G12. §5.2 l.232–254 "Test:" lines are fine, but "attention rules" is never defined in §2 (see Y30). No separate edit beyond Y30.

=====================================================
TOTALS
RED 13, YELLOW 36, GREEN 12.
(The summary above reports counts from the first draft. Use these totals.)
=====================================================