/** @jsxImportSource react */
/**
 * Case economics page (HC-06): a server-rendered, read-only table view of `EconomicsModel`.
 * No client script, no forms, no action: it displays what RealityTrace recorded and gates nothing.
 * "observed" and "estimate" are separate badges; a figure carries the badge of the field it came from.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { EconomicsReadout, EconomicsRepo } from "../../adapters/realitytrace-economics.ts";
import { RESIDUAL_KINDS, type CaseModel, type EconomicsModel, type JourneyCounts, type SessionModel, type Totals } from "../../economics/model.ts";
import type { WorkspaceTheme } from "./model.ts";
import { STYLE } from "./render.tsx";

const EXTRA_STYLE = `
td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
.badge { display:inline-block; font-size:.78rem; font-weight:700; border:1px solid var(--edge); border-radius:.7rem; padding:0 .45rem; margin-left:.3rem; }
.badge.estimate { color:var(--focus); border-style:dashed; }
.badge.observed { color:var(--ok); }
.badge.none { color:var(--muted); }
tr.case-row th, tr.case-row td { background:var(--tint); font-weight:700; }
tfoot th, tfoot td { font-weight:700; border-top:2px solid var(--edge); }
.table-wrap { overflow-x:auto; }
.empty-state { border:1px dashed var(--edge); border-radius:.5rem; padding:1rem; }
`;

const fmt = (n: number): string => n.toLocaleString("en-US");
const pct = (value: number | null): string => (value === null ? "n/a" : `${value.toFixed(1)}%`);
const Observed = (): ReactNode => <span className="badge observed">observed</span>;
const Estimate = (): ReactNode => <span className="badge estimate">estimate</span>;

function journeySums(journeys: Record<string, JourneyCounts>): JourneyCounts {
  const sum = { match: 0, mismatch: 0, undefined: 0 };
  for (const counts of Object.values(journeys)) {
    sum.match += counts.match;
    sum.mismatch += counts.mismatch;
    sum.undefined += counts.undefined;
  }
  return sum;
}

function Cells({ totals, overhead }: { readonly totals: Totals; readonly overhead: number | null }): ReactNode {
  const j = journeySums(totals.journeys);
  return (
    <>
      <td className="num" data-f="input">{fmt(totals.observed.input)}</td>
      <td className="num" data-f="output">{fmt(totals.observed.output)}</td>
      <td className="num" data-f="cache_read">{fmt(totals.observed.cache_read)}</td>
      <td className="num" data-f="cache_write">{fmt(totals.observed.cache_write)}</td>
      <td className="num" data-f="observed_total">{fmt(totals.observed.total)}</td>
      <td className="num" data-f="observed_estimated">{fmt(totals.observed_estimated.total)}</td>
      <td className="num" data-f="te_overhead">{fmt(totals.te_overhead.total)}</td>
      <td className="num" data-f="overhead_pct">{pct(overhead)}</td>
      <td className="num" data-f="te_injection">{fmt(totals.te_injection_attributed)}</td>
      <td className="num" data-f="tool_fail">{fmt(totals.tool_fail)}</td>
      <td className="num" data-f="match">{fmt(j.match)}</td>
      <td className="num" data-f="mismatch">{fmt(j.mismatch)}</td>
      <td className="num" data-f="undefined">{fmt(j.undefined)}</td>
    </>
  );
}

function CostHead(): ReactNode {
  return (
    <thead>
      <tr>
        <th scope="col">Case / session</th>
        <th scope="col" className="num">Input</th>
        <th scope="col" className="num">Output</th>
        <th scope="col" className="num">Cache read</th>
        <th scope="col" className="num">Cache write</th>
        <th scope="col" className="num">Total <Observed /></th>
        <th scope="col" className="num">of which token quality ESTIMATED</th>
        <th scope="col" className="num">TE overhead</th>
        <th scope="col" className="num">Overhead % of observed</th>
        <th scope="col" className="num">TE injected <Estimate /></th>
        <th scope="col" className="num">Tool failures</th>
        <th scope="col" className="num">Journey match</th>
        <th scope="col" className="num">Journey mismatch</th>
        <th scope="col" className="num">Journey undefined</th>
      </tr>
    </thead>
  );
}

function SessionRow({ session }: { readonly session: SessionModel }): ReactNode {
  return (
    <tr data-session={session.native_session_id}>
      <th scope="row">
        {session.runtime} <code>{session.native_session_id}</code>
        {session.arms.length > 0 ? <span className="muted"> · arm {session.arms.join(",")}</span> : null}
      </th>
      <Cells totals={session.totals} overhead={session.overhead_pct} />
    </tr>
  );
}

function CaseGroup({ item }: { readonly item: CaseModel }): ReactNode {
  return (
    <tbody data-case={item.case_id ?? "unbound"}>
      <tr className="case-row">
        <th scope="rowgroup">
          {item.case_id === null ? (
            <>Unbound <span className="muted">(RealityTrace records no case)</span></>
          ) : (
            <>Case <code>{item.case_id}</code></>
          )}
        </th>
        <Cells totals={item.totals} overhead={item.overhead_pct} />
      </tr>
      {item.sessions.map((session) => (
        <SessionRow key={`${session.runtime}:${session.native_session_id}`} session={session} />
      ))}
    </tbody>
  );
}

function RepoView({ repo }: { readonly repo: EconomicsRepo }): ReactNode {
  const model = repo.model;
  return (
    <section aria-labelledby={`repo-${repo.repo_id}`} data-repo={repo.repo_id}>
      <h2 id={`repo-${repo.repo_id}`}>Repository <code>{repo.repo_id}</code></h2>
      {repo.path ? <p className="muted"><code>{repo.path}</code></p> : null}
      {repo.error ? (repo.model === null ? <p className="error" role="alert">{repo.error}</p> : <p className="muted" role="note">{repo.error}</p>) : null}
      {model === null ? null : <ModelView model={model} />}
    </section>
  );
}

export function ModelView({ model }: { readonly model: EconomicsModel }): ReactNode {
  const journeyNames = [...new Set([...model.cases.flatMap((c) => Object.keys(c.totals.journeys)), ...Object.keys(model.totals.journeys)])].sort();
  const lessons = model.cases.flatMap((c) => c.sessions.flatMap((s) => s.lessons.map((lesson) => ({ session: s, lesson }))));
  return (
    <>
      <div className="table-wrap">
        <table data-table="cost">
          <caption>
            Observed cost and TE overhead, per case and session (tokens). Observed is the agent runtime&apos;s own usage; the estimate column is the part of it whose
            token quality is ESTIMATED. TE overhead is Task Economizer&apos;s own cost, charged to the session that used it. Journey columns count newest-verdict checks.
          </caption>
          <CostHead />
          {model.cases.map((item) => (
            <CaseGroup key={item.case_id ?? "unbound"} item={item} />
          ))}
          <tfoot>
            <tr data-total="repo">
              <th scope="row">Total</th>
              <Cells totals={model.totals} overhead={model.overhead_pct} />
            </tr>
          </tfoot>
        </table>
      </div>

      <table data-table="unattributed">
        <caption>Unattributed usage: native usage events whose case RealityTrace does not know. Included in the Unbound rows above, listed here so it cannot hide.</caption>
        <thead><tr><th scope="col">Line</th><th scope="col" className="num">Usage events</th><th scope="col" className="num">Total tokens <Observed /></th><th scope="col" className="num">of which ESTIMATED</th></tr></thead>
        <tbody>
          <tr>
            <th scope="row">Usage with no case</th>
            <td className="num" data-f="unattributed_events">{fmt(model.unattributed_usage.events)}</td>
            <td className="num" data-f="unattributed_total">{fmt(model.unattributed_usage.observed.total)}</td>
            <td className="num" data-f="unattributed_estimated">{fmt(model.unattributed_usage.observed_estimated.total)}</td>
          </tr>
        </tbody>
      </table>

      <table data-table="lessons">
        <caption>Lessons injected by Task Economizer. The token figure is an attribution <Estimate />, not consumption. Estimated savings appear only when RealityTrace recorded one; Horizon computes no counterfactual.</caption>
        <thead><tr><th scope="col">Session</th><th scope="col">Injection event</th><th scope="col" className="num">Attributed input tokens <Estimate /></th><th scope="col">Token quality</th><th scope="col">Estimated savings</th></tr></thead>
        <tbody>
          {lessons.length === 0 ? (
            <tr><td colSpan={5}>No lesson injections recorded.</td></tr>
          ) : (
            lessons.map(({ session, lesson }) => (
              <tr key={lesson.event_id}>
                <th scope="row">{session.runtime} <code>{session.native_session_id}</code></th>
                <td><code>{lesson.event_id.slice(0, 12)}</code></td>
                <td className="num">{lesson.attributed_input_tokens === null ? "n/a" : fmt(lesson.attributed_input_tokens)}</td>
                <td>{lesson.token_quality ?? "n/a"}</td>
                <td><span className="badge none">no estimate recorded</span></td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <table data-table="journeys">
        <caption>Evidence: journey checks, declared versus observed. Undefined means declared but not observed in the session; it is neither a pass nor a failure. {fmt(model.declared_journey_questions)} journey questions declared.</caption>
        <thead><tr><th scope="col">Journey</th><th scope="col" className="num">Match</th><th scope="col" className="num">Mismatch</th><th scope="col" className="num">Undefined</th></tr></thead>
        <tbody>
          {journeyNames.length === 0 ? (
            <tr><td colSpan={4}>No journey questions declared or checked.</td></tr>
          ) : (
            journeyNames.map((name) => {
              const c = model.totals.journeys[name] ?? { match: 0, mismatch: 0, undefined: 0 };
              return (
                <tr key={name} data-journey={name}>
                  <th scope="row">{name}</th>
                  <td className="num">{fmt(c.match)}</td>
                  <td className="num">{fmt(c.mismatch)}</td>
                  <td className="num">{fmt(c.undefined)}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      <table data-table="residuals">
        <caption>Residuals from RealityTrace projections. They name disagreement between declared and observed; they are not attributed to a session.</caption>
        <thead><tr><th scope="col">Residual kind</th><th scope="col" className="num">Count</th></tr></thead>
        <tbody>
          {[...RESIDUAL_KINDS, ...Object.keys(model.residuals.by_kind).filter((k) => !(RESIDUAL_KINDS as readonly string[]).includes(k)).sort()].map((kind) => (
            <tr key={kind} data-residual={kind}>
              <th scope="row">{kind}</th>
              <td className="num">{fmt(model.residuals.by_kind[kind] ?? 0)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><th scope="row">Total</th><td className="num">{fmt(model.residuals.total)}</td></tr></tfoot>
      </table>

      <table data-table="ablation">
        <caption>Ablation by arm. {model.ablation.run ? "Arms recorded on events." : "Not run: no event carries an arm other than none."}</caption>
        <thead><tr><th scope="col">Arm</th><th scope="col" className="num">Sessions</th><th scope="col" className="num">Events</th><th scope="col" className="num">Observed tokens</th></tr></thead>
        <tbody>
          {model.ablation.run ? (
            model.ablation.rows.map((row) => (
              <tr key={row.arm}><th scope="row">{row.arm}</th><td className="num">{fmt(row.sessions)}</td><td className="num">{fmt(row.events)}</td><td className="num">{fmt(row.observed_total)}</td></tr>
            ))
          ) : (
            <tr><td colSpan={4}>not run</td></tr>
          )}
        </tbody>
      </table>
      <p className="muted">
        {fmt(model.audit.agent_events)} agent events counted once each by event id; {fmt(model.audit.duplicate_rows)} repeated rows ignored
        {model.audit.conflicting_rows > 0 ? `; ${fmt(model.audit.conflicting_rows)} repeats with different content ignored (first kept)` : ""}
        {model.audit.ignored_rows > 0 ? `; ${fmt(model.audit.ignored_rows)} malformed agent events skipped` : ""}.
      </p>
    </>
  );
}

function Notice({ title, children }: { readonly title: string; readonly children: ReactNode }): ReactNode {
  return (
    <section className="empty-state" role="status">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Body({ readout }: { readonly readout: EconomicsReadout }): ReactNode {
  switch (readout.state) {
    case "not_configured":
      return (
        <Notice title="Case economics is not configured">
          <p>Horizon reads this from RealityTrace, read-only, and keeps nothing itself. To enable it:</p>
          <ol>
            <li>Install the agent tap with RealityTrace: <code>te-agents install --with-realitytrace</code></li>
            <li>Enroll each repository you want measured: <code>te-agents rt enroll &lt;repo&gt;</code></li>
            <li>Point Horizon at the RealityTrace binary and the tap&apos;s store: set <code>HORIZON_ECONOMICS_REALITYTRACE_BIN</code> (and, if the tap does not use the default location, <code>HORIZON_ECONOMICS_DATA_HOME</code> and <code>HORIZON_ECONOMICS_STATE_HOME</code>), or add an <code>[economics]</code> table with <code>realitytrace_bin</code> to the Horizon config.</li>
          </ol>
          <p className="muted">This is not the store Horizon uses for obligation settlement; it is the tap&apos;s.</p>
        </Notice>
      );
    case "unavailable":
      return (
        <Notice title="RealityTrace could not be read">
          <p className="error" role="alert">{readout.message}</p>
          <p>Check that <code>HORIZON_ECONOMICS_REALITYTRACE_BIN</code> names a working <code>realitytrace</code> binary, then reload.</p>
        </Notice>
      );
    case "empty":
      return (
        <>
          <Notice title="No agent events recorded yet">
            <p>RealityTrace is reachable{readout.repos.length === 0 ? ", but no repository is enrolled" : ", but the store holds no agent events"}. Enroll a repository with <code>te-agents rt enroll &lt;repo&gt;</code>, work in it with the tap installed, and the tap&apos;s drain will record sessions here.</p>
          </Notice>
          {readout.repos.map((repo) => <RepoView key={repo.repo_id} repo={repo} />)}
        </>
      );
    case "ok":
      return <>{readout.repos.map((repo) => <RepoView key={repo.repo_id} repo={repo} />)}</>;
  }
}

export function EconomicsPage({ readout, theme }: { readonly readout: EconomicsReadout; readonly theme?: WorkspaceTheme }): ReactNode {
  return (
    <html lang="en" data-theme={theme}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <title>Horizon case economics</title>
        <style>{STYLE + EXTRA_STYLE}</style>
      </head>
      <body>
        <a className="skip" href="#main">Skip to the economics</a>
        <header>
          <div className="bar">
            <h1>Case economics</h1>
            <a href="/workspace">Back to the workspace</a>
          </div>
          <p className="state">A read-only view of what RealityTrace recorded about agent sessions. It never gates or authorizes anything.</p>
        </header>
        <main id="main" tabIndex={-1}>
          <Body readout={readout} />
        </main>
        <footer><p>Figures come from RealityTrace&apos;s ledger and projections. &quot;Observed&quot; is recorded usage; &quot;estimate&quot; is never added to it.</p></footer>
      </body>
    </html>
  );
}

export function renderEconomicsPage(readout: EconomicsReadout, theme?: WorkspaceTheme): string {
  return `<!doctype html>${renderToStaticMarkup(<EconomicsPage readout={readout} theme={theme} />)}`;
}
