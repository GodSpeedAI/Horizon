// REQ-NAV-011 / REQ-NAV-012 / REQ-NAV-013 (HORIZON-001 1.1.0): expected outcomes, vetted verifier templates,
// discrimination, admissible evidence and the settlement table. Pure-rule witnesses for the J02 revision 2
// settlement, falsifier and integrity rows; the live gate asserts the same outcomes on the owners' records.
import { describe, expect, test } from "bun:test";
import {
  type ExpectedOutcome,
  type SettlementInput,
  type VerifierEvidence,
  type VerifierTemplate,
  assertExpectedOutcome,
  assertVerifierTemplate,
  classify,
  discriminate,
  expectationDigest,
  instantiate,
  judgeSettlement,
  openWindow,
  requiresSettlement,
  runTimeoutS,
  settlementAccessGate,
  templateRef,
  windowOpen,
} from "../src/domain/expectation.ts";

const SHA_BIN = "a".repeat(64);
const SHA_SCRIPT = "b".repeat(64);
const TEMPLATE: VerifierTemplate = assertVerifierTemplate({
  template_id: "horizon.intent-recorded",
  version: "1",
  kind: "command",
  argv: [{ artifact: "verifier" }, { literal: "--intent" }, { effect_identity: true }],
  artifacts: [{ name: "verifier", sha256: SHA_BIN }],
  read_only: true,
});
const DIGESTS = { verifier: SHA_BIN };
const pathOf = (name: string) => `/pinned/${name}`;
const INTENT_A = "11111111-1111-4111-8111-111111111111";
const INTENT_B = "22222222-2222-4222-8222-222222222222";
const ARGV_A = instantiate(TEMPLATE, INTENT_A, pathOf);

const expectation = (overrides: Partial<Record<keyof ExpectedOutcome, unknown>> = {}): ExpectedOutcome =>
  assertExpectedOutcome({
    modality: "obligation",
    statement: "the navigation intent record exists",
    refuted_by: "the verifier exits non-zero",
    irrelevant: [],
    unaccounted: ["store replication lag"],
    verifier: { template_ref: templateRef(TEMPLATE) },
    window_s: 600,
    ...overrides,
  });

const COMMITTED = new Date("2026-10-23T12:00:00.000Z");
const WINDOW = openWindow(COMMITTED, 600);
const AFTER_CLOSE = new Date("2026-10-23T12:10:05.000Z");
const ON_TIME = { C: 50, recorded_at: "2026-10-23T12:10:10.000Z" };

const run = (overrides: Partial<VerifierEvidence> = {}): VerifierEvidence => ({
  ledger_position: 20,
  exit_code: 0,
  completed_at: "2026-10-23T12:05:00.000Z",
  started_at: "2026-10-23T12:04:59.000Z",
  argv: ARGV_A,
  digests_ok: true,
  started_after_execution: true,
  ...overrides,
});

const settle = (runs: VerifierEvidence[], overrides: Partial<SettlementInput> = {}) =>
  judgeSettlement({ requires: true, expectation: expectation(), window: WINDOW, now: AFTER_CLOSE, closure: ON_TIME, B: 10, runs, expected_argv: ARGV_A, ...overrides });

describe("REQ-NAV-011 the expected outcome and its verifier", () => {
  test("a free-text verifier is rejected as input", () => {
    expect(() => expectation({ verifier: "test -f /tmp/x" })).toThrow(/not free text/);
    expect(() => expectation({ verifier: { template_ref: templateRef(TEMPLATE), argv: ["sh", "-c", "true"] } })).toThrow(/not free text/);
  });

  test("irrelevant distinctions must be stated, even when empty", () => {
    const { irrelevant: _omitted, ...rest } = expectation();
    expect(() => assertExpectedOutcome(rest)).toThrow(/irrelevant must be a list/);
  });

  test("a template must pin argv[0] and every artifact it names, and must check the effect identity", () => {
    const base = { template_id: "t", version: "1", kind: "command", read_only: true, artifacts: [{ name: "v", sha256: SHA_BIN }] };
    expect(() => assertVerifierTemplate({ ...base, argv: [{ literal: "/bin/sh" }, { effect_identity: true }] })).toThrow(/argv\[0\] must be a pinned artifact/);
    expect(() => assertVerifierTemplate({ ...base, argv: [{ artifact: "v" }, { artifact: "script" }, { effect_identity: true }] })).toThrow(/unpinned artifact script/);
    expect(() => assertVerifierTemplate({ ...base, argv: [{ artifact: "v" }, { literal: "--all" }] })).toThrow(/effect identity/);
    expect(() => assertVerifierTemplate({ ...base, read_only: false, argv: [{ artifact: "v" }, { effect_identity: true }] })).toThrow(/read_only/);
    expect(() => assertVerifierTemplate({ ...base, kind: "llm", argv: [{ artifact: "v" }, { effect_identity: true }] })).toThrow(/not supported/);
  });

  test("only the effect identity is substituted", () => {
    expect(ARGV_A).toEqual(["/pinned/verifier", "--intent", INTENT_A]);
  });

  test("the digest is stable over key order and changes with any field", () => {
    const a = expectation();
    const reordered = assertExpectedOutcome(Object.fromEntries(Object.entries(a).reverse()));
    expect(expectationDigest(reordered)).toBe(expectationDigest(a));
    expect(expectationDigest(expectation({ statement: "something else" }))).not.toBe(expectationDigest(a));
  });

  test("applicability: read_only is exempt unless the binding requires settlement", () => {
    expect(requiresSettlement("read_only", {})).toBe(false);
    expect(requiresSettlement("read_only", { settlement: "required" })).toBe(true);
    expect(requiresSettlement("reversible", {})).toBe(true);
  });
});

