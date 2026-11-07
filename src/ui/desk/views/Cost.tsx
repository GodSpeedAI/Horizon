/** @jsxImportSource react */
/**
 * What agent work cost, per accepted outcome (design 6, ported from the stage 1 economics page). Read-only: it shows what the
 * record keeper recorded and gates nothing. "Observed" and "estimate" are separate words; an estimate is never added to an observed figure.
 * Cost per accepted outcome is "Not recorded" (with the reason) unless the case keeper says the outcome was accepted.
 */
import type { ReactNode } from "react";
import type { EconomicsRepo, EconomicsSkipped } from "../../../economics/readout.ts";
import { RESIDUAL_KINDS, type CaseModel, type EconomicsModel, type JourneyCounts, type SessionModel, type Totals } from "../../../economics/model.ts";
import { costLine, type CostPart } from "../work-build.ts";

const fmt = (n: number): string => n.toLocaleString("en-US");
const pct = (value: number | null): string => (value === null ? "Not recorded" : `${value.toFixed(1)}%`);
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
            <>
              Not tied to a case <span className="muted">(the record keeper names no case)</span>
            </>
          ) : (
            <>
              Case <code>{item.case_id}</code>
            </>
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

function PerAccepted({ model, cost }: { readonly model: EconomicsModel; readonly cost: CostPart }): ReactNode {
  return (
    <table data-table="per-accepted" className="cost">
      <caption>Cost per accepted outcome. Only an outcome the case keeper accepted counts. Without that, this says Not recorded and why; it is never 0.</caption>
      <thead>
        <tr>
          <th scope="col">Case</th>
          <th scope="col" className="num">Tokens used <Observed /></th>
          <th scope="col" className="num">Accepted outcomes</th>
          <th scope="col">Cost per accepted outcome</th>
        </tr>
      </thead>
      <tbody>
        {model.cases.map((item) => {
          const line = costLine(item, cost.knowledge);
          return (
            <tr key={item.case_id ?? "unbound"} data-cost-case={item.case_id ?? "unbound"} data-per-accepted={line.per_accepted === null ? "not-recorded" : String(line.per_accepted)}>
              <th scope="row">{item.case_id === null ? "Not tied to a case" : <code>{item.case_id}</code>}</th>
              <td className="num">{fmt(line.tokens)}</td>
              <td className="num">{line.accepted === null ? "Not recorded" : fmt(line.accepted)}</td>
              <td data-state={line.per_accepted === null ? "not-recorded" : "recorded"}>{line.words}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function ModelView({ model, cost }: { readonly model: EconomicsModel; readonly cost: CostPart }): ReactNode {
  const journeyNames = [...new Set([...model.cases.flatMap((c) => Object.keys(c.totals.journeys)), ...Object.keys(model.totals.journeys)])].sort();
  const lessons = model.cases.flatMap((c) => c.sessions.flatMap((s) => s.lessons.map((lesson) => ({ session: s, lesson }))));
  return (
    <>
      <PerAccepted model={model} cost={cost} />
      <details open>
        <summary>Usage in detail, per case and session</summary>
        <div className="table-wrap">
          <table data-table="cost">
            <caption>
              Observed usage and the helper tool&apos;s own cost, per case and session (tokens). Observed is what the AI tool itself reported. The estimate column is the part of it that was only estimated.
            </caption>
            <thead>
              <tr>
                <th scope="col">Case / session</th>
                <th scope="col" className="num">Input</th>
                <th scope="col" className="num">Output</th>
                <th scope="col" className="num">Cache read</th>
                <th scope="col" className="num">Cache write</th>
                <th scope="col" className="num">Total <Observed /></th>
                <th scope="col" className="num">Of which estimated</th>
                <th scope="col" className="num">Helper tool cost</th>
                <th scope="col" className="num">Helper cost % of observed</th>
                <th scope="col" className="num">Helper-injected <Estimate /></th>
                <th scope="col" className="num">Tool failures</th>
                <th scope="col" className="num">Checks agreed</th>
                <th scope="col" className="num">Checks disagreed</th>
                <th scope="col" className="num">Checks not seen</th>
              </tr>
            </thead>
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
      </details>

      <table data-table="unattributed">
        <caption>Usage with no known case. It is included in the not-tied rows above and listed here so it cannot hide.</caption>
        <thead><tr><th scope="col">Line</th><th scope="col" className="num">Usage events</th><th scope="col" className="num">Total tokens <Observed /></th><th scope="col" className="num">Of which estimated</th></tr></thead>
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
        <caption>Lessons the helper tool injected. The token figure is an attribution <Estimate />, not consumption. Savings appear only when the record keeper recorded one; Horizon works out no counterfactual.</caption>
        <thead><tr><th scope="col">Session</th><th scope="col">Event</th><th scope="col" className="num">Attributed input tokens <Estimate /></th><th scope="col">How sure</th><th scope="col">Estimated savings</th></tr></thead>
        <tbody>
          {lessons.length === 0 ? (
            <tr><td colSpan={5}>No lesson injections recorded.</td></tr>
          ) : (
            lessons.map(({ session, lesson }) => (
              <tr key={lesson.event_id}>
                <th scope="row">{session.runtime} <code>{session.native_session_id}</code></th>
                <td><code>{lesson.event_id.slice(0, 12)}</code></td>
                <td className="num">{lesson.attributed_input_tokens === null ? "Not recorded" : fmt(lesson.attributed_input_tokens)}</td>
                <td>{lesson.token_quality ?? "Not recorded"}</td>
                <td><span className="badge none">no estimate recorded</span></td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <table data-table="journeys">
        <caption>Checks: what was declared, against what was seen. Not seen means declared but never observed in the session; it is neither a pass nor a failure. {fmt(model.declared_journey_questions)} checks declared.</caption>
        <thead><tr><th scope="col">Check</th><th scope="col" className="num">Agreed</th><th scope="col" className="num">Disagreed</th><th scope="col" className="num">Not seen</th></tr></thead>
        <tbody>
          {journeyNames.length === 0 ? (
            <tr><td colSpan={4}>No checks declared or run.</td></tr>
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
        <caption>Disagreements the record keeper found between what was declared and what was seen. They are not tied to a session.</caption>
        <thead><tr><th scope="col">Kind</th><th scope="col" className="num">Count</th></tr></thead>
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
        <caption>Comparison by arm. {model.ablation.run ? "Arms recorded on events." : "Not run: no event carries an arm other than none."}</caption>
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

function RepoView({ repo, cost }: { readonly repo: EconomicsRepo; readonly cost: CostPart }): ReactNode {
  return (
    <section aria-labelledby={`repo-${repo.repo_id}`} data-repo={repo.repo_id}>
      <h3 id={`repo-${repo.repo_id}`}>Repository <code>{repo.repo_id}</code></h3>
      {repo.path ? <p className="muted"><code>{repo.path}</code></p> : null}
      {repo.error ? (repo.model === null ? <p className="error" role="alert">{repo.error}</p> : <p className="muted" role="note">{repo.error}</p>) : null}
      {repo.model === null ? null : <ModelView model={repo.model} cost={cost} />}
    </section>
  );
}

function Notice({ title, children }: { readonly title: string; readonly children: ReactNode }): ReactNode {
  return (
    <section className="empty-state" role="status">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function SkippedNote({ skipped }: { readonly skipped: EconomicsSkipped }): ReactNode {
  const parts: string[] = [];
  if (skipped.without_agent_activity > 0) parts.push(`${fmt(skipped.without_agent_activity)} enrolled ${skipped.without_agent_activity === 1 ? "repository has" : "repositories have"} no agent events`);
  if (skipped.missing_folder > 0) parts.push(`${fmt(skipped.missing_folder)} ${skipped.missing_folder === 1 ? "is" : "are"} enrolled at a folder that no longer exists`);
  if (parts.length === 0) return null;
  return <p className="muted" data-skipped="true">Not shown: {parts.join("; ")}.</p>;
}

export function Cost({ cost }: { readonly cost: CostPart }): ReactNode {
  const readout = cost.readout;
  return (
    <section aria-labelledby="cost-h" data-cost className="cost-view">
      <h2 id="cost-h">What agent work cost</h2>
      <p className="muted">A read-only view of what the record keeper recorded about agent sessions. It never gates or allows anything.</p>
      {readout.state === "not_configured" ? (
        <Notice title="Cost is not set up">
          <p>Horizon reads this from the record keeper, read-only, and keeps nothing itself. Cost per accepted outcome: Not recorded, because there is no source for it. To set it up:</p>
          <ol>
            <li>Install the agent tap with the record keeper: <code>te-agents install --with-realitytrace</code></li>
            <li>Enroll each repository you want measured: <code>te-agents rt enroll &lt;repo&gt;</code></li>
            <li>Point Horizon at the record keeper and the tap&apos;s store: set <code>HORIZON_ECONOMICS_REALITYTRACE_BIN</code> (and, if the tap does not use the default location, <code>HORIZON_ECONOMICS_DATA_HOME</code> and <code>HORIZON_ECONOMICS_STATE_HOME</code>), or add an <code>[economics]</code> table with <code>realitytrace_bin</code> to the Horizon config.</li>
          </ol>
        </Notice>
      ) : readout.state === "unavailable" ? (
        <Notice title="The record keeper could not be read">
          <p className="error" role="alert">{readout.message}</p>
          <p>Cost per accepted outcome: Not recorded. Check that <code>HORIZON_ECONOMICS_REALITYTRACE_BIN</code> names a working <code>realitytrace</code> program, then reload.</p>
        </Notice>
      ) : (
        <>
          {readout.state === "empty" ? (
            <Notice title="No agent events recorded yet">
              <p>Cost per accepted outcome: Not recorded. The record keeper is reachable, but no enrolled repository holds agent events yet. Enroll one with <code>te-agents rt enroll &lt;repo&gt;</code> and work in it with the tap installed.</p>
            </Notice>
          ) : null}
          {readout.repos.map((repo) => (
            <RepoView key={repo.repo_id} repo={repo} cost={cost} />
          ))}
          <SkippedNote skipped={readout.skipped} />
        </>
      )}
      <p className="muted">Figures come from the record keeper&apos;s ledger. &quot;Observed&quot; is recorded usage; &quot;estimate&quot; is never added to it.</p>
    </section>
  );
}
