---
reviewer: codex-adversarial-r2-20261019
date: 2026-10-19
commit: 7a248ea
independent_of_builder: true
verdict: fail
candidate_revision_reviewed: 2
---

## Decision and scope

**Do not freeze revision 2. R1 = revise_again.** The candidate repairs the four inverted prohibitions and preserves the modal wording of its 72 changed contracts, but inherits material contract defects. Its revised deviation witness still substitutes availability for addressing a material deviation. The D-020 baseline can suppress a repaired-contract regression. The literal frozen preregistration falsifier also still triggers.

This is a fresh adversarial review, at deep review depth. I used the current request committed in `2c87bded3e53aa2c43a4260d471ec6ae9b015879`, whose explicit implementation target is `7a248ea5e8e8f6e4d538ee36fafe6f5c968d97f0`. I exported that target using `git archive` into `/tmp/horizon-t04-adversarial-7a248ea`; regeneration, installations, gate outputs and attacks occurred only in disposable directories. The later commit's request and owner decisions supply review instructions, not implementation evidence. Builder criticism, summaries and the earlier verdict were not treated as findings. No implementation, frozen input, status record or candidate was changed in the submitted repository.

All six requested SHA-256 checks matched, at both target and request HEAD:

| Artifact | SHA-256 |
| --- | --- |
| `requirements/ledger.yaml` | `c7afbcc60f9cd197ddef60941e19bd6cc9cfc00584c5703a6e6fa07e364e7417` |
| `.wayfinder/answer-key.md` | `f00b060d4f27a1dc727ad34a50b099efa881a665e7c4ba308c2429b22ec05eb2` |
| `.agents/specs/horizon.agent.spec.yaml` | `75cfc1ceb9eec6139f7b8e73f8d1107fcc5e2b680e80683824edd7d8de434130` |
| `.agents/prereg/horizon/T04.prereg.yaml` | `9c434b404a948971e3bca27a06eef670ab790e1f6bfc5c7ffd0847662a06a03e` |
| `scripts/ledger-policy.yaml` | `6d03ab70cfabc446e2610300909edbaa81adfce6b629ce0b2d79eef733003e45` |
| `.sea/interaction/interaction-model.sea` | `1c3909e51c509b60634dc5f4dba7dc29c3c58bc883a0134cf2861ac23bb1eec1` |

The plan's source-spec hash matches. The requested diff against `7b4d110` across `requirements/`, `.wayfinder/`, `.agents/specs/`, `.agents/prereg/`, `.sea/` and `scripts/ledger-policy.yaml` is empty. All 98 ledger requirement statements equal the frozen spec's `text` fields exactly.

## Per-criterion

These quotations are from the frozen preregistration, not its summary. PASS means the specific T04 observation, not complete satisfaction of all requirements mapped to a future task.

| Criterion | Verdict | Observation and source |
| --- | --- | --- |
| PE-01 | **FAIL** | “independent criticism verdicts recorded before the freeze” did not happen; the active contracts also contain the defects below, although `just ledger` and `just wayfinder` validate 98/98 structurally. |
| PE-02 | **PASS** | “produces a starter whose dependency closure is reproducible” and “real Cognate runtime over a SQLite store”: fresh creation from the committed Cognate pin produced 27 tarballs; frozen-lockfile offline install and the real SQLite close/reopen tests passed. |
| PE-03 | **PASS** | “fails closed on a mismatched or missing world”: independent false-pin and deleted-entry attacks both exited 1; real runtime tests observed the pinned identity and positive object/relation counts (`src/adapters/semantic.ts`, `test/app.test.ts`). |
| PE-04 | **PASS** | “source world -> typed frame/intent -> Cognate run -> projection/health” passed, including event-position/correlation checks, independent SQLite reads, reopening, and HTTP health (`test/app.test.ts:122`). |
| PE-05 | **PASS** | “loopback transports only”, “OS session”, “per-launch secrets with restrictive permissions” and refusal without an IdP are exercised by `test/config.test.ts` and the spoofed-observer application test; this does not establish a production remote authentication system. |
| PE-06 | **PASS** | “pytest coverage invoked by just test; no ML logic is claimed”: `just test` ran 20 Bun tests and then four pytest tests; `research/pyproject.toml`, `research/uv.lock` and the typed health contract are present. |
| PE-07 | **PASS** | “just check, just boundaries, just verify and just gate-t04 exist and pass” is observed individually; `just test` did execute research pytest. The recorder's additional expected-red diagnostics make the recorder itself exit 1. |
| PE-08 | **PASS** | “component units, one-way dependencies, adapter seams, frozen boundaries and explicitly open behavior” are recorded in `docs/topology.md`; inspected application code uses Cognate event/store APIs and imports no Product Actualizer truth engine. |
| NE-01 | **PASS** | “boundary check fails closed” is observed after independently deleting `@godspeedai/cognate-domainforge` from metadata: exit 1 names that package. The separate literal E2E falsifier remains triggered; see F1. |
| NE-02 | **PASS** | “Runtime creation rejects it”: `HORIZON_STORE=:memory:` through `createApplication()` exits 1 with the durable-SQLite diagnostic; the configured-store test also passes. |
| NE-03 | **PASS** | “competing canonical store” at `product-model/process.yaml` independently produces exit 1 and a bounded boundary diagnostic. |
| NE-04 | **FAIL** | “Add a second .sea authority -> boundary check rejects it” works for `other/extra.sea`, but an exact second copy at `.sea/alternative/interaction-model.sea` passes; `scripts/check-boundaries.ts:71` exempts all `.sea/` paths. This does not make the runtime load that alternative automatically. |
| NE-05 | **PASS** | Both “False world_ref” and “deleted canonical model” exit 1 with semantic diagnostics and no success result. |

