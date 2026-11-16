# Stage 7 — egm-structural — verbatim reviewer output (v4, lines 1-84)

**egm-structural review of the FeatureRange (lines 1-84)**

Target: /home/sprime01/projects/Horizon/.agents/reports/2026-11-05-t1-authority-mediation/design_draft.md
Standard: /home/sprime01/.claude/plugins/cache/egm/egm/0.1.0/resources/document_standards/feature-spec-standard.md
I read the persona, the standard, the full target and the concepts brief's headings. Every artifact path cited in lines 3-4 exists: `review/stage-reports.md`, `RESOLUTION.md`, `review-v2/stage5_resolution.md`, `review-v2/stage6_resolution.md` and `../2026-11-04-egm-design-discovery/`.

**Structure map**
- H1 Title (1)
  - H3 Vocabulary (6)
  - H3 History referenced (21)
- H2 The Problem (34)
- H2 Overview (49)
- H2 Goals (61)
- H2 Non-Goals (73)

**Coverage against the standard (in scope):**
- Problem Statement maps to "The Problem".
- Goals & Non-Goals maps to "Goals" and "Non-Goals".
- Proposed Architecture, Alternatives Considered and Risks & Mitigations fall outside the range. They are present later in the file (lines 85+, 205, 219), so nothing required is missing from the range.

**Findings**

1. **Severity: Major**
   **Affected Scope:** lines 1, 6, 21, 34
   **Discrepancy & Rationale:** The heading hierarchy skips a level. H1 (line 1) goes straight to H3 "Vocabulary" (line 6) and H3 "History referenced" (line 21), and only then reaches the first H2 (line 34). So the two H3s have no H2 parent and sit as orphans above the main sections. The persona's hierarchy rule bans exactly this H1 → H3 skip. Fix: promote both to H2, or group them under one H2 such as "## Reference" / "## Context".

2. **Severity: Nit**
   **Affected Scope:** line 34
   **Discrepancy & Rationale:** The heading is "The Problem", but the standard's label is "Problem Statement". The standard's list is non-exhaustive, so this doesn't fail it. Using the standard's label would make the mapping explicit and match the plain section names everywhere else ("Goals", "Non-Goals").

3. **Severity: Nit**
   **Affected Scope:** lines 13, 15, 19 (Vocabulary table)
   **Discrepancy & Rationale:** A glossary table is carrying normative and decision content:
   - line 19: T2's pre-agreed bar, the D-N2 condition and the HORIZON-001 1.2.0→1.3.0 amendment;
   - line 15: an agent-permission rule;
   - line 13: release mechanics.

   Lines 59 and 75 then point back to "see Vocabulary" for scope boundaries. Decisions should live in Non-Goals or a decisions section, with the Vocabulary row keeping only the definition.

4. **Severity: Nit**
   **Affected Scope:** lines 4, 71, 79, 83
   **Discrepancy & Rationale:** Some terms are used before they are defined, or are never defined in scope:
   - D-N1, D-N1/D-N3 and "seven directions" first appear at line 4. Only D-N2 is glossed (line 19), and D-N1 is explained only at line 214.
   - SWE_SEED is used at line 71 but only defined at line 79. Gauntlet is also defined only at line 79.
   - E-2 at line 83 forward-references the Risks section without a pointer.

   All of these belong in the Vocabulary table or should be glossed at first use.

5. **Severity: Nit**
   **Affected Scope:** lines 78, 80, 81, 82
   **Discrepancy & Rationale:** The Non-Goals bullets are asymmetric. Lines 75, 76, 77, 79 and 83 each pair the bold label with a rationale or owner. Lines 78, 80, 81 and 82 are bare labels with no reason or owning transformation. For a parallel list, either give each a one-clause reason or owner, or group the bare ones as "Out of scope, no owner change".

6. **Severity: Nit**
   **Affected Scope:** lines 25-32 (History referenced table)
   **Discrepancy & Rationale:** The table is inconsistent:
   - Row order: sea-rs refs run #79, #81, #84, #74, so they are neither numeric nor chronological.
   - Row style: some rows are descriptive paraphrases (#79, #15, `18f0c40`), while others are bare quoted PR titles (#81, `087fecc`, and partly #84).
   - Punctuation: lines 27 and 29 contain internal sentence breaks, while the other rows are single clauses.

   Pick one row form and sort the rows.

7. **Severity: Nit**
   **Affected Scope:** lines 38-40
   **Discrepancy & Rationale:** The call-site bullets aren't parallel. Line 38's description is one word ("closure"), line 39 is a two-sentence explanation, and line 40 is a short phrase. Using the same form for each (verb, then purpose) would make the list easier to scan.

8. **Severity: Nit**
   **Affected Scope:** lines 36-47
   **Discrepancy & Rationale:** "The Problem" holds two separate problems: duplicated, unhardened clients (36-40), and the approval-concept name collision (42-45). They have no sub-structure, and line 47 then mixes in the owner's adjudication, which is resolution content rather than problem content. Splitting into two labelled sub-problems, and moving line 47 to Overview, would mirror Goals 1 and 2.

**Formatting check:**
- Bullet markers (`*`) are consistent within the range.
- Both tables are well-formed: header, separator and matching column count.
- Goal 2's nested bullets and the continuation paragraph (lines 65-68) are indented correctly under the numbered item.
- There are no unclosed code spans or fences.
- No hyperlinks are used. The standard sets no link-format rule, and the cited paths resolve.

**Verdict:** Revise — one Major finding (the H1→H3 heading skip at lines 6 and 21) plus seven Nits. The required in-scope sections are present and the formatting is sound.
