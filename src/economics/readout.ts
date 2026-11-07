/** What the record keeper reported about cost, as the economics view and the desk read it. Types only, so the UI need not import an adapter. */
import type { EconomicsModel } from "./model.ts";

export interface EconomicsRepo {
  readonly repo_id: string;
  readonly path: string | null;
  readonly model: EconomicsModel | null;
  /** A brief error from RealityTrace for this repo, or null. */
  readonly error: string | null;
}

export type EconomicsReadout =
  | { readonly state: "not_configured" }
  | { readonly state: "unavailable"; readonly message: string }
  | { readonly state: "empty"; readonly repos: readonly EconomicsRepo[]; readonly skipped: EconomicsSkipped }
  | { readonly state: "ok"; readonly repos: readonly EconomicsRepo[]; readonly skipped: EconomicsSkipped };

/** Enrolled repositories left out of the view, counted so nothing disappears silently. */
export interface EconomicsSkipped {
  /** Enrolled, but the ledger holds no agent events (e.g. repos enrolled by other tools). */
  readonly without_agent_activity: number;
  /** Enrolled, but the folder no longer exists (e.g. temporary test repositories). */
  readonly missing_folder: number;
}