## Rulings

**R1: revise_again.** Reproduction succeeded: `apply-candidate-revision.py` exited 0 and every candidate file it regenerates remained byte-identical; the exact relative-ledger Wayfinder command in the request reproduced `answer-key.md` byte-for-byte (`cmp`, exit 0). There are exactly 72 changed acceptance contracts, exactly the 72 formerly generic contracts; the revision-1-to-2 diff changes the ten contracts the request names. All 72 retain their requirement's subject, quantifiers, and applicable prohibition/permission/obligation in the new text. The changed-contract lexical-modal loss set is empty. This is not a finding that all 98 contracts are adequate.

The contracts needing substantive correction before a new freeze are **AC-DEV-001-01, AC-NAV-002-01, AC-STACK-004-01, AC-STACK-011-01 and AC-STACK-014-01** (F2). The evaluation claims/bindings for **AC-CASE-002-01, AC-CONFIG-004-01 and AC-NAV-005-01** also need revision or an explicit unresolved-proof disposition (F3); their faithful requirement text need not be replaced with invented policy. Do not implement future navigation behavior merely to satisfy this review: an honestly open binding is preferable to a false witness.

Both instruments fired on isolated, independently authored corruptions, without relying on their existing findings:

| Injection | `measure-contract-modals.py --baseline /dev/null` | `check-witness-claims.py --baseline /dev/null` |
| --- | --- | --- |
| `REQ-STACK-013`: “may be observed” -> “must be observed”, prohibition left intact | exit 1, loses permission | exit 1, permission stated as absolute |
| `REQ-INT-004`: “is never observed” -> “is observed” | exit 1, loses prohibition | exit 1, prohibition absent |

The unbaselined candidate modal measure nevertheless exits **1**, listing four unchanged contracts. The active-ledger measure with the supplied baseline also exits **1**: four are suppressed, six remain. Thus the criticism's blanket “every contract preserves” claim is false even on its own instrument.

**R2: incomplete**, with an overstated C4. Direct comparison to committed `8cb0368` confirms C1's invented outcome list/`changed_from`, C2's object-literal comparison and provider-record claim, and C3's invented pinned vocabulary/recording obligation; the corresponding text was removed. C5 correctly describes permission and SHOULD problems in the first draft. But the revised C1 witness still lacks the addressing predicate, C2 still does not vary provider configuration, and C3 only tests an uncalled helper. The record incorrectly says no changed contract intersects the baseline and that the entire candidate passes the unbaselined modal measure. C4's quoted old text, “Adapters are observed to **not create** a second authoritative event history”, already negates creation: calling that a polarity inversion overstates the semantic defect. Revision 2's wording is clearer, but a lexical checker is not the arbiter of negation.

**R3:**

| Requirement | Ruling | Reason |
| --- | --- | --- |
| REQ-NAV-002 | **DEFECT** | Rejecting unknown keys proves only a subset constraint. An empty assessment, or one missing payment/recovery, can satisfy the contract while violating “exactly the canonical keys”. |
| REQ-RES-001 | **ACCEPTABLE-DIFFERENCE** | “the TypeScript tree contains **no training or evaluation implementation of its own**” preserves the prohibition. The modal regex simply lacks that negative form. This ruling concerns the alleged modal loss, not completion of T21 migration. |
| REQ-STACK-011 | **DEFECT** | Observing proven facets/derived level does not exclude another route for joining a product outside the product integration contract. “exactly the facets proven” is not itself the defect; loss of the joining restriction is. |
| REQ-STACK-014 | **DEFECT** | “no requirement that a product change to accommodate it” prohibits even product changes that introduce no dependency on Horizon; the ruler prohibits changes **that make the product depend on Horizon**. Also, independent operation through public surfaces does not prove that Horizon's integration itself uses only public surfaces. The regex's claim of an absent prohibition is not the correct rationale. |

