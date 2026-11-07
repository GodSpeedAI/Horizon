import type { ExpectedOutcome, SettlementWindow } from "./expectation.ts";

export type AffordanceStatus = "available" | "blocked" | "unknown" | "conflicted";
export interface StructuralChoice {
  readonly operation_ref: string;
  readonly label: string;
  readonly assessment: {
    readonly status: AffordanceStatus;
    readonly first_blocker: string | null;
    readonly reversibility: "read_only" | "reversible" | "compensable" | "irreversible" | "unknown";
  };
}

export interface NavigationFrameV1 {
  readonly schema: "horizon.navigation-frame/1";
  readonly frame_id: string;
  readonly revision: number;
  readonly observer_ref: string;
  readonly world_ref: string;
  readonly checkpoint_ref: string;
  readonly focus_ref: string;
  readonly case_ref: string | null;
  /**
   * Journey names, not block kinds. `journey.compare` is written dotted because the plain
   * word is also a surface block type, and the surface vocabulary belongs to
   * `src/ui/surface2/` alone: one spelling for two meanings is how a second grammar starts.
   */
  readonly responsibility: "orient" | "decide" | "execute" | "monitor" | "journey.compare" | "develop";
  readonly choices: readonly StructuralChoice[];
}

/**
 * `.sea/interaction/interaction-model.sea:218` `NavigationIntentRecord`, in the field
 * order the canonical entity declares. `correlation_ref` comes from the commit, not
 * from the caller.
 */
export interface NavigationIntentRecord {
  readonly intent_id: string;
  readonly frame_id: string;
  readonly frame_revision: number;
  readonly actor_ref: string;
  readonly operation_ref: string;
  readonly authority_ref?: string;
  readonly correlation_ref?: string;
  /** HORIZON-001 1.1.0 records carry 2; absent means 1. Readers refuse an unknown version. */
  readonly contract_version?: number;
  /** REQ-NAV-011: frozen with the intent; its digest is part of the duplicate check. */
  readonly expected_outcome?: ExpectedOutcome | null;
  readonly expectation_digest?: string | null;
  /** RealityTrace threshold id and ledger position T, declared before authority was requested. */
  readonly realitytrace_threshold?: { readonly id: string; readonly position: number } | null;
  /** Window bounds, stored so they survive restarts. */
  readonly window?: SettlementWindow | null;
}

export function buildStructuralFrame(options: {
  readonly frameId: string;
  readonly observerRef: string;
  readonly world: { readonly worldRef: string };
  readonly checkpointRef: string;
  /**
   * Gate status for the structural choices. A failed preflight sets this to
   * `unknown` with the missing gate named (REQ-CONFIG-003): possibility alone must
   * never render as an affordance (REQ-NAV-001, INV-01).
   */
  readonly availability?: { readonly status: AffordanceStatus; readonly firstBlockers: Readonly<Record<string, string>> };
  /** HORIZON-001 1.1.0: bound operations, each with the status its payment and settlement gates gave it. */
  readonly bound?: readonly StructuralChoice[];
}): NavigationFrameV1 {
  const availability = options.availability;
  const statusOf = (operationRef: string): { readonly status: AffordanceStatus; readonly first_blocker: string | null } => {
    const blocker = availability?.firstBlockers[operationRef];
    // Only the operations named in the blocker table lose their gate status.
    if (availability && blocker !== undefined) return { status: availability.status, first_blocker: blocker };
    return { status: "available", first_blocker: null };
  };
  return {
    schema: "horizon.navigation-frame/1",
    frame_id: options.frameId,
    revision: 0,
    observer_ref: options.observerRef,
    world_ref: options.world.worldRef,
    checkpoint_ref: options.checkpointRef,
    focus_ref: "semantic:HorizonHost",
    case_ref: null,
    responsibility: "orient",
    // Both structural moves only *check* things: their one effect is Horizon's own record of the intent and
    // the observation run it starts, never a change to the world. They are read_only (owner decision
    // 2026-10-23), so under HORIZON-001 1.1.0 they need no expected outcome and settle as not_required;
    // a consequential operation still requires a binding, an expectation and SEA-Forge settlement.
    choices: [
      {
        operation_ref: "horizon.health",
        label: "Check that the rules and records are connected",
        assessment: { ...statusOf("horizon.health"), reversibility: "read_only" },
      },
      {
        operation_ref: "horizon.research.health",
        label: "Check the optional Python research subsystem contract",
        assessment: { ...statusOf("horizon.research.health"), reversibility: "read_only" },
      },
      ...(options.bound ?? []),
    ],
  };
}
