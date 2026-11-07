/** @jsxImportSource react */
/**
 * Browser entry. It polls `/desk/state.json` every 2000 ms and hands the result to the reducer, which (rule 2) lets an
 * outside update change only the numbers, list ends and inspector. Drafts and pins are kept in this browser only.
 */
import { useCallback, useEffect, useReducer, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { NoteView } from "../../../capabilities/notes.ts";
import { START, deskReducer, type FirstMove, type Pin, type UiState } from "../attention.ts";
import { Desk, type DeskIo } from "../Desk.tsx";
import type { RemoteInfo } from "../RemotePanel.tsx";
import type { WorkData } from "../work-build.ts";
import type { InspectionAnswer, NextState } from "../model.ts";
import { resolveKey } from "../keys.ts";
import type { ConversationRow } from "../conversation-model.ts";
import { startDeskTools } from "../webmcp.ts";
import type { DeskAgentInvoker } from "../webmcp-tools.ts";
import { POLL_MS, itemsOf, shiftDay, withDetails, type DeskState, type SearchResult } from "../model.ts";

const DRAFT_KEY = "horizon.desk.draft";
const PINS_KEY = "horizon.desk.pins";
/** The conversation is refetched this often while the tab is visible, so rows from agents appear. */
const ROWS_POLL_MS = 5000;
const AGENT_HEADERS = { "x-horizon-source": "page-agent", "x-horizon-agent-name": "Agent on this page" } as const;

/** The desk page is served with a write token. Every write the person makes sends it back; an agent's call (marked with the page-agent header) never does. */
function sendWriteToken(): void {
  const token = document.querySelector('meta[name="horizon-write-token"]')?.getAttribute("content") ?? "";
  const nativeFetch = window.fetch.bind(window);
  window.fetch = Object.assign((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method === "GET" || method === "HEAD" || headers.has("x-horizon-source") || token === "") return nativeFetch(input, init);
    headers.set("x-horizon-write", token);
    return nativeFetch(input, { ...init, headers });
  }, nativeFetch);
}
sendWriteToken();

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private windows and blocked storage: the desk works without a saved draft.
  }
}

/** The old addresses still open the right view: /workspace/approvals is Decide, /workspace/economics is Work. */
function viewFromPath(): UiState["view"] {
  const path = window.location.pathname;
  return path.startsWith("/workspace/approvals") ? "decide" : path.startsWith("/workspace/economics") ? "work" : "today";
}

function initial(): UiState {
  const draft = read<string>(DRAFT_KEY, "");
  return { ...START, view: viewFromPath(), pins: read<Pin[]>(PINS_KEY, []), composer: { ...START.composer, text: draft, selStart: draft.length, selEnd: draft.length } };
}

function focusTarget(focus: string): HTMLElement | null {
  if (focus === "composer") return document.getElementById("composer-input");
  if (focus === "list") return document.querySelector<HTMLElement>('[data-focus="list"]');
  if (focus === "heading") return document.querySelector<HTMLElement>(".view h1");
  if (focus === "decision") return document.querySelector<HTMLElement>("#decision-preview [data-autofocus]") ?? document.getElementById("decision-preview");
  if (focus.startsWith("layer:")) return document.querySelector<HTMLElement>(`#layer-${focus.slice(6)} [data-autofocus], #layer-${focus.slice(6)} button`);
  return null;
}

