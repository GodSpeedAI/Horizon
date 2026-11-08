/**
 * R4-1: a desk's panels, board order, answers and receipts belong to the operator that made them. Two operators on one store (the same
 * tenant, with HORIZON_OPERATOR_REF changed between starts) never list, read, answer or see one another's panel or answer, and the
 * board order one operator keeps does not reveal the other's panel ids.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { listAnswers } from "../src/capabilities/panel-answers.ts";
import { BOARD_COLLECTION, boardIdOf, deskScopeOf, loadBoard, questionStateOf } from "../src/capabilities/panel-records.ts";
import { revisionOf } from "./support/answer-revision.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

const apps: DeskApp[] = [];
const savedRef = process.env.HORIZON_OPERATOR_REF;
/** Starts a desk as one operator. The operator ref is read when the config loads, so it is set just before the start. */
const asOperator = async (ref: string, root?: string): Promise<DeskApp> => {
  process.env.HORIZON_OPERATOR_REF = ref;
  const app = await startDeskApp(root === undefined ? {} : { root });
  apps.push(app);
  return app;
};
const stopApp = async (app: DeskApp): Promise<void> => {
  await app.stop();
  apps.splice(apps.indexOf(app), 1);
};
const scopeOf = (app: DeskApp): string => deskScopeOf(app.application.caller.tenant, app.application.caller.actor.id);
const askOf = (id: string) => ({ id, question: "Which plan?", why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }] });

afterAll(async () => {
  for (const app of apps) await app.stop().catch(() => undefined);
  if (savedRef === undefined) delete process.env.HORIZON_OPERATOR_REF;
  else process.env.HORIZON_OPERATOR_REF = savedRef;
});

describe("desk records are scoped to their operator", () => {
  test("a second operator after restart cannot list, read, answer or see the first operator's panel or answer", async () => {
    const operatorBefore = process.env.HORIZON_OPERATOR_REF;
    try {
      const alice = await asOperator("actor:alice");
      const aliceScope = scopeOf(alice);
      await alice.application.applyAgentOp({ tool: "ask_human", panel: "alice-plan", ask: askOf("q") });
      const answered = await alice.post("/desk/panels/op", { op: "human.answer", panel: "alice-plan", ask: "q", ...(await revisionOf(alice, "alice-plan", "q")), outcome: "answered", value: "a" });
      expect(answered.status).toBe(200);
      const root = alice.root;
      await stopApp(alice);
  
      const bob = await asOperator("actor:review-bob", root);
      const bobScope = scopeOf(bob);
      const store = bob.application.runtime.runtime.store;
      expect(bobScope).not.toBe(aliceScope);
  
      // Listing: the desk's state and the stored records hold nothing of Alice's.
      expect(JSON.stringify(await bob.state())).not.toContain("alice-plan");
      expect((await loadBoard(store, bobScope)).stored.size).toBe(0);
      expect(await listAnswers(store, bobScope)).toEqual([]);
      // Reading by id: her panel, her question and her answer are not there for Bob.
      expect(await questionStateOf(store, bobScope, "alice-plan", "q")).toBeUndefined();
      expect(await listAnswers(store, bobScope, "alice-plan")).toEqual([]);
      // Board order: Alice's order record exists under her scope only.
      expect(await store.getRecord(BOARD_COLLECTION, boardIdOf(bobScope))).toBeUndefined();
      expect(await store.getRecord(BOARD_COLLECTION, boardIdOf(aliceScope))).toBeDefined();
      // Answering: Bob's answer to her question is refused, and her answer is still the only one.
      const bobAnswer = await bob.post("/desk/panels/op", { op: "human.answer", panel: "alice-plan", ask: "q", ...(await revisionOf(bob, "alice-plan", "q")), outcome: "answered", value: "b" });
      expect(bobAnswer.status).not.toBe(200);
      expect(await listAnswers(store, aliceScope, "alice-plan")).toHaveLength(1);
      expect(await listAnswers(store, bobScope, "alice-plan")).toEqual([]);
  
      // Bob's own panel is his: his board shows it, and it does not show Alice's.
      await bob.application.applyAgentOp({ tool: "ask_human", panel: "bob-plan", ask: askOf("q") });
      const bobState = JSON.stringify(await bob.state());
      expect(bobState).toContain("bob-plan");
      expect(bobState).not.toContain("alice-plan");
      expect((await loadBoard(store, bobScope)).board.open.map((p) => p.id)).toEqual(["bob-plan"]);
      expect((await loadBoard(store, aliceScope)).board.open.map((p) => p.id)).toEqual(["alice-plan"]);
      await stopApp(bob);
    } finally {
      // Put the operator ref back as this test found it, so no later test in the run starts as this test's operator.
      if (operatorBefore === undefined) delete process.env.HORIZON_OPERATOR_REF;
      else process.env.HORIZON_OPERATOR_REF = operatorBefore;
    }
  });
});
