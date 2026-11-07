/** @jsxImportSource react */
/** Today (design 6.3): the day's notes and activity in time order, each source named, and an empty day that says why. */
import type { ReactNode } from "react";
import { newCount, shownCount, type Action, type UiState } from "../attention.ts";
import { activityReason, dayLabel, emptyDayReason, timeLabel, type DeskState } from "../model.ts";
import { NoteCard, type OpenLink } from "../NoteEditor.tsx";
import { StateWord } from "../StateWord.tsx";
import { GettingStarted, Moves, Receipt } from "./Home.tsx";

export interface ViewProps {
  readonly ui: UiState;
  readonly data: DeskState | null;
  readonly dispatch: (action: Action) => void;
  readonly onLink: OpenLink;
}

export function Today({ ui, data, dispatch, onLink }: ViewProps): ReactNode {
  if (data === null) {
    return (
      <section aria-labelledby="today-h">
        <h1 id="today-h">Today</h1>
        <p role="status">{emptyDayReason({} as DeskState, false)}</p>
      </section>
    );
  }
  const day = ui.day ?? data.today;
  const isToday = day === data.today;
  const total = data.notes.length + data.activity.length;
  const visibleNotes = data.notes.slice(0, shownCount(ui.feed, data.notes.length));
  const fresh = newCount(ui.feed, data.notes.length);
  const reason = emptyDayReason(data, true);
  return (
    <section aria-labelledby="today-h" className="view" data-view-id="today">
      <h1 id="today-h">{isToday ? "Today" : dayLabel(day)}</h1>
      <p className="muted">
        {dayLabel(day)} ({data.timezone})
        {!isToday ? (
          <>
            {" "}
            <button type="button" onClick={() => dispatch({ type: "day", day: null })}>
              Back to today
            </button>
          </>
        ) : null}
      </p>
      {data.home.receipt !== null ? <Receipt receipt={data.home.receipt} dispatch={dispatch} /> : null}
      {data.home.onboarding.visible ? <GettingStarted home={data.home} firstMove={ui.firstMove} /> : null}
      {data.home.onboarding.skipped ? (
        <form method="post" action="/workspace/onboarding/resume">
          <button type="submit">Show getting started again</button>
        </form>
      ) : null}
      {ui.pins.length > 0 ? (
        <div className="pins" role="region" aria-label="Pinned">
          <h2>Pinned</h2>
          <ul>
            {ui.pins.map((pin) => (
              <li key={pin.id} data-pin={pin.id}>
                <strong>{pin.title}</strong> — pinned {pin.pinned_at.slice(0, 10)}
                {pin.changed ? (
                  <>
                    {" "}
                    <StateWord state="changed since you looked" />
                  </>
                ) : null}
                <p className="pin-content">{pin.content}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <h2>Notes</h2>
      <ol
        className="items"
        tabIndex={0}
        data-focus="list"
        aria-label={`Notes for ${day}`}
        onScroll={(event) => {
          const el = event.currentTarget;
          dispatch({ type: "scrolled", atBottom: el.scrollHeight - el.scrollTop - el.clientHeight < 8, total: data.notes.length });
        }}
      >
        {visibleNotes.map((note, index) => (
          <li key={note.note_id} data-cursor={ui.cursor === index ? "true" : undefined} aria-current={ui.cursor === index ? "true" : undefined} onClick={() => dispatch({ type: "select", id: note.note_id })}>
            <NoteCard note={note} timeZone={data.timezone} onLink={onLink} />
          </li>
        ))}
      </ol>
      {fresh > 0 ? (
        <button type="button" className="new-items" onClick={() => dispatch({ type: "jump-to-new" })}>
          {fresh} new ↓
        </button>
      ) : null}
      {data.notes.length === 0 ? (
        <p className="empty">{isToday ? "No notes yet today. Click the box below, type a thought and press Enter. It is saved on today." : "No notes on this day."}</p>
      ) : null}
      <h2>Activity</h2>
      {data.activity.length > 0 ? (
        <ul className="activity">
          {data.activity.map((item, index) => {
            const at = data.notes.length + index;
            return (
              <li key={item.id} data-cursor={ui.cursor === at ? "true" : undefined} aria-current={ui.cursor === at ? "true" : undefined} onClick={() => dispatch({ type: "select", id: item.id })}>
                <time dateTime={item.at}>{timeLabel(item.at, data.timezone)}</time> · {item.source}: {item.text}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="empty" data-activity-reason data-empty-reason={total === 0 ? "" : undefined}>
          {total === 0 && reason !== null ? reason : activityReason(data)}
        </p>
      )}
      <Moves moves={data.home.moves} assurance={data.home.assurance} />
    </section>
  );
}
