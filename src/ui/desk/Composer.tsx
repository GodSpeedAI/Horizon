/** @jsxImportSource react */
/**
 * The composer (design 5.3): one box. Before you send, the mode tag shows how your text will be taken. Tab changes it.
 * Write saves a note on today (and on the open case). Find searches in place. Ask says "Not connected" when there is no
 * reference library. Hand off turns your words into a step in a case: it shows a preview first, and nothing is sent until you confirm. Typing @ offers a link to a case, a day or a recent note.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { type Action, type Mode, type UiState } from "./attention.ts";
import { NOT_CONNECTED, VIEWS, parseFind } from "./model.ts";
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
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly onRefresh: () => void;
  /** The finished step chosen to review (review previews only). */
  readonly reviewStep?: string;
  readonly onReviewStep?: (stepId: string) => void;
}

/** What Hand off will add, before anything is sent. A changed case turns Confirm off and says "preview out of date". */
export function HandoffPreviewCard({ pv, assign, outOfDate, busy, onCancel, onConfirm, onRefresh, reviewStep = "", onReviewStep = () => undefined }: HandoffPreviewCardProps): ReactNode {
  const confirmOff = busy || outOfDate || (pv.review != null && reviewStep === "");
  return (
    <section className="preview handoff-preview cv-card" aria-label="Hand off preview" data-stale={outOfDate ? "yes" : "no"}>
      <p className="cv-eyebrow">{outOfDate ? "Out of date" : "Needs your OK"}</p>
      <h2>{pv.review ? "Preview: Run a review" : "Preview: Hand off"}</h2>
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
        <dd>{pv.agent.offered ? (assign ? "Yes, an agent will also take it" : "No, it stays with you") : pv.agent.words}</dd>
      </dl>
      {outOfDate ? (
        <p role="alert" className="error" data-out-of-date>
          Preview out of date. This case changed after you looked at it, so nothing was sent.
        </p>
      ) : null}
      <div className="row cv-actions">
        <button type="button" className="primary" disabled={confirmOff} aria-disabled={confirmOff} onClick={onConfirm} data-confirm-handoff>
          {outOfDate ? "Confirm (preview out of date)" : pv.review ? "Confirm: Run a review" : "Confirm: Hand off"}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        {outOfDate ? (
          <button type="button" onClick={onRefresh}>
            Show the new preview
          </button>
        ) : null}
      </div>
    </section>
  );
}

