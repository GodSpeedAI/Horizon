# Stage 6 — Comprehension Report

- Target: `.agents/specs/Horizon_Operator_Workspace_Design_v1.md`. FeatureRange L1–298, DetailedRange L299–411.
- Reviewer: egm-comprehension (Haiku). The reviewer read only the persona and the target. No standard was applied.

## What this proposes

Horizon is a daily working notebook and "cognitive cockpit" for a forward-deployed engineer (FDE). The operator captures timestamped, addressable note blocks, tags them, places them in several contexts, and finds them again by date, tag, case, or actor. A resident advisor answers questions. A composer handles five actions: capture, ask, navigate, propose, and delegate. Horizon owns none of the cases, evidence, policy, or execution. It shows what three other systems own: SEA-Forge (policy, cases, final authority), Cognate Workbench (durable specialist runs), and RealityTrace (observed evidence). It sends authorized, bounded work to Cognate. The human makes the final decision on each case outcome. §12–14 add a required reconnaissance of existing repos and local agent state before design, ten review questions, and seven build slices (A–G), starting with a check that existing code can be reused.

## How the existing system works, per this document

- **SEA-Forge** holds the organization's domain, policy, cases, plan items, and allowed transitions.
- **Cognate Workbench** runs durable assignments. It already has a session-trace projection of turns, model calls, and tool calls.
- **RealityTrace** records observations through an outbox. Horizon reads it but never presents it as settled fact.
- **Horizon** is said to already have renderer-neutral typed intentions, world/checkpoint/focus references, seven affordance gates, and a closed renderer grammar. The document never explains any of these, and it does not say which parts are built.
- **Open questions:** whether a Workbench background service is installed, and whether any notes capability exists.

The reader could paraphrase how the owner systems relate but not Horizon's own mechanisms, so this paraphrase is partial.

## Findings

| # | Sev | Lines | Problem | Fix |
|---|-----|-------|---------|-----|
| 1 | 🔴 | L49, L105, L305, L405; "world" L14, L87, L91 | The rule that no new UI may bypass existing controls depends on terms that are never defined or linked: "seven affordance gates", world/checkpoint/focus references, typed intentions, operator-pinned focus, case-authority boundaries, closed renderer grammar, and `horizon.surface/2`. A reader cannot name the gates or check the rule. | Add an "Existing Horizon mechanisms" block. List the 7 gates by name with one sentence each, define world and checkpoint, and link `src/ui/surface2/` and `src/ui/workspace/model.ts`. Mark any unverified item. |
| 2 | 🟡 | L8, L16, L44, L213, L215, L250, L269 | The text never says what is built today. "Existing", "present Workbench source", and "verified service-lifetime contract" sit beside "if service availability is not yet installed". | Add a status table near the top (exists / partial / absent / unverified), with one evidence pointer per row. |
| 3 | 🟡 | L5–7, L16, L33, L39, L42–43, L332 | Core systems are never introduced: Cognate (SDK and Workbench), SEA-Forge, DomainForge, RealityTrace, GS Term, and EGM. "EGM" is never expanded, and "selected review model" (L5) is vague. | Add a systems glossary with one line and a repo link (from L395–401) for each. Expand EGM at first use. |
| 4 | 🟡 | L61–65, L74, L166, L304–322 | Tools and local artifacts appear without definition: replicator, leanrea, building-with-cognate, interaction-domain-model, te-integration, tokeneconomizer, te-rt, `~/.agents`, agents-setup. The text never maps the three patterns in L65 to their sources. | Add a table: name, what it is, role (research method or adopted pattern), and "not a runtime dependency". |
| 5 | 🟡 | L40, L186, L195, L197, L225, L236, L278, L284, L308 | Mechanism terms are undefined: plan sentries, continuations, outboxes, plan predicates, source authorization, mandate, governed receipt, governed command path, observed-vs-declared graph, "passive" delivery. J8 and §7 depend on them. | Add a "terms used in §7–8" box with one sentence per term. |
| 6 | 🟡 | L44, L250, L340 | The owner of operator-authored notes is given as "a small Horizon-specific capability", which names no owner, and L250 says "if found". This is the one thing J1 requires to be built. | Change it to "Owner: undecided. Candidates: X, Y. Decided in Slice A (L336)", or name the expected Cognate facility. |
| 7 | 🟡 | L7, L72, L79, L89, L336, L407 | The reference for the composer is circular: L407 points to this same file. The V3 prototype has no path or status. L407 also has an absolute personal path, which L324 prohibits. | Replace L407 with the real mockup path or "none yet". State where V3 stands, using a repo-relative path. |
| 8 | 🟡 | L87, L131, L263 | "Collection" is used three ways: tagged collection, project collection/saved view, and knowledge collection. J3 depends on it. | Give one definition, e.g. "a saved view over tags or placements". |
| 9 | 🟡 | L65, L74, L160, L169, L172, L348, L373 | Wording for "learned" drifts: memories, lessons, environmental facts, learned facts, context-learning, session learning. The isolation rules (L160, J7, Q6) depend on which one is meant. | Define one term, "learned item", and use it throughout. |
| 10 | 🟢 | L89 | "The current interpretation" is undefined. | "the selected mode from L99–103" |
| 11 | 🟢 | L16, L268, L356 | It is unclear whose window "its window is closed" means. | "Workbench desktop window" |
| 12 | 🟢 | L113 | "Recorded timezone convention" and "the domain model" are undefined. | One clause or a pointer. |
| 13 | 🟢 | L140, L142 | It is not said who approves a "policy-approved" tag or what "private" means for a tag. | Name the approver and define private. |
| 14 | 🟢 | L91, L244, L246 | The provenance values and "degraded" are undefined. | One line each. |
| 15 | 🟢 | L49, L91 vs L179 | "Checkpoint" has two meanings. | Rename one of them. |
| 16 | 🟢 | L132 vs L215 | "Revision" also appears as "target revision", which means a commit. | Use "target commit". |
| 17 | 🟢 | L328 | "Rich Trajectory screen" reads like an existing artifact. | "the target trajectory view (§8)" |
| 18 | 🟢 | L62, L67, L340 | "Donor" and "graph elaboration" are undefined. | Define donor as a studied reference, not copied code. |
| 19 | 🟢 | L336–350 | "Slice" and "tranche" are mixed. | Use "slice" throughout. |
| 20 | 🟢 | L398–399 | Local directory names (sea-rs, sxr) do not match the product names. | Add a local-directory column. |
| 21 | 🟢 | L301 vs L366 | The audience switches from the implementer to the reviewer without saying so. | Add one line saying who acts in §12–14. |

**Clear to a naive reader:** the distinctions at L47, the placement/revision/copy/link definitions (L131–134), journeys J1–J10, and the §14 questions.

## Overlap with Stage 5

Finding 7 matches Zoom Out #11 (the L407 self-reference). Finding 12 touches Zoom Out #9 (L113).

**Verdict:** The document is not yet self-contained. The minimum fixes for a reader without background are Blocker 1 and Majors 2–7.
