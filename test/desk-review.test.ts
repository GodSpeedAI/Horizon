/**
 * Run a review (stage 6): a review is a step added through Hand off with the review marker. When an agent is given the step,
 * the workshop is told which assignment is under review, so the reviewer starts without the author's memory.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Access } from "../src/adapters/workshop.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { fakeCaseKeeper, type FakeKeeper } from "./support/fake-case-keeper.ts";

const CASE = "case_20261107T061312Z_820737";
let keeper: FakeKeeper;
let app: DeskApp;
const plan: string[] = [];
const converse: Record<string, unknown>[] = [];
const adds: Record<string, any>[] = [];

const workshop = (): Access => ({
  kind: "ready",
  client: {
    async invoke(_capability, input) {
      converse.push(input as Record<string, unknown>);
      return { assignmentId: (input as { id: string }).id };
    },
  },
});

beforeAll(async () => {
  keeper = fakeCaseKeeper((r) => {
    switch (r.verb) {
      case "authority_approvals":
        return { json: { ok: true, approvals: [] } };
      case "approval_list":
        return { json: { approvals: [] } };
      case "case_list":
        return { json: { cases: [{ case_id: CASE, case_state: "active", summary: "Ship the checkout fix", created_at: "2026-11-07T06:13:12.793Z" }], unreadable: [] } };
      case "case_add_item": {
        const item = r.item as { plan_item_id: string };
        const after = [...plan, item.plan_item_id];
        if (r.dry_run === true) return { json: { ok: true, dry_run: true, outcome: "would_add", case_id: r.case_id, plan_item_id: item.plan_item_id, proposed_by: "operator_local", item, plan_precondition: { ref: `plan:${CASE}`, expected_digest: `sha256:${after.join(",")}` } } };
        plan.push(item.plan_item_id);
        adds.push(r);
        return { json: { ok: true, case_id: r.case_id, plan_item_id: item.plan_item_id, proposed_by: "operator_local" } };
      }
      case "case_advance":
        return { json: { ok: true } };
      case "case_get_horizon":
        return { json: { case_id: CASE, case_state: "active", items: [{ plan_item_id: "draft_note", name: "Draft the rollback note", item_kind: "human_task", execution: "completed", settlement: "unsettled" }, { plan_item_id: "later", name: "Not done yet", item_kind: "human_task", execution: "pending", settlement: "unsettled" }, ...plan.map((id) => ({ plan_item_id: id, name: id, item_kind: "human_task", execution: "pending", settlement: "unsettled" }))] } };
      default:
        return { json: { ok: false, error_class: "unscripted_verb" } };
    }
  });
  app = await startDeskApp({ approvals: { socketPath: keeper.socketPath, service: { actor_id: "cognate-service", role: "service" }, operator: { actor_id: "actor:operator", role: "operator" }, timeoutMs: 1_500 }, workshop });
});
afterAll(async () => {
  await app.stop();
  keeper.stop();
});

const review = async (assign: boolean, stepId: string) => {
  const { draftId } = (await app.get("/desk/draft")) as { draftId: string };
  const preview = await (await app.post("/desk/handoff/preview", { draft_id: draftId, text: "Check the rollback note", review: {} })).json();
  expect(preview.preview.review.reviewable).toEqual([{ step_id: "draft_note", name: "Draft the rollback note" }]);
  const sent = await app.post("/desk/handoff", { draft_id: draftId, text: "Check the rollback note", plan_precondition: preview.preview.plan_precondition, assign, review: { step_id: stepId } });
  return { status: sent.status, body: (await sent.json()) as Record<string, any> };
};

describe("Run a review", () => {
  test("run a review is refused at this freeze: no review step is added", async () => {
    adds.length = 0;
    const result = await review(false, "draft_note");
    // The preview still names what could be reviewed; the send is refused before any step is added (R5-01).
    expect(result.status).toBe(403);
    expect(result.body.outcome).toBe("refused");
    expect(adds).toHaveLength(0);
    expect(converse).toHaveLength(0);
  });

  test("a review of work that is not finished is refused and adds nothing", async () => {
    adds.length = 0;
    const result = await review(false, "later");
    expect(result.status).toBe(409);
    expect(adds).toHaveLength(0);
  });

  test("a review assigned to an agent is refused too, and no agent is given anything", async () => {
    converse.length = 0;
    const result = await review(true, "draft_note");
    expect(result.status).toBe(403);
    expect(converse).toHaveLength(0);
  });

  test("an ordinary Hand off is refused and passes no reviewed assignment", async () => {
    converse.length = 0;
    adds.length = 0;
    const { draftId } = (await app.get("/desk/draft")) as { draftId: string };
    const preview = await (await app.post("/desk/handoff/preview", { draft_id: draftId, text: "Fix the checkout total" })).json();
    const sent = await app.post("/desk/handoff", { draft_id: draftId, text: "Fix the checkout total", plan_precondition: preview.preview.plan_precondition, assign: true });
    expect(sent.status).toBe(403);
    expect(adds).toHaveLength(0);
    expect(converse).toHaveLength(0);
  });
});