The intersection of changed requirements and **every requirement named anywhere in the baseline** is **REQ-CASE-003, REQ-INT-004, REQ-SEC-005, REQ-STACK-006, REQ-STACK-012, REQ-UI-006**. The builder's empty-intersection claim is false. Five entries refer only to the active ledger's old defects; that alone need not hide a current candidate defect. The candidate `CASE-003` suppression is different: it expressly anticipates reintroduction of a repaired defect. I restored the old `CASE-003` expectation in a disposable candidate ledger: `check-witness-claims` still exited **0**, “no new policy”, and reported it as known. The independent modal instrument exited **1** on that regression; do not claim both instruments missed it. The acceptance-subject checker is also an additional defense against that exact original wording.

A baseline can track diagnostic debt or demonstrated lexical false positives. It cannot establish freeze readiness by exempting known-wrong contracts or treating a repaired defect's return as inherited debt. The named DEFECT rulings require revision 3 and another review under §9.

**R4: faithful_SHOULD.** “should be observed to respond” retains a soft recommendation, its profile, latency bound and percentile. The following progress/cancellation sentence remains mandatory and conditional on owner cancellation support. Nothing in the wording makes a latency miss a hard failure. OQ-001 may refine measurement/exception reporting later; no spec edit is warranted by this ruling.

## D-020 baseline, item by item

Line numbers below refer to committed `scripts/witness-claims-baseline.txt`. This covers all **11 check-contract lines** (10 unique strings, including one duplicate) and **14 check-modals lines**. The witness checker actually emits nine path-qualified known findings, representing five distinct finding messages across requirement IDs; that is different from 11 stored lines or nine distinct semantic defects.

`active` means the stored `requirements/ledger.yaml:` prefix; `candidate` means stored `ledger.yaml:`. Both scripts reduce a tested path to its basename. Consequently the stored `requirements/ledger.yaml:` keys never match directly; candidate `ledger.yaml:` keys can also suppress the active ledger. These entries are not path-isolated as their comments imply.

| Line | Stored item | Adjudication |
| --- | --- | --- |
| 11 | active CASE-003, SHOULD loss | Old contract really loses the two notions being separated; “should settle now” is a named judgment, not the requirement's soft modal. Candidate repairs it. Stored active key does not match directly. |
| 12 | active CASE-003, repeated | Exact duplicate of line 11; no additional finding. |
| 15 | candidate CASE-003, SHOULD loss | **Unsafe stale suppression**: repaired now, but demonstrated to hide its return from the witness checker. |
| 16 | active DEV-001, adds every | **DEFECT**, but the material problem is replacing failure/contradiction/recovery/payment/orchestration burden with all operation outcomes; categories can disappear. Stored active key is ineffective directly. |
| 17 | active NAV-002, drops exactly | **DEFECT**: subset acceptance is weaker than the exact seven-key set. |
| 18 | active STACK-004, adds every | **DEFECT**, for reversed “only” direction, not the word “every” in Reference preservation. |
| 19 | active STACK-011, adds exactly | The word “exactly” is an acceptable rendering of a level derived from proven facets; the same contract has the separate real joining-restriction defect. |
| 20 | candidate DEV-001, adds every | Same inherited **DEFECT** as line 16; suppression is not acceptance. |
| 21 | candidate NAV-002, drops exactly | Same inherited **DEFECT** as line 17. |
| 22 | candidate STACK-004, adds every | Same inherited **DEFECT** as line 18. |
| 23 | candidate STACK-011, adds exactly | Lexical warning alone is not a defect; joining restriction remains a **DEFECT**. |
| 26 | active CASE-003, soft obligation | Misclassified modal, real loss of the two judgment names; corrected in candidate. Stored active key never matches directly. |
| 27 | active INT-004, prohibition | Real inverted prohibition in active ledger; corrected in candidate. Stored active key does not suppress it. |
| 28 | active NAV-002, exactly | Real **DEFECT** in both ledgers; effectively suppressed through line 36. |
| 29 | active RES-001, prohibition | **ACCEPTABLE-DIFFERENCE**: “contains no” retains prohibition; effectively suppressed through line 37. |
| 30 | active SEC-005, prohibition | False lexical loss: active text says “never be exposed”, already prohibiting exposure; candidate makes the subject explicit. Stored active key does not match. |
| 31 | active STACK-006, prohibition | Real inverted prohibition; corrected in candidate; stored active key does not match. |
| 32 | active STACK-011, only | Real **DEFECT**; effectively suppressed through line 38. |
| 33 | active STACK-012, prohibition | Real inverted prohibition; corrected in candidate; stored active key does not match. |
| 34 | active STACK-014, prohibition | Negative wording survives, so this lexical diagnosis is wrong; the contract is nevertheless a **DEFECT** for scope/strength, as ruled above. |
| 35 | active UI-006, prohibition | Real inverted prohibition; corrected in candidate; stored active key does not match. |
| 36 | candidate NAV-002, exactly | Real unchanged **DEFECT**, not freezeable inherited debt. |
| 37 | candidate RES-001, prohibition | **ACCEPTABLE-DIFFERENCE**, a documented lexical false positive is an appropriate diagnostic exception. |
| 38 | candidate STACK-011, only | Real unchanged **DEFECT**, not freezeable inherited debt. |
| 39 | candidate STACK-014, prohibition | Lexical false positive on negation; independently **DEFECT** on actual meaning. |

