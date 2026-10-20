/**
 * The frame → transport seam.
 *
 * Everything a route is allowed to show or accept passes through this module. It owns no
 * grammar of its own: a frame's choices are *composed* into a `horizon.surface/2` document,
 * parsed by the one grammar (`./surface2/grammar.ts`), reduced for the presenting role
 * (`./surface2/reducer.ts`) and projected into the one view
 * (`./surface2/project.ts`). A GUI, a terminal and an MCP client therefore differ only in
 * how they spell a request, never in what exists.
 *
 * Two boundaries are load-bearing here:
 *
 *   - **The frame owns affordability.** Every choice in the view reports the status the
 *     navigation frame assessed. Composition cannot widen it; the projection may only
 *     narrow (REQ-NAV-001, INV-01). Possibility is not an affordance.
 *   - **The transport owns what it may read.** `file:` sources are readable to an
 *     in-process CLI and refused for a request that arrived over the wire
 *     (`allowFileReads: false`). A remote caller cannot use a surface as a filesystem read.
 */
import { buildStructuralFrame, type NavigationFrameV1, type StructuralChoice } from "../domain/frame.ts";
import { bindSource, type BindingContext, type SourceBinding } from "./surface2/binder.ts";
import { canonicalIntent, intentsEquivalent, type EquivalenceResult, type SurfaceIntentSubmission } from "./surface2/equivalent.ts";
import { HORIZON_OPERATIONS, OBSERVER_ACTOR_REF, parseSurface, SURFACE_SCHEMA, type SurfaceAction, type SurfaceBlock, type SurfaceRole, type SurfaceV2 } from "./surface2/grammar.ts";
import { projectSurface, type GuiView } from "./surface2/project.ts";
import { reduceSurface, type AffordanceStatusOf, type ReducedSurface } from "./surface2/reducer.ts";

export type TransportRole = SurfaceRole;

/**
 * The block kinds the seam composes itself. They are a *selection* from the closed grammar —
 * `grammar.ts` remains the only place that decides what a block kind is — and they live in
 * one table so the seam never spells a kind inline where it could drift from the parse.
 */
const ORIENTATION_BLOCK = "callout" as const;
const TREND_BLOCK = "chart" as const;

/** The result of asking a transport to show a role-bound surface. */
export type SurfaceProjection =
  | { readonly ok: true; readonly view: GuiView; readonly surface: SurfaceV2; readonly reduced: ReducedSurface }
  | { readonly ok: false; readonly code: "INVALID_SURFACE"; readonly issues: readonly { readonly path: string; readonly message: string }[] };

const BLOCK_ID = /^[a-z][a-z0-9_-]{0,63}$/;

/** A frame's choices are only reproducible when their ids and operations are printable as blocks. */
function isAddressable(choice: StructuralChoice): boolean {
  const id = choice.operation_ref.replaceAll(".", "-");
  return BLOCK_ID.test(id) && (HORIZON_OPERATIONS as readonly string[]).includes(choice.operation_ref);
}

/**
 * Compose a frame into a surface document. The human observer's own choices are
 * `owner_authored` and pinned to the frame's order; nothing here can be reordered later.
 *
 * A choice that is not a `HorizonOperation`, or whose id cannot be addressed, is *omitted*
 * rather than renamed: an operation Horizon does not publish is not made addressable by
 * appearing in a frame.
 */
/**
 * The observer a surface may attribute work to, or `undefined` when the frame's observer is
 * not an authenticated human. An unattributable observer cannot be presented at all: a
 * near-miss ref would put a fabricated principal in front of the person looking.
 */
function composeObserver(frame: NavigationFrameV1): string | undefined {
  return OBSERVER_ACTOR_REF.test(frame.observer_ref) ? frame.observer_ref : undefined;
}

/** What `composeSurface` returns when the frame cannot be presented. Always fails the grammar. */
export interface ComposedWithoutObserver {
  readonly composed: false;
  readonly reason: string;
}

export function composeSurface(frame: NavigationFrameV1, options: { readonly intent?: SurfaceV2["intent"] } = {}): unknown {
  const observer = composeObserver(frame);
  if (observer === undefined) return { composed: false, reason: "observer is not an authenticated actor: or os: ref" } satisfies ComposedWithoutObserver;
  const blocks: SurfaceBlock[] = [
    {
      id: "orientation",
      type: ORIENTATION_BLOCK,
      tone: "info",
      text: `${frame.responsibility} — ${observer} at ${frame.checkpoint_ref}`,
      provenance: {
        // Horizon composed this block from the frame, so it is `derived`, not `bound`: the
        // frame is Horizon's own reading, and calling it bound would claim an authority
        // observed the sentence. The source is the frame's *responsibility*, not its
        // per-request `frame_id`: a source expression must be a stable fact about the world,
        // and keying it on a fresh id would make every view differ for identical inputs.
        source_kind: "derived",
        source_ref: `horizon:frame/${frame.responsibility}`,
        attributed_to: { actor_ref: observer, role: "human", principal_ref: observer },
        layout: "owner_pinned",
      },
    },
  ];
  const actions: SurfaceAction[] = [];
  for (const choice of frame.choices) {
    if (!isAddressable(choice)) continue;
    actions.push({
      id: choice.operation_ref.replaceAll(".", "-"),
      type: "action",
      operation: choice.operation_ref as SurfaceAction["operation"],
      label: choice.label,
      by: { actor_ref: observer, role: "human", principal_ref: observer },
    });
  }
  return {
    schema: SURFACE_SCHEMA,
    surface_id: "horizon.home",
    title: "Horizon",
    responsibility: frame.responsibility,
    intent: options.intent ?? "inspect",
    world_ref: frame.world_ref,
    focus_ref: frame.focus_ref,
    blocks,
    actions,
  };
}

