// SPEC-CR-002 §4 order of operations, Horizon's side (HORIZON-001 1.1.0): gates before anything is recorded; the
// threshold before the pending intent and its reservation; the claims SEA-Forge records; discrimination that
// refuses execution when the statement already holds or cannot be checked; verification timed to end before the
// deadline; the closure handed to SEA-Forge with the runs RealityTrace recorded. RealityTrace is faked here (its
// real behaviour is witnessed in realitytrace-obligation.test.ts); the store is a real SQLite file.
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import type { OperationBindingConfig } from "../src/config/types.ts";
import { CURRENCIES, type Currency } from "../src/domain/payment.ts";
import { assertVerifierTemplate } from "../src/domain/expectation.ts";
import type { DeclaredThreshold, VerifierRun } from "../src/adapters/realitytrace-obligation.ts";
import { readLedger } from "../src/capabilities/capacity-ledger.ts";
import { readPending } from "../src/capabilities/pending-intent.ts";
import { type ObligationDeps, ObligationRefusal, argvDigest, claimsFor, close, discriminateRun, prepare, verifyRun } from "../src/settlement/obligation.ts";

const SHA = "d".repeat(64);
const TEMPLATE = assertVerifierTemplate({ template_id: "horizon.intent-recorded", version: "1", kind: "command", read_only: true, argv: [{ artifact: "verifier" }, { literal: "--intent" }, { effect_identity: true }], artifacts: [{ name: "verifier", sha256: SHA }] });
const bounds = (overrides: Partial<Record<Currency, number>> = {}) =>
  CURRENCIES.map((currency) => ({ currency, unit: "units", amount: overrides[currency] ?? 0, basis: "declared_bound" as const, source_ref: "binding:test@1" }));
const binding = (overrides: Partial<OperationBindingConfig> = {}): OperationBindingConfig => ({
  operation_ref: "horizon.intent.record",
  label: "Record",
  reversibility: "reversible",
  payment: bounds({ compute: 2 }),
  verifier: TEMPLATE,
  verifier_paths: { verifier: "/pinned/verifier" },
  ...overrides,
});
const EXPECTATION = { modality: "obligation", statement: "the record exists", refuted_by: "exit non-zero", irrelevant: [], unaccounted: [], verifier: { template_ref: "horizon.intent-recorded@1" }, window_s: 600 };
const intent = (id: string) => ({ intent_id: id, frame_id: "frame-1", frame_revision: 0, actor_ref: "observer:op", operation_ref: "horizon.intent.record" });
const ID = "11111111-1111-4111-8111-111111111111";

function fakeRt(exitFor: (argv: readonly string[]) => number | null = () => 1) {
  const calls: { kind: string; argv?: readonly string[]; timeoutS?: number }[] = [];
  let ordinal = 10;
  return {
    calls,
    declare(intentId: string): DeclaredThreshold {
      calls.push({ kind: "declare" });
      return { question_id: `q-${intentId}`, threshold_id: `t-${intentId}`, position: { ledger_id: "L1", ordinal: 3 } };
    },
    run(_threshold: DeclaredThreshold, argv: readonly string[], _launcher: readonly string[], timeoutS: number): VerifierRun {
      calls.push({ kind: "run", argv, timeoutS });
      ordinal += 2;
      const exit = exitFor(argv);
      return { observation_id: `obs-${ordinal}`, exit_code: exit, started_at: new Date().toISOString(), completed_at: new Date().toISOString(), crashed: false, position: { ledger_id: "L1", ordinal } };
    },
  };
}

function deps(options: { rt?: ReturnType<typeof fakeRt>; now?: () => Date; digest?: string | null; configured?: boolean; allowance?: number } = {}): ObligationDeps & { rt: ReturnType<typeof fakeRt> } {
  const store = openSqliteStore({ path: join(mkdtempSync(join(tmpdir(), "horizon-obligation-")), "store.sqlite") });
  const rt = options.rt ?? fakeRt();
  return {
    rt,
    store: () => store,
    tenant: "local",
    realityTrace: rt,
    settlement: { launcher: ["/bwrap", "--unshare-all"], close_grace_s: 30 },
    allowances: [{ currency: "compute", unit: "units", allowance: options.allowance ?? 5, period: "none" }],
    settlementConfigured: options.configured ?? true,
    now: options.now ?? (() => new Date()),
    digestOf: () => (options.digest === undefined ? SHA : options.digest),
  };
}

