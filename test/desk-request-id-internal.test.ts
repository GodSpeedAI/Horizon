/**
 * The request id's checks live in the one path every agent change takes (finding R3-9). An internal caller that passes a request id
 * gets the same receipt rules as the agent door: the same id with the same change returns the stored response, and the same id with
 * a different question is refused.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

let app: DeskApp;
beforeAll(async () => {
  app = await startDeskApp();
});
afterAll(async () => app.stop());

const q = (id: string) => ({ id, question: "Which plan?", why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }] });
const panelIds = async (): Promise<string[]> => (await app.state()).panels.open.map((p: any) => p.id);

describe("the internal path checks a request id the same way the door does", () => {
  test("the same request id with a different question id is refused, and the second question is not stored", async () => {
    const first = await app.application.applyAgentOp({ tool: "ask_human", panel: "ri_a", ask: q("ri_q1"), request_id: "ri-internal-1" }, "A", "ag_ri");
    expect(first.ok).toBe(true);
    const other = await app.application.applyAgentOp({ tool: "ask_human", panel: "ri_b", ask: q("ri_q2"), request_id: "ri-internal-1" }, "A", "ag_ri");
    expect(other).toMatchObject({ ok: false, code: "REUSED" });
    expect(await panelIds()).not.toContain("ri_b");
  });

  test("the same request id with the same change returns the stored response and stores nothing twice", async () => {
    const op = { tool: "ask_human", panel: "ri_c", ask: q("ri_q3"), request_id: "ri-internal-2" } as const;
    const first = await app.application.applyAgentOp(op, "A", "ag_ri");
    const again = await app.application.applyAgentOp(op, "A", "ag_ri");
    expect(again).toEqual(first);
    expect((await app.state()).panels.open.find((p: any) => p.id === "ri_c").blocks.filter((b: any) => b.id === "ri_q3")).toHaveLength(1);
  });

  test("a request id that cannot be read is refused on the internal path", async () => {
    const bad = await app.application.applyAgentOp({ tool: "ask_human", panel: "ri_d", ask: q("ri_q4"), request_id: 12 } as never, "A", "ag_ri");
    expect(bad.ok).toBe(false);
    expect(await panelIds()).not.toContain("ri_d");
  });
});
