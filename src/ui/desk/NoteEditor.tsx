/** @jsxImportSource react */
/**
 * Notes are written by people and never shown by agents, so the desk draws them with its own components (ruling CF10):
 * the page-part vocabulary has no note part. Every piece of text goes through React's escaping; nothing is injected as markup.
 */
import { useState, type ReactNode } from "react";
import type { NoteRevision, NoteView } from "../../capabilities/notes.ts";
import { timeLabel } from "./model.ts";
import type { LinkKind } from "../../domain/note.ts";

export interface NoteIo {
  readonly saveNote: (input: { body: string; note_id?: string; tags?: string[]; case_ref?: string | null }) => Promise<{ ok: true; note: NoteView; recorded_words?: string } | { ok: false; message: string }>;
}

const TOKEN = /\[\[(case|step|session|record|day|note):([^|\]]{1,300})\|([^\]]{0,200})\]\]/g;

export type OpenLink = (kind: LinkKind, ref: string) => void;

function Line({ text, onLink }: { readonly text: string; readonly onLink: OpenLink }): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const [, kind, ref, label] = match as unknown as [string, LinkKind, string, string];
    parts.push(
      <button key={`${match.index}`} type="button" className="link-box" data-link-kind={kind} onClick={() => onLink(kind, ref)}>
        {label || ref}
      </button>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/** The body as paragraphs and checklists. A checklist item says "To do" or "Done" in words. */
export function NoteBody({ body, onLink }: { readonly body: string; readonly onLink: OpenLink }): ReactNode {
  return (
    <div className="note-body" dir="auto">
      {body.split("\n").map((line, index) => {
        const item = /^\s*[-*] \[( |x|X)\] (.*)$/.exec(line);
        if (item) {
          const done = item[1] !== " ";
          return (
            <p key={index} className="check-item" data-done={done ? "yes" : "no"}>
              <span className="check-word">{done ? "Done:" : "To do:"}</span> <Line text={item[2] ?? ""} onLink={onLink} />
            </p>
          );
        }
        return line.trim() === "" ? <br key={index} /> : (
          <p key={index}>
            <Line text={line} onLink={onLink} />
          </p>
        );
      })}
    </div>
  );
}

export function TagList({ tags }: { readonly tags: readonly string[] }): ReactNode {
  if (tags.length === 0) return null;
  return (
    <ul className="tags" aria-label="Tags">
      {tags.map((tag) => (
        <li key={tag}>Tag: {tag}</li>
      ))}
    </ul>
  );
}

/** Edit one note: a new revision is saved and the earlier wording is kept. */
export function NoteEditor({ note, io, timeZone, onDone }: { readonly note: NoteView; readonly io: NoteIo; readonly timeZone: string; readonly onDone: (saved: NoteView | null) => void }): ReactNode {
  const [body, setBody] = useState(note.body);
  const [tags, setTags] = useState(note.tags.join(", "));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (): Promise<void> => {
    setBusy(true);
    const result = await io.saveNote({ note_id: note.note_id, body, tags: tags.split(/[,\s]+/).filter(Boolean) });
    setBusy(false);
    if (result.ok) onDone(result.note);
    else setMessage(result.message);
  };
  return (
    <form
      className="note-editor"
      aria-label={`Edit the note from ${timeLabel(note.created_at, timeZone)}`}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label>
        Note
        <textarea value={body} rows={6} dir="auto" onChange={(event) => setBody(event.target.value)} autoFocus />
      </label>
      <label>
        Tags (separate with commas)
        <input type="text" value={tags} onChange={(event) => setTags(event.target.value)} />
      </label>
      <p className="muted">Saving keeps the earlier wording. A tag is a label to find things by; it does not approve or prove anything.</p>
      {message !== null ? (
        <p role="alert" className="error">
          {message}
        </p>
      ) : null}
      <div className="row">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={() => onDone(null)}>
          Cancel (Esc)
        </button>
      </div>
    </form>
  );
}

/** One note as it reads in a list. */
export function NoteCard({ note, timeZone, onLink }: { readonly note: NoteView; readonly timeZone: string; readonly onLink: OpenLink }): ReactNode {
  return (
    <article className="note" data-note-id={note.note_id}>
      <p className="meta">
        <time dateTime={note.created_at}>{timeLabel(note.created_at, timeZone)}</time> · {note.rev > 1 ? `edited, revision ${note.rev}` : "first version"}
        {note.cases.length > 0 ? " · on a case" : ""}
      </p>
      <NoteBody body={note.body} onLink={onLink} />
      <TagList tags={note.tags} />
    </article>
  );
}

export function RevisionList({ history, timeZone, onLink }: { readonly history: readonly NoteRevision[]; readonly timeZone: string; readonly onLink: OpenLink }): ReactNode {
  return (
    <ol className="revisions">
      {history.map((revision) => (
        <li key={revision.rev}>
          <p className="meta">
            Revision {revision.rev} · {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(revision.at))} · by {revision.author}
          </p>
          <NoteBody body={revision.body} onLink={onLink} />
        </li>
      ))}
    </ol>
  );
}
