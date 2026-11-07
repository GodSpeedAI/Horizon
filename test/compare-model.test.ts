import { describe, expect, test } from "bun:test";
import { compareSession, listSessions, NOT_RECORDED, SCORE_NOT_RECORDED, toDimensions } from "../src/ui/workspace/compare-model.ts";
import { observation, questionDeclared, sampleLedger } from "./support/economics-fixture.ts";

const intact = { intact: true, records: 51, divergence: null };
const row = (view: ReturnType<typeof compareSession>, name: string) => view!.rows.find((r) => r.row === name)!;

describe("comparison model", () => {
  test("matched, contradicted and not recorded sessions give the right rows", () => {
    const ledger = [
      ...sampleLedger(),
      observation(60, { name: "m-j1", sid: "m1", kind: "journey_check", exit_code: 0, payload_ref: "journey:journey:J01:desired_state:1", ts: "2026-10-30T11:00:00Z" }),
      questionDeclared(61, "journey:J03:x:1"),
    ];
    const outcomes = Object.fromEntries(listSessions(ledger).map((s) => [s.session_id, s.outcome]));
    expect(outcomes).toMatchObject({ s1: "contradicted", m1: "matched", c9: "not recorded" });

    const bad = compareSession({ rows: ledger, sessionId: "s1", intact });
    expect(row(bad, "observed").recordShows).toContain("1 of 2 declared checks passed");
    expect(row(bad, "observed").recordShows).toContain("journey:J01:evidence:2");
    expect(row(bad, "observed").agentReports).toContain("tool results reported");
    expect(row(bad, "difference").recordShows).toBe("contradicted");
    expect(row(bad, "record intact").recordShows).toStartWith("yes, checked just now");

    const good = compareSession({ rows: ledger, sessionId: "m1", intact });
    expect(row(good, "difference").recordShows).toBe("matched");

    const none = compareSession({ rows: ledger, sessionId: "c9", intact });
    for (const name of ["observed", "difference"]) {
      expect(row(none, name).recordShows).toBe(NOT_RECORDED);
      expect(row(none, name).reason).toBeTruthy();
    }
    // Every row without data names a reason; nothing is invented.
    for (const name of ["expected", "rules in force", "allowed by", "accepted"]) {
      const r = row(none, name);
      expect([r.agentReports, r.recordShows]).toEqual([NOT_RECORDED, NOT_RECORDED]);
      expect(r.reason).toBeTruthy();
    }
    // The score is scored outside the record; the aggregate event, once written, is shown but never counted as a check.
    expect(row(good, "journey score").recordShows).toBe(SCORE_NOT_RECORDED);
    const scored = [...ledger, observation(70, { name: "m-score", sid: "m1", kind: "journey_check", exit_code: 0, payload_ref: "journey-score:te1", ts: "2026-10-30T12:00:00Z" })];
    const withScore = compareSession({ rows: scored, sessionId: "m1", intact });
    expect(row(withScore, "journey score").recordShows).toBe("all observed declared checks passed");
    expect(withScore!.session.checks).toBe(1);
    expect(toDimensions(good!)).toHaveLength(good!.rows.length);
  });

  test("an integrity failure or an unrun check is not shown as intact", () => {
    const rows = sampleLedger();
    expect(row(compareSession({ rows, sessionId: "s1", intact: { intact: false, records: 3, divergence: "ordinal 2" } }), "record intact").recordShows).toStartWith("no");
    expect(row(compareSession({ rows, sessionId: "s1", intact: null }), "record intact").recordShows).toBe(NOT_RECORDED);
  });

  test("workshop link is #sessions/<sessionId>/<eventId>", () => {
    const cognate = (ordinal: number, eventId: string) => ({
      append_ordinal: ordinal,
      record_kind: "observation.recorded",
      ledger_id: "W1",
      payload: { extensions: { cognate: { correlationId: "session:abc-123", eventId, tenant: "t" } } },
    });
    const rows = [cognate(1, "evt-1"), cognate(2, "evt-2")];
    const view = compareSession({ rows, sessionId: "abc-123", workshopUrl: "http://127.0.0.1:3190/", intact });
    expect(view!.session.kind).toBe("workshop");
    expect(view!.workshop_link).toBe("http://127.0.0.1:3190/#sessions/abc-123/evt-2");
    expect(compareSession({ rows, sessionId: "abc-123", intact })!.workshop_link).toBeNull();
    // A session copied from an AI tool was never in the workshop: no link is invented.
    const tap = compareSession({ rows: sampleLedger(), sessionId: "s1", workshopUrl: "http://x", intact });
    expect(tap!.workshop_link).toBeNull();
    expect(tap!.workshop_link_reason).toBeTruthy();
  });
});
