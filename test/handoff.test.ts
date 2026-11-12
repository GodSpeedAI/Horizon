/**
 * Hand off (stage 4): words become one step in a case, previewed first with a dry run, sent with the preview's plan digest and a
 * request number made from the draft. Run against a stand-in case keeper that replays a request number and refuses a changed plan.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import type { Access } from "../src/adapters/workshop.ts";
import { currentDraft, handoffItem, nextDraft, saveDraft } from "../src/capabilities/handoff.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { fakeCaseKeeper, type FakeKeeper } from "./support/fake-case-keeper.ts";

const CASE = "case_20261107T061312Z_820737";
let keeper: FakeKeeper;
let app: DeskApp;
let plan: string[] = [];
const replies = new Map<string, unknown>();
const adds: Record<string, unknown>[] = [];
const assignments = new Map<string, string>();
let assignCalls = 0;
let connected = true;
let hangNextAdd = false;
let advanceFails = false;
const advances: Record<string, unknown>[] = [];

const digestOf = (ids: string[]): string => `sha256:${ids.join(",")}`;
const resulting = (id: string): string[] => (plan.includes(id) ? plan : [...plan, id]);
// Like the real case keeper: the step records who proposed it (the operator a write is made for, else the caller), and that is part of the digest.
const proposerOf = (r: Record<string, unknown>): string => String((r.on_behalf_of as { actor_id?: string } | undefined)?.actor_id ?? (r.actor as { actor_id?: string } | undefined)?.actor_id ?? "");
const planDigest = (r: Record<string, unknown>, id: string): string => digestOf([...resulting(id), `proposed_by:${proposerOf(r)}`]);

const workshop = (): Access =>
  connected
    ? {
        kind: "ready",
        client: {
          async invoke(_capability, input) {
            assignCalls += 1;
            const i = input as { id: string; requestId: string };
            const known = assignments.get(i.id);
            if (known !== undefined && known !== i.requestId) throw new Error("Assignment identity already exists");
            assignments.set(i.id, i.requestId);
            return { assignmentId: i.id };
          },
        },
      }
    : { kind: "not_connected", why: "missing", words: "Agent work is not connected: there is no access key yet. Make one in the workshop settings." };

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
        if (r.dry_run === true) return { json: { ok: true, dry_run: true, outcome: "would_add", case_id: r.case_id, plan_item_id: item.plan_item_id, proposed_by: "operator_local", item, plan_precondition: { ref: `plan:${CASE}`, expected_digest: planDigest(r, item.plan_item_id) } } };
        const requestId = String(r.request_id);
        if (replies.has(requestId)) return { json: replies.get(requestId) };
        if (hangNextAdd) {
          hangNextAdd = false;
          return { hang: true };
        }
        const pre = (r.preconditions as { records: { expected_digest: string }[] } | undefined)?.records[0];
        if (pre === undefined || pre.expected_digest !== planDigest(r, item.plan_item_id)) {
          // Like the real case keeper: a refusal is remembered under its request id and replayed.
          const stale = { outcome: "rejected_as_stale", code: "precondition_failed", changed_records: [{ ref: `plan:${CASE}`, expected_digest: pre?.expected_digest ?? "", current_digest: planDigest(r, item.plan_item_id) }] };
          replies.set(requestId, stale);
          return { json: stale };
        }
        plan = resulting(item.plan_item_id);
        adds.push(r);
        const reply = { ok: true, case_id: r.case_id, plan_item_id: item.plan_item_id, proposed_by: "operator_local" };
        replies.set(requestId, reply);
        return { json: reply };
      }
      case "case_advance":
        advances.push(r);
        return advanceFails ? { json: { ok: false, error_class: "advance_failed", error: "the case keeper could not start it" } } : { json: { ok: true } };
      case "case_get_horizon":
        return { json: { case_id: CASE, case_state: "active", items: plan.map((id) => ({ plan_item_id: id, name: `Step ${id}`, item_kind: "human_task", execution: "pending", settlement: "unsettled" })) } };
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

const reset = (): void => {
  plan = [];
  replies.clear();
  adds.length = 0;
  assignments.clear();
  assignCalls = 0;
  connected = true;
  hangNextAdd = false;
  advanceFails = false;
  advances.length = 0;
};
const draft = async (): Promise<{ draftId: string; agent: { offered: boolean } }> => app.get("/desk/draft");
const preview = async (draftId: string, text: string) => {
  const response = await app.post("/desk/handoff/preview", { draft_id: draftId, text });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
};
const send = async (body: Record<string, unknown>) => {
  const response = await app.post("/desk/handoff", body);
  return { status: response.status, body: (await response.json()) as Record<string, any> };
};

describe("Hand off", () => {
  test("the preview names the step, the case and the check, and sends nothing", async () => {
    reset();
    const { draftId } = await draft();
    const p = await preview(draftId, "Fix the checkout total");
    expect(p.status).toBe(200);
    expect(p.body.preview).toMatchObject({ step_name: "Fix the checkout total", case_title: "Ship the checkout fix", case_id: CASE, agent: { offered: true } });
    expect(p.body.preview.check).toContain("fits");
    expect(adds).toHaveLength(0);
    expect(keeper.received.filter((r) => r.verb === "case_add_item").every((r) => r.dry_run === true)).toBe(true);
  });

  test("a send is refused before the case keeper is called, and the refusal is kept", async () => {
    reset();
    const { draftId } = await draft();
    const p = await preview(draftId, "Fix the checkout total");
    const request = { draft_id: draftId, text: "Fix the checkout total", plan_precondition: p.body.preview.plan_precondition, assign: true };
    // The catalog's row is refused at this freeze: no pending record, no protected confirmation,
    // no authority. The route answers 403 in the catalog's own words and adds nothing (R5-01).
    const sent = await send(request);
    expect(sent.status).toBe(403);
    expect(sent.body.outcome).toBe("refused");
    expect(sent.body.message).toContain("refused at this release");
    expect(plan).toHaveLength(0);
    expect(adds).toHaveLength(0);
    expect(advances).toHaveLength(0);
    expect(assignCalls).toBe(0);
    // Where the refusal is recorded: one audit per attempt, naming the row and the route.
    const audits = (await app.refusals()).filter((r) => r.operation === "handoff.send");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ route: "POST /desk/handoff", code_op: null });
    expect(audits[0]!.reason).toContain("refused before any target effect");
    // Trying again refuses again and still changes nothing.
    expect((await send(request)).status).toBe(403);
    expect((await app.refusals()).filter((r) => r.operation === "handoff.send")).toHaveLength(2);
    expect(adds).toHaveLength(0);
    // The draft is untouched, so the person keeps their words.
    expect((await draft()).draftId).toBe(draftId);
  });

  test("a refused send leaves the preview's own checks in place", async () => {
    reset();
    const { draftId } = await draft();
    const p = await preview(draftId, "Fix the checkout total");
    // Input the person could not have meant is still refused as input, before the effect gate:
    // a missing plan precondition and a missing draft id never reach the catalog's refusal.
    expect((await send({ draft_id: draftId, text: "Fix the checkout total" })).status).toBe(400);
    expect((await send({ draft_id: "not-a-uuid", text: "x", plan_precondition: p.body.preview.plan_precondition })).status).toBe(400);
    expect((await send({ draft_id: draftId, text: "   ", plan_precondition: p.body.preview.plan_precondition })).body.outcome).toBe("empty");
    // The staleness check the preview carries still runs, and still sends nothing.
    plan = ["someone_elses_step"];
    const stale = await send({ draft_id: draftId, text: "Fix the checkout total", plan_precondition: p.body.preview.plan_precondition, also_starts: ["a_different_set"] });
    expect(stale.status).toBe(409);
    expect(stale.body.outcome).toBe("preview_out_of_date");
    expect(adds).toHaveLength(0);
    expect(plan).toEqual(["someone_elses_step"]);
  });

  test("a refusal names the catalog's reason and writes no step, no start and no assignment", async () => {
    reset();
    const { draftId } = await draft();
    const p = await preview(draftId, "Fix the checkout total");
    const body = { draft_id: draftId, text: "Fix the checkout total", plan_precondition: p.body.preview.plan_precondition };
    const before = (await app.refusals()).filter((r) => r.operation === "handoff.send").length;
    const [a, b, c] = await Promise.all([send(body), send(body), send(body)]);
    expect([a.status, b.status, c.status]).toEqual([403, 403, 403]);
    // Three attempts, three audits, and the case keeper was never asked to add anything.
    expect((await app.refusals()).filter((r) => r.operation === "handoff.send")).toHaveLength(before + 3);
    expect(keeper.received.filter((r) => r.verb === "case_add_item" && r.dry_run === false)).toHaveLength(0);
    expect(plan).toHaveLength(0);
    expect(advances).toHaveLength(0);
  });

  test("the person's started step under Work shows nothing added, because nothing was sent", async () => {
    reset();
    const { draftId } = await draft();
    const p = await preview(draftId, "Fix the checkout total");
    const done = await send({ draft_id: draftId, text: "Fix the checkout total", plan_precondition: p.body.preview.plan_precondition });
    expect(done.status).toBe(403);
    const work = await app.get("/desk/work.json");
    expect(work.cases.items[0].waiting.map((w: any) => w.plan_item_id)).toEqual(plan);
    expect(plan).toEqual([]);
  });

  test("a refused send never asks the case keeper to start the case", async () => {
    reset();
    const { draftId } = await draft();
    const p = await preview(draftId, "Fix the checkout total");
    const done = await send({ draft_id: draftId, text: "Fix the checkout total", plan_precondition: p.body.preview.plan_precondition });
    expect(done.status).toBe(403);
    expect(advances).toHaveLength(0);
    // Start it is refused too: the dispatcher's targets are not resolved at this freeze (R5-02).
    const start = await app.post("/desk/start", { case_id: CASE, also_starts: [...plan] });
    expect(start.status).toBe(403);
    expect(((await start.json()) as Record<string, any>).message).toContain("refused at this release");
    expect(advances).toHaveLength(0);
    expect((await app.refusals()).some((r) => r.operation === "run.start")).toBe(true);
  });

  test("a refusal does not depend on agent work being connected", async () => {
    reset();
    connected = false;
    const { draftId, agent } = await draft();
    expect(agent.offered).toBe(false);
    const p = await preview(draftId, "Fix it");
    expect(p.body.preview.agent.offered).toBe(false);
    expect(p.body.preview.agent.words).toContain("Not connected");
    // Asking for an agent is refused first, because there is no agent to give it to; either way
    // nothing is added, and the plain send is refused by the catalog's own row.
    const refused = await send({ draft_id: draftId, text: "Fix it", plan_precondition: p.body.preview.plan_precondition, assign: true });
    expect(refused.status).toBe(409);
    expect(refused.body.outcome).toBe("not_connected");
    expect(adds).toHaveLength(0);
    expect(assignCalls).toBe(0);
    expect((await send({ draft_id: draftId, text: "Fix it", plan_precondition: p.body.preview.plan_precondition })).status).toBe(403);
    expect(adds).toHaveLength(0);
  });

  test("bad input is refused in words before anything is sent", async () => {
    reset();
    const { draftId } = await draft();
    const before = keeper.received.filter((r) => r.verb === "case_add_item").length;
    expect((await preview(draftId, "   ")).body.outcome).toBe("empty");
    expect((await preview("not-a-uuid", "x")).status).toBe(400);
    expect((await preview(draftId, "x".repeat(2001))).body.outcome).toBe("too_long");
    expect((await send({ draft_id: draftId, text: "ok" })).status).toBe(400);
    expect(keeper.received.filter((r) => r.verb === "case_add_item")).toHaveLength(before);
  });
});

describe("the draft is kept", () => {
  test("a draft keeps its id and text, and only the sent draft starts a new one", async () => {
    const store = createMemoryStore();
    const a = await currentDraft(store, "t", "op");
    expect(await currentDraft(store, "t", "op")).toEqual(a);
    expect(await saveDraft(store, "t", "op", { draftId: a.draftId, text: "half written", mode: "handoff" })).toBe(true);
    expect(await currentDraft(store, "t", "op")).toEqual({ draftId: a.draftId, text: "half written", mode: "handoff" });
    expect(await saveDraft(store, "t", "op", { draftId: "some-other-draft", text: "x", mode: "write" })).toBe(false);
    const b = await nextDraft(store, "t", "op", a.draftId);
    expect(b.draftId).not.toBe(a.draftId);
    expect((await nextDraft(store, "t", "op", a.draftId)).draftId).toBe(b.draftId);
    expect(handoffItem(a.draftId, "do it")).toEqual(handoffItem(a.draftId, "do it"));
  });
});
