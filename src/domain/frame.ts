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

export function buildStructuralFrame(options: {
  readonly frameId: string;
  readonly observerRef: string;
  readonly world: { readonly worldRef: string };
  readonly checkpointRef: string;
}): NavigationFrameV1 {
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
        assessment: {
          status: "available",
          first_blocker: null,
          reversibility: "reversible",
        },
      },
    ],
  };
}
