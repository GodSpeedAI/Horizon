/** @jsxImportSource react */
/**
 * Semantic, server-rendered GUI for one workspace snapshot (T09).
 *
 * There is deliberately no client bundle: buttons are native form submissions, so keyboard,
 * focus, screen-reader semantics and the reduced-motion equivalent do not depend on JavaScript.
 * The renderer is a pure function of the workspace model; it cannot enable an action, evaluate a
 * gate or approve anything. Every form posts the frame and the source refs it displayed, and the
 * server refuses a stale or blocked submission through the same canonical intent path.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CognateProvider, useProjection } from "@godspeedai/cognate-react";
import { createClient } from "@godspeedai/cognate-client";
import type { Caller, RuntimeService } from "@godspeedai/cognate-runtime-api";
import type { NavigationFrame } from "../../domain/navigation.ts";
import { OperationalLinkV1, OperationalObjectV1 } from "../../domain/operational.ts";
import type { GuiView } from "../surface2/project.ts";
import { loadingWorkspace, buildWorkspace, WORKSPACE_SCHEMA, type WorkspaceFrameRef, type WorkspaceTheme } from "./model.ts";
import type { WorkspaceChoice, WorkspaceEvidence, WorkspaceSnapshot } from "./model.ts";

export interface WorkspaceProps {
  readonly snapshot: WorkspaceSnapshot;
  readonly basePath?: string;
  readonly intentPath?: string;
}

const THEME_LABEL: Readonly<Record<WorkspaceSnapshot["theme"], string>> = { light: "Dark", dark: "Light" };

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
  values.push(["theme", snapshot.theme]);
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
        <strong>{choice.label}</strong>{" "}
        <span>{statusText(choice)}</span>
        <p>{choice.reason ?? "This choice is not available."}</p>
        {choice.next_step === null ? null : <p>Next: {choice.next_step}</p>}
        {review}
      </li>
    );
  }
  if (choice.action_id === null) {
    return (
      <li data-operation={choice.operation_ref} data-status={choice.status}>
        <strong>{choice.label}</strong> <span>{statusText(choice)}</span>
        <p>This choice is available, but no GUI action is bound to it yet. It cannot be submitted from this view.</p>
        {review}
      </li>
    );
  }
  return (
    <li data-operation={choice.operation_ref} data-status={choice.status}>
      <form method="post" action={intentPath}>
        <input type="hidden" name="action_id" value={choice.action_id} />
        <input type="hidden" name="operation" value={choice.operation_ref} />
        <input type="hidden" name="focus" value={snapshot.frame.focus_ref} />
        <input type="hidden" name="evidence" value={snapshot.evidence_ref ?? ""} />
        <input type="hidden" name="theme" value={snapshot.theme} />
        <button type="submit">
          {choice.label} — {statusText(choice)}
        </button>
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
              <code>{source.expression}</code>: {source.status} — {source.detail}
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

export function Workspace({ snapshot, basePath = "/workspace", intentPath = "/workspace/intent" }: WorkspaceProps): ReactNode {
  const nextTheme = snapshot.theme === "dark" ? "light" : "dark";
  const themeHref = `${basePath}${queryOf(snapshot, { theme: nextTheme })}`;
  const current = snapshot.state === "ready" || snapshot.state === "partial" || snapshot.state === "blocked";
  return (
    <html lang="en" data-theme={snapshot.theme}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark light" />
        <title>{`Horizon — ${snapshot.frame.focus_ref}`}</title>
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
          <p className="scope" role="status" aria-live="polite" aria-atomic="true" data-scope={snapshot.scope}>
            {snapshot.scope_banner}
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
          <section id="region-context" aria-labelledby="heading-context" data-owner-pinned="true">
            <h2 id="heading-context">Where you are</h2>
            <dl className="context">
              {snapshot.context.map((element) => (
                <div key={element.id}>
                  <dt>{element.label}</dt>
                  <dd>{element.value}</dd>
                </div>
              ))}
            </dl>
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
                          <strong>{entry.label}</strong> — {entry.reason}
                          {entry.next_step === null ? null : <p>Next: {entry.next_step}</p>}
                          <details>
                            <summary>Gates and evidence</summary>
                            <ul>
                              {entry.gates.map((gate) => (
                                <li key={gate.gate}>{gate.gate}: {gate.verdict}{gate.reason === null ? "" : ` — ${gate.reason}`}{gate.prerequisite_ref === null ? "" : ` (next: ${gate.prerequisite_ref})`}</li>
                              ))}
                            </ul>
                          </details>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <ol className="choices">
                  {snapshot.choices.map((choice) => (
                    <Choice key={choice.operation_ref} choice={choice} snapshot={snapshot} intentPath={intentPath} />
                  ))}
                </ol>
                {snapshot.actions.length > 0 ? (
                  <div className="actions">
                    <h3>Surface actions</h3>
                    <ul>
                      {snapshot.actions.map((action) => (
                        <li key={action.action_id} data-posture={action.posture} data-affordance={action.affordance}>
                          {action.submit ? (
                            <form method="post" action={intentPath}>
                              <input type="hidden" name="action_id" value={action.action_id} />
                              <input type="hidden" name="operation" value={action.operation} />
                              <input type="hidden" name="frame_id" value={snapshot.frame.frame_id} />
                              <input type="hidden" name="frame_revision" value={String(snapshot.frame.revision)} />
                              <input type="hidden" name="focus" value={snapshot.frame.focus_ref} />
                              <input type="hidden" name="evidence" value={snapshot.evidence_ref ?? ""} />
                              <input type="hidden" name="theme" value={snapshot.theme} />
                              <button type="submit">{action.label}{action.consequential ? " (records an intent)" : ""}</button>
                            </form>
                          ) : (
                            <span>{action.label} — {action.posture === "proposed" ? "proposed by an agent; not offered to the human" : action.affordance}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : null}
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

          <section id="region-agent" aria-labelledby="heading-agent" data-owner-pinned="false">
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
          <p>{WORKSPACE_SCHEMA} · intent schema horizon.sequential-intent/1 · no control on this page approves or executes anything.</p>
        </footer>
      </body>
    </html>
  );
}

const STYLE = `
:root { --bg:#12161c; --panel:#1b222c; --fg:#e8eef6; --muted:#b7c2cf; --line:#4a5665; --accent:#9ecbff; --danger:#ffb4ab; --ok:#8fd7b0; --focus:#ffd166; color-scheme:dark; }
:root[data-theme="light"] { --bg:#f7f9fc; --panel:#ffffff; --fg:#17202a; --muted:#4a5563; --line:#8a97a8; --accent:#0b5cad; --danger:#9b1c1c; --ok:#146c43; --focus:#7a4b00; color-scheme:light; }
@media (prefers-color-scheme: light) { :root:not([data-theme]) { --bg:#f7f9fc; --panel:#ffffff; --fg:#17202a; --muted:#4a5563; --line:#8a97a8; --accent:#0b5cad; --danger:#9b1c1c; --ok:#146c43; --focus:#7a4b00; color-scheme:light; } }
* { box-sizing:border-box; }
html { background:var(--bg); color:var(--fg); font:16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
body { margin:0 auto; max-width:78rem; padding:1rem 1.25rem 3rem; }
a { color:var(--accent); text-underline-offset:.2em; }
a:hover { text-decoration-thickness:.2em; }
a:focus-visible, button:focus-visible, summary:focus-visible, main:focus-visible { outline:3px solid var(--focus); outline-offset:3px; }
.skip { position:absolute; left:-999px; top:.5rem; background:var(--panel); padding:.6rem 1rem; z-index:2; }
.skip:focus { left:.5rem; }
header { border-bottom:1px solid var(--line); margin-bottom:1rem; }
.bar { display:flex; flex-wrap:wrap; gap:1rem; align-items:center; justify-content:space-between; }
h1 { font-size:1.5rem; margin:.4rem 0; }
h2 { font-size:1.25rem; margin:0 0 .6rem; }
h3 { font-size:1.05rem; margin:.9rem 0 .35rem; }
.scope { border-left:6px solid var(--accent); background:var(--panel); padding:.6rem .8rem; font-weight:600; }
.scope[data-scope="historical"] { border-left-color:var(--danger); }
.state { color:var(--muted); }
nav ul { display:flex; flex-wrap:wrap; gap:.5rem 1rem; list-style:none; padding:0; }
section { background:var(--panel); border:1px solid var(--line); border-radius:.5rem; padding:1rem; margin:1rem 0; }
section[data-owner-pinned="true"] { border-left:5px solid var(--accent); }
section[data-owner-pinned="false"] { border-left:5px dashed var(--muted); }
.context { display:grid; grid-template-columns:repeat(auto-fit,minmax(12rem,1fr)); gap:.6rem 1rem; }
.context div { margin:0; }
dt { color:var(--muted); font-size:.85rem; text-transform:uppercase; letter-spacing:.03em; }
dd { margin:0; overflow-wrap:anywhere; }
ol.choices, .blocked ul, .actions ul, .evidence, details ul { padding-left:1.2rem; }
.choices li, .actions li, .blocked li { margin:.6rem 0; }
button { font:inherit; background:var(--accent); color:#07131f; border:2px solid transparent; border-radius:.35rem; padding:.55rem .8rem; cursor:pointer; font-weight:700; }
button:disabled { background:var(--line); color:var(--fg); cursor:not-allowed; }
.blocked { border:2px solid var(--danger); border-radius:.4rem; padding:.6rem .8rem; }
.blocked strong { color:var(--danger); }
.evidence article { border-top:1px solid var(--line); padding:.7rem 0; }
.evidence article.selected { background:var(--bg); outline:2px solid var(--accent); padding:.7rem; }
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
@media (max-width:40rem) { body { padding:.75rem; } section { padding:.75rem; } button { width:100%; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation:none !important; transition:none !important; scroll-behavior:auto !important; } }
`;

export interface ProjectionWorkspaceProps {
  readonly frame: NavigationFrame;
  readonly view: GuiView;
  readonly current: WorkspaceFrameRef;
  readonly evidenceRef?: string | null;
  readonly theme?: WorkspaceTheme;
}

/**
 * The Cognate React data layer. The server preloads the public operational projection, then
 * renders this component under a real `CognateProvider`; `useProjection` is the only source of
 * object and link rows. A read that has not converged renders the explicit loading state.
 */
export function ProjectionWorkspace({ frame, view, current, evidenceRef = null, theme = "dark" }: ProjectionWorkspaceProps): ReactNode {
  const rows = useProjection("horizon.operational-objects");
  if (rows === undefined) return <Workspace snapshot={loadingWorkspace(frame, current, theme)} />;
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
        theme,
        ...(parseError === null ? {} : { error: parseError }),
      })}
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
          theme={input.theme ?? "dark"}
        />
      </CognateProvider>,
    )}`;
  } finally {
    await client.close();
  }
}