function App() {
  const [ui, dispatch] = useReducer(deskReducer, undefined, initial);
  const latest = useRef(ui);
  latest.current = ui;
  const rev = useRef("");

  const poll = useCallback(async () => {
    const current = latest.current;
    const params = new URLSearchParams({ since: rev.current });
    if (current.day !== null) params.set("day", current.day);
    if (current.selection?.startsWith("note:")) params.set("note", current.selection);
    const here = new URLSearchParams(window.location.search);
    for (const key of ["receipt", "case_error"]) {
      const value = here.get(key);
      if (value !== null) params.set(key, value);
    }
    try {
      const response = await fetch(`/desk/state.json?${params}`, { headers: { accept: "application/json" } });
      if (!response.ok) return;
      const body = (await response.json()) as DeskState | { unchanged: true; rev: string };
      if ("unchanged" in body) return;
      rev.current = body.rev;
      dispatch({ type: "poll", state: body });
    } catch {
      // Offline or restarting: the last state stays on screen and the next poll tries again.
    }
  }, []);

  // The conversation: refetched after each of your own operations and gently every 5 seconds while the tab is visible.
  const loadRows = useCallback(async () => {
    try {
      const response = await fetch("/desk/conversation", { headers: { accept: "application/json" } });
      if (!response.ok) return;
      const body = (await response.json()) as { rows?: ConversationRow[] };
      if (Array.isArray(body.rows)) dispatch({ type: "rows", rows: body.rows });
    } catch {
      // The last rows stay; the next read tries again.
    }
  }, []);
  useEffect(() => {
    void loadRows();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadRows();
    }, ROWS_POLL_MS);
    const onVisible = (): void => {
      if (document.visibilityState === "visible") void loadRows();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadRows]);

  // The page offers a few actions to an agent beside you. Each calls the same desk endpoints the buttons use, as an agent, and none can confirm anything.
  useEffect(() => {
    const call = async (path: string, init: RequestInit = {}): Promise<unknown> => {
      const response = await fetch(path, { ...init, headers: { accept: "application/json", ...(init.body === undefined ? {} : { "content-type": "application/json" }), ...AGENT_HEADERS } });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((body as { message?: string }).message ?? "The desk could not do that.");
      return body;
    };
    const invoker: DeskAgentInvoker = {
      state: () => call("/desk/state.json"),
      find: (q) => call(`/desk/search?${new URLSearchParams({ q, record: "1" })}`).finally(() => void loadRows()),
      inspect: async (rowId) => {
        const listed = (await call("/desk/conversation")) as { rows?: ConversationRow[] };
        const row = listed.rows?.find((r) => r.row_id === rowId);
        if (row === undefined) throw new Error("No such item in the conversation.");
        const intent = row.refs.intent_id;
        const move = intent === undefined ? null : (latest.current.data?.home.moves.find((m) => m.intent_id === intent) ?? null);
        return { row, decided: move?.decided ?? null, recorded: move?.recorded ?? null, observed: move?.observed ?? null };
      },
      proposeHandoff: (words, caseId) =>
        call("/desk/handoff/preview", { method: "POST", body: JSON.stringify({ draft_id: crypto.randomUUID(), text: words, ...(caseId === undefined ? {} : { case_id: caseId }) }) })
          .then(() => ({ ok: true, message: "Your suggestion is waiting in the conversation. Nothing is sent until the person confirms." }))
          .finally(() => void loadRows()),
      proposeNote: async (words) => {
        // No network write: the words go in the box as a suggestion for the person to save or discard.
        dispatch({ type: "mode", mode: "write" });
        dispatch({ type: "typing", text: words, selStart: words.length, selEnd: words.length });
        dispatch({ type: "notice", text: "Suggested by an agent — save or discard" });
        return { ok: true, message: "The words are in the box for the person to save or discard." };
      },
    };
    const handle = startDeskTools(document, invoker);
    const stop = (): void => handle.stop();
    window.addEventListener("pagehide", stop);
    return () => {
      window.removeEventListener("pagehide", stop);
      handle.stop();
    };
  }, [loadRows]);

  useEffect(() => {
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [poll]);

  // A different day or selection needs a different answer now, not in two seconds.
  useEffect(() => {
    rev.current = "";
    void poll();
  }, [ui.day, ui.selection, poll]);

  // Work: the record keeper is slow to ask, so it is read when the view opens, when the question changes, and every 15 seconds.
  const workKey = JSON.stringify(ui.workQuery);
  const loadWork = useCallback(async () => {
    const q = latest.current.workQuery;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(q)) if (value) params.set(key, value);
    try {
      const response = await fetch(`/desk/work.json?${params}`, { headers: { accept: "application/json" } });
      if (response.ok) dispatch({ type: "work", work: (await response.json()) as WorkData });
    } catch {
      // The last Work screen stays; the next read tries again.
    }
  }, []);
  useEffect(() => {
    if (ui.view !== "work") return;
    void loadWork();
    const timer = window.setInterval(() => void loadWork(), 15_000);
    return () => window.clearInterval(timer);
  }, [ui.view, workKey, loadWork]);

  // The next decision comes from the shared frame; read when Decide opens and every 15 seconds while it is open.
  useEffect(() => {
    if (ui.view !== "decide") return;
    const load = (): void => {
      void fetch("/desk/next.json")
        .then((r) => r.json() as Promise<NextState>)
        .then((next) => dispatch({ type: "next", next }))
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 15_000);
    return () => window.clearInterval(timer);
  }, [ui.view]);

  // The first move is built only when the first-run path reaches it, because building it makes a frame.
  const wantsFirstMove = ui.data?.home.onboarding.visible === true && ui.data.home.onboarding.steps.find((step) => !step.done)?.id === "move";
  useEffect(() => {
    if (!wantsFirstMove || latest.current.firstMove !== undefined) return;
    void fetch("/desk/first-move.json")
      .then((r) => r.json() as Promise<{ firstMove: FirstMove | null }>)
      .then((body) => dispatch({ type: "first-move", move: body.firstMove }))
      .catch(() => dispatch({ type: "first-move", move: null }));
  }, [wantsFirstMove]);

  useEffect(() => {
    write(DRAFT_KEY, ui.composer.text);
  }, [ui.composer.text]);
  useEffect(() => {
    write(PINS_KEY, ui.pins);
  }, [ui.pins]);

  // Find runs when the question changes or Explore opens.
  const findKey = JSON.stringify(ui.find);
  const recorded = useRef("");
  useEffect(() => {
    if (ui.view !== "explore") return;
    const params = new URLSearchParams({ q: ui.find.q });
    if (ui.find.day) params.set("day", ui.find.day);
    if (ui.find.tag) params.set("tag", ui.find.tag);
    // Only a find the person submitted is kept in the conversation, and only once; find-as-you-type and reopening Explore are not moves.
    if (ui.find.record === true && recorded.current !== findKey) {
      recorded.current = findKey;
      params.set("record", "1");
    }
    let live = true;
    void fetch(`/desk/search?${params}`)
      .then((r) => r.json() as Promise<SearchResult>)
      .then((results) => {
        if (live) dispatch({ type: "results", results });
        if (params.has("record")) void loadRows();
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [ui.view, findKey]);

  useEffect(() => {
    focusTarget(ui.focus)?.focus();
  }, [ui.focus, ui.layers.length, ui.view]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const current = latest.current;
      const action = resolveKey(
        { key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, shiftKey: event.shiftKey, targetTag: target?.tagName.toLowerCase() ?? "", editable: target?.isContentEditable === true },
        { decisionCard: current.view === "decide" && (current.data?.decide.cards.some((c) => c.held === null) ?? false) },
      );
      if (action === null) return;
      const items = itemsOf(current.view, current.data, current.results, current.rows);
      switch (action.type) {
        case "focus-composer":
          dispatch({ type: "focus", target: "composer" });
          document.getElementById("composer-input")?.focus();
          break;
        case "quick-menu":
          dispatch({ type: "open-layer", kind: "quick" });
          break;
        case "view":
          dispatch({ type: "view", view: action.view });
          break;
        case "day": {
          const today = current.data?.today;
          if (!today) return;
          const next = shiftDay(current.day ?? today, action.delta, today);
          dispatch({ type: "day", day: next === today ? null : next });
          break;
        }
        case "cursor":
          dispatch({ type: "cursor", delta: action.delta, length: items.length });
          break;
        case "open": {
          const item = items[current.cursor];
          if (!item) return;
          dispatch({ type: "select", id: item.id });
          break;
        }
        case "escape":
          dispatch({ type: "escape" });
          break;
        case "keys-help":
          dispatch({ type: "open-layer", kind: "keys" });
          break;
        case "preview": {
          // A, R and H only open the preview of the card under the cursor. Nothing is decided until Confirm.
          const waiting = current.data?.decide.cards.filter((c) => c.held === null) ?? [];
          const card = waiting[Math.min(current.cursor, waiting.length - 1)];
          if (!card) return;
          dispatch({ type: "preview-open", cardId: card.id, choice: action.choice });
          break;
        }
      }
      event.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const io: DeskIo = {
    inspect: async (operation, query) => {
      try {
        const params = new URLSearchParams({ operation });
        if (query.trim() !== "") params.set("query", query);
        const response = await fetch(`/workspace/inspect?${params}`);
        const body = (await response.json()) as InspectionAnswer & { message?: string };
        return response.ok ? { ok: true, answer: body } : { ok: false, message: body.message ?? "The question could not be answered." };
      } catch {
        return { ok: false, message: "Horizon did not answer, so nothing is shown." };
      }
    },
    decide: async (input) => {
      try {
        const response = await fetch("/desk/decide", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
        const body = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string; details?: string };
        rev.current = "";
        void poll();
          void loadRows();
        return { ok: response.ok && body.ok === true, message: withDetails(body.message ?? (response.ok ? "Done." : "Horizon could not send that decision. Nothing was done."), body.details) };
      } catch {
        return { ok: false, message: "Horizon did not answer, so the decision may not have been sent. Check Decide before trying again." };
      }
    },
    saveLabel: async (fields) => {
      try {
        const response = await fetch("/workspace/label", { method: "POST", headers: { accept: "application/json" }, body: new URLSearchParams({ ...fields, return: "" }) });
        const body = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
        void loadWork();
        return response.ok && body.ok === true ? { ok: true } : { ok: false, message: body.message ?? "The label was not saved." };
      } catch {
        return { ok: false, message: "Horizon did not answer, so the label was not saved." };
      }
    },
    startCase: async (caseId) => {
      try {
        const response = await fetch("/desk/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ case_id: caseId }) });
        const body = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
        void loadWork();
        return { ok: response.ok && body.ok === true, message: body.message ?? (response.ok ? "Started." : "It did not start.") };
      } catch {
        return { ok: false, message: "Horizon did not answer, so nothing was started." };
      }
    },
    conversation: {
      discard: async (rowId) => {
        try {
          const response = await fetch("/desk/conversation/discard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ row_id: rowId }) });
          const body = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
          void loadRows();
          return { ok: response.ok && body.ok === true, message: body.message ?? (response.ok ? "Discarded. Nothing was sent." : "That could not be discarded.") };
        } catch {
          return { ok: false, message: "Horizon did not answer, so nothing was discarded." };
        }
      },
    },
    panels: {
      answer: async (input) => {
        try {
          const response = await fetch("/desk/panels/op", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "human.answer", ...input }) });
          const body = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
          rev.current = "";
          void poll();
          void loadRows();
          return { ok: response.ok && body.ok === true, message: body.message ?? (response.ok ? "Sent." : "The answer was not sent.") };
        } catch {
          return { ok: false, message: "Horizon did not answer, so your answer may not have been sent." };
        }
      },
      pin: async (id, pinned) => {
        await fetch("/desk/panels/op", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "human.pin", id, pinned }) }).catch(() => undefined);
        rev.current = "";
        void poll();
          void loadRows();
      },
      close: async (id) => {
        await fetch("/desk/panels/op", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "human.close", id }) }).catch(() => undefined);
        rev.current = "";
        void poll();
          void loadRows();
      },
      stopWaiting: async (step) => {
        try {
          const response = await fetch("/desk/panels/op", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "human.stop_waiting", step }) });
          const body = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
          rev.current = "";
          void poll();
          void loadRows();
          return { ok: response.ok && body.ok === true, message: body.message ?? "Done." };
        } catch {
          return { ok: false, message: "Horizon did not answer." };
        }
      },
    },
    handoff: {
      draft: async () => {
        try {
          const response = await fetch("/desk/draft");
          return response.ok ? ((await response.json()) as never) : null;
        } catch {
          return null;
        }
      },
      saveDraft: (input) => {
        void fetch("/desk/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...input, mode: "handoff" }) }).catch(() => undefined);
      },
      preview: async (input) => {
        try {
          const response = await fetch("/desk/handoff/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
          const body = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string; details?: string; preview?: never };
          void loadRows();
          return response.ok && body.ok === true && body.preview ? { ok: true, preview: body.preview } : { ok: false, message: withDetails(body.message ?? "Horizon could not show a preview. Nothing was sent.", body.details) };
        } catch {
          return { ok: false, message: "Horizon did not answer, so there is no preview. Nothing was sent." };
        }
      },
      send: async (input) => {
        try {
          const response = await fetch("/desk/handoff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
          const body = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string; details?: string; outcome?: string; draft_id?: string };
          rev.current = "";
          void poll();
          void loadRows();
          return response.ok && body.ok === true ? { ok: true, message: body.message ?? "Handed off.", draft_id: body.draft_id ?? "" } : { ok: false, outcome: body.outcome ?? "failed", message: withDetails(body.message ?? "The hand off was not sent. Nothing was done.", body.details) };
        } catch {
          return { ok: false, outcome: "unreachable", message: "Horizon did not answer, so the hand off may not have been sent. Press Confirm again: the same request is never applied twice." };
        }
      },
    },
    remote: {
      load: async () => {
        const response = await fetch("/desk/remote.json");
        return response.ok ? ((await response.json()) as RemoteInfo) : null;
      },
      act: async (action) => {
        await fetch(`/workspace/remote/${action}`, { method: "POST", redirect: "manual" });
      },
    },
    saveNote: async (input) => {
      try {
        const response = await fetch("/desk/note", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
        const body = (await response.json()) as { ok: true; note: NoteView } | { ok: false; message?: string };
        if (response.ok && body.ok) {
          rev.current = "";
          void poll();
          void loadRows();
          return body;
        }
        return { ok: false, message: ("message" in body && body.message) || "The note was not saved. Try again." };
      } catch {
        return { ok: false, message: "The note was not saved because Horizon did not answer. Your text is still in the box." };
      }
    },
    setPresenting: (on) => {
      void fetch("/workspace/presenting", { method: "POST", redirect: "manual", body: new URLSearchParams({ on: on ? "1" : "0", return: "" }) }).then(() => {
        rev.current = "";
        void poll();
          void loadRows();
      });
    },
  };
  return <Desk ui={ui} dispatch={dispatch} io={io} />;
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
