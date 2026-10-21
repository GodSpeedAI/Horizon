/**
 * The GUI workspace model (T09).
 *
 * T03 decided that only context, decision, evidence, source inspection, history and comparison
 * earn persistent regions. This module maps the T07 frame and the T05 closed projection into
 * exactly those regions. It is renderer-neutral and pure: no JSX, no HTML, no event handler and
 * no clock. The React renderer walks this document and cannot recover a second policy from it.
 *
 * Owner pinning is structural, not a CSS hint: the region list is a fixed sequence and agent
 * contributions are collected into one append-only region. An agent that claims `owner_pinned`
 * is still grouped by its actor role, so no input order can move the owner's decision.
 */
import type { NavigationChoice, NavigationFrame, ReversibilityClass } from "../../domain/navigation.ts";
import { nextStep, plainReason } from "../sequential/controller.ts";
import type { GuiView, ProjectedAction, ProjectedNode } from "../surface2/project.ts";
import type { OperationalLinkV1, OperationalObjectV1 } from "../../domain/operational.ts";

export const WORKSPACE_SCHEMA = "horizon.workspace/1" as const;
export const WORKSPACE_REGION_ORDER = ["context", "decision", "evidence", "inspector", "lineage", "agent"] as const;
export type WorkspaceRegionId = (typeof WORKSPACE_REGION_ORDER)[number];
export type WorkspaceScope = "current" | "historical";
export type WorkspaceState = "loading" | "ready" | "empty" | "blocked" | "unknown" | "partial" | "error";
export type WorkspaceTheme = "light" | "dark";

export interface WorkspaceFrameRef {
  readonly frame_id: string;
  readonly revision: number;
}

export interface WorkspaceContextElement {
  readonly id: "observer" | "world" | "checkpoint" | "focus" | "case" | "frame";
  readonly label: string;
  readonly value: string;
}

export interface WorkspaceBlocked {
  readonly operation_ref: string;
  readonly label: string;
  readonly status: "blocked" | "unknown" | "conflicted";
  readonly reason: string;
  readonly next_step: string | null;
  readonly gates: readonly { readonly gate: string; readonly verdict: string; readonly reason: string | null; readonly prerequisite_ref: string | null }[];
}

export interface WorkspaceReview {
  readonly reversibility: ReversibilityClass;
  readonly payment: string;
  readonly expected_evidence: readonly string[];
  readonly escalation: string;
}

export interface WorkspaceChoice {
  readonly operation_ref: string;
  readonly label: string;
  readonly status: NavigationChoice["status"];
  readonly available: boolean;
  readonly primary: boolean;
  readonly reason: string | null;
  readonly next_step: string | null;
  /** The closed-surface action this choice can submit, when one is offered by the view. */
  readonly action_id: string | null;
  readonly review: WorkspaceReview | null;
}

export interface WorkspaceAction {
  readonly action_id: string;
  readonly label: string;
  readonly operation: string;
  readonly posture: ProjectedAction["posture"];
  readonly consequential: boolean;
  readonly affordance: ProjectedAction["affordance"];
  /** Agent proposals are visible but cannot be submitted from this surface. */
  readonly submit: boolean;
}

export interface WorkspaceEvidence {
  readonly node_id: string;
  readonly label: string;
  readonly text: string | null;
  readonly source_kind: string;
  readonly actor: {
    readonly role: string;
    readonly actor_ref: string;
    readonly agent_ref: string | null;
    readonly on_behalf_of: string | null;
  };
  readonly sources: readonly {
    readonly expression: string;
    readonly status: string;
    readonly detail: string;
    readonly agent_supplied: boolean;
  }[];
}

export interface WorkspaceSource {
  readonly expression: string;
  readonly status: string;
  readonly detail: string;
}

export interface WorkspaceGraphNode {
  readonly id: string;
  readonly label: string;
  readonly semantic_ref: string;
}

export interface WorkspaceGraphEdge {
  readonly from: string;
  readonly to: string;
  readonly relation: string;
}

export interface WorkspaceLineage {
  readonly fit: "content";
  readonly limit: number;
  readonly nodes: readonly WorkspaceGraphNode[];
  readonly edges: readonly WorkspaceGraphEdge[];
  readonly total_nodes: number;
  readonly total_edges: number;
  readonly omitted_nodes: number;
  readonly omitted_edges: number;
  readonly aggregated: boolean;
  readonly table: {
    readonly columns: readonly string[];
    readonly rows: readonly (readonly string[])[];
  };
}

