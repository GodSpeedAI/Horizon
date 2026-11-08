/** Step 3: a panel belongs to the key that first put it up; another key cannot put on it, and a put cannot remove an unanswered question. */
import { describe, expect, test } from "bun:test";
import { NO_PANELS, reduceAgent, type Panels } from "../src/ui/desk/panels-model.ts";

const two = [{ option_id: "yes", label: "Yes" }, { option_id: "no", label: "No" }];
const ask = (id: string) => ({ id, question: `Question ${id}?`, why_needed: "needed", options: two });
const callout = { type: "callout", id: "c", tone: "ok", text: "fine" };
const openIds = (s: Panels, panel: string) => (s.open.find((p) => p.id === panel)?.blocks ?? []).map((b) => b.id);

describe("a panel belongs to the agent that put it up", () => {
  const alice = (): Panels => {
    const r = reduceAgent(NO_PANELS, { tool: "ask_human", panel: "a_panel", ask: ask("a_q") }, "Alice", "ag_alice");
    expect(r.result.ok).toBe(true);
    return r.state;
  };

  test("another agent's show_surface on the same panel is refused and Alice's question survives", () => {
    const before = alice();
    const r = reduceAgent(before, { tool: "show_surface", surface: { id: "a_panel", blocks: [callout] } }, "Bob", "ag_bob");
    expect(r.result).toEqual({ ok: false, code: "SCHEMA", message: "That panel belongs to another agent." });
    expect(openIds(r.state, "a_panel")).toContain("a_q");
  });

  test("another agent's ask_human on Alice's panel is refused", () => {
    const r = reduceAgent(alice(), { tool: "ask_human", panel: "a_panel", ask: ask("b_q") }, "Bob", "ag_bob");
    expect(r.result).toMatchObject({ ok: false, message: "That panel belongs to another agent." });
    expect(openIds(r.state, "a_panel")).toEqual(["a_q"]);
  });

  test("the owner's own put cannot remove an unanswered question", () => {
    const r = reduceAgent(alice(), { tool: "show_surface", surface: { id: "a_panel", blocks: [callout] } }, "Alice", "ag_alice");
    expect(r.result.ok).toBe(true);
    expect(openIds(r.state, "a_panel")).toContain("a_q");
  });

  test("the owner key is set on first creation and not changed by a later put", () => {
    const s = alice();
    expect(s.open[0]).toMatchObject({ owner_key: "ag_alice" });
    const again = reduceAgent(s, { tool: "ask_human", panel: "a_panel", ask: ask("a_q2") }, "Alice", "ag_alice").state;
    expect(again.open[0]).toMatchObject({ owner_key: "ag_alice" });
  });
});
