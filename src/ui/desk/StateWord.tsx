/** @jsxImportSource react */
/** A state shown as words (rule 6). The colour is a second cue; the word is always there. */
import type { ReactNode } from "react";
import { STATE_WORDS, type AnyState } from "./attention.ts";

export function StateWord({ state }: { readonly state: AnyState }): ReactNode {
  return (
    <span className="state-word" data-state={state}>
      {STATE_WORDS[state]}
    </span>
  );
}
