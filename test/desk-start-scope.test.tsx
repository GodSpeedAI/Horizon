/** @jsxImportSource react */
/** Sending a hand off starts the whole case (the case keeper has no step-level start), so the confirmation names every step that will start and the preview binds that set. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HandoffPreviewCard, handoffFacts, type HandoffPreview } from "../src/ui/desk/Composer.tsx";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { fakeCaseKeeper, type FakeKeeper } from "./support/fake-case-keeper.ts";

const CASE = "case_20261107T061312Z_820737";
let keeper: FakeKeeper;
let app: DeskApp;
let plan: string[] = [];
let advances = 0;
const digestOf = (ids: string[]): string => `sha256:${ids.join(",")}`;

beforeAll(async () => {
  keeper = fakeCaseKeeper((r) => {
    switch (r.verb) {
      case "authority_approvals": return { json: { ok: true, approvals: [] } };
      case "approval_list": return { json: { approvals: [] } };
      case "case_list": return { json: { cases: [{ case_id: CASE, case_state: "active", summary: "Ship the checkout fix", created_at: "2026-11-07T06:13:12.793Z" }], unreadable: [] } };
      case "case_add_item": {
        const item = r.item as { plan_item_id: string };
        if (r.dry_run === true) return { json: { ok: true, dry_run: true, outcome: "would_add", case_id: r.case_id, plan_item_id: item.plan_item_id, proposed_by: "operator_local", item, plan_precondition: { ref: `plan:${CASE}`, expected_digest: digestOf(plan) } } };
        plan = [...plan, item.plan_item_id];
        return { json: { ok: true, case_id: r.case_id, plan_item_id: item.plan_item_id, proposed_by: "operator_local" } };
      }
      case "case_advance": advances += 1; return { json: { ok: true } };
      case "case_get_horizon": return { json: { case_id: CASE, case_state: "active", items: plan.map((id) => ({ plan_item_id: id, name: `Step ${id}`, item_kind: "human_task", execution: "pending", settlement: "unsettled" })) } };
      default: return { json: { ok: false, error_class: "unscripted_verb" } };
    }
  });
  app = await startDeskApp({ approvals: { socketPath: keeper.socketPath, service: { actor_id: "cognate-service", role: "service" }, operator: { actor_id: "actor:operator", role: "operator" }, timeoutMs: 1_500 } });
});
afterAll(async () => {
  await app.stop();
  keeper.stop();
});

const text = "Fix the footer";
async function preview(): Promise<any> {
  const { draftId } = await app.get("/desk/draft");
  const p = (await (await app.post("/desk/handoff/preview", { draft_id: draftId, text })).json()) as any;
  return { draftId, p };
}

describe("the confirmation says what will start", () => {
  test("the preview lists the other waiting steps that will start with the new one", async () => {
    plan = ["old_a", "old_b"];
    const { p } = await preview();
    expect(p.preview.also_starts.map((s: any) => s.step_id)).toEqual(["old_a", "old_b"]);
    expect(p.preview.also_starts.map((s: any) => s.name)).toEqual(["Step old_a", "Step old_b"]);
  });

  test("a step that began waiting after the preview is still nothing: the changed set is refused, and nothing is added or started", async () => {
    plan = ["old_a"];
    advances = 0;
    const { draftId, p } = await preview();
    plan = ["old_a", "old_late"];
    const sent = await app.post("/desk/handoff", { draft_id: draftId, text, plan_precondition: { ...p.preview.plan_precondition, expected_digest: digestOf(plan) }, also_starts: p.preview.also_starts.map((s: any) => s.step_id) });
    // The preview's own binding refuses the changed set first; the effect never runs either way.
    expect(sent.status).toBe(409);
    expect(((await sent.json()) as any).outcome).toBe("preview_out_of_date");
    expect(plan).toEqual(["old_a", "old_late"]);
    expect(advances).toBe(0);
  });

  test("the same set sent back is refused too: the row is refused at this freeze, not the preview", async () => {
    plan = ["old_a"];
    const { draftId, p } = await preview();
    const sent = await app.post("/desk/handoff", { draft_id: draftId, text, plan_precondition: p.preview.plan_precondition, also_starts: p.preview.also_starts.map((s: any) => s.step_id) });
    expect(sent.status).toBe(403);
    expect(plan).toEqual(["old_a"]);
    expect(advances).toBe(0);
  });

  const pv: HandoffPreview = { draft_id: "d", case_id: "c1", case_title: "Seed: triage inbox", step_name: "Fix the footer", step_id: "s", check: "ok", plan_precondition: { ref: "plan:c1", expected_digest: "x" }, agent: { offered: false, words: "" }, also_starts: [{ step_id: "a", name: "Call the supplier" }, { step_id: "b", name: "Write the rollback note" }] };

  test("the confirmation text names every step that will start, and the card lists them", () => {
    const next = handoffFacts(pv, false).next;
    for (const name of ["Fix the footer", "Call the supplier", "Write the rollback note"]) expect(next).toContain(name);
    expect(next).not.toMatch(/^The step is added to the case and started\./);
    const html = renderToStaticMarkup(<HandoffPreviewCard pv={pv} assign={false} outOfDate={false} busy={false} onCancel={() => undefined} onConfirm={() => undefined} onRefresh={() => undefined} />);
    expect(html).toContain("Call the supplier");
    expect(html).toContain("Write the rollback note");
  });

  test("when nothing else is waiting it says only this step starts", () => {
    expect(handoffFacts({ ...pv, also_starts: [] }, false).next).toContain("Only this step will start");
  });
});

describe("starting a case is refused while its targets are unresolved", () => {
  const start = (body: unknown) => app.post("/desk/start", body);

  test("a start of the steps the person previewed is refused, and nothing is started", async () => {
    plan = ["old_a", "old_b"];
    advances = 0;
    const sent = await start({ case_id: CASE, also_starts: ["old_a", "old_b"] });
    // The catalog names this row as a dispatcher with no resolved targets, and the route refuses
    // it rather than starting an unclassified plan (R5-02).
    expect(sent.status).toBe(403);
    const body = (await sent.json()) as any;
    expect(body.outcome).toBe("refused");
    expect(body.message).toContain("refused at this release");
    expect(advances).toBe(0);
    expect((await app.refusals()).some((r) => r.operation === "run.start" && r.route === "POST /desk/start")).toBe(true);
  });

  test("a step added after the preview refuses the start, and nothing is started", async () => {
    plan = ["old_a"];
    advances = 0;
    // The person previewed ["old_a"]; then a step began waiting.
    plan = ["old_a", "old_late"];
    const refused = await start({ case_id: CASE, also_starts: ["old_a"] });
    expect(refused.status).toBe(403);
    expect(advances).toBe(0);
  });

  test("a start that says nothing about what was previewed is refused", async () => {
    plan = ["old_a"];
    advances = 0;
    const bare = await start({ case_id: CASE });
    expect(bare.status).toBe(403);
    expect(advances).toBe(0);
  });
});
