/** @jsxImportSource react */
/**
 * Browser entry. It polls `/desk/state.json` every 2000 ms and hands the result to the reducer, which (rule 2) lets an
 * outside update change only the numbers, list ends and inspector. Drafts and pins are kept in this browser only.
 */
import { useCallback, useEffect, useReducer, useRef } from "react";
import { createRoot } from "react-dom/client";
import type { NoteView } from "../../../capabilities/notes.ts";
import { START, deskReducer, type Pin, type UiState } from "../attention.ts";
import { Desk, type DeskIo } from "../Desk.tsx";
import { resolveKey } from "../keys.ts";
import { POLL_MS, itemsOf, shiftDay, type DeskState, type SearchResult } from "../model.ts";

const DRAFT_KEY = "horizon.desk.draft";
const PINS_KEY = "horizon.desk.pins";

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

function initial(): UiState {
  const draft = read<string>(DRAFT_KEY, "");
  return { ...START, pins: read<Pin[]>(PINS_KEY, []), composer: { ...START.composer, text: draft, selStart: draft.length, selEnd: draft.length } };
}

function focusTarget(focus: string): HTMLElement | null {
  if (focus === "composer") return document.getElementById("composer-input");
  if (focus === "list") return document.querySelector<HTMLElement>('[data-focus="list"]');
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

  useEffect(() => {
    write(DRAFT_KEY, ui.composer.text);
  }, [ui.composer.text]);
  useEffect(() => {
    write(PINS_KEY, ui.pins);
  }, [ui.pins]);

  // Find runs when the question changes or Explore opens.
  const findKey = JSON.stringify(ui.find);
  useEffect(() => {
    if (ui.view !== "explore") return;
    const params = new URLSearchParams({ q: ui.find.q });
    if (ui.find.day) params.set("day", ui.find.day);
    if (ui.find.tag) params.set("tag", ui.find.tag);
    let live = true;
    void fetch(`/desk/search?${params}`)
      .then((r) => r.json() as Promise<SearchResult>)
      .then((results) => live && dispatch({ type: "results", results }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [ui.view, findKey]);

  useEffect(() => {
    focusTarget(ui.focus)?.focus();
  }, [ui.focus, ui.layers.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const current = latest.current;
      const action = resolveKey(
        { key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, shiftKey: event.shiftKey, targetTag: target?.tagName.toLowerCase() ?? "", editable: target?.isContentEditable === true },
        { decisionCard: false },
      );
      if (action === null) return;
      const items = itemsOf(current.view, current.data, current.results);
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
        case "preview":
          return;
      }
      event.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const io: DeskIo = {
    saveNote: async (input) => {
      try {
        const response = await fetch("/desk/note", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
        const body = (await response.json()) as { ok: true; note: NoteView } | { ok: false; message?: string };
        if (response.ok && body.ok) {
          rev.current = "";
          void poll();
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
      });
    },
  };
  return <Desk ui={ui} dispatch={dispatch} io={io} />;
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