export interface WorkspaceRegion {
  readonly id: WorkspaceRegionId;
  readonly title: string;
  readonly owner_pinned: boolean;
  readonly traces_to: string;
}

export interface WorkspaceNotice {
  readonly tone: "scope" | "state" | "reduction";
  readonly text: string;
}

/**
 * Inspector material (T10). These are read-only inspection facts, so they live inside the
 * owner-pinned inspector region and add no region, no order and no second layout policy.
 */

/** One debugger answer, flattened for display. Its provenance travels with every value. */
export interface WorkspaceDebugger {
  readonly operation: string;
  readonly question: string;
  readonly status: "ok" | "refused" | "unavailable";
  readonly code: string | null;
  readonly message: string | null;
  readonly values: readonly {
    readonly key: string;
    readonly value: string;
    readonly class: string;
    readonly source: string;
    readonly missing_source: string | null;
  }[];
  readonly unknown_remainder: readonly string[];
  /** Literal, restated by the renderer: an answer is not authority and settles nothing. */
  readonly authority: false;
  readonly settles: false;
  readonly compared_checkpoint: string | null;
}

/** One cited retrieval result. `class` is always `untrusted_reference`; nothing here is canonical. */
export interface WorkspaceReference {
  readonly uri: string;
  readonly anchor: string | null;
  readonly heading: string | null;
  readonly excerpt: string;
  readonly score: number | null;
  readonly source_id: string | null;
  readonly version: string | null;
  readonly class: "untrusted_reference";
}

export interface WorkspaceRetrieval {
  readonly corpus_id: string | null;
  readonly query: string | null;
  /** The typed observation: `results`, `no-match`, `unavailable`, `denied`, `absent`, … */
  readonly outcome: string;
  readonly detail: string;
  readonly truncated: boolean;
  readonly liveness: { readonly observed: boolean; readonly ok: boolean; readonly detail: string };
  readonly references: readonly WorkspaceReference[];
  /** Literal: retrieved text is scoped reference material, never canonical truth. */
  readonly canonical: false;
}

export interface WorkspaceSnapshot {
  readonly schema: typeof WORKSPACE_SCHEMA;
  readonly scope: WorkspaceScope;
  readonly scope_banner: string;
  readonly state: WorkspaceState;
  readonly state_message: string;
  readonly theme: WorkspaceTheme;
  readonly frame: NavigationFrame;
  readonly current: WorkspaceFrameRef;
  readonly context: readonly WorkspaceContextElement[];
  readonly regions: readonly WorkspaceRegion[];
  readonly choices: readonly WorkspaceChoice[];
  readonly blocked: readonly WorkspaceBlocked[];
  readonly actions: readonly WorkspaceAction[];
  readonly evidence: readonly WorkspaceEvidence[];
  readonly agent_contributions: readonly WorkspaceEvidence[];
  readonly sources: readonly WorkspaceSource[];
  readonly lineage: WorkspaceLineage;
  readonly reduction_notes: readonly string[];
  readonly unresolved: number;
  readonly evidence_ref: string | null;
  readonly notices: readonly WorkspaceNotice[];
  /** The debugger answer about this exact focus, or `null` when the surface was not asked. */
  readonly debugger: WorkspaceDebugger | null;
  /** Reference material cited beside this focus, or `null` when the surface was not asked. */
  readonly retrieval: WorkspaceRetrieval | null;
}

export interface WorkspaceInput {
  readonly frame: NavigationFrame;
  readonly view: GuiView;
  readonly objects: readonly OperationalObjectV1[];
  readonly links: readonly OperationalLinkV1[];
  readonly current: WorkspaceFrameRef;
  readonly evidenceRef?: string | null;
  readonly theme?: WorkspaceTheme;
  readonly error?: { readonly code: string; readonly message: string } | null;
  readonly graphLimit?: number;
  /** Already-answered inspection material; the model never asks a question itself. */
  readonly debugger?: WorkspaceDebugger | null;
  readonly retrieval?: WorkspaceRetrieval | null;
}

const REGION_TITLES: Readonly<Record<WorkspaceRegionId, string>> = {
  context: "Where you are",
  decision: "The next decision",
  evidence: "Evidence",
  inspector: "Sources and refs",
  lineage: "Lineage",
  agent: "Agent contributions",
};

