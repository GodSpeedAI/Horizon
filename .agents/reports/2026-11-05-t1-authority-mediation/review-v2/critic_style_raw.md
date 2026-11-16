# Stage 7 — egm-style — verbatim reviewer output (v4, lines 1-84)

egm-style REVIEW: `/home/sprime01/projects/Horizon/.agents/reports/2026-11-05-t1-authority-mediation/design_draft.md`, lines 1-84. No standard was assigned, so this review applies only the persona's audit vectors from `/home/sprime01/.claude/plugins/cache/egm/egm/0.1.0/agents/style.md`. I read both files in full for this scope.

**Findings**

1. **Major**: Line 47, "Consumers disentangle the two by folklore."
   - Discrepancy: this is the closing sentence of the problem statement, and it is informal and can't be checked. It doesn't say which consumers, or what goes wrong in practice (misread fields, wrong verb, wrong id).
   - Rationale: a problem statement should state the observable failure. Replace it with a concrete statement, for example "Consumers tell the two apart only by convention; no contract or type separates them."

2. **Major**: Line 47, "Owner adjudication: one typed, hardened client; both fronts on it; the two concepts renamed apart; boundary enforcement; everything by subtraction."
   - Discrepancy: a run of noun fragments. "Everything by subtraction" is undefined at this point; the reader only learns what it means at Goal 4 (line 70).
   - Rationale: the compressed shorthand hides meaning. Either write full clauses or point to the Goals list.

3. **Major**: Line 69, "Zero exceptions" comes right after the statement that `scripts/` and `test/` are allowlisted by directory.
   - Discrepancy: an absolute claim sits next to two stated exemptions, so the reader sees a contradiction.
   - Rationale: say what it actually means, for example "No exceptions inside `src/`: the delegated decide path moves onto the SDK."

4. **Major**: Line 78, "Capacity and case write-moves."
   - Discrepancy: "write-moves" is not defined in the Vocabulary or anywhere else in scope. The bullet gives no reason or owner.
   - Rationale: an undefined term in a scope boundary leaves the boundary unclear. Define it, or describe the excluded operations concretely.

5. **Nit**: Line 36, "today it is aspirational."
   - Rationale: soft, judgement-style wording. State the fact instead: "Horizon does not meet it: app code makes raw socket calls in three places beyond its adapter."

6. **Nit**: Line 36, "Two shipping product fronts".
   - Rationale: "shipping" is ambiguous (released, or in production?). The inserted clause "the first dogfood product per owner direction" also interrupts the list of the two fronts. Move it to its own sentence.

7. **Nit**: Lines 68 and 79, "owner-adopted rider; its payoff is mostly the later retirement…" and "packaging-green rider".
   - Rationale: "rider", "payoff" and "packaging-green" are jargon that the Vocabulary doesn't define, and "mostly" is vague. Use a plain phrase such as "an additional owner-approved change" and state the benefit precisely.

8. **Nit**: Line 69, heading "Strict, enforceable mediation boundary".
   - Rationale: "Strict" and "enforceable" overlap, and the goal describes an enforced check. "Enforced mediation boundary" is enough. Separately, "shown to have teeth by a mutation script" restates the Teeth definition at line 18. "The check has Teeth (see Vocabulary)" or "A mutation script proves the check fails" is enough.

9. **Nit**: Line 71, heading "Evidence first and at the tag." and the phrase "as the standing correctness, recovery and release artifact".
   - Rationale: the heading is cryptic, and the stacked noun phrase is hard to parse. Suggested heading: "Runbook evidence before the train and at the 0.4.0 tag." Then say plainly what the second run proves.

10. **Nit**: Line 76, "REQ-NAV-006 already defines the honest state."
    - Rationale: "honest" is a judgement word. Name the state: "decided at invocation" (line 59).

11. **Nit**: Line 77 restates the sea-rs #79 description from line 25 almost word for word.
    - Rationale: duplicated text. Reference the History row instead ("sea-rs #79 (see History)").

12. **Nit**: Lines 59 and 75 both say that identity unification belongs to T2. Line 19 also carries T2's full acceptance bar inside a Vocabulary row.
    - Rationale: the same point appears three times, and a glossary entry carries requirement text. Keep the bar in one place (Non-Goals or a T2 reference) and keep the Vocabulary entry to a definition.

13. **Nit**: Line 14, Cognate SDK row. The release-please linked-versions detail is release process, not a definition.
    - Rationale: it makes the glossary row longer than it needs to be. It could move to Goal 4, where linked-versions matters.

14. **Nit**: Line 16, "that fronts observe outcomes with".
    - Rationale: awkward word order. Suggested: "the CLI that fronts use to record observed outcomes."

15. **Nit**: Line 29, "Horizon's current branch is its head branch".
    - Rationale: relative to the time of writing, so it will go out of date. Name the branch.

16. **Nit**: Line 4, "seven directions", and line 83, "escalated as E-2".
    - Rationale: these refer to items that are not identified or linked within the scope. Name or link the source (the adjudication record and the escalation list).

17. **Nit**: Line 3, the Status bullet chains four document references into one sentence.
    - Rationale: hard to scan. Split it into a short status value and a list of the review artifacts.

**Verdict:** No blockers. Four Major findings (2 unclear sentences in the problem statement, the "Zero exceptions" contradiction, the undefined "write-moves") must be fixed. The 13 Nits are optional.
