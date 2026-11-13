/** Presenting is not access control: what an agent can read is limited on its own. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { setPresenting } from "../src/capabilities/workspace-records.ts";
import { agentRowsOf, WITHHELD_WORDS } from "../src/ui/desk/agent-view.ts";
import { inspectForAgent, INSPECT_WITHHELD } from "../src/ui/desk/webmcp-tools.ts";
import { AGENT_READ_WORDS } from "../src/app.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { fakeCaseKeeper, type FakeKeeper } from "./support/fake-case-keeper.ts";

const CASE = "case_20261107T061312Z_820737";
const AGENT = { "x-horizon-source": "page-agent", "x-horizon-agent-name": "Helper" };
let keeper: FakeKeeper;
let app: DeskApp;
const asAgent = async (path: string) => fetch(`${app.base}${path}`, { headers: AGENT });
const agentJson = async (path: string): Promise<any> => (await asAgent(path)).json();

beforeAll(async () => {
  keeper = fakeCaseKeeper((r) => {
    if (r.verb === "authority_approvals") return { json: { ok: true, approvals: [] } };
    if (r.verb === "approval_list") return { json: { approvals: [] } };
    if (r.verb === "case_list") return { json: { cases: [{ case_id: CASE, case_state: "active", summary: "Ship the acme-secret-repo checkout fix", created_at: "2026-11-07T06:13:12.793Z" }], unreadable: [] } };
    if (r.verb === "case_get_horizon") return { json: { case_id: CASE, case_state: "active", items: [{ plan_item_id: "step_one", name: "Update the acme-secret-repo config", item_kind: "human_task", execution: "pending", settlement: "unsettled" }] } };
    return { json: { ok: false, error_class: "unscripted_verb" } };
  });
  app = await startDeskApp({ repoPath: "/home/x/projects/acme-secret-repo", approvals: { socketPath: keeper.socketPath, service: { actor_id: "cognate-service", role: "service" }, operator: { actor_id: "actor:operator", role: "operator" }, timeoutMs: 1_500 } });
  await app.post("/desk/note", { body: "Private thought about the pangolin budget" });
  await app.post("/desk/note", { body: "Shared thought about the walrus plan", shared_with_agents: true });
  await app.application.applyAgentOp({ tool: "ask_human", panel: "mine", ask: { id: "q", question: "Which walrus plan?", why_needed: "x", options: [{ option_id: "a", label: "A" }, { option_id: "b", label: "B" }] } });
});
afterAll(async () => {
  await app.stop();
  keeper.stop();
});

describe("desk_state and desk_find for an agent", () => {
  test("a note without the flag is not in the state, and one with the flag is", async () => {
    const text = JSON.stringify(await agentJson("/desk/state.json"));
    expect(text).not.toContain("pangolin");
    expect(text).toContain("walrus plan");
    const state = await agentJson("/desk/state.json");
    expect(state.view).toBe("agent");
    expect(state.shared_notes).toHaveLength(1);
    expect(state.counts.notes_today).toBe(2);
    expect(state.withheld).toBe(WITHHELD_WORDS);
  });

  test("it carries case titles, step names, open items and counts", async () => {
    const state = await agentJson("/desk/state.json");
    expect(state.cases[0].title).toContain("acme-secret-repo checkout fix");
    expect(state.cases[0].steps).toEqual(["Update the acme-secret-repo config"]);
    expect(state.open_items.questions).toEqual([{ panel: "mine", ask: "q", question: "Which walrus plan?" }]);
    expect(state.counts.open_questions).toBe(1);
    expect(Object.keys(state).sort()).toEqual(["cases", "counts", "open_items", "proposals", "rev", "shared_notes", "status", "today", "view", "withheld"]);
  });

  test("a find returns counts and shared notes only", async () => {
    const hidden = await agentJson("/desk/search?q=pangolin");
    expect(JSON.stringify(hidden)).not.toContain("pangolin budget");
    // The only note that matches is private: an agent sees no result and no count for it.
    expect(hidden.counts).toEqual({ notes: 0, cases: 0, days: 0, tags: 0 });
    expect(hidden.shared_notes).toEqual([]);
    // A find is a read: the agent's find writes no row, so the private note is not in the conversation either.
    const rows = (await agentJson("/desk/conversation")).rows as { words: string; outcome: string }[];
    expect(rows.find((r) => r.words === "Find: pangolin")).toBeUndefined();
    const shown = await agentJson("/desk/search?q=walrus");
    expect(shown.shared_notes[0].body).toContain("walrus plan");
  });

  test("the person's own reads are unchanged", async () => {
    const mine = await app.state();
    expect(JSON.stringify(mine)).toContain("pangolin");
  });

  test("marking a note as shared is the person's alone: an agent cannot save a note", async () => {
    const response = await fetch(`${app.base}/desk/note`, { method: "POST", headers: { "content-type": "application/json", ...AGENT }, body: JSON.stringify({ body: "sneaky", shared_with_agents: true }) });
    expect(response.status).toBe(403);
  });

  test("editing a note keeps the flag unless the person changes it", async () => {
    const mine = await app.state();
    const note = mine.notes.find((n: any) => n.body.includes("walrus"));
    expect(note.shared_with_agents).toBe(true);
    const edited = (await (await app.post("/desk/note", { note_id: note.note_id, body: "Shared thought, reworded" })).json()) as any;
    expect(edited.note.shared_with_agents).toBe(true);
    const unshared = (await (await app.post("/desk/note", { note_id: note.note_id, body: "Shared thought, reworded", shared_with_agents: false })).json()) as any;
    expect(unshared.note.shared_with_agents).toBe(false);
    expect(JSON.stringify(await agentJson("/desk/state.json"))).not.toContain("reworded");
    await app.post("/desk/note", { note_id: note.note_id, body: "Shared thought about the walrus plan", shared_with_agents: true });
  });
});

describe("desk_inspect for an agent", () => {
  test("a row of yours shows its kind and status only; nested content is withheld", async () => {
    const rows = (await agentJson("/desk/conversation")).rows as any[];
    const note = rows.find((r) => r.kind === "note");
    expect(note.words).toBe("");
    expect(note.outcome).toBe("");
    expect(JSON.stringify(rows.filter((r) => r.source === "you"))).not.toContain("pangolin");
    const inspected = inspectForAgent(note) as any;
    expect(inspected.details).toBe(INSPECT_WITHHELD);
    expect(Object.keys(inspected).sort()).toEqual(["details", "row"]);
    expect(inspected.decided).toBeUndefined();
    expect(inspected.recorded).toBeUndefined();
    expect(inspected.observed).toBeUndefined();
  });

  test("an agent's own rows keep their words", () => {
    const own = { row_id: "r1", at: "2026-11-07T10:00:00Z", source: "agent" as const, kind: "handoff-proposal" as const, words: "Fix the totals", outcome: "waiting", status: "waiting" as const, refs: {} };
    expect(agentRowsOf([own])[0]!.words).toBe("Fix the totals");
  });

  test("an agent on the page cannot read the other parts of the desk", async () => {
    for (const path of ["/desk/work.json", "/desk/decide.json", "/desk/lessons.json", "/desk/draft", "/desk/remote.json"]) {
      const response = await asAgent(path);
      expect(response.status, path).toBe(403);
      expect(((await response.json()) as any).message).toBe(AGENT_READ_WORDS);
    }
  });
});

describe("Presenting still hides names", () => {
  test("with Presenting on the agent's summary has stand-ins; with it off the names show", async () => {
    const store = app.application.runtime.runtime.store;
    const { tenant, actor } = app.application.caller;
    await setPresenting(store, { tenant, operator: actor.id, on: true });
    try {
      const on = JSON.stringify(await agentJson("/desk/state.json"));
      expect(on).not.toContain("acme-secret-repo");
      expect(on).toContain("checkout fix");
    } finally {
      await setPresenting(store, { tenant, operator: actor.id, on: false });
    }
    expect(JSON.stringify(await agentJson("/desk/state.json"))).toContain("acme-secret-repo");
  });
});
