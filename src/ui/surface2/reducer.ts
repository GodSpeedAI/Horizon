/**
 * Role reduction: one parsed surface → one role-bound surface (REQ-UI-005, REQ-UI-006).
 *
 * The same surface is presented to an agent, a human or the system. Which of those three
 * is presenting is a property of the transport, not of the document, so the role is an
 * argument to the reducer and never a field a producer may set. The reducer then decides
 * what that role is *allowed* to contribute:
 *
 *   - `human`  — everything is offered as submitted.
 *   - `system` — everything is offered, and the reducer notes that no actor answers.
 *   - `agent`  — the agent may append blocks after the owner's blocks and may *propose*
 *                actions. It may not reorder, replace or remove an owner block, may not
 *                claim owner layout authority, and may not offer a consequential
 *                operation of its own accord.
 *
 * The reducer is pure: same input, same output, no clock, no ordering by insertion order
 * on the caller's side. It is also *monotone down* — it can downgrade a claim and can
 * never upgrade one. A block whose provenance claims more authority than the presenting
 * role has is downgraded to `agent_proposed` and its attribution is replaced with the
 * presenting agent, so the projection shows the real author.
 */
import {
  LAYOUT_PLACEMENTS,
  isConsequential,
  isLayoutAuthorized,
  type ActorAttribution,
  type LayoutPlacement,
  type SurfaceAction,
  type SurfaceBlock,
  type SurfaceRole,
  type SurfaceV2,
} from "./grammar";

export type ReductionKind =
  | "layout_authority_claimed"
  | "provenance_replaced"
  | "agent_block_appended"
  | "action_proposed_not_offered";

export interface ReductionNote {
  readonly kind: ReductionKind;
  /** Block or action id the note is about. */
  readonly target: string;
  readonly detail: string;
}

/**
 * Affordance status the *frame* assessed, keyed by operation. A surface may narrow what
 * the frame reported but may never widen it: possibility is not affordance, so a
 * projection cannot show `available` for an operation the frame called `blocked`
 * (REQ-NAV-001, INV-01). Absent means the frame said nothing and the surface inherits
 * `unknown`, not `available`.
 */
export type AffordanceStatusOf = (operation: string) => "available" | "blocked" | "unknown" | "conflicted";

export interface ReducedSurface {
  readonly schema: SurfaceV2["schema"];
  readonly role: SurfaceRole;
  readonly surface_id: string;
  readonly title: string;
  readonly responsibility: SurfaceV2["responsibility"];
  readonly intent: SurfaceV2["intent"];
  readonly world_ref?: string;
  readonly focus_ref: string;
  readonly blocks: readonly SurfaceBlock[];
  /** Actions the presenting role may actually offer. */
  readonly actions: readonly SurfaceAction[];
  /** Actions an agent raised that the human still has to choose. */
  readonly proposed: readonly SurfaceAction[];
  readonly notes: readonly ReductionNote[];
}

/** Authority ordering. The reducer only ever moves an index downward. */
const AUTHORITY: Record<LayoutPlacement, number> = {
  owner_pinned: 4,
  owner_laid_out: 3,
  default_order: 2,
  agent_composed: 1,
  agent_proposed: 0,
};

export function authorityOf(placement: LayoutPlacement): number {
  return AUTHORITY[placement];
}

/**
 * Downgrade a claim to the strongest placement the role may actually hold.
 *
 * The check is on the *attribution*, not only on the presenting role: `agent_composed` is
 * an agent placement, so a block that claims it while naming a human would otherwise present
 * an agent-composed block as if the owner had composed it. Such a claim has no human
 * authority behind it and is capped at `agent_proposed`, whatever the placement's rank.
 */
function downgrade(placement: LayoutPlacement, role: SurfaceRole, attributedTo?: ActorAttribution): LayoutPlacement {
  const claimedByAgent = attributedTo !== undefined && placement !== "agent_composed" && attributedTo.role === "agent";
  if (claimedByAgent) return "agent_proposed";
  if (role !== "agent") return placement;
  if (authorityOf(placement) >= authorityOf("default_order")) return "default_order";
  return "agent_proposed";
}

