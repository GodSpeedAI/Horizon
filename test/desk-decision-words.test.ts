import { describe, expect, test } from "bun:test";
import { hasBannedWords } from "../src/ui/desk/banned-words.ts";
import { buildInbox } from "../src/domain/approval-inbox.ts";
import { buildDecide } from "../src/ui/desk/decide-build.ts";
import { confirmedDecision, decidedLine, failedDecision, listedDecision, type DecisionFailureCode } from "../src/ui/desk/decision-words.ts";

// Ported from the old approval inbox page tests (#25): what was decided, what happened, the listed state and who resolved it.
const CODES: readonly DecisionFailureCode[] = ["refused", "not_pending", "invalid", "unavailable", "followup_failed", "unknown"];
const APPROVED = { state: "approved", resolved_by: "actor:operator" };

describe("after an answer: only what the case keeper's list shows is claimed", () => {
  test("a decision the list confirms says what was decided and who resolved it", () => {
    const done = confirmedDecision("accept", APPROVED);
    expect(done.ok).toBe(true);
    expect(done.message).toContain("now approved (resolved by actor:operator)");
    expect(done.message).toContain("only known afterwards");
  });

  test("a rejection that the list confirms says the waiting move was refused and will not run", () => {
    const done = confirmedDecision("reject", { state: "rejected", resolved_by: "actor:operator" });
    expect(done.ok).toBe(true);
    expect(done.message).toContain("will not run");
  });

  test("a click the list disagrees with is not confirmed, and the listed state and resolver are shown", () => {
    const answer = confirmedDecision("accept", { state: "rejected", resolved_by: "actor:other" });
    expect(answer.ok).toBe(false);
    expect(answer.message).toContain("Not confirmed");
    expect(answer.message).toContain("shows it as rejected (resolved by actor:other)");
    expect(answer.message).toContain("listed state is the truth");
  });

  test("a request the list does not show, or still shows as waiting, is not confirmed and never claimed done", () => {
    for (const standing of [null, { state: "pending", resolved_by: null }]) {
      const answer = confirmedDecision("accept", standing);
      expect(answer.ok).toBe(false);
      expect(answer.message).toContain("Not confirmed");
      expect(answer.message).not.toContain("Done");
    }
  });

  test("a refusal says nothing was changed, unless the list shows the request already decided", () => {
    const plain = failedDecision("refused", null);
    expect(plain).toContain("was not recorded");
    expect(plain).toContain("Nothing was approved or rejected by this click");
    const decided = failedDecision("not_pending", APPROVED);
    expect(decided).toContain("lists this request as approved (resolved by actor:operator)");
    expect(decided).not.toContain("Nothing was approved or rejected");
  });

  test("an unreachable or unknown failure tells you to check the list, not that nothing changed", () => {
    for (const code of ["unavailable", "unknown"] as const) {
      const text = failedDecision(code, null);
      expect(text).toContain("Check the list before trying again");
      expect(text).not.toContain("Nothing was approved or rejected");
    }
  });

  test("a later step failing after the decision: stated when the list shows it decided, otherwise not confirmed", () => {
    const confirmed = failedDecision("followup_failed", APPROVED);
    expect(confirmed).toContain("A later step failed after the decision was sent");
    expect(confirmed).toContain("lists this request as approved");
    expect(confirmed).not.toContain("Nothing was approved");
    const forged = failedDecision("followup_failed", null);
    expect(forged).toContain("Not confirmed");
    expect(forged).not.toContain("was recorded");
    expect(forged).not.toContain("Nothing was approved");
  });

  test("a pending request has no decided sentence", () => {
    expect(listedDecision({ state: "pending", resolved_by: null })).toBeNull();
    expect(listedDecision(null)).toBeNull();
  });

  test("no sentence on the screen uses a word the desk bans", () => {
    const standings = [null, { state: "pending", resolved_by: null }, APPROVED, { state: "rejected", resolved_by: null }];
    const all: string[] = [];
    for (const standing of standings) {
      for (const choice of ["accept", "reject"] as const) all.push(confirmedDecision(choice, standing).message);
      for (const code of CODES) all.push(failedDecision(code, standing));
    }
    for (const text of all) expect(hasBannedWords(text.replaceAll("actor:operator", "the operator"))).toBe(false);
  });
});

describe("Decide lists what is already decided, and says when an older move cannot be answered", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    approval_id: "apr-1", state: "approved", requester: "cognate-service", world_ref: "w", operation_kind: "action", operation_name: "run.start",
    resource_id: "res-7", subject_actor_ref: "actor:operator", request_ref: "env-1", expires_at: "2026-11-02T13:00:00Z", resolved_by: "actor:operator", ...over,
  });
  const NOW = new Date("2026-11-02T12:00:00Z");

  test("a decided request is listed with who resolved it and never becomes a card", () => {
    const inbox = buildInbox([row() as never], 0, { now: NOW, waitingApprovalIds: new Set(), operatorRef: "actor:operator" });
    const state = buildDecide({ inbox: { state: "listed", inbox }, moves: [], caseApprovals: { kind: "none" }, holds: new Map() });
    expect(state.cards).toEqual([]);
    expect(state.decided).toEqual([decidedLine("run.start", "cognate-service", { state: "approved", resolved_by: "actor:operator" })]);
    expect(state.decided![0]).toBe("Approved (resolved by actor:operator): run.start, asked for by cognate-service");
  });

  test("a move whose approval cannot be verified is a notice, not a card", () => {
    const move = { operation_ref: "product.apply", approval_id: null, approval_identity: { state: "unverified" }, observable: false, settleable: false } as never;
    const inbox = buildInbox([], 0, { now: NOW, waitingApprovalIds: new Set(), operatorRef: "actor:operator" });
    const state = buildDecide({ inbox: { state: "listed", inbox }, moves: [move], caseApprovals: { kind: "none" }, holds: new Map() });
    expect(state.cards).toEqual([]);
    expect(state.notices.join(" ")).toContain("cannot be approved from here");
  });
});
