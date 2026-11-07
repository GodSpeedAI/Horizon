/** @jsxImportSource react */
/**
 * The fixed area above every button that commits something: the exact action, where it goes, what happens next, and whether it can
 * be undone. The button below it is named for the action. No card asks for a bare "Confirm".
 */
import type { ReactNode } from "react";

export interface CommitFacts {
  /** The exact action in plain words, for example "Send step to agent: Fix the checkout total". */
  readonly action: string;
  /** Where it goes, for example "Seed: triage inbox". */
  readonly destination: string;
  readonly next: string;
  /** Whether it can be undone, and a sentence about it. */
  readonly undo: { readonly can: boolean; readonly words: string };
}

export function CommitSummary({ facts }: { readonly facts: CommitFacts }): ReactNode {
  return (
    <div className="commit-facts" data-commitment aria-label="What the button below does">
      <p data-fact="action">
        <strong>Action:</strong> {facts.action}
      </p>
      <p data-fact="destination">
        <strong>Destination:</strong> {facts.destination}
      </p>
      <p data-fact="next">
        <strong>What happens next:</strong> {facts.next}
      </p>
      <p data-fact="undo">
        <strong>Can be undone:</strong> {facts.undo.can ? "yes" : "no"}. {facts.undo.words}
      </p>
    </div>
  );
}