const REGION_TRACES: Readonly<Record<WorkspaceRegionId, string>> = {
  context: "ui-model/views/navigation_entry.yaml#context",
  decision: "ui-model/views/navigation_entry.yaml#moves",
  evidence: "ui-model/views/evidence_inspector.yaml#evidence",
  inspector: "ui-model/views/evidence_inspector.yaml#settlement",
  lineage: "ui-model/views/history_timeline.yaml#timeline",
  agent: "ui-model/atomic-ui-contract.yaml#agent_proposed",
};

function fixedRegions(): readonly WorkspaceRegion[] {
  return Object.freeze(
    WORKSPACE_REGION_ORDER.map((id) =>
      Object.freeze({ id, title: REGION_TITLES[id], owner_pinned: id !== "agent", traces_to: REGION_TRACES[id] }),
    ),
  );
}

function isAgentNode(node: ProjectedNode): boolean {
  if (node.layout === "agent_composed" || node.layout === "agent_proposed") return true;
  // An agent cannot hold an owner placement. If a hand-built view bypasses the T05 reducer and
  // claims one, the block goes to the append-only agent region rather than the owner's evidence.
  return node.attributed_to.role === "agent" && (node.layout === "owner_pinned" || node.layout === "owner_laid_out");
}

function choiceReview(choice: NavigationChoice): WorkspaceReview | null {
  if (choice.reversibility === "read_only") return null;
  const payment =
    choice.payment === null ? "No payment is estimated." : `${choice.payment.estimate} (${choice.payment.provenance})`;
  const escalation =
    choice.escalation === null
      ? "No escalation behaviour is declared."
      : choice.escalation.behavior === "none"
        ? "No escalation is expected."
        : choice.escalation.behavior === "approval"
          ? `Authority may escalate to approval at ${choice.escalation.approval_ref ?? "an approval record"}.`
          : "The escalation path is unknown; treat it as a stop.";
  return Object.freeze({
    reversibility: choice.reversibility,
    payment,
    expected_evidence: Object.freeze([...choice.expected_evidence]),
    escalation,
  });
}

function choiceOf(choice: NavigationChoice, actions: readonly ProjectedAction[]): WorkspaceChoice {
  const reason = choice.selectable ? null : (plainReason(choice) ?? choice.status);
  const step = choice.selectable ? null : (nextStep(choice) ?? null);
  const action = choice.selectable
    ? actions.find((candidate) => candidate.operation === choice.operation_ref && candidate.posture === "offered" && candidate.affordance === "available")
    : undefined;
  return Object.freeze({
    operation_ref: choice.operation_ref,
    label: choice.label,
    status: choice.status,
    available: choice.selectable,
    primary: choice.is_primary,
    reason,
    next_step: step,
    action_id: action?.action_id ?? null,
    review: choiceReview(choice),
  });
}

function blockedOf(choice: NavigationChoice): WorkspaceBlocked {
  return Object.freeze({
    operation_ref: choice.operation_ref,
    label: choice.label,
    status: choice.status as WorkspaceBlocked["status"],
    reason: plainReason(choice) ?? choice.status,
    next_step: nextStep(choice) ?? null,
    gates: Object.freeze(
      Object.entries(choice.gates).map(([gate, assessment]) =>
        Object.freeze({
          gate,
          verdict: assessment.verdict,
          reason: assessment.reason ?? null,
          prerequisite_ref: assessment.prerequisite_ref ?? null,
        }),
      ),
    ),
  });
}

function actionOf(action: ProjectedAction): WorkspaceAction {
  const submit = action.posture === "offered" && action.affordance === "available";
  return Object.freeze({
    action_id: action.action_id,
    label: action.label,
    operation: action.operation,
    posture: action.posture,
    consequential: action.consequential,
    affordance: action.affordance,
    submit,
  });
}

function evidenceOf(node: ProjectedNode): WorkspaceEvidence {
  return Object.freeze({
    node_id: node.node_id,
    label: node.label,
    text: node.text ?? null,
    source_kind: node.source_kind,
    actor: Object.freeze({
      role: node.attributed_to.role,
      actor_ref: node.attributed_to.actor_ref,
      agent_ref: node.attributed_to.agent_ref ?? null,
      on_behalf_of: node.attributed_to.on_behalf_of_ref ?? null,
    }),
    sources: Object.freeze(
      node.bindings.map((binding) =>
        Object.freeze({
          expression: binding.expression,
          status: binding.status,
          detail: binding.status === "bound" ? (binding.observation ?? "unknown") : (binding.reason ?? binding.awaiting ?? "unknown"),
          agent_supplied: binding.agent_supplied === true,
        }),
      ),
    ),
  });
}

