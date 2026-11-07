/** @jsxImportSource react */
/**
 * Work (design 5.1): "What is running and how did it go?" Problems come first (rule 8): a contradicted record is the first item.
 * Below it: the comparison of what the agent said with the independent record, running cases, and what it cost.
 */
import type { ReactNode } from "react";
import type { Action } from "../attention.ts";
import { ComparisonView } from "../ComparisonView.tsx";
import { LabelControl, type SaveLabel } from "../LabelControl.tsx";
import { caseStateWords } from "../work-build.ts";
import { Cost } from "./Cost.tsx";
import type { ViewProps } from "./Today.tsx";

export interface WorkViewProps extends ViewProps {
  readonly saveLabel: SaveLabel;
}

export function Work({ ui, dispatch, saveLabel }: WorkViewProps): ReactNode {
  const work = ui.work;
  if (work === null) {
    return (
      <section aria-labelledby="work-h" className="view" data-view-id="work">
        <h1 id="work-h">Work</h1>
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
      <h1 id="work-h">Work</h1>
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
                <strong>{item.title}</strong> <span className="pill" data-outcome={item.outcome}>{item.outcome}</span>
                <span className="muted"> {item.words}</span>
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
            {compare.repos.map((r) => (
              <option key={r.repo_id} value={r.repo_id}>{r.path ?? r.repo_id}</option>
            ))}
          </select>
        </label>
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
      {compare.notice !== null ? <p role="status" data-notice>{compare.notice}</p> : null}
      {compare.view ? (
        <>
          <ComparisonView view={compare.view} />
          <LabelControl view={compare.view} label={compare.label} onSave={saveLabel} />
        </>
      ) : null}
      <p className="muted">
        Export: <a href="/workspace/export?kind=labels&standins=1">labels</a>
        {compare.view ? (
          <>
            , <a href={`/workspace/export?kind=comparison&source=${encodeURIComponent(compare.selection.source ?? "")}&repo=${encodeURIComponent(compare.selection.repo ?? "")}&day=${encodeURIComponent(compare.selection.day)}&session=${encodeURIComponent(compare.selection.session ?? "")}&standins=1`}>this comparison</a>
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
              <strong>{c.summary || c.case_id}</strong> <span className="state-word" data-state={c.case_state}>{caseStateWords(c.case_state)}</span>
            </li>
          ))}
        </ul>
      )}
      {work.cases.unreadable > 0 ? <p className="error" role="alert">{work.cases.unreadable} {work.cases.unreadable === 1 ? "case" : "cases"} could not be read, so the list above may be incomplete.</p> : null}

      <Cost cost={work.cost} />
    </section>
  );
}
