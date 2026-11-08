import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { CONVERSATION_WINDOW, TOO_MANY_PROPOSALS, windowOf, type ConversationRow } from "../src/ui/desk/conversation-model.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { fakeCaseKeeper, type FakeKeeper } from "./support/fake-case-keeper.ts";

const row = (n: number, over: Partial<ConversationRow> = {}): ConversationRow => ({ row_id: `row-${String(n).padStart(5, "0")}`, at: new Date(Date.UTC(2026, 10, 1) + n * 1000).toISOString(), source: "you", kind: "note", words: `w${n}`, outcome: "ok", status: "done", refs: {}, ...over });

describe("the window always keeps what is still waiting", () => {
  test("a waiting row older than 250 newer rows is still shown, and the total stays at 200", () => {
    const rows = [row(0, { status: "waiting", kind: "panel", refs: { panel_id: "old" } }), row(1, { status: "waiting", kind: "answer", refs: { panel_id: "old", ask_id: "q" } }), ...Array.from({ length: 250 }, (_, i) => row(i + 2))];
    const w = windowOf([...rows].reverse());
    expect(w).toHaveLength(CONVERSATION_WINDOW);
    expect(w.map((r) => r.words).slice(0, 2)).toEqual(["w0", "w1"]);
    expect(w.at(-1)!.words).toBe("w251");
    expect(w.filter((r) => r.status === "waiting")).toHaveLength(2);
    expect(w.map((r) => r.row_id)).toEqual([...w.map((r) => r.row_id)].sort());
  });

  test("with nothing waiting it is the newest 200; with few rows it is all of them", () => {
    const w = windowOf(Array.from({ length: 250 }, (_, i) => row(i)));
    expect(w).toHaveLength(200);
    expect(w[0]!.words).toBe("w50");
    expect(windowOf([row(1), row(2)])).toHaveLength(2);
  });

  test("more than 200 waiting rows are all kept", () => {
    const w = windowOf(Array.from({ length: 230 }, (_, i) => row(i, { status: "waiting" })));
    expect(w).toHaveLength(230);
  });
});

describe("an agent can leave 20 suggestions waiting on a case", () => {
  const CASE = "case_20261107T061312Z_820737";
  let keeper: FakeKeeper;
  let app: DeskApp;
  beforeAll(async () => {
    keeper = fakeCaseKeeper((r) => {
      if (r.verb === "authority_approvals") return { json: { ok: true, approvals: [] } };
      if (r.verb === "approval_list") return { json: { approvals: [] } };
      if (r.verb === "case_list") return { json: { cases: [{ case_id: CASE, case_state: "active", summary: "Ship the checkout fix", created_at: "2026-11-07T06:13:12.793Z" }], unreadable: [] } };
      if (r.verb === "case_get_horizon") return { json: { case_id: CASE, case_state: "active", items: [] } };
      if (r.verb === "case_add_item") {
        const item = r.item as { plan_item_id: string };
        return { json: { ok: true, dry_run: true, outcome: "would_add", case_id: r.case_id, plan_item_id: item.plan_item_id, proposed_by: "operator_local", item, plan_precondition: { ref: `plan:${CASE}`, expected_digest: "sha256:x" } } };
      }
      return { json: { ok: false, error_class: "unscripted_verb" } };
    });
    app = await startDeskApp({ approvals: { socketPath: keeper.socketPath, service: { actor_id: "cognate-service", role: "service" }, operator: { actor_id: "actor:operator", role: "operator" }, timeoutMs: 1_500 } });
  });
  afterAll(async () => {
    await app.stop();
    keeper.stop();
  });
  const suggest = (draft: string, text: string) => fetch(`${app.base}/desk/handoff/preview`, { method: "POST", headers: { "content-type": "application/json", "x-horizon-source": "page-agent", "x-horizon-agent-name": "Helper" }, body: JSON.stringify({ draft_id: draft, text }) });

  test("the 21st is refused in plain words, an earlier one can be asked about again, and discarding makes room", async () => {
    const drafts: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      const id = randomUUID();
      drafts.push(id);
      expect((await suggest(id, `Suggested step number ${i}`)).status).toBe(200);
    }
    const over = await suggest(randomUUID(), "One suggestion too many");
    expect(over.status).toBe(409);
    expect(((await over.json()) as any).message).toBe(TOO_MANY_PROPOSALS);
    expect(TOO_MANY_PROPOSALS).toBe("This case already has 20 suggestions waiting. Confirm or discard some first.");
    expect((await suggest(drafts[0]!, "Suggested step number 0, reworded")).status).toBe(200);
    const rows = ((await app.get("/desk/conversation")).rows as ConversationRow[]).filter((r) => r.kind === "handoff-proposal" && r.status === "waiting");
    expect(rows).toHaveLength(20);
    expect((await app.post("/desk/conversation/discard", { row_id: rows[0]!.row_id })).status).toBe(200);
    expect((await suggest(randomUUID(), "Now there is room")).status).toBe(200);
  });
});
