# Cold-Agent Evaluation (P9)

Walking a generated substrate cold: prove a fresh agent with no conversation history reaches
the correct work and proof surface cheaply, record observed evidence, then fix structure until
the canonical question set is answerable at target cost.

## 1. Purpose and definition

A **cold actor** is a fresh agent with no conversation history and no prior exposure to the
repository. The substrate must let it work inefficient-only-by-bounded-amount: every question
below answerable from the repo alone, without reconstructing the architect's reasoning.

The walk generalizes the older "walk test" lineage: instead of a single end-to-end task, it
drives the canonical question set and measures the navigation cost to each answer. The walk is
not a test of the agent's reasoning; it is a test of the topology's routing.

Run the walk:
- at greenfield handoff, before P10;
- after brownfield restructure, per [brownfield-restructuring.md](brownfield-restructuring.md) step 4;
- on any claimed improvement to the substrate (must show before/after evidence).

Never assert the walk from memory. A walk that was never executed is not evidence and must not
be reported as one.

## 2. Canonical question set

Design every router and report so each of these is reachable in a small, bounded number of
reads. The walk answers each and records the path.

| # | Question | Canonical home |
|---|----------|----------------|
| 1 | Where am I? | `AGENTS.md` identity + repo map |
| 2 | Where is canonical project meaning? | `.sea/` canonical model |
| 3 | Where is the governing spec? | pinned spec (normative ruler) |
| 4 | Where is the current implementation plan? | `.agents/plans/` latest plan |
| 5 | What is the current status? | `.agents/CURRENT_STATUS.jsonl` last line (human skim: `.agents/CURRENT_STATUS.md`) |
| 6 | Which instructions apply here? | nearest applicable instructions, routed not padded |
| 7 | Where would change X belong? | component home per repo map / architecture section |
| 8 | What other components are affected? | dependency direction in architecture/boundaries |
| 9 | What is the public contract? | frozen contracts / acceptance contracts (AC-*) |
| 10 | How do I build the project? | `just build` |
| 11 | How do I run the narrowest relevant verification? | task-scoped gate, e.g. `just gate-ak-001` |
| 12 | How do I run global verification? | `just verify` |
| 13 | What must I not modify? | frozen surfaces per ledger / freeze header |
| 14 | Where should investigation evidence go? | `.agents/evidence/` and `.agents/reports/` |
| 15 | How do I tell whether a requirement has settled? | gate passes + evidence recorded, per [verification-topology.md](verification-topology.md) |

Each question maps to one canonical home. If answering requires reading content that lives
elsewhere, the home must link there — it must not duplicate the content.

## 3. Walk procedure

1. Start with a **cold actor**: no plan, no prior reads, no conversation history. Clear state
   before every run.
2. Ask each question in the canonical set. Record every read in order until the question is
   answered; record the minimal distinguishing path (first read to answer).
3. Document the minimal path per question, e.g. `AGENTS.md → tail -n 1 .agents/CURRENT_STATUS.jsonl (.agents/CURRENT_STATUS.md for skim) →
   spec.md → just gate-ak-001`.
4. **Target ≤2–3 reads** for most answers. Flag any answer needing >4 reads with no obvious
   link chain as a routing defect (Section 5).
5. Record both the minimal path and the actual observed path; the gap between them is the
   navigation burden (Section 4).
6. Run at least one concrete change request end-to-end (e.g. "add X and prove it") to expose
   edit-surface and verification-discovery debt the abstract questions miss.
7. Verify the frozen surfaces: attempt the prohibited edit, confirm it is either impossible
   or detected before it escapes. Use [gauntlet-formation-freeze.md](gauntlet-formation-freeze.md)
   for freeze semantics.
8. Save the raw evidence: each read, in order, per question, plus flags. Evidence lives in
   `.agents/reports/` or `.agents/evidence/`.

## 4. Navigation-burden indicators

Track these as concrete observations. Do not collapse them into a single "agent friendliness"
score. A number is useful only when it labels a known failure; otherwise record the qualitative
observation.

