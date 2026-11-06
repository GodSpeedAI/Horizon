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
.inbox-ok { border:1px solid var(--edge); border-left:4px solid var(--ok, var(--focus)); border-radius:.5rem; padding:.6rem .9rem; margin:.6rem 0; }
.inbox-actions form { margin:0; }
.inbox-choice { display:flex; flex-direction:column; gap:.25rem; max-width:20rem; }
.inbox-status { font-weight:600; margin:.4rem 0; }
.inbox-warn { border:1px solid var(--edge); border-left:4px solid var(--focus); border-radius:.5rem; padding:.6rem .9rem; }
`;

/** The fixed outcomes a decision can come back with. The server sends only these codes; the copy below is the page's own. */
export const INBOX_ERROR_CODES = ["refused", "not_pending", "invalid", "unavailable", "followup_failed"] as const;
export type InboxErrorCode = (typeof INBOX_ERROR_CODES)[number] | "unknown";

export function parseInboxErrorCode(value: string): InboxErrorCode {
  return (INBOX_ERROR_CODES as readonly string[]).includes(value) ? (value as InboxErrorCode) : "unknown";
}

/** What the page was sent back with after a click. Only fixed codes and an approval id travel in the link; the listing decides what is true. */
export type InboxNotice =
  | { readonly kind: "resolved"; readonly approvalId: string; readonly decision: "approve" | "reject" }
  | { readonly kind: "error"; readonly approvalId: string | null; readonly code: InboxErrorCode };

const ERROR_COPY: Record<InboxErrorCode, string> = {
  refused: "SEA-Forge or Horizon refused the decision, for example because you requested it yourself or may not decide it.",
  not_pending: "No commit is waiting on this approval any more; it may already have been decided.",
  invalid: "The request was incomplete, so it was not sent.",
  unavailable: "The decision could not be sent or answered.",
  followup_failed: "A follow-up step in Horizon failed, so the waiting commit may not have finished.",
  unknown: "Something went wrong with that decision.",
};

function Notice({ notice, items }: { readonly notice: InboxNotice; readonly items: readonly InboxItem[] }): ReactNode {
  // What is true is read from SEA-Forge's listing, never from the link, which could say anything.
  const item = notice.approvalId === null ? undefined : items.find((candidate) => candidate.approval_id === notice.approvalId);
  const listed = item && item.state !== "pending" ? (
    <>
      {" "}SEA-Forge lists approval <code>{item.approval_id}</code> as <strong>{item.state}</strong>
      {item.resolved_by ? <> (resolved by <code>{item.resolved_by}</code>)</> : null}.
    </>
  ) : null;
  if (notice.kind === "error") {
    if (notice.code === "followup_failed") {
      // The link says SEA-Forge recorded the decision; only the listing can confirm that.
      return (
        <div className="inbox-warn" role="alert" data-notice={listed ? "followup_failed" : "followup_unconfirmed"}>
          <strong>A follow-up step failed after the decision was sent.</strong> {ERROR_COPY.followup_failed}
          {listed ?? <> <strong>Not confirmed:</strong> the listing does not show this approval as decided yet.</>} Check the list below.
        </div>
      );
    }
    if (listed) {
      return (
        <div className="inbox-warn" role="alert" data-notice="error">
          <strong>That click did not decide this approval.</strong> {ERROR_COPY[notice.code]}{listed}
        </div>
      );
    }
    const changed = notice.code === "unknown" || notice.code === "unavailable" ? " Check the list below before trying again." : " Nothing was approved or rejected by this click.";
    return (
      <div className="inbox-warn" role="alert" data-notice="error">
        <strong>That decision was not recorded.</strong> {ERROR_COPY[notice.code]}{changed}
      </div>
    );
  }
  const wanted = notice.decision === "approve" ? "approved" : "rejected";
  if (item && item.state === wanted) {
    return (
      <div className="inbox-ok" role="status" data-notice="resolved">
        <strong>Done.</strong> Approval <code>{item.approval_id}</code> is now <strong>{item.state}</strong>
        {item.resolved_by ? <> (resolved by <code>{item.resolved_by}</code>)</> : null}. You chose to {notice.decision} it.
        {item.state === "rejected" ? " The commit that was waiting on it was refused and will not run." : null}
      </div>
    );
  }
  return (
    <div className="inbox-warn" role="status" data-notice="unconfirmed">
      <strong>Not confirmed.</strong> You chose to {notice.decision} approval <code>{notice.approvalId}</code>, but SEA-Forge's listing
      {item ? <> shows it as <strong>{item.state}</strong>{item.resolved_by ? <> (by <code>{item.resolved_by}</code>)</> : null}</> : " does not show it"}.
      {item && item.state !== "pending" ? " The listed state is the truth." : " Reload to check again before deciding anything else."}
    </div>
  );
}

function Details({ item }: { readonly item: InboxItem }): ReactNode {
  return (
    <dl>
      <dt>Approval</dt>
      <dd><code>{item.approval_id}</code></dd>
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
      <dt>Requested at</dt>
      <dd className="inbox-note">SEA-Forge does not report when it was requested</dd>
      <dt>Expires</dt>
      <dd>{item.expires_at}{item.past_expiry ? " (past expiry)" : ""}</dd>
    </dl>
  );
}

function Item({ item }: { readonly item: InboxItem }): ReactNode {
  return (
    <li className="inbox-item" data-approval={item.approval_id} data-state={item.state} data-decidable={item.decision.kind === "decidable" ? "yes" : "no"}>
      <p className="inbox-status" data-status>
        {item.state === "pending"
          ? `Waiting for a decision: ${item.operation_name}, requested by ${item.requester}`
          : `${item.state[0]!.toUpperCase()}${item.state.slice(1)}${item.resolved_by ? ` by ${item.resolved_by}` : ""}: ${item.operation_name}, requested by ${item.requester}`}
      </p>
      <Details item={item} />
      {item.decision.kind === "decidable" ? (
        <form method="post" action="/workspace/approval" className="inbox-actions">
          <input type="hidden" name="approval_id" value={item.approval_id} />
          <input type="hidden" name="return_to" value="inbox" />
          <div className="inbox-choice">
            <button type="submit" name="decision" value="approve" className="primary" aria-describedby={`approve-${item.approval_id}`}>Approve</button>
            <span id={`approve-${item.approval_id}`} className="inbox-note">SEA-Forge lets the waiting commit go ahead.</span>
          </div>
          <div className="inbox-choice">
            <button type="submit" name="decision" value="reject" aria-describedby={`reject-${item.approval_id}`}>Reject</button>
            <span id={`reject-${item.approval_id}`} className="inbox-note">SEA-Forge refuses the waiting commit; it will not run.</span>
          </div>
        </form>
      ) : (
        <p className="inbox-note">Not decided here: {item.decision.reason}.</p>
      )}
    </li>
  );
}

function Body({ readout, notice }: { readonly readout: InboxReadout; readonly notice?: InboxNotice }): ReactNode {
  // A refusal is shown even when the listing is absent; a success can only be confirmed against a listing.
  const alert = notice?.kind === "error" ? <Notice notice={notice} items={[]} /> : null;
  if (readout.state === "not_configured") {
    return (
      <>
        {alert}
        <p className="inbox-warn">No approver is configured (COGNATE_SEA_FORGE_OPERATOR). Nothing can be approved from here.</p>
      </>
    );
  }
  if (readout.state === "unreachable") {
    return (
      <>
        {alert}
        <p className="inbox-warn">
          SEA-Forge did not list approvals, so this page cannot say what is waiting. {readout.message}
        </p>
      </>
    );
  }
  const { inbox } = readout;
  return (
    <>
      {notice ? <Notice notice={notice} items={[...inbox.waiting, ...inbox.decided]} /> : null}
      {inbox.waiting.length === 0 && inbox.decided.length === 0 && inbox.excluded === 0 ? (
        <p className="inbox-note" data-empty>The inbox is empty: SEA-Forge lists no approvals at all.</p>
      ) : null}
      <section aria-labelledby="waiting-heading">
        <h2 id="waiting-heading">Waiting for a decision ({inbox.waiting.length})</h2>
        {inbox.waiting.length === 0 ? <p className="inbox-note">Nothing is waiting at SEA-Forge, so nothing needs your decision.</p> : <ul className="inbox-list">{inbox.waiting.map((item) => <Item key={item.approval_id} item={item} />)}</ul>}
      </section>
      <section aria-labelledby="decided-heading">
        <h2 id="decided-heading">Decided ({inbox.decided.length})</h2>
        {inbox.decided.length === 0 ? <p className="inbox-note">No decided approvals are listed.</p> : <ul className="inbox-list">{inbox.decided.map((item) => <Item key={item.approval_id} item={item} />)}</ul>}
      </section>
      {inbox.excluded > 0 ? (
        <p className="inbox-warn" data-excluded={inbox.excluded}>
          {inbox.excluded} approval record(s) excluded. SEA-Forge listed them in a shape this page does not recognise, so it cannot show what
          they are or offer a decision on them. They are counted here so they are not hidden; look at them in SEA-Forge.
        </p>
      ) : null}
    </>
  );
}

export function ApprovalInboxPage({ readout, theme, notice }: { readonly readout: InboxReadout; readonly theme?: WorkspaceTheme; readonly notice?: InboxNotice }): ReactNode {
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
          <Body readout={readout} {...(notice ? { notice } : {})} />
        </main>
      </body>
    </html>
  );
}

export function renderApprovalInboxPage(readout: InboxReadout, theme?: WorkspaceTheme, notice?: InboxNotice): string {
  return `<!doctype html>${renderToStaticMarkup(<ApprovalInboxPage readout={readout} theme={theme} {...(notice ? { notice } : {})} />)}`;
}
