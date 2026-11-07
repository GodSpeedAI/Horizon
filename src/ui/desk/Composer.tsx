/** @jsxImportSource react */
/**
 * The composer (design 5.3): one box. Before you send, the mode tag shows how your text will be taken. Tab changes it.
 * Write saves a note on today (and on the open case). Find searches in place. Ask says "Not connected" when there is no
 * reference library. Hand off turns your words into a step in a case: it shows a preview first, and nothing is sent until you confirm. Typing @ offers a link to a case, a day or a recent note.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { type Action, type Mode, type UiState } from "./attention.ts";
import { NOT_CONNECTED, parseFind } from "./model.ts";
import type { NoteIo } from "./NoteEditor.tsx";
import { Words } from "./Words.tsx";

const MODE_LABEL: Readonly<Record<Mode, string>> = { write: "Write", find: "Find", ask: "Ask", handoff: "Hand off" };
const PLACEHOLDER: Readonly<Record<Mode, string>> = {
  write: "Write a note. Enter saves it on today.",
  find: "Find notes, days, tags, cases. Try: invoice #urgent day:2026-11-04",
  ask: "Ask a question (needs a reference library)",
  handoff: "Say what you want done. It becomes a step in a case.",
};

export interface HandoffPreview {
  readonly draft_id: string;
  readonly case_id: string;
  readonly case_title: string;
  readonly step_name: string;
  readonly step_id: string;
  readonly check: string;
  readonly plan_precondition: { readonly ref: string; readonly expected_digest: string };
  readonly agent: { readonly offered: boolean; readonly words: string };
  /** Set when the step is a review: the steps with finished work that it can check. */
  readonly review?: { readonly reviewable: readonly { readonly step_id: string; readonly name: string }[] } | null;
}
export interface DraftInfo {
  readonly draftId: string;
  readonly text: string;
  readonly mode: string;
  readonly agent: { readonly offered: boolean; readonly words: string };
}
export interface HandoffIo {
  readonly draft: () => Promise<DraftInfo | null>;
  readonly saveDraft: (input: { draft_id: string; text: string }) => void;
  readonly preview: (input: { draft_id: string; text: string; case_id?: string; review?: { step_id?: string } }) => Promise<{ readonly ok: true; readonly preview: HandoffPreview } | { readonly ok: false; readonly message: string }>;
  readonly send: (input: { draft_id: string; text: string; case_id: string; plan_precondition: HandoffPreview["plan_precondition"]; assign: boolean; review?: { step_id: string } }) => Promise<{ readonly ok: true; readonly message: string; readonly draft_id: string } | { readonly ok: false; readonly outcome: string; readonly message: string }>;
}

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

export interface HandoffPreviewCardProps {
  readonly pv: HandoffPreview;
  readonly assign: boolean;
  readonly outOfDate: boolean;
  readonly busy: boolean;
  readonly onAssign: (on: boolean) => void;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly onRefresh: () => void;
  /** The finished step chosen to review (review previews only). */
  readonly reviewStep?: string;
  readonly onReviewStep?: (stepId: string) => void;
}

