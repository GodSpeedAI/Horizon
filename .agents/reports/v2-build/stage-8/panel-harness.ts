// STAND-IN FOR THE AGENT DOOR. The running desk has no HTTP or tool route for an agent's panel calls: `applyAgentOp` (src/app.ts:1809) is
// reachable only inside the server process, and we may not restart or start servers. So this harness keeps the panel board in the test
// script using the desk's REAL reducers (`reduceAgent`, `reduceHuman`, `questionOf`, the grammar, the live /desk/panels/catalogue),
// and answers the page's /desk/state.json, /desk/conversation and /desk/panels/op for panels only. The page, its client code and its
// drawers are the real ones. Everything else still goes to the live server.
import type { Page } from "/home/sprime01/projects/Horizon/node_modules/playwright-core/index.mjs";
import { NO_PANELS, reduceAgent, reduceHuman, type AgentOp, type Panels } from "/home/sprime01/projects/Horizon/src/ui/desk/panels-model.ts";
import { BASE } from "./lib.ts";

export interface Harness { board: Panels; extraRows: any[]; agent(op: AgentOp): { ok: boolean; message?: string; panel?: string | null }; log: unknown[] }
let n = 900;
const rowOf = (over: Record<string, unknown>) => ({ row_id: `row:${String(++n).padStart(6, "0")}:stand-in`, at: new Date().toISOString(), refs: {}, ...over });

export async function installHarness(page: Page, persist?: Harness): Promise<Harness> {
  const h: Harness = persist ?? { board: NO_PANELS, extraRows: [], log: [], agent(op) {
    const { state, result } = reduceAgent(h.board, op); h.log.push({ op: op.tool, result });
    if (!result.ok) return { ok: false, message: result.message };
    h.board = state;
    if (op.tool === "answer.route") h.extraRows.push(rowOf({ source: "agent", kind: "answer", words: `Your answer to ${op.ask_id}`, outcome: `The agent took it to: ${op.routed_as.trim()}`, status: "done", refs: { panel_id: op.panel_id, ask_id: op.ask_id } }));
    if (result.panel !== null && (op.tool === "show_surface" || op.tool === "ask_human")) {
      const p = h.board.open.find((x) => x.id === result.panel)!;
      const asking = p.blocks.some((b: any) => b.kind === "question" && b.answered == null && b.withdrawn == null);
      const existing = h.extraRows.find((r) => r.kind === "panel" && r.refs.panel_id === p.id);
      const next = { source: "agent", kind: "panel", words: p.title, outcome: asking ? "An agent asks you a question." : "An agent put this up.", status: asking ? "waiting" : "done", refs: { panel_id: p.id } };
      if (existing) Object.assign(existing, next); else h.extraRows.push(rowOf(next));
    }
    return { ok: true, panel: result.panel };
  } };
  await page.route(/\/desk\/state\.json(\?.*)?$/, async (route) => { const u = new URL(route.request().url()); u.searchParams.delete("since"); const r = await route.fetch({ url: u.toString() }); const j = await r.json(); j.panels = { ...h.board, waiting: [] }; j.rev = `stand-in-${Date.now()}`; await route.fulfill({ response: r, json: j }); });
  await page.route(/\/desk\/conversation$/, async (route) => { if (route.request().method() !== "GET") return route.continue(); const r = await route.fetch(); const j = await r.json(); j.rows = [...j.rows, ...h.extraRows].sort((a: any, b: any) => (a.at < b.at ? -1 : 1)); await route.fulfill({ response: r, json: j }); });
  await page.route("**/desk/panels/op", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    if (body.op !== "human.answer") return route.continue();
    const { state, result } = reduceHuman(h.board, { op: "human.answer", panel: body.panel, ask: body.ask, outcome: body.outcome, value: body.value, note: body.note ?? null });
    h.log.push({ op: "human.answer", body, result });
    if (!result.ok) return route.fulfill({ status: 409, json: { ok: false, message: result.message } });
    h.board = state;
    const ask: any = state.open.find((p) => p.id === body.panel)?.blocks.find((b: any) => b.id === body.ask);
    const shown = Array.isArray(body.value) ? body.value.join(", ") : body.value === true ? "Yes" : body.value === false ? "No" : String(body.value ?? "");
    const words = body.outcome === "answered" ? "Sent. Waiting for the agent to say where it went." : body.outcome === "deferred" ? "Put off. Waiting for the agent to say where it went." : "Cancelled. Waiting for the agent to say where it went.";
    h.extraRows.push(rowOf({ source: "you", kind: "answer", words: body.outcome === "answered" ? `You answered: ${shown}` : body.outcome === "deferred" ? "You put this off." : "You skipped this.", outcome: words, status: "waiting", refs: { panel_id: body.panel, ask_id: body.ask } }));
    const prow = h.extraRows.find((r) => r.kind === "panel" && r.refs.panel_id === body.panel);
    if (prow && !state.open.find((p) => p.id === body.panel)!.blocks.some((b: any) => b.kind === "question" && b.answered == null && b.withdrawn == null)) { prow.outcome = "An agent put this up."; prow.status = "done"; }
    void ask;
    await route.fulfill({ json: { ok: true, message: words } });
  });
  return h;
}
export const catalogue = async (): Promise<Record<string, { example: any }>> => ((await (await fetch(`${BASE}/desk/panels/catalogue`)).json()) as any).blocks;
