/**
 * The revision an answer carries (finding R2-5): the question's version and owner revision as the person saw them. An answer, deferral
 * or cancellation without both is refused, so tests read them from the board they act on.
 */
import type { Panels } from "../../src/ui/desk/panels-model.ts";

type OpenPanel = { readonly id: string; readonly blocks: readonly { readonly kind: string; readonly id: string; readonly version?: string; readonly owner_rev?: number }[] };

/** The revision of one question on a board (the reducer's state, or the `panels` part of the desk's state.json). */
export function revisionIn(open: readonly OpenPanel[], panel: string, ask: string): { version: string; owner_rev: number } {
  const block = open.find((p) => p.id === panel)?.blocks.find((b) => b.kind === "question" && b.id === ask);
  // A question not on the board gets a well-formed placeholder, so the answer reaches the rule that says it is not open.
  return { version: block?.version ?? "00000000000000", owner_rev: block?.owner_rev ?? 0 };
}

/** The revision of one question on the desk, read from its state. */
export async function revisionOf(app: { readonly state: () => Promise<{ panels: { open: readonly OpenPanel[] } }> }, panel: string, ask: string): Promise<{ version: string; owner_rev: number }> {
  return revisionIn((await app.state()).panels.open, panel, ask);
}

/** The revision of one question on a reducer board. */
export const reducerRevision = (state: Panels, panel: string, ask: string): { version: string; owner_rev: number } => revisionIn(state.open, panel, ask);

/** A `human.answer` body with the question's revision filled in from the desk. A revision the body names itself is kept. */
export async function withRevision<T>(app: { readonly state: () => Promise<{ panels: { open: readonly OpenPanel[] } }> }, body: T): Promise<T> {
  const b = body as { readonly op?: unknown; readonly panel?: unknown; readonly ask?: unknown };
  if (b.op !== "human.answer" || typeof b.panel !== "string" || typeof b.ask !== "string") return body;
  return { ...(await revisionOf(app, b.panel, b.ask)), ...body };
}
