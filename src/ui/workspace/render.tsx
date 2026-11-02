/** @jsxImportSource react */
/**
 * Semantic, server-rendered GUI for one workspace snapshot (T09).
 *
 * There is deliberately no client bundle: buttons are native form submissions, so keyboard,
 * focus, screen-reader semantics and the reduced-motion equivalent do not depend on JavaScript.
 * The renderer is a pure function of the workspace model and the stored chrome it is given; it
 * cannot enable an action, evaluate a gate or approve anything. Every form posts the frame and the
 * source refs it displayed, and the server refuses a stale or blocked submission through the same
 * canonical intent path.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CognateProvider, useProjection } from "@godspeedai/cognate-react";
import { createClient } from "@godspeedai/cognate-client";
import type { Caller, RuntimeService } from "@godspeedai/cognate-runtime-api";
import type { NavigationFrame } from "../../domain/navigation.ts";
import { OperationalLinkV1, OperationalObjectV1 } from "../../domain/operational.ts";
import type { GuiView } from "../surface2/project.ts";
import {
  loadingWorkspace,
  buildWorkspace,
  WORKSPACE_SCHEMA,
  type PrimaryAction,
  primaryActionOf,
  type WorkspaceChrome,
  type WorkspaceDebugger,
  type WorkspaceFrameRef,
  type WorkspaceMove,
  type WorkspaceReceipt,
  type WorkspaceRetrieval,
  type WorkspaceTheme,
} from "./model.ts";
import type { WorkspaceAction, WorkspaceChoice, WorkspaceEvidence, WorkspaceSnapshot } from "./model.ts";
import { readableTime } from "./model.ts";

export interface WorkspaceProps {
  readonly snapshot: WorkspaceSnapshot;
  /** Stored and configured state for the first-run path, status rail, receipt and moves. */
  readonly chrome?: WorkspaceChrome;
  readonly basePath?: string;
  readonly intentPath?: string;
}

const THEME_LABEL: Readonly<Record<WorkspaceSnapshot["theme"], string>> = { light: "Dark", dark: "Light" };

/** The fixed copy for each case-form refusal. The submitted text is never echoed. */
const CASE_ERROR: Readonly<Record<string, string>> = {
  empty: "Enter what you are trying to move forward. The case cannot be blank.",
  too_long: "Keep the case to 200 characters or fewer.",
};

function actorLabel(evidence: WorkspaceEvidence): string {
  if (evidence.actor.role === "agent") {
    return `${evidence.actor.agent_ref ?? evidence.actor.actor_ref} acting for ${evidence.actor.on_behalf_of ?? "an unnamed principal"}`;
  }
  return evidence.actor.role;
}

function queryOf(snapshot: WorkspaceSnapshot, overrides: Readonly<Record<string, string | null>>): string {
  const values: [string, string][] = [];
  const focus = snapshot.frame.focus_ref;
  if (focus !== "") values.push(["focus", focus]);
  if (snapshot.evidence_ref !== null) values.push(["evidence", snapshot.evidence_ref]);
  if (snapshot.theme_chosen) values.push(["theme", snapshot.theme]);
  for (const [key, value] of Object.entries(overrides)) {
    const existing = values.findIndex(([name]) => name === key);
    if (value === null) {
      if (existing !== -1) values.splice(existing, 1);
    } else if (existing === -1) values.push([key, value]);
    else values[existing] = [key, value];
  }
  return values.length === 0 ? "" : `?${values.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&")}`;
}

function statusText(choice: WorkspaceChoice): string {
  if (choice.available) return choice.primary ? "Available, recommended" : "Available";
  return choice.status;
}

function Choice({ choice, snapshot, intentPath }: { readonly choice: WorkspaceChoice; readonly snapshot: WorkspaceSnapshot; readonly intentPath: string }): ReactNode {
  const review = choice.review === null ? null : (
    <details>
      <summary>What this commitment means</summary>
      <dl>
        <dt>Reversibility</dt><dd>{choice.review.reversibility}</dd>
        <dt>Payment</dt><dd>{choice.review.payment}</dd>
        <dt>Expected evidence</dt><dd>{choice.review.expected_evidence.length === 0 ? "none declared" : choice.review.expected_evidence.join(", ")}</dd>
        <dt>If authority escalates</dt><dd>{choice.review.escalation}</dd>
      </dl>
      <p>Choosing records an intent. It does not approve, execute or settle the operation.</p>
    </details>
  );
  if (!choice.available) {
    return (
      <li data-operation={choice.operation_ref} data-status={choice.status}>
        <strong>{choice.label}</strong>{": "}
        <span>{statusText(choice)}</span>
        <p>{choice.reason ?? "This choice is not available."}</p>
        {choice.next_step === null ? null : <p>Next: {choice.next_step}</p>}
        {review}
      </li>
    );
  }
  return (
    <li data-operation={choice.operation_ref} data-status={choice.status}>
      <form method="post" action={intentPath}>
        <input type="hidden" name="action_id" value={choice.action_id ?? ""} />
        <input type="hidden" name="operation" value={choice.operation_ref} />
        <input type="hidden" name="focus" value={snapshot.frame.focus_ref} />
        <input type="hidden" name="evidence" value={snapshot.evidence_ref ?? ""} />
        <input type="hidden" name="theme" value={snapshot.theme_chosen ? snapshot.theme : ""} />
        <button type="submit">{choice.label}: {statusText(choice)}</button>
      </form>
      {review}
    </li>
  );
}

