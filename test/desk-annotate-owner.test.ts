/**
 * Only the agent that put a panel up may annotate it (finding R3-2). Another agent's note used to be stored, and repeating it
 * displaced the owner's notes. A foreign or unowned panel refuses the note; a note at the limit is refused, never dropped for another.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { MAX_NOTES, NO_PANELS, NOTES_FULL, reduceAgent } from "../src/ui/desk/panels-model.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

let app: DeskApp;
beforeAll(async () => {
  app = await startDeskApp();
});
afterAll(async () => app.stop());

const q = (id: string) => ({ id, question: "Which plan?", why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }] });
const notesOf = async (panel: string): Promise<string[]> => ((await app.state()).panels.open.find((p: any) => p.id === panel)?.notes ?? []).map((n: any) => n.text);

describe("an annotation belongs to the agent that owns the panel", () => {
  test("agent B cannot annotate agent A's panel, and A can", async () => {
    expect((await app.application.applyAgentOp({ tool: "ask_human", panel: "an_a", ask: q("an_q") }, "A", "ag_a")).ok).toBe(true);

    const foreign = await app.application.applyAgentOp({ tool: "annotate", panel: "an_a", text: "from B" }, "B", "ag_b");
    expect(foreign.ok).toBe(false);
    expect(foreign).toMatchObject({ code: "SCHEMA", message: "That panel belongs to another agent." });
    expect(await notesOf("an_a")).toEqual([]);

    expect((await app.application.applyAgentOp({ tool: "annotate", panel: "an_a", text: "from A" }, "A", "ag_a")).ok).toBe(true);
    expect(await notesOf("an_a")).toEqual(["from A"]);
  });

  test("B's repeated attempts do not displace A's notes", async () => {
    for (let i = 0; i < 25; i += 1) await app.application.applyAgentOp({ tool: "annotate", panel: "an_a", text: `B ${i}` }, "B", "ag_b");
    expect(await notesOf("an_a")).toEqual(["from A"]);
  });

  test("a panel with no recorded owner refuses every note", async () => {
    const unowned = { ...NO_PANELS, open: [{ id: "old", title: "old", step: null, pinned: false, blocks: [], notes: [], owner_key: null }] };
    const r = reduceAgent(unowned, { tool: "annotate", panel: "old", text: "hi" }, "A", "ag_a");
    expect(r.result).toMatchObject({ ok: false, code: "SCHEMA" });
    expect(r.state.open[0]?.notes).toEqual([]);
  });

  test("a note at the limit is refused, and the existing notes stay", async () => {
    const full = Array.from({ length: MAX_NOTES }, (_, i) => ({ text: `n${i}`, tone: "neutral" as const }));
    const state = { ...NO_PANELS, open: [{ id: "full", title: "full", step: null, pinned: false, blocks: [], notes: full, owner_key: "ag_a" }] };
    const r = reduceAgent(state, { tool: "annotate", panel: "full", text: "one more" }, "A", "ag_a");
    expect(r.result).toMatchObject({ ok: false, message: NOTES_FULL });
    expect(r.state.open[0]?.notes).toEqual(full);
  });
});
