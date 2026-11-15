/** @jsxImportSource react */
/** Mounted in a real browser by test/desk-outcomes.test.ts: the desk's own components with an io that fails or warns on demand. */
import { createRoot } from "react-dom/client";
import { PanelCard } from "../../src/ui/desk/Panels.tsx";
import { NoteEditor } from "../../src/ui/desk/NoteEditor.tsx";
import { NO_PANELS, reduceAgent } from "../../src/ui/desk/panels-model.ts";

declare global {
  interface Window {
    mountPanel: (reply: { ok: boolean; message: string }) => void;
    mountNote: (reply: { ok: true; recorded_words?: string } | { ok: false; message: string }) => void;
    closedWith: string | null | undefined;
  }
}

window.mountPanel = (reply) => {
  const state = reduceAgent(NO_PANELS, { tool: "ask_human", panel: "p", ask: { id: "q", question: "Ship it?", why_needed: "x", options: [{ option_id: "yes", label: "Yes" }, { option_id: "no", label: "No" }] } }).state;
  const io = { answer: async () => reply, pin: async () => undefined, close: async () => undefined, stopWaiting: async () => ({ ok: false, message: "" }) };
  createRoot(document.getElementById("root")!).render(<PanelCard panel={state.open[0]!} io={io} />);
};

window.mountNote = (reply) => {
  const note = { note_id: "n1", body: "Remember the licence", tags: [], created_at: "2026-11-07T10:00:00.000Z", rev: 1, cases: [], shared_with_agents: false } as never;
  const io = { saveNote: async () => (reply.ok ? { ok: true as const, note, ...(reply.recorded_words === undefined ? {} : { recorded_words: reply.recorded_words }) } : reply) };
  window.closedWith = undefined;
  createRoot(document.getElementById("root")!).render(<NoteEditor note={note} io={io} timeZone="UTC" onDone={(saved) => { window.closedWith = saved === null ? null : "saved"; }} />);
};
