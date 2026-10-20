/**
 * The single projection every route renders (`horizon.gui-view/1`).
 *
 * GUI, CLI text and the MCP op union all read *this* document and nothing else, so the
 * three transports cannot disagree about what the observer is being shown. The projection
 * is a pure function of (reduced surface, bindings): no clock, no random, no I/O.
 *
 * Two rules shape it:
 *
 *   1. It is *neutral*. A block becomes a generic `ProjectedNode` whose fields are
 *      coordinates and text, not markup. No HTML, no JSX, no style string, no event
 *      handler name — a renderer cannot recover executable content from this document,
 *      because none is representable in it (REQ-UI-001, REQ-UI-004).
 *   2. It is *complete about provenance*. Every node carries the block's source kind,
 *      attribution and layout placement, plus the binding status of each source it used.
 *      A consumer that drops the markers has dropped data the observer needs, rather than
 *      discovered a field it can silently omit (REQ-UI-007).
 */
import type { SourceBinding } from "./binder";
import type { AffordanceStatusOf, ReducedSurface, ReductionNote } from "./reducer";
import { isConsequential, type ActorAttribution, type LayoutPlacement, type SurfaceBlock, type SurfaceRole } from "./grammar";

export const GUI_VIEW_SCHEMA = "horizon.gui-view/1" as const;

/** The observable shape of a rendered block, with no renderer-specific vocabulary. */
export interface ProjectedNode {
  readonly node_id: string;
  readonly path: readonly string[];
  readonly label: string;
  readonly text?: string;
  readonly tone?: string;
  readonly source_kind: string;
  readonly layout: LayoutPlacement;
  /**
   * Who produced this value. `principal_ref` is the human the work is for; when an agent
   * produced it, `agent_ref` and `on_behalf_of_ref` are carried too, so the view can render
   * an agent as visibly distinct rather than only as `role: "agent"` (REQ-UX-006).
   */
  readonly attributed_to: {
    readonly actor_ref: string;
    readonly role: SurfaceRole;
    readonly principal_ref?: string;
    readonly agent_ref?: string;
    readonly on_behalf_of_ref?: string;
  };
  /** One entry per source this node's values came from. */
  readonly bindings: readonly SourceBinding[];
}

export interface ProjectedAction {
  readonly action_id: string;
  readonly label: string;
  readonly operation: string;
  readonly consequential: boolean;
  /** `offered` for the presenting role; `proposed` when a human still must choose it. */
  readonly posture: "offered" | "proposed";
  /** What the frame assessed. The surface may narrow this and never widen it. */
  readonly affordance: "available" | "blocked" | "unknown" | "conflicted";
}

export interface GuiView {
  readonly schema: typeof GUI_VIEW_SCHEMA;
  readonly role: SurfaceRole;
  readonly surface_id: string;
  readonly title: string;
  readonly responsibility: string;
  readonly intent: string;
  readonly world_ref?: string;
  readonly focus_ref: string;
  readonly nodes: readonly ProjectedNode[];
  readonly actions: readonly ProjectedAction[];
  readonly notes: readonly ReductionNote[];
  /** Number of bindings that did not resolve to an `available` observation. */
  readonly unresolved: number;
}

function scalar(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return undefined;
}

/** The text a node shows. Values come from bindings; this never invents one. */
function labelOf(block: SurfaceBlock): string {
  switch (block.type) {
    case "metric":
      return block.label;
    case "callout":
      return block.tone;
    case "table":
      return `${block.columns.length}-column table`;
    case "tree":
      return `${block.nodes.length}-node tree`;
    case "timeline":
      return `${block.entries.length}-entry timeline`;
    case "graph":
      return `${block.nodes.length}-node graph`;
    case "chart":
      return `${block.kind} chart`;
    case "compare":
      return `${block.left.label} / ${block.right.label}`;
    case "media":
      return block.items.map((item) => item.label).join(", ");
    case "document":
      return block.title;
    case "entity":
      return block.label;
    case "preflight":
      return block.operation;
    case "progress":
      return block.label;
    case "ask":
      return block.question;
    case "form":
      return `${block.fields.length}-field form`;
  }
}

