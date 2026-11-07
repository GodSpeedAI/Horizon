# Operator context: plugins as capabilities (Cognate Workbench), and what it means for Horizon

- Source: an addendum the operator supplied during the review on 2026-11-06, together with a clarification that supersedes part of it.
- The supplied text ends partway through §5, after the line "Preferred lifecycle: Discover → … → Publish". Nothing after that point was received.
- Scope: this is mainly a **Cognate Workbench implementation** direction. Only the parts that touch Horizon are summarized here, for the Horizon spec review.

## Rules that apply to Horizon

1. **One concept.** A plugin is what the user sees and installs. The chain is: plugin → semantic capability → composed resources and executable bindings. Workbench's Plugins interface is the main place to manage capabilities. Horizon must not add a second catalog, whether it calls it "Plugins" or "Capabilities".
2. **The Capability Architect** is a conversational role, built on existing Cognate agent, team, artifact, context, and continuation facilities. It must be reachable "from the relevant Workbench **and Horizon** experiences" without first navigating into plugin administration. For Horizon this means the composer (Ask/Propose) can start a capability conversation, but Workbench owns the capability lifecycle.
3. **No permission union.** A composite plugin does not automatically get the combined permissions of its components. Each invocation is governed by the operations actually authorized. This is the same rule as the spec's affordance and authority gates.
4. **Evaluators are capability components.** Capabilities can include evaluators and verification criteria. This bears on the evals ownership row (Stage 8 §3): eval graders and rubrics can be packaged as capability components owned in Cognate and Workbench, which fits "Cognate owns eval sets and graders".
5. **Improve a capability from past runs** ("using what we learned from the last three runs"): run labels and first-failure notes (the v1 eval cut) feed this. Horizon authors the labels. The Architect consumes them through governed reads.
6. **Attribution.** An outcome keeps attribution to the skills, tools, and evaluators that contributed to it. This matches the §8 trajectory provenance.
7. **Hot reload** is transactional: discover → parse → validate → resolve dependencies → check compatibility and authority → prepare → activate → publish. Horizon views that display capability availability must show the real lifecycle state, never an optimistic one (methodology addendum, "real state").

## Workbench foundations named by the operator (stated as existing; not verified in this review)

`src/workbench/skillOs.ts`, `src/ui/workbench/CapabilityList.tsx`, `src/plugins.ts`, `src/components/pluginRegistry.ts`, `src/capabilities/pluginInstall.ts`, `src/projections/plugins.ts`, `src/agents/agentCoding.ts`, `domain/index.ts`, `src/server.ts`.

## Gaps this creates in the Horizon spec

- **G-7 🟡:** The spec does not mention capabilities or plugins as user-facing objects. It should say how Horizon shows capability availability and opens the Capability Architect, and that Workbench owns capability management.
- **G-8 🟢:** The §2 ownership table needs a row for capability and plugin lifecycle, with Workbench and Cognate as the owner.
