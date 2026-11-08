/** @jsxImportSource react */
/**
 * What an agent put in front of you, drawn as one card in the conversation (stage 8). You can answer its questions, pin it so it
 * stays open, and close it. A card from an agent never moves what you are reading. It has no list of its own: the conversation
 * places it where it was put up. A card with no open question folds to its title and summary. Every piece of text is drawn as text.
 */
import { answerEcho, WAITING_FOR_AGENT } from "./conversation-model.ts";
import { useState, type ReactNode } from "react";
import { BlockGuard, Question, drawBlock, type BlockCtx } from "./blocks/index.tsx";
import { CtxContext } from "./blocks/ctx.tsx";
import { MAX_OPEN_PANELS, hasOpenAsk, type Panel, type PanelBlock } from "./panels-model.ts";

export { MAX_OPEN_PANELS };

export interface PanelsIo {
  readonly answer: (input: { panel: string; ask: string; outcome: "answered" | "deferred" | "cancelled"; value?: string | readonly string[]; note?: string; version?: string }) => Promise<{ readonly ok: boolean; readonly message: string }>;
  readonly pin: (id: string, pinned: boolean) => Promise<void>;
  readonly close: (id: string) => Promise<void>;
  readonly stopWaiting: (step: string) => Promise<{ readonly ok: boolean; readonly message: string }>;
}

/** The grammar's own drawer for each thing a card holds. A question uses the question drawer, with the answer and withdrawal state of that card. */
function Item({ panel, item, io, ctx }: { readonly panel: Panel; readonly item: PanelBlock; readonly io: PanelsIo; readonly ctx: BlockCtx }): ReactNode {
  // A part that passed the grammar whole is drawn by its own drawer, whatever its type. A question's answer state comes from the card.
  if (item.block !== undefined) return drawBlock(item.block, ctx);
  switch (item.kind) {
    case "text":
      return drawBlock({ type: "callout", id: item.id, tone: item.tone, text: item.label !== null ? `${item.label}: ${item.text}` : item.text }, ctx);
    case "rows":
      return drawBlock({ type: "table", id: item.id, columns: item.columns, rows: item.rows }, ctx);
    case "question":
      return (
        <CtxContext.Provider value={ctx}>
          <BlockGuard>
            <Question item={item} state={{ answered: item.answered, withdrawn: item.withdrawn ?? null }} />
          </BlockGuard>
        </CtxContext.Provider>
      );
    case "unavailable":
      return drawBlock({ type: "unknown" }, ctx);
  }
  void panel;
  void io;
}

const clipWords = (text: string, max: number): string => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

/** One plain sentence for a folded card: the first text the agent wrote in it. */
export function summaryOf(panel: Panel): string {
  const first = panel.blocks.find((b): b is Extract<PanelBlock, { kind: "text" }> => b.kind === "text");
  return first === undefined ? "Nothing needs your answer here." : clipWords(first.text.replace(/\s+/g, " ").trim(), 140);
}

/** What you said to each answered question and where the agent took it, for the folded line. */
export function echoesOf(panel: Panel): string[] {
  const out: string[] = [];
  for (const b of panel.blocks) {
    if (b.kind !== "question" || b.answered === null || (b.withdrawn ?? null) !== null) continue;
    const say = answerEcho({ ...(b.input === undefined ? {} : { input: b.input }), options: b.options }, b.answered.outcome as "answered", b.answered.value);
    const routed = typeof b.answered.routed_as === "string" && b.answered.routed_as.trim() !== "" ? b.answered.routed_as.trim() : null;
    out.push(`${say} ${routed !== null ? `The agent says it took it to: ${routed}` : `${WAITING_FOR_AGENT}.`}`);
  }
  return out;
}

/** How many questions across these cards are still waiting for you. */
export const openAsksIn = (panels: readonly Panel[]): number => panels.reduce((n, p) => n + p.blocks.filter((b) => b.kind === "question" && hasOpenAsk({ ...p, blocks: [b] })).length, 0);