function Lineage({ snapshot }: { readonly snapshot: WorkspaceSnapshot }): ReactNode {
  const lineage = snapshot.lineage;
  if (lineage.total_nodes === 0 && lineage.total_edges === 0) {
    return <p>No lineage has been recorded at this checkpoint.</p>;
  }
  const count = Math.max(1, lineage.nodes.length);
  const width = 720;
  const height = Math.max(240, Math.ceil(count / 4) * 150);
  const positions = lineage.nodes.map((node, index) => {
    const columns = Math.min(4, count);
    const column = index % columns;
    const row = Math.floor(index / columns);
    return { node, x: 90 + column * 180, y: 60 + row * 140 };
  });
  const byId = new Map(positions.map((entry) => [entry.node.id, entry]));
  return (
    <div className="lineage">
      <figure>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="lineage-title lineage-desc" preserveAspectRatio="xMidYMid meet">
          <title id="lineage-title">Lineage graph</title>
          <desc id="lineage-desc">
            {`${lineage.nodes.length} of ${lineage.total_nodes} objects and ${lineage.edges.length} of ${lineage.total_edges} links. The table below lists every row.`}
          </desc>
          {lineage.edges.map((edge, index) => {
            const from = byId.get(edge.from);
            const to = byId.get(edge.to);
            if (from === undefined || to === undefined) return null;
            return <line key={`edge-${index}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="edge" />;
          })}
          {positions.map(({ node, x, y }) => (
            <g key={node.id} transform={`translate(${x},${y})`}>
              <circle r="26" className="node" />
              <text textAnchor="middle" y="4" className="node-label">{node.semantic_ref.split(":").at(-1)?.slice(0, 12) ?? "object"}</text>
              <text textAnchor="middle" y="44" className="node-caption">{node.label.slice(0, 22)}</text>
            </g>
          ))}
        </svg>
        <figcaption>
          Opens fit-to-content. {lineage.aggregated ? `${lineage.omitted_nodes} nodes and ${lineage.omitted_edges} links are folded beyond the ${lineage.limit}-node bound; ` : ""}
          the table is the complete equivalent projection.
        </figcaption>
      </figure>
      <table>
        <caption>Lineage as a table (equivalent projection)</caption>
        <thead><tr>{lineage.table.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>
          {lineage.table.rows.map((row, index) => (
            <tr key={`row-${index}`}>{row.map((cell, cellIndex) => <td key={`cell-${cellIndex}`}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Evidence({ evidence, snapshot, basePath }: { readonly evidence: WorkspaceEvidence; readonly snapshot: WorkspaceSnapshot; readonly basePath: string }): ReactNode {
  const selected = snapshot.evidence_ref === evidence.node_id;
  return (
    <article data-evidence={evidence.node_id} aria-current={selected ? "true" : undefined} className={selected ? "selected" : undefined}>
      <h3>{evidence.label}</h3>
      {evidence.text === null ? null : <p>{evidence.text}</p>}
      <p className="actor">{actorLabel(evidence)}</p>
      <details>
        <summary>Sources for this evidence</summary>
        <ul>
          {evidence.sources.map((source) => (
            <li key={`${source.expression}:${source.status}`}>
              <code>{source.expression}</code>: {source.status}, {source.detail}
              {source.agent_supplied ? " (agent-supplied)" : ""}
            </li>
          ))}
        </ul>
      </details>
      <a href={`${basePath}${queryOf(snapshot, { evidence: selected ? null : evidence.node_id })}`}>
        {selected ? "Stop inspecting this evidence" : "Inspect this evidence"}
      </a>
    </article>
  );
}

/**
 * One debugger answer (T10).
 *
 * The block is a table of labelled facts, never a sentence assembled from them: the class and the
 * source travel with each value, and the authority/settlement refusal is restated literally so a
 * reader cannot mistake an answer for a decision. An `unknown` value shows exactly what the source
 * does not record.
 */
function DebuggerAnswer({ answer }: { readonly answer: WorkspaceDebugger }): ReactNode {
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
            <tr><th scope="col">Fact</th><th scope="col">Value</th><th scope="col">Class</th><th scope="col">Source</th></tr>
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
      <p>
        <small>
          {answer.authority ? "Authority granted." : "Grants no authority."} {answer.settles ? "Settles." : "Settles nothing."}
          {answer.compared_checkpoint === null ? null : <> Answered about checkpoint <code>{answer.compared_checkpoint}</code>.</>}
        </small>
      </p>
    </div>
  );
}

/**
 * Cited reference material beside the focus (T10, REQ-STACK-005).
 *
 * The outcome and the observed liveness are printed before the citations, because "nothing
 * matched", "the kernel refused", "the kernel is down" and "no kernel is configured" are four
 * different facts. Excerpts are shown as quoted text: they can inform a reader, and cannot become
 * an action, a label or a claim about the world.
 */
function ReferenceCitations({ retrieval }: { readonly retrieval: WorkspaceRetrieval }): ReactNode {
  return (
    <div id="reference-citations" data-outcome={retrieval.outcome} data-canonical="false">
      <h3>Reference material</h3>
      <p>
        <strong>{retrieval.outcome}</strong>: {retrieval.detail}
      </p>
      <p>
        <small>
          Retrieval {retrieval.liveness.observed ? (retrieval.liveness.ok ? "observed live" : "observed unavailable") : "liveness not observed"}
          {retrieval.liveness.observed ? ` (${retrieval.liveness.detail})` : ""}
          {retrieval.corpus_id === null ? "" : ` · corpus ${retrieval.corpus_id}`}
          {retrieval.query === null ? "" : ` · query “${retrieval.query}”`}
          {retrieval.truncated ? " · truncated" : ""}
        </small>
      </p>
      {retrieval.references.length === 0 ? (
        <p>No reference text is cited.</p>
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
      <p><small>{retrieval.canonical ? "Canonical." : "Not canonical: scoped reference material, not organizational truth."}</small></p>
    </div>
  );
}

/** The three claims, each in its own row. They are never merged into one success state. */
function ClaimRows({ move, prefix }: { readonly move: WorkspaceMove; readonly prefix: string }): ReactNode {
  const rows: readonly { readonly key: string; readonly label: string; readonly claim: WorkspaceMove["decided"] }[] = [
    { key: "decided", label: "Decided", claim: move.decided },
    { key: "recorded", label: "Recorded", claim: move.recorded },
    { key: "observed", label: "Observed", claim: move.observed },
  ];
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

/** The decision receipt after a commit: stored facts only, addressed by intent id. */
/** The one next step, named first. A link to where the operator acts; this panel submits nothing. */
function PrimaryActionPanel({ action }: { readonly action: PrimaryAction }): ReactNode {
  return (
    <section id="primary-action" aria-labelledby="heading-primary-action" data-kind={action.kind} className="primary-action">
      <h2 id="heading-primary-action">What to do now</h2>
      <p><a href={action.href}><strong>{action.title}</strong></a></p>
      <p>{action.reason}</p>
    </section>
  );
}

function Receipt({ receipt, basePath }:{ readonly receipt: WorkspaceReceipt; readonly basePath: string }): ReactNode {
  if (!receipt.found || receipt.move === null) {
    return (
      <section id="receipt" tabIndex={-1} aria-labelledby="heading-receipt" data-receipt="missing">
        <h2 id="heading-receipt">Decision receipt</h2>
        <p><strong>No such commit.</strong> No intent with this id is recorded. Check the link, or choose a move under The next decision.</p>
      </section>
    );
  }
  const move = receipt.move;
  return (
    <section id="receipt" tabIndex={-1} aria-labelledby="heading-receipt" data-receipt={move.decided.state}>
      <h2 id="heading-receipt">Decision receipt</h2>
      <p>
        Intent <code>{move.intent_id}</code>, operation <code>{move.operation_ref}</code>
        {move.at === null ? "" : <>, <time dateTime={move.at}>{readableTime(move.at)}</time></>}.
      </p>
      <ClaimRows move={move} prefix="receipt" />
      <div className="settlement" data-settlement={move.settlement.state}>
        <h3>Settlement</h3>
        <p>{move.settlement.text}</p>
        {move.observable ? (
          <form method="post" action={`${basePath}/settle`}>
            <input type="hidden" name="intent_id" value={move.intent_id} />
            <input type="hidden" name="phase" value="observe" />
            <p>RealityTrace observes the committed trace and sends the evidence to SEA-Forge. SEA-Forge has not ruled yet.</p>
            <button type="submit">Observe with RealityTrace</button>
          </form>
        ) : null}
        {move.settleable ? (
          <form method="post" action={`${basePath}/settle`}>
            <input type="hidden" name="intent_id" value={move.intent_id} />
            <input type="hidden" name="phase" value="rule" />
            <p>SEA-Forge rules on the observed evidence. This answer is recorded and is final once SEA-Forge settles it.</p>
            <button type="submit">Ask SEA-Forge to rule</button>
          </form>
        ) : null}
      </div>
      {move.approval_id === null ? null : (
        <div className="approval" data-approval={move.approval_id}>
          <h3>Waiting for your decision</h3>
          {receipt.approvals ? (
            <>
              <p>Approving records your decision at SEA-Forge under your operator identity. SEA-Forge then checks the move again and commits it once.</p>
              <form method="post" action={`${basePath}/approval`} className="actions-row">
                <input type="hidden" name="approval_id" value={move.approval_id} />
                <button type="submit" name="decision" value="approve">Approve</button>
                <button type="submit" name="decision" value="reject" className="quiet">Reject</button>
              </form>
            </>
          ) : (
            <p>
              Approvals are not configured, so nobody can answer this escalation here. Set <code>COGNATE_SEA_FORGE_OPERATOR</code> to your operator id,
              or start the cockpit with <code>bun run ignite</code>, which sets it.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** A surface action as a native form; the same form serves the action list and the first-run step. */
function ActionForm({ action, snapshot, intentPath }: { readonly action: WorkspaceAction; readonly snapshot: WorkspaceSnapshot; readonly intentPath: string }): ReactNode {
  return (
    <form method="post" action={intentPath}>
      <input type="hidden" name="action_id" value={action.action_id} />
      <input type="hidden" name="operation" value={action.operation} />
      <input type="hidden" name="frame_id" value={snapshot.frame.frame_id} />
      <input type="hidden" name="frame_revision" value={String(snapshot.frame.revision)} />
      <input type="hidden" name="focus" value={snapshot.frame.focus_ref} />
      <input type="hidden" name="evidence" value={snapshot.evidence_ref ?? ""} />
      <input type="hidden" name="theme" value={snapshot.theme_chosen ? snapshot.theme : ""} />
      <button type="submit">{action.label}{action.consequential ? " (records an intent)" : ""}</button>
    </form>
  );
}

/** The first-run path: three steps, one active at a time, with the skip choice always visible. */
function GettingStarted({ chrome, snapshot, basePath, intentPath }: { readonly chrome: WorkspaceChrome; readonly snapshot: WorkspaceSnapshot; readonly basePath: string; readonly intentPath: string }): ReactNode {
  const steps = chrome.onboarding.steps;
  const active = steps.findIndex((step) => !step.done);
  const submittable = snapshot.actions.filter((action) => action.submit);
  const firstMove = submittable.find((action) => action.operation === "horizon.health") ?? submittable[0] ?? null;
  return (
    <section id="getting-started" aria-labelledby="heading-start">
      <div className="panel-head">
        <h2 id="heading-start">Getting started</h2>
        <form method="post" action={`${basePath}/onboarding/skip`}>
          <button type="submit" className="quiet">Skip setup</button>
        </form>
      </div>
      <ol className="steps">
        {steps.map((step, index) => (
          <li key={step.id} data-step={step.id} data-done={String(step.done)} aria-current={index === active ? "step" : undefined}>
            <p>
              <span className="step-no">Step {index + 1} of {steps.length}</span>{" "}
              <strong>{step.label}</strong>{" "}
              <span className="step-state">{step.done ? "✓ Done" : index === active ? "○ To do" : "○ Later"}</span>
            </p>
            <p>{step.detail}</p>
            {step.fix === null ? null : <p>Fix: Start the cockpit with <code>bun run ignite</code> (see docs/IGNITION.md).</p>}
            {step.id === "case" && (!step.done || chrome.caseError !== null) ? (
              <form method="post" action={`${basePath}/case`} className="case-form">
                <label htmlFor="case-purpose">What are you trying to move forward?</label>
                <div className="actions-row">
                  <input id="case-purpose" name="purpose" type="text" maxLength={200} required aria-describedby={chrome.caseError ? "case-error" : undefined} />
                  <button type="submit">Open case</button>
                </div>
                {chrome.caseError === null ? null : <p id="case-error" role="alert" className="error">{CASE_ERROR[chrome.caseError] ?? "The case was not opened."}</p>}
              </form>
            ) : null}
            {step.id === "case" && step.done && chrome.openCase !== null ? <p>Open case: {chrome.openCase.purpose}</p> : null}
            {step.id === "move" && !step.done ? (
              firstMove ? (
                <div className="step-action">
                  <ActionForm action={firstMove} snapshot={snapshot} intentPath={intentPath} />
                </div>
              ) : (
                <p>No move can be submitted from this focus yet. The blocked reasons are under The next decision.</p>
              )
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Your governed moves: newest first, each with its three claims, linked to its receipt. */
function Moves({ moves, basePath, visible }: { readonly moves: readonly WorkspaceMove[]; readonly basePath: string; readonly visible: boolean }): ReactNode {
  if (moves.length === 0) {
    return (
      <p>
        Committed moves and refusals appear here with what decided, recorded and observed each one.{" "}
        {visible ? "Commit your first governed move in step 3 of Getting started." : "Choose a move under The next decision to add one."}
      </p>
    );
  }
  return (
    <ol className="moves">
      {moves.map((move) => (
        <li key={move.intent_id} data-intent={move.intent_id}>
          <p>
            <a href={`${basePath}?receipt=${encodeURIComponent(move.intent_id)}#receipt`}>
              <code>{move.operation_ref}</code>
            </a>
            {move.at === null ? "" : <span className="actor"> · <time dateTime={move.at}>{readableTime(move.at)}</time></span>}
          </p>
          <ClaimRows move={move} prefix="moves" />
        </li>
      ))}
    </ol>
  );
}

export function Workspace({ snapshot, chrome, basePath = "/workspace", intentPath = "/workspace/intent" }: WorkspaceProps): ReactNode {
  const nextTheme = snapshot.theme === "dark" ? "light" : "dark";
  const themeHref = `${basePath}${queryOf(snapshot, { theme: nextTheme })}`;
  const current = snapshot.state === "ready" || snapshot.state === "partial" || snapshot.state === "blocked";
  const unbound = snapshot.choices.filter((choice) => choice.available && choice.action_id === null);
  const shown = snapshot.choices.filter((choice) => !(choice.available && choice.action_id === null));
  const status = chrome?.status ?? null;
  return (
    <html lang="en" data-theme={snapshot.theme_chosen ? snapshot.theme : undefined}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <title>{`Horizon workspace: ${snapshot.frame.focus_ref}`}</title>
        <style>{STYLE}</style>
      </head>
      <body>
        <a className="skip" href="#main">Skip to the current decision</a>
        <header>
          <div className="bar">
            <h1>Horizon workspace</h1>
            <a href={themeHref} aria-label={`Switch to ${THEME_LABEL[snapshot.theme].toLowerCase()} theme`}>
              {THEME_LABEL[snapshot.theme]} theme
            </a>
          </div>
          {status === null ? null : (
            <ul className="rail" aria-label="Process status">
              <li data-rail="world"><span aria-hidden="true">●</span> World: <code title={status.world_full}>{status.world}</code></li>
              <li data-rail="sea-forge" data-state={status.governed ? "governing" : "off"}>
                <span aria-hidden="true">{status.governed ? "◆" : "◇"}</span> SEA-Forge: {status.governed ? "governing" : "off"}
              </li>
              <li data-rail="realitytrace" data-state={status.realitytrace ? "observing" : "off"}>
                <span aria-hidden="true">{status.realitytrace ? "◆" : "◇"}</span> RealityTrace: {status.realitytrace ? "observing" : "off"}
              </li>
              <li data-rail="approvals" data-state={status.approvals ? "can-approve" : "not-configured"}>
                <span aria-hidden="true">{status.approvals ? "◆" : "◇"}</span> Approvals: {status.approvals ? "you can approve" : "not configured"}
              </li>
              <li data-rail="operator"><span aria-hidden="true">●</span> Operator: {status.operator}</li>
              <li data-rail="economics">
                <a href="/workspace/economics">Case economics</a>
              </li>
              {chrome?.remote ? (
                <li data-rail="remote" data-state={chrome.remote.state}>
                  <a href="/workspace/remote" aria-label={`Mobile remote control: ${chrome.remote.label.replace("Remote: ", "")}`}>
                    <svg aria-hidden="true" width="12" height="16" viewBox="0 0 12 16" focusable="false"><rect x="1" y="1" width="10" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" /><line x1="4" y1="12" x2="8" y2="12" stroke="currentColor" strokeWidth="1.6" /></svg>
                    {" "}{chrome.remote.label}
                  </a>
                </li>
              ) : null}
            </ul>
          )}
          <p className="scope" role="status" aria-live="polite" aria-atomic="true" data-scope={snapshot.scope}>
            {snapshot.scope === "current" ? `Current frame, revision ${snapshot.frame.revision}` : snapshot.scope_banner}
          </p>
          <p className="state" data-state={snapshot.state}>{snapshot.state_message}</p>
        </header>
        <nav aria-label="Workspace regions">
          <ul>
            {snapshot.regions.map((region) => (
              <li key={region.id}><a href={`#region-${region.id}`}>{region.title}</a></li>
            ))}
          </ul>
        </nav>
        <main id="main" tabIndex={-1}>
          {chrome ? (
            <PrimaryActionPanel
              action={primaryActionOf({ receipt: chrome.receipt, onboarding: chrome.onboarding, choices: snapshot.choices, current })}
            />
          ) : null}
          {chrome?.receipt ? <Receipt receipt={chrome.receipt} basePath={basePath} /> : null}

          {chrome?.onboarding.visible ? <GettingStarted chrome={chrome} snapshot={snapshot} basePath={basePath} intentPath={intentPath} /> : null}

          <section id="region-context" aria-labelledby="heading-context" data-owner-pinned="true">
            <h2 id="heading-context">Where you are</h2>
            <dl className="context">
              {snapshot.context.map((element) => (
                <div key={element.id}>
                  <dt>{element.label}</dt>
                  <dd title={element.value}>{element.short}</dd>
                </div>
              ))}
            </dl>
            {chrome?.openCase ? (
              <p>Purpose: <strong>{chrome.openCase.purpose}</strong></p>
            ) : (
              <p>No case is open. The workspace uses a default purpose until you open one under Getting started.</p>
            )}
            <details>
              <summary>Full references</summary>
              <dl className="context">
                {snapshot.context.map((element) => (
                  <div key={`full-${element.id}`}>
                    <dt>{element.label}</dt>
                    <dd><code>{element.value}</code></dd>
                  </div>
                ))}
              </dl>
            </details>
          </section>

          <section id="region-decision" aria-labelledby="heading-decision" data-owner-pinned="true">
            <h2 id="heading-decision">The next decision</h2>
            {snapshot.state === "loading" ? <p role="status">Reading the workspace.</p> : null}
            {snapshot.state === "error" ? <p role="alert">The workspace is unavailable. No decision is shown.</p> : null}
            {snapshot.state === "empty" || snapshot.state === "unknown" ? (
              <p role="status">{snapshot.state === "empty" ? "There is nothing to decide at this checkpoint." : "The checkpoint is unknown; this view is not current world state."}</p>
            ) : null}
            {current ? (
              <>
                {snapshot.blocked.length > 0 ? (
                  <div className="blocked">
                    <h3>What is not available, and why</h3>
                    <ul>
                      {snapshot.blocked.map((entry) => (
                        <li key={entry.operation_ref} data-blocked={entry.operation_ref}>
                          <strong>{entry.label}</strong>: {entry.reason}
                          {entry.next_step === null ? null : <p>Next: {entry.next_step}</p>}
                          <details>
                            <summary>Gates and evidence</summary>
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
                      <Choice key={choice.operation_ref} choice={choice} snapshot={snapshot} intentPath={intentPath} />
                    ))}
                  </ol>
                )}
                {unbound.length === 0 ? null : (
                  <p className="muted" data-unbound="true">
                    Also possible from the terminal: {unbound.map((choice) => choice.label).join(", ")}.
                  </p>
                )}
                {snapshot.actions.length > 0 ? (
                  <div className="actions" id="surface-actions">
                    <h3>Surface actions</h3>
                    <ul>
                      {snapshot.actions.map((action) => (
                        <li key={action.action_id} data-posture={action.posture} data-affordance={action.affordance}>
                          {action.submit ? (
                            <ActionForm action={action} snapshot={snapshot} intentPath={intentPath} />
                          ) : (
                            <span>{action.label}: {action.posture === "proposed" ? "proposed by an agent; not offered to the human" : action.affordance}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : null}
          </section>

          <section id="region-moves" aria-labelledby="heading-moves" data-owner-pinned="true">
            <h2 id="heading-moves">Your governed moves</h2>
            <Moves moves={chrome?.moves ?? []} basePath={basePath} visible={chrome?.onboarding.visible ?? false} />
          </section>

          <section id="region-evidence" aria-labelledby="heading-evidence" data-owner-pinned="true">
            <h2 id="heading-evidence">Evidence</h2>
            {snapshot.evidence.length === 0 ? <p>No evidence is attached to this decision yet.</p> : (
              <div className="evidence">
                {snapshot.evidence.map((entry) => (
                  <Evidence key={entry.node_id} evidence={entry} snapshot={snapshot} basePath={basePath} />
                ))}
              </div>
            )}
          </section>

          <section id="region-inspector" aria-labelledby="heading-inspector" data-owner-pinned="true">
            <h2 id="heading-inspector">Sources and refs</h2>
            {snapshot.sources.length === 0 ? <p>No source bindings are present.</p> : (
              <table>
                <caption>Source bindings behind this view</caption>
                <thead><tr><th scope="col">Source</th><th scope="col">Status</th><th scope="col">Observation</th></tr></thead>
                <tbody>
                  {snapshot.sources.map((source) => (
                    <tr key={`${source.expression}:${source.status}`}>
                      <td><code>{source.expression}</code></td>
                      <td>{source.status}</td>
                      <td>{source.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {snapshot.debugger === null ? null : <DebuggerAnswer answer={snapshot.debugger} />}
            {snapshot.retrieval === null ? null : <ReferenceCitations retrieval={snapshot.retrieval} />}
            <details>
              <summary>Raw refs and gates</summary>
              <p>Frame: <code>{snapshot.frame.frame_id}</code> revision {snapshot.frame.revision}</p>
              <p>World: <code>{snapshot.frame.world_ref}</code> · checkpoint <code>{snapshot.frame.checkpoint_ref ?? "unknown"}</code></p>
              {snapshot.frame.evidence_refs.length === 0 ? <p>No evidence refs are declared.</p> : (
                <ul>{snapshot.frame.evidence_refs.map((ref) => <li key={ref}><code>{ref}</code></li>)}</ul>
              )}
            </details>
            {snapshot.reduction_notes.length === 0 ? null : (
              <details>
                <summary>Agent layout and provenance reductions</summary>
                <ul>{snapshot.reduction_notes.map((note) => <li key={note}>{note}</li>)}</ul>
              </details>
            )}
          </section>

          <section id="region-lineage" aria-labelledby="heading-lineage" data-owner-pinned="true">
            <h2 id="heading-lineage">Lineage</h2>
            <Lineage snapshot={snapshot} />
          </section>

          <section id="region-agent" aria-labelledby="heading-agent" className="agent-region" data-owner-pinned="false">
            <h2 id="heading-agent">Agent contributions</h2>
            {snapshot.regions.some((region) => region.id === "agent") ? (
              <p>Agent-composed material appears after every owner region. It cannot reorder, pin or replace the decision.</p>
            ) : null}
            <p>{snapshot.reduction_notes.length === 0 ? "No agent-composed blocks are present." : `${snapshot.reduction_notes.length} agent claim(s) were reduced or appended.`}</p>
            {snapshot.agent_contributions.length === 0 ? null : (
              <div className="evidence">
                {snapshot.agent_contributions.map((entry) => (
                  <article key={entry.node_id} data-agent-contribution={entry.node_id}>
                    <h3>{entry.label}</h3>
                    {entry.text === null ? null : <p>{entry.text}</p>}
                    <p className="actor">{actorLabel(entry)}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>
        <footer>
          <p>{WORKSPACE_SCHEMA} · intent schema horizon.sequential-intent/1 · a move is recorded only when you choose it; SEA-Forge decides and RealityTrace observes.</p>
          {chrome !== undefined && chrome.onboarding.skipped && !chrome.onboarding.visible && chrome.onboarding.steps[2]?.done === false ? (
            <form method="post" action={`${basePath}/onboarding/resume`}>
              <button type="submit" className="link-button">Getting started</button>
            </form>
          ) : null}
        </footer>
      </body>
    </html>
  );
}

export const STYLE = `
:root { --bg:oklch(98.6% 0.005 250); --panel:oklch(99.6% 0.003 250); --fg:oklch(25% 0.02 250); --muted:oklch(40% 0.02 250); --line:oklch(82% 0.014 250); --edge:oklch(52% 0.03 250); --accent:oklch(44% 0.15 255); --on-accent:oklch(99% 0.004 250); --tint:oklch(94% 0.03 255); --danger:oklch(45% 0.17 27); --ok:oklch(42% 0.12 155); --focus:oklch(48% 0.16 60); color-scheme:light; }
:root[data-theme="light"] { --bg:oklch(98.6% 0.005 250); --panel:oklch(99.6% 0.003 250); --fg:oklch(25% 0.02 250); --muted:oklch(40% 0.02 250); --line:oklch(82% 0.014 250); --edge:oklch(52% 0.03 250); --accent:oklch(44% 0.15 255); --on-accent:oklch(99% 0.004 250); --tint:oklch(94% 0.03 255); --danger:oklch(45% 0.17 27); --ok:oklch(42% 0.12 155); --focus:oklch(48% 0.16 60); color-scheme:light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:oklch(20% 0.012 250); --panel:oklch(25% 0.014 250); --fg:oklch(94% 0.01 250); --muted:oklch(80% 0.015 250); --line:oklch(40% 0.02 250); --edge:oklch(62% 0.03 250); --accent:oklch(80% 0.1 255); --on-accent:oklch(20% 0.02 250); --tint:oklch(30% 0.04 255); --danger:oklch(80% 0.13 27); --ok:oklch(82% 0.13 155); --focus:oklch(84% 0.14 80); color-scheme:dark; } }
:root[data-theme="dark"] { --bg:oklch(20% 0.012 250); --panel:oklch(25% 0.014 250); --fg:oklch(94% 0.01 250); --muted:oklch(80% 0.015 250); --line:oklch(40% 0.02 250); --edge:oklch(62% 0.03 250); --accent:oklch(80% 0.1 255); --on-accent:oklch(20% 0.02 250); --tint:oklch(30% 0.04 255); --danger:oklch(80% 0.13 27); --ok:oklch(82% 0.13 155); --focus:oklch(84% 0.14 80); color-scheme:dark; }
* { box-sizing:border-box; }
html { background:var(--bg); color:var(--fg); font:16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
body { margin:0 auto; max-width:78rem; padding:1rem 1.25rem 3rem; background:var(--bg); }
a { color:var(--accent); text-underline-offset:.2em; min-height:1.5rem; display:inline-flex; align-items:center; }
a:hover { text-decoration-thickness:.2em; }
a:focus-visible, button:focus-visible, summary:focus-visible, input:focus-visible { outline:3px solid var(--focus); outline-offset:3px; }\nmain:focus, #receipt:focus { outline:none; }
.skip { position:absolute; left:-999px; top:.5rem; background:var(--panel); color:var(--fg); padding:.6rem 1rem; z-index:2; }
.skip:focus { left:.5rem; }
header { border-bottom:1px solid var(--line); margin-bottom:1rem; }
.bar { display:flex; flex-wrap:wrap; gap:1rem; align-items:center; justify-content:space-between; }
h1 { font-size:1.5rem; margin:.4rem 0; }
h2 { font-size:1.25rem; margin:0 0 .6rem; }
h3 { font-size:1.05rem; margin:.9rem 0 .35rem; }
.rail { display:flex; flex-wrap:wrap; gap:.3rem 1.1rem; list-style:none; padding:0; margin:.4rem 0 .7rem; font-size:.92rem; color:var(--muted); }
.rail li { display:inline-flex; gap:.35rem; align-items:center; }
.rail code { color:var(--fg); }
.scope { background:var(--tint); border:1px solid var(--line); border-radius:.35rem; padding:.5rem .75rem; font-weight:600; }
.scope[data-scope="historical"] { border-color:var(--danger); color:var(--danger); }
.state { color:var(--muted); }
nav ul { display:flex; flex-wrap:wrap; gap:.25rem 1rem; list-style:none; padding:0; }
nav a { padding:.25rem 0; }
section { background:var(--panel); border:1px solid var(--line); border-radius:.5rem; padding:1rem; margin:1rem 0; }
section.agent-region { border-style:dashed; }
.panel-head { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:.5rem; }
.steps { list-style:none; padding:0; margin:0; }
.steps li { border-top:1px solid var(--line); padding:.7rem 0; }
.steps li[aria-current="step"] { background:var(--tint); border-radius:.35rem; padding:.7rem; border-top-color:transparent; }
.step-no { color:var(--muted); font-size:.9rem; font-weight:600; }
.step-state { color:var(--muted); font-size:.9rem; }
.case-form label { display:block; font-weight:600; margin:.4rem 0 .3rem; }
.case-form input[type="text"] { flex:1 1 16rem; min-height:2.5rem; font:inherit; color:var(--fg); background:var(--bg); border:1px solid var(--edge); border-radius:.35rem; padding:.45rem .6rem; }
.actions-row { display:flex; flex-wrap:wrap; gap:.5rem; align-items:center; }
.error { color:var(--danger); font-weight:600; }
.muted { color:var(--muted); font-size:.92rem; }
.context { display:grid; grid-template-columns:repeat(auto-fit,minmax(12rem,1fr)); gap:.6rem 1rem; }
.context div { margin:0; }
dt { color:var(--muted); font-size:.85rem; text-transform:uppercase; letter-spacing:.03em; }
dd { margin:0; overflow-wrap:anywhere; }
.claims { display:grid; gap:.35rem; margin:.5rem 0; }
.claims .claim { border:1px solid var(--line); border-radius:.35rem; padding:.45rem .6rem; background:var(--bg); }
.claims dt { margin-bottom:.1rem; }
.claims dd { color:var(--fg); }
.primary-action { border:1px solid currentColor; padding:0.5rem 1rem; margin:0 0 1rem; }
.primary-action h2 { font-size:0.95rem; margin:0 0 0.25rem; text-transform:uppercase; letter-spacing:0.04em; }
.claim[data-state="allowed"] dd, .claim[data-state="observed"] dd { font-weight:600; color:var(--ok); }
.claim[data-state="recorded"] dd { font-weight:600; }
.claim[data-state="refused"] dd, .claim[data-state="unavailable"] dd { font-weight:600; color:var(--danger); }
.moves { padding-left:1.2rem; }
.moves li { margin:.6rem 0; }
.approval, .settlement { border-top:1px solid var(--line); margin-top:.8rem; padding-top:.5rem; }
ol.choices, .blocked ul, .evidence, details ul, .moves { padding-left:1.2rem; }
.actions ul { list-style:none; padding:0; display:flex; flex-wrap:wrap; gap:.5rem; }
.step-action { margin:.4rem 0 .2rem; }
.choices li, .actions li, .blocked li { margin:.6rem 0; }
button { font:inherit; font-weight:700; background:var(--accent); color:var(--on-accent); border:1px solid transparent; border-radius:.35rem; padding:.5rem .85rem; min-height:2.25rem; cursor:pointer; transition:background-color .15s ease; }
button.quiet { background:transparent; color:var(--fg); border-color:var(--edge); }
button.link-button { background:none; border:0; padding:.25rem 0; min-height:1.5rem; color:var(--accent); text-decoration:underline; text-underline-offset:.2em; font-weight:600; }
summary { cursor:pointer; min-height:1.5rem; display:list-item; padding:.15rem 0; }
.blocked { border:1px solid var(--danger); border-radius:.4rem; padding:.6rem .8rem; }
.blocked strong { color:var(--danger); }
.evidence article { border-top:1px solid var(--line); padding:.7rem 0; }
.evidence article.selected { background:var(--tint); outline:2px solid var(--accent); padding:.7rem; }
.actor { color:var(--muted); font-weight:600; }
table { width:100%; border-collapse:collapse; margin:.8rem 0; }
caption { text-align:left; color:var(--muted); padding:.3rem 0; }
th, td { text-align:left; border-bottom:1px solid var(--line); padding:.4rem .5rem; vertical-align:top; }
code { overflow-wrap:anywhere; }
figure { margin:.5rem 0; }
svg { width:100%; height:auto; max-height:32rem; background:var(--bg); border:1px solid var(--line); border-radius:.4rem; }
.edge { stroke:var(--muted); stroke-width:2; }
.node { fill:var(--panel); stroke:var(--accent); stroke-width:2; }
.node-label { fill:var(--fg); font-size:11px; font-weight:700; }
.node-caption { fill:var(--muted); font-size:11px; }
figcaption { color:var(--muted); font-size:.9rem; margin-top:.3rem; }
footer { border-top:1px solid var(--line); color:var(--muted); font-size:.9rem; margin-top:1.5rem; }
@media (max-width:40rem) { body { padding:.75rem; } section { padding:.75rem; } button { width:100%; } .actions-row button { width:auto; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation:none !important; transition:none !important; scroll-behavior:auto !important; } }
`;

export interface ProjectionWorkspaceProps {
  readonly frame: NavigationFrame;
  readonly view: GuiView;
  readonly current: WorkspaceFrameRef;
  readonly evidenceRef?: string | null;
  /** Omitted means no theme was asked for: the page follows the OS preference. */
  readonly theme?: WorkspaceTheme;
  /** Already-answered inspection material (T10). Omitted means the surface was not asked. */
  readonly debuggerAnswer?: WorkspaceDebugger | null;
  readonly retrievalAnswer?: WorkspaceRetrieval | null;
  readonly chrome?: WorkspaceChrome;
}

/**
 * The Cognate React data layer. The server preloads the public operational projection, then
 * renders this component under a real `CognateProvider`; `useProjection` is the only source of
 * object and link rows. A read that has not converged renders the explicit loading state.
 */
export function ProjectionWorkspace({ frame, view, current, evidenceRef = null, theme, debuggerAnswer = null, retrievalAnswer = null, chrome }: ProjectionWorkspaceProps): ReactNode {
  const rows = useProjection("horizon.operational-objects");
  if (rows === undefined) return <Workspace snapshot={loadingWorkspace(frame, current, theme)} {...(chrome === undefined ? {} : { chrome })} />;
  const objects: import("../../domain/operational.ts").OperationalObjectV1[] = [];
  const links: import("../../domain/operational.ts").OperationalLinkV1[] = [];
  let parseError: { code: string; message: string } | null = null;
  for (const row of rows) {
    if (row.key.startsWith("object/")) {
      const parsed = OperationalObjectV1.safeParse(row.value);
      if (parsed.success) objects.push(parsed.data);
      else parseError ??= { code: "invalid_object", message: `projection row ${row.key} is not an operational object` };
    } else if (row.key.startsWith("link/")) {
      const parsed = OperationalLinkV1.safeParse(row.value);
      if (parsed.success) links.push(parsed.data);
      else parseError ??= { code: "invalid_link", message: `projection row ${row.key} is not an operational link` };
    }
  }
  return (
    <Workspace
      snapshot={buildWorkspace({
        frame,
        view,
        objects,
        links,
        current,
        ...(evidenceRef === null ? {} : { evidenceRef }),
        ...(theme === undefined ? {} : { theme }),
        ...(parseError === null ? {} : { error: parseError }),
        debugger: debuggerAnswer,
        retrieval: retrievalAnswer,
      })}
      {...(chrome === undefined ? {} : { chrome })}
    />
  );
}

/** Wait for the client's projection read to publish before rendering; undefined is loading, not empty. */
async function waitForProjection(
  client: ReturnType<typeof createClient>,
  name: string,
  expectedObjects: number,
  timeoutMs = 2000,
): Promise<void> {
  const store = client.projection(name);
  const ready = (value: readonly unknown[] | undefined): boolean =>
    value !== undefined && value.length >= expectedObjects;
  if (ready(store.get())) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      stop();
      reject(new Error(`PROJECTION: ${name} did not publish ${expectedObjects} row(s) within ${timeoutMs} ms`));
    }, timeoutMs);
    const stop = store.subscribe((value) => {
      if (!ready(value)) return;
      clearTimeout(timer);
      stop();
      resolve();
    });
  });
}

export interface WorkspacePageInput extends ProjectionWorkspaceProps {
  readonly service: RuntimeService;
  readonly caller: Caller;
  /** Rows the caller already read from durable state; the first empty client read is not "done". */
  readonly expectedObjects?: number;
}

/** Render a complete HTML document through Cognate React; no client bundle or inline handler. */
export async function renderWorkspacePage(input: WorkspacePageInput): Promise<string> {
  const client = createClient({ service: input.service, caller: input.caller });
  try {
    await waitForProjection(client, "horizon.operational-objects", input.expectedObjects ?? 0);
    return `<!doctype html>${renderToStaticMarkup(
      <CognateProvider client={client}>
        <ProjectionWorkspace
          frame={input.frame}
          view={input.view}
          current={input.current}
          evidenceRef={input.evidenceRef ?? null}
          {...(input.theme === undefined ? {} : { theme: input.theme })}
          debuggerAnswer={input.debuggerAnswer ?? null}
          retrievalAnswer={input.retrievalAnswer ?? null}
          {...(input.chrome === undefined ? {} : { chrome: input.chrome })}
        />
      </CognateProvider>,
    )}`;
  } finally {
    await client.close();
  }
}
