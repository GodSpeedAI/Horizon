/** @jsxImportSource react */
/** A hand off shows what came of each stage on its own: Sent, Started, Given to an agent, Result seen. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Access } from "../src/adapters/workshop.ts";
import { START } from "../src/ui/desk/attention.ts";
import { Desk } from "../src/ui/desk/Desk.tsx";
import type { ConversationRow } from "../src/ui/desk/conversation-model.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { deskState } from "./support/desk-fixture.ts";
import { quietIo } from "./support/desk-io.ts";
import { fakeCaseKeeper, type FakeKeeper } from "./support/fake-case-keeper.ts";

const CASE = "case_20261107T061312Z_820737";
let keeper: FakeKeeper;
let app: DeskApp;
let plan: string[] = [];
let advanceFails = false;
let assignFails = false;
let finished = false;
const replies = new Map<string, unknown>();
const digestOf = (ids: string[]): string => `sha256:${ids.join(",")}`;
const resulting = (id: string): string[] => (plan.includes(id) ? plan : [...plan, id]);
const proposerOf = (r: Record<string, unknown>): string => String((r.on_behalf_of as { actor_id?: string } | undefined)?.actor_id ?? (r.actor as { actor_id?: string } | undefined)?.actor_id ?? "");
const planDigest = (r: Record<string, unknown>, id: string): string => digestOf([...resulting(id), `proposed_by:${proposerOf(r)}`]);
const workshop = (): Access => ({ kind: "ready", client: { async invoke(_c, input) { if (assignFails) throw new Error("the agent service is down"); return { assignmentId: (input as { id: string }).id }; } } });

beforeAll(async () => {
  keeper = fakeCaseKeeper((r) => {
    switch (r.verb) {
      case "authority_approvals": return { json: { ok: true, approvals: [] } };
      case "approval_list": return { json: { approvals: [] } };
      case "case_list": return { json: { cases: [{ case_id: CASE, case_state: "active", summary: "Ship the checkout fix", created_at: "2026-11-07T06:13:12.793Z" }], unreadable: [] } };
      case "case_add_item": {
        const item = r.item as { plan_item_id: string };
        if (r.dry_run === true) return { json: { ok: true, dry_run: true, outcome: "would_add", case_id: r.case_id, plan_item_id: item.plan_item_id, proposed_by: "operator_local", item, plan_precondition: { ref: `plan:${CASE}`, expected_digest: planDigest(r, item.plan_item_id) } } };
        const id = String(r.request_id);
        if (replies.has(id)) return { json: replies.get(id) };
        plan = resulting(item.plan_item_id);
        const reply = { ok: true, case_id: r.case_id, plan_item_id: item.plan_item_id, proposed_by: "operator_local" };
        replies.set(id, reply);
        return { json: reply };
      }
      case "case_advance": return advanceFails ? { json: { ok: false, error_class: "advance_failed", error: "the case keeper could not start it" } } : { json: { ok: true } };
      case "case_get_horizon": return { json: { case_id: CASE, case_state: "active", items: plan.map((id) => ({ plan_item_id: id, name: `Step ${id}`, item_kind: "human_task", execution: finished ? "completed" : "pending", settlement: "unsettled" })) } };
      default: return { json: { ok: false, error_class: "unscripted_verb" } };
    }
  });
  app = await startDeskApp({ approvals: { socketPath: keeper.socketPath, service: { actor_id: "cognate-service", role: "service" }, operator: { actor_id: "actor:operator", role: "operator" }, timeoutMs: 1_500 }, workshop });
});
afterAll(async () => {
  await app.stop();
  keeper.stop();
});

async function handOff(text: string, assign: boolean): Promise<ConversationRow> {
  plan = [];
  replies.clear();
  const { draftId } = await app.get("/desk/draft");
  const p = (await (await app.post("/desk/handoff/preview", { draft_id: draftId, text })).json()) as any;
  const sent = await app.post("/desk/handoff", { draft_id: draftId, text, plan_precondition: p.preview.plan_precondition, assign });
  expect(sent.status).toBe(200);
  const rows = ((await app.get("/desk/conversation")).rows as ConversationRow[]).filter((r) => r.kind === "handoff" && r.words === text);
  expect(rows).toHaveLength(1);
  return rows[0]!;
}
const stage = (row: ConversationRow, name: string) => row.stages!.find((g) => g.name === name)!;
const draw = (rows: ConversationRow[]): string => renderToStaticMarkup(<Desk ui={{ ...START, data: deskState(), view: "conversation", rows }} dispatch={() => undefined} io={quietIo()} />);
const words = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("hand off stages", () => {
  test("everything worked: Sent, Started and Given to an agent are done, and Result seen is not seen yet", async () => {
    advanceFails = false; assignFails = false; finished = false;
    const row = await handOff("Fix the totals", true);
    expect(row.status).toBe("done");
    expect(row.stages!.map((g) => [g.name, g.status])).toEqual([["Sent", "done"], ["Started", "done"], ["Given to an agent", "done"], ["Result seen", "unseen"]]);
    const html = words(draw([row]));
    expect(html).toContain("Sent: Yes");
    expect(html).toContain("Result seen: Not seen yet");
    expect(html).not.toContain("Completed");
  });

  test("a stage that was not asked for is not shown", async () => {
    advanceFails = false; assignFails = false; finished = false;
    const row = await handOff("Fix the labels", false);
    expect(row.stages!.map((g) => g.name)).toEqual(["Sent", "Started", "Result seen"]);
  });

  test("starting failed: Sent stays a success, Started says why and offers Try again, and the row is partly done", async () => {
    advanceFails = true; assignFails = false; finished = false;
    const row = await handOff("Fix the footer", false);
    expect(row.status).toBe("partial");
    expect(stage(row, "Sent").status).toBe("done");
    expect(stage(row, "Started")).toMatchObject({ status: "refused", recovery: "Try again" });
    expect(stage(row, "Started").words).toContain("did not start");
    const html = draw([row]);
    expect(words(html)).toContain("Partly done");
    expect(words(html)).toContain("Started: Failed");
    expect(html).toContain('data-recover="try-again"');
    expect(words(html)).not.toContain("Completed");
  });

  test("giving it to an agent failed: that stage says so and offers Open the step", async () => {
    advanceFails = false; assignFails = true; finished = false;
    const row = await handOff("Fix the header", true);
    expect(row.status).toBe("partial");
    expect(stage(row, "Started").status).toBe("done");
    expect(stage(row, "Given to an agent")).toMatchObject({ status: "refused", recovery: "Open the step" });
    expect(draw([row])).toContain('data-recover="open-step"');
  });

  test("Result seen turns to done only when the case keeper shows the step finished", async () => {
    advanceFails = false; assignFails = false; finished = false;
    const row = await handOff("Fix the menu", false);
    expect(stage(row, "Result seen").status).toBe("unseen");
    finished = true;
    const later = ((await app.get("/desk/conversation")).rows as ConversationRow[]).find((r) => r.row_id === row.row_id)!;
    expect(stage(later, "Result seen")).toMatchObject({ status: "done", words: "The step finished." });
    expect(stage(later, "Sent").status).toBe("done");
    finished = false;
  });
});
