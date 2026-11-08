/** The rules for a question, its answer, its owner and its status, as pure checks (no store). Spec: store-design-v2.md sections 3, 4, 8. */
import { describe, expect, test } from "bun:test";
import { normaliseAnswer } from "../src/capabilities/panel-answers.ts";
import { checkAnswer, checkPut, checkReassign, checkRoute, checkStopWaiting, checkWithdraw, questionFingerprint, type QuestionState } from "../src/capabilities/question-rules.ts";

const q = { question: "Ship the fix?", input: "confirm", options: [{ option_id: "yes", label: "Yes", consequence: null }, { option_id: "no", label: "No", consequence: null }], resolves: "handoff_0a49" };
const open: QuestionState = { owner_key: "key-A", fingerprint: questionFingerprint(q), outcome: null, replied: false, waiting_on: "none", history: [], routed_as: null, version: "v1" };

describe("the fingerprint of a question", () => {
  test("is the same for the same words and different for other words, options or what it resolves", () => {
    expect(questionFingerprint(q)).toBe(questionFingerprint({ ...q }));
    expect(questionFingerprint(q)).not.toBe(questionFingerprint({ ...q, question: "Ship it?" }));
    expect(questionFingerprint(q)).not.toBe(questionFingerprint({ ...q, input: "select" }));
    expect(questionFingerprint(q)).not.toBe(questionFingerprint({ ...q, resolves: "other_step" }));
    expect(questionFingerprint(q)).not.toBe(questionFingerprint({ ...q, options: [...q.options, { option_id: "later", label: "Later", consequence: null }] }));
  });
});

describe("put a question", () => {
  test("a new question is created with the caller as owner", () => {
    expect(checkPut({ existing: null, callerKey: "key-A", fingerprint: questionFingerprint(q) })).toEqual({ ok: true, owner_key: "key-A", reopen: false });
  });

  test("a put by a different key is refused in plain words", () => {
    expect(checkPut({ existing: open, callerKey: "key-B", fingerprint: questionFingerprint(q) })).toEqual({ ok: false, message: "That question belongs to another agent." });
  });

  test("a deferred question re-opens with the same words and keeps its history", () => {
    const deferred: QuestionState = { ...open, history: [{ outcome: "deferred", at: "2026-11-06T10:00:00.000Z" }] };
    expect(checkPut({ existing: deferred, callerKey: "key-A", fingerprint: questionFingerprint(q) })).toEqual({ ok: true, owner_key: "key-A", reopen: true });
  });

  test("a different wording on a question that exists is refused", () => {
    expect(checkPut({ existing: open, callerKey: "key-A", fingerprint: questionFingerprint({ ...q, question: "Ship it now?" }) })).toMatchObject({ ok: false });
  });

  test("an answered question with the same words is a no-op, not a new answer", () => {
    const answered: QuestionState = { ...open, outcome: "answered", waiting_on: "agent" };
    expect(checkPut({ existing: answered, callerKey: "key-A", fingerprint: questionFingerprint(q) })).toEqual({ ok: true, owner_key: "key-A", reopen: false });
  });
});

describe("answer a question", () => {
  test("succeeds on an open or deferred question when the version seen is the current one", () => {
    expect(checkAnswer({ state: open, seenVersion: "v1" })).toEqual({ ok: true });
    expect(checkAnswer({ state: { ...open, history: [{ outcome: "deferred", at: "t" }] }, seenVersion: "v1" })).toEqual({ ok: true });
  });

  test("is refused when the question changed after the person looked", () => {
    expect(checkAnswer({ state: open, seenVersion: "v0" })).toEqual({ ok: false, message: "This question changed after you looked at it. Look again, then answer." });
  });

  test("a second answer to an answered question is refused", () => {
    expect(checkAnswer({ state: { ...open, outcome: "answered" }, seenVersion: "v1" })).toMatchObject({ ok: false });
  });
});

