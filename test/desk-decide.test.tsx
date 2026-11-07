/** @jsxImportSource react */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ApprovalAuthority } from "../src/adapters/sea-forge-approvals.ts";
import { START, deskReducer, type Action, type UiState } from "../src/ui/desk/attention.ts";
import { buildDecide } from "../src/ui/desk/decide-build.ts";
import { Desk } from "../src/ui/desk/Desk.tsx";
import { resolveKey } from "../src/ui/desk/keys.ts";
import { type DecisionCardData } from "../src/ui/desk/model.ts";
import { confirmOffReason } from "../src/ui/desk/Preview.tsx";
import { fakeCaseKeeper, type FakeKeeper } from "./support/fake-case-keeper.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { deskState } from "./support/desk-fixture.ts";
import { quietIo } from "./support/desk-io.ts";

const run = (ui: UiState, ...actions: Action[]): UiState => actions.reduce(deskReducer, ui);
const NOW = Date.parse("2026-11-07T12:00:00Z");
const draw = (ui: UiState): string => renderToStaticMarkup(<Desk ui={ui} dispatch={() => undefined} io={quietIo()} nowMs={NOW} />);
const text = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const taskRow = (id: string, digest: string, over: Record<string, unknown> = {}) => ({
  approval_id: id,
  case_id: "case_1",
  plan_item_id: "step_a",
  requested_at: "2026-11-07T10:00:00Z",
  expires_at: "2026-11-09T10:00:00Z",
  expired: false,
  digest: { ref: `approval:${id}`, expected_digest: digest },
  ...over,
});
const cardsFrom = (rows: ReturnType<typeof taskRow>[]): DecisionCardData[] =>
  buildDecide({
    inbox: { state: "not_configured" },
    moves: [],
    caseApprovals: { kind: "listed", approvals: rows.map((r) => ({ ...r, digest: r.digest as { ref: string; expected_digest: string } })), unreadable: null },
    holds: new Map(),
  }).cards as DecisionCardData[];

const withCards = (cards: readonly DecisionCardData[]): UiState => ({ ...START, view: "decide", data: deskState({ decide: { notices: [], cards } }) });

