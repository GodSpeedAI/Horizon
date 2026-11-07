/** @jsxImportSource react */
/**
 * The debugger answer and the cited reference material (ported from the old workspace page).
 * An answer is a table of labelled facts, never a sentence made from them: the class and source travel with each value, and an
 * answer says in words that it grants no authority and settles nothing. Cited text is quoted reference material and never fact;
 * with no citation it says "No sources".
 */
import type { ReactNode } from "react";
import type { InspectionAnswer, } from "./model.ts";
import type { WorkspaceDebugger, WorkspaceRetrieval } from "../workspace/model.ts";

export function DebuggerAnswer({ answer }: { readonly answer: WorkspaceDebugger }): ReactNode {
  return (
    <div id="debugger-answer" data-operation={answer.operation} data-status={answer.status}>
      <h3>{`${answer.operation}: ${answer.question}`}</h3>
      {answer.status === "ok" ? null : (
        <p role="status">
          {answer.status === "refused" ? "Refused" : "Unavailable"}
          {answer.code === null ? "" : ` (${answer.code})`}
          {answer.message === null ? "" : `: ${answer.message}`}
        </p>
      )}
      {answer.values.length === 0 ? (
        <p>No labelled value was produced.</p>
      ) : (
        <table>
          <caption>{`Values for ${answer.operation}`}</caption>
          <thead>
            <tr><th scope="col">Fact</th><th scope="col">Value</th><th scope="col">Kind of fact</th><th scope="col">Source</th></tr>
          </thead>
          <tbody>
            {answer.values.map((entry) => (
              <tr key={`${entry.key}:${entry.source}`}>
                <th scope="row">{entry.key}</th>
                <td>{entry.value}</td>
                <td><code>{entry.class}</code></td>
                <td><code>{entry.source}</code>{entry.missing_source === null ? null : <span> (not recorded: {entry.missing_source})</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {answer.unknown_remainder.length === 0 ? null : (
        <details>
          <summary>What this answer does not claim</summary>
          <ul>{answer.unknown_remainder.map((note) => <li key={note}>{note}</li>)}</ul>
        </details>
      )}
      <p className="muted">
        {answer.authority ? "Authority granted." : "Grants no authority."} {answer.settles ? "Settles." : "Settles nothing."}
        {answer.compared_checkpoint === null ? null : <> Answered about checkpoint <code>{answer.compared_checkpoint}</code>.</>}
      </p>
    </div>
  );
}

export function ReferenceCitations({ retrieval }: { readonly retrieval: WorkspaceRetrieval | null }): ReactNode {
  if (retrieval === null) {
    return (
      <div id="reference-citations" data-outcome="none" data-canonical="false">
        <h3>Reference material</h3>
        <p data-no-sources>No sources. No question text was asked, so nothing was looked up, and nothing here is fact.</p>
      </div>
    );
  }
  return (
    <div id="reference-citations" data-outcome={retrieval.outcome} data-canonical="false">
      <h3>Reference material</h3>
      <p>
        <strong>{retrieval.outcome}</strong>: {retrieval.detail}
      </p>
      <p className="muted">
        Lookup {retrieval.liveness.observed ? (retrieval.liveness.ok ? "observed live" : "observed unavailable") : "liveness not observed"}
        {retrieval.liveness.observed ? ` (${retrieval.liveness.detail})` : ""}
        {retrieval.corpus_id === null ? "" : ` · library ${retrieval.corpus_id}`}
        {retrieval.query === null ? "" : ` · question “${retrieval.query}”`}
        {retrieval.truncated ? " · cut short" : ""}
      </p>
      {retrieval.references.length === 0 ? (
        <p data-no-sources>No sources. Nothing was cited, so nothing here is fact.</p>
      ) : (
        <ol>
          {retrieval.references.map((reference) => (
            <li key={`${reference.uri}:${reference.anchor ?? ""}`}>
              <blockquote cite={reference.uri}>
                {reference.heading === null ? null : <p><strong>{reference.heading}</strong></p>}
                <p>{reference.excerpt}</p>
              </blockquote>
              <cite>
                {reference.uri}
                {reference.anchor === null ? "" : `#${reference.anchor}`}
              </cite>
              {reference.score === null ? null : <span> · score {reference.score}</span>}
              <span> · <code>{reference.class}</code></span>
            </li>
          ))}
        </ol>
      )}
      <p className="muted">Not canonical: reference material for context, not organizational truth.</p>
    </div>
  );
}

export const DEBUGGER_QUESTIONS = ["why", "impact", "diff", "timeline", "counterfactual", "reach", "replay"] as const;

export interface InspectIo {
  /** Asks one debugger question about the shared focus. A failure comes back as words; nothing throws. */
  readonly inspect: (operation: string, query: string) => Promise<{ readonly ok: true; readonly answer: InspectionAnswer } | { readonly ok: false; readonly message: string }>;
}

export interface InspectPanelProps {
  readonly inspection: { readonly operation: string; readonly query: string; readonly busy: boolean; readonly answer: InspectionAnswer | null; readonly problem: string | null } | null;
  readonly operations: readonly string[];
  readonly onAsk: (operation: string, query: string) => void;
}

const QUESTIONS: Readonly<Record<string, string>> = {
  why: "Why is it this way?",
  impact: "What does it affect?",
  diff: "What changed?",
  timeline: "What happened, in order?",
  counterfactual: "What if it were different?",
  reach: "What can reach it?",
  replay: "Replay what happened",
};

/** Ask one of the seven questions about the shared focus, optionally with a question to look up in the reference library. */
export function InspectPanel({ inspection, operations, onAsk }: InspectPanelProps): ReactNode {
  return (
    <section className="inspect-panel" aria-labelledby="inspect-h" data-inspect-panel>
      <h2 id="inspect-h">Ask about the focus</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onAsk(String(form.get("operation") ?? "why"), String(form.get("query") ?? ""));
        }}
      >
        <label>
          Question
          <select name="operation" defaultValue={inspection?.operation ?? "why"}>
            {operations.map((op) => (
              <option key={op} value={op}>{QUESTIONS[op] ?? op}</option>
            ))}
          </select>
        </label>
        <label>
          Look up in the reference library (optional)
          <input type="text" name="query" defaultValue={inspection?.query ?? ""} />
        </label>
        <button type="submit" disabled={inspection?.busy === true}>{inspection?.busy ? "Asking…" : "Ask"}</button>
      </form>
      {inspection?.problem ? <p role="alert" className="error">{inspection.problem}</p> : null}
      {inspection?.answer ? (
        <>
          <DebuggerAnswer answer={inspection.answer.debugger} />
          <ReferenceCitations retrieval={inspection.answer.retrieval} />
        </>
      ) : null}
    </section>
  );
}
