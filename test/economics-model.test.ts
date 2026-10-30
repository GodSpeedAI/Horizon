// HC-06 / INV-13: the economics model is a pure arrangement of RealityTrace rows; every figure equals the audited data.
import { describe, expect, test } from "bun:test";
import { economicsModel, journeyOf, zeroTotals, addTotals, type CaseModel } from "../src/economics/model.ts";
import { agentEvent, observation, questionDeclared, residual, sampleLedger, tok } from "./support/economics-fixture.ts";

const alpha = (m: ReturnType<typeof economicsModel>): CaseModel => m.cases.find((c) => c.case_id === "case:alpha")!;

describe("economicsModel", () => {
  const model = economicsModel(sampleLedger(), []);

  test("observed cost is native tokens by bucket, counted once per event_id", () => {
    const s1 = alpha(model).sessions.find((s) => s.native_session_id === "s1")!;
    // a-u1 is repeated at ordinal 50: counted once.
    expect(s1.totals.observed).toEqual({ input: 3000, output: 300, cache_read: 12000, cache_write: 300, total: 15600 });
    expect(model.audit.duplicate_rows).toBe(1);
    expect(model.audit.conflicting_rows).toBe(0);
  });

  test("a repeat with different content is reported, the first copy kept", () => {
    const rows = [observation(1, { name: "x", tokens: tok(10, 0) }), observation(2, { name: "x", tokens: tok(99999, 0) })];
    const m = economicsModel(rows, []);
    expect(m.totals.observed.total).toBe(10);
    expect(m.audit.conflicting_rows).toBe(1);
  });

  test("estimated token quality is a separate figure, never relabelled observed", () => {
    const s1 = alpha(model).sessions.find((s) => s.native_session_id === "s1")!;
    expect(s1.totals.observed_estimated.total).toBe(9100);
    expect(s1.totals.observed_estimated.total).toBeLessThan(s1.totals.observed.total);
  });

  test("TE overhead and injection are charged to the session and never added to observed cost", () => {
    const s1 = alpha(model).sessions.find((s) => s.native_session_id === "s1")!;
    expect(s1.totals.te_overhead.total).toBe(150);
    expect(s1.totals.te_injection_attributed).toBe(400);
    expect(s1.totals.observed.total).toBe(15600); // 150 / 400 are not in it
    expect(s1.overhead_pct).toBeCloseTo((150 / 15600) * 100, 10);
    expect(s1.lessons).toEqual([{ event_id: s1.lessons[0]!.event_id, attributed_input_tokens: 400, token_quality: "ESTIMATED", estimate: null, ref: "te-ledger:injected_chars=1600" }]);
  });

  test("other owners (backfill) are shown apart and never in observed", () => {
    const unbound = model.cases.find((c) => c.case_id === null)!;
    expect(unbound.totals.other_owner.total).toBe(9999);
    expect(unbound.totals.observed.total).toBe(137);
  });

  test("unknown or null case is unbound and its usage is its own line", () => {
    expect(model.cases.map((c) => c.case_id)).toEqual(["case:alpha", "case:beta", null]);
    expect(model.unattributed_usage.events).toBe(2);
    expect(model.unattributed_usage.observed.total).toBe(137);
    expect(model.cases.some((c) => c.case_id === "unknown")).toBe(false);
  });

  test("journeys: newest verdict per question; undefined = declared but unobserved; a version suffix is the same question", () => {
    const s1 = alpha(model).sessions.find((s) => s.native_session_id === "s1")!;
    expect(s1.totals.journeys).toEqual({ J01: { match: 1, mismatch: 1, undefined: 0 }, J02: { match: 0, mismatch: 0, undefined: 1 } });
    expect(model.declared_journey_questions).toBe(3);
    expect(journeyOf("journey:J02:capability:1@abcd1234")).toEqual({ base: "journey:J02:capability:1", journey: "J02" });
    expect(journeyOf("agent-activity")).toBeNull();
    const newer = economicsModel(
      [
        questionDeclared(1, "journey:J1:f:1"),
        observation(2, { name: "j-old", kind: "journey_check", exit_code: 1, payload_ref: "journey:journey:J1:f:1", ts: "2026-10-30T10:00:00Z" }),
        observation(3, { name: "j-new", kind: "journey_check", exit_code: 0, payload_ref: "journey:journey:J1:f:1", ts: "2026-10-30T11:00:00Z" }),
      ],
      [],
    );
    expect(newer.totals.journeys).toEqual({ J1: { match: 1, mismatch: 0, undefined: 0 } });
  });

  test("tool failures are counted from tool_fail events", () => {
    const s1 = alpha(model).sessions.find((s) => s.native_session_id === "s1")!;
    expect(s1.totals.tool_fail).toBe(1);
    expect(s1.totals.tool_post).toBe(1);
  });

  test("totals at every level equal the sum of the rows below them and the raw data", () => {
    const fromSessions = zeroTotals();
    for (const c of model.cases) {
      const caseSum = zeroTotals();
      for (const s of c.sessions) addTotals(caseSum, s.totals);
      expect(c.totals).toEqual(caseSum);
      addTotals(fromSessions, c.totals);
    }
    expect(model.totals).toEqual(fromSessions);
    // independent oracle over the raw rows: native tokens of the unique events
    const unique = new Map<string, any>();
    for (const row of sampleLedger() as any[]) {
      const ev = row.payload?.extensions?.agent_event;
      if (ev && !unique.has(ev.event_id)) unique.set(ev.event_id, ev);
    }
    let native = 0;
    let te = 0;
    for (const ev of unique.values()) {
      const t = ev.tokens ? ev.tokens.input + ev.tokens.output + ev.tokens.cache_read + ev.tokens.cache_write : 0;
      if (ev.owner === "native") native += t;
      if (ev.owner === "te") te += t;
    }
    expect(model.totals.observed.total).toBe(native);
    expect(model.totals.te_overhead.total).toBe(te);
    expect(model.totals.events).toBe(unique.size);
    // undefined is counted once per session even though a session may sit under one case only here
    expect(model.totals.journeys.J01!.undefined).toBe(2 /* c9 */ + 2 /* s2 */ + 2 /* s3 */);
  });

  test("a session seen under two cases adds its undefined once, so sums stay exact", () => {
    const rows = [
      questionDeclared(1, "journey:J1:f:1"),
      observation(2, { name: "p", sid: "x", case_id: "case:a", tokens: tok(1, 1) }),
      observation(3, { name: "q", sid: "x", case_id: "case:b", tokens: tok(2, 2) }),
    ];
    const m = economicsModel(rows, []);
    expect(m.totals.journeys.J1!.undefined).toBe(1);
    expect(m.totals.observed.total).toBe(6);
  });

  test("ablation is 'not run' unless events carry an arm", () => {
    expect(economicsModel([observation(1, { name: "n", tokens: tok(1, 1) })], []).ablation).toEqual({ run: false, rows: [] });
    expect(model.ablation).toEqual({ run: true, rows: [{ arm: "T", sessions: 1, observed_total: 350, events: 1 }] });
  });

  test("residuals come from the projection rows, once per residual_id", () => {
    const m = economicsModel([], [residual("r1", "observed_undeclared"), residual("r1", "observed_undeclared"), residual("r2", "declared_contradicted"), { question_id: "not a residual" }]);
    expect(m.residuals.total).toBe(2);
    expect(m.residuals.by_kind).toEqual({ observed_undeclared: 1, declared_unobserved: 0, declared_contradicted: 1, settled_with_debt: 0 });
  });

  test("garbage rows are ignored and an empty store is an empty model", () => {
    const m = economicsModel([null, 7, { record_kind: "observation.recorded", payload: { extensions: { agent_event: { event_id: "x" } } } }, { record_kind: "question.declared" }], [null]);
    expect(m.cases).toEqual([]);
    expect(m.audit.ignored_rows).toBe(1);
    expect(m.totals).toEqual(zeroTotals());
    expect(agentEvent({ name: "z" }).event_id).toHaveLength(64);
  });
});
