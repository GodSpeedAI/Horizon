# Operator context: universal FDE / knowledge-work methodology and UX intent

- Source: an addendum the operator supplied during the review on 2026-11-06. This file condenses it, quoting the binding rules or keeping them close to the original wording.
- Status: binding operator intent for Stages 8–9 and for remediation. Its own instruction is to **refine** the current design: do not restart it, do not discard progress, and do not add architectural layers. When a requirement falls outside approved scope, document the gap and its impact.

## Methodology (activities, not a linear wizard)

- Stages: **Embed → Observe → Map → Artifactize → Prototype → Validate → Deploy → Instrument → Learn → Compound**.
- Field Case progression: Choose Problem → Discover Reality → Allocate Authority → Prove Value → Prove Reliability → Integrate/Govern → Earn Trust → Measure → Productize.
- A **Field Case** is the durable unit of consequential work. Cases may move backward, branch, stay unresolved, or be abandoned. A failure can still produce useful evidence.
- The UX must not make users run the stages or gates by hand.
- Strategic lenses: Playing to Win, Golden Key (Listen → Aim → Move → Claim), and Outcome-Driven Innovation / Jobs to Be Done.
- Governing loop: **observed consequences → evidence → settlement → updated understanding → newly available moves**.
- Three distinctions the UI must make clear to ordinary users:
  - A prediction is not evidence.
  - A completed task is not an achieved outcome.
  - An agent's claim of success is not independent verification.

## Ownership (as stated by the operator; verify each against code)

- **Cognate SDK:** composition, capabilities, agents, events, durable execution, artifacts, projections, continuations.
- **DomainForge:** versioned semantic models.
- **SEA-Forge:** governance, authority, policy, casework, transitions, settlement rules.
- **RealityTrace:** observations, provenance, evidence, declared-vs-observed discrepancies.
- **Context Kernel:** scoped context retrieval and assembly. **The spec does not mention this owner.**
- **Horizon:** operator-facing navigation, interaction, projection, and judgment.
- **Workbench:** specialist sessions, orchestration interfaces, assignments, trajectories. Workbench must stay useful on its own, without Horizon.
- **Never equate** requested, authorized, executed, observed, verified, accepted, and settled. Each is a distinct state with its own owner. The operator makes the final case-outcome judgment within authority the organization grants.

## UX rules

- Organize around work (problems, cases, artifacts, decisions, people), not around backend systems.
- Use progressive disclosure. Show by default what the next decision needs. Show payloads and provenance on request or when they explain an exception.
- Keep the **Explore, Operate, Work** compositions. Support the journeys **Explore, Operate, Build, Monitor, Compare, Develop**. Horizon's Work composition references or opens Workbench.
- The journal is first-class product scope: a date-centered notebook, addressable blocks, links, tags, **backlinks, collections, multiple placements, revision history**. A placement is not a copy, and a revision is not a new identity.
- The composer unifies writing, asking, referencing, navigating, and proposing. Study the GS Term V3 prototype for interaction behavior only, not terminal mechanics.
- **Show real state, not simulated progress.** Indicators must match real process states (waiting, working, blocked, unavailable, completed, unknown). Background updates never take focus, reorder authored content, or dismiss decisions.
- Use the Workbench Cobalt design language. No external product names in navigation or canonical domain terms.
- Routine work proceeds within its authority. Consequential exceptions escalate. Do not ask for approval on every trivial step.

## Trajectories

- Workbench trajectories must show relevant RealityTrace evidence, not only chat and tool logs.
- Contents to connect: intent and assignment; the case → plan item → run → session → agent → delegation chain; tool and model activity; executed operations vs observed effects; artifacts and verification; evidence references and discrepancies; retries; recorded cost; gaps; human decisions; final disposition.
- From Horizon, the operator selects an activity summary and navigates to the matching Workbench trajectory.
- Reuse the existing session-trace and RealityTrace integrations. Prefer composing projections over copying traces into a new store.

## Agent responsibilities

- **Resident advisor, execution coordinator, independent reviewer.** These are *responsibilities, not mandatory new services or processes.*
- A reviewer must not inherit the producing agent's memories or unreviewed conclusions.
- `~/.agents`, hooks, context-efficiency tools, and EGM-style interrogation are patterns to reproduce, not runtime dependencies.
- Measure effectiveness by **cost and effort per independently accepted outcome**, not by tokens saved or autonomous step count.
- Private notes, raw speculation, and unreviewed conclusions must not silently become authoritative organizational knowledge. Verified lessons may be *proposed* for organizational knowledge.

## Engineering rules

- Preserve working code and contracts. Inspect before you add.
- Prefer reuse or extension over a parallel subsystem.
- Model journeys before you add controls.
- Keep action semantics the same across GUI, terminal, and machine interfaces.
- Make unavailable or partial capabilities explicit.
- Preserve durable identities.
- Represent correctly: close/reopen, reconnect, restart, cancellation, partial failure, and replay.
- Avoid new frameworks, databases, orchestration layers, and duplicated authority.
- The UI is complete when end-to-end user outcomes work, not when it looks polished or has many unit tests.

## Seven end-to-end acceptance journeys (validate with real UI and services, not only mocks)

1. **Capture and recovery:** observe, tag, attach, link to a case, close, then find it again by date or topic. Authorship, identity, access, placement, and revisions stay intact.
2. **Investigate and delegate:** ask a question, get an evidence-backed recommendation, request an authorized investigation, then see the assignment and its real progress.
3. **Execute and inspect:** inspect ordered execution, context, artifacts, errors, and RealityTrace evidence, without mistaking reported success for verified success.
4. **Review and settle:** see the criteria, independent verification, open issues, and available decisions. The judgment goes through the governance path and produces an attributable result.
5. **Recover after interruption:** close or reconnect, then rebuild state from durable services. No duplicate assignments and no claimed phantom background work.
6. **Learn and compound:** see what was predicted, what happened, which observations were trusted, what was accepted, and which lesson or capability resulted.
7. **Degraded or denied:** a source is unavailable, a permission is denied, or a trace is incomplete. The UI states the limit clearly, keeps navigation safe, and never fabricates results or bypasses authority.

## Final decision rule

Prefer the approach that best supports: **human intention → contextual understanding → bounded intelligent work → observable consequences → independent evidence → governed judgment → reusable learning.**
