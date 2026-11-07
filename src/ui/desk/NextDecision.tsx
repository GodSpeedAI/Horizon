/** @jsxImportSource react */
/**
 * "The next decision" from the shared frame (ported from the old workspace page): what can be done next from the current focus,
 * what cannot and why, and what is only possible from the terminal. A choice records an intent; it does not approve, run or settle anything.
 */
import type { ReactNode } from "react";
import type { WorkspaceChoice } from "../workspace/model.ts";
import type { NextState } from "./model.ts";

const statusText = (choice: WorkspaceChoice): string => (choice.available ? (choice.primary ? "Available, recommended" : "Available") : choice.status);

function Choice({ choice, focus }: { readonly choice: WorkspaceChoice; readonly focus: string }): ReactNode {
  const review = choice.review === null ? null : (
    <details>
      <summary>What choosing this means</summary>
      <dl>
        <dt>Can it be undone</dt><dd>{choice.review.reversibility}</dd>
        <dt>Payment</dt><dd>{choice.review.payment}</dd>
        <dt>Expected evidence</dt><dd>{choice.review.expected_evidence.length === 0 ? "none declared" : choice.review.expected_evidence.join(", ")}</dd>
        <dt>If the case keeper asks for approval</dt><dd>{choice.review.escalation}</dd>
      </dl>
      <p>Choosing records a request. It does not approve, run or sign off anything.</p>
    </details>
  );
  if (!choice.available) {
    return (
      <li data-operation={choice.operation_ref} data-status={choice.status}>
        <strong>{choice.label}</strong>: <span>{statusText(choice)}</span>
        <p>{choice.reason ?? "This choice is not available."}</p>
        {choice.next_step === null ? null : <p>Next: {choice.next_step}</p>}
        {review}
      </li>
    );
  }
  return (
    <li data-operation={choice.operation_ref} data-status={choice.status}>
      <form method="post" action="/workspace/intent">
        <input type="hidden" name="action_id" value={choice.action_id ?? ""} />
        <input type="hidden" name="operation" value={choice.operation_ref} />
        <input type="hidden" name="focus" value={focus} />
        <button type="submit">{choice.label}: {statusText(choice)}</button>
      </form>
      {review}
    </li>
  );
}

export function NextDecision({ next }: { readonly next: NextState | null }): ReactNode {
  if (next === null) {
    return (
      <section aria-labelledby="next-h" data-next>
        <h2 id="next-h">The next decision</h2>
        <p role="status">Still loading.</p>
      </section>
    );
  }
  const current = next.state === "ready" || next.state === "partial" || next.state === "blocked";
  // A choice that exists only at the terminal has no button here, so it is not listed.
  const shown = next.choices.filter((c) => !(c.available && c.action_id === null));
  return (
    <section aria-labelledby="next-h" data-next data-state={next.state}>
      <h2 id="next-h">The next decision</h2>
      {next.state === "error" ? <p role="alert">The workspace is unavailable. No decision is shown.</p> : null}
      {next.state === "empty" ? <p role="status">There is nothing to decide at this checkpoint.</p> : null}
      {next.state === "unknown" ? <p role="status">The checkpoint is unknown; this view is not current world state.</p> : null}
      {current ? (
        <>
          {next.blocked.length > 0 ? (
            <div className="blocked">
              <h3>What is not available, and why</h3>
              <ul>
                {next.blocked.map((entry) => (
                  <li key={entry.operation_ref} data-blocked={entry.operation_ref}>
                    <strong>{entry.label}</strong>: {entry.reason}
                    {entry.next_step === null ? null : <p>Next: {entry.next_step}</p>}
                    <details>
                      <summary>Checks and evidence</summary>
                      <ul>
                        {entry.gates.map((gate) => (
                          <li key={gate.gate}>{gate.gate}: {gate.verdict}{gate.reason === null ? "" : ` (${gate.reason})`}{gate.prerequisite_ref === null ? "" : ` (next: ${gate.prerequisite_ref})`}</li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {shown.length === 0 ? null : (
            <ol className="choices">
              {shown.map((choice) => (
                <Choice key={choice.operation_ref} choice={choice} focus={next.focus} />
              ))}
            </ol>
          )}
          {shown.length === 0 && next.blocked.length === 0 ? <p className="empty">Nothing is offered from this focus right now.</p> : null}
        </>
      ) : null}
    </section>
  );
}
