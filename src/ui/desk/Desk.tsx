/** @jsxImportSource react */
/**
 * The desk layout (design 5.1): status bar, left column, the open view, inspector and composer.
 * `Desk` only draws what `ui` holds; every change goes through `dispatch`, so nothing an agent sends can move the reader.
 */
import { useState, type ReactNode } from "react";
import type { Action, UiState } from "./attention.ts";
import { confirmOffReason } from "./Preview.tsx";
import type { RemoteIo } from "./RemotePanel.tsx";
import type { SaveLabel } from "./LabelControl.tsx";
import type { InspectIo } from "./Answers.tsx";
import type { RecordPin } from "./model.ts";
import { Composer, type ComposerRequest, type HandoffIo } from "./Composer.tsx";
import { ConversationView, requestFor, type ConversationIo } from "./Conversation.tsx";
import type { PanelsIo } from "./Panels.tsx";
import { Inspector } from "./Inspector.tsx";
import { KEY_TABLE } from "./keys.ts";
import { Nav } from "./Nav.tsx";
import { VIEWS, dayLabel, type ViewId } from "./model.ts";
import { RevisionList, type NoteIo, type OpenLink } from "./NoteEditor.tsx";
import { StatusBar } from "./StatusBar.tsx";
import { Decide } from "./views/Decide.tsx";
import { Work } from "./views/Work.tsx";
import { Explore } from "./views/Explore.tsx";
import { Today } from "./views/Today.tsx";
import type { LinkKind } from "../../domain/note.ts";

export interface DecideInput {
  readonly card_id: string;
  readonly choice: "accept" | "reject" | "hold" | "release";
  readonly preview_code: string;
  readonly records: readonly RecordPin[];
  readonly reason: string;
}

export interface DeskIo extends NoteIo, InspectIo {
  readonly setPresenting: (on: boolean) => void;
  /** Sends one decision. A refusal comes back as `ok: false` with the words to show; nothing throws. */
  readonly decide: (input: DecideInput) => Promise<{ readonly ok: boolean; readonly message: string }>;
  readonly saveLabel: SaveLabel;
  readonly remote: RemoteIo | null;
  /** Hand off: words become a step in a case (stage 4). */
  readonly handoff: HandoffIo;
  /** Answers, pins and closes on panels from agents (stage 4). */
  readonly panels: PanelsIo;
  /** The stored conversation: discarding a waiting suggestion. */
  readonly conversation: ConversationIo;
  /** Starts the steps of a case that were added and are waiting. */
  readonly startCase: (caseId: string, previewed: readonly string[]) => Promise<{ readonly ok: boolean; readonly message: string }>;
}

export interface DeskProps {
  readonly ui: UiState;
  readonly dispatch: (action: Action) => void;
  readonly io: DeskIo;
  /** For tests: the time used to say how long a card has waited. */
  readonly nowMs?: number;
}

