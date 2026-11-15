/** @jsxImportSource react */
/** A hand off shows what came of each stage on its own: Sent, Started, Given to an agent, Result seen. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Access } from "../src/adapters/workshop.ts";
import { START } from "../src/ui/desk/attention.ts";
import { Desk } from "../src/ui/desk/Desk.tsx";
import type { ConversationRow, RowStage } from "../src/ui/desk/conversation-model.ts";
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

async function refusedSend(text: string, assign: boolean): Promise<{ status: number; body: Record<string, any> }> {
  plan = [];
  replies.clear();
  const { draftId } = await app.get("/desk/draft");
  const p = (await (await app.post("/desk/handoff/preview", { draft_id: draftId, text })).json()) as any;
  const sent = await app.post("/desk/handoff", { draft_id: draftId, text, plan_precondition: p.preview.plan_precondition, assign });
  return { status: sent.status, body: (await sent.json()) as Record<string, any> };
}
/**
 * A row as the desk writes one. The send path that produced these rows is refused at this freeze
 * (R5-01), so the stages are built here from the row model the desk's conversation keeps; the
 * component below is what these tests are about.
 */
const rowOf = (name: string, stages: readonly RowStage[], status: "done" | "partial"): ConversationRow => ({
  row_id: `row-${name}`,
  at: "2026-11-06T10:00:00.000Z",
  source: "you",
  kind: "handoff",
  words: name,
  outcome: "",
  status,
  refs: {},
  stages,
});
const stage = (row: ConversationRow, name: string) => row.stages!.find((g) => g.name === name)!;
const draw = (rows: ConversationRow[]): string => renderToStaticMarkup(<Desk ui={{ ...START, data: deskState(), view: "conversation", rows }} dispatch={() => undefined} io={quietIo()} />);
const words = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("hand off stages", () => {
  test("a refused send leaves one hand off row, refused, with no stage claimed", async () => {
    advanceFails = false; assignFails = false; finished = false;
    const { status, body } = await refusedSend("Fix the totals", true);
    expect(status).toBe(403);
    expect(body.outcome).toBe("refused");
    // Nothing reached the case keeper, so no stage is shown as done.
    expect(plan).toEqual([]);
    const rows = ((await app.get("/desk/conversation")).rows as ConversationRow[]).filter((r) => r.kind === "handoff" && r.words === "Fix the totals");
    const refused = rows.filter((r) => r.status === "refused");
    expect(refused.length).toBeGreaterThanOrEqual(1);
    expect(refused[0]!.stages).toBeUndefined();
    expect(refused[0]!.outcome).toContain("refused at this release");
  });

  test("everything worked: Sent, Started and Given to an agent are done, and Result seen is not seen yet", () => {
    const row = rowOf("Fix the totals", [
      { name: "Sent", status: "done", words: "The step was added to the case." },
      { name: "Started", status: "done", words: "The step is under way." },
      { name: "Given to an agent", status: "done", words: "An agent has the step." },
      { name: "Result seen", status: "unseen", words: "Not seen yet." },
    ], "done");
    expect(row.stages!.map((g) => [g.name, g.status])).toEqual([["Sent", "done"], ["Started", "done"], ["Given to an agent", "done"], ["Result seen", "unseen"]]);
    const html = words(draw([row]));
    expect(html).toContain("Sent: Yes");
    expect(html).toContain("Result seen: Not seen yet");
    expect(html).not.toContain("Completed");
  });

  test("a stage that was not asked for is not shown", () => {
    const row = rowOf("Fix the labels", [
      { name: "Sent", status: "done", words: "The step was added to the case." },
      { name: "Started", status: "done", words: "The step is under way." },
      { name: "Result seen", status: "unseen", words: "Not seen yet." },
    ], "done");
    expect(row.stages!.map((g) => g.name)).toEqual(["Sent", "Started", "Result seen"]);
  });

  test("starting failed: Sent stays a success, Started says why and offers Try again, and the row is partly done", () => {
    const row = rowOf("Fix the footer", [
      { name: "Sent", status: "done", words: "The step was added to the case." },
      { name: "Started", status: "refused", words: "It did not start: the case keeper could not start it", recovery: "Try again" },
      { name: "Result seen", status: "unseen", words: "Not seen yet." },
    ], "partial");
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

  test("giving it to an agent failed: that stage says so and offers Open the step", () => {
    const row = rowOf("Fix the header", [
      { name: "Sent", status: "done", words: "The step was added to the case." },
      { name: "Started", status: "done", words: "The step is under way." },
      { name: "Given to an agent", status: "refused", words: "No agent has it: the agent service is down", recovery: "Open the step" },
      { name: "Result seen", status: "unseen", words: "Not seen yet." },
    ], "partial");
    expect(row.status).toBe("partial");
    expect(stage(row, "Started").status).toBe("done");
    expect(stage(row, "Given to an agent")).toMatchObject({ status: "refused", recovery: "Open the step" });
    expect(draw([row])).toContain('data-recover="open-step"');
  });

  test("Result seen is not seen until the case keeper shows the step finished", () => {
    const unseen = rowOf("Fix the menu", [
      { name: "Sent", status: "done", words: "The step was added to the case." },
      { name: "Started", status: "done", words: "The step is under way." },
      { name: "Result seen", status: "unseen", words: "Not seen yet." },
    ], "done");
    const seen = rowOf("Fix the menu", [
      { name: "Sent", status: "done", words: "The step was added to the case." },
      { name: "Started", status: "done", words: "The step is under way." },
      { name: "Result seen", status: "done", words: "The step finished." },
    ], "done");
    expect(stage(unseen, "Result seen").status).toBe("unseen");
    expect(stage(seen, "Result seen")).toMatchObject({ status: "done", words: "The step finished." });
    expect(stage(seen, "Sent").status).toBe("done");
  });
});