describe("decision cards and previews", () => {
  test("confirm turns off when its preview changes and says preview out of date", () => {
    const [card] = cardsFrom([taskRow("ap1", "sha256:one")]);
    let ui = run(withCards([card!]), { type: "preview-open", cardId: card!.id, choice: "accept" });
    expect(ui.decision?.code).toBe(card!.preview.code);
    let html = draw(ui);
    expect(html).toMatch(/<button[^>]*data-confirm[^>]*>/);
    expect(html).not.toMatch(/<button[^>]*\sdisabled=""[^>]*data-confirm/);
    expect(text(html)).toContain("Confirm applies to exactly the preview above");

    // The case changes while the operator is looking: the card's preview code moves on.
    const [changed] = cardsFrom([taskRow("ap1", "sha256:two")]);
    expect(changed!.preview.code).not.toBe(card!.preview.code);
    ui = deskReducer(ui, { type: "poll", state: deskState({ decide: { notices: [], cards: [changed!] } }) });
    html = draw(ui);
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*data-confirm|<button[^>]*data-confirm[^>]*\sdisabled=""/);
    expect(text(html)).toContain("Preview out of date");
    expect(html).toContain('data-out-of-date');
    expect(confirmOffReason(changed!, ui.decision!)).toContain("Preview out of date");

    // Refreshing the preview takes the new code and turns Confirm back on.
    ui = deskReducer(ui, { type: "preview-open", cardId: changed!.id, choice: "accept" });
    expect(confirmOffReason(changed!, ui.decision!)).toBeNull();
  });

  test("a hold needs a typed reason, and says why Confirm is off until it has one", () => {
    const [card] = cardsFrom([taskRow("ap1", "sha256:one")]);
    let ui = run(withCards([card!]), { type: "preview-open", cardId: card!.id, choice: "hold" });
    expect(confirmOffReason(card!, ui.decision!)).toContain("why you are holding");
    expect(text(draw(ui))).toContain("Type why you are holding this");
    ui = deskReducer(ui, { type: "reason", text: "waiting for the missing test" });
    expect(confirmOffReason(card!, ui.decision!)).toBeNull();
  });

  test("final sign-off needs a preview and a typed reason", () => {
    const move = {
      intent_id: "intent-1", operation_ref: "horizon.health", at: "2026-11-07T09:00:00Z",
      decided: { state: "allowed", text: "Allowed" }, recorded: { state: "recorded", text: "Recorded" }, observed: { state: "observed", text: "Observed" },
      settlement: { state: "open", text: "Observed; the case keeper has not ruled." }, approval_id: null, approval_identity: null, observable: false, settleable: true,
    };
    const [card] = buildDecide({ inbox: { state: "not_configured" }, moves: [move as never], caseApprovals: { kind: "none" }, holds: new Map() }).cards;
    expect(card!.kind).toBe("acceptance");
    expect(card!.preview.accept?.kind).toBe("cannot be undone");
    expect(card!.reason_for_accept).toBe(true);
    // No preview open: the card itself offers only the way into a preview.
    const ui = withCards([card!]);
    expect(draw(ui)).not.toContain("data-confirm");
    const open = run(ui, { type: "preview-open", cardId: card!.id, choice: "accept" });
    expect(confirmOffReason(card!, open.decision!)).toContain("reason");
    expect(text(draw(open))).toContain("Cannot be undone");
    const typed = deskReducer(open, { type: "reason", text: "checked the evidence myself" });
    expect(confirmOffReason(card!, typed.decision!)).toBeNull();
  });

  test("A, R and H only open a preview; no key completes a decision", () => {
    const key = (k: string) => resolveKey({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, targetTag: "body", editable: false }, { decisionCard: true });
    expect(key("a")).toEqual({ type: "preview", choice: "accept" });
    expect(key("r")).toEqual({ type: "preview", choice: "reject" });
    expect(key("h")).toEqual({ type: "preview", choice: "hold" });
    expect(resolveKey({ key: "a", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, targetTag: "textarea", editable: false }, { decisionCard: true })).toBeNull();
    expect(resolveKey({ key: "a", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, targetTag: "body", editable: false }, { decisionCard: false })).toBeNull();
    const [card] = cardsFrom([taskRow("ap1", "sha256:one")]);
    const ui = run(withCards([card!]), { type: "preview-open", cardId: card!.id, choice: "accept" });
    // Opening a preview decided nothing: the card is still waiting, and Escape closes the preview first.
    expect(ui.data!.decide.cards).toHaveLength(1);
    expect(deskReducer(ui, { type: "escape" }).decision).toBeNull();
  });

  test("a card shows its age, and a held card shows its reason and a way back", () => {
    const [card] = cardsFrom([taskRow("ap1", "sha256:one")]);
    expect(text(draw(withCards([card!])))).toContain("waiting 2 hours");
    const held = { ...card!, held: { reason: "waiting for the missing test", at: "2026-11-07T11:00:00Z" } };
    const html = text(draw(withCards([held])));
    expect(html).toContain("ON HOLD");
    expect(html).toContain("Held: waiting for the missing test");
    expect(html).toContain("Release the hold");
  });

  test("cards that cannot be decided say why, and Hold stays possible", () => {
    const [card] = cardsFrom([taskRow("ap1", "", { digest: undefined })]);
    expect(card!.blocked).toContain("version code");
    expect(card!.preview.accept).toBeNull();
    const html = draw(withCards([card!]));
    // A choice that is not available is not drawn at all; one line says why instead.
    expect(html).not.toMatch(/data-choice="accept"/);
    expect(html).not.toMatch(/data-choice="reject"/);
    expect(text(html)).toContain("version code");
    expect(html).toMatch(/data-choice="hold"/);
    expect(html).not.toMatch(/data-choice="hold"[^>]*\sdisabled=""/);
  });
});

