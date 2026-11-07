/**
 * The obligation flow for a bound operation (HORIZON-001 1.1.0, SPEC-CR-002 §4 order of operations).
 *
 *   1. RealityTrace question + threshold (T)             -> prepare()
 *   2. pending intent + capacity reservation, atomically  -> prepare()
 *   3. SEA-Forge authority request carrying the claims    -> claimsFor() (the commit agent sends them)
 *   4. on allow, the confined discrimination run (B > T)  -> discriminateRun() (inside the commit run)
 *   5. execution (the NavigationIntentRecord)             -> the commit agent's record step
 *   6. verification runs (> B), after execution evidence  -> verifyRun()
 *   7. at window close, SEA-Forge records C itself        -> close()
 *   8. SEA-Forge settles from RealityTrace's ledger       -> close()
 *
 * Horizon decides nothing here that an owner records: RealityTrace records every run, SEA-Forge reads C and
 * settles. Horizon keeps a copy of what it was told, in the pending record, so a restart resumes the window.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { DurableStore } from "@godspeedai/cognate-events";
import {
  type DiscriminationDecision,
  type ExpectedOutcome,
  type VerifierEvidence,
  artifactMismatches,
  assertExpectedOutcome,
  discriminate,
  instantiate,
  openWindow,
  requiresSettlement,
  runTimeoutS,
  settlementAccessGate,
  windowOpen,
} from "../domain/expectation.ts";
import type { CommitIntentInput } from "../domain/intent.ts";
import type { GateAssessment } from "../domain/navigation.ts";
import { paymentGate } from "../domain/payment.ts";
import type { CapacityAllowance } from "../domain/payment.ts";
import type { OperationBindingConfig } from "../config/types.ts";
import type { DeclaredThreshold, RealityTraceObligation, VerifierRun } from "../adapters/realitytrace-obligation.ts";
import { readLedger } from "../capabilities/capacity-ledger.ts";
import { takeSnapshot } from "./snapshot.ts";

/** The concept the verifier run attests and the rulebook snapshot it runs under (were literals in the adapter). */
const RT_TARGET = "concept:navigation_intent";
const RT_SNAPSHOT = "snapshot:horizon";
import { type PendingIntent, reservePendingIntent, terminate, updatePending } from "../capabilities/pending-intent.ts";

export class ObligationRefusal extends Error {
  override readonly name = "ObligationRefusal";
  readonly code = "failed_precondition";
  constructor(readonly refusal: string) {
    super(`INTENT: refused (${refusal})`);
  }
}

export interface ObligationDeps {
  readonly store: () => DurableStore;
  readonly tenant: string;
  /** Null when RealityTrace is not configured for settlement. */
  readonly realityTrace: Pick<RealityTraceObligation, "declare" | "run"> | null;
  /** Null when no settlement confinement is configured. */
  readonly settlement: { readonly launcher: readonly string[]; readonly close_grace_s: number } | null;
  /** Where the verifier's read-only store snapshot is taken from and to. Absent: the verifier is not given one. */
  readonly snapshot?: { readonly liveStore: string; readonly dir: string };
  readonly allowances: readonly CapacityAllowance[];
  /** SEA-Forge settlement with RealityTrace corroboration is configured. */
  readonly settlementConfigured: boolean;
  readonly now: () => Date;
  readonly digestOf?: (path: string) => string | null;
}

/** sha256 of a file on this host, or null when it cannot be read (a missing artifact is a mismatch). */
export function fileDigest(path: string): string | null {
  try {
    return existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : null;
  } catch {
    return null;
  }
}

export function observedDigests(binding: OperationBindingConfig, digestOf: (path: string) => string | null = fileDigest): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const artifact of binding.verifier?.artifacts ?? []) {
    const path = binding.verifier_paths[artifact.name];
    out[artifact.name] = path ? digestOf(path) : null;
  }
  return out;
}

/** The verifier argv for this intent: only the effect identity (the intent id) is substituted. */
export function argvFor(binding: OperationBindingConfig, intentId: string): readonly string[] {
  if (!binding.verifier) throw new ObligationRefusal("the operation binding declares no vetted verifier template");
  return instantiate(binding.verifier, intentId, (name) => {
    const path = binding.verifier_paths[name];
    if (!path) throw new ObligationRefusal(`the binding names no path for artifact ${name}`);
    return path;
  });
}

