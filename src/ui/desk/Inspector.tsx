/** @jsxImportSource react */
/** The right-hand column: the one selected item, where it came from and its history (design 5.1). */
import type { ReactNode } from "react";
import type { NoteView } from "../../capabilities/notes.ts";
import type { Action, UiState } from "./attention.ts";
import { dayLabel, plainWords, type DeskState } from "./model.ts";
import { DEBUGGER_QUESTIONS, InspectPanel, type InspectIo } from "./Answers.tsx";
import { NoteBody, NoteEditor, TagList, type NoteIo, type OpenLink } from "./NoteEditor.tsx";
import { StateWord } from "./StateWord.tsx";
import type { ConversationRow } from "./conversation-model.ts";
import type { WorkspaceMove } from "../workspace/model.ts";
import { statusWord, sourceBadge, timeOf } from "./Conversation.tsx";

export type Selected =
  | { readonly kind: "note"; readonly note: NoteView }
  | { readonly kind: "case"; readonly case_ref: string; readonly purpose: string; readonly opened_at: string; readonly notes: readonly NoteView[] }
  | { readonly kind: "day"; readonly day: string; readonly count: number }
  | { readonly kind: "tag"; readonly name: string; readonly count: number }
  | { readonly kind: "activity"; readonly text: string; readonly at: string; readonly source: string }
  | { readonly kind: "row"; readonly row: ConversationRow; readonly move: WorkspaceMove | null };

export function findSelected(ui: UiState): Selected | null {
  const id = ui.selection;
  const data = ui.data;
  if (id === null) return null;
  if (id.startsWith("row:")) {
    const row = ui.rows.find((r) => r.row_id === id.slice(4));
    if (row === undefined) return null;
    const intent = row.refs.intent_id;
    return { kind: "row", row, move: intent === undefined ? null : (data?.home.moves.find((m) => m.intent_id === intent) ?? null) };
  }
  if (data === null) return null;
  if (id.startsWith("note:")) {
    const note = data.selected?.note.note_id === id ? data.selected.note : [...data.notes, ...data.caseNotes, ...(ui.results?.notes ?? [])].find((n) => n.note_id === id);
    return note ? { kind: "note", note } : null;
  }
  if (id.startsWith("case:")) {
    const found = data.cases.find((c) => c.case_ref === id) ?? ui.results?.cases.find((c) => c.case_ref === id);
    return found ? { kind: "case", ...found, notes: data.status.openCase?.case_ref === id ? data.caseNotes : [] } : null;
  }
  if (id.startsWith("day:")) {
    const day = id.slice(4);
    const found = data.days.find((d) => d.day === day) ?? ui.results?.days.find((d) => d.day === day);
    return found ? { kind: "day", ...found } : null;
  }
  if (id.startsWith("tag:")) {
    const name = id.slice(4);
    const found = data.tags.find((t) => t.name === name) ?? ui.results?.tags.find((t) => t.name === name);
    return found ? { kind: "tag", ...found } : null;
  }
  const activity = data.activity.find((a) => a.id === id);
  return activity ? { kind: "activity", text: activity.text, at: activity.at, source: activity.source } : null;
}

export interface InspectorProps {
  readonly ui: UiState;
  readonly dispatch: (action: Action) => void;
  readonly io: NoteIo & Partial<InspectIo>;
  readonly onLink: OpenLink;
}

