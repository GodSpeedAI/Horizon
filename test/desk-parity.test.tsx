/** @jsxImportSource react */
/**
 * Parity (annex stage 3): every address of the old workspace still does its job, and its content now lives in the desk.
 * One test per row of the route table. State builds up on one server, in the order the operator would reach it.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { ApprovalAuthority } from "../src/adapters/sea-forge-approvals.ts";
import { createApplication, type HorizonApplication } from "../src/app.ts";
import { START, deskReducer, type UiState } from "../src/ui/desk/attention.ts";
import { Desk } from "../src/ui/desk/Desk.tsx";
import type { DeskState, SearchResult } from "../src/ui/desk/model.ts";
import { fakeCaseKeeper, type FakeKeeper } from "./support/fake-case-keeper.ts";
import { quietIo } from "./support/desk-io.ts";
import { horizonDocument, writeConfig } from "./support/config.ts";
import { seedOperationalFixture } from "./support/operational-fixture.ts";

let application: HorizonApplication;
let server: ReturnType<HorizonApplication["startServer"]>;
let base: string;
let keeper: FakeKeeper;
let approvalDigest = "sha256:d1";
let approvalListed = true;
const decisions: Record<string, unknown>[] = [];
const FOCUS = "obj:strategy:alpha";
const OPERATOR = "actor:operator";

beforeAll(async () => {
  keeper = fakeCaseKeeper((request) => {
    if (request.verb === "authority_approvals") return { json: { ok: true, approvals: [] } };
    if (request.verb === "approval_list") return { json: { approvals: approvalListed ? [{ approval_id: "ap1", case_id: "case_1", plan_item_id: "step_a", requested_at: "2026-11-07T10:00:00Z", expires_at: "2026-11-09T10:00:00Z", expired: false, digest: { ref: "approval:ap1", expected_digest: approvalDigest } }] : [] } };
    if (request.verb === "approval_decide") {
      decisions.push(request);
      approvalListed = false;
      return { json: { ok: true } };
    }
    return { json: { ok: false, error_class: "unscripted_verb" } };
  });
  const root = mkdtempSync(join(tmpdir(), "parity-"));
  const configPath = await writeConfig(join(root, "horizon.toml"), horizonDocument({ storePath: join(root, "p.sqlite"), secretPath: join(root, "launch.secret") }));
  const approvals: ApprovalAuthority = { socketPath: keeper.socketPath, service: { actor_id: "cognate-service", role: "service" }, operator: { actor_id: OPERATOR, role: "operator" }, timeoutMs: 1_500 };
  application = await createApplication({ configPath, approvals });
  await seedOperationalFixture(application.runtime.runtime.store, undefined, application.caller.tenant);
  server = application.startServer(0);
  base = `http://${server.hostname}:${server.port}`;
});
afterAll(async () => {
  await server?.stop(true);
  await application?.close();
  keeper?.stop();
});

const post = (path: string, fields: Record<string, string>, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method: "POST", redirect: "manual", body: new URLSearchParams(fields), headers: { "content-type": "application/x-www-form-urlencoded", ...headers } });
const stateAt = async (query = ""): Promise<DeskState> => (await fetch(`${base}/desk/state.json?${query}`)).json() as Promise<DeskState>;
const io = quietIo();
const draw = (ui: UiState): string => renderToStaticMarkup(<Desk ui={ui} dispatch={() => undefined} io={io} nowMs={Date.parse("2026-11-07T12:00:00Z")} />);
const text = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const withData = (data: DeskState, over: Partial<UiState> = {}): UiState => ({ ...START, data, ...over });

describe("desk parity with the old workspace", () => {
  test("GET /workspace content is in Today", async () => {
    // The address opens the desk; the desk's Today draws what the old page showed: getting started, the case, the stack, the moves.
    const page = await fetch(`${base}/workspace`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(await page.text()).toContain('src="/desk/app.js"');
    const root = await fetch(`${base}/`, { redirect: "manual" });
    expect(root.headers.get("location")).toBe("/workspace");
    const state = await stateAt();
    const html = text(draw(withData(state)));
    expect(html).toContain("Getting started");
    expect(html).toContain("Missing: SEA-Forge governance is off and RealityTrace is not configured.");
    expect(html).toContain("bun run ignite");
    expect(html).toContain("Recent moves");
    // The old words for the state of each part are all still shown somewhere on the page.
    expect(state.home.onboarding.steps.map((s) => s.id)).toEqual(["stack", "case", "move"]);
    expect(html).not.toContain("—");
  });

  test("workspace.json read model unchanged", async () => {
    const body = (await (await fetch(`${base}/workspace.json?focus=${FOCUS}`)).json()) as Record<string, any>;
    const direct = (await application.workspace({ focusRef: FOCUS })).snapshot as unknown as Record<string, any>;
    expect(body.schema).toBe(direct.schema);
    expect(body.frame.focus_ref).toBe(direct.frame.focus_ref);
    expect(body.actions.map((a: any) => a.action_id)).toEqual(direct.actions.map((a: any) => a.action_id));
    expect(Object.keys(body).sort()).toEqual(Object.keys(direct).sort());
  });

  test("economics content is in Work cost", async () => {
    const work = (await (await fetch(`${base}/desk/work.json`)).json()) as any;
    expect(work.cost.readout.state).toBe("not_configured");
    const state = await stateAt();
    const html = text(draw(withData(state, { view: "work", work })));
    expect(html).toContain("What agent work cost");
    expect(html).toContain("Cost per accepted outcome: Not recorded");
    expect((await (await fetch(`${base}/workspace/economics`, { headers: { accept: "application/json" } })).json() as any).state).toBe("not_configured");
    expect(await (await fetch(`${base}/workspace/economics`)).text()).toContain('src="/desk/app.js"');
  });

  test("approvals content is in Decide", async () => {
    expect(await (await fetch(`${base}/workspace/approvals`)).text()).toContain('src="/desk/app.js"');
    const state = await stateAt();
    const card = state.decide.cards.find((c) => c.id === "case-task:ap1")!;
    expect(card.preview.records).toEqual([{ ref: "approval:ap1", expected_digest: "sha256:d1" }]);
    const html = text(draw(withData(state, { view: "decide" })));
    expect(html).toContain("Let this step go ahead?");
    expect(html).toContain("waiting 2 hours");
    expect(state.status.waiting).toBe(1);
  });

  test("inspect content is in the inspector", async () => {
    // The inspector's read model is still the read-only JSON route, and the desk inspector draws a selected item.
    const body = (await (await fetch(`${base}/workspace/inspect?focus=${FOCUS}&operation=why`)).json()) as Record<string, any>;
    expect(body.schema).toBe("horizon.inspection/1");
    expect(body.operations).toContain("why");
    expect((await fetch(`${base}/workspace/inspect?operation=nonsense`)).status).toBe(400);
    const state = await stateAt();
    const html = text(draw(withData(state, { selection: state.cases[0]?.case_ref ?? null })));
    expect(html).toContain("Inspector");
  });

  test("open case is in Explore", async () => {
    expect((await post("/workspace/case", { purpose: "   " })).headers.get("location")).toBe("/workspace?case_error=empty#getting-started");
    expect((await stateAt("case_error=empty")).home.caseError).toBe("empty");
    expect(text(draw(withData(await stateAt("case_error=empty"))))).toContain("The case cannot be blank.");
    expect((await post("/workspace/case", { purpose: "x".repeat(201) })).headers.get("location")).toBe("/workspace?case_error=too_long#getting-started");
    expect((await post("/workspace/case", { purpose: "  Ship the first governed move  " })).status).toBe(303);
    const state = await stateAt();
    expect(state.status.openCase?.purpose).toBe("Ship the first governed move");
    const results = (await (await fetch(`${base}/desk/search?q=governed`)).json()) as SearchResult;
    expect(results.cases.map((c) => c.purpose)).toEqual(["Ship the first governed move"]);
    const ui = deskReducer(withData(state, { view: "explore" }), { type: "results", results });
    expect(text(draw(ui))).toContain("Ship the first governed move");
  });

  test("onboarding skip and resume are in Today", async () => {
    // The panel shows while no move has been made. Skipping hides it and offers the way back; resuming brings it back.
    expect((await stateAt()).home.onboarding.visible).toBe(true);
    expect(draw(withData(await stateAt()))).toContain('action="/workspace/onboarding/skip"');
    const skipped = await post("/workspace/onboarding/skip", {});
    expect(skipped.status).toBe(303);
    const hidden = await stateAt();
    expect(hidden.home.onboarding).toMatchObject({ visible: false, skipped: true });
    const hiddenHtml = draw(withData(hidden));
    expect(hiddenHtml).not.toContain('id="getting-started"');
    expect(hiddenHtml).toContain('action="/workspace/onboarding/resume"');
    const resumed = await post("/workspace/onboarding/resume", {});
    expect(resumed.headers.get("location")).toBe("/workspace#getting-started");
    const back = await stateAt();
    expect(back.home.onboarding.visible).toBe(true);
    expect(draw(withData(back))).toContain('id="getting-started"');
  });

  test("intent goes through the composer", async () => {
    // The first move is offered by the desk's first-run steps and posts to the same route as before.
    const first = ((await (await fetch(`${base}/desk/first-move.json`)).json()) as { firstMove: Record<string, string> & { action_id: string; operation: string; frame_id: string; frame_revision: string; focus: string } | null }).firstMove;
    expect(first).not.toBeNull();
    const state = await stateAt();
    const withCase = { ...state, home: { ...state.home, onboarding: { ...state.home.onboarding, steps: state.home.onboarding.steps.map((s) => (s.id === "move" ? { ...s, done: false } : { ...s, done: true })) } } };
    const html = draw(withData(withCase, { firstMove: first as never }));
    expect(html).toContain('action="/workspace/intent"');
    const response = await post("/workspace/intent", { action_id: first!.action_id, operation: first!.operation, frame_id: first!.frame_id, frame_revision: first!.frame_revision, focus: first!.focus }, { origin: `http://127.0.0.1:${server.port}`, "sec-fetch-site": "same-origin" });
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location") ?? "", base);
    const intentId = location.searchParams.get("receipt") ?? "";
    expect(intentId).not.toBe("");
    const receipt = await stateAt(`receipt=${intentId}`);
    expect(receipt.home.receipt?.found).toBe(true);
    const receiptHtml = text(draw(withData(receipt)));
    expect(receiptHtml).toContain("Decision receipt");
    expect(receiptHtml).toContain("Horizon policy only: SEA-Forge is off.");
    expect(receiptHtml).toContain("Unavailable: RealityTrace is off.");
    // An unknown receipt says so and never echoes the query text.
    const unknown = text(draw(withData(await stateAt(`receipt=${encodeURIComponent("<script>alert(1)</script>")}`))));
    expect(unknown).toContain("No such commit.");
    expect(unknown).not.toContain("<script>alert(1)</script>");
    // The move is listed under Recent moves.
    expect((await stateAt()).home.moves.some((m) => m.intent_id === intentId)).toBe(true);
  });

  test("approval confirm works from the card", async () => {
    const card = (await stateAt()).decide.cards.find((c) => c.id === "case-task:ap1")!;
    const sent = await app_post("/desk/decide", { card_id: card.id, choice: "accept", preview_code: card.preview.code, records: card.preview.records });
    expect(sent.status).toBe(200);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ verb: "approval_decide", decision: "approve", case_id: "case_1", approval_id: "ap1", preconditions: { records: [{ ref: "approval:ap1", expected_digest: "sha256:d1" }] } });
    // The old form posts nowhere: an approval is answered from the card, after its preview.
    expect((await post("/workspace/approval", { approval_id: "approval:none", decision: "approve" })).status).toBe(404);
    expect((await stateAt()).decide.cards.find((c) => c.id === "case-task:ap1")).toBeUndefined();
  });

  test("settle needs preview and typed reason", async () => {
    // Final sign-off is only a card, and the old one-click route is gone, so it cannot be done without a preview and a reason.
    expect((await post("/workspace/settle", { intent_id: "x", phase: "rule" })).status).toBe(404);
    const refused = await app_post("/desk/decide", { card_id: "settle:intent-x:rule", choice: "accept", preview_code: "none" });
    expect(refused.status).toBe(404);
    const { buildDecide } = await import("../src/ui/desk/decide-build.ts");
    const move = { intent_id: "i1", operation_ref: "horizon.health", at: "2026-11-07T09:00:00Z", decided: { state: "a", text: "Allowed" }, recorded: { state: "r", text: "Recorded" }, observed: { state: "o", text: "Observed" }, settlement: { state: "s", text: "Observed." }, approval_id: null, approval_identity: null, observable: false, settleable: true };
    const [card] = buildDecide({ inbox: { state: "not_configured" }, moves: [move as never], caseApprovals: { kind: "none" }, holds: new Map() }).cards;
    expect(card!.reason_for_accept).toBe(true);
    expect(card!.preview.accept?.kind).toBe("cannot be undone");
  });

  test("remote panel is under settings", async () => {
    const html = draw(withData(await stateAt()));
    const settings = /<details class="settings">([\s\S]*?)<\/details>/.exec(html)?.[1] ?? "";
    expect(settings).toContain("Phone remote");
    const info = (await (await fetch(`${base}/desk/remote.json`)).json()) as any;
    expect(info.status.state).toBe("off");
    expect(info.link).toBeNull();
    expect(((await (await fetch(`${base}/workspace/remote/status`)).json()) as any).state).toBe("off");
  });
});

async function app_post(path: string, body: unknown): Promise<Response> {
  return fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
