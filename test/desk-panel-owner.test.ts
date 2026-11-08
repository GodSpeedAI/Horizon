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

describe("an agent removes only its own panel", () => {
  const alice = (): Panels => {
    const r = reduceAgent(NO_PANELS, { tool: "ask_human", panel: "a_panel", ask: ask("a_q") }, "Alice", "ag_alice");
    expect(r.result.ok).toBe(true);
    return r.state;
  };
  const remove = (s: Panels, agent: string, key: string) => reduceAgent(s, { tool: "arrange", action: { op: "surface.remove", id: "a_panel" } }, agent, key);

  test("Bob cannot remove Alice's panel, and her unanswered question stays", () => {
    const before = alice();
    const r = remove(before, "Bob", "ag_bob");
    expect(r.result).toEqual({ ok: false, code: "SCHEMA", message: "That panel belongs to another agent." });
    expect(r.state).toBe(before);
    expect(openIds(r.state, "a_panel")).toEqual(["a_q"]);
  });

  test("Alice can remove her own panel", () => {
    const r = remove(alice(), "Alice", "ag_alice");
    expect(r.result).toEqual({ ok: true, panel: "a_panel" });
    expect(r.state.open).toEqual([]);
  });

  test("a panel Alice owns but that holds a question another agent owns cannot be removed by Alice", () => {
    const s = alice();
    const moved: Panels = { ...s, open: s.open.map((p) => ({ ...p, blocks: p.blocks.map((b) => (b.kind === "question" ? { ...b, asked_by_key: "ag_bob" } : b)) })) };
    const r = remove(moved, "Alice", "ag_alice");
    expect(r.result).toMatchObject({ ok: false, message: "That question belongs to another agent." });
    expect(openIds(r.state, "a_panel")).toEqual(["a_q"]);
  });
});
