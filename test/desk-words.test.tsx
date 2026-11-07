/** @jsxImportSource react */
/**
 * No product names and no internal terms on screen (design sections 1 and 2). Every view is drawn with realistic data, including the
 * text the parts themselves send, and the visible words are scanned. The setup guide (Settings, runbook) is the one place that may
 * name programs and settings, so it is not drawn here.
 */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { economicsModel } from "../src/economics/model.ts";
import { onboardingOf } from "../src/ui/workspace/model.ts";
import { START, deskReducer, type UiState } from "../src/ui/desk/attention.ts";
import { buildDecide } from "../src/ui/desk/decide-build.ts";
import { HandoffPreviewCard } from "../src/ui/desk/Composer.tsx";
import { Desk } from "../src/ui/desk/Desk.tsx";
import type { DeskState, InspectionAnswer, NextState, SearchResult } from "../src/ui/desk/model.ts";
import { orderWork, sessionItems, caseItems, type WorkData } from "../src/ui/desk/work-build.ts";
import { deskState } from "./support/desk-fixture.ts";
import { quietIo } from "./support/desk-io.ts";
import { residual, sampleLedger } from "./support/economics-fixture.ts";

const BANNED: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: "SEA-Forge", pattern: /SEA-Forge/i },
  { name: "RealityTrace", pattern: /RealityTrace/i },
  { name: "Cognate", pattern: /Cognate/i },
  { name: "SFWP", pattern: /\bSFWP\b/i },
  { name: "ledger", pattern: /\bledgers?\b/i },
  { name: "digest", pattern: /\bdigests?\b/i },
  { name: "tenant", pattern: /\btenants?\b/i },
  { name: "witness", pattern: /\bwitness(es)?\b/i },
  { name: "governed", pattern: /\bgoverned\b/i },
  { name: "commit (as a noun)", pattern: /\bcommits?\b/i },
  { name: "environment variable", pattern: /[A-Z_]{6,}=?/ },
  { name: "a path under /tmp", pattern: /\/tmp\b/ },
];

const text = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const draw = (ui: UiState): string => renderToStaticMarkup(<Desk ui={ui} dispatch={() => undefined} io={quietIo()} nowMs={Date.parse("2026-11-07T12:00:00Z")} />);
function scan(name: string, html: string): void {
  const visible = text(html);
  const hits = BANNED.flatMap((b) => (b.pattern.test(visible) ? [`${b.name}: ${/.{0,30}/.source && (b.pattern.exec(visible)?.[0] ?? "")}`] : []));
  expect({ view: name, hits }).toEqual({ view: name, hits: [] });
}

const move = (over: Record<string, unknown> = {}) => ({
  intent_id: "intent-1", operation_ref: "horizon.health", at: "2026-11-07T09:00:00Z",
  decided: { state: "allowed", text: "Horizon policy only: SEA-Forge is off." },
  recorded: { state: "recorded", text: "Recorded by Horizon, as an intent." },
  observed: { state: "unavailable", text: "Unavailable: RealityTrace is off.", raw: "RealityTrace is not configured; ledger unavailable" },
  settlement: { state: "none", text: "No expected outcome is named, so SEA-Forge can rule on the evidence but has no outcome to settle." },
  approval_id: "approval:1", approval_identity: { state: "verified", approvalId: "approval:1" }, observable: true, settleable: true, ...over,
});

const steps = onboardingOf({ governed: false, realitytrace: false, caseOpen: false, committed: false, skipped: false });
const home = { onboarding: { ...steps, steps: [...steps.steps] }, caseError: "empty", moves: [move() as never], receipt: { intent_id: "intent-1", found: true, move: move() as never }, assurance: "unisolated-development" };

const row = { approval_id: "ap1", case_id: "case_1", plan_item_id: "step_a", requested_at: "2026-11-07T10:00:00Z", expires_at: "2099-11-09T10:00:00Z", expired: false, digest: { ref: "approval:ap1", expected_digest: "sha256:aa" } };
const decide = buildDecide({
  inbox: { state: "unreachable", message: "SEA-Forge did not answer in time" },
  moves: [move() as never],
  caseApprovals: { kind: "notice", words: "The case keeper did not answer." },
  holds: new Map([["case-task:held", { reason: "write the test", at: "2026-11-07T11:00:00Z" }]]),
  humanSteps: [{ case_id: "case_1", case_title: "Case started 2026-11-07", plan_item_id: "s1", name: "operator sign-off", last_event_at: null, digest: { ref: "case:case_1", expected_digest: "sha256:o" } }],
  extraNotices: ["Steps waiting for you cannot be listed. SEA-Forge hung up."],
});
const caseDecide = buildDecide({ inbox: { state: "not_configured" }, moves: [], caseApprovals: { kind: "listed", approvals: [row, { ...row, approval_id: "held" }], unreadable: "ledger unreadable" }, holds: new Map([["case-task:held", { reason: "write the test", at: "2026-11-07T11:00:00Z" }]]) });

