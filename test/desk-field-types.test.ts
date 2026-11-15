/**
 * An agent change is checked by type as a whole before anything is stored (finding R3-1). A `step` of 42 used to be stored, the
 * board then could not read it back, and every later panel change was refused. Now the change is refused with 400, nothing is
 * stored, and the board still takes a valid change afterwards.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { withRequestId } from "./support/request-body.ts";

let app: DeskApp;
let key: string;
beforeAll(async () => {
  app = await startDeskApp();
  key = app.application.loaded.agentKey;
});
afterAll(async () => app.stop());

const q = (id: string) => ({ id, question: "Which plan?", why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }] });
const door = (body: unknown) => fetch(`${app.base}/agent/panels`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(withRequestId(body)) });
const panelIds = async (): Promise<string[]> => (await app.state()).panels.open.map((p: any) => p.id);

describe("an agent change with a field of the wrong type is refused whole", () => {
  test("step 42 is refused with 400 and nothing is stored; the board still accepts a valid change", async () => {
    const bad = await door({ tool: "ask_human", panel: "typed_bad", ask: q("tq1"), step: 42 });
    expect(bad.status).toBe(400);
    expect((await bad.json()).ok).toBe(false);
    expect(await panelIds()).not.toContain("typed_bad");

    const ok = await door({ tool: "ask_human", panel: "typed_ok", ask: q("tq2"), step: "step_typed" });
    expect(ok.status).toBe(200);
    expect(await panelIds()).toContain("typed_ok");
    expect((await app.state()).panels.open.find((p: any) => p.id === "typed_ok").step).toBe("step_typed");
  });

  test("a panel id that is not text is refused with 400, and nothing is stored", async () => {
    const bad = await door({ tool: "annotate", panel: 7, text: "hello" });
    expect(bad.status).toBe(400);
    const badQuestion = await door({ tool: "ask_human", panel: "typed_q", ask: { ...q("tq3"), why_needed: 5 } });
    expect(badQuestion.status).toBe(400);
    expect(await panelIds()).not.toContain("typed_q");
    expect((await door({ tool: "annotate", panel: "typed_ok", text: "still fine" })).status).toBe(200);
  });
});
