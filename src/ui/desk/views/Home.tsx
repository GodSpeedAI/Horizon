/** @jsxImportSource react */
/**
 * The first-run steps, the decision receipt and the recent moves: what the old workspace page showed above and below the
 * surface, now part of Today. Plain forms post to the same routes as before and come straight back to the desk.
 */
import type { ReactNode } from "react";
import type { Action, FirstMove } from "../attention.ts";
import type { HomeState } from "../model.ts";
import type { WorkspaceMove } from "../../workspace/model.ts";

const CASE_ERROR: Readonly<Record<string, string>> = {
  empty: "The case cannot be blank.",
  too_long: "Keep the case to 200 characters or fewer.",
};

const when = (iso: string): string => iso.replace("T", " ").replace(/\.\d+Z$/, "Z").replace(/:\d\dZ$/, "Z");

export function ClaimRows({ move, prefix }: { readonly move: WorkspaceMove; readonly prefix: string }): ReactNode {
  const rows = [
    { key: "decided", label: "Decided", claim: move.decided },
    { key: "recorded", label: "Recorded", claim: move.recorded },
    { key: "observed", label: "Observed", claim: move.observed },
  ] as const;
  return (
    <dl className="claims" data-prefix={prefix}>
      {rows.map((row) => (
        <div key={row.key} className="claim" data-claim={row.key} data-state={row.claim.state}>
          <dt>{row.label}</dt>
          <dd>
            {row.claim.text}
            {row.claim.raw === undefined ? null : (
              <details>
                <summary>Recorded reason</summary>
                <code>{row.claim.raw}</code>
              </details>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function GettingStarted({ home, firstMove }: { readonly home: HomeState; readonly firstMove: FirstMove | null | undefined }): ReactNode {
  const steps = home.onboarding.steps;
  const active = steps.findIndex((step) => !step.done);
  return (
    <section id="getting-started" aria-labelledby="heading-start" className="getting-started">
      <div className="row">
        <h2 id="heading-start">Getting started</h2>
        <form method="post" action="/workspace/onboarding/skip">
          <button type="submit">Skip setup</button>
        </form>
      </div>
      <ol className="steps">
        {steps.map((step, index) => (
          <li key={step.id} data-step={step.id} data-done={String(step.done)} aria-current={index === active ? "step" : undefined}>
            <p>
              <span className="muted">Step {index + 1} of {steps.length}</span> <strong>{step.label}</strong>{" "}
              <span className="state-word">{step.done ? "Done" : index === active ? "To do" : "Later"}</span>
            </p>
            <p>{step.detail}</p>
            {step.fix === null ? null : <p>Fix: Start the cockpit with <code>bun run ignite</code> (see docs/IGNITION.md).</p>}
            {step.id === "case" && (!step.done || home.caseError !== null) ? (
              <form method="post" action="/workspace/case" className="case-form">
                <label htmlFor="case-purpose">What are you trying to move forward?</label>
                <div className="row">
                  <input id="case-purpose" name="purpose" type="text" maxLength={200} required aria-describedby={home.caseError ? "case-error" : undefined} />
                  <button type="submit">Open case</button>
                </div>
                {home.caseError === null ? null : (
                  <p id="case-error" role="alert" className="error">
                    {CASE_ERROR[home.caseError] ?? "The case was not opened."}
                  </p>
                )}
              </form>
            ) : null}
            {step.id === "move" && !step.done && index === active ? (
              firstMove === undefined ? (
                <p className="muted">Looking for a first move you can make…</p>
              ) : firstMove === null ? (
                <p>No move can be submitted from here yet. What blocks it is listed when you hand work off.</p>
              ) : (
                <form method="post" action="/workspace/intent">
                  <input type="hidden" name="action_id" value={firstMove.action_id} />
                  <input type="hidden" name="operation" value={firstMove.operation} />
                  <input type="hidden" name="frame_id" value={firstMove.frame_id} />
                  <input type="hidden" name="frame_revision" value={firstMove.frame_revision} />
                  <input type="hidden" name="focus" value={firstMove.focus} />
                  <button type="submit">{firstMove.label}</button>
                </form>
              )
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Receipt({ receipt, dispatch }: { readonly receipt: NonNullable<HomeState["receipt"]>; readonly dispatch: (action: Action) => void }): ReactNode {
  if (!receipt.found || receipt.move === null) {
    return (
      <section id="receipt" tabIndex={-1} aria-labelledby="heading-receipt" data-receipt="missing">
        <h2 id="heading-receipt">Decision receipt</h2>
        <p>
          <strong>No such commit.</strong> No move with this id is recorded. Check the link, or choose one under Recent moves.
        </p>
      </section>
    );
  }
  const move = receipt.move;
  return (
    <section id="receipt" tabIndex={-1} aria-labelledby="heading-receipt" data-receipt={move.decided.state}>
      <h2 id="heading-receipt">Decision receipt</h2>
      <p>
        Move <code>{move.intent_id}</code>, <code>{move.operation_ref}</code>
        {move.at === null ? "" : <>, <time dateTime={move.at}>{when(move.at)}</time></>}.
      </p>
      <ClaimRows move={move} prefix="receipt" />
      <div className="settlement" data-settlement={move.settlement.state}>
        <h3>Final sign-off</h3>
        <p>{move.settlement.text}</p>
        {move.observable || move.settleable ? (
          <p>
            This move can be checked now.{" "}
            <button type="button" onClick={() => dispatch({ type: "view", view: "decide" })}>
              Go to Decide
            </button>{" "}
            to preview it and sign it off with a typed reason.
          </p>
        ) : null}
      </div>
      {move.approval_identity?.state === "unverified" ? (
        <div className="approval" data-approval-identity="unverified">
          <h3>Waiting for a decision</h3>
          <p>This older record does not carry a verified approval id, so it cannot be approved from here.</p>
        </div>
      ) : null}
      {move.approval_id === null ? null : (
        <div className="approval" data-approval={move.approval_id}>
          <h3>Waiting for your decision</h3>
          <p>
            This move waits for your answer.{" "}
            <button type="button" onClick={() => dispatch({ type: "view", view: "decide" })}>
              Go to Decide
            </button>{" "}
            to preview and answer it.
          </p>
        </div>
      )}
    </section>
  );
}

export function Moves({ moves, assurance }: { readonly moves: readonly WorkspaceMove[]; readonly assurance: string }): ReactNode {
  return (
    <section aria-labelledby="moves-h" className="moves-section">
      <h2 id="moves-h">Recent moves</h2>
      {assurance === "unisolated-development" ? (
        <p role="alert" data-assurance={assurance} className="error">
          INSECURE (development only): approvals run without OS-isolated gateway protection and must not be treated as production-safe.
        </p>
      ) : assurance !== "governed" ? (
        <p role="status" data-assurance={assurance} className="muted">
          Approval isolation: not verified.
        </p>
      ) : null}
      {moves.length === 0 ? (
        <p className="empty">Moves you make and the refusals you get appear here, with what decided, recorded and observed each one. Next step: finish Getting started above, or hand work off.</p>
      ) : (
        <ol className="moves">
          {moves.map((move) => (
            <li key={move.intent_id} data-intent={move.intent_id}>
              <p>
                <a href={`/workspace?receipt=${encodeURIComponent(move.intent_id)}#receipt`}>
                  <code>{move.operation_ref}</code>
                </a>
                {move.at === null ? "" : <span className="muted"> · <time dateTime={move.at}>{when(move.at)}</time></span>}
              </p>
              <ClaimRows move={move} prefix="moves" />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