const next: NextState = {
  state: "ready", state_message: "", focus: "obj:strategy:alpha",
  choices: [{ operation_ref: "horizon.health", label: "Check health", status: "available", available: true, primary: true, reason: null, next_step: null, action_id: "a1", review: { reversibility: "reversible", payment: "none", expected_evidence: [], escalation: "the case keeper decides" } }],
  blocked: [{ operation_ref: "x", label: "Apply the change", status: "blocked", reason: "A check has not passed.", next_step: "Run the check", gates: [{ gate: "evidence", verdict: "unmet", reason: "nothing recorded", prerequisite_ref: null }] }],
};

const model = economicsModel(sampleLedger(), [residual("r1", "observed_undeclared")]);
const session = { kind: "agent" as const, runtime: "claude", session_id: "s-bad", first_ts: "2026-11-07T08:00:00Z", last_ts: "2026-11-07T08:30:00Z", events: 4, checks: 2, failed: 1, outcome: "contradicted" as const, event_id: "e1", record_seq: 1, label: null };
const work = (cost: WorkData["cost"]): WorkData => ({
  compare: { presenting: false, selection: { source: "personal", repo: "R1", day: "2026-11-07", session: null, only: null }, sources: ["personal"], repos: [{ repo_id: "R1", path: "/work/alpha" }, { repo_id: "T1", path: "/tmp/test-repo", temporary: true }], lastDay: "2026-11-02", sessions: [session], view: null, label: null, notice: "No sessions are recorded on this day. Last recorded session: 2026-11-02.", labelError: null },
  items: orderWork([...sessionItems([session]), ...caseItems([{ case_id: "c1", case_state: "active", summary: "Execute plan drafts/x.json", created_at: "2026-11-07T06:00:00Z", closed_at: null }])]),
  cases: { connected: true, words: "1 case.", items: [{ case_id: "c1", case_state: "active", summary: "Execute plan drafts/x.json", created_at: "2026-11-07T06:00:00Z", closed_at: null }], unreadable: 0 },
  cost,
});

const base = (over: Partial<DeskState> = {}): DeskState => deskState({ decide, home: home as never, ...over });
const answer: InspectionAnswer = {
  operations: ["why"],
  debugger: { operation: "why", question: "Why is it this way?", status: "ok", code: null, message: null, values: [{ key: "reason", value: "set by the plan", class: "recorded", source: "plan", missing_source: null }], unknown_remainder: [], authority: false, settles: false, compared_checkpoint: null },
  retrieval: null,
};

