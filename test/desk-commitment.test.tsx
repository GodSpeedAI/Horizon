/** @jsxImportSource react */
/** Every card with a button that commits something shows the exact action, the destination, what happens next and whether it can be undone, above a button named for the action. */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { START, deskReducer, type Action, type UiState } from "../src/ui/desk/attention.ts";
import { hasBannedWords } from "../src/ui/desk/banned-words.ts";
import { HandoffPreviewCard, handoffButtonLabel, type HandoffPreview } from "../src/ui/desk/Composer.tsx";
import { buildDecide } from "../src/ui/desk/decide-build.ts";
import { Desk } from "../src/ui/desk/Desk.tsx";
import type { ConversationRow } from "../src/ui/desk/conversation-model.ts";
import type { DecisionCardData } from "../src/ui/desk/model.ts";
import { deskState } from "./support/desk-fixture.ts";
import { quietIo } from "./support/desk-io.ts";

const text = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const run = (ui: UiState, ...actions: Action[]): UiState => actions.reduce(deskReducer, ui);
const NOW = Date.parse("2026-11-07T12:00:00Z");

const FACTS = ["Action:", "Destination:", "What happens next:", "Can be undone:"];
function expectFourFacts(html: string): void {
  expect((html.match(/data-commitment/g) ?? []).length).toBeGreaterThanOrEqual(1);
  for (const fact of ["action", "destination", "next", "undo"]) expect(html).toContain(`data-fact="${fact}"`);
  const words = text(html);
  for (const label of FACTS) expect(words).toContain(label);
  expect(words).toMatch(/Can be undone: (yes|no)\./);
}
/** The text of every button that commits something (marked data-confirm*) must name its action. */
function commitButtons(html: string): string[] {
  return [...html.matchAll(/<button[^>]*data-confirm[^>]*>([\s\S]*?)<\/button>/g)].map((m) => text(m[1]!).trim());
}
function expectNamedButtons(html: string): void {
  const labels = commitButtons(html);
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) {
    expect(label).not.toBe("Confirm");
    expect(label).not.toMatch(/^Confirm\b/);
    expect(label.length).toBeGreaterThan(8);
  }
}

const pv: HandoffPreview = { draft_id: "d", case_id: "c1", case_title: "Seed: triage inbox", step_name: "Sort the inbox", step_id: "s", check: "The case keeper checked this step against the case and it fits.", plan_precondition: { ref: "plan:c1", expected_digest: "sha256:1" }, agent: { offered: true, words: "An agent can take this step." } };
const preview = (over: Partial<Parameters<typeof HandoffPreviewCard>[0]> = {}) => renderToStaticMarkup(<HandoffPreviewCard pv={pv} assign={false} outOfDate={false} busy={false} onCancel={() => undefined} onConfirm={() => undefined} onRefresh={() => undefined} {...over} />);

describe("the hand off preview", () => {
  test("sending to an agent names the action, the case, what happens next and that it cannot be undone", () => {
    const html = preview({ assign: true });
    expectFourFacts(html);
    const words = text(html);
    expect(words).toContain("Action: Send step to agent: Sort the inbox");
    expect(words).toContain("Destination: Seed: triage inbox");
    expect(words).toContain("Can be undone: no.");
    expect(commitButtons(html)).toEqual(["Send step to agent"]);
    expectNamedButtons(html);
  });
  test("without an agent, and as a review, it still says all four facts", () => {
    const plain = preview();
    expectFourFacts(plain);
    expect(commitButtons(plain)).toEqual(["Add step to the case"]);
    const review = preview({ pv: { ...pv, review: { reviewable: [{ step_id: "s0", name: "Draft" }] } } });
    expectFourFacts(review);
    expect(text(review)).toContain("Action: Run a review: Sort the inbox");
    expectNamedButtons(review);
    expect(handoffButtonLabel(pv, true)).not.toBe("Confirm");
  });
  test("out of date keeps the action in the button", () => {
    const html = preview({ outOfDate: true });
    expectFourFacts(html);
    expect(commitButtons(html)[0]).toContain("preview out of date");
    expect(commitButtons(html)[0]).not.toMatch(/^Confirm/);
  });
});

describe("a suggested hand off in the conversation", () => {
  const row = (over: Partial<ConversationRow> = {}): ConversationRow => ({ row_id: "r1", at: "2026-11-07T10:00:00Z", source: "page-agent", kind: "handoff-proposal", words: "Sort the inbox", outcome: "An agent suggests this.", status: "waiting", refs: { draft_id: "d1", case_id: "c1" }, ...over });
  const draw = (rows: ConversationRow[]) => renderToStaticMarkup(<Desk ui={{ ...START, view: "conversation", rows, data: deskState({ cases: [{ case_ref: "case:c1", purpose: "Seed: triage inbox", opened_at: "2026-11-07T06:00:00Z", source: "case keeper", state: "Running" }] }) }} dispatch={() => undefined} io={quietIo()} nowMs={NOW} />);
  test("the card shows the four facts above a button that names its action", () => {
    const html = draw([row()]);
    expectFourFacts(html);
    expect(text(html)).toContain("Action: Hand off: Sort the inbox");
    expect(text(html)).toContain("Destination: Seed: triage inbox");
    expectNamedButtons(html);
    expect(html.indexOf("data-commitment")).toBeLessThan(html.indexOf("data-confirm-move"));
  });
  test("your own waiting preview shows them too", () => {
    const html = draw([row({ source: "you", kind: "handoff" })]);
    expectFourFacts(html);
  });
});

describe("Decide", () => {
  const rowFor = (id: string) => ({ approval_id: id, case_id: "case_1", plan_item_id: "step_a", requested_at: "2026-11-07T10:00:00Z", expires_at: "2026-11-09T10:00:00Z", expired: false, digest: { ref: `approval:${id}`, expected_digest: "sha256:one" } });
  const cards = buildDecide({ inbox: { state: "not_configured" }, moves: [], caseApprovals: { kind: "listed", approvals: [rowFor("ap1")], unreadable: null }, holds: new Map() }).cards as DecisionCardData[];
  const open = (choice: "accept" | "reject" | "hold") => renderToStaticMarkup(<Desk ui={run({ ...START, view: "decide", data: deskState({ decide: { notices: [], cards } }) }, { type: "preview-open", cardId: cards[0]!.id, choice })} dispatch={() => undefined} io={quietIo()} nowMs={NOW} />);
  test("accept, reject and hold each show all four facts and a button named for the action", () => {
    for (const choice of ["accept", "reject", "hold"] as const) {
      const html = open(choice);
      expectFourFacts(html);
      expectNamedButtons(html);
      expect(html.indexOf("data-commitment")).toBeLessThan(html.indexOf("data-confirm"));
    }
  });
  test("accepting a task step says the action in plain words and whether it can be undone", () => {
    const words = text(open("accept"));
    expect(words).toMatch(/Action: Accept: /);
    expect(words).toMatch(/Can be undone: (yes|no)\. \S/);
  });
});

describe("plain words", () => {
  test("the labels and sentences pass the word scan", () => {
    for (const html of [preview({ assign: true }), preview()]) expect(hasBannedWords(text(html).replace(/Seed: triage inbox|Sort the inbox/g, ""))).toBe(false);
  });
});
