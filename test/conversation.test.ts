/**
 * The desk conversation (stage 8, steps 1 and 2): the pure reducer, the stored rows written by each desk operation, Presenting on
 * read, discard, the newest 200, and the agent caller that may suggest but never confirm.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { appendRow, listConversation } from "../src/capabilities/conversation.ts";
import { setPresenting } from "../src/capabilities/workspace-records.ts";
import { AGENT_NOTE_WORDS, AGENT_REFUSAL_WORDS } from "../src/app.ts";
import { CONVERSATION_WINDOW, cleanAgentName, reduceConversation, windowOf, type ConversationRow } from "../src/ui/desk/conversation-model.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { fakeCaseKeeper, type FakeKeeper } from "./support/fake-case-keeper.ts";

const row = (n: number, patch: Partial<ConversationRow> = {}): ConversationRow => ({ row_id: `row:${String(n).padStart(6, "0")}:x`, at: new Date(Date.UTC(2026, 10, 7, 0, 0, n)).toISOString(), source: "you", kind: "note", words: `w${n}`, outcome: "", status: "done", refs: {}, ...patch });

describe("the conversation reducer", () => {
  test("append adds a row; update changes status and outcome by row_id; an unknown id changes nothing", () => {
    const a = reduceConversation([], { type: "append", row: row(1, { status: "waiting", kind: "handoff-proposal", source: "page-agent" }) });
    expect(a).toHaveLength(1);
    const b = reduceConversation(a, { type: "update", row_id: a[0]!.row_id, status: "done", outcome: "Handed off." });
    expect(b[0]).toMatchObject({ status: "done", outcome: "Handed off." });
    expect(reduceConversation(b, { type: "update", row_id: "nope", status: "refused" })).toEqual(b);
  });
  test("a panel row updates in place and adds no second row", () => {
    const first = reduceConversation([], { type: "append", row: row(1, { kind: "panel", status: "waiting", words: "Plan", refs: { panel_id: "p1" } }) });
    const next = reduceConversation(first, { type: "append", row: row(2, { kind: "panel", status: "done", words: "Plan v2", refs: { panel_id: "p1" } }) });
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ row_id: first[0]!.row_id, words: "Plan v2", status: "done" });
  });
  test("the window keeps the newest 200, oldest first", () => {
    const rows = Array.from({ length: 250 }, (_, i) => row(i));
    const w = windowOf([...rows].reverse());
    expect(w).toHaveLength(CONVERSATION_WINDOW);
    expect(w[0]!.words).toBe("w50");
    expect(w[199]!.words).toBe("w249");
  });
  test("an agent name is plain text of at most 60 characters", () => {
    expect(cleanAgentName("<b>Bot</b>\n")).toBe("bBot/b");
    expect(cleanAgentName("x".repeat(100))).toHaveLength(60);
    expect(cleanAgentName("   ")).toBeUndefined();
  });
});

describe("stored rows", () => {
  test("newest 200 on read, private to the person", async () => {
    const store = createMemoryStore();
    const me = { tenant: "t", operator: "o" };
    for (let i = 0; i < 205; i += 1) await appendRow(store, me, { source: "you", kind: "note", words: `n${i}`, outcome: "", status: "done" }, new Date(Date.UTC(2026, 10, 7, 0, 0, i)));
    const rows = await listConversation(store, me);
    expect(rows).toHaveLength(200);
    expect(rows[0]!.words).toBe("n5");
    expect(await listConversation(store, { tenant: "t", operator: "other" })).toHaveLength(0);
  });
});

const CASE = "case_20261107T061312Z_820737";
let keeper: FakeKeeper;
let app: DeskApp;
let plan: string[] = [];
const replies = new Map<string, unknown>();
const digestOf = (ids: string[]): string => `sha256:${ids.join(",")}`;
const resulting = (id: string): string[] => (plan.includes(id) ? plan : [...plan, id]);
const proposerOf = (r: Record<string, unknown>): string => String((r.on_behalf_of as { actor_id?: string } | undefined)?.actor_id ?? (r.actor as { actor_id?: string } | undefined)?.actor_id ?? "");
const planDigest = (r: Record<string, unknown>, id: string): string => digestOf([...resulting(id), `proposed_by:${proposerOf(r)}`]);
const AGENT = { "x-horizon-source": "page-agent", "x-horizon-agent-name": "Helper" };

beforeAll(async () => {
  keeper = fakeCaseKeeper((r) => {
    switch (r.verb) {
      case "authority_approvals":
        return { json: { ok: true, approvals: [] } };
      case "approval_list":
        return { json: { approvals: [] } };
      case "case_list":
        return { json: { cases: [{ case_id: CASE, case_state: "active", summary: "Ship the checkout fix", created_at: "2026-11-07T06:13:12.793Z" }], unreadable: [] } };
      case "case_add_item": {
        const item = r.item as { plan_item_id: string };
        if (r.dry_run === true) return { json: { ok: true, dry_run: true, outcome: "would_add", case_id: r.case_id, plan_item_id: item.plan_item_id, proposed_by: "operator_local", item, plan_precondition: { ref: `plan:${CASE}`, expected_digest: planDigest(r, item.plan_item_id) } } };
        const requestId = String(r.request_id);
        if (replies.has(requestId)) return { json: replies.get(requestId) };
        const pre = (r.preconditions as { records: { expected_digest: string }[] } | undefined)?.records[0];
        if (pre === undefined || pre.expected_digest !== planDigest(r, item.plan_item_id)) {
          const stale = { outcome: "rejected_as_stale", code: "precondition_failed", changed_records: [{ ref: `plan:${CASE}`, expected_digest: pre?.expected_digest ?? "", current_digest: planDigest(r, item.plan_item_id) }] };
          replies.set(requestId, stale);
          return { json: stale };
        }
        plan = resulting(item.plan_item_id);
        const reply = { ok: true, case_id: r.case_id, plan_item_id: item.plan_item_id, proposed_by: "operator_local" };
        replies.set(requestId, reply);
        return { json: reply };
      }
      case "case_advance":
        return { json: { ok: true } };
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

const rows = async (): Promise<ConversationRow[]> => (await app.get("/desk/conversation")).rows;
const draftId = async (): Promise<string> => (await app.get("/desk/draft")).draftId;
const asAgent = (path: string, body: unknown): Promise<Response> => fetch(`${app.base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...AGENT }, body: JSON.stringify(body) });
const post = async (path: string, body: unknown) => {
  const r = await app.post(path, body);
  return { status: r.status, body: (await r.json()) as Record<string, any> };
};

describe("rows from each desk operation", () => {
  test("a note, a find and a hand off leave rows with the right source, kind and status", async () => {
    const before = (await rows()).length;
    expect((await app.post("/desk/note", { body: "Check the checkout wording" })).status).toBe(200);
    await fetch(`${app.base}/desk/search?q=checkout&record=1`);
    await fetch(`${app.base}/desk/search?q=typing`); // find as you type is not recorded
    const id = await draftId();
    const p = await post("/desk/handoff/preview", { draft_id: id, text: "Fix the checkout total" });
    expect(p.status).toBe(200);
    let now = await rows();
    expect(now.slice(before).map((r) => [r.kind, r.source, r.status])).toEqual([["note", "you", "done"], ["find", "you", "done"], ["handoff", "you", "waiting"]]);
    expect(now.at(-1)!.refs).toMatchObject({ draft_id: id, case_id: CASE });
    // Previewing the same draft again changes the same row.
    await post("/desk/handoff/preview", { draft_id: id, text: "Fix the checkout total" });
    expect((await rows()).length).toBe(now.length);
    const sent = await post("/desk/handoff", { draft_id: id, text: "Fix the checkout total", plan_precondition: p.body.preview.plan_precondition });
    expect(sent.status).toBe(200);
    now = await rows();
    expect(now.length).toBe(before + 3);
    expect(now.at(-1)).toMatchObject({ kind: "handoff", status: "done", source: "you" });
    expect(now.at(-1)!.outcome).toContain("Handed off");
    expect(JSON.stringify(now)).not.toContain("Error");
  });

  test("a refused hand off turns its row refused with plain words", async () => {
    const id = await draftId();
    await post("/desk/handoff/preview", { draft_id: id, text: "Another step" });
    const stale = await post("/desk/handoff", { draft_id: id, text: "Another step", plan_precondition: { ref: "plan:x", expected_digest: "sha256:old" } });
    expect(stale.status).toBe(409);
    expect((await rows()).at(-1)).toMatchObject({ status: "refused", kind: "handoff" });
    expect((await rows()).at(-1)!.outcome).toContain("Preview out of date");
  });

  test("a refused note appends a refused row", async () => {
    const r = await app.post("/desk/note", { body: "   " });
    expect(r.status).toBe(400);
    expect((await rows()).at(-1)).toMatchObject({ kind: "note", status: "refused", source: "you" });
  });

  test("a panel put by an agent is a panel row that updates in place; a human answer is an answer row", async () => {
    const op = { tool: "ask_human", panel: "plan", ask: { id: "a1", question: "Which one?", why_needed: "To pick", options: [{ option_id: "x", label: "X" }, { option_id: "y", label: "Y" }] } } as const;
    await app.application.applyAgentOp({ tool: "show_surface", surface: { id: "plan", title: "The plan", blocks: [] } });
    await app.application.applyAgentOp({ tool: "show_surface", surface: { id: "plan", title: "The plan v2", blocks: [] } });
    await app.application.applyAgentOp(op as never);
    const panels = (await rows()).filter((r) => r.kind === "panel");
    expect(panels).toHaveLength(1);
    expect(panels[0]).toMatchObject({ source: "agent", refs: { panel_id: "plan" } });
    expect(panels[0]!.words).toBe("The plan v2");
    expect(panels[0]!.status).toBe("waiting");
    const answered = await post("/desk/panels/op", { op: "human.answer", panel: "plan", ask: "a1", outcome: "answered", value: "x" });
    expect(answered.status).toBe(200);
    expect((await rows()).at(-1)).toMatchObject({ kind: "answer", source: "you", words: "You answered: x", status: "waiting", refs: { panel_id: "plan", ask_id: "a1" } });
    const short = await app.application.applyAgentOp({ tool: "answer.route", panel_id: "plan", ask_id: "a1", routed_as: "no" });
    expect(short.ok).toBe(false);
    const routed = await app.application.applyAgentOp({ tool: "answer.route", panel_id: "plan", ask_id: "a1", routed_as: "step handoff_0a49 in Seed: triage inbox" });
    expect(routed.ok).toBe(true);
    expect((await rows()).at(-1)).toMatchObject({ kind: "answer", source: "agent", outcome: "The agent took it to: step handoff_0a49 in Seed: triage inbox" });
  });
});

describe("the agent caller", () => {
  test("it may read, find and preview; the preview is a waiting proposal from the page agent", async () => {
    expect((await fetch(`${app.base}/desk/conversation`, { headers: AGENT })).status).toBe(200);
    expect((await fetch(`${app.base}/desk/state.json`, { headers: AGENT })).status).toBe(200);
    await fetch(`${app.base}/desk/search?q=checkout`, { headers: AGENT });
    const id = await draftId();
    const r = await asAgent("/desk/handoff/preview", { draft_id: id, text: "Agent suggested step" });
    expect(r.status).toBe(200);
    const all = await rows();
    expect(all.at(-1)).toMatchObject({ kind: "handoff-proposal", source: "page-agent", agent_name: "Helper", status: "waiting" });
    expect(all.at(-2)).toMatchObject({ kind: "find", source: "page-agent", agent_name: "Helper" });
  });

  test("it cannot send, decide, save a note, discard, answer or do any human panel op, and nothing is appended", async () => {
    const before = (await rows()).length;
    const sends: [string, unknown][] = [
      ["/desk/handoff", { draft_id: "d", text: "x", plan_precondition: { ref: "r", expected_digest: "d" } }],
      ["/desk/decide", { card_id: "c", choice: "accept" }],
      ["/desk/conversation/discard", { row_id: (await rows()).at(-1)!.row_id }],
      ["/desk/panels/op", { op: "human.answer", panel: "plan", ask: "a1", outcome: "answered", value: "x" }],
      ["/desk/panels/op", { op: "human.pin", id: "plan", pinned: true }],
      ["/desk/start", {}],
      ["/desk/lesson", { text: "x" }],
    ];
    for (const [path, body] of sends) {
      const r = await asAgent(path, body);
      expect(r.status).toBe(403);
      expect(((await r.json()) as { message: string }).message).toBe(AGENT_REFUSAL_WORDS);
    }
    const note = await asAgent("/desk/note", { body: "a note" });
    expect(note.status).toBe(403);
    expect(((await note.json()) as { message: string }).message).toBe(AGENT_NOTE_WORDS);
    expect(AGENT_NOTE_WORDS).toBe("An agent can suggest a note; you save it.");
    expect((await rows()).length).toBe(before);
    expect((await rows()).at(-1)!.status).toBe("waiting");
  });

  test("the person confirms an agent proposal and the same row turns done; discard turns a waiting one off", async () => {
    const proposal = (await rows()).at(-1)!;
    const id = proposal.refs.draft_id!;
    const p = await post("/desk/handoff/preview", { draft_id: id, text: "Agent suggested step" });
    expect((await rows()).filter((r) => r.kind === "handoff-proposal" || (r.refs.draft_id === id && r.status === "waiting"))).toHaveLength(1); // the person's own preview of the same draft settles the same row
    const sent = await post("/desk/handoff", { draft_id: id, text: "Agent suggested step", plan_precondition: p.body.preview.plan_precondition });
    expect(sent.status).toBe(200);
    const done = (await rows()).find((r) => r.row_id === proposal.row_id)!;
    expect(done).toMatchObject({ status: "done", source: "page-agent", kind: "handoff-proposal" });

    const next = await asAgent("/desk/handoff/preview", { draft_id: await draftId(), text: "Second suggestion" });
    expect(next.status).toBe(200);
    const waiting = (await rows()).at(-1)!;
    const gone = await post("/desk/conversation/discard", { row_id: waiting.row_id });
    expect(gone.status).toBe(200);
    expect((await rows()).find((r) => r.row_id === waiting.row_id)).toMatchObject({ status: "refused", outcome: "Discarded by you. Nothing was sent." });
    expect((await post("/desk/conversation/discard", { row_id: waiting.row_id })).status).toBe(409);
    expect((await post("/desk/conversation/discard", { row_id: "row:none" })).status).toBe(404);
    expect((await post("/desk/conversation/discard", {})).status).toBe(400);
  });
});

describe("Presenting on read", () => {
  test("words get stand-ins for repository names only while Presenting is on", async () => {
    const own = await startDeskApp({ repoPath: "/home/x/projects/acme-secret-repo" });
    try {
      const store = own.application.runtime.runtime.store;
      const { tenant, actor } = own.application.caller;
      await appendRow(store, { tenant, operator: actor.id }, { source: "you", kind: "note", words: "Look at acme-secret-repo today", outcome: "", status: "done" }, new Date("2026-11-06T10:00:00Z"));
      const read = async (): Promise<string> => JSON.stringify((await own.get("/desk/conversation")).rows);
      expect(await read()).toContain("acme-secret-repo");
      await setPresenting(store, { tenant, operator: actor.id, on: true });
      const shown = await read();
      expect(shown).not.toContain("acme-secret-repo");
      expect(shown).toContain("Look at");
      // The stored words are untouched: turning Presenting off shows them again.
      await setPresenting(store, { tenant, operator: actor.id, on: false });
      expect(await read()).toContain("acme-secret-repo");
    } finally {
      await own.stop();
    }
  });
});
