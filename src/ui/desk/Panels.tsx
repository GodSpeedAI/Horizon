/** @jsxImportSource react */
/**
 * Panels from agents (stage 4): what an agent put in front of you, in Horizon's own blocks. You can answer its questions, pin a
 * panel so it stays where it is, and close it. A panel from an agent never moves what you are reading; it waits here.
 * At most eight are open. Every piece of text is drawn as text.
 */
import { useState, type ReactNode } from "react";
import { MAX_OPEN_PANELS, type AskBlock, type Panel, type PanelBlock, type Panels as PanelsState } from "./panels-model.ts";

export { MAX_OPEN_PANELS };

export interface PanelsIo {
  readonly answer: (input: { panel: string; ask: string; outcome: "answered" | "deferred" | "cancelled"; value?: string; note?: string }) => Promise<{ readonly ok: boolean; readonly message: string }>;
  readonly pin: (id: string, pinned: boolean) => Promise<void>;
  readonly close: (id: string) => Promise<void>;
  readonly stopWaiting: (step: string) => Promise<{ readonly ok: boolean; readonly message: string }>;
}

export interface PanelsViewProps {
  readonly panels: PanelsState;
  /** Steps with an answer the agent has not replied to yet. */
  readonly waiting: readonly { readonly step: string; readonly panel: string }[];
  readonly io: PanelsIo;
}

function Ask({ panel, block, io }: { readonly panel: Panel; readonly block: AskBlock; readonly io: PanelsIo }): ReactNode {
  const [choice, setChoice] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (block.answered !== null) {
    const how = block.answered.outcome === "answered" ? `You answered: ${String(block.answered.value ?? "")}` : block.answered.outcome === "deferred" ? "You put this off." : "You cancelled this question.";
    return (
      <div className="ask" data-answered="yes">
        <p>
          <strong>{block.question}</strong>
        </p>
        <p className="muted">{how}</p>
      </div>
    );
  }
  const send = async (outcome: "answered" | "deferred" | "cancelled"): Promise<void> => {
    setBusy(true);
    const result = await io.answer({ panel: panel.id, ask: block.id, outcome, ...(outcome === "answered" ? { value: choice } : {}), ...(note.trim() === "" ? {} : { note }) });
    setBusy(false);
    setMessage(result.message);
  };
  return (
    <fieldset className="ask" data-answered="no" disabled={busy}>
      <legend>{block.question}</legend>
      {block.why_needed !== "" ? <p className="muted">Why it asks: {block.why_needed}</p> : null}
      {block.options.map((o) => (
        <label key={o.option_id} className="row">
          <input type="radio" name={`${panel.id}-${block.id}`} value={o.option_id} checked={choice === o.option_id} onChange={() => setChoice(o.option_id)} /> {o.label}
        </label>
      ))}
      <label className="reason">
        A note for the agent (optional)
        <textarea rows={2} value={note} maxLength={600} onChange={(event) => setNote(event.target.value)} />
      </label>
      <div className="row">
        <button type="button" className="primary" disabled={choice === ""} aria-disabled={choice === ""} onClick={() => void send("answered")} data-answer>
          Send my answer
        </button>
        <button type="button" onClick={() => void send("deferred")}>
          Not now
        </button>
        <button type="button" onClick={() => void send("cancelled")}>
          Cancel the question
        </button>
      </div>
      {choice === "" ? <p className="muted">Pick one answer to send it, or choose Not now or Cancel the question.</p> : null}
      {message !== null ? <p role="status">{message}</p> : null}
    </fieldset>
  );
}

function Item({ panel, item, io }: { readonly panel: Panel; readonly item: PanelBlock; readonly io: PanelsIo }): ReactNode {
  switch (item.kind) {
    case "text":
      return (
        <p className="panel-text" data-tone={item.tone} dir="auto">
          {item.label !== null ? <strong>{item.label}: </strong> : null}
          {item.text}
        </p>
      );
    case "rows":
      return (
        <table className="panel-table">
          {item.columns.length > 0 ? (
            <thead>
              <tr>
                {item.columns.map((c, i) => (
                  <th key={i} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {item.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "question":
      return <Ask panel={panel} block={item} io={io} />;
    case "unavailable":
      return <p className="muted">The agent sent something here that this panel cannot show yet, so it is left out.</p>;
  }
}

export function Panels({ panels, waiting, io }: PanelsViewProps): ReactNode {
  if (panels.open.length === 0 && waiting.length === 0) return null;
  return (
    <section className="panels" aria-labelledby="panels-h" data-panel-count={panels.open.length}>
      <h2 id="panels-h">From agents</h2>
      <p className="muted">
        {panels.open.length} of {panels.max} open. A pinned panel stays where it is. An agent cannot answer for you.
      </p>
      {waiting.map((w) => (
        <p key={w.step} className="notice" role="status" data-waiting-step={w.step}>
          Waiting for the agent to reply to your answer about "{w.step}". That step cannot be accepted until it does.{" "}
          <button type="button" onClick={() => void io.stopWaiting(w.step)}>
            Stop waiting
          </button>
        </p>
      ))}
      {panels.open.map((panel) => (
        <article key={panel.id} className="panel" data-panel-id={panel.id} data-pinned={panel.pinned ? "yes" : "no"} aria-labelledby={`${panel.id}-ph`}>
          <header className="row">
            <h3 id={`${panel.id}-ph`}>{panel.title}</h3>
            <button type="button" aria-pressed={panel.pinned} onClick={() => void io.pin(panel.id, !panel.pinned)}>
              {panel.pinned ? "Unpin" : "Pin"}
            </button>
            <button type="button" onClick={() => void io.close(panel.id)} disabled={false}>
              Close
            </button>
          </header>
          {panel.blocks.length === 0 ? <p className="muted">Nothing here yet.</p> : null}
          {panel.blocks.map((block) => (
            <Item key={block.id} panel={panel} item={block} io={io} />
          ))}
          {panel.notes.length > 0 ? (
            <ul className="agent-notes" aria-label="Notes from the agent">
              {panel.notes.map((n, i) => (
                <li key={i} data-tone={n.tone}>
                  Agent note: {n.text}
                </li>
              ))}
            </ul>
          ) : null}
        </article>
      ))}
    </section>
  );
}
