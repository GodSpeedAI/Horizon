/** @jsxImportSource react */
/**
 * The approval inbox page (P2.1). Server-rendered from `InboxReadout`. The only form is the existing
 * `/workspace/approval` decision, offered on an item only when `buildInbox` marked it decidable. Nothing
 * here decides, infers, or hides an authority state: SEA-Forge's listing is shown as it stands.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { InboxItem, InboxReadout } from "../../domain/approval-inbox.ts";
import type { WorkspaceTheme } from "./model.ts";
import { STYLE } from "./render.tsx";

const EXTRA_STYLE = `
.inbox-list { list-style:none; margin:0; padding:0; }
.inbox-item { border:1px solid var(--edge); border-radius:.5rem; padding:.75rem 1rem; margin:.6rem 0; }
.inbox-item dl { display:grid; grid-template-columns:max-content 1fr; gap:.2rem .8rem; margin:.4rem 0; }
.inbox-item dt { color:var(--muted); }
.inbox-item dd { margin:0; overflow-wrap:anywhere; }
.inbox-note { color:var(--muted); font-size:.9rem; }
.inbox-actions { display:flex; gap:.5rem; flex-wrap:wrap; }
.inbox-warn { border:1px solid var(--edge); border-left:4px solid var(--focus); border-radius:.5rem; padding:.6rem .9rem; }
`;

function Details({ item }: { readonly item: InboxItem }): ReactNode {
  return (
    <dl>
      <dt>Approval</dt>
      <dd><code>{item.approval_id}</code></dd>
      <dt>State</dt>
      <dd>{item.state}{item.resolved_by ? ` by ${item.resolved_by}` : ""}</dd>
      <dt>Operation</dt>
      <dd>{item.operation_name} <span className="inbox-note">({item.operation_kind})</span></dd>
      <dt>Resource</dt>
      <dd><code>{item.resource_id}</code></dd>
      <dt>Subject</dt>
      <dd><code>{item.subject_actor_ref}</code></dd>
      <dt>Requested by</dt>
      <dd><code>{item.requester}</code></dd>
      <dt>World</dt>
      <dd><code>{item.world_ref}</code></dd>
      <dt>Request</dt>
      <dd><code>{item.request_ref}</code></dd>
      <dt>Expires</dt>
      <dd>{item.expires_at}{item.past_expiry ? " (past expiry)" : ""}</dd>
    </dl>
  );
}

function Item({ item }: { readonly item: InboxItem }): ReactNode {
  return (
    <li className="inbox-item" data-approval={item.approval_id} data-state={item.state} data-decidable={item.decision.kind === "decidable" ? "yes" : "no"}>
      <Details item={item} />
      {item.decision.kind === "decidable" ? (
        <form method="post" action="/workspace/approval" className="inbox-actions">
          <input type="hidden" name="approval_id" value={item.approval_id} />
          <button type="submit" name="decision" value="approve" className="primary">Approve</button>
          <button type="submit" name="decision" value="reject">Reject</button>
        </form>
      ) : (
        <p className="inbox-note">Not decided here: {item.decision.reason}.</p>
      )}
    </li>
  );
}

function Body({ readout }: { readonly readout: InboxReadout }): ReactNode {
  if (readout.state === "not_configured") {
    return <p className="inbox-warn">No approver is configured (COGNATE_SEA_FORGE_OPERATOR). Nothing can be approved from here.</p>;
  }
  if (readout.state === "unreachable") {
    return (
      <p className="inbox-warn">
        SEA-Forge did not list approvals, so this page cannot say what is waiting. {readout.message}
      </p>
    );
  }
  const { inbox } = readout;
  return (
    <>
      <section aria-labelledby="waiting-heading">
        <h2 id="waiting-heading">Waiting for a decision ({inbox.waiting.length})</h2>
        {inbox.waiting.length === 0 ? <p className="inbox-note">Nothing is waiting at SEA-Forge.</p> : <ul className="inbox-list">{inbox.waiting.map((item) => <Item key={item.approval_id} item={item} />)}</ul>}
      </section>
      <section aria-labelledby="decided-heading">
        <h2 id="decided-heading">Decided ({inbox.decided.length})</h2>
        {inbox.decided.length === 0 ? <p className="inbox-note">No decided approvals are listed.</p> : <ul className="inbox-list">{inbox.decided.map((item) => <Item key={item.approval_id} item={item} />)}</ul>}
      </section>
      {inbox.excluded > 0 ? (
        <p className="inbox-warn">{inbox.excluded} record(s) from SEA-Forge did not match the expected shape and are not shown.</p>
      ) : null}
    </>
  );
}

export function ApprovalInboxPage({ readout, theme }: { readonly readout: InboxReadout; readonly theme?: WorkspaceTheme }): ReactNode {
  return (
    <html lang="en" data-theme={theme}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <title>Horizon approval inbox</title>
        <style>{STYLE + EXTRA_STYLE}</style>
      </head>
      <body>
        <a className="skip" href="#main">Skip to the approvals</a>
        <header>
          <div className="bar">
            <h1>Approval inbox</h1>
            <a href="/workspace">Back to the workspace</a>
          </div>
          <p className="state">Listed from SEA-Forge. Approve or reject sends your decision to SEA-Forge, which decides it.</p>
        </header>
        <main id="main" tabIndex={-1}>
          <Body readout={readout} />
        </main>
      </body>
    </html>
  );
}

export function renderApprovalInboxPage(readout: InboxReadout, theme?: WorkspaceTheme): string {
  return `<!doctype html>${renderToStaticMarkup(<ApprovalInboxPage readout={readout} theme={theme} />)}`;
}