export function Inspector({ ui, dispatch, io, onLink }: InspectorProps): ReactNode {
  const selected = findSelected(ui);
  const data = ui.data as DeskState | null;
  const timeZone = data?.timezone ?? "UTC";
  return (
    <aside className="inspector" aria-label="Inspector" data-inspector>
      <h2>Inspector</h2>
      {selected === null ? (
        <p className="empty">Nothing is selected. Press J or K to move through the list, then Enter to look at an item here.</p>
      ) : selected.kind === "note" ? (
        <NoteInspector note={selected.note} ui={ui} dispatch={dispatch} io={io} onLink={onLink} timeZone={timeZone} />
      ) : selected.kind === "row" ? (
        <RowInspector row={selected.row} move={selected.move} />
      ) : selected.kind === "case" ? (
        <div data-selected="case">
          <h3>{selected.purpose}</h3>
          <p className="muted">Opened {selected.opened_at.slice(0, 10)}</p>
          <PinControl ui={ui} dispatch={dispatch} id={selected.case_ref} kind="case" title={selected.purpose} content={selected.purpose} rev={selected.purpose} />
          <h4>Steps</h4>
          <p data-steps>
            <StateWord state="not recorded" /> The case keeper holds no steps for this case here yet, so none count as checked.
          </p>
          <h4>Notes on this case</h4>
          {selected.notes.length === 0 ? <p className="empty">No notes on this case. While it is the open case, every note you write is also placed on it.</p> : <ul>{selected.notes.map((n) => <li key={n.note_id}>{n.body.split("\n")[0]}</li>)}</ul>}
        </div>
      ) : selected.kind === "day" ? (
        <div data-selected="day">
          <h3>{dayLabel(selected.day)}</h3>
          <p>
            {selected.count} {selected.count === 1 ? "note" : "notes"} on this day.
          </p>
          <button type="button" onClick={() => dispatch({ type: "day", day: selected.day === data?.today ? null : selected.day })}>
            Open this day
          </button>
        </div>
      ) : selected.kind === "tag" ? (
        <div data-selected="tag">
          <h3>Tag: {selected.name}</h3>
          <p>
            {selected.count} {selected.count === 1 ? "note has" : "notes have"} this tag. A tag is only a label to find things by. It allows nothing and proves nothing.
          </p>
          <button type="button" onClick={() => dispatch({ type: "find", q: "", tag: selected.name })}>
            Show these notes
          </button>
        </div>
      ) : (
        <div data-selected="activity">
          <h3>{selected.source}</h3>
          <p>{selected.text}</p>
          <p className="muted">{selected.at}</p>
        </div>
      )}
      <InspectPanel
        inspection={ui.inspection}
        operations={DEBUGGER_QUESTIONS}
        libraryConnected={data?.status.parts.find((part) => part.name === "Reference library")?.connected === true}
        onAsk={(operation, query) => {
          dispatch({ type: "inspect-start", operation, query });
          void (io.inspect?.(operation, query) ?? Promise.resolve({ ok: false as const, message: "Asking is not set up in this window." })).then((result) =>
            dispatch(result.ok ? { type: "inspect-result", answer: result.answer, problem: null } : { type: "inspect-result", answer: null, problem: result.message }),
          );
        }}
      />
    </aside>
  );
}

function PinControl({ ui, dispatch, id, kind, title, content, rev }: { readonly ui: UiState; readonly dispatch: (a: Action) => void; readonly id: string; readonly kind: "note" | "case"; readonly title: string; readonly content: string; readonly rev: string }): ReactNode {
  const pin = ui.pins.find((p) => p.id === id);
  if (pin === undefined) {
    return (
      <button type="button" onClick={() => dispatch({ type: "pin", pin: { id, kind, title, content, source_rev: rev }, now: new Date() })}>
        Pin this
      </button>
    );
  }
  return (
    <p data-pin-state>
      Pinned on {pin.pinned_at.slice(0, 10)}. {pin.changed ? <StateWord state="changed since you looked" /> : null}{" "}
      <button type="button" onClick={() => dispatch({ type: "unpin", id })}>
        Unpin
      </button>
      {pin.changed ? (
        <button type="button" onClick={() => dispatch({ type: "pin", pin: { id, kind, title, content, source_rev: rev }, now: new Date() })}>
          Pin the new version
        </button>
      ) : null}
    </p>
  );
}

