/** @jsxImportSource react */
/**
 * The Conversation view (stage 8, design 3.5): the stored record of everything moved through the desk, newest at the bottom,
 * laid out like the operator's mock. A header, a "Try" line, the rows, and (drawn by Desk) the one composer pinned below.
 * Cards from agents and moves waiting for you are drawn inline. Nothing here sends: Confirm only opens the preview.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { conversationWaiting, type Action, type UiState } from "./attention.ts";
import type { ConversationRow, RowStatus } from "./conversation-model.ts";
import { PanelCard, type PanelsIo } from "./Panels.tsx";
import type { BlockCtx } from "./blocks/index.tsx";

export const STATUS_WORD: Readonly<Record<RowStatus, string>> = { done: "Done", waiting: "Waiting for you", refused: "Refused", unseen: "Not seen yet" };
export const DEFAULT_PAGE_AGENT = "Agent on this page";

/** Who made the move, in words: You, Agent (with its name), or Agent on this page. */
export function sourceBadge(row: Pick<ConversationRow, "source" | "agent_name">): string {
  if (row.source === "you") return "You";
  if (row.source === "agent") return row.agent_name ? `Agent · ${row.agent_name}` : "Agent";
  return row.agent_name && row.agent_name !== DEFAULT_PAGE_AGENT ? `${DEFAULT_PAGE_AGENT} · ${row.agent_name}` : DEFAULT_PAGE_AGENT;
}