describe("route an answer", () => {
  test("only the owner key may route; a rotated or other key is refused", () => {
    const waiting: QuestionState = { ...open, outcome: "answered", waiting_on: "agent" };
    expect(checkRoute({ state: waiting, callerKey: "key-A", routedAs: "step handoff_0a49 in Seed" })).toEqual({ ok: true });
    expect(checkRoute({ state: waiting, callerKey: "key-B", routedAs: "step handoff_0a49 in Seed" })).toEqual({ ok: false, message: "That question was asked by a different agent, so you cannot answer for it." });
  });

  test("a route under 6 characters is refused", () => {
    const waiting: QuestionState = { ...open, outcome: "answered", waiting_on: "agent" };
    expect(checkRoute({ state: waiting, callerKey: "key-A", routedAs: "done" })).toMatchObject({ ok: false });
  });

  test("a route when nothing waits for the agent is refused", () => {
    expect(checkRoute({ state: open, callerKey: "key-A", routedAs: "step handoff_0a49 in Seed" })).toMatchObject({ ok: false });
  });
});

describe("withdraw a question", () => {
  test("the owner may withdraw an unanswered question that resolves no required step", () => {
    expect(checkWithdraw({ state: open, callerKey: "key-A", resolvesRequiredStep: false })).toEqual({ ok: true });
  });
  test("an answered question, another key, or a required step blocks withdrawal", () => {
    expect(checkWithdraw({ state: { ...open, outcome: "answered" }, callerKey: "key-A", resolvesRequiredStep: false })).toMatchObject({ ok: false });
    expect(checkWithdraw({ state: open, callerKey: "key-B", resolvesRequiredStep: false })).toMatchObject({ ok: false });
    expect(checkWithdraw({ state: open, callerKey: "key-A", resolvesRequiredStep: true })).toMatchObject({ ok: false });
  });
});

describe("stop waiting", () => {
  test("closes an answer that waits for the agent, even when the agent is gone", () => {
    expect(checkStopWaiting({ state: { ...open, outcome: "answered", waiting_on: "agent" } })).toEqual({ ok: true });
    expect(checkStopWaiting({ state: open })).toMatchObject({ ok: false });
  });
});

describe("reassign the owner", () => {
  const base = { state: { ...open, outcome: "answered" as const, waiting_on: "agent" as const }, newOwnerKey: "key-B", targetRegistered: true, confirmed: true, pairedAgeMs: 60_000, paired: true };
  test("allowed for a waiting answer when paired, registered and confirmed", () => {
    expect(checkReassign(base)).toEqual({ ok: true });
  });
  test("refused for an unpaired caller", () => {
    expect(checkReassign({ ...base, paired: false })).toMatchObject({ ok: false });
  });
  test("refused when the pairing is older than 10 minutes, with the reason in plain words", () => {
    const r = checkReassign({ ...base, pairedAgeMs: 10 * 60_000 + 1 });
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.message).toContain("10 minutes");
  });
  test("refused for an unregistered target and without the second confirm", () => {
    expect(checkReassign({ ...base, targetRegistered: false })).toMatchObject({ ok: false });
    expect(checkReassign({ ...base, confirmed: false })).toMatchObject({ ok: false });
  });
});

describe("a pre-upgrade answer", () => {
  test("missing fields read as defaults: the owner is asked_by_key, history empty, waiting_on from replied", () => {
    const old = normaliseAnswer({ tenant: "t", panel_id: "p", n: 1, ask: "q", outcome: "answered", value: "yes", note: null, at: "t", replied: false, step: "s1", asked_by_key: "key-A" } as never);
    expect(old).toMatchObject({ owner_key: "key-A", history: [], fingerprint: null, waiting_on: "agent" });
    const closed = normaliseAnswer({ tenant: "t", panel_id: "p", n: 2, ask: "q", outcome: "answered", value: "yes", note: null, at: "t", replied: true, step: null } as never);
    expect(closed).toMatchObject({ owner_key: null, waiting_on: "none" });
  });
});
