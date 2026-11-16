# Stage 9 — egm-style — verbatim reviewer output (v6, lines 120-279)

**REVIEW — egm-style, Stage 9, design_draft.md lines 120-279**

I read the persona file and the whole target. No style standard was assigned, so I applied the persona's own audit rules. All findings are within lines 120-279.

**Major**

1. **Line 163.** "It is with every `ApprovalStanding::to_json` field populated, including one resolved and one unresolved row." A word is missing, so the sentence does not parse. This sentence defines what the golden fixture must contain, so it needs to be exact. Suggested: "It populates every `ApprovalStanding::to_json` field and includes one resolved and one unresolved row."
2. **Line 224 (D5 Sequencing).** "plus the SWE_SEED green run recorded" assumes the run passes. Line 246 and line 275 say a red run is recorded and escalated, not blocking. So the sequence line describes a different gate from the other two. Use "the SWE_SEED run recorded (pass or fail)".
3. **Line 234.** "Every row can be written by a stranger" is unclear and cannot be checked. It may mean "executed by", "reproduced by" or "verified by". Name the action and what the stranger needs, for example: "Every row can be executed by a reader with only this document and the named repos."

**Nit**

4. **Line 260.** "The vendor set is already rotting" is figurative and judgmental. The fact in the parenthesis is enough: "The vendor set mixes 0.7.0 and 0.8.0."
5. **Line 257.** "L-size risk" is undefined jargon; it is not in the Vocabulary table. Name the risk or the size scale.
6. **Line 255 and line 256.** The "(v2)" labels are not explained. A new reader cannot tell that they mean "proposed in design v2". Spell it out once.
7. **Line 278.** "the reviewed v5 positions" appears in a v6 document. Confirm "v5" is meant, or reword as "the positions in this design".
8. **Line 279.** "the operator's T1 implementation instruction". Everywhere else the document calls the authorizing human "owner", and "operator" is a technical role (`COGNATE_SEA_FORGE_OPERATOR`, operator actor). Use "owner's" here to avoid mixing the two terms.
9. **Lines 264-279.** The risk and item IDs are out of order: R1, R2, R5, R6, R7, R8, R3, R4, then E-1, E-2, E-4, E-3. List them in ID order so readers can scan.
10. **Line 267 vs line 128.** R6 calls the bound `maxListBytes`. D1 calls it "a fixed internal list bound of 8 MiB" and gives no identifier. Use one term, and introduce the identifier in D1 if it is real. R6's last sentence also repeats Goal 1 (line 86) almost word for word. A cross-reference would do.
11. **Line 266.** "technically require `sudo`" and "actually run": "technically" and "actually" are filler. Delete both.
12. **Line 244.** "executed, not merely documented": "merely" is filler. Use "executed (not only documented)" or just "executed with real binaries".
13. **Line 230.** "and ordering puts the deploy before adoption anyway": "anyway" is informal. Use "Sequencing also places the deploy before adoption."
14. **Line 196.** "This work bases on `main`" is not idiomatic. Use "This work is based on `main`" or "branches from `main`".
15. **Line 166.** "dispositioned" is jargon. The phrase "It must be dispositioned before the 0.4.0 contents are frozen in step 4" also repeats the heading's "(required before step 4)". Use "resolved" and drop the repeated clause.
16. **Line 220.** "it is not a UI preference" argues against an objection nobody raised. The REQ-NAV-006 citation is enough on its own, so this clause can go.
17. **Line 171.** "The agent builds and runs `just gateway-stage`" does not say what is built. Use "builds sea-rs at the tag and runs `just gateway-stage`".
18. **Line 270.** "(verified by grep)" gives no command, repos or date, so it cannot be checked. Cite the grep and its scope, or point to the evidence file.
19. **Lines 128 and 238.** Both are very dense, each holding 6-8 separate claims. Split them into sub-bullets: the `listApprovals` behaviour at line 128, and the SDK, Horizon and Workbench parts of the Correctness cell at line 238. Also at line 238, "not silence from a CI skip" is figurative. Use "a skipped CI run does not count".

**Verdict:** No Blockers. 3 Major and 16 Nit style findings. Lines 120-279 are ready for implementation once the three Major wording fixes (lines 163, 224, 234) are made.