function Layer({ id, title, onClose, children }: { readonly id: string; readonly title: string; readonly onClose: () => void; readonly children: ReactNode }): ReactNode {
  return (
    <div className="layer-backdrop">
      <div className="layer" role="dialog" aria-modal="true" aria-labelledby={`${id}-h`} id={`layer-${id}`}>
        <div className="layer-head">
          <h2 id={`${id}-h`}>{title}</h2>
          <button type="button" onClick={onClose}>
            Close (Esc)
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function QuickMenu({ ui, dispatch, io }: DeskProps): ReactNode {
  const [filter, setFilter] = useState("");
  const data = ui.data;
  type Entry = { readonly label: string; readonly run: () => void };
  const close = (): void => dispatch({ type: "escape" });
  const entries: Entry[] = [
    ...VIEWS.map((v): Entry => ({ label: `Go to ${v.label}`, run: () => dispatch({ type: "view", view: v.id }) })),
    ...(data?.days ?? []).slice(0, 14).map((d): Entry => ({ label: `Day: ${d.day}`, run: () => dispatch({ type: "day", day: d.day === data?.today ? null : d.day }) })),
    ...(data?.cases ?? []).map((c): Entry => ({ label: `Case: ${c.purpose}`, run: () => dispatch({ type: "select", id: c.case_ref }) })),
    ...(data?.tags ?? []).map((t): Entry => ({ label: `Tag: ${t.name}`, run: () => dispatch({ type: "find", q: "", tag: t.name }) })),
    { label: "Show all keys", run: () => dispatch({ type: "open-layer", kind: "keys" }) },
    { label: `Turn Presenting ${data?.status.presenting ? "off" : "on"}`, run: () => io.setPresenting(!data?.status.presenting) },
  ];
  const shown = entries.filter((e) => e.label.toLowerCase().includes(filter.toLowerCase()));
  const pick = (e: Entry | undefined): void => {
    if (!e) return;
    close();
    e.run();
  };
  return (
    <Layer id="quick" title="Quick menu" onClose={close}>
      <label>
        Jump to a day, case or tag, or run an action
        <input type="text" data-autofocus value={filter} onChange={(event) => setFilter(event.target.value)} onKeyDown={(event) => event.key === "Enter" && pick(shown[0])} />
      </label>
      {shown.length === 0 ? (
        <p className="empty">Nothing matches “{filter}”. Clear the box to see everything.</p>
      ) : (
        <ul className="quick-list">
          {shown.map((e) => (
            <li key={e.label}>
              <button type="button" onClick={() => pick(e)}>
                {e.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Layer>
  );
}

export function Desk(props: DeskProps): ReactNode {
  const { ui, dispatch, io } = props;
  const confirm = (): void => {
    const open = ui.decision;
    const card = open === null ? undefined : ui.data?.decide.cards.find((c) => c.id === open.cardId);
    if (open === null || card === undefined || confirmOffReason(card, open) !== null) return;
    dispatch({ type: "decision-busy" });
    void io
      .decide({ card_id: card.id, choice: open.choice, preview_code: open.code, records: open.records, reason: open.reason })
      .then((result) => dispatch({ type: "decision-result", ok: result.ok, message: result.message }));
  };
  const release = (cardId: string): void => {
    void io.decide({ card_id: cardId, choice: "release", preview_code: "", records: [], reason: "" }).then((result) => dispatch({ type: "decision-result", ok: result.ok, message: result.message }));
  };
  const data = ui.data;
  // One composer, one record: the conversation asks the composer for a preview through this request, never through a copy of its state.
  const [request, setRequest] = useState<ComposerRequest | null>(null);
  const ask = (words: string, draftId?: string): void => setRequest((r) => ({ n: (r?.n ?? 0) + 1, words, ...(draftId === undefined ? {} : { draftId }) }));
  const onLink: OpenLink = (kind: LinkKind, ref: string) => {
    if (kind === "day") dispatch({ type: "day", day: ref === data?.today ? null : ref });
    else dispatch({ type: "select", id: kind === "case" || kind === "note" ? ref : `${kind}:${ref}` });
  };
  const viewProps = { ui, data, dispatch, onLink };
  const view: Record<ViewId, ReactNode> = {
    today: <Today {...viewProps} />,
    conversation: <ConversationView ui={ui} dispatch={dispatch} panels={io.panels} conversation={io.conversation} onConfirm={(row) => ask(requestFor(row).words, requestFor(row).draftId)} onPreviewWords={(words) => ask(words)} />,
    explore: <Explore {...viewProps} />,
    decide: <Decide {...viewProps} confirm={confirm} release={release} {...(props.nowMs === undefined ? {} : { nowMs: props.nowMs })} />,
    work: <Work {...viewProps} saveLabel={io.saveLabel} startCase={io.startCase} />,
  };
  const history = data?.selected?.history ?? [];
  return (
    <div className="desk" data-presenting={data?.status.presenting ? "on" : "off"} data-setup={data?.status.setup ?? "none"}>
      <a className="skip" href="#main">
        Skip to the open view
      </a>
      <StatusBar status={data?.status ?? null} onPresenting={io.setPresenting} remote={io.remote} />
      <div className="desk-body">
        <Nav ui={ui} data={data} dispatch={dispatch} />
        <main id="main" className="main" aria-label={VIEWS.find((v) => v.id === ui.view)?.label}>
          {view[ui.view]}
          <Composer ui={ui} dispatch={dispatch} io={io} request={request} />
        </main>
        <Inspector ui={ui} dispatch={dispatch} io={io} onLink={onLink} />
      </div>
      {ui.layers.map((layer, index) =>
        layer.kind === "quick" ? (
          <QuickMenu key={index} {...props} />
        ) : layer.kind === "keys" ? (
          <Layer key={index} id="keys" title="All keys" onClose={() => dispatch({ type: "escape" })}>
            <table className="keys">
              <tbody>
                {KEY_TABLE.map((row) => (
                  <tr key={row.keys}>
                    <th scope="row">{row.keys}</th>
                    <td>{row.does}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Layer>
        ) : (
          <Layer key={index} id="history" title="Earlier wording" onClose={() => dispatch({ type: "escape" })}>
            {history.length === 0 ? <p className="empty">{ui.selection === null ? "Select a note first." : "Loading the earlier wording…"}</p> : <RevisionList history={history} timeZone={data?.timezone ?? "UTC"} onLink={onLink} />}
          </Layer>
        ),
      )}
      <p className="sr-only" aria-live="polite" data-live>
        {data === null ? "" : `${dayLabel(ui.day ?? data.today)}. ${data.status.waiting} waiting for you.`}
      </p>
    </div>
  );
}
