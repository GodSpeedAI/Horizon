export type AffordanceStatus = "available" | "blocked" | "unknown" | "conflicted";
export interface StructuralChoice {
  readonly operation_ref: string;
  readonly label: string;
  readonly assessment: {
    readonly status: AffordanceStatus;
    readonly first_blocker: string | null;
    readonly reversibility: "reversible" | "compensable" | "irreversible" | "unknown";
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
  readonly responsibility: "orient" | "decide" | "execute" | "monitor" | "compare" | "develop";
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
    choices: [
      {
        operation_ref: "horizon.health",
        label: "Check the structural world and Cognate projection",
        assessment: { ...statusOf("horizon.health"), reversibility: "reversible" },
      },
      {
        operation_ref: "horizon.research.health",
        label: "Check the optional Python research subsystem contract",
        assessment: { ...statusOf("horizon.research.health"), reversibility: "reversible" },
      },
    ],
  };
}
