/** @jsxImportSource react */
/** The left column: four views and the Days, Cases and Tags lists (design 5.1). */
import { useState, type ReactNode } from "react";
import { conversationWaiting, interruptionsOf, type Action, type UiState } from "./attention.ts";
import { VIEWS, dayLabel, type DeskState } from "./model.ts";

export function Nav({ ui, data, dispatch }: { readonly ui: UiState; readonly data: DeskState | null; readonly dispatch: (action: Action) => void }): ReactNode {
  const counts = { ...interruptionsOf(data).counts, conversation: conversationWaiting(ui.rows, data?.panels?.open ?? []) };
  // On a phone the Days, Cases and Tags lists fold away so the composer stays within reach.
  const [open, setOpen] = useState(false);
  return (
    <nav className="nav" aria-label="Views and lists">
      <ul className="views">
        {VIEWS.map((view) => (
          <li key={view.id}>
            <button type="button" aria-current={ui.view === view.id ? "page" : undefined} data-view={view.id} title={`${view.asks} (Ctrl+${view.key})`} onClick={() => dispatch({ type: "view", view: view.id })}>
              {view.label}
              {counts[view.id] > 0 ? <span className="count" data-count={view.id}> ({counts[view.id]})</span> : null}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="nav-toggle" aria-expanded={open} aria-controls="nav-lists" onClick={() => setOpen(!open)}>
        {open ? "Hide days, cases and tags" : "Days, cases and tags"}
      </button>
      <div id="nav-lists" className="nav-lists" data-open={open ? "true" : "false"}>
      <h2>Days</h2>
      {data === null || data.days.length === 0 ? (
        <p className="empty">No days yet. Write a note in the box below to start today.</p>
      ) : (
        <ul className="lists" data-list="days">
          {data.days.slice(0, 14).map((d) => (
            <li key={d.day}>
              <button type="button" aria-current={ui.view === "today" && (ui.day ?? data.today) === d.day ? "date" : undefined} onClick={() => dispatch({ type: "day", day: d.day === data.today ? null : d.day })}>
                {d.day} <span className="count">({d.count})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <h2>Cases</h2>
      {data === null || data.cases.length === 0 ? (
        <p className="empty">No case is open. <a href="/workspace#getting-started">Open a case</a> to give your work a goal.</p>
      ) : (
        <ul className="lists" data-list="cases">
          {data.cases.slice(0, 12).map((c) => (
            <li key={c.case_ref}>
              <button type="button" title={c.purpose} onClick={() => dispatch({ type: "select", id: c.case_ref })}>
                {c.purpose}
              </button>
            </li>
          ))}
        </ul>
      )}
      <h2>Tags</h2>
      {data === null || data.tags.length === 0 ? (
        <p className="empty">No tags yet. Add one to a note when you edit it.</p>
      ) : (
        <ul className="lists" data-list="tags">
          {data.tags.map((t) => (
            <li key={t.name}>
              <button type="button" onClick={() => dispatch({ type: "find", q: "", tag: t.name })}>
                {t.name} <span className="count">({t.count})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {data !== null && ui.day !== null && ui.day !== data.today ? <p className="muted">Showing {dayLabel(ui.day)}.</p> : null}
      </div>
    </nav>
  );
}
