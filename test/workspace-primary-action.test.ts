/**
 * The cockpit's single primary action. One next step is named at the top of the workspace, chosen by a fixed
 * precedence. It only points at the place where the operator acts; it never submits anything itself.
 */
import { describe, expect, test } from "bun:test";
import { moveOf, primaryActionOf, type StoredMoveFacts, type WorkspaceChrome, type WorkspaceReceipt } from "../src/ui/workspace/model.ts";

const governed = { governed: true, realitytrace: true };
const committed = { at: "2026-10-24T00:00:00.000Z", expected: true };

function receiptFor(facts: StoredMoveFacts, context = governed): WorkspaceReceipt {
  return { intent_id: facts.intent_id, found: true, move: moveOf(facts, context), approvals: true };
}

const doneOnboarding: WorkspaceChrome["onboarding"] = { visible: false, skipped: false, steps: [] };
const setupOnboarding: WorkspaceChrome["onboarding"] = {
  visible: true,
  skipped: false,
  steps: [{ id: "stack", label: "Stack", done: false, detail: "SEA-Forge is off", fix: "Start the cockpit with bun run ignite." }],
};
const availableChoice = { label: "Health check", available: true, action_id: "act-1" };

describe("primary action", () => {
  test("an escalation waiting for the operator comes first", () => {
    const receipt = receiptFor({
      intent_id: "i-1",
      operation_ref: "product.apply",
      committed: null,
      attempt: { outcome: "awaiting_authority", reason: "awaiting approval appr-1" },
      settlement: null,
      at: null,
    });
    const action = primaryActionOf({ receipt, onboarding: setupOnboarding, choices: [availableChoice], current: true });
    expect(action.kind).toBe("answer_escalation");
    expect(action.href).toBe("#receipt");
  });

  test("a commit awaiting RealityTrace comes before choosing a new move", () => {
    const receipt = receiptFor({
      intent_id: "i-2",
      operation_ref: "product.apply",
      committed,
      decision: { ref: "env-1" },
      attempt: null,
      settlement: null,
      at: null,
    });
    const action = primaryActionOf({ receipt, onboarding: doneOnboarding, choices: [availableChoice], current: true });
    expect(action.kind).toBe("observe");
  });

  test("an observed commit is ruled on next", () => {
    const receipt = receiptFor({
      intent_id: "i-3",
      operation_ref: "product.apply",
      committed,
      decision: { ref: "env-1" },
      attempt: null,
      settlement: { status: "pending", final: false, reason: null, observation: { evidence_id: "ev-3" } },
      at: null,
    });
    expect(primaryActionOf({ receipt, onboarding: doneOnboarding, choices: [], current: true }).kind).toBe("rule");
  });

  test("unfinished setup is named with its exact fix before any move", () => {
    const action = primaryActionOf({ receipt: null, onboarding: setupOnboarding, choices: [availableChoice], current: true });
    expect(action.kind).toBe("finish_setup");
    expect(action.reason).toBe("Start the cockpit with bun run ignite.");
  });

  test("with setup done, the first available move is offered and linked, not submitted", () => {
    const action = primaryActionOf({ receipt: null, onboarding: doneOnboarding, choices: [availableChoice], current: true });
    expect(action.kind).toBe("choose_move");
    expect(action.title).toContain("Health check");
    expect(action.href).toBe("#region-decision");
  });

  test("when nothing is available, it says so and points at what is blocked", () => {
    const action = primaryActionOf({ receipt: null, onboarding: doneOnboarding, choices: [], current: true });
    expect(action.kind).toBe("none");
    expect(action.href).toBe("#region-decision");
  });

  test("an unavailable or unknown checkpoint offers no move", () => {
    const action = primaryActionOf({ receipt: null, onboarding: doneOnboarding, choices: [availableChoice], current: false });
    expect(action.kind).toBe("none");
  });
});