/** The frame's own assessment, as an affordance lookup the projection may only narrow. */
export function affordanceOfFrame(frame: NavigationFrameV1): AffordanceStatusOf {
  const byOperation = new Map<string, "available" | "blocked" | "unknown" | "conflicted">();
  for (const choice of frame.choices) {
    const current = byOperation.get(choice.operation_ref);
    // Two choices for one operation that disagree are `conflicted`, not "whichever came last".
    byOperation.set(
      choice.operation_ref,
      current === undefined || current === choice.assessment.status ? choice.assessment.status : "conflicted",
    );
  }
  // Absent means the frame said nothing, and saying nothing is not permission.
  return (operation) => byOperation.get(operation) ?? "unknown";
}

/**
 * The binding context a route presents to the binder. Callers supply only what they are
 * allowed to know; the defaults are deliberately the *closed* answers (`horizon:` gates are
 * unresolved until T06/T07 answer for them, `file:` reads off unless a local route asks).
 */
export interface SurfaceRouteContext {
  /** Repository root for `file:` sources. */
  readonly root: string;
  readonly resolveEntity?: BindingContext["resolveEntity"];
  readonly resolveHorizon?: BindingContext["resolveHorizon"];
  readonly agentValues?: BindingContext["agentValues"];
  readonly awaiting?: BindingContext["awaiting"];
  /** False for any route a caller reached over the wire. */
  readonly allowFileReads?: boolean;
}

export function bindingContextOf(context: SurfaceRouteContext): BindingContext {
  return {
    root: context.root,
    resolveEntity: context.resolveEntity ?? (() => undefined),
    resolveHorizon: context.resolveHorizon ?? (() => undefined),
    ...(context.agentValues === undefined ? {} : { agentValues: context.agentValues }),
    awaiting: { horizon: "TA-T06/T07", ...(context.awaiting ?? {}) },
    allowFileReads: context.allowFileReads ?? false,
  };
}

/**
 * Parse → reduce → project one composed document for one presenting role. Every transport
 * calls this; none of them may reduce or project for itself (see
 * `scripts/check-t05-boundaries.ts`).
 */
export function projectForRole(
  submitted: unknown,
  role: SurfaceRole,
  frame: NavigationFrameV1,
  context: BindingContext,
): SurfaceProjection {
  const parsed = parseSurface(submitted);
  if (!parsed.ok) return { ok: false, code: parsed.code, issues: parsed.issues };
  const reduced = reduceSurface(parsed.surface, role);
  const bind = (expression: string): SourceBinding => bindSource(expression, context);
  return { ok: true, surface: parsed.surface, reduced, view: projectSurface(reduced, bind, affordanceOfFrame(frame)) };
}

/** Project the current frame as the human observer sees it. */
export function projectFrame(frame: NavigationFrameV1, context: BindingContext, role: SurfaceRole = "human"): SurfaceProjection {
  return projectForRole(composeSurface(frame), role, frame, context);
}

/** The gate assessment a frame becomes, in the shape `buildStructuralFrame` accepts. */
export function assessmentOf(frame: NavigationFrameV1): { readonly status: ChoiceStatus; readonly firstBlockers: Readonly<Record<string, string>> } {
  const firstBlockers: Record<string, string> = {};
  for (const choice of frame.choices) {
    if (choice.assessment.first_blocker !== null) firstBlockers[choice.operation_ref] = choice.assessment.first_blocker;
  }
  const status = frame.choices.every((choice) => choice.assessment.status === "available") ? "available" : "unknown";
  return { status, firstBlockers };
}

type ChoiceStatus = StructuralChoice["assessment"]["status"];

/**
 * Rebuild the frame a caller names, from what the route actually knows. A route that did
 * not observe the original availability table says `unknown` with no blockers rather than
 * re-deriving `available`: absent evidence is not permission (REQ-NAV-001, INV-01).
 */
export function frameFromCheckpoint(options: {
  readonly frameId: string;
  readonly revision: number;
  readonly observerRef: string;
  readonly worldRef: string;
  readonly checkpointRef: string;
  readonly status?: ChoiceStatus;
  readonly firstBlockers?: Readonly<Record<string, string>>;
}): NavigationFrameV1 {
  const built = buildStructuralFrame({
    frameId: options.frameId,
    observerRef: options.observerRef,
    world: { worldRef: options.worldRef },
    checkpointRef: options.checkpointRef,
    availability: { status: options.status ?? "unknown", firstBlockers: options.firstBlockers ?? {} },
  });
  return { ...built, revision: options.revision };
}

/** Canonical intent, re-exported so a route imports the equivalence seam from one place. */
export { canonicalIntent, intentsEquivalent };
export type { EquivalenceResult, GuiView, SurfaceIntentSubmission };