/**
 * The one place an agent's card is drawn. A card with a question open, or one you pinned, stays open. Any other folds to its title
 * and summary and opens when you choose it.
 */
export interface PanelCardProps {
  readonly panel: Panel;
  readonly io: PanelsIo;
  readonly presenting?: boolean;
  /** A button inside a part, or a form: each only opens the matching preview. Nothing here sends. */
  readonly onAction?: BlockCtx["onAction"];
  readonly onSubmit?: BlockCtx["onSubmit"];
  readonly openRef?: BlockCtx["openRef"];
}

export function PanelCard({ panel, io, presenting = false, onAction = () => undefined, onSubmit = () => undefined, openRef = () => undefined }: PanelCardProps): ReactNode {
  const needsYou = hasOpenAsk(panel);
  // What came back from the last answer: a refusal, or a warning that it was sent but not recorded. It stays on the card.
  const [outcome, setOutcome] = useState<{ readonly ok: boolean; readonly message: string } | null>(null);
  const ctx: BlockCtx = {
    presenting,
    onAnswer: (askId, outcome, value, note) => {
      const ask = panel.blocks.find((b) => b.kind === "question" && b.id === askId);
      const listed = ask?.kind === "question" && ask.input === "multiselect";
      setOutcome(null);
      void io
        .answer({ panel: panel.id, ask: askId, outcome, ...(ask?.kind === "question" && ask.version !== undefined ? { version: ask.version } : {}), ...(value === undefined ? {} : { value: listed ? value.split(",").filter((v) => v !== "") : value }), ...(note === undefined ? {} : { note }) })
        .then(setOutcome, () => setOutcome({ ok: false, message: "The answer could not be sent. Nothing was changed. Try again." }));
    },
    onSubmit,
    onAction,
    openRef,
    askState: (askId) => {
      const ask = panel.blocks.find((b) => b.kind === "question" && b.id === askId);
      return ask?.kind === "question" ? { answered: ask.answered, withdrawn: ask.withdrawn ?? null } : undefined;
    },
    hideNames: (text) => text,
    mediaUrl: () => null,
  };
  const body = (
    <>
      {panel.blocks.length === 0 ? <p className="muted">Nothing here yet.</p> : null}
      {panel.blocks.map((block) => (
        <Item key={block.id} panel={panel} item={block} io={io} ctx={ctx} />
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
      <div className="row cv-actions">
        <button type="button" aria-pressed={panel.pinned} onClick={() => void io.pin(panel.id, !panel.pinned)}>
          {panel.pinned ? "Unpin" : "Pin"}
        </button>
        <button type="button" onClick={() => void io.close(panel.id)}>
          Close
        </button>
      </div>
    </>
  );
  const heading = (
    <h2 id={`${panel.id}-ph`} className="cv-card-title">
      {panel.title}
    </h2>
  );
  return (
    <article className="cv-card panel-card" data-panel-id={panel.id} data-pinned={panel.pinned ? "yes" : "no"} data-needs-you={needsYou ? "yes" : "no"} data-folded={needsYou || panel.pinned ? "no" : "yes"} aria-labelledby={`${panel.id}-ph`}>
      {needsYou || panel.pinned ? (
        <>
          <p className="cv-eyebrow">{needsYou ? "Needs you" : "From an agent"}</p>
          {heading}
          {body}
        </>
      ) : (
        <details>
          <summary>
            <span className="cv-eyebrow">From an agent</span> {heading} <span className="muted">{summaryOf(panel)}</span>{echoesOf(panel).map((e, i) => <span key={i} className="muted cv-echo" data-echo> {e}</span>)}
          </summary>
          {body}
        </details>
      )}
      {outcome !== null && outcome.message !== "" ? (
        <p className={outcome.ok ? "muted" : "error"} role={outcome.ok ? "status" : "alert"} data-answer-outcome={outcome.ok ? "ok" : "refused"}>
          {outcome.message}
        </p>
      ) : null}
    </article>
  );
}
