# Stage 7 — Critic Review Report (Round 1)

- Target: `.agents/specs/Horizon_Operator_Workspace_Design_v1.md`, FeatureRange L1–298 (§1–11)
- Reviewers, all on Haiku: egm-design and egm-structural (both against `feature-spec-standard.md`), egm-style (persona only). All three completed.
- Elephant spot-check: D-2 confirmed. L44 says notes are "implemented with existing Cognate durable facilities", while L250 says "existing notes-compatible constructs **if found**".
- Round status: **not clean.** The round has 4 Blockers (C7-1, C7-2, C7-3, and the evals gap C7-28) and open Majors.

## Verdict

The spec fails the feature-spec standard. Two required sections are missing (Alternatives Considered, and Risks & Mitigations), and the J1 write path contradicts itself. Many Majors repeat Stages 5–6 and are cross-referenced below, not raised again.

## Consolidated findings

Finding IDs: `D` = design, `S` = structural, `W` = style, then the round and the number. ZO-n refers to Stage 5 (Zoom Out) finding n; CT-n refers to Stage 6 (Comprehension Test) finding n.

### 🔴 Blockers

| ID | Lines | Problem | Fix |
|----|-------|---------|-----|
| C7-1 (D-1-1, S-1-1) | whole range; choices in §5 L111–136, §7 L179–205, §8 L233–237, §9 L250 | There is no **Alternatives Considered** section. Each core choice is stated as a rule, with no option rejected and no reason given. The donor map (L67–77) lists what not to transplant, which is not a set of design alternatives. | Add a section with one row per decision: notes storage (Cognate facility / new Horizon store / external notes system), placement (reference / copy), trace join (read-side adapter / copy into journal / projection owned by RealityTrace), and advisor continuity (Cognate memory / Horizon store / stateless retrieval). Give the rejected option and the reason for each. |
| C7-2 (S-1-2, D-1-5) | whole range; fragments in §5, §8 L233–237, §9, §11 L286–297 | There is no **Risks & Mitigations** section. §11 lists qualities but no failure modes, scale limits, owners, or tests. | Add a table with columns risk, trigger, mitigation, residual risk, verification. Cover at least: duplicate assignment after redelivery, stale or out-of-order events, RealityTrace or Workbench unavailable, cross-org leakage through counts and autocomplete, journal loss on restart, trace payload leakage, and history-scale read cost. |
| C7-3 (D-1-2, D-1-3; relates to CT-6) | L44 vs L250, L113, §3 L60 | The J1 write path contradicts itself. L44 asserts that an existing Cognate facility covers notes, while L250 says "if found". L44 also introduces "a small Horizon-specific capability" without the four-part justification that §3 step 4 demands of any new component. | Name the verified Cognate facility with a file or API reference, or mark it unverified and make finding it a gating spike with an acceptance test. Then either supply the §3 justification or reframe the work as a composition of named primitives. |

### 🟡 Majors

| ID | Lines | Problem | Fix |
|----|-------|---------|-----|
| C7-4 (S-1-3, D-1-4; relates to ZO-1) | L14, L20–29, L49–53 | Goals and non-goals exist only as unlabeled prose. Nothing says which journeys are in v1. | Add `### Goals` and `### Non-goals` under §1. Mark each of J1–J10 as v1 or deferred, which settles ZO-1. |
| C7-5 (S-1-4, D-1-19) | §1 L10–18 | There is no problem statement or business motivation: no why-now and no cost of the status quo. | Retitle §1 "Problem statement and product intent" and add 2–3 sentences on the current pain. |
| C7-6 (S-1-5) | §2 L37–47, §4, §7 L183–191, §8, §9 L241–250 | The architecture is scattered across sections. There is no component list or data flow. | Add "Proposed architecture" with components, the data flow for J1 and J2, and a pointer to the §2 table. |
| C7-7 (D-1-6) | L213–215 | The heading "Verified starting point" sits over claims with no path, commit, or test name, and L215 says they are still "to verify". | Cite paths and a commit SHA, or retitle it "Claimed starting point (unverified)". |
| C7-8 (D-1-8) | L154, L158 | The advisor must keep "continuity of operator intent across days", yet a separate truth store is forbidden. Nothing says where that state lives, its scope, or how it is deleted. | Name the storage and its retention rule, or rebuild continuity from journal references each session. Add a consent and deletion rule. |
| C7-9 (D-1-9; same as ZO-10) | L74 vs L174, L292 | The donor row adopts session learning and passive observations from `~/.agents`, which conflicts with the privacy rules. | Adopt the mechanisms only. Ingest no `~/.agents` content by default, and require an opt-in consent gate before any archive ingestion. |
| C7-10 (D-1-10) | L140–144, L278, J9 L281 | Leakage requirements have no enforcement point. Nothing says who evaluates the permission model or how counts and suggestions avoid revealing restricted items. | Add an access-control subsection: the enforcement point, a filter-before-count rule, and a test asserting that no restricted count is returned. |
| C7-11 (D-1-11) | L195, L197, L278 (J8), L289 | "Exactly one eligible continuation" under at-least-once delivery has no deduplication key or admission record. | Define the idempotency key (source event + plan item + predicate version), a durable admission record with a uniqueness constraint, and a numeric retry bound. |
| C7-12 (D-1-12; tension with ZO-7) | L171, L175, L293 | There is no quantitative envelope: volumes, retention, page size, or a token or cost budget. "Cost per accepted outcome" is undefined. | Add an envelope table marked "assumptions until measured". Pair it with ZO-7: state assumptions now and cursor later. |
| C7-13 (D-1-13) | §10 L254–284 | Journeys J1–J10 have no pass/fail criteria or named tests. | Add an observable criterion or test name per journey, and label any target number as a target. |
| C7-14 (D-1-14; same scope as ZO-9) | L113, L121 | The day identity is deferred, with no candidate scheme or owner. | Propose the ZO-9 key (org, operator, local date) with the timezone convention as an attribute, and record the rejected alternative. |
| C7-15 (D-1-15; tension with ZO-6) | L233–237 | Join, cursor, redaction, and recovery are deferred to the implementer. The design critic says the spec must decide them, while ZO-6 says to measure the gap first. | Resolve this as candidate decisions to be ratified after the §12 gap check. Do not let them stay silent. |
| C7-16 (D-1-7, W-1-1; same as CT-1, CT-3, CT-5) | L5, L6, L12, L40, L43, L49, L63, L67, L71, L93, L104, L144 | Terms and acronyms are undefined: EGM, GS Term, FDE, "cognitive cockpit", sentries, settlement, the seven affordance gates, typed intentions, renderer grammar, replicator, leanrea, donor, Cobalt, "relationship map". | Settle this with the glossary from CT-1/3/5. Replace "cognitive cockpit" with a literal description. |
| C7-17 (W-1-2) | L14, L28, L83, L89, L93, L125, L166, L207, L215, L228, L291 | Qualifiers cannot be measured: "trustworthy", "rich", "natural", "keyboard-friendly", "restrained/quiet/meaningful", "where meaningful", "useful", "honest". | Replace each with an observable rule: "fully operable by keyboard alone", "labelled empty states", "views showing the §8 items", and so on. |
| C7-18 (W-1-3) | L152 | "The advisor … understands the selected organizational domain" claims comprehension that cannot be verified. | Write "is given access to the selected domain, case, goals, …". |
| C7-19 (W-1-4) | L219–229 (L228) | A list item does not match the list's lead-in ("should correlate: … Gaps … as honest states"). | Rewrite it as a separate sentence: "Represent gaps, delayed ingestion, … as explicit states." |