/** What Hand off will add, before anything is sent. A changed case turns Confirm off and says "preview out of date". */
export function HandoffPreviewCard({ pv, assign, outOfDate, busy, onAssign, onCancel, onConfirm, onRefresh, reviewStep = "", onReviewStep = () => undefined }: HandoffPreviewCardProps): ReactNode {
  return (
    <section className="preview handoff-preview" aria-label="Hand off preview" data-stale={outOfDate ? "yes" : "no"}>
      <h4>{pv.review ? "Preview: Run a review" : "Preview: Hand off"}</h4>
      <dl className="preview-grid">
        <dt>Step that will be added</dt>
        <dd>{pv.step_name}</dd>
        <dt>To this case</dt>
        <dd>{pv.case_title}</dd>
        <dt>Check</dt>
        <dd>{pv.check}</dd>
        {pv.review ? (
          <>
            <dt>Work to review</dt>
            <dd>
              {pv.review.reviewable.length === 0 ? (
                "No step in this case has finished work yet, so there is nothing to review."
              ) : (
                <select value={reviewStep} onChange={(event) => onReviewStep(event.target.value)} aria-label="Finished work to review">
                  <option value="">Choose finished work</option>
                  {pv.review.reviewable.map((st) => (
                    <option key={st.step_id} value={st.step_id}>
                      {st.name}
                    </option>
                  ))}
                </select>
              )}
            </dd>
          </>
        ) : null}
        <dt>Agent</dt>
        <dd>
          {pv.agent.offered ? (
            <label>
              <input type="checkbox" checked={assign} onChange={(event) => onAssign(event.target.checked)} /> Also give this step to an agent
            </label>
          ) : (
            pv.agent.words
          )}
        </dd>
      </dl>
      {outOfDate ? (
        <p role="alert" className="error" data-out-of-date>
          Preview out of date. This case changed after you looked at it, so nothing was sent.{" "}
          <button type="button" onClick={onRefresh}>
            Show the new preview
          </button>
        </p>
      ) : null}
      <div className="row">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="primary" disabled={busy || outOfDate || (pv.review != null && reviewStep === "")} aria-disabled={busy || outOfDate || (pv.review != null && reviewStep === "")} onClick={onConfirm} data-confirm-handoff>
          {outOfDate ? "Confirm (preview out of date)" : pv.review ? "Confirm: Run a review" : "Confirm: Hand off"}
        </button>
      </div>
    </section>
  );
}

export interface ComposerProps {
  readonly ui: UiState;
  readonly dispatch: (action: Action) => void;
  readonly io: NoteIo & { readonly handoff: HandoffIo };
}