function presentingActor(role: SurfaceRole, submitted: ActorAttribution, surfaceId: string): ActorAttribution {
  if (role === "human") return submitted;
  if (role === "system") return { role: "system", actor_ref: "actor:horizon-system", principal_ref: "actor:horizon-system" };
  // An agent's contribution is always attributed to that agent acting for the observer.
  return {
    role: "agent",
    actor_ref: `agent:${surfaceId}`,
    principal_ref: submitted.principal_ref,
    agent_ref: `agent:${surfaceId}`,
    on_behalf_of_ref: submitted.principal_ref,
  };
}

/**
 * Reduce one parsed surface for one presenting role.
 *
 * Owner blocks keep their submitted order — insertion order is the owner's decision and
 * the reducer never sorts it. Agent blocks are appended after every owner block, because
 * an agent that could interleave would be able to move the owner's decision off the fold.
 */
export function reduceSurface(surface: SurfaceV2, role: SurfaceRole): ReducedSurface {
  const notes: ReductionNote[] = [];
  const ownerBlocks: SurfaceBlock[] = [];
  const agentBlocks: SurfaceBlock[] = [];

  for (const block of surface.blocks) {
    const claimed = block.provenance.layout;
    const allowed = downgrade(claimed, role, block.provenance.attributed_to);
    const attribution = presentingActor(role, block.provenance.attributed_to, surface.surface_id);
    const attributionChanged =
      attribution.actor_ref !== block.provenance.attributed_to.actor_ref ||
      attribution.role !== block.provenance.attributed_to.role;

    if (allowed !== claimed) {
      notes.push({
        kind: "layout_authority_claimed",
        target: block.id,
        detail: `'${claimed}' downgraded to '${allowed}' for role '${role}'`,
      });
    }
    if (attributionChanged) {
      notes.push({
        kind: "provenance_replaced",
        target: block.id,
        detail: `attribution replaced with '${attribution.actor_ref}'`,
      });
    }

    const reduced: SurfaceBlock = {
      ...block,
      provenance: {
        ...block.provenance,
        layout: allowed,
        attributed_to: attribution,
        // `agent_supplied` text cannot keep standing as a bound or derived value once an
        // agent is the one presenting it.
        source_kind: attribution.role === "agent" && block.provenance.source_kind === "bound" ? "agent_supplied" : block.provenance.source_kind,
      },
    } as SurfaceBlock;

    // Anything the presenting role introduced itself lives in the agent region. A block is
    // "introduced" by the presenter when the block's own attribution was an agent's.
    const introducedByPresenter = role === "agent" && block.provenance.attributed_to.role === "agent";
    if (introducedByPresenter) {
      agentBlocks.push(reduced);
      notes.push({ kind: "agent_block_appended", target: block.id, detail: "placed after owner blocks" });
    } else {
      ownerBlocks.push(reduced);
    }
  }

  const offered: SurfaceAction[] = [];
  const proposed: SurfaceAction[] = [];
  for (const action of surface.actions) {
    if (role === "agent" && isConsequential(action.operation)) {
      // Structurally forbidden by the schema, so reaching here means the caller built the
      // object by hand. Fail closed: the operation is never offered.
      proposed.push(action);
      notes.push({
        kind: "action_proposed_not_offered",
        target: action.id,
        detail: `'${action.operation}' requires the human's own choice`,
      });
      continue;
    }
    offered.push(action);
  }

  return {
    schema: surface.schema,
    role,
    surface_id: surface.surface_id,
    title: surface.title,
    responsibility: surface.responsibility,
    intent: surface.intent,
    ...(surface.world_ref === undefined ? {} : { world_ref: surface.world_ref }),
    focus_ref: surface.focus_ref,
    blocks: [...ownerBlocks, ...agentBlocks],
    actions: offered,
    proposed,
    notes,
  };
}

/** The placements a role may present, for the vocabulary catalogue and for tests. */
export function placementsFor(role: SurfaceRole): readonly LayoutPlacement[] {
  return LAYOUT_PLACEMENTS.filter((placement) => downgrade(placement, role) === placement);
}
