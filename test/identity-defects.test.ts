import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { deskScopeFor, startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { revisionOf } from "./support/answer-revision.ts";
import { withRequestId } from "./support/request-body.ts";
import { agentInProcess } from "./support/agent-door.ts";
import { listAnswers } from "../src/capabilities/panel-answers.ts";
import { readIntentAttempts } from "../src/capabilities/navigation-intent.ts";
import { loadOperationManifest } from "../src/contracts/identity/manifest.ts";
import { ACTOR_NAMING_FIELDS, deskSearchAction } from "../src/app.ts";

/**
 * The two recorded identity defects, closed with negative tests (T23, Stage 0A).
 *
 * DEF-ROLE-FROM-REQUEST: a request that names its own role is refused, not honoured.
 * DEF-ASK-ROUTE-EXECUTOR: the executor of an agent's route claim is the authenticated key, and
 * a request that names an executor is refused.
 *
 * Every test here is a *negative* one: it proves the bad path is closed by observing the refusal
 * and that nothing was written. The positive observation for each is the pair: the honest path
 * still works and records the authenticated identity.
 */
let app: DeskApp;
let registry: string;
let defaultKey: string;
let alpha: string;
let bravo: string;
const hash = (key: string): string => createHash("sha256").update(key).digest("hex");
const ALPHA = "ag_alpha0001";
const BRAVO = "ag_bravo0002";

beforeAll(async () => {
  app = await startDeskApp();
  defaultKey = app.application.loaded.agentKey;
  registry = join(dirname(app.application.loaded.agentKeyPath), "agents.json");
  alpha = randomBytes(32).toString("hex");
  bravo = randomBytes(32).toString("hex");
  writeFileSync(
    registry,
    JSON.stringify({
      schema: "horizon.agents/1",
      agents: [
        { key_id: ALPHA, name: "Alpha agent", sha256: hash(alpha), added: "2026-11-09T09:00:00.000Z" },
        { key_id: BRAVO, name: "Bravo agent", sha256: hash(bravo), added: "2026-11-09T09:00:00.000Z" },
      ],
    }),
  );
});
afterAll(async () => app.stop());

/** An agent call with its key and a display name. The name is a label; the key decides who acts. */
const door = (key: string, name: string | null, body: unknown): Promise<Response> =>
  fetch(`${app.base}/agent/panels`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...(name === null ? {} : { "x-horizon-agent-name": name }) },
    body: JSON.stringify(withRequestId(body)),
  });

/**
 * The route claim's machinery, at the function the door calls after its checks. The door refuses
 * `answer.route` and `ask.withdraw` at this freeze (R5-01); the executor identity these tests are
 * about is recorded by that function, so it is called where the door would call it. The door's own
 * refusal is asserted beside each proof.
 */
const inProcess = (keyId: string, name: string | null, body: unknown) => agentInProcess(app.application, keyId, name ?? undefined, body);

const question = (id: string) => ({ id, question: `Which way ${id}?`, why_needed: "x", options: [{ option_id: "a", label: "A" }, { option_id: "b", label: "B" }] });

/** The person answers the agent's question. */
const answer = async (panel: string, ask: string): Promise<Response> =>
  fetch(`${app.base}/desk/panels/op`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(withRequestId({ op: "human.answer", panel, ask, ...(await revisionOf(app, panel, ask)), outcome: "answered", value: "a" })),
  });

const rows = async (): Promise<any[]> => ((await (await fetch(`${app.base}/desk/conversation`)).json()) as any).rows;
const answers = async (): Promise<any[]> => listAnswers(app.application.runtime.runtime.store, deskScopeFor(app));
const attempts = async (): Promise<number> => (await readIntentAttempts(app.application.runtime.runtime.store)).length;

