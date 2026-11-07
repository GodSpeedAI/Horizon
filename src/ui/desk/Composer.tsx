/** @jsxImportSource react */
/**
 * The composer (design 5.3): one box. Before you send, the mode tag shows how your text will be taken. Tab changes it.
 * Write saves a note on today (and on the open case). Find searches in place. Ask says "Not connected" when there is no
 * reference library. Hand off arrives in a later stage. Typing @ offers a link to a case, a day or a recent note.
 */
import { useState, type ReactNode } from "react";
import { type Action, type Mode, type UiState } from "./attention.ts";
import { NOT_CONNECTED, parseFind } from "./model.ts";
import type { NoteIo } from "./NoteEditor.tsx";

const MODE_LABEL: Readonly<Record<Mode, string>> = { write: "Write", find: "Find", ask: "Ask" };
const PLACEHOLDER: Readonly<Record<Mode, string>> = {
  write: "Write a note. Enter saves it on today.",
  find: "Find notes, days, tags, cases. Try: invoice #urgent day:2026-11-04",
  ask: "Ask a question (needs a reference library)",
};

export interface Suggestion {
  readonly kind: "case" | "day" | "note";
  readonly ref: string;
  readonly label: string;
}

/** The text after the last @ before the cursor, or null when the cursor is not in a link being typed. */
export function atQuery(text: string, cursor: number): { readonly start: number; readonly query: string } | null {
  const before = text.slice(0, cursor);
  const match = /(?:^|\s)@([^\s@]*)$/.exec(before);
  return match ? { start: before.length - match[1]!.length - 1, query: match[1]!.toLowerCase() } : null;
}

export function suggestionsFor(ui: UiState, query: string): Suggestion[] {
  const data = ui.data;
  if (data === null) return [];
  const all: Suggestion[] = [
    { kind: "day", ref: data.today, label: `Today, ${data.today}` },
    ...data.cases.map((c): Suggestion => ({ kind: "case", ref: c.case_ref, label: c.purpose })),
    ...data.notes.slice(-5).map((n): Suggestion => ({ kind: "note", ref: n.note_id, label: n.body.split("\n")[0]!.slice(0, 50) })),
  ];
  return all.filter((s) => s.label.toLowerCase().includes(query)).slice(0, 6);
}

export function insertLink(text: string, start: number, cursor: number, s: Suggestion): { readonly text: string; readonly cursor: number } {
  const token = `[[${s.kind}:${s.ref}|${s.label.replace(/[\]|]/g, " ")}]] `;
  return { text: text.slice(0, start) + token + text.slice(cursor), cursor: start + token.length };
}

export interface ComposerProps {
  readonly ui: UiState;
  readonly dispatch: (action: Action) => void;
  readonly io: NoteIo;
}

export function Composer({ ui, dispatch, io }: ComposerProps): ReactNode {
  const { mode, text, selStart } = ui.composer;
  const data = ui.data;
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const at = atQuery(text, selStart);
  const suggestions = at && mode === "write" ? suggestionsFor(ui, at.query) : [];
  const askBlocked = mode === "ask";
  const empty = text.trim() === "";
  const reasonOff = askBlocked ? "Ask is not connected: no reference library is set up." : empty ? (mode === "write" ? "Type a note first." : "Type what to look for first.") : null;

  const send = async (): Promise<void> => {
    if (reasonOff !== null) {
      if (!askBlocked) dispatch({ type: "notice", text: mode === "write" ? "A note needs some words. Type something, then press Enter." : "Type what to look for first." });
      return;
    }
    if (mode === "find") {
      const parsed = parseFind(text);
      dispatch({ type: "find", q: parsed.q, day: parsed.day, tag: parsed.tag });
      return;
    }
    setBusy(true);
    const result = await io.saveNote({ body: text, case_ref: data?.status.openCase?.case_ref ?? null });
    setBusy(false);
    if (result.ok) {
      dispatch({ type: "sent" });
      dispatch({ type: "notice", text: "Saved." });
    } else dispatch({ type: "notice", text: result.message });
  };

  return (
    <form
      className="composer"
      aria-label="Composer"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <div className="composer-row">
        <button type="button" className="mode-tag" data-mode={mode} aria-label={`Mode: ${MODE_LABEL[mode]}. Press to change.`} onClick={() => dispatch({ type: "cycle-mode" })}>
          {MODE_LABEL[mode]} ▾
        </button>
        <label className="sr-only" htmlFor="composer-input">
          {MODE_LABEL[mode]}
        </label>
        <textarea
          id="composer-input"
          data-focus="composer"
          rows={2}
          dir="auto"
          value={text}
          placeholder={PLACEHOLDER[mode]}
          aria-describedby="composer-hint"
          onChange={(event) => {
            dispatch({ type: "typing", text: event.target.value, selStart: event.target.selectionStart, selEnd: event.target.selectionEnd });
            setActive(0);
          }}
          onSelect={(event) => {
            const t = event.currentTarget;
            if (t.selectionStart !== selStart) dispatch({ type: "typing", text: t.value, selStart: t.selectionStart, selEnd: t.selectionEnd });
          }}
          onKeyDown={(event) => {
            if (suggestions.length > 0 && at) {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setActive((n) => (n + (event.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length);
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                const next = insertLink(text, at.start, selStart, suggestions[active] ?? suggestions[0]!);
                dispatch({ type: "typing", text: next.text, selStart: next.cursor, selEnd: next.cursor });
                return;
              }
            }
            if (event.key === "Tab" && !event.shiftKey) {
              event.preventDefault();
              dispatch({ type: "cycle-mode" });
            } else if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button type="submit" className="primary" disabled={busy || askBlocked} aria-describedby="composer-hint">
          {mode === "write" ? "Save note" : mode === "find" ? "Find" : "Ask"}
        </button>
      </div>
      {suggestions.length > 0 ? (
        <ul className="suggestions" role="listbox" aria-label="Link to…">
          {suggestions.map((s, index) => (
            <li key={`${s.kind}:${s.ref}`} role="option" aria-selected={index === active}>
              <button
                type="button"
                data-active={index === active ? "true" : undefined}
                onClick={() => {
                  if (!at) return;
                  const next = insertLink(text, at.start, selStart, s);
                  dispatch({ type: "typing", text: next.text, selStart: next.cursor, selEnd: next.cursor });
                }}
              >
                {s.kind === "case" ? "Case" : s.kind === "day" ? "Day" : "Note"}: {s.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p id="composer-hint" className="muted" role="status">
        {mode === "write"
          ? `Saves a note on today (${data?.today ?? "…"})${data?.status.openCase ? ` and on the case "${data.status.openCase.purpose}"` : ""}. Enter saves, Shift+Enter adds a line, @ adds a link.`
          : mode === "find"
            ? "Searches notes, days, tags and cases. Enter shows the results in Explore."
            : `Ask: ${NOT_CONNECTED}. No reference library is set up, so questions cannot be answered. Use Find to search your own notes.`}{" "}
        Tab changes the mode. Esc leaves the box.
        {reasonOff !== null && !askBlocked ? ` (${reasonOff})` : ""}
      </p>
      {ui.notice !== null ? (
        <p role="alert" className="notice" data-notice>
          {ui.notice}
        </p>
      ) : null}
    </form>
  );
}

