// HORIZON-001 1.1.0 configuration: operation bindings, capacity allowances and settlement confinement are
// operator-owned and validated at load; an incomplete payment binding still loads (its gate is unknown, REQ-NAV-008).
import { describe, expect, test } from "bun:test";
import { configFromDocument } from "../src/config/load.ts";
import { CURRENCIES } from "../src/domain/payment.ts";
import { horizonDocument } from "./support/config.ts";

const base = () => horizonDocument({ storePath: "/tmp/x.sqlite", secretPath: "/tmp/x.secret" }) as Record<string, unknown>;
const SHA = "c".repeat(64);
const verifier = {
  template_id: "horizon.intent-recorded",
  version: "1",
  kind: "command",
  read_only: true,
  argv: [{ artifact: "verifier" }, { literal: "--intent" }, { effect_identity: true }],
  artifacts: [{ name: "verifier", sha256: SHA, path: "/opt/horizon/horizon-verify-intent" }],
};
const operation = (overrides: Record<string, unknown> = {}) => ({
  operation_ref: "horizon.intent.record",
  label: "Record a navigation intent",
  reversibility: "reversible",
  payment: CURRENCIES.map((currency) => ({ currency, unit: "units", amount: 0, basis: "declared_bound", source_ref: "binding:horizon.intent.record@1" })),
  verifier,
  ...overrides,
});

describe("operation bindings, capacity and settlement in horizon.toml", () => {
  test("absent sections mean no bound operations, no capacity and no settlement", () => {
    const config = configFromDocument(base());
    expect(config.operations).toEqual([]);
    expect(config.capacity).toEqual([]);
    expect(config.settlement).toBeUndefined();
  });

  test("a complete binding loads with its pinned artifact paths", () => {
    const config = configFromDocument({
      ...base(),
      operations: [operation()],
      capacity: [{ currency: "compute", unit: "units", allowance: 10, period: "day" }],
      settlement: { launcher: ["/opt/bwrap", "--unshare-all"], close_grace_s: 15 },
    });
    expect(config.operations[0]).toMatchObject({ operation_ref: "horizon.intent.record", reversibility: "reversible", verifier_paths: { verifier: "/opt/horizon/horizon-verify-intent" } });
    expect(config.operations[0]!.verifier!.artifacts).toEqual([{ name: "verifier", sha256: SHA }]);
    expect(config.capacity).toEqual([{ currency: "compute", unit: "units", allowance: 10, period: "day" }]);
    expect(config.settlement).toEqual({ launcher: ["/opt/bwrap", "--unshare-all"], close_grace_s: 15 });
  });

  test("an incomplete payment binding still loads: the gate, not the loader, calls it unknown", () => {
    const config = configFromDocument({ ...base(), operations: [operation({ payment: [] })] });
    expect(config.operations[0]!.payment).toEqual([]);
  });

  test("malformed shapes are refused at load, naming the field", () => {
    expect(() => configFromDocument({ ...base(), operations: [operation({ reversibility: "maybe" })] })).toThrow(/operations\[0\]\.reversibility/);
    expect(() => configFromDocument({ ...base(), operations: [operation({ settlement: "optional" })] })).toThrow(/settlement may only be "required"/);
    expect(() => configFromDocument({ ...base(), operations: [operation({ payment: [{ currency: "money", unit: "u", amount: 1, basis: "declared_bound", source_ref: "x" }] })] })).toThrow(/operations\[0\]\.payment\[0\].*unknown currency/);
    expect(() => configFromDocument({ ...base(), operations: [operation({ verifier: { ...verifier, argv: [{ literal: "sh" }, { effect_identity: true }] } })] })).toThrow(/argv\[0\] must be a pinned artifact/);
    expect(() => configFromDocument({ ...base(), operations: [operation(), operation()] })).toThrow(/duplicate binding/);
    expect(() => configFromDocument({ ...base(), operations: [operation({ operation_ref: "horizon.health" })] })).toThrow(/structural move/);
    expect(() => configFromDocument({ ...base(), capacity: [{ currency: "compute", unit: "u", allowance: -1 }] })).toThrow(/capacity\[0\]/);
    expect(() => configFromDocument({ ...base(), settlement: { launcher: [] } })).toThrow(/settlement\.launcher/);
  });
});
