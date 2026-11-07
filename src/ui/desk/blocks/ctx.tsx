/** @jsxImportSource react */
/**
 * What a drawn part may do. The desk wires these; a drawer never reaches the network, never writes a page, and never sends anything.
 * Text goes through `useShown`, so Presenting's stand-in names apply to every word a drawer shows.
 */
import { createContext, useContext } from "react";

export type AskOutcome = "answered" | "deferred" | "cancelled";

/** An action offered inside a part. The desk opens the same preview as its own buttons; nothing is sent without Confirm. */
export interface BlockAction {
  readonly id: string;
  readonly operation: string;
  readonly label: string;
  readonly blockId: string;
}

/** What the desk knows about one question: the answer given, and whether the agent took it back. */
export interface AskState {
  readonly answered?: { readonly outcome: string; readonly value?: unknown; readonly note?: string | null; readonly routed_as?: string | null } | null;
  readonly withdrawn?: { readonly reason: string } | null;
}

export interface BlockCtx {
  readonly presenting: boolean;
  onAnswer(askId: string, outcome: AskOutcome, value?: string, note?: string): void;
  onSubmit(formId: string, values: Readonly<Record<string, string | boolean>>): void;
  onAction(action: BlockAction): void;
  openRef(ref: string): void;
  /** Swaps real project names for their stand-ins. Used only while `presenting` is on. */
  hideNames?(text: string): string;
  /** The answer and withdrawal state of a question, by its id. */
  askState?(askId: string): AskState | undefined;
  /** A same-site address for a picture the desk can show, or null. Anything not starting with a single "/" is ignored. */
  mediaUrl?(src: string): string | null;
}

export const NO_CTX: BlockCtx = { presenting: false, onAnswer() {}, onSubmit() {}, onAction() {}, openRef() {} };

export const CtxContext = createContext<BlockCtx>(NO_CTX);
export const useCtx = (): BlockCtx => useContext(CtxContext);

/** Text as the person should see it right now (stand-ins on while Presenting). */
export function useShown(): (text: string) => string {
  const ctx = useCtx();
  return (text) => (ctx.presenting && ctx.hideNames !== undefined ? ctx.hideNames(text) : text);
}
