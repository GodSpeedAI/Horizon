import type { NavigationFrameV1 } from "../domain/frame.ts";

export type SourceKind = "semantic" | "cognate" | "file" | "agent";

export interface SourceRef {
  readonly kind: SourceKind;
  readonly ref: string;
}

export interface SurfaceBlock {
  readonly kind: "callout" | "table" | "entity" | "timeline" | "inspector";
  readonly title: string;
  readonly sources: readonly SourceRef[];
}

export interface SurfaceModel {
  readonly schema: "horizon.surface/1";
  readonly intent: "home" | "focus" | "evidence" | "compare";
  readonly title: string;
  readonly persistent_context: {
    readonly observer_ref: string;
    readonly world_ref: string;
    readonly checkpoint_ref: string;
    readonly focus_ref: string;
  };
  readonly blocks: readonly SurfaceBlock[];
}

function assertSource(source: SourceRef): void {
  if (!source.ref.trim()) throw new Error("UI: source reference must not be empty");
  if (source.kind === "agent" && !source.ref.startsWith("agent:")) {
    throw new Error("UI: agent-supplied source must be marked agent:");
  }
}

export function projectFrame(frame: NavigationFrameV1): SurfaceModel {
  const semantic: SourceRef = { kind: "semantic", ref: frame.world_ref };
  const cognate: SourceRef = { kind: "cognate", ref: frame.checkpoint_ref };
  const blocks: SurfaceBlock[] = [
    {
      kind: "callout",
      title: "Observer-relative world",
      sources: [semantic, cognate],
    },
    {
      kind: "table",
      title: "Derived choices",
      sources: [...frame.choices.flatMap((choice) => [
        semantic,
        { kind: "agent" as const, ref: `agent:horizon.health#${choice.operation_ref}` },
      ])],
    },
  ];
  for (const block of blocks) for (const source of block.sources) assertSource(source);
  return {
    schema: "horizon.surface/1",
    intent: "home",
    title: "Horizon",
    persistent_context: {
      observer_ref: frame.observer_ref,
      world_ref: frame.world_ref,
      checkpoint_ref: frame.checkpoint_ref,
      focus_ref: frame.focus_ref,
    },
    blocks,
  };
}