## Findings

### F1 — Frozen E2E falsifier still triggers

**S2 · confirmed · pre-existing (blocking).** `.agents/prereg/horizon/T04.prereg.yaml:85`, `scripts/teeth.ts` metadata-only branch. Independently deleting the required `@godspeedai/cognate-domainforge` dependency while keeping installed modules produces boundary exit 1 but `bun test test/app.test.ts` exit **0**, **6 pass / 0 fail / 85 assertions**. The prereg explicitly makes that E2E outcome a falsifier; the candidate's prereg patch changes only `verified_by` and leaves it intact. The real boundary protection is useful, but cannot retrospectively change that frozen oracle. Either make the E2E discriminate the preregistered condition or propose an explicit oracle correction for review. **Candidate revision / re-freeze required: yes.**

### F2 — Inherited contracts alter or omit load-bearing rules

**S2 · confirmed · pre-existing (blocking).** Active and candidate ledger contract sections, respectively at lines 4767, 4832, 4987, 5022 and 5037:

- **AC-DEV-001-01:** retaining every operation outcome does not retain payment, recovery or orchestration burden. A system discarding those records can pass this contract. It also adds retention of all successful outcomes without that being the stated rule.
- **AC-NAV-002-01:** an empty or incomplete gate map passes the “no outside key” condition; the source demands exactly seven canonical keys.
- **AC-STACK-004-01:** “Bounded long-horizon work runs only through Gauntlet” reverses the source restriction, “Gauntlet MUST be used only for tasks that require bounded long-horizon work.” It bans the alternative bounded Cognate execution world expressly allowed for research in REQ-RES-003, while failing to prohibit using Gauntlet for short work.
- **AC-STACK-011-01:** observable facets do not prohibit a product joining through a competing integration route.
- **AC-STACK-014-01:** prohibits all accommodation changes rather than dependency-producing changes, and does not test the integration's exclusive use of public surfaces.

These are retained in the proposed new frozen ledger, so “unchanged” cannot excuse them at this freeze. REQ-RES-001's negative paraphrase is accepted. **Candidate revision / re-freeze required: yes.**

### F3 — Revised witness claims exceed what their code observes

**S2 · confirmed · introduced/worsened in the revision work.** `src/domain/contracts.ts:63`, `test/acceptance.test.ts:31`, `scripts/ledger-policy.candidate.yaml:34`, and its `evaluated_by`/`witness_supplies` entries.

The source algorithm is `firstAvailableThatAddressesMaterialDeviationOrNone(assessments)`, not `firstAvailable(assessments)`. The implementation checks only `assessment.status === "available"` and then copies the deviation's operation into `responds_to`. It has no addressing relation or material-deviation assessment. A fresh input naming `unrelated.external-operation` produced:

```json
{"kind":"primary","operation_ref":"horizon.health","responds_to":"unrelated.external-operation"}
```

The only choices were `horizon.health` and `horizon.research.health`. No relationship to the supplied deviation was established. The witness tests explicitly expect the same first-available selection, so they approve the defect. INV-01 defines availability conditions; it does not define material deviation as unavailability, contrary to the overlay comment.

The CONFIG-004 witness now really loads two configurations, which is an improvement. But it varies Horizon's **listening address** and launch-secret **path**, not a configured provider's endpoint or credentials; it covers neither provider timeout nor scope. Its returned `intentIds` are operation refs, not the committed intent IDs. The expected file paths also differ because each run uses a different temporary root. `witness_supplies` still calls these “two different provider configurations”, exceeding the observation (`test/acceptance.test.ts:114`, `:131`).

The NAV-005 tests call `resolvableContext` directly. Searching committed `src/**/*.ts` finds no caller of that helper or `evaluateDeviation` outside their definitions/comments. Resolving four references in an unused helper does not observe whether a controller asks an avoidable question. The invented pinned vocabulary is gone, but a decisive controller witness remains absent.

The three current rule texts are faithful; their evaluation claims must remain explicitly partial/open until the real distinctions can be exercised. **Candidate revision / re-freeze required: yes**, because their evaluation metadata and acceptance sufficiency are part of the candidate formation claim; do not edit the frozen spec to invent missing policy.

### F4 — Baseline permits repaired findings to be called inherited

**S2 · confirmed · introduced in the checker/baseline design.** `scripts/witness-claims-baseline.txt:15`, `scripts/check-witness-claims.py:171`, `:224`, `scripts/measure-contract-modals.py:54`. The demonstrated CASE-003 regression is suppressed by the witness checker. Matching uses filename and finding text, without original contract content or revision identity, and confuses active/candidate ledger scopes. The repaired-case suppression must not survive as a nonfatal exception. The modal instrument catches this particular regression, but `gate-t04` does not depend on `contract-modals`, and neither instrument establishes semantic equivalence. **Candidate revision / re-freeze required: yes** for candidate readiness; these scripts themselves are mutable, and the frozen spec requires no edit.