export const argvDigest = (argv: readonly string[]): string => `sha256:${createHash("sha256").update(JSON.stringify(argv)).digest("hex")}`;

/** The gates a bound operation is assessed by before anything is recorded (REQ-NAV-009, REQ-NAV-013). */
export async function bindingGates(deps: ObligationDeps, binding: OperationBindingConfig, expectation: unknown): Promise<{ readonly payment: GateAssessment; readonly settlement_access: GateAssessment }> {
  const { ledger } = await readLedger(deps.store(), deps.tenant, deps.allowances);
  return {
    payment: paymentGate(binding.payment, ledger, deps.now()),
    settlement_access: settlementAccessGate({
      reversibility: binding.reversibility,
      binding: { ...(binding.settlement ? { settlement: binding.settlement } : {}), ...(binding.verifier ? { verifier: binding.verifier } : {}) },
      expectation,
      observed_digests: observedDigests(binding, deps.digestOf),
      settlement_configured: deps.settlementConfigured && deps.realityTrace !== null && deps.settlement !== null,
    }),
  };
}

/**
 * Steps 1-2: refuse unless both gates are available; register the expectation with RealityTrace (T); record the
 * pending intent and reserve its declared bounds in one commit. Exempt intents reserve too and carry no
 * expectation. Idempotent per intent (same expectation replays the stored record).
 */
export async function prepare(deps: ObligationDeps, binding: OperationBindingConfig, intent: CommitIntentInput, rawExpectation: unknown): Promise<PendingIntent> {
  const gates = await bindingGates(deps, binding, rawExpectation);
  for (const [name, gate] of Object.entries(gates)) {
    if (gate.verdict !== "pass") throw new ObligationRefusal(`${name} is ${gate.verdict === "fail" ? "blocked" : gate.verdict}: ${gate.reason ?? ""}`.trim());
  }
  const now = deps.now();
  const requires = requiresSettlement(binding.reversibility, binding);
  if (!requires && rawExpectation === undefined) {
    return reservePendingIntent(deps.store(), {
      tenant: deps.tenant,
      pending: { intent, operation_ref: binding.operation_ref, expectation: null, threshold: null, window: null, verifier_argv: null },
      payment: { entries: binding.payment, allowances: deps.allowances },
      now,
    });
  }
  const expectation: ExpectedOutcome = assertExpectedOutcome(rawExpectation);
  const threshold: DeclaredThreshold = await deps.realityTrace!.declare({ intentId: intent.intent_id, statement: expectation.statement, target: RT_TARGET, criteria: { minimum_relevance: "medium", minimum_reliability: "medium" } });
  return reservePendingIntent(deps.store(), {
    tenant: deps.tenant,
    pending: { intent, operation_ref: binding.operation_ref, expectation, threshold, window: openWindow(now, expectation.window_s), verifier_argv: argvFor(binding, intent.intent_id) },
    payment: { entries: binding.payment, allowances: deps.allowances },
    now,
  });
}

/** Step 3: what the authority request asserts, verbatim (recorded by SEA-Forge with its decision). */
export function claimsFor(pending: PendingIntent, closeGraceS: number): Readonly<Record<string, string | number>> | undefined {
  if (!pending.expectation || !pending.threshold || !pending.window || !pending.verifier_argv) return undefined;
  return {
    modality: pending.expectation.modality,
    expectation_digest: pending.expectation_digest!,
    threshold_id: pending.threshold.threshold_id,
    threshold_ledger: pending.threshold.position.ledger_id,
    threshold_position: pending.threshold.position.ordinal,
    window_closes_at: pending.window.closes_at,
    close_grace_s: closeGraceS,
    verifier_argv_digest: argvDigest(pending.verifier_argv),
  };
}

const evidenceOf = (run: VerifierRun, argv: readonly string[]): VerifierEvidence => ({
  ledger_position: run.position.ordinal,
  exit_code: run.crashed ? null : run.exit_code,
  completed_at: run.completed_at,
  started_at: run.started_at,
  argv,
  digests_ok: true,
  started_after_execution: false,
});

/** Run the pinned verifier once under the launcher, after re-checking every artifact digest. Null: not run. */
async function runVerifier(deps: ObligationDeps, binding: OperationBindingConfig, pending: PendingIntent, timeoutS: number): Promise<VerifierRun | null> {
  return (await runVerifierWith(deps, binding, pending, timeoutS)).run;
}

