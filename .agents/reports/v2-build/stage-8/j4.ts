// Journey 4: the page tools cannot confirm; a call marked as from an agent on the page is refused on every write except the preview.
import { launch, open, save, BASE } from "./lib.ts";
const b = await launch(); const { page } = await open(b); const log: Record<string, unknown> = {};
const names: string[] = await page.evaluate(async () => (await (document as any).modelContext.getTools()).map((t: any) => t.name));
log.tool_names = names; log.exactly_five = names.length === 5;
log.none_can_send_or_decide = !names.some((n) => /confirm|send|decide|approve|answer|done|hold|settle|accept/i.test(n));
await b.close();
const H = { "content-type": "application/json", "x-horizon-source": "page-agent", "x-horizon-agent-name": "Proof agent" };
const calls: [string, string, unknown][] = [
  ["POST", "/desk/handoff", { draft_id: "00000000-0000-0000-0000-000000000000", text: "x", case_id: "x" }],
  ["POST", "/desk/decide", { id: "x", choice: "accept" }],
  ["POST", "/desk/note", { text: "an agent wrote this" }],
  ["POST", "/desk/panels/op", { op: "human.answer", panel: "p", ask: "a", outcome: "answered", value: "x" }],
  ["POST", "/desk/start", { case_id: "x" }],
  ["POST", "/desk/lesson", { text: "x" }],
];
const results: unknown[] = [];
for (const [m, p, body] of calls) {
  const r = await fetch(`${BASE}${p}`, { method: m, headers: H, body: JSON.stringify(body) });
  results.push({ method: m, path: p, status: r.status, body: await r.json().catch(() => null) });
}
const before = ((await (await fetch(`${BASE}/desk/state.json`)).json()) as any).notes?.length;
log.refusals = results; log.all_403 = (results as any[]).every((r) => r.status === 403);
// Control: the same note without the header is the person's own and works; the preview is allowed for the agent (that is how proposals work).
const pv = await fetch(`${BASE}/desk/handoff/preview`, { method: "POST", headers: H, body: JSON.stringify({ draft_id: crypto.randomUUID(), text: "Stage 8 proof: preview allowed for agent" }) });
log.agent_preview_status = pv.status;
save("j4-log.json", log); console.log(JSON.stringify(log, null, 1)); void before;