describe("no product names and no internal terms on screen", () => {
  test("Today, with first-run steps, a receipt, recent moves and the approval warning", () => {
    scan("today", draw({ ...START, data: base({ cases: [{ case_ref: "case:c1", purpose: "Case started 2026-11-07", opened_at: "2026-11-07T06:00:00Z", source: "case keeper", state: "Running" }] }) }));
    scan("today, no first-run", draw({ ...START, data: base({ home: { ...home, onboarding: { visible: false, skipped: true, steps: [] }, assurance: "unknown" } as never }) }));
  });

  test("Explore, with results", () => {
    const results: SearchResult = { q: "", day: null, tag: null, notes: [], cases: [{ case_ref: "case:c1", purpose: "Case started 2026-11-07", opened_at: "2026-11-07T06:00:00Z" }], days: [{ day: "2026-11-07", count: 1 }], tags: [], records: { name: "Records", connected: false, words: "Records not connected — sessions from other AI coding tools not shown", href: null } };
    scan("explore", draw(deskReducer({ ...START, view: "explore", data: base() }, { type: "results", results })));
    scan("explore, nothing yet", draw({ ...START, view: "explore", data: base() }));
  });

  test("Decide, with every kind of card, a hold, notices and the next decision", () => {
    scan("decide", draw({ ...START, view: "decide", data: base(), next }));
    scan("decide, case approvals and holds", draw({ ...START, view: "decide", data: base({ decide: caseDecide }), next: null }));
    const open = deskReducer({ ...START, view: "decide", data: base() }, { type: "preview-open", cardId: decide.cards[0]!.id, choice: "accept" });
    scan("decide, preview open", draw(open));
    scan("decide, nothing waiting", draw({ ...START, view: "decide", data: base({ decide: { notices: [], cards: [] } }) }));
  });

  test("Work, in every cost state and with the repository picker", () => {
    const states: WorkData["cost"][] = [
      { readout: { state: "not_configured" }, knowledge: { kind: "unknown", why: "Cases are not connected." } },
      { readout: { state: "unavailable", message: "the record keeper failed (exit 2)" }, knowledge: { kind: "unknown", why: "x" } },
      { readout: { state: "empty", repos: [], skipped: { without_agent_activity: 1, missing_folder: 1 } }, knowledge: { kind: "unknown", why: "x" } },
      { readout: { state: "ok", repos: [{ repo_id: "R1", path: "/work/alpha", model, error: null }], skipped: { without_agent_activity: 0, missing_folder: 0 } }, knowledge: { kind: "known", completed: [] } },
    ];
    for (const [i, cost] of states.entries()) scan(`work ${i}`, draw({ ...START, view: "work", data: base(), work: work(cost) }));
  });

  test("Hand off, in every state of the composer and its preview", () => {
    const keeperCase = { case_ref: "case:c1", purpose: "Case started 2026-11-07", opened_at: "2026-11-07T06:00:00Z", source: "case keeper" as const, state: "Running" };
    scan("hand off, no case", draw({ ...START, data: base(), composer: { ...START.composer, mode: "handoff" } }));
    scan("hand off, typed", draw({ ...START, data: base({ cases: [keeperCase, { ...keeperCase, case_ref: "case:c2", purpose: "Ship the fix" }] }), composer: { ...START.composer, mode: "handoff", text: "Fix the checkout total" } }));
    const pv = { draft_id: "d", case_id: "c1", case_title: "Case started 2026-11-07", step_name: "Fix the checkout total", step_id: "s", check: "The case keeper checked this step against the case and it fits.", plan_precondition: { ref: "plan:c1", expected_digest: "sha256:1" }, agent: { offered: true, words: "An agent can take this step." } };
    const card = (over: Partial<Parameters<typeof HandoffPreviewCard>[0]> = {}) => renderToStaticMarkup(<HandoffPreviewCard pv={pv} assign={false} outOfDate={false} busy={false} onAssign={() => undefined} onCancel={() => undefined} onConfirm={() => undefined} onRefresh={() => undefined} {...over} />);
    scan("hand off preview", card());
    scan("hand off preview, out of date", card({ outOfDate: true }));
    const notConnected = { ...pv, agent: { offered: false, words: "Agent work: Not connected. There is no access key yet. Make one in the workshop settings." } };
    scan("hand off preview, agent work not connected", card({ pv: notConnected }));
    expect(text(card({ pv: notConnected }))).toContain("Not connected");
    expect(card({ pv: notConnected })).not.toContain("checkbox");
  });

  test("Panels from agents, with questions, notes, a pinned panel and a wait", () => {
    const panels = {
      max: 8,
      waiting: [{ step: "signoff_release", panel: "release" }],
      open: [
        { id: "release", title: "Release check", step: "signoff_release", pinned: true, notes: [{ text: "Checked the build.", tone: "success" as const }], blocks: [{ kind: "text" as const, id: "c", tone: "warning" as const, label: null, text: "Two checks are still running." }, { kind: "text" as const, id: "m", tone: "neutral" as const, label: "Checks passed", text: "8 of 10" }, { kind: "rows" as const, id: "t", columns: ["Check", "Result"], rows: [["build", "passed"]] }, { kind: "question" as const, id: "q1", question: "Ship it?", why_needed: "The release is waiting.", options: [{ option_id: "yes", label: "Yes" }, { option_id: "no", label: "No" }], answered: null }, { kind: "question" as const, id: "q2", question: "Tell QA?", why_needed: "", options: [{ option_id: "yes", label: "Yes" }, { option_id: "no", label: "No" }], answered: { outcome: "answered", value: "yes", note: null } }, { kind: "unavailable" as const, id: "u" }] },
        { id: "empty", title: "Opened by you", step: null, pinned: false, notes: [], blocks: [] },
      ],
    };
    scan("panels", draw({ ...START, view: "decide", data: base({ panels }) }));
  });

  test("Work, with steps waiting to start", () => {
    const w = work({ readout: { state: "not_configured" }, knowledge: { kind: "unknown", why: "x" } });
    const withWaiting: WorkData = { ...w, cases: { ...w.cases, items: [{ ...w.cases.items[0]!, title: "Sort the new bug reports", waiting: [{ plan_item_id: "s1", name: "Check the rollback note" }] }] } };
    const html = draw({ ...START, view: "work", data: base(), work: withWaiting });
    scan("work, waiting to start", html);
    expect(text(html)).toContain("Waiting to start (1)");
    expect(text(html)).toContain("Sort the new bug reports");
  });

  test("the Inspector, the keys list and the quick menu", () => {
    scan("inspector, asked", draw({ ...START, data: base(), selection: "case:c1", inspection: { operation: "why", query: "", busy: false, answer, problem: null } }));
    scan("inspector, failed", draw({ ...START, data: base(), inspection: { operation: "why", query: "", busy: false, answer: null, problem: "Horizon did not answer, so nothing is shown." } }));
    scan("keys", draw(deskReducer({ ...START, data: base() }, { type: "open-layer", kind: "keys" })));
    scan("quick menu", draw(deskReducer({ ...START, data: base() }, { type: "open-layer", kind: "quick" })));
  });

  test("the scan itself bites: each banned word is caught", () => {
    for (const bad of ["SEA-Forge is off", "RealityTrace", "Cognate", "SFWP", "the ledger", "a digest", "tenant", "witness", "governed move", "a commit", "HORIZON_ECONOMICS_DATA_HOME=", "see /tmp/x"]) {
      expect(() => scan("probe", `<p>${bad}</p>`)).toThrow();
    }
    expect(() => scan("probe", "<p>Waiting for the case keeper. Nothing to do.</p>")).not.toThrow();
  });
});