function NoteInspector({ note, ui, dispatch, io, onLink, timeZone }: { readonly note: NoteView; readonly ui: UiState; readonly dispatch: (a: Action) => void; readonly io: NoteIo; readonly onLink: OpenLink; readonly timeZone: string}): ReactNode {
  const title = note.body.split("\n").find((l) => l.trim() !== "")?.slice(0, 60) ?? "Note";
  return (
    <div data-selected="note">
      {ui.editing === note.note_id ? (
        <NoteEditor note={note} io={io} timeZone={timeZone} onDone={() => dispatch({ type: "edit", id: null })} />
      ) : (
        <>
          <NoteBody body={note.body} onLink={onLink} />
          <TagList tags={note.tags} />
          <p className="muted">
            Written {dayLabel(note.day)} by {note.author}. {note.rev === 1 ? "No edits." : `${note.rev - 1} ${note.rev === 2 ? "edit" : "edits"}, every earlier wording kept.`}
          </p>
          <p className="row">
            <button type="button" onClick={() => dispatch({ type: "edit", id: note.note_id })}>
              Edit
            </button>
            <button type="button" onClick={() => dispatch({ type: "open-layer", kind: "history" })}>
              Earlier wording ({note.rev})
            </button>
            <PinControl ui={ui} dispatch={dispatch} id={note.note_id} kind="note" title={title} content={note.body} rev={String(note.rev)} />
          </p>
          <p className="muted">This note is your own writing. It is not evidence, and it cannot make a check pass.</p>
        </>
      )}
    </div>
  );
}

const KIND_WORD: Readonly<Record<ConversationRow["kind"], string>> = {
  note: "A note",
  handoff: "A hand off",
  "handoff-proposal": "A suggested hand off",
  find: "A search",
  decision: "A decision",
  panel: "Something an agent put up",
  answer: "Your answer to an agent",
};

/** A move in the conversation: what decided, what recorded and what observed it. Anything missing says "Not seen yet", never "no". */
function RowInspector({ row, move }: { readonly row: ConversationRow; readonly move: WorkspaceMove | null }): ReactNode {
  const unseen = { state: "not seen yet", text: "Not seen yet" } as const;
  const claims = move ?? { decided: unseen, recorded: unseen, observed: unseen };
  return (
    <div data-selected="row" data-row-status={row.status}>
      <h3 dir="auto">{row.words}</h3>
      <p>
        <span className="cv-mark" data-status={row.status}>
          <span className="cv-dot" aria-hidden="true" />
          <span className="cv-mark-word">{statusWord(row)}</span>
        </span>{" "}
        <span className="cv-badge" data-source={row.source}>
          {sourceBadge(row)}
        </span>
      </p>
      <p>{row.outcome}</p>
      <dl className="claims" data-prefix="row">
        {([["decided", "Decided", claims.decided], ["recorded", "Recorded", claims.recorded], ["observed", "Observed", claims.observed]] as const).map(([key, label, claim]) => (
          <div key={key} className="claim" data-claim={key} data-state={claim.state}>
            <dt>{label}</dt>
            <dd>
              {claim.state === "not seen yet" ? <span className="chip-unseen">Not seen yet</span> : plainWords(claim.text)}
              {"raw" in claim && claim.raw !== undefined ? (
                <details>
                  <summary>Recorded reason</summary>
                  <code>{plainWords(claim.raw)}</code>
                </details>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
      <details className="row-details">
        <summary>Details</summary>
        <dl className="claims">
          <div className="claim">
            <dt>Kind</dt>
            <dd>{KIND_WORD[row.kind]}</dd>
          </div>
          <div className="claim">
            <dt>Made by</dt>
            <dd>{sourceBadge(row)}</dd>
          </div>
          <div className="claim">
            <dt>When</dt>
            <dd>
              <time dateTime={row.at}>{row.at.slice(0, 10)} {timeOf(row.at)}</time>
            </dd>
          </div>
        </dl>
      </details>
    </div>
  );
}
