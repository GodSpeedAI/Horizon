import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { fakeCaseKeeper, type FakeKeeper } from "./support/fake-case-keeper.ts";

let keeper: FakeKeeper;
let app: DeskApp;
const cases = [
  { case_id: "c_triage", case_state: "active", summary: "Execute plan drafts/a.json", created_at: "2026-11-07T06:00:00Z" },
  { case_id: "c_release", case_state: "active", summary: "Execute plan drafts/b.json", created_at: "2026-11-07T07:00:00Z" },
  { case_id: "c_plain", case_state: "active", summary: "Execute plan drafts/c.json", created_at: "2026-11-07T08:00:00Z" },
];
const templateOf: Record<string, string | null> = { c_triage: "seed-triage@0.1.0", c_release: "release_check@1.0.0", c_plain: null };
let entryCalls = 0;

beforeAll(async () => {
  keeper = fakeCaseKeeper((r) => {
    switch (r.verb) {
      case "authority_approvals":
        return { json: { ok: true, approvals: [] } };
      case "approval_list":
        return { json: { approvals: [] } };
      case "case_list":
        return { json: { cases, unreadable: [] } };
      case "case_get_overview":
        return { json: { case_id: r.case_id, case_state: "active", summary: "x", created_at: "t", item_count: 0, stages: [], run_ids: [], settlements: [], ...(templateOf[String(r.case_id)] ? { template_ref: templateOf[String(r.case_id)] } : {}), digest: { ref: `case:${r.case_id}`, expected_digest: "sha256:o" } } };
      case "case_entry_options":
        entryCalls += 1;
        // Only the triage template has a description; the other falls back to its name.
        return { json: { templates: [{ template_ref: "seed-triage@0.1.0", description: "Sort the new bug reports" }, { template_ref: "release_check@1.0.0" }] } };
      case "case_get_horizon":
        return { json: { case_id: r.case_id, case_state: "active", items: [] } };
      default:
        return { json: { ok: false, error_class: "unscripted_verb" } };
    }
  });
  app = await startDeskApp({ approvals: { socketPath: keeper.socketPath, service: { actor_id: "cognate-service", role: "service" }, operator: { actor_id: "actor:operator", role: "operator" }, timeoutMs: 1_500 } });
});
afterAll(async () => {
  await app.stop();
  keeper.stop();
});

describe("case titles", () => {
  test("cases from different templates have different titles", async () => {
    const state = await app.state();
    const titles = Object.fromEntries(state.cases.map((c: any) => [c.case_ref, c.purpose]));
    expect(titles["case:c_triage"]).toBe("Sort the new bug reports");
    expect(titles["case:c_release"]).toBe("Release check");
    expect(titles["case:c_plain"]).toBe("Case started 2026-11-07");
    expect(new Set(Object.values(titles)).size).toBe(3);
    // Read once per template, not once per refresh.
    await app.state();
    await app.get("/desk/work.json");
    expect(entryCalls).toBe(1);
    const work = await app.get("/desk/work.json");
    expect(work.items.map((i: any) => i.title).sort()).toEqual(["Case started 2026-11-07", "Release check", "Sort the new bug reports"]);
  });
});
