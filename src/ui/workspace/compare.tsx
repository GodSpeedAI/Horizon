/** @jsxImportSource react */
/**
 * The comparison page (design 5.7), server-rendered: "What the agent reports" next to "What the independent record shows".
 * Built from the surface2 `compare` block's shape (see `compare-model.ts`); the grammar is not touched. Two forms only:
 * the label (`POST /workspace/label`) and the Presenting switch (`POST /workspace/presenting`). Nothing here decides anything.
 * Presenting is applied to the props before they reach this file, so no real name is ever rendered while it is on.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RunLabel } from "../../capabilities/labels.ts";
import { NOT_RECORDED, type CompareView, type SessionSummary } from "./compare-model.ts";
import type { WorkspaceTheme } from "./model.ts";
import { STYLE } from "./render.tsx";

export interface CompareSelection {
  readonly source: string | null;
  readonly repo: string | null;
  readonly day: string;
  readonly session: string | null;
  readonly only: "contradicted" | null;
}

export interface ComparePageProps {
  readonly theme?: WorkspaceTheme;
  readonly presenting: boolean;
  readonly selection: CompareSelection;
  readonly sources: readonly string[];
  readonly repos: readonly { readonly repo_id: string; readonly path: string | null }[];
  readonly sessions: readonly (SessionSummary & { readonly label: RunLabel | null })[];
  readonly view: CompareView | null;
  readonly label: RunLabel | null;
  /** One line saying why there is nothing to show, or null. */
  readonly notice: string | null;
  readonly labelError: string | null;
}

const EXTRA_STYLE = `
.cmp { width:100%; border-collapse:collapse; margin:.6rem 0 1rem; }
.cmp th, .cmp td { border:1px solid var(--line); padding:.45rem .65rem; text-align:left; vertical-align:top; overflow-wrap:anywhere; }
.cmp thead th { background:var(--tint); }
.cmp td[data-state="not-recorded"] { color:var(--muted); font-style:italic; }
.cmp .why { display:block; font-size:.85rem; color:var(--muted); font-style:normal; }
.pill { display:inline-block; border:1px solid var(--edge); border-radius:.7rem; padding:0 .5rem; font-weight:700; font-size:.82rem; }
.pill[data-outcome="contradicted"] { color:var(--danger); }
.pill[data-outcome="matched"] { color:var(--ok); }
.pill[data-outcome="not recorded"] { color:var(--muted); border-style:dashed; }
.cmp-bar { display:flex; flex-wrap:wrap; gap:.6rem 1.2rem; align-items:end; margin:.5rem 0 1rem; }
.cmp-bar label { display:flex; flex-direction:column; font-size:.88rem; color:var(--muted); }
.presenting-on { background:var(--tint); border:1px solid var(--edge); border-radius:.35rem; padding:.3rem .6rem; font-weight:700; }
.label-form { display:grid; gap:.5rem; max-width:40rem; border:1px solid var(--line); border-radius:.5rem; padding:.75rem 1rem; }
.label-form textarea { min-height:4rem; }
`;

function query(selection: CompareSelection, over: Partial<Record<keyof CompareSelection, string | null>> = {}): string {
  const merged: Record<string, string | null> = { source: selection.source, repo: selection.repo, day: selection.day, session: selection.session, only: selection.only, ...over };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
  return params.toString();
}

function Cell({ text, why }: { readonly text: string; readonly why?: string | undefined }): ReactNode {
  const missing = text.startsWith(NOT_RECORDED);
  return (
    <td data-state={missing ? "not-recorded" : "recorded"}>
      {text}
      {missing && why ? <span className="why">{why}</span> : null}
    </td>
  );
}