### 🟢 Nits

| ID | Lines | Fix |
|----|-------|-----|
| C7-20 (S-1-6) | H2 headings | After the Major fixes, add a table mapping each standard requirement to its section. |
| C7-21 (S-1-7, S-1-9) | L47, L197 | Turn the run-on lists into bullets. |
| C7-22 (S-1-8) | L5 | Move the review-process metadata out of the spec header. |
| C7-23 (D-1-16) | L59 | State whether the replicator and leanrea skills were located, or mark the step as outstanding. |
| C7-24 (D-1-17; relates to ZO-11, CT-7) | L79 | Add a composer acceptance criterion and the prototype's path or version. |
| C7-25 (D-1-18) | L3, L8, L49, L107 | Mark which requirements are binding (MUST) and which are candidates (SHOULD). |
| C7-26 (W-1-5) | L91, L133, L252, L269, L275, L290 | Delete filler: relevant, genuinely, actual (×2), accurately, where applicable. |
| C7-27 (W-1-6, W-1-7, W-1-8) | L79, L107, L121, L201, L215, L296 | Phrasing: "take focus"; "An absence of results is never reported as zero"; "synthetic replacements"; "invented model costs or evidence"; "interaction pattern". |

## Addendum — operator requirement: evals are first-class

The operator added this requirement during Stage 7. See `evals_requirement_brief.md`.

| ID | Sev | Lines | Problem | Fix |
|----|-----|-------|---------|-----|
| C7-28 (Elephant) | 🔴 | whole range; nearest are L175, L362, §6, §8, §10 | The spec has no eval or benchmark design, and the operator says evals are first-class. Nothing defines: product evals for the advisor and delegated runs; pass^k over repeated trials; the human → code → judge grader order; judge-to-label agreement; error analysis (first-failure notes, grouped and counted); trajectory grading; a full-set regression run after every prompt, tool, model, or rule change; or who owns eval sets, labels, and results. L175's "cost per independently accepted outcome" has no definition and depends on this. | Add an "Evaluation and benchmarking" section. Give ownership in the §2 table (Horizon renders and authors labels and notes; the systems that own runs and rules own the rest), the operator journeys (label a run, record its first failure, group failures, review judge disagreements, view regressions), and a v1 cut that fits ZO-1, e.g. labels plus first-failure notes plus a grouping view in v1, with graders, judge, and regression runs deferred. Add evals journeys to §10 and an eval risk row to C7-2. |

## Conflicts between reviewers to resolve during remediation

1. **Decide now or defer.** The design critic (C7-12, C7-15) wants decisions and numbers in the spec, while Zoom Out (ZO-6, ZO-7) wants measurement first. Proposed resolution: record each item as a *candidate decision, ratified after the §12 measurement*. That satisfies the standard without inventing numbers.
2. **Adding sections or cutting scope.** C7-1, C7-2, and C7-6 add sections, while ZO-1 cuts v1 scope. Proposed order: apply ZO-1 first. Then the Alternatives, Risks, and Architecture sections only have to cover v1 (Slices A–C), so they stay short.

## Traceability

| Raw finding | Consolidated |
|---|---|
| D-1-1, S-1-1 | C7-1 |
| S-1-2, D-1-5 | C7-2 |
| D-1-2, D-1-3 | C7-3 |
| S-1-3, D-1-4 | C7-4 |
| S-1-4, D-1-19 | C7-5 |
| S-1-5 | C7-6 |
| D-1-6 … D-1-15 | C7-7 … C7-15, C7-16 |
| W-1-1 | C7-16 |
| W-1-2 … W-1-4 | C7-17 … C7-19 |
| S-1-6 … S-1-9 | C7-20 … C7-22 |
| D-1-16 … D-1-18 | C7-23 … C7-25 |
| W-1-5 … W-1-8 | C7-26, C7-27 |
