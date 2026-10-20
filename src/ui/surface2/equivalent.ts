/**
 * Intent equivalence across transports (REQ-UI-008, PE-06).
 *
 * The GUI, the CLI and an MCP client each express a choice differently, but a choice is
 * the *same* choice when it names the same operation, from the same surface, at the same
 * frame, for the same actor. This module reduces every transport's submission to one
 * `SurfaceIntent` and refuses the ones that cannot be proven equivalent.
 *
 * Refusals are typed, because an unprovable intent is not a valid intent:
 *
 *   - `unknown_node`   — the id names nothing the projection showed.
 *   - `not_offered`    — the id exists but this role may not choose it (`proposed`).
 *   - `role_mismatch`  — the transport asserted a role the projection was not reduced for.
 *   - `surface_mismatch` — the intent belongs to a different surface or frame.
 */
import type { GuiView } from "./project";

export type Transport = "gui" | "cli" | "mcp";

export type SurfaceIntentSubmission =
  | { readonly transport: "gui"; readonly view: GuiView; readonly node_id: string; readonly role: string }
  | { readonly transport: "cli"; readonly view: GuiView; readonly operation: string; readonly role: string }
  | { readonly transport: "mcp"; readonly view: GuiView; readonly operation: string; readonly role: string };

export interface SurfaceIntent {
  readonly surface_id: string;
  readonly role: string;
  readonly operation: string;
  /** The action the projection offered for this operation, when the transport named one. */
  readonly action_id?: string;
}

export type EquivalenceResult =
  | { readonly ok: true; readonly intent: SurfaceIntent }
  | { readonly ok: false; readonly code: "unknown_node" | "not_offered" | "role_mismatch" | "operation_not_in_view" };

function offeredOperations(view: GuiView): { readonly operation: string; readonly action_id: string }[] {
  return view.actions.filter((action) => action.posture === "offered").map((action) => ({ operation: action.operation, action_id: action.action_id }));
}

/** Reduce a transport submission to a canonical intent, or explain why it is not one. */
export function canonicalIntent(submission: SurfaceIntentSubmission): EquivalenceResult {
  const { view, role } = submission;
  if (role !== view.role) return { ok: false, code: "role_mismatch" };

  const offered = offeredOperations(view);
  if (submission.transport === "gui") {
    const action = view.actions.find((candidate) => candidate.action_id === submission.node_id);
    if (action === undefined) return { ok: false, code: "unknown_node" };
    if (action.posture !== "offered") return { ok: false, code: "not_offered" };
    return { ok: true, intent: { surface_id: view.surface_id, role, operation: action.operation, action_id: action.action_id } };
  }

  const match = offered.find((candidate) => candidate.operation === submission.operation);
  if (match === undefined) return { ok: false, code: "operation_not_in_view" };
  return { ok: true, intent: { surface_id: view.surface_id, role, operation: match.operation, action_id: match.action_id } };
}

/**
 * Compare two canonical intents. `undefined` for either side means that transport could
 * not express the intent at all, which is not equivalence — it is a gap.
 */
export function intentsEquivalent(left: EquivalenceResult, right: EquivalenceResult): boolean {
  if (!left.ok || !right.ok) return false;
  return (
    left.intent.surface_id === right.intent.surface_id &&
    left.intent.role === right.intent.role &&
    left.intent.operation === right.intent.operation
  );
}
