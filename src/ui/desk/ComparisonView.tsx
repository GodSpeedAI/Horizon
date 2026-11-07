/** @jsxImportSource react */
/**
 * "What the agent reports" next to "What the independent record shows" (design 5.7), ported from the stage 1 server page.
 * Rows with no real data behind them say "not recorded" and why. Presenting is applied before the data reaches this file,
 * so no real project name is drawn while it is on.
 */
import type { ReactNode } from "react";
import { NOT_RECORDED, type CompareView } from "../workspace/compare-model.ts";

function Cell({ text, why }: { readonly text: string; readonly why?: string | undefined }): ReactNode {
  const missing = text.startsWith(NOT_RECORDED);
  return (
    <td data-state={missing ? "not-recorded" : "recorded"}>
      {text}
      {missing && why ? <span className="why">{why}</span> : null}
    </td>
  );
}

export function ComparisonView({ view }: { readonly view: CompareView }): ReactNode {
  return (
    <section aria-labelledby="cmp-h" data-session={view.session.session_id} className="comparison">
      <h2 id="cmp-h">
        Session <code>{view.session.session_id}</code>{" "}
        <span className="pill" data-outcome={view.session.outcome}>
          {view.session.outcome}
        </span>
      </h2>
      <p className="muted">
        {view.session.kind === "agent" ? `Copied from ${view.session.runtime} by the session copier.` : "Run in the workshop."} {view.session.events} events
        {view.session.first_ts ? `, ${view.session.first_ts} to ${view.session.last_ts}` : ""}.{" "}
        {view.workshop_link ? (
          <a href={view.workshop_link} data-workshop-link>
            Open this session in the workshop
          </a>
        ) : (
          <span data-workshop-link-absent>No workshop link: {view.workshop_link_reason}.</span>
        )}
      </p>
      <table className="cmp" data-table="comparison">
        <thead>
          <tr>
            <th scope="col">Row</th>
            <th scope="col">What the agent reports</th>
            <th scope="col">What the independent record shows</th>
          </tr>
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
