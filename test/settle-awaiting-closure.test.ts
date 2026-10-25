import { describe, expect, test } from "bun:test";
import { settleAwaitingClosure } from "../src/settlement/settle-awaiting-closure";

type Result = { ok: true; status: "settled" } | { ok: false; errorClass: string; error: string };

const PENDING: Result = {
  ok: false,
  errorClass: "cep_settlement_pending",
  error: "settlement pending: the closure has not been recorded yet",
};

function harness(script: Result[], deadlineMs = 10_000) {
  const calls: number[] = [];
  const sleeps: number[] = [];
  let now = 0;
  let index = 0;
  return {
    calls,
    sleeps,
    run: () =>
      settleAwaitingClosure(
        async () => {
          calls.push(now);
          return script[Math.min(index++, script.length - 1)]!;
        },
        {
          deadlineAt: deadlineMs,
          now: () => now,
          sleep: async (ms) => {
            sleeps.push(ms);
            now += ms;
          },
        },
      ),
  };
}

describe("settleAwaitingClosure: a late closure is pending, not a refusal", () => {
  test("a slow closure settles once SEA-Forge has recorded it, with bounded backoff", async () => {
    const h = harness([PENDING, PENDING, PENDING, { ok: true, status: "settled" }]);
    const result = await h.run();
    expect(result).toEqual({ ok: true, status: "settled" });
    expect(h.calls).toHaveLength(4);
    expect(h.sleeps).toEqual([50, 100, 200]);
  });

  test("the backoff never exceeds its cap", async () => {
    const h = harness([PENDING, PENDING, PENDING, PENDING, PENDING, PENDING, PENDING, PENDING, PENDING, PENDING, { ok: true, status: "settled" }], 60_000);
    await h.run();
    expect(Math.max(...h.sleeps)).toBeLessThanOrEqual(1_000);
  });

  test("past the deadline it returns the pending result instead of retrying forever", async () => {
    const h = harness([PENDING], 300);
    const result = await h.run();
    expect(result).toEqual(PENDING);
    expect(h.sleeps.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(300);
  });

  test("any other refusal is returned at once, never retried", async () => {
    const refused: Result = { ok: false, errorClass: "policy_refused", error: "denied" };
    const h = harness([refused]);
    expect(await h.run()).toEqual(refused);
    expect(h.calls).toHaveLength(1);
    expect(h.sleeps).toHaveLength(0);
  });

  test("an evidence refusal is final even if its message mentions a pending settlement", async () => {
    const refused: Result = { ok: false, errorClass: "cep_evidence_refused", error: "evidence or settlement refused: settlement is pending" };
    const h = harness([refused]);
    expect(await h.run()).toEqual(refused);
    expect(h.calls).toHaveLength(1);
  });

  test("a pending message under a different error class is not treated as pending", async () => {
    const other: Result = { ok: false, errorClass: "unreachable", error: "settlement is pending" };
    const h = harness([other]);
    expect(await h.run()).toEqual(other);
    expect(h.calls).toHaveLength(1);
  });
});
