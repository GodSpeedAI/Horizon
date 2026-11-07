/** @jsxImportSource react */
/**
 * One decision card (design 5.5). Only the card at the cursor is highlighted; the others wait as "2 of 3". It shows how long
 * it has waited, the safe choice first, and what each choice does is in the preview, never decided from the card itself.
 */
import type { ReactNode } from "react";
import type { Action, UiState } from "./attention.ts";
import { Preview } from "./Preview.tsx";
import { ageWords, type DecisionCardData } from "./model.ts";

export interface CardProps {
  readonly card: DecisionCardData;
  readonly position: number;
  readonly total: number;
  readonly highlighted: boolean;
  readonly nowMs: number;
  readonly ui: UiState;
  readonly dispatch: (action: Action) => void;
  readonly confirm: () => void;
  readonly release: (cardId: string) => void;
}

export function DecisionCard({ card, position, total, highlighted, nowMs, ui, dispatch, confirm, release }: CardProps): ReactNode {
  const open = ui.decision !== null && ui.decision.cardId === card.id ? ui.decision : null;
  const held = card.held !== null;
  const acceptOff = card.preview.accept === null ? (card.blocked ?? "Accepting is not available here.") : null;
  const rejectOff = card.preview.reject === null ? (card.blocked ?? "Rejecting is not available here.") : null;
  return (
    <article className="decision-card" data-card-id={card.id} data-kind={card.kind} data-highlight={highlighted ? "true" : "false"} data-held={held ? "yes" : "no"} aria-labelledby={`${card.id}-h`} aria-current={highlighted ? "true" : undefined}>
      <p className="card-flag">
        <strong>{held ? "ON HOLD" : highlighted ? "NEEDS YOU" : "Waiting"}</strong>
        {held ? null : (
          <>
            {" "}
            · <span data-position>{position} of {total}</span>
          </>
        )}{" "}
        · <span data-age>{ageWords(card.requested_at, nowMs)}</span>
      </p>
      <h3 id={`${card.id}-h`}>{card.title}</h3>
      <ul className="facts">
        {card.facts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
      {held ? (
        <p data-held-reason>
          Held: {card.held!.reason}{" "}
          <button type="button" onClick={() => release(card.id)}>
            Release the hold
          </button>
        </p>
      ) : (
        <>
          {card.blocked !== null ? (
            <p className="muted" data-blocked>
              {card.blocked}
            </p>
          ) : null}
          <div className="row choices">
            <button type="button" onClick={() => dispatch({ type: "preview-open", cardId: card.id, choice: "hold" })} data-choice="hold" title="Hold: nothing changes, the step keeps waiting.">
              Hold… (H)
            </button>
            <button type="button" disabled={rejectOff !== null} aria-disabled={rejectOff !== null} onClick={() => dispatch({ type: "preview-open", cardId: card.id, choice: "reject" })} data-choice="reject" title={rejectOff ?? "Reject: opens the preview first."}>
              Reject… (R)
            </button>
            <button type="button" className={highlighted ? "primary" : undefined} disabled={acceptOff !== null} aria-disabled={acceptOff !== null} onClick={() => dispatch({ type: "preview-open", cardId: card.id, choice: "accept" })} data-choice="accept" title={acceptOff ?? "Accept: opens the preview first."}>
              Accept… (A)
            </button>
          </div>
          {acceptOff !== null || rejectOff !== null ? <p className="muted">{[acceptOff, rejectOff].filter((x, i, all) => x !== null && all.indexOf(x) === i).join(" ")}</p> : null}
          <p className="muted">If you hold: nothing changes and the step keeps waiting. To undo: release the hold. Nothing else is decided until you confirm in the preview.</p>
        </>
      )}
      {open !== null ? (
        <Preview
          card={card}
          decision={open}
          onReason={(text) => dispatch({ type: "reason", text })}
          onConfirm={confirm}
          onCancel={() => dispatch({ type: "preview-close" })}
          onRefresh={() => dispatch({ type: "preview-open", cardId: card.id, choice: open.choice })}
        />
      ) : null}
    </article>
  );
}