describe("REQ-NAV-013 the settlement_access gate", () => {
  const gate = (overrides: Partial<Parameters<typeof settlementAccessGate>[0]> = {}) =>
    settlementAccessGate({ reversibility: "reversible", binding: { verifier: TEMPLATE }, expectation: expectation(), observed_digests: DIGESTS, settlement_configured: true, ...overrides });

  test("available only when every prerequisite holds", () => {
    expect(gate().verdict).toBe("pass");
  });

  test("an exempt intent is available with nothing to settle", () => {
    expect(gate({ reversibility: "read_only", binding: {}, expectation: undefined, settlement_configured: false })).toMatchObject({ verdict: "pass", reason: "read_only: nothing to settle" });
  });

  test("prohibition and permission modalities are blocked", () => {
    for (const modality of ["prohibition", "permission"]) {
      const result = gate({ expectation: { ...expectation(), modality } });
      expect(result.verdict).toBe("fail");
      expect(result.reason).toContain("not supported by the configured verifiers");
    }
  });

  test("each missing prerequisite is named", () => {
    expect(gate({ expectation: undefined }).reason).toBe("no expected outcome was stated");
    expect(gate({ binding: {} }).reason).toBe("the operation binding declares no vetted verifier template");
    expect(gate({ expectation: { ...expectation(), verifier: { template_ref: "other@1" } } }).reason).toContain("is not the binding's template");
    expect(gate({ observed_digests: { verifier: SHA_SCRIPT } }).reason).toBe("verifier artifact digest mismatch: verifier");
    expect(gate({ settlement_configured: false })).toMatchObject({ verdict: "unknown", prerequisite_ref: "settlement:configure" });
  });

  test("read_only with settlement: required and no expectation is refused", () => {
    expect(gate({ reversibility: "read_only", binding: { settlement: "required", verifier: TEMPLATE }, expectation: undefined }).verdict).toBe("fail");
  });
});

describe("REQ-NAV-011 window and discrimination", () => {
  test("the window opens at commit and closes window_s later; no run starts within the close grace", () => {
    expect(WINDOW).toEqual({ opens_at: "2026-10-23T12:00:00.000Z", closes_at: "2026-10-23T12:10:00.000Z" });
    expect(windowOpen(WINDOW, new Date("2026-10-23T12:09:59.000Z"))).toBe(true);
    expect(windowOpen(WINDOW, new Date("2026-10-23T12:10:00.000Z"))).toBe(false);
    expect(runTimeoutS(WINDOW, new Date("2026-10-23T12:09:00.000Z"))).toBe(30);
    expect(runTimeoutS(WINDOW, new Date("2026-10-23T12:09:30.000Z"))).toBeNull();
  });

  test("an expectation already true before acting is refused and the operation is not executed", () => {
    expect(discriminate(run({ exit_code: 0, started_after_execution: false }), ARGV_A)).toEqual({ proceed: false, refusal: "expected outcome already holds before acting" });
  });

  test("a discrimination run that cannot complete is refused as unknown", () => {
    expect(discriminate(null, ARGV_A)).toMatchObject({ proceed: false, refusal: "discrimination unknown" });
    expect(discriminate(run({ exit_code: null }), ARGV_A)).toMatchObject({ refusal: "discrimination unknown" });
    expect(discriminate(run({ exit_code: 1, digests_ok: false }), ARGV_A)).toMatchObject({ refusal: "discrimination unknown" });
  });

  test("a discrimination run that does not observe the statement lets execution proceed", () => {
    expect(discriminate(run({ exit_code: 1, started_after_execution: false }), ARGV_A)).toEqual({ proceed: true });
  });
});