describe("a human step", () => {
  const stepCard = (): DecisionCardData =>
    buildDecide({
      inbox: { state: "not_configured" },
      moves: [],
      caseApprovals: { kind: "listed", approvals: [], unreadable: null },
      holds: new Map(),
      humanSteps: [{ case_id: "case_1", case_title: "Case started 2026-11-07", plan_item_id: "s1", name: "operator sign-off", last_event_at: null, digest: { ref: "case:case_1", expected_digest: "sha256:o" } }],
    }).cards[0] as DecisionCardData;

  test("a human step offers mark done and hold only", () => {
    const card = stepCard();
    expect(card.kind).toBe("human_step");
    const html = draw(withCards([card]));
    const choices = [...html.matchAll(/data-choice="([a-z]+)"/g)].map((m) => m[1]);
    expect(choices.sort()).toEqual(["accept", "hold"]);
    const labels = [...html.matchAll(/<button[^>]*data-choice="[a-z]+"[^>]*>([^<]*)</g)].map((m) => m[1]!.trim());
    expect(labels.sort()).toEqual(["Hold… (H)", "Mark done… (A)"]);
    const words = text(html);
    expect(words).not.toContain("Reject");
    expect(words).not.toContain("Rejecting is not available");
    expect(words).not.toContain("Accept");
    expect(words).toContain("Only a person can do this step");
  });

  test("a key press cannot open a choice the card does not offer", () => {
    const card = stepCard();
    const ui = deskReducer(withCards([card]), { type: "preview-open", cardId: card.id, choice: "reject" });
    expect(ui.decision).toBeNull();
    expect(ui.decideNote?.ok).toBe(false);
    expect(deskReducer(withCards([card]), { type: "preview-open", cardId: card.id, choice: "accept" }).decision?.choice).toBe("accept");
  });
});

