import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { revisionOf } from "./support/answer-revision.ts";
import { statusWord } from "../src/ui/desk/Conversation.tsx";
import { fakeCaseKeeper, type FakeKeeper } from "./support/fake-case-keeper.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

const CASE = "case_20261107T061312Z_820737";
let keeper: FakeKeeper;
let app: DeskApp;
const ask = (id: string) => ({ id, question: `Which way ${id}?`, why_needed: "x", options: [{ option_id: "a", label: "A" }, { option_id: "b", label: "B" }] });
const rows = async (): Promise<any[]> => (await app.get("/desk/conversation")).rows;

beforeAll(async () => {
  keeper = fakeCaseKeeper((r) => {
    if (r.verb === "case_list") return { json: { cases: [{ case_id: CASE, case_state: "active", summary: "Ship the checkout fix", created_at: "2026-11-07T06:13:12.793Z" }], unreadable: [] } };
    if (r.verb === "case_get_horizon") return { json: { case_id: CASE, case_state: "active", items: [{ plan_item_id: "handoff_0a49", name: "Fix the total", item_kind: "agent_task", execution: "pending", settlement: "open" }] } };
    if (r.verb === "authority_approvals") return { json: { ok: true, approvals: [] } };
    if (r.verb === "approval_list") return { json: { approvals: [] } };
    return { json: { ok: false, error_class: "unscripted_verb" } };
  });
  app = await startDeskApp({ approvals: { socketPath: keeper.socketPath, service: { actor_id: "cognate-service", role: "service" }, operator: { actor_id: "actor:operator", role: "operator" }, timeoutMs: 1_500 } });
});
afterAll(async () => {
  await app.stop();
  keeper.stop();
});

/** The question settles `resolves` (a step id, or null). A route is checked only when it names that same step and the step is waiting. */
async function answered(panel: string, resolves: string | null = null): Promise<void> {
  expect((await app.application.applyAgentOp({ tool: "ask_human", panel, ask: { ...ask("q"), resolves } })).ok).toBe(true);
  expect((await app.post("/desk/panels/op", { op: "human.answer", panel, ask: "q", ...(await revisionOf(app, panel, "q")), outcome: "answered", value: "a" })).status).toBe(200);
}

describe("an agent's \"I routed it\" is its claim, not proof", () => {
  test("an unverified route says what the agent says, is not marked done, and is labelled as not checked", async () => {
    await answered("p-claim");
    await app.application.applyAgentOp({ tool: "answer.route", panel_id: "p-claim", ask_id: "q", routed_as: "step nothing_here in some case" });
    const mine = (await rows()).find((r) => r.kind === "answer" && r.refs.panel_id === "p-claim");
    expect(mine.status).toBe("claimed");
    expect(mine.status).not.toBe("done");
    expect(mine.outcome).toContain("The agent says it took it to: step nothing_here in some case");
    expect(mine.outcome).toContain("Not checked");
    expect(mine.outcome).not.toContain("Checked:");
    expect(mine.refs.step_id).toBeUndefined();
    expect(statusWord(mine)).toBe("Agent says so");
  });

  test("an existing, waiting step the question does not resolve does not upgrade the claim", async () => {
    await answered("p-unrelated", "some_other_step");
    await app.application.applyAgentOp({ tool: "answer.route", panel_id: "p-unrelated", ask_id: "q", routed_as: "step handoff_0a49 in Ship the checkout fix" });
    const mine = (await rows()).find((r) => r.kind === "answer" && r.refs.panel_id === "p-unrelated");
    expect(mine.status).toBe("claimed");
    expect(mine.outcome).toContain("Not checked");
    expect(mine.outcome).not.toContain("Checked:");
    expect(mine.refs.step_id).toBeUndefined();
    expect(statusWord(mine)).toBe("Agent says so");
  });

  test("a route that names a step the case keeper holds shows the step as found, with the step as a link, and the claim stays claimed", async () => {
    await answered("p-real", "handoff_0a49");
    await app.application.applyAgentOp({ tool: "answer.route", panel_id: "p-real", ask_id: "q", routed_as: "step handoff_0a49 in Ship the checkout fix" });
    const mine = (await rows()).find((r) => r.kind === "answer" && r.refs.panel_id === "p-real");
    expect(mine.outcome).toContain("The agent says it took it to: step handoff_0a49");
    expect(mine.outcome).toContain('Step found: the step "Fix the total" is in the case');
    expect(mine.outcome).not.toContain("Checked");
    expect(mine.refs).toMatchObject({ step_id: "handoff_0a49", case_id: CASE });
    // Finding the step is not delivery: the row is not marked done.
    expect(mine.status).toBe("claimed");
    expect(mine.status).not.toBe("done");
    expect(statusWord(mine)).toBe("Agent says so");
  });
});
