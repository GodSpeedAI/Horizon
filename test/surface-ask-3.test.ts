/** The surface grammar at /3: ask inputs, option consequences, `resolves`; /2 documents still read; still 15 blocks. */
import { describe, expect, test } from "bun:test";
import { BLOCK_TYPES, parseSurface, SURFACE_SCHEMA, SURFACE_SCHEMA_PREVIOUS } from "../src/ui/surface2/grammar.ts";
import { itemOf } from "../src/ui/surface2/panel-blocks.ts";

const basis = { provenance: { source_kind: "agent_supplied", source_ref: "agent:ask", attributed_to: { actor_ref: "agent:asker", role: "agent", principal_ref: "os:operator:1000", agent_ref: "agent:asker", on_behalf_of_ref: "os:operator:1000" }, layout: "agent_composed" } };
const doc = (schema: string, ask: Record<string, unknown>) => ({
  schema,
  surface_id: "ask.demo",
  title: "Ask demo",
  responsibility: "decide",
  intent: "inspect",
  focus_ref: "semantic:Case",
  blocks: [{ id: "q1", type: "ask", ...basis, question: "Ship it?", why_needed: "The release is waiting", ...ask }],
  actions: [],
});
const two = [{ option_id: "yes", label: "Yes" }, { option_id: "no", label: "No" }];
const verdict = (schema: string, ask: Record<string, unknown>) => parseSurface(doc(schema, ask));

describe("horizon.surface/3 asks", () => {
  test("the version is /3 and the grammar still has exactly 15 blocks", () => {
    expect(SURFACE_SCHEMA).toBe("horizon.surface/3");
    expect(SURFACE_SCHEMA_PREVIOUS).toBe("horizon.surface/2");
    expect(BLOCK_TYPES.length).toBe(15);
  });
  test("each input kind is read", () => {
    // Surface grammar probe: a basis the file defines may differ; show the first issue if it does.
    const probe = verdict(SURFACE_SCHEMA, { options: two });
    expect(probe.ok ? "ok" : JSON.stringify(probe.issues)).toBe("ok");
    expect(verdict(SURFACE_SCHEMA, { input: "select", options: two }).ok).toBe(true);
    expect(verdict(SURFACE_SCHEMA, { input: "multiselect", options: two }).ok).toBe(true);
    expect(verdict(SURFACE_SCHEMA, { input: "confirm" }).ok).toBe(true);
    expect(verdict(SURFACE_SCHEMA, { input: "text" }).ok).toBe(true);
    expect(verdict(SURFACE_SCHEMA, { input: "shout" }).ok).toBe(false);
  });
  test("options fit the input kind", () => {
    expect(verdict(SURFACE_SCHEMA, { input: "select", options: [two[0]] }).ok).toBe(false);
    expect(verdict(SURFACE_SCHEMA, { input: "select" }).ok).toBe(false);
    expect(verdict(SURFACE_SCHEMA, { input: "multiselect" }).ok).toBe(false);
    expect(verdict(SURFACE_SCHEMA, { input: "confirm", options: two }).ok).toBe(false);
    expect(verdict(SURFACE_SCHEMA, { input: "text", options: two }).ok).toBe(false);
  });
  test("consequence and resolves have limits and no markup", () => {
    const with_ = (consequence: string) => [{ ...two[0], consequence }, two[1]];
    expect(verdict(SURFACE_SCHEMA, { options: with_("The step is marked done.") }).ok).toBe(true);
    expect(verdict(SURFACE_SCHEMA, { options: with_("x".repeat(200)) }).ok).toBe(true);
    expect(verdict(SURFACE_SCHEMA, { options: with_("x".repeat(201)) }).ok).toBe(false);
    expect(verdict(SURFACE_SCHEMA, { options: with_("<b>bold</b>") }).ok).toBe(false);
    expect(verdict(SURFACE_SCHEMA, { options: two, resolves: "step:handoff_0a49" }).ok).toBe(true);
    expect(verdict(SURFACE_SCHEMA, { options: two, resolves: "" }).ok).toBe(false);
    expect(verdict(SURFACE_SCHEMA, { options: two, resolves: "x".repeat(129) }).ok).toBe(false);
    expect(verdict(SURFACE_SCHEMA, { options: two, extra: 1 }).ok).toBe(false);
  });
  test("a /2 document is still read, and its ask is a select; the new fields need /3", () => {
    expect(verdict(SURFACE_SCHEMA_PREVIOUS, { options: two }).ok).toBe(true);
    expect(verdict(SURFACE_SCHEMA_PREVIOUS, { options: [two[0]] }).ok).toBe(false);
    expect(verdict(SURFACE_SCHEMA_PREVIOUS, { input: "confirm" }).ok).toBe(false);
    expect(verdict(SURFACE_SCHEMA_PREVIOUS, { options: two, resolves: "step:x" }).ok).toBe(false);
    expect(verdict("horizon.surface/1", { options: two }).ok).toBe(false);
  });
  test("the panel mapping gives the screen what it needs for each kind", () => {
    const q = (raw: Record<string, unknown>) => itemOf({ type: "ask", id: "q1", question: "Ship it?", why_needed: "w", ...raw }, 0);
    expect(q({ options: two })).toMatchObject({ kind: "question", input: "select", resolves: null, withdrawn: null });
    expect(q({ input: "multiselect", options: [{ ...two[0], consequence: "Both go" }, two[1]], resolves: "step:a" })).toMatchObject({ input: "multiselect", resolves: "step:a", options: [{ consequence: "Both go" }, { consequence: null }] });
    expect(q({ input: "confirm", options: two })).toMatchObject({ input: "confirm", options: [] });
    expect(q({ input: "text" })).toMatchObject({ input: "text", options: [] });
    expect(q({ input: "select" })).toMatchObject({ kind: "unavailable" });
    expect(q({ input: "nonsense" })).toMatchObject({ kind: "unavailable" });
  });
});