describe("REQ-NAV-012 the settlement table", () => {
  test("known 0 → supported / settled", () => {
    expect(settle([run()])).toMatchObject({ epistemic_status: "supported", operational: "settled", admissible: 1 });
  });

  test("known non-zero → contradicted / rejected", () => {
    expect(settle([run({ exit_code: 3 })])).toMatchObject({ epistemic_status: "contradicted", operational: "rejected" });
  });

  test("both → inconsistent / unsettled", () => {
    expect(settle([run(), run({ ledger_position: 21, exit_code: 1 })])).toMatchObject({ epistemic_status: "inconsistent", operational: "unsettled" });
  });

  test("only undefined (a timeout run and a null-exit run) → unresolved / rejected", () => {
    const timeout = run({ exit_code: null, ledger_position: 21 });
    const nullExit = run({ exit_code: null, ledger_position: 22, completed_at: "2026-10-23T12:06:00.000Z" });
    expect(settle([timeout, nullExit])).toMatchObject({ epistemic_status: "unresolved", operational: "rejected", admissible: 2 });
    expect(settle([])).toMatchObject({ epistemic_status: "unresolved", operational: "rejected", admissible: 0 });
  });

  test("a known 0 alongside undefined runs → supported", () => {
    expect(settle([run({ exit_code: null, ledger_position: 21 }), run({ ledger_position: 22 })])).toMatchObject({ epistemic_status: "supported" });
  });

  test("window open → pending", () => {
    expect(settle([run()], { now: new Date("2026-10-23T12:05:00.000Z") })).toMatchObject({ epistemic_status: null, operational: "pending" });
  });

  test("an exempt intent without an expectation is not_required, never settled", () => {
    expect(judgeSettlement({ requires: false, expectation: null, window: null, now: AFTER_CLOSE, closure: null, B: null, runs: [], expected_argv: [] }).operational).toBe("not_required");
  });
});

describe("REQ-NAV-012 falsifiers", () => {
  test("wrong intent: a verifier instantiated for intent A, run against B's effect, does not support B", () => {
    const argvB = instantiate(TEMPLATE, INTENT_B, pathOf);
    expect(settle([run({ argv: ARGV_A })], { expected_argv: argvB })).toMatchObject({ epistemic_status: "unresolved", operational: "rejected" });
  });

  test("a changed verifier executable or script: the digest mismatch makes the run undefined, never supported", () => {
    expect(classify(run({ digests_ok: false }), { B: 10, C: 50, deadline: WINDOW.closes_at, expected_argv: ARGV_A })).toBe("undefined");
    expect(settle([run({ digests_ok: false })])).toMatchObject({ epistemic_status: "unresolved" });
  });

  test("Horizon down across the deadline (no closure record), then a passing run appended late: unresolved / rejected", () => {
    expect(settle([run({ ledger_position: 60 })], { closure: null })).toMatchObject({ epistemic_status: "unresolved", operational: "rejected" });
  });

  test("a closure recorded after deadline + grace cannot prove C on time", () => {
    expect(settle([run()], { closure: { C: 50, recorded_at: "2026-10-23T12:10:31.000Z" } })).toMatchObject({ epistemic_status: "unresolved", operational: "rejected" });
  });

  test("a delayed closure within the grace still records C", () => {
    expect(settle([run()], { closure: { C: 50, recorded_at: "2026-10-23T12:10:30.000Z" } })).toMatchObject({ epistemic_status: "supported" });
  });

  test("a run that completed after the deadline (watchdog paused across it) is not admissible as known", () => {
    expect(settle([run({ completed_at: "2026-10-23T12:10:01.000Z" })])).toMatchObject({ epistemic_status: "unresolved" });
  });

  test("evidence without completed_at is undefined", () => {
    expect(settle([run({ completed_at: null })])).toMatchObject({ epistemic_status: "unresolved", admissible: 1 });
  });

  test("a run that straddles the close (appended after C) is excluded", () => {
    expect(settle([run({ ledger_position: 51 })])).toMatchObject({ epistemic_status: "unresolved", admissible: 0 });
  });

  test("evidence from before execution, or at or before the discrimination position, is not admissible", () => {
    expect(settle([run({ started_after_execution: false })])).toMatchObject({ admissible: 0 });
    expect(settle([run({ ledger_position: 10 })])).toMatchObject({ admissible: 0 });
  });

  test("an unsupported modality never reaches settlement", () => {
    expect(() => settle([run()], { expectation: expectation({ modality: "prohibition" }) })).toThrow(/not supported/);
  });
});
