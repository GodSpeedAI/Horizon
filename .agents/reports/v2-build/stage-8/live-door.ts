// The real agent door (POST /agent/panels on the desk's port), keyed with the setup's agent key.
// The key is read from the setup's agent.key and never printed or saved.
import { readFileSync } from "node:fs";
import { BASE } from "./lib.ts";

// The agent key lives in the setup's secrets folder (0600). It stays the same across restarts.
const key = readFileSync(`${process.env.HOME}/.horizon/setups/testing/secrets/agent.key`, "utf8").trim();
const headers = { authorization: `Bearer ${key}`, "content-type": "application/json", "x-horizon-agent-name": "Demo agent" };

export interface LiveDoor { agent(op: Record<string, unknown>): Promise<{ status: number; body: unknown }>; log: unknown[] }
export function liveDoor(): LiveDoor {
  const d: LiveDoor = { log: [], async agent(op) {
    const r = await fetch(`${BASE}/agent/panels`, { method: "POST", headers, body: JSON.stringify(op) });
    const out = { status: r.status, body: await r.json().catch(() => null) };
    d.log.push({ op: op.tool, ...out });
    return out;
  } };
  return d;
}
export async function liveCatalogue(): Promise<Record<string, { example: any }>> {
  const r = await fetch(`${BASE}/agent/panels/catalogue`, { headers });
  return ((await r.json()) as any).blocks;
}
export async function refusals(): Promise<Record<string, number>> {
  const op = JSON.stringify({ tool: "show_surface", surface: { id: "x", title: "x", step: null, blocks: [] } });
  const post = (h: Record<string, string>) => fetch(`${BASE}/agent/panels`, { method: "POST", headers: { "content-type": "application/json", ...h }, body: op }).then((r) => r.status);
  return {
    no_key: await post({}),
    wrong_key: await post({ authorization: "Bearer not-the-key" }),
    page_agent_with_key: await post({ ...headers, "x-horizon-source": "page-agent" }),
    human_op_with_key: await fetch(`${BASE}/agent/panels`, { method: "POST", headers, body: JSON.stringify({ op: "human.answer", panel: "x", ask: "y", outcome: "answered", value: "a" }) }).then((r) => r.status),
  };
}