### F5 — Frozen integrity overclaim and four inverted prohibitions remain active

**S1 for the active inverted acceptance oracle; S2 for the integrity claim · confirmed · resolved by proposal, not yet by an applied freeze.** `requirements/ledger.yaml:4822` (INT-004), `:4997` (STACK-006), `:5027` (STACK-012), `:5067` (UI-006); `.agents/prereg/horizon/T04.prereg.yaml:32`. The active contracts positively require the prohibited events, and `verified_by` still cites validation alongside the pin correction. Independently rerunning the inspected DomainForge tooth gives null/dangling/duplicate exit 0 and undefined-entity control exit 1. Zero violations is compilation/symbol-resolution evidence, not requirement-reference integrity. The candidate correctly restores the four prohibitions and qualifies the prereg claim; retain those corrections in revision 3. **Candidate revision / re-freeze required: yes.**

### F6 — Boundary gate exempts a duplicate canonical subtree

**S2 · confirmed · exposed, pre-existing (blocking for NE-04).** `scripts/check-boundaries.ts:71`. A fresh `other/extra.sea` is rejected, but a byte-for-byte duplicate of the full canonical entry under `.sea/alternative/interaction-model.sea` is accepted, exit 0. Arbitrarily exempting the whole `.sea/` tree does not enforce the recorded single canonical source boundary. This is a verification/topology defect; it is not evidence that pinned runtime world loading accepted a changed closure. **Candidate revision / re-freeze required: no for this mutable checker alone**; repair and rerun before T04 settlement, and retain the failed arm as evidence.

### F7 — Criticism and summary are ahead of the evidence

**S3 · confirmed · introduced/stale documentation.** `criticism-round1.md:27`, `:53`, `:76`, `:111`; `SUMMARY.md:11`, `:147`. The full-candidate modal success, empty baseline intersection and equivalence of first-available to addressing-deviation are contradicted above. The summary says “All mechanical gates pass” and “Mechanically complete and honest”; the current recorder exits 1 and the active oracle still falsifies a stated condition. Its disclosure of reconstruction and later remediation is useful, but does not make those broad claims current. **Candidate revision / re-freeze required: no for these mutable records alone.**

### F8 — Missed pre-freeze criticism order

**S3 · confirmed · pre-existing recorded deviation.** Prereg PE-01 and confirmation condition (`:46`, `:141`). PE-01 remains unmet as written. DEC-T04-01 explicitly accepts the weaker post-freeze procedure while preserving this fact. I accept the procedural deviation as recorded; it does not excuse any substantive frozen-artifact defect. **Candidate revision / re-freeze required: no solely for the ordering miss**; F2/F3/F5 independently require a new freeze.

## All 98 contract audit

I compared each candidate expected outcome to the actual frozen spec, not the builder's diff table. In the following 72-row table, each ID denotes `AC-<suffix>-01` and `REQ-<suffix>`. `yes` records preservation of modal meaning, subject, quantifier and any prohibition; `—` means that aspect is absent from the source clause, not a failed check. This is a wording audit, not evidence that its future task has implemented the behavior. Every row is also in the changed-requirement set used for the baseline intersection.

