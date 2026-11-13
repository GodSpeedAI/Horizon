import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { revisionOf } from "./support/answer-revision.ts";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { withRequestId } from "./support/request-body.ts";
import { agentInProcess } from "./support/agent-door.ts";

/**
 * Every agent has its own key. The registry (`agents.json`, beside agent.key) holds a hash of each key, never the key. The
 * test injects its keys directly: it writes their hashes into the registry and keeps the keys in memory, printing none.
 */
let app: DeskApp;
let registry: string;
let defaultKey: string;
let alpha: string;
let bravo: string;
const hash = (key: string): string => createHash("sha256").update(key).digest("hex");

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
        { key_id: "ag_alpha0001", name: "Alpha agent", sha256: hash(alpha), added: "2026-11-07T09:00:00.000Z" },
        { key_id: "ag_bravo0002", name: "Bravo agent", sha256: hash(bravo), added: "2026-11-07T09:00:00.000Z" },
      ],
    }),
  );
});
afterAll(async () => app.stop());

/** An agent call with its key and a display name. The name is a label; the key decides who owns the question. */
const as = (key: string, name: string | null, path: string, body?: unknown) =>
  fetch(`${app.base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...(name === null ? {} : { "x-horizon-agent-name": name }) },
    ...(body === undefined ? {} : { body: JSON.stringify(withRequestId(body)) }),
  });
const answersFor = async (key: string, name: string | null): Promise<any[]> => ((await (await as(key, name, "/agent/panels/answers")).json()) as any).responses;
const question = (id: string) => ({ id, question: `Which plan for ${id}?`, why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }] });
const answer = async (panel: string, ask: string) =>
  fetch(`${app.base}/desk/panels/op`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(withRequestId({ op: "human.answer", panel, ask, ...(await revisionOf(app, panel, ask)), outcome: "answered", value: "a" })) });

describe("each agent has its own key", () => {
  test("the default key, and each registry key, reach the door; an unknown key does not", async () => {
    expect((await as(defaultKey, null, "/agent/panels/answers")).status).toBe(200);
    expect((await as(alpha, null, "/agent/panels/answers")).status).toBe(200);
    expect((await as(bravo, null, "/agent/panels/answers")).status).toBe(200);
    expect((await as(randomBytes(32).toString("hex"), null, "/agent/panels/answers")).status).toBe(401);
  });

  test("the registry keeps hashes only", () => {
    const text = readFileSync(registry, "utf8");
    expect(text).not.toContain(alpha);
    expect(text).not.toContain(bravo);
    expect(text).toContain(hash(alpha));
  });
});

describe("agent B cannot read or route agent A's question, even when it sends A's name", () => {
  test("A's answer is A's; B reads nothing of it, under its own key or under A's name", async () => {
    expect((await as(alpha, "Alpha agent", "/agent/panels", { tool: "ask_human", panel: "a_panel", ask: question("a_q") })).status).toBe(200);
    expect((await answer("a_panel", "a_q")).status).toBe(200);
    expect((await answersFor(alpha, "Alpha agent")).map((a) => a.ask)).toEqual(["a_q"]);
    expect(await answersFor(bravo, "Bravo agent")).toEqual([]);
    expect(await answersFor(bravo, "Alpha agent")).toEqual([]);
  });

  test("B cannot say where A's answer went, under A's name or its own", async () => {
    for (const name of ["Alpha agent", "Bravo agent"]) {
      const routed = await as(bravo, name, "/agent/panels", { tool: "answer.route", panel_id: "a_panel", ask_id: "a_q", routed_as: "no action: not mine" });
      expect(routed.status).toBeGreaterThanOrEqual(400);
    }
    expect((await answersFor(alpha, "Alpha agent")).some((a) => a.ask === "a_q")).toBe(true);
  });

  test("B cannot withdraw A's open question", async () => {
    expect((await as(alpha, "Alpha agent", "/agent/panels", { tool: "ask_human", panel: "a_open", ask: question("a_open_q") })).status).toBe(200);
    const withdrawn = await as(bravo, "Alpha agent", "/agent/panels", { tool: "ask.withdraw", panel_id: "a_open", ask_id: "a_open_q", reason: "not mine to take back" });
    expect(withdrawn.status).toBeGreaterThanOrEqual(400);
  });

  test("A routes its own answer under its own key", async () => {
    // The door refuses `answer.route` at this freeze (R5-01): the machinery behind it, which is
    // what this test is about, is called where the door calls it.
    const routed = await agentInProcess(app.application, "ag_alpha0001", "Alpha agent", { tool: "answer.route", panel_id: "a_panel", ask_id: "a_q", routed_as: "step handoff_0a49 in Seed" });
    expect(routed.status).toBe(200);
    // And the live route refuses it, whoever asks.
    const live = await as(alpha, "Alpha agent", "/agent/panels", { tool: "answer.route", panel_id: "a_panel", ask_id: "a_q", routed_as: "step handoff_0a49 in Seed" });
    expect(live.status).toBe(403);
  });

  test("a display name cannot move a question to another key", async () => {
    await as(alpha, "Bravo agent", "/agent/panels", { tool: "ask_human", panel: "a_renamed", ask: question("a_renamed_q") });
    await answer("a_renamed", "a_renamed_q");
    expect((await answersFor(alpha, "Carol")).some((a) => a.ask === "a_renamed_q")).toBe(true);
    expect((await answersFor(bravo, "Bravo agent")).some((a) => a.ask === "a_renamed_q")).toBe(false);
  });
});
