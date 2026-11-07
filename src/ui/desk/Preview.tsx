/** @jsxImportSource react */
/**
 * The preview (design 5.6): everything a choice will do, shown before anything is done. It applies to this exact preview:
 * when the card's preview code moves on, Confirm turns off and says "preview out of date" until the operator refreshes.
 */
import type { ReactNode } from "react";
import type { OpenDecision } from "./attention.ts";
import type { ChoicePreview, DecisionCardData } from "./model.ts";
import { StateWord } from "./StateWord.tsx";
import { Words } from "./Words.tsx";

export interface PreviewProps {
  readonly card: DecisionCardData;
  readonly decision: OpenDecision;
  readonly onReason: (text: string) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly onRefresh: () => void;
}

export const OUT_OF_DATE = "Preview out of date";

/** Why Confirm is off, or null when it can be pressed. Every switched-off control says why. */
export function confirmOffReason(card: DecisionCardData, decision: OpenDecision): string | null {
  if (card.preview.code !== decision.code) return `${OUT_OF_DATE}: what this shows changed while you were looking. Refresh to see the new preview.`;
  if (card.held !== null) return "This card is on hold. Release the hold first.";
  const choice = chosen(card, decision);
  if (choice === null) return card.blocked ?? "This choice is not available for this card.";
  if (decision.choice !== "hold" && card.blocked !== null) return card.blocked;
  const needsReason = decision.choice === "hold" || (decision.choice === "accept" && card.reason_for_accept);
  if (needsReason && decision.reason.trim() === "") return decision.choice === "hold" ? "Type why you are holding this, then Confirm." : "Type a reason for this decision, then Confirm. It is kept with the decision.";
  if (decision.busy) return "Sending your decision…";
  return null;
}

export function chosen(card: DecisionCardData, decision: OpenDecision): ChoicePreview | null {
  return decision.choice === "accept" ? card.preview.accept : decision.choice === "reject" ? card.preview.reject : card.preview.hold;
}

export function Preview({ card, decision, onReason, onConfirm, onCancel, onRefresh }: PreviewProps): ReactNode {
  const stale = card.preview.code !== decision.code;
  const choice = chosen(card, decision);
  const off = confirmOffReason(card, decision);
  const needsReason = decision.choice === "hold" || (decision.choice === "accept" && card.reason_for_accept);
  return (
    <section className="preview" id="decision-preview" aria-labelledby="preview-h" data-stale={stale ? "yes" : "no"} data-code={decision.code}>
      <h4 id="preview-h">
        <StateWord state="preview" /> {choice ? choice.button : "This choice"}
      </h4>
      {stale ? (
        <p role="alert" className="error" data-out-of-date>
          {OUT_OF_DATE}. What this shows changed while you were looking, so nothing here will be applied.{" "}
          <button type="button" onClick={onRefresh} data-autofocus>
            Refresh the preview
          </button>
        </p>
      ) : null}
      {choice === null ? (
        <p>{card.blocked ?? "This choice is not available for this card."}</p>
      ) : (
        <dl className="preview-grid">
          <dt>Kind</dt>
          <dd data-kind={choice.kind}>
            <strong>{choice.kind === "can be undone" ? "Can be undone" : choice.kind === "changes things" ? "Changes things" : "Cannot be undone"}</strong>
          </dd>
          <dt>What it touches</dt>
          <dd>
            <ul>
              {card.preview.touches.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </dd>
          <dt>What will happen</dt>
          <dd>
            <ul>
              {choice.effects.map((e) => (
                <li key={e.text} data-certainty={e.certainty}>
                  {e.text} <span className="certainty">({e.certainty})</span>
                </li>
              ))}
            </ul>
          </dd>
          <dt>Who may do this</dt>
          <dd>{card.preview.who}</dd>
          <dt>Stops if</dt>
          <dd>{card.preview.stops_if}</dd>
          <dt>Limits</dt>
          <dd>{card.preview.limits}</dd>
          <dt>How to undo it</dt>
          <dd>{choice.undo}</dd>
          <dt>What it makes possible next</dt>
          <dd>{choice.next}</dd>
        </dl>
      )}
      {needsReason ? (
        <label className="reason">
          {decision.choice === "hold" ? "Why are you holding this?" : "Your reason (typed, and kept with the decision)"}
          <textarea rows={2} value={decision.reason} data-autofocus={stale ? undefined : true} onChange={(event) => onReason(event.target.value)} maxLength={600} aria-describedby="confirm-why" />
        </label>
      ) : null}
      {decision.problem !== null ? (
        <p role="alert" className="error" data-problem>
          <Words text={decision.problem} />
        </p>
      ) : null}
      <div className="row">
        <button type="button" onClick={onCancel}>
          Cancel (Esc)
        </button>
        <button type="button" className="primary" disabled={off !== null} aria-disabled={off !== null} onClick={onConfirm} data-confirm data-autofocus={!stale && !needsReason ? true : undefined} aria-describedby="confirm-why">
          {stale ? `Confirm (${OUT_OF_DATE.toLowerCase()})` : `Confirm: ${choice ? choice.button : "choice"}`}
        </button>
      </div>
      <p id="confirm-why" className="muted" role="status">
        {off ?? "Confirm applies to exactly the preview above."}
      </p>
    </section>
  );
}