| Suffix | Modal | Subject | Quantifier/restriction | Prohibition | Disposition |
| --- | --- | --- | --- | --- | --- |
| CASE-001 | yes | yes | yes | yes | faithful |
| CASE-002 | yes | yes | yes | — | faithful text; F3 witness |
| CASE-003 | yes | yes | yes | — | repaired named distinction; not a normative SHOULD |
| CONFIG-002 | yes | yes | yes | — | faithful |
| CONFIG-004 | yes | yes | yes | — | faithful text; F3 witness |
| DEV-003 | yes | yes | yes | yes | faithful |
| GOAL-001 | yes | yes | yes | — | faithful |
| GOAL-002 | yes | yes | yes | — | faithful |
| GOAL-003 | yes | yes | yes | — | faithful |
| GOAL-004 | yes | yes | yes | — | faithful |
| GOAL-005 | yes | yes | yes | — | faithful |
| INT-001 | yes | yes | yes | — | faithful |
| INT-002 | yes | yes | yes | — | faithful |
| INT-004 | yes | yes | yes | yes | repairs inversion |
| NAV-003 | yes | yes | yes | yes | restricted MAY and blocked-path duty survive |
| NAV-004 | yes | yes | yes | — | faithful |
| NAV-005 | yes | yes | yes | — | faithful text; F3 witness |
| NAV-007 | yes | yes | yes | — | faithful |
| OUT-001 | yes | yes | yes | — | faithful |
| OUT-002 | yes | yes | yes | yes | faithful |
| OUT-003 | yes | yes | yes | — | faithful |
| OUT-004 | yes | yes | yes | yes | faithful |
| RES-002 | yes | yes | yes | yes | faithful |
| RES-003 | yes | yes | yes | yes | alternative bounded executor survives |
| RES-004 | yes | yes | yes | yes | permission, activation conditions and hard-gate prohibition survive |
| RES-005 | yes | yes | yes | yes | faithful |
| RES-006 | yes | yes | yes | yes | faithful; agreement typo is immaterial |
| RES-007 | yes | yes | yes | yes | faithful |
| SAFE-001 | yes | yes | yes | yes | faithful |
| SAFE-002 | yes | yes | yes | — | faithful |
| SAFE-003 | yes | yes | yes | — | faithful |
| SAFE-004 | yes | yes | yes | — | faithful |
| SAFE-005 | yes | yes | yes | yes | faithful |
| SEC-002 | yes | yes | yes | — | faithful |
| SEC-003 | yes | yes | yes | yes | faithful |
| SEC-005 | yes | yes | yes | yes | retains existing negative meaning, restores subject |
| SEC-006 | yes | yes | yes | yes | profile limitation retained |
| STACK-001 | yes | yes | yes | yes | exclusive owner survives |
| STACK-002 | yes | yes | yes | yes | lowercase not preserved with clearer phrasing |
| STACK-003 | yes | yes | yes | yes | faithful |
| STACK-005 | yes | yes | yes | yes | faithful |
| STACK-006 | yes | yes | yes | yes | repairs inversion |
| STACK-007 | yes | yes | yes | — | faithful |
| STACK-008 | yes | yes | yes | — | faithful |
| STACK-009 | yes | yes | yes | yes | exact/unexpired grant restriction and non-allow no-effect survive |
| STACK-010 | yes | yes | yes | yes | faithful |
| STACK-012 | yes | yes | yes | yes | repairs inversion |
| STACK-013 | yes | yes | yes | yes | optional hosted surface, mandatory trust separation |
| UI-002 | yes | yes | yes | yes | faithful |
| UI-003 | yes | yes | yes | — | faithful |
| UI-004 | yes | yes | yes | — | faithful |
| UI-005 | yes | yes | yes | — | faithful |
| UI-006 | yes | yes | yes | yes | repairs inversion |
| UI-007 | yes | yes | yes | — | faithful |
| UI-008 | yes | yes | yes | yes | faithful |
| UX-002 | yes | yes | yes | — | faithful |
| UX-003 | yes | yes | yes | — | faithful |
| UX-004 | yes | yes | yes | — | faithful |
| UX-005 | yes | yes | yes | yes | faithful |
| UX-006 | yes | yes | yes | — | faithful |
| UX-007 | yes | yes | yes | yes | faithful |
| UX-008 | yes | yes | yes | — | faithful |
| UX-009 | yes | yes | yes | — | faithful SHOULD; mandatory second sentence survives |
| UX-010 | yes | yes | yes | — | faithful |
| UX-011 | yes | yes | yes | — | faithful |
| UX-012 | yes | yes | yes | — | faithful |
| WORLD-002 | yes | yes | yes | — | faithful |
| WORLD-003 | yes | yes | yes | — | faithful |
| WORLD-005 | yes | yes | yes | — | faithful |
| WORLD-006 | yes | yes | yes | yes | checkpoint and database-ownership clauses survive |
| WORLD-007 | yes | yes | yes | — | faithful |
| WORLD-008 | yes | yes | yes | yes | pinned alias mandatory, derived diff optional, identity prohibition survives |

The other 26 were audited individually as well. A selected falsifiable example need not quote the whole requirement; it must not be mistaken for complete conformance. In particular, INT-003's duplicate-intent example does not prove stable semantic IDs and stale-frame rejection, and NAV-006's example does not prove the entire authority enum or deferred-to-invocation semantics. Their future task must cover those remaining source obligations.

