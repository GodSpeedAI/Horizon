Status: resolved. Round 1 and the round 2 re-check are both settled (the round 2 re-check is at the end). The one-re-audit limit is now used.

# Goldfish Annotated Review Report

**Target:** `.agents/specs/Horizon_Operator_Workspace_Design_v1.md` (full file). It was resolved by writing `Horizon_Operator_Workspace_Design_v2.md`.

**Operator instruction (2026-11-06):** reconcile every issue using expert judgment. The current implementations are the base. Add only where they truly cannot do the job, remove bloat without reducing capability, use no jargon, and treat the UI and UX as vital. That instruction is the "custom instruction" path of the resolve step, so the operator did not see a separate gate for each fix.

**Evidence base:** the five stage reports, three operator briefs, and eight code-research reports in `recon/`.

## How to read this table

The category column uses the resolve-step labels:
- **FIX:** valid; settled in v2 at the section named.
- **CONTEST:** the reviewer was wrong; the evidence is cited.
- **ESCALATE:** only the operator can settle it (listed again in v2 §10).
- **DECLINE:** a nit that was recorded but not fixed.

Finding prefixes: **ZO** = Stage 5 zoom out, **CT** = Stage 6 comprehension, **C7** = Stage 7 critics, **S8** = Stage 8 zoom out, **G** = gaps found against the operator addenda, **R9** = Stage 9 implementation readiness.

## Escalated to the operator

| ID | Finding | Why only the operator can settle it |
|---|---|---|
| R9-11 (ticket part), G-4 | The DeepSeek harness tickets have no source format in the code | Searches of `sea-rs`, `cognate`, `cognate-workbench` and Horizon found no ticket import. v2 §7.2 assumes title, description, source and source id. v2 §15 Q1. |
| R9-9 (package part) | Where the shared screen-language package should live | This is a repository ownership choice. v2 §15 Q2. |
| — | Whether real repository names may appear in the demonstration | A privacy preference. v2 §15 Q3. |

## Settled findings

