// REQ-NAV-008 / REQ-NAV-009 (HORIZON-001 1.1.0): payment entries, binding coverage, the capacity ledger and the
// payment gate. Pure-rule witnesses for the J02 revision 2 payment checks; the live gate asserts the same
// outcomes on the Horizon store.
import { describe, expect, test } from "bun:test";
import {
  CURRENCIES,
  type CapacityAllowance,
  type Currency,
  type PaymentEntry,
  assertAllowance,
  assertPaymentEntry,
  available,
  consume,
  emptyLedger,
  formatPayment,
  paymentGate,
  reserve,
  validateBinding,
} from "../src/domain/payment.ts";

const NOW = new Date("2026-10-23T12:00:00.000Z");
const bound = (currency: Currency, amount: number | "unknown", unit = "units"): PaymentEntry => ({ currency, unit, amount, basis: "declared_bound", source_ref: "binding:test@1" });
/** A valid binding: every currency at 0 except the overrides. */
const binding = (overrides: Partial<Record<Currency, number | "unknown">> = {}): PaymentEntry[] =>
  CURRENCIES.map((currency) => bound(currency, overrides[currency] ?? 0));
const allow = (currency: Currency, allowance: number | "unbounded", period: "none" | "day" = "none"): CapacityAllowance => ({ currency, unit: "units", allowance, period });

describe("REQ-NAV-008 payment entries and binding coverage", () => {
  test("entries are validated: unknown currency, negative amount and undeclared fields are refused", () => {
    expect(() => assertPaymentEntry({ currency: "money", unit: "usd", amount: 1, basis: "declared_bound", source_ref: "x" })).toThrow(/unknown currency/);
    expect(() => assertPaymentEntry({ currency: "compute", unit: "s", amount: -1, basis: "declared_bound", source_ref: "x" })).toThrow(/non-negative/);
    expect(() => assertPaymentEntry({ currency: "compute", unit: "s", amount: 1, basis: "declared_bound", source_ref: "x", weight: 2 })).toThrow(/undeclared/);
    expect(assertPaymentEntry({ currency: "compute", unit: "s", amount: "unknown", basis: "predicted", source_ref: "x" }).amount).toBe("unknown");
  });

  test("a binding missing a currency is invalid, so the gate is unknown", () => {
    const missing = binding().filter((entry) => entry.currency !== "opportunity");
    expect(validateBinding(missing)).toEqual({ valid: false, reason: "no declared bound for opportunity" });
    const gate = paymentGate(missing, emptyLedger([]), NOW);
    expect(gate.verdict).toBe("unknown");
    expect(gate.reason).toContain("invalid payment binding");
  });

  test("a duplicate (currency, unit) is invalid, so the gate is unknown", () => {
    const duplicate = [...binding(), bound("compute", 0)];
    expect(validateBinding(duplicate).valid).toBe(false);
    expect(paymentGate(duplicate, emptyLedger([]), NOW).verdict).toBe("unknown");
  });

  test("one currency may carry bounds in two distinct units", () => {
    expect(validateBinding([...binding(), bound("compute", 0, "gpu_s")]).valid).toBe(true);
  });

  test("a predicted estimate does not make an unknown bound pass, and predicted entries never count toward coverage", () => {
    const entries = [...binding({ compute: "unknown" }), { ...bound("compute", 1), basis: "predicted" as const }];
    const ledger = emptyLedger([allow("compute", 10)]);
    const gate = paymentGate(entries, ledger, NOW);
    expect(gate.verdict).toBe("unknown");
    expect(gate.reason).toContain("compute/units: the declared bound is unknown");
    const onlyPredicted = binding().map((entry) => (entry.currency === "opportunity" ? { ...entry, basis: "predicted" as const } : entry));
    expect(validateBinding(onlyPredicted).valid).toBe(false);
  });
});