| Suffix | Audit |
| --- | --- |
| CONFIG-001 | Falsifiable presentation-spoofing example of trusted identity; service-authority coverage remains a source obligation. |
| CONFIG-003 | Falsifiable semantic-adapter absence example; not exhaustive proof for every adapter. |
| CONFIG-010 | Observable startup identity/world/capabilities; pin refusal is consistent with source hard gates. |
| CONFIG-011 | Observable invocation revalidation/refusal; no modal inversion. |
| CONFIG-012 | Observable dependent-only blocking and retained read-only access. |
| DEV-001 | **revise**, F2: retained outcome categories do not cover the named developmental inputs. |
| DEV-002 | Refusal of unsupported durable claim preserves the prohibition; repeated settlement and transfer/recovery evidence remain required. |
| INT-003 | Falsifiable idempotency example; partial coverage of the conjunctive source requirement. |
| NAV-001 | Falsifiable non-availability example; does not alone prove complete before-ranking classification. |
| NAV-002 | **revise**, F2: subset versus exact set. |
| NAV-006 | Falsifiable non-granting-authority example; partial coverage of the source enum and deferred case. |
| RES-001 | Negative paraphrase preserves prohibition; full original subsystem migration remains open at T21. |
| SEC-001 | Refusal/no external effect preserves anti-bypass prohibition. |
| SEC-004 | Remote refusal preserves prohibition on reusing the donor's local trust assumption. |
| STACK-004 | **revise**, F2: reverses necessary restriction into executor exclusivity. |
| STACK-011 | **revise**, F2: no exclusive joining boundary. |
| STACK-014 | **revise**, F2: prohibition overstrengthened and integration public-surface condition omitted. |
| UI-001 | Executable-content rejection/closed accepted surface is falsifiable; full version/role coverage remains source-governed. |
| UX-001 | Observable resume/home contents; future home gate must include SEA-Forge approvals, not merely generic human notices. |
| VERIFY-001 | Observable renderer-equivalent choices/intents for same fixture/revision. |
| VERIFY-002 | Observable refusal/no-effect negative fixtures, consistent with the broader fail-closed requirements. |
| VERIFY-003 | Observable durable reconstruction after restart, consistent with Cognate event ownership. |
| VERIFY-004 | Observable separately scoped conclusions bounded by evidence. |
| VERIFY-005 | Observable recorded canonical-journey fixtures; required-integration skip failure is consistent with conformance rules. |
| WORLD-001 | Observable distinctly typed search results; owning task must preserve all required searchable categories. |
| WORLD-004 | Observable immutable historical/current/candidate distinction. |

## Answers

1. **Recorder exit 1, not 0.** With Bun 1.4.0, uv 0.12.1 and the supplied DomainForge 0.21.1 executable, `bash .agents/evidence/horizon/T04/run-gates.sh` reported:

   ```text
   check=0 boundaries=0 idm-integrity=0 acceptance-claims=0
   acceptance-claims-frozen=1 witness-claims=0 contract-modals=0
   contract-modals-frozen=1 test=0 ledger=0 wayfinder=0 teeth=0
   verify=0 gate-t04=0
   recorder process exit=1
   ```

   The eight separately run targets were `check=0 boundaries=0 test=0 ledger=0 wayfinder=0 teeth=0 verify=0 gate-t04=0`. Individual `just test`: **20 pass, 0 fail, 125 expect() calls; 4 pytest passed**. Initially the restricted sandbox denied local HTTP binds (`EPERM`), giving two Bun failures; that environmental run was stopped, and the full recorder and individual targets were rerun with loopback access. Those permission failures are not implementation findings.

2. No required target was observed to be assertion-free: aggregation recipes execute asserting prerequisites. However structural validation is not semantic validation, the witness baseline returns green with known findings, and `teeth.ts` says “all attacks blocked” after explicitly recording metadata-removal E2E exit 0. The request's claim that `verify` omits teeth is stale: `justfile:70` includes **idm-integrity and teeth**. `gate-t04` covers a subset of acceptance, never independent-critic ordering or full contract semantics, and does not include the separate modal target.

3. PE-01 is **FAIL as written**. The order miss is the acceptable recorded DEC-T04-01 deviation, not a fabricated prospective review. Ordering alone does not demand a re-freeze; material oracle defects do. A new freeze must occur only after revision 3's substantive findings are addressed and independently reviewed.

4. **W2:** parsed YAML confirms 72/98 active contracts have the generic prefix; plain apostrophe grep is unsuitable. Four expectations are operationally underdetermined as complete acceptance oracles: **AC-CASE-002-01** has no binding that determines whether a recommendation addresses material deviation; **AC-CASE-003-01** says merely “be separate” without naming the two notions; **AC-CONFIG-004-01** names no configuration/behavior observation; **AC-NAV-005-01** names no actual controller question/resolution observation. Revision 2 repairs CASE-003's nouns but F3 explains why the other three witnesses are still insufficient.

   Separately, **four falsifiable-but-wrong** expectations are AC-INT-004-01, AC-STACK-006-01, AC-STACK-012-01 and AC-UI-006-01: they invert the required result. They are not called unfalsifiable just because they are wrong.

   The subject-retention check reports **65** generic contracts losing the source subject; their full list is the 72-row table above **excluding NAV-003, RES-004, RES-006, SEC-006, STACK-009, STACK-013 and UX-009**. This is a structural defect in the active form, including the erased CASE-003 distinction. I do **not** infer that all 65 requirements are logically impossible to falsify: for the remaining linked statements the requirement ID recovers the actor/invariant. Nor do I call the seven subject-preserving generic statements unfalsifiable merely because they restate their rule. A source-linked invariant can be falsified by a violating observation; a prospective `gate-tNN` supplies the planned proof location. Unimplemented gates are red obligations, not performed experiments or satisfaction evidence. Revision 2 restores the subjects, but the five inherited meaning defects and F3 still block its adequacy. The 98-row audit records the full population and partial-coverage limits.