| IDs | Category | Settled in v2 | Note |
|---|---|---|---|
| ZO-1, S8-3, S8-4, ZO-8 | FIX | §14 fixed build order. v1 §12–14 removed (§11). | Scope is now sequenced by value. The demonstration comes first. |
| ZO-2 | FIX | §6.1 | One note, many places stays (operator journey 1). Backlinks and the relationship map are dropped from this design. |
| ZO-3, C7-9, ZO-10 | FIX | §9.4, §8.3 | The learned-context machinery is removed. Lesson proposals are accepted only by a person. `~/.agents` is read only through an export file. |
| ZO-4 | CONTEST | §3, §9.1 | The operator addendum requires three roles but no new services. v2 keeps the roles as Workbench work (`team.review`, `ExpertsService.context`) and adds no Horizon service. |
| ZO-5, R9-3, CB-F2, C7-6 | FIX | §10 | One shared block set. Additions: a note block, reference kinds, and paging. |
| ZO-6, C7-15 | FIX | §5.7, §8 | The comparison reads existing exports. No join store is built. It is measured before paging is added. |
| ZO-7, C7-12, R9-21 | FIX | §14 "Measuring before scaling" | |
| ZO-9, C7-14, R9-5 | FIX | §6.2 day key | |
| ZO-11, CT-7, R9-4, ST-1, R9-26 | FIX | Header and §5 | The V3 mockup was copied to `docs/design/reference/`. The absolute home paths were removed. |
| ZO-12 | FIX | §5.8 | |
| ZO-13 | FIX | §1 "The system this is part of" | |
| CT-1, C7-16, R9-13 | FIX | §4 (seven checks named), §2 | "Operator-pinned focus" is replaced by attention rules 2, 3 and 9. |
| CT-2, C7-7 | FIX | §4 table and the "exists / new / check first" reading rule | |
| CT-3, CT-4, CT-5, CT-18, R9-31, W-1-1 | FIX | §2 (12 terms only) and §1 table | v1 vocabulary such as sentry, outbox and projection was removed from the body. |
| CT-6, C7-3, R9-2, CB-F1 | FIX | §6.2 | Notes are change events in the existing database. The reuse justification is in §12. |
| CT-8 | FIX | §6.1 | "Collection" is removed. Placements are on days and cases. |
| CT-9 | FIX | §9.4 | One term: "lesson". |
| CT-10…CT-17, CT-19…CT-21 | FIX | Removed or reworded throughout | |
| C7-1 | FIX | §12 | |
| C7-2 | FIX | §13 | |
| C7-4, C7-5 | FIX | §1 | |
| C7-8 | FIX | §3, §9.4 | Advisor continuity uses notes plus Workbench memory, with no new store. |
| C7-10, R9-6 | FIX | §6.2 access, §13 test | |
| C7-11 | FIX | §7.1 "Doing it twice changes nothing" | |
| C7-13, R9-19, R9-1 | FIX | §14 (each step has files, tests and a done criterion) | |
| C7-17, C7-18, C7-19, W-1-2…W-1-4, R9-27 | FIX | Wording throughout | |
| C7-20…C7-27 | DECLINE or FIX | Mostly obsolete because of the rewrite | |
| C7-28, S8-1, S8-2, S8-5, S8-6, S8-7, R9-11 | FIX | §9.2, §2 ("reviewed by operator") | S8's row saying "Cognate owns graders" is corrected: no grader exists, so v1 uses human labels plus checks done by code that already exist. |
| S8-8 | FIX | §9.2 | Benchmarks are left out. |
| S8-9 | FIX | §9.2 item 3 | The judge must use a different model. |
| G-1, R9-16 | FIX | §3 Context Kernel row and context-building row | |
| G-2, R9-17 | FIX | §5.1 three views mapped to J01–J06 | The views are renamed "Decide" (from "Operate") for plain speech. |
| G-3 | FIX | §2 ladder of states | |
| G-4 (Field Case) | FIX (narrow) | §1 loop | The case's position is shown through SEA-Forge case state. No stage wizard is built (the operator addendum rules one out). |
| G-5 | FIX | §5.6 preview effect labels, §5.5 expected and observed | |
| G-6 | FIX | §7.1 (one path whether started from the composer or from a ticket). gs-term's "two doors" principle is cited. | |
| G-7, G-8, R9-28 | FIX | §3 plugins row, §5.3 Plugin chip, §9.1 | |
| R9-7 | FIX | §6.3 | |
| R9-8 | FIX | §5.3 chips available per step, §5.4 | |
| R9-9 (tokens) | FIX | §5.8 | Tokens are copied by a script, with a test that fails on drift. |
| R9-10 | FIX | §6.1, §14 step 2 test | |
| R9-12 | FIX | §11 | The old desk is removed after parity, and its model code is reused. |
| R9-14 | FIX | §4 witness row, §8.1 | |
| R9-15 | FIX | Appendix | Files are now attributed to the right repository. |
| R9-18 | FIX | §14 step 2 | Notes are durable from the start. |
| R9-20 | FIX | §6.1 revisions, §14 step 2 crash test | |
| R9-22 | FIX | Removed v1 §13's licence to redesign | v2 states fixed decisions (§12). |
| R9-23, R9-24 | FIX | v1 §14 questions are answered in v2 or escalated (§15) | |
| R9-25 | FIX | §14 (each step has named tests). The CI command is to be recorded in step 1. | |
| R9-29…R9-33 | FIX or DECLINE | Mostly obsolete because of the rewrite | |
| ST-6 | CONTEST (kept) | — | Rejected earlier, because the operator addendum says routine work needs no approval for each step. |

**Counts:** about 95 raw findings. 3 escalated, 2 contested, the rest fixed by the rewrite, and a handful of nits declined as obsolete.

## Strategic redesign decisions (beyond the findings)

1. **One loop, made visible:** Expect → Act → Witness → Judge → Learn (§1). Every feature serves it.
2. **The demonstration first:** "What the agent says happened" next to "What really happened" (§1, §5.7). It is built from data that exists today: Workbench history, the witness, and the `~/.agents` export.
3. **One screen language:** Horizon's renderer and the product-actualizer cockpit are already the same 15-block set. Merging them gives Horizon the cockpit's agent-composed panels, evidence badges, preview card and owner-response inbox, instead of building them.
4. **Expected before observed, for all real work:** extend Horizon's existing verification-obligation code to every case step that has criteria (§7.1 step 3).
5. **Remove the second desk:** the server-rendered workspace pages are replaced by the live desk once it covers their content (§11).

---

## Round 2 re-check (2026-11-06)

Three reviewers checked v2 again with fresh context: zoom out, codebase details, and style plus comprehension. This was the one re-audit the review allows, so there is no round 3. Every finding below is settled in the rewritten v2 or in its new technical annex (`Horizon_Operator_Workspace_Design_v2_technical_annex.md`).