/** As runVerifier, saying why when the snapshot the verifier reads could not be taken (never run on a stale one). */
async function runVerifierWith(deps: ObligationDeps, binding: OperationBindingConfig, pending: PendingIntent, timeoutS: number): Promise<{ readonly run: VerifierRun | null; readonly snapshotFailure?: string }> {
  if (!deps.realityTrace || !deps.settlement || !binding.verifier || !pending.threshold || !pending.verifier_argv) return { run: null };
  // Before every run: a digest mismatch makes the run undefined, so it is never run at all.
  if (artifactMismatches(binding.verifier, observedDigests(binding, deps.digestOf)).length > 0) return { run: null };
  if (deps.snapshot) {
    try {
      takeSnapshot(deps.snapshot.liveStore, deps.snapshot.dir);
    } catch (error) {
      return { run: null, snapshotFailure: error instanceof Error ? error.message : String(error) };
    }
  }
  try {
    return { run: await deps.realityTrace.run(pending.threshold, pending.verifier_argv, deps.settlement.launcher, timeoutS, { target: RT_TARGET, snapshot: RT_SNAPSHOT }) };
  } catch {
    return { run: null };
  }
}

/**
 * Step 4, inside the authorized commit run and before execution. A window already closed refuses the
 * invocation; a run that observes the statement (exit 0) or cannot complete refuses execution.
 */
export async function discriminateRun(deps: ObligationDeps, binding: OperationBindingConfig, pending: PendingIntent): Promise<{ readonly run: VerifierRun | null; readonly decision: DiscriminationDecision }> {
  if (pending.window && !windowOpen(pending.window, deps.now())) return { run: null, decision: { proceed: false, refusal: "discrimination unknown" } };
  const timeout = pending.window ? runTimeoutS(pending.window, deps.now(), deps.settlement?.close_grace_s) : null;
  const attempt = timeout === null ? { run: null } : await runVerifierWith(deps, binding, pending, Math.min(timeout, 120));
  const run = attempt.run;
  const decision: DiscriminationDecision = "snapshotFailure" in attempt && attempt.snapshotFailure
    ? { proceed: false, refusal: `discrimination unknown: ${attempt.snapshotFailure}` }
    : discriminate(run ? evidenceOf(run, pending.verifier_argv ?? []) : null, pending.verifier_argv ?? []);
  await updatePending(deps.store(), deps.tenant, pending.intent.intent_id, () => (run ? { discrimination: run } : {}));
  return { run, decision };
}

/** Refuse the intent: terminal with its reason, reservation consumed. */
export async function refuse(deps: ObligationDeps, intentId: string, refusal: string): Promise<never> {
  await terminate(deps.store(), deps.tenant, intentId, "refused", refusal, deps.now());
  throw new ObligationRefusal(refusal);
}

/** Step 6: one verification run after execution, timed to end before the deadline minus the grace. */
export async function verifyRun(deps: ObligationDeps, binding: OperationBindingConfig, pending: PendingIntent): Promise<VerifierRun | null> {
  if (!pending.window) return null;
  const timeout = runTimeoutS(pending.window, deps.now(), deps.settlement?.close_grace_s);
  if (timeout === null) return null;
  const run = await runVerifier(deps, binding, pending, timeout);
  if (run) await updatePending(deps.store(), deps.tenant, pending.intent.intent_id, (current) => ({ verifications: [...(current.verifications ?? []), run] }));
  return run;
}

export interface SeaForgeObligation {
  /** `authority_closure`: SEA-Forge reads RealityTrace's head (C) itself and stamps the closure. */
  closure(operationId: string, discriminationObservationId: string, verificationObservationIds: readonly string[]): Promise<{ readonly b: number; readonly c: number; readonly committed_at: string; readonly on_time: boolean }>;
}

/** Step 7: record the closure at SEA-Forge once the window has closed; idempotent at SEA-Forge (first wins). */
export async function close(deps: ObligationDeps, pending: PendingIntent, seaForge: SeaForgeObligation): Promise<PendingIntent> {
  if (!pending.window || windowOpen(pending.window, deps.now()) || pending.closure) return pending;
  if (!pending.operation_id || !pending.discrimination) return pending;
  const closure = await seaForge.closure(pending.operation_id, pending.discrimination.observation_id, (pending.verifications ?? []).map((run) => run.observation_id));
  return updatePending(deps.store(), deps.tenant, pending.intent.intent_id, () => ({ closure }));
}