function sourceOf(node: ProjectedNode): readonly WorkspaceSource[] {
  return node.bindings.map((binding) =>
    Object.freeze({
      expression: binding.expression,
      status: binding.status,
      detail: binding.status === "bound" ? (binding.observation ?? "unknown") : (binding.reason ?? binding.awaiting ?? "unknown"),
    }),
  );
}

/**
 * Bound the graph by object ref order, never by link insertion order, so an agent cannot choose
 * which nodes survive by reordering its update. The table is built from every row before the
 * bound is applied, so aggregation never loses the equivalent list.
 */
export function buildLineage(
  objects: readonly OperationalObjectV1[],
  links: readonly OperationalLinkV1[],
  limit = 24,
): WorkspaceLineage {
  const sortedObjects = [...objects].sort((left, right) => (left.object_ref < right.object_ref ? -1 : left.object_ref > right.object_ref ? 1 : 0));
  const sortedLinks = [...links].sort((left, right) => {
    const leftKey = `${left.from}/${left.relation_type}/${left.to}`;
    const rightKey = `${right.from}/${right.relation_type}/${right.to}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  const bound = Math.max(1, limit);
  const nodes = sortedObjects.slice(0, bound).map((object) =>
    Object.freeze({ id: object.object_ref, label: object.label, semantic_ref: object.semantic_ref }),
  );
  const kept = new Set(nodes.map((node) => node.id));
  const edges = sortedLinks
    .filter((link) => kept.has(link.from) && kept.has(link.to))
    .map((link) => Object.freeze({ from: link.from, to: link.to, relation: link.relation_type }));
  const tableRows: (readonly string[])[] = [
    ...sortedObjects.map((object) => [object.object_ref, object.semantic_ref, "object", object.label] as const),
    ...sortedLinks.map((link) => [link.from, link.to, link.relation_type, `checkpoint ${link.provenance.checkpoint_ref}`] as const),
  ];
  return Object.freeze({
    fit: "content",
    limit: bound,
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    total_nodes: sortedObjects.length,
    total_edges: sortedLinks.length,
    omitted_nodes: Math.max(0, sortedObjects.length - nodes.length),
    omitted_edges: Math.max(0, sortedLinks.length - edges.length),
    aggregated: sortedObjects.length > bound,
    table: Object.freeze({
      columns: Object.freeze(["from", "to", "kind", "label"]),
      rows: Object.freeze(tableRows),
    }),
  });
}

export function workspaceState(input: {
  readonly error?: { readonly code: string } | null;
  readonly unresolved: number;
  readonly checkpointKnown: boolean;
  readonly objects: number;
  readonly choices: number;
  readonly decision: NavigationFrame["decision"];
}): { readonly state: WorkspaceState; readonly message: string } {
  if (input.error !== undefined && input.error !== null) {
    return { state: "error", message: `The workspace could not be read (${input.error.code}). No decision is being shown.` };
  }
  if (input.objects === 0 && input.choices === 0) {
    return { state: "empty", message: "Nothing has been recorded at this checkpoint. There is no move to present yet." };
  }
  if (!input.checkpointKnown) {
    return { state: "unknown", message: "The checkpoint is unknown. This view is not evidence of the current world." };
  }
  if (input.decision === "no_affordance") {
    return { state: "blocked", message: "No move is available from this focus yet. The blocked reasons are shown below." };
  }
  if (input.unresolved > 0) {
    return { state: "partial", message: "Some evidence could not be resolved. Unresolved sources are shown as unknown, never invented." };
  }
  return { state: "ready", message: "The workspace is ready." };
}

export function scopeOf(frame: NavigationFrame, current: WorkspaceFrameRef): WorkspaceScope {
  return frame.frame_id === current.frame_id && frame.revision === current.revision ? "current" : "historical";
}

function bannerFor(scope: WorkspaceScope, frame: NavigationFrame, current: WorkspaceFrameRef): string {
  if (scope === "current") return `Current frame ${frame.frame_id} at revision ${frame.revision}.`;
  return `Historical frame ${frame.frame_id} revision ${frame.revision}. The current frame is ${current.frame_id} revision ${current.revision}; this view is not current world state.`;
}

/**
 * Project one frame and one closed surface into the workspace. There is no path from
 * `view.nodes` to the owner region order: those nodes can only fill evidence or the agent region.
 */
export function buildWorkspace(input: WorkspaceInput): WorkspaceSnapshot {
  const scope = scopeOf(input.frame, input.current);
  const evidenceNodes = input.view.nodes.filter((node) => !isAgentNode(node));
  const agentNodes = input.view.nodes.filter(isAgentNode);
  const sources = evidenceNodes.flatMap(sourceOf);
  const unresolved = input.view.unresolved;
  const state = workspaceState({
    ...(input.error === undefined ? {} : { error: input.error }),
    unresolved,
    checkpointKnown: input.frame.checkpoint_ref !== null,
    objects: input.objects.length,
    choices: input.frame.choices.length,
    decision: input.frame.decision,
  });
  const notices: WorkspaceNotice[] = [
    { tone: "scope", text: bannerFor(scope, input.frame, input.current) },
    { tone: "state", text: state.message },
  ];
  if (input.view.notes.length > 0) {
    notices.push({
      tone: "reduction",
      text: `${input.view.notes.length} agent layout/provenance claim(s) were reduced; owner order is unchanged.`,
    });
  }
  const context: WorkspaceContextElement[] = [
    { id: "observer", label: "Observer", value: input.frame.observer_ref },
    { id: "world", label: "World", value: input.frame.world_ref },
    { id: "checkpoint", label: "Checkpoint", value: input.frame.checkpoint_ref ?? "unknown" },
    { id: "focus", label: "Focus", value: input.frame.focus_ref },
    { id: "case", label: "Case", value: input.frame.case_ref ?? "not derived" },
    { id: "frame", label: "Frame", value: `${input.frame.frame_id} revision ${input.frame.revision}` },
  ];
  return Object.freeze({
    schema: WORKSPACE_SCHEMA,
    scope,
    scope_banner: bannerFor(scope, input.frame, input.current),
    state: state.state,
    state_message: state.message,
    theme: input.theme ?? "dark",
    frame: input.frame,
    current: input.current,
    context: Object.freeze(context),
    regions: fixedRegions(),
    choices: Object.freeze(input.frame.choices.map((choice) => choiceOf(choice, input.view.actions))),
    blocked: Object.freeze(input.frame.choices.filter((choice) => !choice.selectable).map(blockedOf)),
    actions: Object.freeze(input.view.actions.map(actionOf)),
    evidence: Object.freeze(evidenceNodes.map(evidenceOf)),
    agent_contributions: Object.freeze(agentNodes.map(evidenceOf)),
    sources: Object.freeze(sources),
    lineage: buildLineage(input.objects, input.links, input.graphLimit ?? 24),
    reduction_notes: Object.freeze(input.view.notes.map((note) => `${note.kind}: ${note.detail}`)),
    unresolved,
    evidence_ref: input.evidenceRef ?? null,
    notices: Object.freeze(notices),
    debugger: input.debugger ?? null,
    retrieval: input.retrieval ?? null,
  });
}

/** A loading document still carries frame identity and the fixed owner regions. */
export function loadingWorkspace(
  frame: NavigationFrame,
  current: WorkspaceFrameRef,
  theme: WorkspaceTheme = "dark",
): WorkspaceSnapshot {
  return Object.freeze({
    schema: WORKSPACE_SCHEMA,
    scope: scopeOf(frame, current),
    scope_banner: bannerFor(scopeOf(frame, current), frame, current),
    state: "loading",
    state_message: "Reading the workspace. No decision is available until the read completes.",
    theme,
    frame,
    current,
    context: Object.freeze([
      { id: "observer", label: "Observer", value: frame.observer_ref } satisfies WorkspaceContextElement,
      { id: "world", label: "World", value: frame.world_ref } satisfies WorkspaceContextElement,
      { id: "checkpoint", label: "Checkpoint", value: frame.checkpoint_ref ?? "unknown" } satisfies WorkspaceContextElement,
      { id: "focus", label: "Focus", value: frame.focus_ref } satisfies WorkspaceContextElement,
      { id: "case", label: "Case", value: frame.case_ref ?? "not derived" } satisfies WorkspaceContextElement,
      { id: "frame", label: "Frame", value: `${frame.frame_id} revision ${frame.revision}` } satisfies WorkspaceContextElement,
    ]),
    regions: fixedRegions(),
    choices: Object.freeze([]),
    blocked: Object.freeze([]),
    actions: Object.freeze([]),
    evidence: Object.freeze([]),
    agent_contributions: Object.freeze([]),
    sources: Object.freeze([]),
    lineage: buildLineage([], []),
    reduction_notes: Object.freeze([]),
    unresolved: 0,
    evidence_ref: null,
    notices: Object.freeze([{ tone: "state" as const, text: "Reading the workspace." }]),
    debugger: null,
    retrieval: null,
  });
}