describe("DEF-ROLE-FROM-REQUEST: a request cannot name its own role", () => {
  test("a body that names a role is refused, and nothing is written (NE-13)", async () => {
    const before = await attempts();
    for (const role of ["agent", "system", "human"]) {
      const response = await fetch(`${app.base}/surface/intent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transport: "gui", role, node_id: "horizon-health" }),
      });
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe("forbidden_field");
    }
    expect(await attempts()).toBe(before);
  });

  test("every field that would name an actor is refused on the surface route", async () => {
    for (const field of ACTOR_NAMING_FIELDS) {
      const response = await fetch(`${app.base}/surface/intent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transport: "gui", node_id: "horizon-health", [field]: "someone-else" }),
      });
      expect(response.status).toBe(400);
      expect((await response.json()).message).toContain(field);
    }
  });

  test("the surface route commits as the signed-in session, whatever the body asked for (PE-16)", async () => {
    const before = await attempts();
    // The honest path still works: no role in the body, the session's role is used.
    const view = (await (await fetch(`${app.base}/surface`, { headers: { accept: "application/json" } })).json()) as any;
    const node = view.view.actions.find((a: any) => a.operation === "horizon.health")?.action_id;
    expect(node).toBeTruthy();
    const ok = await fetch(`${app.base}/surface/intent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transport: "gui", node_id: node }),
    });
    expect(ok.status).toBe(200);
    const committed = (await ok.json()) as any;
    // The projection was reduced for the session's role, never for one the request chose.
    expect(committed.intent.intent.role).toBe("human");
    expect(await attempts()).toBe(before + 1);
    // The recorded intent names the session's actor; the role is not part of the durable record.
    const recorded = await readIntentAttempts(app.application.runtime.runtime.store);
    expect(recorded.at(-1)?.actor_ref).toBe(app.application.caller.actor.id);
  });

  test("the role a request would have used cannot change what is offered", async () => {
    // A body role is refused before the projection is built, so the agent projection cannot be
    // asked for and the human projection cannot be claimed.
    const response = await fetch(`${app.base}/surface/intent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ transport: "mcp", role: "agent", operation: "horizon.health" }),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("forbidden_field");
  });
});

describe("DEF-ASK-ROUTE-EXECUTOR: the executor is the authenticated key", () => {
  test("an agent's route claim records the key that made it, and the catalog row names it (PE-15)", async () => {
    expect((await door(alpha, "Alpha agent", { tool: "ask_human", panel: "ex_panel", ask: question("ex_q") })).status).toBe(200);
    expect((await answer("ex_panel", "ex_q")).status).toBe(200);
    // The door refuses the row at this freeze; the machinery behind it records who acted.
    expect((await door(alpha, "Alpha agent", { tool: "answer.route", panel_id: "ex_panel", ask_id: "ex_q", routed_as: "step handoff_0a49 in Seed" })).status).toBe(403);
    expect((await inProcess(ALPHA, "Alpha agent", { tool: "answer.route", panel_id: "ex_panel", ask_id: "ex_q", routed_as: "step handoff_0a49 in Seed" })).status).toBe(200);
    // The durable answer record names the authenticated executor.
    const mine = (await answers()).find((a) => a.ask === "ex_q");
    expect(mine?.finished_by).toBe("reported");
    expect(mine?.executed_by_key).toBe(ALPHA);
    // The conversation row keeps the person's words and names the executor in its references.
    const row = (await rows()).find((r) => r.kind === "answer" && r.refs.panel_id === "ex_panel");
    expect(row?.source).toBe("you");
    expect(row?.words).toContain("You answered");
    expect(row?.refs.executor_key).toBe(ALPHA);
    // The catalog row names the same executor and the credential the route actually authenticates.
    const catalog = loadOperationManifest().byId.get("ask.route");
    expect(catalog?.executor).toBe("registered_agent");
    expect(catalog?.callerAuthentication).toBe("registered_agent_key");
    expect(catalog?.class).toBe("P2");
    expect(catalog?.humanEvidence).toBe("A3-UV");
    expect(catalog?.stage0bEvidence).toBe("A3-T");
  });

  test("a body that names an executor is refused, and the claim is not recorded (NE-14)", async () => {
    expect((await door(alpha, "Alpha agent", { tool: "ask_human", panel: "ex_named", ask: question("ex_named_q") })).status).toBe(200);
    expect((await answer("ex_named", "ex_named_q")).status).toBe(200);
    for (const field of ["executor", "executor_ref", "executed_by", "executed_by_key", "role", "caller", "principal"]) {
      const response = await door(alpha, "Alpha agent", {
        tool: "answer.route",
        panel_id: "ex_named",
        ask_id: "ex_named_q",
        routed_as: "step handoff_0a49 in Seed",
        [field]: BRAVO,
      });
      expect(response.status).toBe(400);
      expect((await response.json()).message).toContain(field);
    }
    // Nothing was written: the answer is still waiting, with no executor.
    const mine = (await answers()).find((a) => a.ask === "ex_named_q");
    expect(mine?.finished_by).toBeNull();
    expect(mine?.executed_by_key ?? null).toBeNull();
    const row = (await rows()).find((r) => r.kind === "answer" && r.refs.panel_id === "ex_named");
    expect(row?.refs.executor_key).toBeUndefined();
  });

  test("another key cannot take the claim, and the executor stays the first key", async () => {
    expect((await door(alpha, "Alpha agent", { tool: "ask_human", panel: "ex_other", ask: question("ex_other_q") })).status).toBe(200);
    expect((await answer("ex_other", "ex_other_q")).status).toBe(200);
    // Bravo holds a registered key but does not own the question.
    const attempt = await inProcess(BRAVO, "Alpha agent", { tool: "answer.route", panel_id: "ex_other", ask_id: "ex_other_q", routed_as: "step handoff_0a49 in Seed" });
    expect(attempt.status).toBeGreaterThanOrEqual(400);
    const mine = (await answers()).find((a) => a.ask === "ex_other_q");
    expect(mine?.finished_by).toBeNull();
    expect(mine?.executed_by_key ?? null).toBeNull();
    // The owner may still make the claim, and the record names the owner's key.
    expect((await inProcess(ALPHA, "Alpha agent", { tool: "answer.route", panel_id: "ex_other", ask_id: "ex_other_q", routed_as: "step handoff_0a49 in Seed" })).status).toBe(200);
    expect((await answers()).find((a) => a.ask === "ex_other_q")?.executed_by_key).toBe(ALPHA);
  });

  test("an agent's withdrawal names the key that withdrew it", async () => {
    expect((await door(alpha, "Alpha agent", { tool: "ask_human", panel: "ex_withdraw", ask: question("ex_withdraw_q") })).status).toBe(200);
    expect((await door(alpha, "Alpha agent", { tool: "ask.withdraw", panel_id: "ex_withdraw", ask_id: "ex_withdraw_q", reason: "found it myself" })).status).toBe(403);
    expect((await inProcess(ALPHA, "Alpha agent", { tool: "ask.withdraw", panel_id: "ex_withdraw", ask_id: "ex_withdraw_q", reason: "found it myself" })).status).toBe(200);
    const row = (await rows()).find((r) => r.kind === "answer" && r.refs.panel_id === "ex_withdraw");
    expect(row?.outcome).toContain("The agent withdrew this question");
    expect(row?.refs.executor_key).toBe(ALPHA);
  });

  test("the agent door refuses every field that would name an actor (NE-15)", async () => {
    expect((await door(alpha, "Alpha agent", { tool: "ask_human", panel: "ex_fields", ask: question("ex_fields_q") })).status).toBe(200);
    for (const field of ACTOR_NAMING_FIELDS) {
      const response = await door(alpha, "Alpha agent", { tool: "read_responses", [field]: "someone-else" });
      expect(response.status).toBe(400);
      expect((await response.json()).message).toContain(field);
    }
  });
});

