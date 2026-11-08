/**
 * What the desk shows for a question whose stored answers disagree (finding R2-10). The desk never picks one of the answers: the
 * person does. The item is listed beside the waiting steps, with the words that ask for a decision and the action that can be taken
 * from here. The startup log names each conflict by its ids only, never by its answer text.
 */
import type { ConflictItem } from "./model.ts";

export const CONFLICT_WORDS = "Two earlier answers to this question disagree. Choose which one stands, or stop waiting.";

export interface ConflictView {
  readonly key: string;
  readonly panel: string;
  readonly ask: string;
  readonly title: string;
  readonly words: string;
  readonly step: string | null;
  /** The actions the page offers for this item. "Stop waiting" needs the step the answers bear on. */
  readonly actions: readonly "stop_waiting"[];
}

/** The items the board and conversation show, one per conflicted question, in the order the store lists them. */
export function conflictViews(conflicts: readonly ConflictItem[] | undefined): ConflictView[] {
  return (conflicts ?? []).map((c) => ({
    key: `${c.panel}\n${c.ask}`,
    panel: c.panel,
    ask: c.ask,
    title: c.question ?? "A question",
    words: CONFLICT_WORDS,
    step: c.step,
    actions: c.step === null ? [] : ["stop_waiting"],
  }));
}

/** One line per conflict for the startup log: the ids only, no answer text. */
export function conflictLogLines(conflicts: readonly Pick<ConflictItem, "panel" | "ask">[]): string[] {
  return conflicts.map((c) => `desk: stored answers to question ${c.ask} on panel ${c.panel} disagree; the person needs to decide which one stands`);
}