| Finding | Category | Settled |
|---|---|---|
| The shared screen-parts package cannot work: different zod majors, different reference shapes and caps, web-coupled blocks, a server-only binder, the t05 guards, and no client build | FIX (it reverses round-1 strategic decision 3) | Horizon's grammar stays where it is and stays canonical. The cockpit's agent-panel commands are ported into it in stage 4. The package is deferred until the two use one format (design §11, annex §D). **This also removes round-1 escalation R9-9 (where the package would live).** |
| Stage 1 was too big (desk shell, agent panels, 8-panel cap, rail test) | FIX | Stage 1 renders the comparison view on an existing route with the existing parts. The shell and the client build move to stage 2, with a stated reason. Agent panels move to stage 4. |
| The demonstration overclaimed, because no data for the full example rows exists yet | FIX | Design §1 has an honesty table showing which rows each stage can fill. The full example is the done criterion for stages 4–5. |
| Removing the old desk was incomplete: routes, onboarding, settle, `STYLE`, tests and economics guidance were missing | FIX | Annex §B route table (all `/workspace*` routes, including `/economics`, `/approvals` and `/remote/*`). Economics is deleted only after the cost panel works. |
| Step creation was attributed to `case.commit` | FIX | It is `case.add_item`, with a mandatory `request_id`. The gap in the sea-rs reference doc is noted. |
| Deduplication needs the workshop as well | FIX | Design §7.1. Annex stage 4 "check first". |
| `declare()` is hard-coded and synchronous | FIX | Annex stage 4: target and criteria become parameters, and the call becomes async. |
| `snapshot:genesis` was placed in Workbench | FIX | Cognate owns it (`sxr-cli.ts:111`). It needs DomainForge (annex stage 5). |
| "Failed" did not match the code's "poison" | FIX | Annex §A: shown as "set aside — needs you". |
| Batching was proposed without measuring first | FIX | Design §9 and annex stage 5: measure the delay, then batch only above a threshold. |
| `ledger export` has no date range | FIX | Filtered after export. Speed is a stage 1 check first. |
| The `~/.agents` export file may duplicate what the witness already has | FIX | Stage 1 check first. The design now reads these sessions from the witness. |
| Workbench transport not named | FIX | Stage 1 check first (Connect RPC runtime-service client and auth). |
| Notes as events, with per-note witness records, restore and back-dating | FIX | Plain tables plus a revision table, saved in one transaction, with no note records in the witness. Restore and back-dating are deferred. Time-zone rule stated (§6.1). |
| Labels were untyped, and labelling started too late | FIX | Typed label record (annex stage 1). The label control is in stage 1. A "Labelled runs" list is in Work. |
| The claim that reviewer isolation is tested was false | FIX | Design §8.1 says it is not tested and that team memory leaks in. Stage 6 fixes it and adds a test. |
| Six composer modes (Propose and Plugin unclear) | FIX | Four modes: Write, Find, Ask, Hand off. Plugin building moves to the command menu. "A" opens the preview. One yes-word: "accept". Reject takes new instructions instead of a separate "redirect". |
| Two navigation models | FIX | One left column (§5.1). |
| Copying tokens with a script | FIX | Import the Workbench stylesheet (R9-9 tokens row reversed). |
| Too many attention rules | FIX | Nine rules that change behaviour. General rules go to the parts library. Rule tests are spread across stages 2 and 3. |
| Jargon, and a false "only special terms" claim | FIX | §2 is a full plain glossary. All file names moved to the annex. "Step 1–6" renamed "Stage 1–6". "v1" replaced by "first release". One missing-data phrase: "not recorded". One state list, with display-only states marked apart. |
| A live statistic was timestamped after the document date | FIX | Removed. |
| Citation errors (gate test line, `buildInbox` location) | FIX | Annex §A. |
| Q4 (terminal interface) | FIX | Removed. The terminal is kept frozen (§11). |
| Rulebook "version" against the code's fingerprint | FIX | Defined as "version code" (§2). |

**Escalations settled by the operator (2026-11-06):**
1. **Tickets:** the case keeper is the ticket system. The DeepSeek-derived tool creates case steps directly, with the ticket id as the request id, and no importer is built (v2 §7.4, §10). There are no existing tickets, so nothing is moved.
2. **Demonstration data:** real names on the operator's own screen; steady stand-ins when Presenting is on and in exports (v2 §5.1, §10, stage 1 test).

3. **Clean start for production** (operator, 2026-11-06): all build and test data lives in a separate throwaway setup with a one-command clear, because the witness record cannot be edited (v2 §9.1, annex "Before stage 1").

No escalations remain open.