/**
 * Every source a block names. Declaration order is preserved and duplicates collapse,
 * so a block that names the same source twice binds it once and both consumers see it.
 */
export function sourcesOf(block: SurfaceBlock): readonly string[] {
  const found: string[] = [];
  const add = (expression: string | undefined): void => {
    if (expression !== undefined && !found.includes(expression)) found.push(expression);
  };
  add(block.provenance.source_ref);
  // A metric's value is inline and typed by the schema, so it names no further source.
  switch (block.type) {
    case "table":
    case "tree":
    case "timeline":
    case "graph":
    case "chart":
    case "document":
    case "progress":
      add(block.source);
      break;
    case "media":
      for (const item of block.items) add(item.src);
      break;
    case "form":
      for (const field of block.fields) add(field.source);
      break;
    default:
      break;
  }
  return found;
}

function bindingsFor(block: SurfaceBlock, bind: (expression: string) => SourceBinding): readonly SourceBinding[] {
  return sourcesOf(block).map((expression) => bind(expression));
}

/**
 * Project a reduced surface. `bind` and `affordanceOf` are injected so a route can supply
 * its own permitted source context (a remote route refuses `file:` reads) and its own frame
 * assessment, while every route produces the same document for the same inputs.
 */
/**
 * Flatten an attribution for the view without inventing fields.
 *
 * A human or system attribution carries no delegating agent, so those keys are absent rather
 * than `undefined`; an agent attribution keeps the references that make it visibly distinct.
 */
function actorOf(attribution: ActorAttribution): ProjectedNode["attributed_to"] {
  return {
    actor_ref: attribution.actor_ref,
    role: attribution.role,
    principal_ref: attribution.principal_ref,
    ...(attribution.agent_ref === undefined ? {} : { agent_ref: attribution.agent_ref }),
    ...(attribution.on_behalf_of_ref === undefined ? {} : { on_behalf_of_ref: attribution.on_behalf_of_ref }),
  };
}


export function projectSurface(
  reduced: ReducedSurface,
  bind: (expression: string) => SourceBinding,
  affordanceOf: AffordanceStatusOf = () => "unknown",
): GuiView {
  const nodes: ProjectedNode[] = [];
  let unresolved = 0;

  for (const [index, block] of reduced.blocks.entries()) {
    const bindings = bindingsFor(block, bind);
    for (const binding of bindings) {
      if (binding.status !== "bound" || binding.observation !== "available") unresolved += 1;
    }
    const inline =
      block.type === "metric"
        ? block.value
        : block.type === "preflight"
          ? block.availability
          : block.type === "progress"
            ? bindings[0]?.observation
            : undefined;
    const text = scalar(inline);
    nodes.push({
      node_id: block.id,
      path: ["blocks", String(index)],
      label: labelOf(block),
      ...(text === undefined ? {} : { text }),
      ...(block.type === "callout" ? { tone: block.tone } : {}),
      source_kind: block.provenance.source_kind,
      layout: block.provenance.layout,
      attributed_to: actorOf(block.provenance.attributed_to),
      bindings,
    });
  }

  const offeredIds = new Set(reduced.actions.map((action) => action.id));
  const actions: ProjectedAction[] = [
    ...reduced.actions.map((action) => ({
      action_id: action.id,
      label: action.label,
      operation: action.operation,
      consequential: isConsequential(action.operation),
      posture: "offered" as const,
      affordance: affordanceOf(action.operation),
    })),
    ...reduced.proposed.map((action) => ({
      action_id: action.id,
      label: action.label,
      operation: action.operation,
      consequential: isConsequential(action.operation),
      posture: "proposed" as const,
      affordance: affordanceOf(action.operation),
    })),
  ].filter((action) => offeredIds.has(action.action_id) || action.posture === "proposed");

  return {
    schema: GUI_VIEW_SCHEMA,
    role: reduced.role,
    surface_id: reduced.surface_id,
    title: reduced.title,
    responsibility: reduced.responsibility,
    intent: reduced.intent,
    ...(reduced.world_ref === undefined ? {} : { world_ref: reduced.world_ref }),
    focus_ref: reduced.focus_ref,
    nodes,
    actions,
    notes: reduced.notes,
    unresolved,
  };
}