/** One turn of this page's conversation: what was sent, then how it went. Kept in memory only; notes and steps are saved elsewhere. */
interface Turn {
  readonly id: number;
  readonly kind: "Note" | "Hand off" | "Find";
  readonly text: string;
  readonly tone: "ok" | "bad" | "wait" | "quiet";
  readonly result: string;
  readonly at: string;
}
const TRY: Readonly<Record<Mode, readonly string[]>> = {
  write: ["Call the supplier about the invoice", "Ideas for the Friday meeting", "Remember to renew the licence"],
  find: ["invoice #urgent", "day:2026-11-04", "rollback"],
  ask: [],
  handoff: ["Fix the checkout total", "Write the rollback note", "Check the release notes"],
};
const clock = (): string => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

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
  // The "type something first" hint shows only after an empty box was sent, never because the box is empty again after a success.
  const [triedEmpty, setTriedEmpty] = useState(false);
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
  const presenting = data?.status.presenting === true;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [open, setOpen] = useState(true);
  const [activeTurn, setActiveTurn] = useState<number | null>(null);
  const turnSeq = useRef(0);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const addTurn = (kind: Turn["kind"], text: string, tone: Turn["tone"], result: string): number => {
    const id = ++turnSeq.current;
    setTurns((all) => [...all, { id, kind, text, tone, result, at: clock() }]);
    setOpen(true);
    return id;
  };
  const patchTurn = (id: number | null, tone: Turn["tone"], result: string): void => {
    if (id === null) return;
    setTurns((all) => all.map((t) => (t.id === id ? { ...t, tone, result, at: clock() } : t)));
  };
  // Newest at the bottom: the thread follows new turns and a new preview.
  useEffect(() => {
    const el = threadRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [turns, pv, outOfDate, open]);
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
  useEffect(() => {
    if (!empty) setTriedEmpty(false);
  }, [empty]);
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

  const hint = empty && !triedEmpty ? null : reasonOff;

  const closePreview = (tone: Turn["tone"], result: string): void => {
    patchTurn(activeTurn, tone, result);
    setActiveTurn(null);
    setPv(null);
    setOutOfDate(false);
  };
  const showPreview = async (refresh = false): Promise<void> => {
    if (draft === null) {
      dispatch({ type: "notice", text: "The draft is not ready yet. Try again in a moment." });
      return;
    }
    setBusy(true);
    setOutOfDate(false);
    const result = await io.handoff.preview({ draft_id: draft.draftId, text, ...(caseId !== "" ? { case_id: caseId } : {}), ...(reviewing ? { review: reviewStep !== "" ? { step_id: reviewStep } : {} } : {}) });
    setBusy(false);
    if (result.ok) {
      if (!refresh || activeTurn === null) {
        if (activeTurn !== null) patchTurn(activeTurn, "quiet", "Replaced by a newer preview.");
        setActiveTurn(addTurn("Hand off", text, "wait", "Waiting for your OK."));
      } else patchTurn(activeTurn, "wait", "Waiting for your OK.");
      setPv(result.preview);
      setPvText(text);
      setAssign(assign && result.preview.agent.offered);
      if (!result.preview.review) setReviewStep("");
      dispatch({ type: "notice", text: "" });
    } else {
      if (activeTurn !== null) patchTurn(activeTurn, "quiet", "Replaced by a newer try.");
      setActiveTurn(null);
      setPv(null);
      addTurn("Hand off", text, "bad", result.message);
      dispatch({ type: "notice", text: result.message });
    }
  };
  const confirmHandoff = async (): Promise<void> => {
    if (pv === null || draft === null) return;
    setBusy(true);
    const result = await io.handoff.send({ draft_id: pv.draft_id, text: pvText, case_id: pv.case_id, plan_precondition: pv.plan_precondition, assign: assign && pv.agent.offered, ...(pv.review ? { review: { step_id: reviewStep } } : {}) });
    setBusy(false);
    if (result.ok) {
      patchTurn(activeTurn, "ok", result.message);
      setActiveTurn(null);
      setPv(null);
      setOutOfDate(false);
      setAssign(false);
      setDraft({ ...draft, draftId: result.draft_id || draft.draftId, text: "" });
      dispatch({ type: "sent" });
      dispatch({ type: "notice", text: result.message });
    } else if (result.outcome === "preview_out_of_date") {
      setOutOfDate(true);
      patchTurn(activeTurn, "bad", "Out of date. Nothing was sent.");
      dispatch({ type: "notice", text: result.message });
    } else {
      patchTurn(activeTurn, "bad", result.message);
      dispatch({ type: "notice", text: result.message });
    }
  };

  const send = async (): Promise<void> => {
    if (reasonOff !== null) {
      if (empty) setTriedEmpty(true);
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
      addTurn("Find", text, "quiet", "Results are in Explore.");
      return;
    }
    setBusy(true);
    const result = await io.saveNote({ body: text, case_ref: data?.status.openCase?.case_ref ?? null });
    setBusy(false);
    if (result.ok) {
      addTurn("Note", text, "ok", `Saved on today${data?.status.openCase ? " and on the open case" : ""}.`);
      dispatch({ type: "sent" });
      dispatch({ type: "notice", text: "Saved." });
    } else {
      addTurn("Note", text, "bad", result.message);
      dispatch({ type: "notice", text: result.message });
    }
  };

  const agentConnected = data?.status.parts.find((p) => p.name === "Agent work")?.connected === true;
  const viewLabel = VIEWS.find((v) => v.id === ui.view)?.label ?? "";
  const openCase = data?.status.openCase?.purpose ?? "no case open";
  const sendLabel = mode === "write" ? "Save note" : mode === "find" ? "Find" : mode === "ask" ? "Ask" : "Preview hand off";
  const shownNotice = ui.notice !== null && ui.notice !== "" ? ui.notice : null;
  const statusText = busy ? "Sending…" : askBlocked ? "Ask is not connected: no reference library is set up." : hint ?? "Ready";
  const stateWord = MODE_LABEL[mode];
  const tone = busy ? "wait" : shownNotice !== null || (hint !== null && !askBlocked) || askBlocked ? "bad" : "ok";
  const tries = TRY[mode];
  const tryOut = (phrase: string): void => {
    dispatch({ type: "typing", text: phrase, selStart: phrase.length, selEnd: phrase.length });
    dispatch({ type: "focus", target: "composer" });
  };
  const shownTurns = turns.map((t) => ({ ...t, text: presenting ? "Hidden while Presenting is on." : t.text }));
  return (
    <div className="convo" data-open={open ? "yes" : "no"}>
      {turns.length > 0 ? (
        <section className="cv-thread" aria-label="Conversation">
          <div className="cv-thread-head">
            <button type="button" className="cv-fold" aria-expanded={open} aria-controls="cv-thread-body" onClick={() => setOpen(!open)}>
              <span aria-hidden="true">{open ? "▾" : "▸"}</span> Conversation ({turns.length})
            </button>
            <button type="button" className="cv-fold" onClick={() => { setTurns([]); setOpen(true); }} disabled={pv !== null}>
              Clear
            </button>
          </div>
          <div id="cv-thread-body" className="cv-thread-body" ref={threadRef} hidden={!open}>
            <ol className="cv-turns">
              {shownTurns.map((t) => (
                <li key={t.id} className="cv-turn">
                  <div className="cv-sent">
                    <span className="cv-meta">You · {t.kind}</span>
                    <p dir="auto">{t.text}</p>
                  </div>
                  {t.id === activeTurn && pv !== null ? (
                    <HandoffPreviewCard
                      pv={pv}
                      assign={assign}
                      outOfDate={outOfDate}
                      busy={busy}
                      reviewStep={reviewStep}
                      onReviewStep={setReviewStep}
                      onCancel={() => {
                        closePreview("quiet", "Cancelled. Nothing was sent.");
                        dispatch({ type: "notice", text: "" });
                      }}
                      onConfirm={() => void confirmHandoff()}
                      onRefresh={() => void showPreview(true)}
                    />
                  ) : (
                    <p className="cv-result" data-tone={t.tone}>
                      <span className="cv-dot" aria-hidden="true" />
                      <span>
                        <Words text={t.result} />
                      </span>
                      <span className="cv-meta">{t.at}</span>
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : tries.length > 0 && empty ? (
        <p className="cv-try">
          <span className="cv-meta">Try</span>
          {tries.map((phrase) => (
            <button key={phrase} type="button" className="cv-try-btn" onClick={() => tryOut(phrase)}>
              {phrase}
            </button>
          ))}
        </p>
      ) : null}
      <form
        className="composer cv-composer"
        aria-label="Composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        {shownNotice !== null ? (
          <p role="alert" className="cv-status notice" data-notice data-tone="bad">
            <span className="cv-dot" aria-hidden="true" />
            <span>
              <Words text={shownNotice} />
            </span>
            <span className="cv-state">{stateWord}</span>
          </p>
        ) : (
          <p role="status" className="cv-status" data-tone={tone}>
            <span className="cv-dot" aria-hidden="true" />
            <span>{statusText}</span>
            <span className="cv-state">{stateWord}</span>
          </p>
        )}
        <div className="cv-box">
          <div className="cv-chips">
            <button type="button" className="mode-tag cv-chip" data-mode={mode} aria-label={`Mode: ${MODE_LABEL[mode]}. Press to change.`} onClick={() => dispatch({ type: "cycle-mode" })}>
              {MODE_LABEL[mode]} ▾
            </button>
            {handoff && keeperCases.length > 1 ? (
              <label className="cv-chip">
                <span aria-hidden="true">Case</span>
                <select value={caseId} onChange={(event) => setCaseId(event.target.value)} aria-label="Case for the step">
                  <option value="">The newest running case</option>
                  {keeperCases.map((c) => (
                    <option key={c.case_ref} value={c.case_ref}>
                      {c.purpose}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="cv-chip cv-chip-static">{handoff ? `Case: ${keeperCases[0]?.purpose ?? "none running"}` : mode === "write" ? `Today${data?.status.openCase ? ` · ${openCase}` : ""}` : "All notes"}</span>
            )}
            {handoff && agentConnected ? (
              <label className="cv-chip cv-chip-check">
                <input type="checkbox" checked={assign} onChange={(event) => setAssign(event.target.checked)} /> Also give this step to an agent
              </label>
            ) : null}
            {handoff ? (
              <label className="cv-chip cv-chip-check">
                <input type="checkbox" checked={reviewing} onChange={(event) => { setReviewing(event.target.checked); setReviewStep(""); if (pv !== null) closePreview("quiet", "Preview closed."); }} /> Run a review of finished agent work
              </label>
            ) : null}
          </div>
          <div className="cv-input">
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
            <button type="submit" className="primary cv-send" disabled={busy || askBlocked} aria-label={sendLabel} aria-describedby="composer-hint">
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                <path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
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
        <p id="composer-hint" className="sr-only">
          {mode === "write"
            ? `Saves a note on today (${data?.today ?? "…"})${data?.status.openCase ? ` and on the case "${data.status.openCase.purpose}"` : ""}. Enter saves, Shift+Enter adds a line, @ adds a link.`
            : mode === "find"
              ? "Searches notes, days, tags and cases. Enter shows the results in Explore."
              : handoff
                ? `Turns your words into one step in a case. Enter shows a preview; nothing is sent until you confirm. ${agentConnected ? "An agent can take the step." : "Agent work: Not connected, so the step stays with you."}`
                : `Ask: ${NOT_CONNECTED}. No reference library is set up, so questions cannot be answered. Use Find to search your own notes.`}{" "}
          Tab changes the mode. Esc leaves the box.
          {hint !== null && !askBlocked ? ` (${hint})` : ""}
        </p>
        <div className="cv-foot">
          <span className="cv-where">
            {data?.status.setup ?? "no setup"} · {openCase} · {viewLabel}
          </span>
          <span className="cv-keys" aria-hidden="true">
            <kbd>Enter</kbd> send <span>·</span> <kbd>Shift</kbd>+<kbd>Enter</kbd> new line <span>·</span> <kbd>Tab</kbd> mode <span>·</span> <kbd>Esc</kbd> leave
          </span>
        </div>
      </form>
    </div>
  );
}
