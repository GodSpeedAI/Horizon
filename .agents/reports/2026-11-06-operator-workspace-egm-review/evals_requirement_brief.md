# Operator requirement: evals and benchmarking are first-class in Horizon

- Source: operator instruction given during the review on 2026-11-06, plus a talk transcript the operator supplied ("The Most Important Skill for AI Engineers"). The principles below are taken from that talk. The sponsor segment was excluded.
- Status: binding input for review Stages 8–9 and for remediation. The current spec (`Horizon_Operator_Workspace_Design_v1.md`) contains no eval or benchmark design. The only related text is L362, which covers latency and context-efficiency measurement.

## Principles to apply

1. **Agents are not unit-testable in the usual way.** Outputs are sampled, and there is often no single right string. Grade *properties* of an answer (right value, business rules followed, nothing invented), not exact text.
2. **Repeat each trial and report consistency.** Run each eval case k times and track how often the agent is right on every try (pass^k), not only on average. Each user gets one answer, so a usually-right agent still hands out wrong answers.
3. **Model evals and product evals are different.** Public benchmarks help choose a model. Product evals are questions the organization's own users ask, graded by the organization's *unwritten* rules. In the talk's example, the same agent scored about 9/10 on benchmark-style questions but under 5/10 on questions that needed business rules.
4. **Three grader types, applied in order:** first a human reads real answers and labels pass/fail; then code checks cover anything exact; then an LLM judge covers what is left or ambiguous.
   - A naive judge ("is this correct/helpful?") misses most failures. A rubric judge built from error-analysis groups works.
   - Check the judge against human labels and report the agreement rate. Look at every disagreement, because both judge and labels improve.
   - Use a different model for the judge than for the agent, to avoid it favoring its own style.
5. **Graders are code and have bugs.** Read failures before you trust a score. In the talk, about a quarter of the failures came from the grader.
6. **Error analysis decides what to test.** Read a batch of real conversations (aim for 100 or more), note the *first* thing that went wrong in each, then group and count. Spend effort on the largest groups. The failure you fear most may never appear.
7. **The eval set is never static.** Each new failure becomes a case. Data and usage drift over time.
8. **Re-run the whole set after every change** to a prompt, tool, model, or rule. A fix for one group can break another, for example by exhausting a step budget on tool calls.
9. **In complex agents, grade the trajectory as well as the final answer:** which tools were chosen, in what order, and with what inputs and outputs.

## What this means for Horizon (questions reviewers should test the spec against)

- **Ownership (§2):** who owns eval sets, cases, graders, human labels, judge rubrics, and run results? Candidates: Cognate (assignments and runs), RealityTrace (observed trajectories), and SEA-Forge (organizational rules, which are where the "unwritten rules" live). Horizon should *render and author*, not become a second eval harness. That matches the spec's own "projection surface" rule (§9).
- **The operator as the human grader:** the notebook and day views (§5) and the trajectory views (§8) are where the operator reads real runs. Labeling pass/fail and noting the "first thing that went wrong" should be native Horizon actions, with provenance.
- **Error analysis as a workflow:** group and count first-failure notes. This overlaps with tags and collections (§5).
- **Trajectory grading:** §8 trajectories (turns, model calls, tool calls) are the input for tool-selection and tool-order checks.
- **Advisor and delegated-work quality (§6, §7):** the resident advisor and Cognate delegations need product evals with pass^k. Currently §6's "cost per independently accepted outcome" (L175) has no definition, and an eval framework is how to define it.
- **Regression gate:** every change to a prompt, tool, model, or rule re-runs the full set. Results appear in Horizon with their environment, model, and grader version.
- **Judge calibration view:** agreement rate between judge and labels, with each disagreement reviewable.
- **Benchmarks for model selection:** results show model and environment provenance and are never mixed with product-eval scores.
- **Scope tension with Zoom Out finding 1:** "first-class" must be reconciled with the v1 = Slices A–C cut. The smallest v1 fit is probably: label a run pass/fail with a first-failure note, plus a view that groups those notes. Graders, judges, and regression runs would follow in later slices.
