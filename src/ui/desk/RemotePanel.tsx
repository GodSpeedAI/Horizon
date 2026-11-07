/** @jsxImportSource react */
/**
 * Control from your phone, under the status bar's Settings. It shows what the remote controller reports and offers the same
 * three actions as the old panel (start, refresh the code, stop). It loads only when the Settings menu is opened.
 */
import { useState, type ReactNode } from "react";

export interface RemoteInfo {
  readonly status: {
    readonly state: "off" | "waiting" | "expired" | "connected" | "restoring";
    readonly expires_at: number | null;
    readonly device: { readonly label: string; readonly paired_at: string; readonly last_seen: string | null } | null;
    readonly public_url: string | null;
    readonly reachable: "not_checked" | "ok" | "failed";
  };
  readonly link: string | null;
  /** A QR code as SVG, made by the server from the link. */
  readonly qr: string | null;
}
export interface RemoteIo {
  readonly load: () => Promise<RemoteInfo | null>;
  readonly act: (action: "start" | "refresh" | "stop") => Promise<void>;
}

const STATE_WORDS: Readonly<Record<RemoteInfo["status"]["state"], string>> = {
  off: "Phone control is off.",
  waiting: "Waiting for a phone to scan the code.",
  expired: "The code has expired. Make a new one.",
  connected: "A phone is connected.",
  restoring: "A phone is paired but not connected right now. It reconnects when it reopens the page.",
};

export function RemotePanel({ remote }: { readonly remote: RemoteIo | null }): ReactNode {
  const [info, setInfo] = useState<RemoteInfo | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const refresh = (): void => {
    if (remote === null) return;
    void remote.load().then(setInfo, () => setInfo(null));
  };
  const act = (action: "start" | "refresh" | "stop"): void => {
    if (remote === null) return;
    setBusy(true);
    void remote.act(action).then(() => {
      setBusy(false);
      refresh();
    }, () => setBusy(false));
  };
  return (
    <section className="remote-panel" aria-labelledby="remote-h" data-remote-panel onFocus={() => info === undefined && refresh()} onMouseEnter={() => info === undefined && refresh()}>
      <h3 id="remote-h">Phone remote</h3>
      {remote === null ? (
        <p className="muted">Phone control is not set up in this window.</p>
      ) : info === undefined ? (
        <p className="muted">
          Loading…{" "}
          <button type="button" onClick={refresh}>
            Check phone control
          </button>
        </p>
      ) : info === null ? (
        <p role="alert" className="error">
          Horizon could not read the state of phone control. Nothing is shown from before.{" "}
          <button type="button" onClick={refresh}>
            Try again
          </button>
        </p>
      ) : (
        <>
          <p data-remote-state={info.status.state}>
            <strong>{STATE_WORDS[info.status.state]}</strong>
          </p>
          {info.status.reachable === "failed" ? <p role="alert" className="error">The public address did not answer. Check that the tunnel is running; a phone cannot reach this computer until it is.</p> : null}
          {info.status.state === "waiting" && info.link !== null ? (
            <>
              {info.qr !== null ? <div className="qr" dangerouslySetInnerHTML={{ __html: info.qr }} /> : null}
              <p>
                <code>{info.link}</code>
              </p>
              <p className="muted">The link works once. Making a new code signs out any phone that paired before.</p>
            </>
          ) : null}
          {info.status.device !== null ? (
            <p>
              Phone: {info.status.device.label}. Paired {info.status.device.paired_at}; last seen {info.status.device.last_seen ?? "never"}.
            </p>
          ) : null}
          <div className="row">
            {info.status.state === "off" ? (
              <button type="button" disabled={busy} onClick={() => act("start")}>
                Start phone control
              </button>
            ) : (
              <>
                <button type="button" disabled={busy} onClick={() => act("refresh")}>
                  {info.status.state === "connected" ? "Replace the phone" : "Make a new code"}
                </button>
                <button type="button" disabled={busy} onClick={() => act("stop")}>
                  Stop
                </button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