describe("decisions through the application and a fake case keeper", () => {
  let keeper: FakeKeeper;
  let app: DeskApp;
  let currentDigest = "sha256:d1";
  let listed = true;
  const decided: Record<string, unknown>[] = [];
  const authority = (socketPath: string): ApprovalAuthority => ({ socketPath, service: { actor_id: "cognate-service", role: "service" }, operator: { actor_id: "actor:operator", role: "operator" }, timeoutMs: 1_500 });

  beforeAll(async () => {
    keeper = fakeCaseKeeper((request) => {
      switch (request.verb) {
        case "authority_approvals":
          return { json: { ok: true, approvals: [] } };
        case "approval_list":
          return { json: { approvals: listed ? [taskRow("ap1", currentDigest)] : [] } };
        case "approval_decide": {
          const records = (request.preconditions as { records: { ref: string; expected_digest: string }[] }).records;
          const stale = records.filter((r) => r.ref === "approval:ap1" && r.expected_digest !== currentDigest);
          if (stale.length > 0) return { json: { outcome: "rejected_as_stale", code: "precondition_failed", changed_records: stale.map((r) => ({ ref: r.ref, expected_digest: r.expected_digest, current_digest: currentDigest })), next_actions: ["refetch"] } };
          decided.push(request);
          listed = false;
          return { json: { ok: true, approval_id: request.approval_id } };
        }
        default:
          return { json: { ok: false, error_class: "unscripted_verb" } };
      }
    });
    app = await startDeskApp({ approvals: authority(keeper.socketPath) });
  });
  afterAll(async () => {
    await app.stop();
    keeper.stop();
  });

  const send = async (body: Record<string, unknown>) => {
    const response = await app.post("/desk/decide", body);
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  };

  test("the card comes from the case keeper with the version it pins, and the status bar counts it", async () => {
    const state = await app.state();
    const card = state.decide.cards.find((c: any) => c.id === "case-task:ap1");
    expect(card.kind).toBe("case_task");
    expect(card.preview.records).toEqual([{ ref: "approval:ap1", expected_digest: "sha256:d1" }]);
    expect(card.requested_at).toBe("2026-11-07T10:00:00Z");
    expect(state.status.waiting).toBe(1);
  });

  test("stale decision is refused by the case keeper, not only on screen", async () => {
    const card = (await app.state()).decide.cards[0];
    // The operator looked at version d1. The case keeper's record then moved on to d2.
    currentDigest = "sha256:d2";
    const before = keeper.received.filter((r) => r.verb === "approval_decide").length;
    const refused = await send({ card_id: card.id, choice: "accept", preview_code: card.preview.code, records: card.preview.records });
    expect(refused.status).toBe(409);
    expect(refused.body.outcome).toBe("stale");
    expect(refused.body.message).toContain("The case keeper refused this");
    expect(refused.body.message).toContain("changed after you looked");
    // The refusal came from the case keeper: the request that reached it carried the operator's old version.
    const sent = keeper.received.filter((r) => r.verb === "approval_decide");
    expect(sent.length).toBe(before + 1);
    expect(sent.at(-1)).toMatchObject({ approval_id: "ap1", decision: "approve", preconditions: { records: [{ ref: "approval:ap1", expected_digest: "sha256:d1" }] } });
    expect(decided).toHaveLength(0);
    expect((await app.state()).decide.cards).toHaveLength(1);
  });

  test("approval confirm works from the card: the version the operator looked at is pinned and the decision is written once", async () => {
    currentDigest = "sha256:d2";
    const card = (await app.state()).decide.cards[0];
    expect(card.preview.records[0].expected_digest).toBe("sha256:d2");
    const ok = await send({ card_id: card.id, choice: "accept", preview_code: card.preview.code, records: card.preview.records, reason: "looks right" });
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);
    expect(decided).toHaveLength(1);
    expect(decided[0]).toMatchObject({ verb: "approval_decide", case_id: "case_1", decision: "approve", note: "looks right", request_id: "horizon:decide:ap1:accept", on_behalf_of: { actor_id: "actor:operator" } });
    // It is no longer waiting, so a second press does nothing and says so.
    const again = await send({ card_id: card.id, choice: "accept", preview_code: card.preview.code, records: card.preview.records });
    expect(again.status).toBe(404);
    expect(again.body.message).toContain("no longer waiting");
    expect(decided).toHaveLength(1);
  });

  test("a decision with no card, no choice or unreadable text is refused in words and does nothing", async () => {
    expect((await send({ choice: "accept" })).status).toBe(400);
    expect((await send({ card_id: "case-task:ap1", choice: "maybe" })).status).toBe(400);
    expect((await app.post("/desk/decide", "{not json")).status).toBe(400);
    expect((await send({ card_id: "case-task:nope", choice: "accept", preview_code: "x" })).status).toBe(404);
  });

  test("hold keeps a reason, moves the card out of Needs you, and release brings it back", async () => {
    listed = true;
    currentDigest = "sha256:d3";
    const card = (await app.state()).decide.cards[0];
    const noReason = await send({ card_id: card.id, choice: "hold", preview_code: card.preview.code, records: card.preview.records, reason: "  " });
    expect(noReason.status).toBe(400);
    const held = await send({ card_id: card.id, choice: "hold", preview_code: card.preview.code, records: card.preview.records, reason: "write the missing test first" });
    expect(held.status).toBe(200);
    let state = await app.state();
    expect(state.decide.cards[0].held.reason).toBe("write the missing test first");
    expect(state.status.waiting).toBe(0);
    const decideCalls = keeper.received.filter((r) => r.verb === "approval_decide").length;
    expect((await send({ card_id: card.id, choice: "accept", preview_code: card.preview.code, records: card.preview.records })).status).toBe(409);
    expect(keeper.received.filter((r) => r.verb === "approval_decide").length).toBe(decideCalls);
    expect((await send({ card_id: card.id, choice: "release", preview_code: "", records: [] })).status).toBe(200);
    state = await app.state();
    expect(state.decide.cards[0].held).toBeNull();
    expect(state.status.waiting).toBe(1);
  });

  test("an old preview code is refused before anything is sent when the case keeper's version did not change", async () => {
    const card = (await app.state()).decide.cards[0];
    const before = keeper.received.filter((r) => r.verb === "approval_decide").length;
    const result = await send({ card_id: card.id, choice: "accept", preview_code: "not-the-code", records: card.preview.records });
    expect(result.status).toBe(409);
    expect(result.body.outcome).toBe("preview_out_of_date");
    expect(result.body.message).toContain("Preview out of date");
    expect(keeper.received.filter((r) => r.verb === "approval_decide").length).toBe(before);
  });
});