function Comparison({ view }: { readonly view: CompareView }): ReactNode {
  return (
    <section aria-labelledby="cmp-h" data-session={view.session.session_id}>
      <h2 id="cmp-h">Session <code>{view.session.session_id}</code> <span className="pill" data-outcome={view.session.outcome}>{view.session.outcome}</span></h2>
      <p className="state">
        {view.session.kind === "agent" ? `Copied from ${view.session.runtime} by the session copier.` : "Run in the workshop."} {view.session.events} events
        {view.session.first_ts ? `, ${view.session.first_ts} to ${view.session.last_ts}` : ""}.{" "}
        {view.workshop_link ? <a href={view.workshop_link} data-workshop-link>Open this session in the workshop</a> : <span data-workshop-link-absent>No workshop link: {view.workshop_link_reason}.</span>}
      </p>
      <table className="cmp" data-table="comparison">
        <thead>
          <tr><th scope="col">Row</th><th scope="col">What the agent reports</th><th scope="col">What the independent record shows</th></tr>
        </thead>
        <tbody>
          {view.rows.map((r) => (
            <tr key={r.row} data-row={r.row}>
              <th scope="row">{r.row}</th>
              <Cell text={r.agentReports} why={r.recordShows.startsWith(NOT_RECORDED) ? undefined : r.reason} />
              <Cell text={r.recordShows} why={r.reason} />
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function LabelControl({ props, view }: { readonly props: ComparePageProps; readonly view: CompareView }): ReactNode {
  const current = props.label;
  return (
    <section aria-labelledby="label-h">
      <h2 id="label-h">Your label for this run</h2>
      {current ? <p data-current-label={current.verdict}>Currently <strong>{current.verdict}</strong>{current.first_failure ? `: ${current.first_failure}` : ""} (by {current.operator}, {current.created_at}).</p> : <p className="state">Not labelled yet.</p>}
      {props.labelError ? <p role="alert" data-label-error>{props.labelError}</p> : null}
      <form method="post" action="/workspace/label" className="label-form">
        <input type="hidden" name="session" value={view.session.session_id} />
        <input type="hidden" name="event" value={view.session.event_id} />
        <input type="hidden" name="record_seq" value={view.session.record_seq === null ? "" : String(view.session.record_seq)} />
        <input type="hidden" name="return" value={query(props.selection)} />
        <fieldset>
          <legend>Verdict</legend>
          <label><input type="radio" name="verdict" value="pass" defaultChecked={current?.verdict === "pass"} required /> pass</label>{" "}
          <label><input type="radio" name="verdict" value="fail" defaultChecked={current?.verdict === "fail"} /> fail</label>
        </fieldset>
        <label>The first thing that went wrong (at most 600 characters)
          <textarea name="first_failure" maxLength={600} defaultValue={current?.first_failure ?? ""} />
        </label>
        <button type="submit" className="primary">Save label</button>
      </form>
    </section>
  );
}

export function ComparePage(props: ComparePageProps): ReactNode {
  const { selection } = props;
  return (
    <html lang="en" data-theme={props.theme}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <title>What really happened</title>
        <style>{STYLE + EXTRA_STYLE}</style>
      </head>
      <body>
        <a className="skip" href="#main">Skip to the comparison</a>
        <header>
          <div className="bar">
            <h1>What really happened</h1>
            <a href="/workspace">Back to the workspace</a>
          </div>
          <p className="state">What the agent reports, next to what the independent record shows. Rows with no real data behind them say &quot;not recorded&quot; and why.</p>
          <form method="post" action="/workspace/presenting" className="cmp-bar">
            <input type="hidden" name="on" value={props.presenting ? "0" : "1"} />
            <input type="hidden" name="return" value={query(selection)} />
            {props.presenting ? <span className="presenting-on" data-presenting="on">Presenting is on: project names are hidden</span> : <span data-presenting="off">Presenting is off</span>}
            <button type="submit">{props.presenting ? "Switch Presenting off" : "Switch Presenting on"}</button>
          </form>
        </header>
        <main id="main" tabIndex={-1}>
          <form method="get" action="/workspace/compare" className="cmp-bar">
            <label>Record
              <select name="source" defaultValue={selection.source ?? ""}>{props.sources.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            </label>
            <label>Repository
              <select name="repo" defaultValue={selection.repo ?? ""}>
                {props.repos.map((r) => <option key={r.repo_id} value={r.repo_id}>{r.path ?? r.repo_id}</option>)}
              </select>
            </label>
            <label>Day<input type="date" name="day" defaultValue={selection.day} required /></label>
            <label><span>Show</span>
              <select name="only" defaultValue={selection.only ?? ""}><option value="">all sessions</option><option value="contradicted">only contradicted</option></select>
            </label>
            <button type="submit">Show</button>
          </form>
          {props.notice ? <p role="status" data-notice>{props.notice}</p> : null}
          {props.sessions.length > 0 ? (
            <table className="cmp" data-table="sessions">
              <thead><tr><th scope="col">Session</th><th scope="col">Outcome</th><th scope="col">Events</th><th scope="col">Checks</th><th scope="col">Your label</th></tr></thead>
              <tbody>
                {props.sessions.map((s) => (
                  <tr key={`${s.runtime}/${s.session_id}`} data-session={s.session_id}>
                    <th scope="row"><a href={`/workspace/compare?${query(selection, { session: s.session_id })}`}>{s.session_id}</a> <span className="state">({s.runtime})</span></th>
                    <td><span className="pill" data-outcome={s.outcome}>{s.outcome}</span></td>
                    <td className="num">{s.events}</td>
                    <td className="num">{s.checks === 0 ? NOT_RECORDED : `${s.checks - s.failed} of ${s.checks} passed`}</td>
                    <td>{s.label ? s.label.verdict : "none"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {props.view ? (
            <>
              <Comparison view={props.view} />
              <LabelControl props={props} view={props.view} />
            </>
          ) : null}
          <p>
            Export: <a href={`/workspace/export?kind=labels&standins=1`}>labels</a>
            {props.view ? <>, <a href={`/workspace/export?kind=comparison&${query(selection)}&standins=1`}>this comparison</a></> : null}. Exports use stand-ins for project names by default.
          </p>
        </main>
      </body>
    </html>
  );
}

export function renderComparePage(props: ComparePageProps): string {
  return `<!doctype html>${renderToStaticMarkup(<ComparePage {...props} />)}`;
}