| Indicator | How to measure |
|-----------|----------------|
| Files inspected before correct work surface | Count distinct reads until the cold actor opens the file where work belongs. |
| Irrelevant files inspected | Count reads whose content contributed nothing to the answer (dead ends, whole-tree scans, stale docs). |
| Context consumed | Approximate token load of the recorded path (sum of read sizes). If imprecise, record "large/small path" with the file count. |
| Tool calls before correct action | Count calls (reads, greps, `just` runs) before the first correct edit or proof. |
| Instruction conflicts | Report the two conflicting texts verbatim; record the file paths and line numbers. Do not count severity without reading them. |
| Incorrect edit surfaces attempted | Count edits started in a location the ledger marks frozen or a router marks read-only. |
| Replans | Count times the actor abandons a plan mid-task and restarts because routing misled it. |
| Verification-discovery burden | Count reads between arriving at the task and finding the narrow proof command (`just gate-*`). Compare against `just --list`. |

Where a precise number is impractical, record the observation and why a number was not
meaningful — do not invent a unit system. Every indicator is a repair pointer, not a grade.

## 5. Reporting and acting on results

1. Write walk evidence to `.agents/reports/` (or `.agents/evidence/`): full read log, minimal
   path per question, indicator table, flags. Evidence must let another actor re-derive the
   walk, so write down the exact starting state.
2. Classify each finding:
   - **Structural defect** — the topology lacks a canonical home or link. Fix structure:
     move, split, or replace files until the walk works. Do not add explanation.
   - **Routing defect** — the canonical home exists but the router does not point at it. Fix
     the router (edit the link or the `AGENTS.md` category), not the destination.
   - **Documentation deficit** — meaning is present but buried; move content toward the
     canonical home. Add prose only where it changes routing, never to make a failing walk
     look better.
3. Re-run the walk after each fix. Do not declare success on the run that surfaced the
   defect; the fixed topology must be walked cold again.
4. Iterate until every canonical question is answerable at the target cost and the concrete
   change request completes without instructional contradiction.
5. Record settled indicators in `.agents/evidence/`; the handoff report (P10) cites them.

## 6. What NOT to do

- **Do not collapse the indicators into one "agent friendliness" score.** A single score hides
  which routing lane failed and gives no repair pointer.
- **Do not pad routers with explanations to make a failing walk "pass".** Prose in a router is
  acceptable only if it changes routing; explanation that merely repeats content is a defect.
- **Do not claim a walk result that was never run.** Every reported finding must trace to an
  evidence file.
- **Do not fix the walk by teaching the walker.** The topology must serve every cold actor.
- **Do not mutate frozen surfaces during the walk or in any fix.** Freeze boundaries are
  immutable inside an active run; changes travel through a `CandidateRevision`.

## 7. Failure modes

| Mode | Detection | Action |
|------|-----------|--------|
| Routers that hold payload | A router read yields the answer directly (content duplicated where a link belongs). | Move payload to canonical home; replace with a link. |
| Missing link chains | Answer only reachable by whole-tree search, or path breaks at a dead end. | Insert the missing link; re-walk the broken segment. |
| Canonical truth not locatable | Question 2/3/4 differently answered by two cold actors. | Give truth a single named home and route to it. |
| Verification reachable only via whole-tree search | `just --list` does not surface the narrow gate; the actor greps for a proof. | Register task-scoped gates in `just`; see [verification-topology.md](verification-topology.md). |
| Instruction conflicts | Two instructions contradict; actor replans or guesses. | Record both verbatim in the report; reconcile at the canonical home. |
| Frozen surfaces editable without detection | Prohibited edit succeeds silently. | Fix the guard or the change policy; see [agents-workbench.md](agents-workbench.md). |
| Green walk recorded without evidence | Report claims a passing walk with no `.agents/reports/` or `.agents/evidence/` artifact. | Reject the claim; the walk must be re-run with evidence. |

After any fix, re-walk the affected question — and only the affected question if its path is
independent, the full set if the routing changed. Record both runs: the failing read log and
the post-fix log.

## Related

- [topology-principles.md](topology-principles.md) — why one-home-per-fact makes cheap walks possible.
- [agents-workbench.md](agents-workbench.md) — `AGENTS.md` and `.agents/` conventions the walk checks.
- [verification-topology.md](verification-topology.md) — task-scoped gates and proof discovery.
- [greenfield-formation.md](greenfield-formation.md) — when to run the walk at handoff.
- [brownfield-restructuring.md](brownfield-restructuring.md) — when to run the walk after restructure.