describe("prepare: gates, threshold, then the pending intent with its reservation", () => {
  test("an available binding declares the threshold, records the pending intent and reserves", async () => {
    const d = deps();
    const pending = await prepare(d, binding(), intent(ID), EXPECTATION);
    expect(d.rt.calls.map((c) => c.kind)).toEqual(["declare"]);
    expect(pending).toMatchObject({ stage: "awaiting_authority", reserved: true, threshold: { threshold_id: `t-${ID}`, position: { ordinal: 3 } }, verifier_argv: ["/pinned/verifier", "--intent", ID] });
    expect((await readLedger(d.store(), "local", d.allowances)).ledger.reservations.map((r) => r.intent_id)).toEqual([ID]);
  });

  test("an unaffordable intent is refused before RealityTrace is asked or anything is recorded", async () => {
    const d = deps({ allowance: 1 });
    await expect(prepare(d, binding(), intent(ID), EXPECTATION)).rejects.toThrow(/payment is blocked: compute: declares 2 units, 1 available/);
    expect(d.rt.calls).toHaveLength(0);
    expect(await readPending(d.store(), "local", ID)).toBeNull();
  });

  test("a missing expectation, a free-text verifier, prohibition, a changed artifact or no settlement configured: refused, nothing recorded", async () => {
    const cases: [ReturnType<typeof deps>, unknown, RegExp][] = [
      [deps(), undefined, /settlement_access is blocked: no expected outcome was stated/],
      [deps(), { ...EXPECTATION, verifier: "test -f x" }, /not free text/],
      [deps(), { ...EXPECTATION, modality: "prohibition" }, /not supported by the configured verifiers/],
      [deps({ digest: "e".repeat(64) }), EXPECTATION, /digest mismatch: verifier/],
      [deps({ configured: false }), EXPECTATION, /settlement_access is unknown: SEA-Forge settlement/],
    ];
    for (const [d, expectation, message] of cases) {
      await expect(prepare(d, binding(), intent(ID), expectation)).rejects.toThrow(message);
      expect(d.rt.calls).toHaveLength(0);
      expect(await readPending(d.store(), "local", ID)).toBeNull();
    }
  });

  test("an exempt binding without an expectation reserves and needs no RealityTrace", async () => {
    const d = deps({ configured: false });
    const pending = await prepare(d, binding({ reversibility: "read_only" }), intent(ID), undefined);
    expect(pending).toMatchObject({ expectation: null, threshold: null, window: null, reserved: true });
    expect(d.rt.calls).toHaveLength(0);
  });

  test("read_only with settlement: required and no expectation is refused at preflight", async () => {
    await expect(prepare(deps(), binding({ reversibility: "read_only", settlement: "required" }), intent(ID), undefined)).rejects.toBeInstanceOf(ObligationRefusal);
  });
});

describe("claims, discrimination, verification and closure", () => {
  test("the claims freeze the expectation digest, threshold, window, grace and argv digest", async () => {
    const d = deps();
    const pending = await prepare(d, binding(), intent(ID), EXPECTATION);
    expect(claimsFor(pending, 30)).toEqual({
      modality: "obligation",
      expectation_digest: pending.expectation_digest!,
      threshold_id: `t-${ID}`,
      threshold_ledger: "L1",
      threshold_position: 3,
      window_closes_at: pending.window!.closes_at,
      close_grace_s: 30,
      verifier_argv_digest: argvDigest(["/pinned/verifier", "--intent", ID]),
    });
    // The digest SEA-Forge recomputes: sha256 over the compact JSON array.
    expect(argvDigest(["a", "b"])).toBe(`sha256:${new Bun.CryptoHasher("sha256").update('["a","b"]').digest("hex")}`);
  });

  test("a discrimination run that observes the statement refuses execution; one that does not, proceeds", async () => {
    const yes = deps({ rt: fakeRt(() => 0) });
    const held = await prepare(yes, binding(), intent(ID), EXPECTATION);
    expect((await discriminateRun(yes, binding(), held)).decision).toEqual({ proceed: false, refusal: "expected outcome already holds before acting" });
    const no = deps({ rt: fakeRt(() => 1) });
    const fresh = await prepare(no, binding(), intent(ID), EXPECTATION);
    const { run, decision } = await discriminateRun(no, binding(), fresh);
    expect(decision).toEqual({ proceed: true });
    expect((await readPending(no.store(), "local", ID))!.pending.discrimination).toEqual(run!);
  });

  test("a changed verifier binary is never run: discrimination is unknown", async () => {
    const d = deps();
    const pending = await prepare(d, binding(), intent(ID), EXPECTATION);
    const result = await discriminateRun({ ...d, digestOf: () => "f".repeat(64) }, binding(), pending);
    expect(result).toEqual({ run: null, decision: { proceed: false, refusal: "discrimination unknown" } });
    expect(d.rt.calls.filter((c) => c.kind === "run")).toHaveLength(0);
  });

  test("verification is timed to end at least the grace before the deadline, and none starts inside it", async () => {
    let now = new Date();
    const d = deps({ now: () => now });
    const pending = await prepare(d, binding(), intent(ID), { ...EXPECTATION, window_s: 120 });
    const run = await verifyRun(d, binding(), pending);
    expect(run).not.toBeNull();
    expect(d.rt.calls.at(-1)!.timeoutS).toBeLessThanOrEqual(90);
    now = new Date(Date.parse(pending.window!.closes_at) - 20_000);
    expect(await verifyRun(d, binding(), pending)).toBeNull();
    expect((await readPending(d.store(), "local", ID))!.pending.verifications).toHaveLength(1);
  });

  test("the closure is handed to SEA-Forge with the recorded runs only after the window closes", async () => {
    let now = new Date();
    const d = deps({ now: () => now });
    let pending = await prepare(d, binding(), intent(ID), { ...EXPECTATION, window_s: 60 });
    await discriminateRun(d, binding(), pending);
    await verifyRun(d, binding(), (await readPending(d.store(), "local", ID))!.pending);
    pending = { ...(await readPending(d.store(), "local", ID))!.pending, operation_id: "op-1", stage: "executed" };
    const asked: unknown[] = [];
    const seaForge = { closure: async (...args: unknown[]) => (asked.push(args), { b: 12, c: 14, committed_at: now.toISOString(), on_time: true }) };
    expect(await close(d, pending, seaForge)).toBe(pending);
    expect(asked).toHaveLength(0);
    now = new Date(Date.parse(pending.window!.closes_at) + 1000);
    const closed = await close(d, pending, seaForge);
    expect(asked).toEqual([["op-1", "obs-12", ["obs-14"]]]);
    expect(closed.closure).toEqual({ b: 12, c: 14, committed_at: now.toISOString(), on_time: true });
  });
});