describe("REQ-NAV-009 the payment gate", () => {
  test("a zero bound passes with no allowance configured", () => {
    expect(paymentGate(binding(), emptyLedger([]), NOW).verdict).toBe("pass");
  });

  test("a positive bound with no allowance is unknown, naming the capacity", () => {
    const gate = paymentGate(binding({ compute: 2 }), emptyLedger([]), NOW);
    expect(gate.verdict).toBe("unknown");
    expect(gate.reason).toBe("no capacity for compute/units");
  });

  test("an over-capacity bound is blocked naming its currency", () => {
    const gate = paymentGate(binding({ verification: 5 }), emptyLedger([allow("verification", 3)]), NOW);
    expect(gate.verdict).toBe("fail");
    expect(gate.reason).toBe("verification: declares 5 units, 3 available");
  });

  test("blocked outranks unknown, and an unbounded allowance always passes", () => {
    const ledger = emptyLedger([allow("verification", 1), allow("compute", "unbounded")]);
    expect(paymentGate(binding({ verification: 2, orchestration: 1 }), ledger, NOW).verdict).toBe("fail");
    expect(paymentGate(binding({ compute: 1_000_000 }), ledger, NOW).verdict).toBe("pass");
    expect(available(ledger, "compute", "units", NOW)).toBe("unbounded");
  });

  test("two intents that each fit but jointly exceed capacity: the second reservation is refused", () => {
    let ledger = emptyLedger([allow("compute", 5)]);
    expect(paymentGate(binding({ compute: 3 }), ledger, NOW).verdict).toBe("pass");
    ledger = reserve(ledger, "intent-a", binding({ compute: 3 }), NOW);
    expect(paymentGate(binding({ compute: 3 }), ledger, NOW).reason).toBe("compute: declares 3 units, 2 available");
    expect(() => reserve(ledger, "intent-b", binding({ compute: 3 }), NOW)).toThrow(/payment gate is fail/);
    expect(() => reserve(ledger, "intent-a", binding(), NOW)).toThrow(/already holds a reservation/);
  });

  test("a terminal intent's reservation becomes consumption and still counts", () => {
    let ledger = reserve(emptyLedger([allow("compute", 5)]), "intent-a", binding({ compute: 3 }), NOW);
    ledger = consume(ledger, "intent-a", NOW);
    expect(ledger.reservations).toHaveLength(0);
    expect(ledger.consumptions.map((entry) => entry.intent_id)).toEqual(["intent-a"]);
    expect(available(ledger, "compute", "units", NOW)).toBe(2);
    expect(consume(ledger, "intent-a", NOW)).toBe(ledger);
    expect(() => consume(ledger, "intent-z", NOW)).toThrow(/holds no reservation/);
  });

  test("a day-period allowance resets at the UTC boundary (clock injected)", () => {
    const evening = new Date("2026-10-23T23:59:00.000Z");
    const nextMorning = new Date("2026-10-24T00:00:01.000Z");
    let ledger = reserve(emptyLedger([allow("steering_attention", 2, "day")]), "intent-a", binding({ steering_attention: 2 }), evening);
    ledger = consume(ledger, "intent-a", evening);
    expect(available(ledger, "steering_attention", "units", evening)).toBe(0);
    expect(paymentGate(binding({ steering_attention: 1 }), ledger, evening).verdict).toBe("fail");
    expect(available(ledger, "steering_attention", "units", nextMorning)).toBe(2);
    expect(paymentGate(binding({ steering_attention: 1 }), ledger, nextMorning).verdict).toBe("pass");
  });

  test("an open reservation is never reset by the period boundary", () => {
    const evening = new Date("2026-10-23T23:59:00.000Z");
    const ledger = reserve(emptyLedger([allow("compute", 2, "day")]), "intent-a", binding({ compute: 2 }), evening);
    expect(available(ledger, "compute", "units", new Date("2026-10-24T08:00:00.000Z"))).toBe(0);
  });

  test("allowances are validated", () => {
    expect(() => assertAllowance({ currency: "compute", unit: "s", allowance: -1 })).toThrow(/non-negative/);
    expect(() => assertAllowance({ currency: "compute", unit: "s", allowance: 1, period: "week" })).toThrow(/period/);
    expect(assertAllowance({ currency: "compute", unit: "s", allowance: "unbounded" }).period).toBe("none");
  });
});

describe("REQ-NAV-008 / REQ-NAV-010 presentation", () => {
  test("every currency at 0 says so, and an unknown bound is never shown as a number", () => {
    expect(formatPayment({ entries: binding() })).toBe("declared bound: 0 in every currency");
    expect(formatPayment({ entries: binding({ compute: "unknown" }) })).toBe("declared bound: compute unknown units; 0 in the 8 other");
    expect(formatPayment(null)).toBe("No payment is declared.");
  });

  test("an observed spend is shown beside the bound it was declared against, never alone", () => {
    const view = { entries: binding({ steering_attention: 1 }), observed: [{ currency: "steering_attention" as const, unit: "units", amount: 2, source_ref: "sea-forge:authority_approvals" }] };
    expect(formatPayment(view)).toBe("declared bound: steering_attention declared 1 units, observed 2 units (sea-forge:authority_approvals); 0 in the 8 other");
    const zeroBound = { entries: binding(), observed: [{ currency: "steering_attention" as const, unit: "units", amount: 0, source_ref: "sea-forge:authority_approvals" }] };
    expect(formatPayment(zeroBound)).toContain("steering_attention declared 0 units, observed 0 units");
  });

  test("predictions are labelled advisory with their source; nothing is summed across currencies", () => {
    const view = { entries: [...binding({ compute: 3, verification: 2 }), { currency: "compute" as const, unit: "units", amount: 9, basis: "predicted" as const, source_ref: "model:estimate" }] };
    const text = formatPayment(view);
    expect(text).toContain("compute 3 units; verification 2 units");
    expect(text).toContain("predicted (advisory): compute 9 units (model:estimate)");
    expect(text).not.toContain("5 ");
  });
});
