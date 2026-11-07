/** @jsxImportSource react */
/** Explore (design 5.1): notes, cases, days, tags and records in one searchable place. Results appear in place. */
import type { ReactNode } from "react";
import { NoteCard } from "../NoteEditor.tsx";
import { NOT_CONNECTED } from "../model.ts";
import type { ViewProps } from "./Today.tsx";

export function Explore({ ui, data, dispatch, onLink }: ViewProps): ReactNode {
  const results = ui.results;
  const timeZone = data?.timezone ?? "UTC";
  const filters = [ui.find.q !== "" ? `words: ${ui.find.q}` : null, ui.find.day !== null ? `day: ${ui.find.day}` : null, ui.find.tag !== null ? `tag: ${ui.find.tag}` : null].filter((f): f is string => f !== null);
  let index = 0;
  const row = (id: string, content: ReactNode): ReactNode => {
    const mine = index;
    index += 1;
    return (
      <li key={id} data-cursor={ui.cursor === mine ? "true" : undefined} aria-current={ui.cursor === mine ? "true" : undefined} onClick={() => dispatch({ type: "select", id })}>
        {content}
      </li>
    );
  };
  return (
    <section aria-labelledby="explore-h" className="view" data-view-id="explore">
      <h1 id="explore-h">Explore</h1>
      <p className="muted">
        {filters.length === 0 ? "Everything you may see. To search, press Ctrl+K, switch the box to Find and type." : `Looking for ${filters.join(", ")}.`}
        {filters.length > 0 ? (
          <>
            {" "}
            <button type="button" onClick={() => dispatch({ type: "find", q: "" })}>
              Clear the search
            </button>
          </>
        ) : null}
      </p>
      {results === null ? (
        <p role="status">Looking…</p>
      ) : (
        <div data-focus="list" tabIndex={0} aria-label="Search results" className="items-wrap">
          <h2>Notes ({results.notes.length})</h2>
          {results.notes.length === 0 ? <p className="empty">No notes match. Try fewer words, or write one: press Ctrl+K and type.</p> : <ol className="items">{results.notes.map((n) => row(n.note_id, <NoteCard note={n} timeZone={timeZone} onLink={onLink} />))}</ol>}
          <h2>Cases ({results.cases.length})</h2>
          {results.cases.length === 0 ? <p className="empty">No case matches. <a href="/workspace#getting-started">Open a case</a> to give your work a goal.</p> : <ul className="items">{results.cases.map((c) => row(c.case_ref, c.purpose))}</ul>}
          <h2>Days ({results.days.length})</h2>
          {results.days.length === 0 ? <p className="empty">No day matches.</p> : <ul className="items">{results.days.map((d) => row(`day:${d.day}`, `${d.day} — ${d.count} ${d.count === 1 ? "note" : "notes"}`))}</ul>}
          <h2>Tags ({results.tags.length})</h2>
          {results.tags.length === 0 ? <p className="empty">No tag matches. Tags are added when you edit a note.</p> : <ul className="items">{results.tags.map((t) => row(`tag:${t.name}`, `${t.name} — ${t.count} ${t.count === 1 ? "note" : "notes"}`))}</ul>}
          <h2>Records</h2>
          <p className={results.records.connected ? undefined : "empty"}>{results.records.connected ? <a href="/workspace/compare">{results.records.words}</a> : `Records: ${NOT_CONNECTED}. Sessions from other AI coding tools cannot be searched here.`}</p>
        </div>
      )}
    </section>
  );
}
