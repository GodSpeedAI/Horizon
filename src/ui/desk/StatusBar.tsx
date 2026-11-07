/** @jsxImportSource react */
/**
 * The strip across the top (design 5.1). It shows only what the connected parts report; nothing an agent writes can reach it.
 * The Presenting switch replaces project names with stand-ins everywhere in the desk. Settings holds phone control.
 */
import type { ReactNode } from "react";
import { orgWords, rulebookWords, type DeskStatus } from "./model.ts";
import { RemotePanel, type RemoteIo } from "./RemotePanel.tsx";

export interface StatusBarProps {
  readonly status: DeskStatus | null;
  readonly onPresenting: (on: boolean) => void;
  readonly remote?: RemoteIo | null;
}

export function StatusBar({ status, onPresenting, remote = null }: StatusBarProps): ReactNode {
  if (status === null) {
    return (
      <header className="status-bar" aria-label="Status" role="banner">
        <p role="status">Loading the desk…</p>
      </header>
    );
  }
  // The rulebook is named once, in the top line. The list below skips it so it is not said twice.
  const parts = status.parts.filter((part) => part.name !== "Rules");
  return (
    <header className="status-bar" aria-label="Status" role="banner" data-presenting={status.presenting ? "on" : "off"}>
      <div className="status-line">
        <strong data-field="org">{orgWords(status.org)}</strong>
        {status.setup !== null ? (
          <span className="badge" data-setup={status.setup}>
            Setup: {status.setup}
          </span>
        ) : null}
        <span data-field="rules">{rulebookWords(status.rules)}</span>
        <span data-field="case">Case: {status.openCase ? status.openCase.purpose : "none open"}</span>
        <span data-field="waiting" className={status.waiting > 0 ? "needs-you" : undefined}>
          Needs you: {status.waiting}
        </span>
      </div>
      <ul className="status-line parts" aria-label="Health of each connected part">
        {parts.map((part) => (
          <li key={part.name} data-connected={part.connected ? "yes" : "no"}>
            {part.words}
          </li>
        ))}
      </ul>
      <div className="status-line">
        <button type="button" role="switch" aria-checked={status.presenting} data-presenting-switch onClick={() => onPresenting(!status.presenting)}>
          Presenting: {status.presenting ? "on" : "off"}
        </button>
        <details className="settings">
          <summary>Settings</summary>
          <div className="settings-body">
            <RemotePanel remote={remote} />
            <p>
              <a href="/desk/setup-guide">Setup guide</a>
            </p>
          </div>
        </details>
      </div>
      {status.keyWarning !== null ? (
        <p role="alert" className="warning" data-key-warning>
          {status.keyWarning}
        </p>
      ) : null}
    </header>
  );
}
