/** @jsxImportSource react */
/**
 * Work (design 5.1): "What is running and how did it go?" Problems come first (rule 8): a contradicted record is the first item.
 * Below it: the comparison of what the agent said with the independent record, running cases, and what it cost.
 */
import { useState, type ReactNode } from "react";
import type { Action } from "../attention.ts";
import { ComparisonView } from "../ComparisonView.tsx";
import { LabelControl, type SaveLabel } from "../LabelControl.tsx";
import { caseStateWords } from "../work-build.ts";
import { caseTitle } from "../model.ts";
import { Cost } from "./Cost.tsx";
import type { ViewProps } from "./Today.tsx";
import { ExportButton } from "../../workspace/export-button.tsx";

export interface WorkViewProps extends ViewProps {
  readonly saveLabel: SaveLabel;
  /** Starts the steps of a case that were added and are waiting. */
  readonly startCase?: (caseId: string, previewed: readonly string[]) => Promise<{ readonly ok: boolean; readonly message: string }>;
}

/** A folder name, not a full path. */
const folderOf = (path: string | null, id: string): string => (path === null ? id : (path.replace(/\/+$/, "").split("/").pop() || path));

export function Work({ ui, dispatch, saveLabel, startCase }: WorkViewProps): ReactNode {
  const [showTests, setShowTests] = useState(false);
  const [startNote, setStartNote] = useState<string | null>(null);
  const work = ui.work;
  if (work === null) {
    return (
      <section aria-labelledby="work-h" className="view" data-view-id="work">
        <h1 id="work-h" tabIndex={-1}>Work</h1>
        <p role="status">Still loading.</p>
      </section>
    );
  }
  const compare = work.compare;
  const query = ui.workQuery;
  const sessionById = new Map(compare.sessions.map((s) => [`session:${s.session_id}`, s]));
  const patch = (change: Partial<typeof query>): void => dispatch({ type: "work-query", patch: change } satisfies Action);
  return (
    <section aria-labelledby="work-h" className="view" data-view-id="work">
      <h1 id="work-h" tabIndex={-1}>Work</h1>
      <p className="muted">What is running, how it went, and what it cost. Problems come first.</p>

      <h2>Needs a look first</h2>
      {work.items.length === 0 ? (
        <p className="empty" data-empty>
          {compare.notice ?? "No sessions or cases to show."} Next step: pick another day below, or write a note about what you are working on.
        </p>
      ) : (
        <ol className="items work-items" data-focus="list" tabIndex={0} aria-label="Work, problems first">
          {work.items.map((item, index) => {
            const session = sessionById.get(item.id);
            return (
              <li key={item.id} data-work-item={item.id} data-outcome={item.outcome} data-first={index === 0 ? "true" : undefined} data-cursor={ui.cursor === index ? "true" : undefined} aria-current={ui.cursor === index ? "true" : undefined}>
                <strong>{item.title}</strong>{" "}
                {item.kind === "case" ? (
                  <span className="pill" data-outcome={item.outcome}>{item.words}</span>
                ) : (
                  <>
                    <span className="pill" data-outcome={item.outcome}>{item.outcome}</span>
                    <span className="muted"> {item.words}</span>
                  </>
                )}
                {session ? (
                  <>
                    {" "}
                    <span className="muted">
                      {session.events} events; {session.checks === 0 ? "checks: Not recorded" : `${session.checks - session.failed} of ${session.checks} checks passed`}; your label: {session.label ? session.label.verdict : "none"}
                    </span>{" "}
                    <button type="button" onClick={() => patch({ session: session.session_id })}>
                      Compare with the record
                    </button>
                  </>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      <form
        className="cmp-bar"
        aria-label="Which record to look at"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          patch({ source: String(form.get("source") ?? "") || null, repo: String(form.get("repo") ?? "") || null, day: String(form.get("day") ?? "") || null, only: form.get("only") === "contradicted" ? "contradicted" : null, session: null });
        }}
      >
        <label>
          Record
          <select name="source" defaultValue={compare.selection.source ?? ""}>
            {compare.sources.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Repository
          <select name="repo" defaultValue={compare.selection.repo ?? ""}>
            {compare.repos.filter((r) => showTests || r.temporary !== true || r.repo_id === compare.selection.repo).map((r) => (
              <option key={r.repo_id} value={r.repo_id}>{folderOf(r.path, r.repo_id)}</option>
            ))}
          </select>
        </label>
        {compare.repos.some((r) => r.temporary === true) ? (
          <label className="inline">
            <input type="checkbox" checked={showTests} onChange={(event) => setShowTests(event.target.checked)} /> Show test repositories ({compare.repos.filter((r) => r.temporary === true).length})
          </label>
        ) : null}
        <label>
          Day
          <input type="date" name="day" defaultValue={compare.selection.day} required />
        </label>
        <label>
          Show
          <select name="only" defaultValue={compare.selection.only ?? ""}>
            <option value="">all sessions</option>
            <option value="contradicted">only contradicted</option>
          </select>
        </label>
        <button type="submit">Show</button>
      </form>
      {compare.notice !== null ? (
        <p role="status" data-notice>
          {compare.notice}
          {compare.lastDay && compare.lastDay !== compare.selection.day ? (
            <>
              {" "}
              <button type="button" onClick={() => patch({ day: compare.lastDay ?? null, session: null })}>
                Go to {compare.lastDay}
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      {compare.view ? (
        <>
          <ComparisonView view={compare.view} />
          <LabelControl view={compare.view} label={compare.label} onSave={saveLabel} />
        </>
      ) : null}
      <p className="muted">
        Export: <ExportButton label="labels" fields={[["kind", "labels"], ["standins", "1"]]} />
        {compare.view ? (
          <>
            , <ExportButton label="this comparison" fields={[["kind", "comparison"], ["source", compare.selection.source ?? ""], ["repo", compare.selection.repo ?? ""], ["day", compare.selection.day], ["session", compare.selection.session ?? ""], ["standins", "1"]]} />
          </>
        ) : null}
        . Exports use stand-ins for project names by default.
      </p>

      <h2>Cases</h2>
      {!work.cases.connected ? (
        <p className="empty" data-cases-off>{work.cases.words}</p>
      ) : work.cases.items.length === 0 ? (
        <p className="empty">No cases yet. Open a case from Explore or the first-run steps in Today.</p>
      ) : (
        <ul className="activity" data-list="work-cases">
          {work.cases.items.map((c) => (
            <li key={c.case_id}>
              <strong>{c.title ?? caseTitle(c.summary, c.created_at)}</strong> <span className="state-word" data-state={c.case_state}>{caseStateWords(c.case_state)}</span>
              {c.waiting && c.waiting.length > 0 ? (
                <div data-waiting-to-start>
                  <p className="muted">Waiting to start ({c.waiting.length}):</p>
                  <ul>
                    {c.waiting.map((w) => (
                      <li key={w.plan_item_id}>{w.name}</li>
                    ))}
                  </ul>
                  {startCase ? (
                    <button type="button" onClick={() => void startCase(c.case_id, (c.waiting ?? []).map((w) => w.plan_item_id)).then((r) => setStartNote(r.message))} data-start-case>
                      Start it
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {startNote !== null ? <p role="status" data-start-note>{startNote}</p> : null}
      {work.cases.unreadable > 0 ? <p className="error" role="alert">{work.cases.unreadable} {work.cases.unreadable === 1 ? "case" : "cases"} could not be read, so the list above may be incomplete.</p> : null}

      <Cost cost={work.cost} />
    </section>
  );
}
