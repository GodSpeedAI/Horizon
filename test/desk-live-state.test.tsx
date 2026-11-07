/** @jsxImportSource react */
/**
 * The desk against a case keeper that holds a real-looking case: the cases agree everywhere, a human step waiting for a person is a
 * decision that needs you, and marking it done is checked by Horizon because the case keeper's verb takes no preconditions.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ApprovalAuthority } from "../src/adapters/sea-forge-config.ts";
import { latestDay } from "../src/adapters/ledger-day.ts";
import { START, deskReducer, type UiState } from "../src/ui/desk/attention.ts";
import { Desk } from "../src/ui/desk/Desk.tsx";
import { caseTitle } from "../src/ui/desk/model.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { quietIo } from "./support/desk-io.ts";
import { fakeCaseKeeper, type FakeKeeper } from "./support/fake-case-keeper.ts";

const CASE = "case_20261107T061312Z_820737";
let keeper: FakeKeeper;
let app: DeskApp;
let overviewDigest = "sha256:o1";
let stepActive = true;
const completed: Record<string, unknown>[] = [];

const draw = (ui: UiState): string => renderToStaticMarkup(<Desk ui={ui} dispatch={() => undefined} io={quietIo()} nowMs={Date.parse("2026-11-07T12:00:00Z")} />);
const text = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

beforeAll(async () => {
  keeper = fakeCaseKeeper((r) => {
    switch (r.verb) {
      case "authority_approvals":
        return { json: { ok: true, approvals: [] } };
      case "approval_list":
        return { json: { approvals: [] } };
      case "case_list":
        return { json: { cases: [{ case_id: CASE, case_state: "active", summary: "Execute plan drafts/draft_eaa7a3.json", created_at: "2026-11-07T06:13:12.793Z" }], unreadable: [] } };
      case "case_get_horizon":
        return { json: { case_id: CASE, case_state: "active", events_folded: 3, items: [
          { plan_item_id: "task_draft", name: "draft change note", item_kind: "sandboxed_task", execution: "completed", settlement: "accepted" },
          { plan_item_id: "signoff_release", name: "operator sign-off", item_kind: "human_task", execution: stepActive ? "active" : "completed", settlement: stepActive ? "unsettled" : "accepted", last_event_at: "2026-11-07T10:00:00Z" },
        ] } };
      case "case_get_overview":
        return { json: { case_id: CASE, case_state: "active", summary: "x", created_at: "t", item_count: 2, stages: [], run_ids: [], settlements: [], digest: { ref: `case:${CASE}`, expected_digest: overviewDigest } } };
      case "human_task_complete":
        completed.push(r);
        stepActive = false;
        return { json: { ok: true } };
      default:
        return { json: { ok: false, error_class: "unscripted_verb" } };
    }
  });
  const approvals: ApprovalAuthority = { socketPath: keeper.socketPath, service: { actor_id: "cognate-service", role: "service" }, operator: { actor_id: "actor:operator", role: "operator" }, timeoutMs: 1_500 };
  app = await startDeskApp({ approvals });
});
afterAll(async () => {
  await app.stop();
  keeper.stop();
});

const send = async (body: Record<string, unknown>) => {
  const response = await app.post("/desk/decide", body);
  return { status: response.status, body: (await response.json()) as Record<string, any> };
};

describe("cases come from the case keeper", () => {
  test("the status bar, the left list, Explore and Work agree on the case, with a title that is not a path", async () => {
    const state = await app.state();
    expect(state.status.openCase.purpose).toBe(`Case started 2026-11-07`);
    expect(state.cases.map((c: any) => c.purpose)).toEqual(["Case started 2026-11-07"]);
    const results = await app.get("/desk/search?q=");
    expect(results.cases.map((c: any) => c.purpose)).toEqual(["Case started 2026-11-07"]);
    const work = await app.get("/desk/work.json");
    expect(work.cases.items).toHaveLength(1);
    expect(JSON.stringify(state)).not.toContain("drafts/draft_eaa7a3.json");
    expect(JSON.stringify(work.items)).not.toContain("drafts/draft_eaa7a3.json");
    // One state word, not two: Work says Running once.
    const { Work } = await import("../src/ui/desk/views/Work.tsx");
    const html = renderToStaticMarkup(<Work ui={{ ...START, view: "work", data: state, work } as UiState} data={state} dispatch={() => undefined} onLink={() => undefined} saveLabel={async () => ({ ok: true })} />);
    expect(text(html)).toContain("Case started 2026-11-07 Running");
    expect(text(html)).not.toContain("waiting Running");
  });

  test("a case title is never a file path", () => {
    expect(caseTitle("Execute plan drafts/draft_eaa7a3.json", "2026-11-07T06:13:12Z")).toBe("Case started 2026-11-07");
    expect(caseTitle("C:\\work\\plan.yaml", "2026-11-07T06:13:12Z")).toBe("Case started 2026-11-07");
    expect(caseTitle("Ship the checkout fix", "2026-11-07T06:13:12Z")).toBe("Ship the checkout fix");
  });

  test("an empty day says where the last recorded session is", () => {
    const row = (ts: string) => ({ record_kind: "observation.recorded", payload: { extensions: { agent_event: { ts } } } });
    expect(latestDay([row("2026-10-30T10:00:00Z"), row("2026-11-02T10:00:00Z"), { record_kind: "question.declared" }], "UTC")).toBe("2026-11-02");
    expect(latestDay([], "UTC")).toBeNull();
  });
});

describe("a human step waiting for a person", () => {
  test("an active human step is a decision that needs you", async () => {
    stepActive = true;
    const state = await app.state();
    const card = state.decide.cards.find((c: any) => c.id === `human:${CASE}:signoff_release`);
    expect(card.kind).toBe("human_step");
    expect(card.title).toBe("operator sign-off: Case started 2026-11-07");
    expect(card.preview.accept.button).toBe("Mark done");
    expect(card.preview.records).toEqual([{ ref: `case:${CASE}`, expected_digest: "sha256:o1" }]);
    expect(card.reason_for_accept).toBe(true);
    expect(state.status.waiting).toBe(1);
    // The step that finished is not a card.
    expect(state.decide.cards.some((c: any) => c.id.endsWith("task_draft"))).toBe(false);
    const html = text(draw({ ...START, view: "decide", data: state }));
    expect(html).toContain("operator sign-off");
    expect(html).toContain("Needs you: 1");
  });

  test("a human step whose case changed shows preview out of date", async () => {
    stepActive = true;
    overviewDigest = "sha256:o1";
    const card = (await app.state()).decide.cards.find((c: any) => c.id.startsWith("human:"));
    overviewDigest = "sha256:o2"; // the case moved on while the operator looked
    const before = keeper.received.filter((r) => r.verb === "human_task_complete").length;
    const refused = await send({ card_id: card.id, choice: "accept", preview_code: card.preview.code, records: card.preview.records, reason: "I did it" });
    expect(refused.status).toBe(409);
    expect(refused.body.outcome).toBe("preview_out_of_date");
    expect(refused.body.message).toContain("Preview out of date");
    expect(keeper.received.filter((r) => r.verb === "human_task_complete").length).toBe(before);
    expect(completed).toHaveLength(0);
  });

  test("mark done sends one human_task_complete with the typed reason", async () => {
    stepActive = true;
    overviewDigest = "sha256:o3";
    const card = (await app.state()).decide.cards.find((c: any) => c.id.startsWith("human:"));
    const noReason = await send({ card_id: card.id, choice: "accept", preview_code: card.preview.code, records: card.preview.records, reason: " " });
    expect(noReason.status).toBe(400);
    expect(completed).toHaveLength(0);
    const ok = await send({ card_id: card.id, choice: "accept", preview_code: card.preview.code, records: card.preview.records, reason: "Reviewed the draft and released it" });
    expect(ok.status).toBe(200);
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ verb: "human_task_complete", case_id: CASE, item_id: "signoff_release", justification: "Reviewed the draft and released it", request_id: `horizon:human:${CASE}:signoff_release` });
    // It is done, so it is no longer waiting and a second press does nothing.
    expect((await app.state()).decide.cards).toEqual([]);
    expect((await send({ card_id: card.id, choice: "accept", preview_code: card.preview.code, records: card.preview.records, reason: "again" })).status).toBe(404);
    expect(completed).toHaveLength(1);
  });
});

describe("the keyboard, the Inspector and the Work pickers", () => {
  test("switching a view puts focus on the view's heading, and the heading can take it", () => {
    const ui = deskReducer({ ...START, focus: "composer" }, { type: "view", view: "decide" });
    expect(ui.focus).toBe("heading");
    for (const view of ["today", "explore", "decide", "work"] as const) {
      const html = renderToStaticMarkup(<Desk ui={{ ...START, view, data: null }} dispatch={() => undefined} io={quietIo()} />);
      // while loading, and when drawn, every view's h1 is focusable
      expect(html).toMatch(/<h1[^>]*tabindex="-1"/);
    }
  });

  test("the reference-library box is switched off with its reason while the library is not connected", async () => {
    const state = await app.state();
    const html = draw({ ...START, data: state });
    expect(html).toMatch(/<input[^>]*name="query"[^>]*\sdisabled=""|<input[^>]*\sdisabled=""[^>]*name="query"/);
    expect(text(html)).toContain("The reference library is Not connected, so nothing can be looked up.");
  });

  test("test repositories are hidden behind a switch and folders show as names; an empty day says where the last session is", async () => {
    const { Work } = await import("../src/ui/desk/views/Work.tsx");
    const state = await app.state();
    const compare = { presenting: false, selection: { source: "personal", repo: "R1", day: "2026-11-07", session: null, only: null }, sources: ["personal"], repos: [{ repo_id: "R1", path: "/work/alpha" }, { repo_id: "T1", path: "/tmp/cognate-sxr-abc", temporary: true }], lastDay: "2026-11-02", sessions: [], view: null, label: null, notice: "No sessions are recorded on this day. Last recorded session: 2026-11-02.", labelError: null };
    const work = { compare, items: [], cases: { connected: false, words: "x", items: [], unreadable: 0 }, cost: { readout: { state: "not_configured" }, knowledge: { kind: "unknown", why: "x" } } };
    const html = renderToStaticMarkup(<Work ui={{ ...START, view: "work", data: state, work } as unknown as UiState} data={state} dispatch={() => undefined} onLink={() => undefined} saveLabel={async () => ({ ok: true })} />);
    expect(html).toContain(">alpha</option>");
    expect(html).not.toContain("cognate-sxr-abc");
    expect(html).not.toContain("/work/alpha");
    expect(text(html)).toContain("Show test repositories (1)");
    expect(text(html)).toContain("Last recorded session: 2026-11-02. Go to 2026-11-02");
  });
});