export function Composer({ ui, dispatch, io }: ComposerProps): ReactNode {
  const { mode, text, selStart } = ui.composer;
  const data = ui.data;
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<DraftInfo | null>(null);
  const [pv, setPv] = useState<HandoffPreview | null>(null);
  const [pvText, setPvText] = useState("");
  const [assign, setAssign] = useState(false);
  const [outOfDate, setOutOfDate] = useState(false);
  const [caseId, setCaseId] = useState("");
  // Run a review: the step added is a review of finished work.
  const [reviewing, setReviewing] = useState(false);
  const [reviewStep, setReviewStep] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handoff = mode === "handoff";
  // Entering Hand off loads the draft: the same draft number comes back after a restart, with the words written so far.
  useEffect(() => {
    if (!handoff || draft !== null) return;
    void io.handoff.draft().then((d) => {
      if (d === null) return;
      setDraft(d);
      if (text.trim() === "" && d.text.trim() !== "" && d.mode === "handoff") dispatch({ type: "typing", text: d.text, selStart: d.text.length, selEnd: d.text.length });
    });
  }, [handoff]);
  // The words are kept as you type, a moment after you stop.
  useEffect(() => {
    if (!handoff || draft === null) return;
    if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => io.handoff.saveDraft({ draft_id: draft.draftId, text }), 700);
    return () => {
      if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    };
  }, [text, handoff, draft?.draftId]);
  const keeperCases = (data?.cases ?? []).filter((c) => c.source === "case keeper" && (c.state === "Running" || c.state === "Waiting for your approval"));
  const at = atQuery(text, selStart);
  const suggestions = at && mode === "write" ? suggestionsFor(ui, at.query) : [];
  const askBlocked = mode === "ask";
  const empty = text.trim() === "";
  const reasonOff = askBlocked
    ? "Ask is not connected: no reference library is set up."
    : empty
      ? mode === "write"
        ? "Type a note first."
        : handoff
          ? "Type what you want done first."
          : "Type what to look for first."
      : handoff && keeperCases.length === 0
        ? "Cases are not connected or none is running, so there is no case to add a step to."
        : null;

  const showPreview = async (): Promise<void> => {
    if (draft === null) {
      dispatch({ type: "notice", text: "The draft is not ready yet. Try again in a moment." });
      return;
    }
    setBusy(true);
    setOutOfDate(false);
    const result = await io.handoff.preview({ draft_id: draft.draftId, text, ...(caseId !== "" ? { case_id: caseId } : {}), ...(reviewing ? { review: reviewStep !== "" ? { step_id: reviewStep } : {} } : {}) });
    setBusy(false);
    if (result.ok) {
      setPv(result.preview);
      setPvText(text);
      setAssign(false);
      if (!result.preview.review) setReviewStep("");
      dispatch({ type: "notice", text: "" });
    } else {
      setPv(null);
      dispatch({ type: "notice", text: result.message });
    }
  };
  const confirmHandoff = async (): Promise<void> => {
    if (pv === null || draft === null) return;
    setBusy(true);
    const result = await io.handoff.send({ draft_id: pv.draft_id, text: pvText, case_id: pv.case_id, plan_precondition: pv.plan_precondition, assign: assign && pv.agent.offered, ...(pv.review ? { review: { step_id: reviewStep } } : {}) });
    setBusy(false);
    if (result.ok) {
      setPv(null);
      setOutOfDate(false);
      setDraft({ ...draft, draftId: result.draft_id || draft.draftId, text: "" });
      dispatch({ type: "sent" });
      dispatch({ type: "notice", text: result.message });
    } else if (result.outcome === "preview_out_of_date") {
      setOutOfDate(true);
      dispatch({ type: "notice", text: result.message });
    } else dispatch({ type: "notice", text: result.message });
  };

  const send = async (): Promise<void> => {
    if (reasonOff !== null) {
      if (!askBlocked) dispatch({ type: "notice", text: mode === "write" ? "A note needs some words. Type something, then press Enter." : "Type what to look for first." });
      return;
    }
    if (handoff) {
      await showPreview();
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
          {mode === "write" ? "Save note" : mode === "find" ? "Find" : mode === "ask" ? "Ask" : "Preview hand off"}
        </button>
      </div>
      {handoff && keeperCases.length > 1 ? (
        <label className="muted">
          Add the step to this case{" "}
          <select value={caseId} onChange={(event) => setCaseId(event.target.value)} aria-label="Case for the step">
            <option value="">The newest running case</option>
            {keeperCases.map((c) => (
              <option key={c.case_ref} value={c.case_ref}>
                {c.purpose}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {handoff ? (
        <label className="muted">
          <input type="checkbox" checked={reviewing} onChange={(event) => { setReviewing(event.target.checked); setReviewStep(""); setPv(null); }} /> Run a review of finished agent work
        </label>
      ) : null}
      {handoff && pv !== null ? (
        <HandoffPreviewCard
          pv={pv}
          assign={assign}
          outOfDate={outOfDate}
          busy={busy}
          onAssign={setAssign}
          reviewStep={reviewStep}
          onReviewStep={setReviewStep}
          onCancel={() => {
            setPv(null);
            setOutOfDate(false);
          }}
          onConfirm={() => void confirmHandoff()}
          onRefresh={() => void showPreview()}
        />
      ) : null}
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
            : handoff
              ? `Turns your words into one step in a case. Enter shows a preview; nothing is sent until you confirm. ${data?.status.parts.find((p) => p.name === "Agent work")?.connected ? "An agent can take the step." : "Agent work: Not connected, so the step stays with you."}`
              : `Ask: ${NOT_CONNECTED}. No reference library is set up, so questions cannot be answered. Use Find to search your own notes.`}{" "}
        Tab changes the mode. Esc leaves the box.
        {reasonOff !== null && !askBlocked ? ` (${reasonOff})` : ""}
      </p>
      {ui.notice ? (
        <p role="alert" className="notice" data-notice>
          <Words text={ui.notice} />
        </p>
      ) : null}
    </form>
  );
}