5. **W3:** the tooth is discriminating: null/dangling/duplicate return 0 with “0 violations”, undefined-entity control returns 1. The active frozen prereg's `pin_revision.verified_by` remains a **material overclaim**, and the candidate patch correctly limits it. SUMMARY includes an explicit correction but also leaves the earlier sentence “Verified by domainforge validate --application and scripts/world-ref.py”; read it with the correction, not as independent integrity proof. Historical raw zero-violation output may remain as evidence of that tool's output. No `0 violations` phrase was found in the plan. Canonical-source SHA-256 remained unchanged after all teeth.

6. The fragment digest is sound **as a content-integrity convention anchored to a trusted commit/freeze decision**: normalize the self-hash field to a fixed marker, then hash the rest; the Wayfinder binds whole-file hashes. It proves neither semantic fidelity nor who authorized a newly recomputed set of hashes. Its documented convention and local validators are not independent authority; accepting an attacker-rewritten ledger, hash block and checker would inherit that attacker's trust. No cryptographic circularity is created by excluding the self-hash field.

7. Independent NE results are in Per-criterion. Metadata boundary, configured memory store, competing product-model, outside-tree `.sea`, false pin and missing entry all block. The additional duplicate canonical subtree does not block. Independently substituted memory-only runtime: matched real control **6 pass / 0 fail / 85 assertions, exit 0**; fake **3 pass / 3 fail / 22 assertions, exit 1**, including the SQLite-header assertion. Thus the fake-runtime arm is no longer falsified by that fixture. The metadata-only E2E arm still passes and triggers the separate literal prereg falsifier.

8. SUMMARY's “All mechanical gates pass” and “Mechanically complete and honest” overstate current evidence: recorder exit 1, unbaselined candidate modals exit 1, and the frozen metadata-removal E2E falsifier is still true. The remediated source-to-intent-to-projection claim **is** supported by the real runtime, independent SQLite reads and reopen test; I do not carry forward the earlier build's failure. The summary's old 8-test table is historical, not the current 20-test result. Reconstruction is adequately disclosed; the original scaffold invocation/output remains unproved.

9. The re-pin is independently justified by the stated one-line correction: with the complete committed import closure, `world-ref.py` yields **world:horizon@sha256:6c18d6a608bd9d83e6aa354d5a8cc804009ca208562021c1736ee429412309f0**; reverting only INV-08's requirement from INT-003 to NAV-001 yields **world:horizon@sha256:b0f31fcc60f49af730ca0b863af8e0eae990924fd0beb1d004f10c602cd24ca1**. The first attempt using only the entry file failed because its imports were absent; it is not evidence against either pin. This is a disclosed binding correction consistent with the frozen spec, not evidence of a silently promoted alternative world. It establishes derivation, not permission to mutate an old pinned execution. R4 separately answers the UX SHOULD question.

10. No copied competing truth engine was found in the inspected committed application sources or package imports. Cognate owns the durable events and projections; the UI code is a frame projection. `docs/donors.md` attributes the donor and explicitly limits reuse. I did not independently authenticate the external donor's relicensing history from this tree.

11. Additional material observations: the basename collision/stale baseline entry, incorrect first-available witness, and canonical-subtree boundary gap are detailed above. No hidden `.skip()`/`.todo()` was found in inspected `src/`, `test/`, `scripts/` or research source. The `grep ... || true` in freeze checking is followed by an explicit nonempty/hash assertion. The row-removal tooth's `freeze-formation.sh || true` deliberately allows a failed refreeze before the later checker must fail; that is bounded attack setup, not a swallowed success gate. Research failures become explicit unavailable/invalid observations. `scaffold.log` is plainly reconstructed. Freshly invoking the committed 0.6.1 CLI against an archive of Cognate commit **a477933a1ddf1a8bcd64b4e762ccbb56e5fbd7d5** independently produced **27 vendored packages**, exit 0, manifest SHA-256 **773811cb68636ba289c6b75e194754004a4ad4fdc238b42e51fd22ea1db9aef4**. That corroborates fresh creation, not the lost historical run.

## Scope limits

This verifies a local structural skeleton and the proposed formation artifacts, not live SEA-Forge/Gauntlet/RealityTrace/Context Kernel settlement, complete research migration, full navigation behavior or final T19 conformance. The known `REQ-CMP-001` dangling reference remains disclosed D-016; the owner explicitly excludes a canonical-world change in this round, and I made none. Future task gates and selected-example contracts remain open rather than inferred green. A finite fake-runtime fixture does not establish discrimination against every conceivable substitute.

The current request's frozen pins and all inspected implementation inputs came from committed Git objects. External tools/required skills and the explicitly pinned Cognate source archive were used as tooling, not uncommitted implementation evidence. The only repository output of this review is this verdict. No settlement is recorded. **Next action: prepare revision 3 addressing the material findings, then obtain a fresh independent review before freezing.**
