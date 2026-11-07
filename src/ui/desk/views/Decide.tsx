/** @jsxImportSource react */
/** Decide (design 5.1): "What needs me?" Notices wait at the top, then decision cards oldest first, then the ones on hold. */
import type { ReactNode } from "react";
import { DecisionCard } from "../DecisionCard.tsx";
import type { ViewProps } from "./Today.tsx";

export interface DecideViewProps extends ViewProps {
  readonly confirm: () => void;
  readonly release: (cardId: string) => void;
  readonly nowMs?: number;
}

export function Decide({ ui, data, dispatch, confirm, release, nowMs }: DecideViewProps): ReactNode {
  if (data === null) {
    return (
      <section aria-labelledby="decide-h" className="view" data-view-id="decide">
        <h1 id="decide-h">Decide</h1>
        <p role="status">Still loading.</p>
      </section>
    );
  }
  const now = nowMs ?? Date.now();
  const waiting = data.decide.cards.filter((c) => c.held === null);
  const held = data.decide.cards.filter((c) => c.held !== null);
  // Exactly one card is highlighted: the one the keyboard cursor is on.
  const current = Math.min(ui.cursor, Math.max(0, waiting.length - 1));
  return (
    <section aria-labelledby="decide-h" className="view" data-view-id="decide">
      <h1 id="decide-h">Decide</h1>
      <p className="muted">What needs you, oldest first. Nothing is decided until you confirm a preview.</p>
      {ui.decideNote !== null ? (
        <p role="status" className={ui.decideNote.ok ? "notice" : "error"} data-decide-note>
          {ui.decideNote.message}
        </p>
      ) : null}
      {data.decide.notices.length > 0 ? (
        <div className="notices" role="region" aria-label="Notices">
          <h2>Notices</h2>
          <ul>
            {data.decide.notices.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {waiting.length === 0 ? (
        <p className="empty" data-empty>
          Nothing needs you right now. When an agent or a step asks for a decision, it waits here with a preview. Next step: write down what you are working on in the box below.
        </p>
      ) : (
        <div className="cards" data-focus="list" tabIndex={0} aria-label={`${waiting.length} decisions waiting`}>
          {waiting.map((card, index) => (
            <DecisionCard key={card.id} card={card} position={index + 1} total={waiting.length} highlighted={index === current} nowMs={now} ui={ui} dispatch={dispatch} confirm={confirm} release={release} />
          ))}
        </div>
      )}
      {held.length > 0 ? (
        <div className="held">
          <h2>On hold ({held.length})</h2>
          {held.map((card) => (
            <DecisionCard key={card.id} card={card} position={0} total={0} highlighted={false} nowMs={now} ui={ui} dispatch={dispatch} confirm={confirm} release={release} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
