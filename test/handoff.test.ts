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

  test("the same Hand off request sent three times gives one step and one assignment", async () => {
    reset();
    const { draftId } = await draft();
    const p = await preview(draftId, "Fix the checkout total");
    const request = { draft_id: draftId, text: "Fix the checkout total", plan_precondition: p.body.preview.plan_precondition, assign: true };
    const results = [await send(request), await send(request), await send(request)];
    for (const r of results) expect(r.status).toBe(200);
    expect(plan).toHaveLength(1);
    expect(adds).toHaveLength(1);
    expect(assignments.size).toBe(1);
    expect([...assignments.keys()][0]).toBe(`assign:${CASE}:${plan[0]}`);
    const sentIds = keeper.received.filter((r) => r.verb === "case_add_item" && r.dry_run === false).map((r) => r.request_id);
    expect(new Set(sentIds)).toEqual(new Set([`handoff:${draftId}`]));
    expect(results[0]!.body.assigned).toEqual({ done: true, words: "Given to an agent." });
  });

  test("a new draft makes a new step", async () => {
    reset();
    const first = await draft();
    const p1 = await preview(first.draftId, "First job");
    const done = await send({ draft_id: first.draftId, text: "First job", plan_precondition: p1.body.preview.plan_precondition });
    expect(done.status).toBe(200);
    const second = await draft();
    expect(second.draftId).not.toBe(first.draftId);
    expect(done.body.draft_id).toBe(second.draftId);
    const p2 = await preview(second.draftId, "Second job");
    await send({ draft_id: second.draftId, text: "Second job", plan_precondition: p2.body.preview.plan_precondition });
    expect(plan).toHaveLength(2);
    expect(new Set(plan).size).toBe(2);
    expect(adds.map((a) => a.request_id)).toEqual([`handoff:${first.draftId}`, `handoff:${second.draftId}`]);
  });

  test("a stale hand off preview sends nothing", async () => {
    reset();
    const { draftId } = await draft();
    const p = await preview(draftId, "Fix the checkout total");
    plan = ["someone_elses_step"]; // the case's plan changed after the preview
    const result = await send({ draft_id: draftId, text: "Fix the checkout total", plan_precondition: p.body.preview.plan_precondition, assign: true });
    expect(result.status).toBe(409);
    expect(result.body.outcome).toBe("preview_out_of_date");
    expect(result.body.message).toContain("Preview out of date");
    expect(adds).toHaveLength(0);
    expect(plan).toEqual(["someone_elses_step"]);
    expect(assignCalls).toBe(0);
    // The draft is kept, so a fresh preview and confirm still work.
    expect((await draft()).draftId).toBe(draftId);
    const again = await preview(draftId, "Fix the checkout total");
    expect((await send({ draft_id: draftId, text: "Fix the checkout total", plan_precondition: again.body.preview.plan_precondition })).status).toBe(200);
  });

  test("a hand off retried after a stale preview succeeds with the next attempt id", async () => {
    reset();
    const { draftId } = await draft();
    const p = await preview(draftId, "Fix the checkout total");
    plan = ["someone_elses_step"];
    const stale = await send({ draft_id: draftId, text: "Fix the checkout total", plan_precondition: p.body.preview.plan_precondition });
    expect(stale.body.outcome).toBe("preview_out_of_date");
    const p2 = await preview(draftId, "Fix the checkout total");
    const ok = await send({ draft_id: draftId, text: "Fix the checkout total", plan_precondition: p2.body.preview.plan_precondition });
    expect(ok.status).toBe(200);
    const ids = keeper.received.filter((r) => r.verb === "case_add_item" && r.dry_run === false).slice(-2).map((r) => r.request_id);
    expect(ids).toEqual([`handoff:${draftId}`, `handoff:${draftId}:a1`]);
    expect(plan).toHaveLength(2);
    expect(adds).toHaveLength(1);
  });

  test("a timeout keeps the same request id", async () => {
    reset();
    const { draftId } = await draft();
    const p = await preview(draftId, "Fix the checkout total");
    const body = { draft_id: draftId, text: "Fix the checkout total", plan_precondition: p.body.preview.plan_precondition };
    hangNextAdd = true;
    const lost = await send(body);
    expect(lost.status).toBe(502);
    const again = await send(body);
    expect(again.status).toBe(200);
    const ids = keeper.received.filter((r) => r.verb === "case_add_item" && r.dry_run === false).slice(-2).map((r) => r.request_id);
    expect(ids).toEqual([`handoff:${draftId}`, `handoff:${draftId}`]);
    expect(adds).toHaveLength(1);
  });

  test("an agent's proposal keeps its own draft: your draft and preview are untouched, and each confirm sends its own words", async () => {
    reset();
    const mine = (await draft()).draftId;
    const p1 = await preview(mine, "My own words");
    await app.post("/desk/draft", { draft_id: mine, text: "My own words", mode: "handoff" });
    // The agent proposes under a fresh draft id.
    const theirs = crypto.randomUUID();
    const proposed = await fetch(`${app.base}/desk/handoff/preview`, { method: "POST", headers: { "content-type": "application/json", "x-horizon-source": "page-agent", "x-horizon-agent-name": "Helper" }, body: JSON.stringify({ draft_id: theirs, text: "The agent's words" }) });
    expect(proposed.status).toBe(200);
    const p2 = (await proposed.json()) as Record<string, any>;
    // Your draft is still yours, with your words.
    expect(await draft()).toMatchObject({ draftId: mine, text: "My own words" });
    // Confirm your own: your words go out, not the agent's.
    const first = await send({ draft_id: mine, text: "My own words", plan_precondition: p1.body.preview.plan_precondition });
    expect(first.status).toBe(200);
    expect(adds.map((a) => (a.item as { name: string }).name)).toEqual(["My own words"]);
    // The plan changed, so the agent's older preview is out of date; looking again gives the same proposal a fresh preview.
    const stale = await send({ draft_id: theirs, text: "The agent's words", plan_precondition: p2.preview.plan_precondition });
    expect(stale.status).toBe(409);
    const again = await fetch(`${app.base}/desk/handoff/preview`, { method: "POST", headers: { "content-type": "application/json", "x-horizon-source": "page-agent" }, body: JSON.stringify({ draft_id: theirs, text: "The agent's words" }) });
    const p3 = (await again.json()) as Record<string, any>;
    const second = await send({ draft_id: theirs, text: "The agent's words", plan_precondition: p3.preview.plan_precondition });
    expect(second.status).toBe(200);
    expect(adds.map((a) => (a.item as { name: string }).name)).toEqual(["My own words", "The agent's words"]);
    expect(new Set(adds.map((a) => a.request_id)).size).toBe(2);
  });

  test("two confirms of one draft still make one step", async () => {
    reset();
    const { draftId } = await draft();
    const p = await preview(draftId, "Fix the checkout total");
    const body = { draft_id: draftId, text: "Fix the checkout total", plan_precondition: p.body.preview.plan_precondition };
    const [a, b] = await Promise.all([send(body), send(body)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(plan).toHaveLength(1);
    expect(adds).toHaveLength(1);
  });

  test("a handed-off step is started after it is added", async () => {
    reset();
    const { draftId } = await draft();
    const p = await preview(draftId, "Fix the checkout total");
    const body = { draft_id: draftId, text: "Fix the checkout total", plan_precondition: p.body.preview.plan_precondition };
    const done = await send(body);
    expect(done.body.started).toMatchObject({ ok: true });
    expect(done.body.message).toContain("It has started.");
    expect(advances).toHaveLength(1);
    expect(advances[0]).toMatchObject({ verb: "case_advance", case_id: CASE, request_id: `advance:handoff:${draftId}` });
    // Under Work the step shows as waiting to start until it is started.
    const work = await app.get("/desk/work.json");
    expect(work.cases.items[0].waiting.map((w: any) => w.plan_item_id)).toEqual(plan);
    // Sending again replays: still one step, and the same advance request.
    await send(body);
    expect(adds).toHaveLength(1);
    expect(new Set(advances.map((a) => a.request_id))).toEqual(new Set([`advance:handoff:${draftId}`]));
  });

  test("if starting fails the step is still added, said in words, and Start it tries again with a new id", async () => {
    reset();
    advanceFails = true;
    const { draftId } = await draft();
    const p = await preview(draftId, "Fix the checkout total");
    const done = await send({ draft_id: draftId, text: "Fix the checkout total", plan_precondition: p.body.preview.plan_precondition });
    expect(done.status).toBe(200);
    expect(plan).toHaveLength(1);
    expect(done.body.started.ok).toBe(false);
    expect(done.body.message).toContain("It has not started yet:");
    expect(done.body.message).toContain("Start it");
    advanceFails = false;
    // Start it starts the steps the person was shown as waiting: the set is sent back with the start.
    const start = await app.post("/desk/start", { case_id: CASE, also_starts: [...plan] });
    expect(start.status).toBe(200);
    expect(advances.length).toBe(2);
    expect(advances[1]!.request_id).not.toBe(advances[0]!.request_id);
    expect((await app.post("/desk/start", { case_id: "nope", also_starts: [] })).status).toBe(409);
  });

  test("when agent work is not connected the desk says so and refuses to hand a step to an agent", async () => {
    reset();
    connected = false;
    const { draftId, agent } = await draft();
    expect(agent.offered).toBe(false);
    const p = await preview(draftId, "Fix it");
    expect(p.body.preview.agent.offered).toBe(false);
    expect(p.body.preview.agent.words).toContain("Not connected");
    const refused = await send({ draft_id: draftId, text: "Fix it", plan_precondition: p.body.preview.plan_precondition, assign: true });
    expect(refused.status).toBe(409);
    expect(adds).toHaveLength(0);
    // Without asking for an agent, the step is still handed off.
    expect((await send({ draft_id: draftId, text: "Fix it", plan_precondition: p.body.preview.plan_precondition })).status).toBe(200);
    expect(assignCalls).toBe(0);
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