export const timeOf = (at: string): string => {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export const isWaitingMove = (row: ConversationRow): boolean => row.status === "waiting" && (row.kind === "handoff-proposal" || row.kind === "handoff");

/** What Confirm asks the composer for: the move's words, and its draft when it has one. Without a draft the composer makes one. */
export const requestFor = (row: ConversationRow): { readonly words: string; readonly draftId?: string } => (row.refs.draft_id === undefined ? { words: row.words } : { words: row.words, draftId: row.refs.draft_id });

export interface ConversationIo {
  readonly discard: (rowId: string) => Promise<{ readonly ok: boolean; readonly message: string }>;
}

export interface ConversationViewProps {
  readonly ui: UiState;
  readonly dispatch: (action: Action) => void;
  readonly panels: PanelsIo;
  readonly conversation: ConversationIo;
  /** Confirm on a waiting move: puts the words in the box and shows the preview. */
  readonly onConfirm: (row: ConversationRow) => void;
  /** A button or form inside an agent's card: opens a preview in the box, never sends. */
  readonly onPreviewWords: (words: string) => void;
}

function StatusMark({ status }: { readonly status: RowStatus }): ReactNode {
  return (
    <span className="cv-mark" data-status={status}>
      <span className="cv-dot" aria-hidden="true" />
      <span className="cv-mark-word">{STATUS_WORD[status]}</span>
    </span>
  );
}

function MoveCard({ row, onConfirm, onDiscard, busy }: { readonly row: ConversationRow; readonly onConfirm: () => void; readonly onDiscard: () => void; readonly busy: boolean }): ReactNode {
  const fromAgent = row.source !== "you";
  const headId = `${row.row_id}-h`;
  return (
    <article className="cv-card move-card" aria-labelledby={headId} data-waiting-move={row.kind}>
      <p className="cv-eyebrow">{fromAgent ? "An agent suggests" : "Needs your OK"}</p>
      <h2 id={headId} className="cv-card-title">
        {fromAgent ? "Hand off this work?" : "Finish this hand off?"}
      </h2>
      <p className="cv-words" dir="auto">
        {row.words}
      </p>
      <p className="muted">{row.outcome}</p>
      <div className="row cv-actions">
        <button type="button" className="primary" onClick={onConfirm} disabled={busy} data-confirm-move>
          Confirm
        </button>
        <button type="button" onClick={onDiscard} disabled={busy} data-discard-move>
          Discard
        </button>
      </div>
      <p className="cv-note muted">Confirm shows you exactly what will happen first. Nothing is sent until you confirm there.</p>
    </article>
  );
}

export function ConversationView({ ui, dispatch, panels, conversation, onConfirm, onPreviewWords }: ConversationViewProps): ReactNode {
  const data = ui.data;
  const rows = ui.rows;
  const presenting = data?.status.presenting === true;
  const [problem, setProblem] = useState<string | null>(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [away, setAway] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const stuck = useRef(true);
  const seen = useRef(rows.length);
  const open = data?.panels?.open ?? [];
  const needsYou = conversationWaiting(rows, open);
  const stepWaits = data?.panels?.waiting ?? [];

  // Newest at the bottom. The view follows new rows unless you scrolled up; then a button says there is more below.
  useEffect(() => {
    const el = listRef.current;
    if (el === null) return;
    if (stuck.current) {
      el.scrollTop = el.scrollHeight;
      setAway(false);
    } else if (rows.length > seen.current) setAway(true);
    seen.current = rows.length;
  }, [rows]);
  const onScroll = (): void => {
    const el = listRef.current;
    if (el === null) return;
    stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (stuck.current) setAway(false);
  };
  const toBottom = (): void => {
    const el = listRef.current;
    stuck.current = true;
    setAway(false);
    if (el !== null) el.scrollTop = el.scrollHeight;
  };

  const discard = async (row: ConversationRow): Promise<void> => {
    setBusyRow(row.row_id);
    const result = await conversation.discard(row.row_id);
    setBusyRow(null);
    setProblem(result.ok ? null : result.message);
  };
  const tryOut = (phrase: string): void => {
    dispatch({ type: "typing", text: phrase, selStart: phrase.length, selEnd: phrase.length });
    dispatch({ type: "focus", target: "composer" });
  };
  const ctxFor = (): { onAction: BlockCtx["onAction"]; onSubmit: BlockCtx["onSubmit"] } => ({
    onAction: (action) => onPreviewWords(action.label),
    onSubmit: (_form, values) => onPreviewWords(Object.values(values).map(String).join(" ").trim()),
  });
  const openCase = data?.status.openCase?.purpose ?? "No case is open";
  return (
    <section aria-labelledby="conversation-h" className="view cv-view" data-view-id="conversation">
      <header className="cv-head">
        <p className="cv-meta">{data?.status.setup ?? "No setup chosen"} setup</p>
        <h1 id="conversation-h" tabIndex={-1}>
          Conversation
        </h1>
        <p className="cv-sub">
          <span>{data?.status.openCase ? `Open case: ${openCase}` : openCase}</span>
          <span className="cv-needs" data-needs-you={needsYou} role="status">
            Needs you ({needsYou})
          </span>
        </p>
      </header>
      <p className="cv-try" data-try>
        <span className="cv-meta">Try</span>
        {["/find invoice", "/handoff Fix the checkout total", "/note Call the supplier"].map((phrase) => (
          <button key={phrase} type="button" className="cv-try-btn" onClick={() => tryOut(phrase)}>
            {phrase}
          </button>
        ))}
      </p>
      {stepWaits.map((w) => {
        const title = open.find((p) => p.id === w.panel)?.title;
        return (
          <p key={w.step} className="notice" role="status" data-waiting-step={w.step}>
            Waiting for the agent to reply to your answer{title === undefined ? "" : ` about "${title}"`}. That step cannot be accepted until it does.{" "}
            <button type="button" onClick={() => void panels.stopWaiting(w.step)}>
              Stop waiting
            </button>
          </p>
        );
      })}
      {problem !== null ? (
        <p role="alert" className="error">
          {problem}
        </p>
      ) : null}
      <div className="cv-rows-wrap" ref={listRef} onScroll={onScroll}>
        {rows.length === 0 ? (
          <p className="empty">Nothing has happened yet. Write a note or hand off some work in the box below and it will show up here.</p>
        ) : (
          <ol className="cv-rows" aria-label="Conversation, oldest first" data-focus="list" tabIndex={-1}>
            {rows.map((row, index) => {
              const panel = row.kind === "panel" ? open.find((p) => p.id === row.refs.panel_id) : undefined;
              const selected = ui.selection === `row:${row.row_id}`;
              return (
                <li key={row.row_id} className="cv-row" data-row-kind={row.kind} data-status={row.status} data-cursor={ui.cursor === index && ui.focus === "list" ? "true" : undefined}>
                  <button type="button" className="cv-line" aria-current={selected ? "true" : undefined} onClick={() => dispatch({ type: "select", id: `row:${row.row_id}` })} data-row-select>
                    <StatusMark status={row.status} />
                    <span className="cv-words" dir="auto">
                      {row.words}
                    </span>
                    <span className="cv-badge" data-source={row.source}>
                      {sourceBadge(row)}
                    </span>
                    <time className="cv-meta" dateTime={row.at}>
                      {timeOf(row.at)}
                    </time>
                  </button>
                  {panel === undefined ? <p className="cv-outcome" data-unseen={row.status === "unseen" ? "yes" : undefined}>{row.outcome}</p> : null}
                  {panel !== undefined ? <PanelCard panel={panel} io={panels} presenting={presenting} {...ctxFor()} /> : null}
                  {isWaitingMove(row) ? <MoveCard row={row} busy={busyRow === row.row_id} onConfirm={() => onConfirm(row)} onDiscard={() => void discard(row)} /> : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {away ? (
        <button type="button" className="new-items cv-below" onClick={toBottom}>
          New below
        </button>
      ) : null}
    </section>
  );
}