describe("the closed dispatch table: an unlisted action never reaches the handler", () => {
  const search = (body: unknown): Promise<Response> =>
    fetch(`${app.base}/desk/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  test("the catalog names exactly two actions for the find route", () => {
    const entry = loadOperationManifest().dispatch.get("POST /desk/search");
    expect(entry).toBeDefined();
    expect(Object.keys(entry!.actions).sort()).toEqual(["false_or_absent", "true_with_non_empty_q"]);
    expect(entry!.unknown_action).toBe("PX");
    expect(entry!.action_values?.["false_or_absent"]?.values).toEqual(["absent", false, "0"]);
    expect(entry!.action_values?.["true_with_non_empty_q"]?.values).toEqual([true, "1"]);
  });

  test("a `record` value outside the catalog is refused before the search runs, and nothing is recorded", async () => {
    const before = (await rows()).length;
    for (const value of ["yes", "2", "record", "TRUE", 1.5, { nested: true }, ["1"]]) {
      const response = await search({ q: "checkout", record: value });
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe("unknown_action");
    }
    expect((await rows()).length).toBe(before);
  });

  test("a recorded find with no question is refused, because there is no find to bind it to", async () => {
    const before = (await rows()).length;
    const response = await search({ q: "   ", record: "1" });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("unknown_action");
    expect((await rows()).length).toBe(before);
  });

  test("the two listed actions still work: the read records nothing and the recorded find records once", async () => {
    const before = (await rows()).length;
    const read = await search({ q: "checkout" });
    expect(read.status).toBe(200);
    expect((await rows()).length).toBe(before);
    const recorded = await search({ q: "checkout", record: "1" });
    expect(recorded.status).toBe(200);
    expect((await rows()).length).toBe(before + 1);
  });

  test("the classifier and the route agree on every value", () => {
    expect(deskSearchAction(undefined, "x")).toBe("false_or_absent");
    expect(deskSearchAction(false, "x")).toBe("false_or_absent");
    expect(deskSearchAction("0", "x")).toBe("false_or_absent");
    expect(deskSearchAction(true, "x")).toBe("true_with_non_empty_q");
    expect(deskSearchAction("1", "x")).toBe("true_with_non_empty_q");
    expect(deskSearchAction("1", "  ")).toBeNull();
    expect(deskSearchAction("maybe", "x")).toBeNull();
  });
});
