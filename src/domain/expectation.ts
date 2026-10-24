/**
 * Expected outcomes and IS7 settlement (HORIZON-001 1.1.0, REQ-NAV-011, REQ-NAV-012, REQ-NAV-013).
 *
 * An expectation is formed before the outcome is observable and never revised (manifesto v17 §5).
 * Error is three-valued and `undefined` is resolved by modality. Only one combination is supported in
 * 1.1.0: an `obligation` checked by the RealityTrace `command` verifier, where exit 0 means "the
 * statement is observed". Every other combination is valid vocabulary and `blocked` at the gate.
 *
 * Pure: clocks, digests of files on disk and RealityTrace's records arrive as values. Ledger
 * positions, not wall-clock times, decide what evidence is admissible.
 */
import { createHash } from "node:crypto";
import type { GateAssessment, ReversibilityClass } from "./navigation.ts";

export const MODALITIES = ["obligation", "prohibition", "permission"] as const;
export type Modality = (typeof MODALITIES)[number];

export class ExpectationError extends Error {
  override readonly name = "ExpectationError";
  constructor(message: string) {
    super(`EXPECTATION: ${message}`);
  }
}

const reject = (message: string): never => {
  throw new ExpectationError(message);
};

const text = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim() === "") reject(`${field} must be a non-empty string`);
  return value as string;
};

const texts = (value: unknown, field: string): readonly string[] => {
  if (!Array.isArray(value)) reject(`${field} must be a list (it may be empty, but it must be stated)`);
  return Object.freeze((value as unknown[]).map((item, index) => text(item, `${field}[${index}]`)));
};

/* --------------------------------------------------------------------------------------------
 * Verifier templates (part of an operation's capability binding, reviewed and versioned with it)
 * ------------------------------------------------------------------------------------------ */

export type ArgvPart = { readonly artifact: string } | { readonly literal: string } | { readonly effect_identity: true };

export interface VerifierArtifact {
  readonly name: string;
  readonly sha256: string;
}

export interface VerifierTemplate {
  readonly template_id: string;
  readonly version: string;
  readonly kind: "command";
  /** argv[0] is a pinned artifact; other parts are pinned artifacts, fixed literals or the effect identity. */
  readonly argv: readonly ArgvPart[];
  /** Every file the verifier executes or loads as code, pinned by sha256. */
  readonly artifacts: readonly VerifierArtifact[];
  readonly read_only: true;
}

const SHA256 = /^[0-9a-f]{64}$/;

export const templateRef = (template: VerifierTemplate): string => `${template.template_id}@${template.version}`;

export function assertVerifierTemplate(value: unknown): VerifierTemplate {
  if (value === null || typeof value !== "object" || Array.isArray(value)) reject("a verifier template must be an object");
  const raw = value as Record<string, unknown>;
  const template_id = text(raw["template_id"], "template_id");
  const version = text(raw["version"], "version");
  if (raw["kind"] !== "command") reject(`verifier kind ${String(raw["kind"])} is not supported by the configured verifiers`);
  if (raw["read_only"] !== true) reject("a verifier template must declare read_only: true");
  if (!Array.isArray(raw["artifacts"]) || raw["artifacts"].length === 0) reject("a verifier template must pin at least its executable");
  const artifacts = (raw["artifacts"] as unknown[]).map((item, index) => {
    const artifact = (item ?? {}) as Record<string, unknown>;
    const name = text(artifact["name"], `artifacts[${index}].name`);
    if (typeof artifact["sha256"] !== "string" || !SHA256.test(artifact["sha256"])) reject(`artifact ${name} must be pinned by a lowercase sha256`);
    return Object.freeze({ name, sha256: artifact["sha256"] as string });
  });
  const names = new Set(artifacts.map((artifact) => artifact.name));
  if (names.size !== artifacts.length) reject("artifact names must be unique");
  if (!Array.isArray(raw["argv"]) || raw["argv"].length === 0) reject("a verifier template needs an argv");
  const argv = (raw["argv"] as unknown[]).map((item, index): ArgvPart => {
    const part = (item ?? {}) as Record<string, unknown>;
    const keys = Object.keys(part);
    if (keys.length !== 1) reject(`argv[${index}] must be exactly one of artifact, literal or effect_identity`);
    if ("artifact" in part) {
      if (typeof part["artifact"] !== "string" || !names.has(part["artifact"])) reject(`argv[${index}] names an unpinned artifact ${String(part["artifact"])}`);
      return { artifact: part["artifact"] as string };
    }
    if ("literal" in part) {
      if (typeof part["literal"] !== "string") reject(`argv[${index}].literal must be a string`);
      return { literal: part["literal"] as string };
    }
    if (part["effect_identity"] === true) return { effect_identity: true };
    return reject(`argv[${index}] must be exactly one of artifact, literal or effect_identity`);
  });
  if (!("artifact" in argv[0]!)) reject("argv[0] must be a pinned artifact");
  if (!argv.some((part) => "effect_identity" in part)) reject("a verifier template must check the operation's effect identity");
  return Object.freeze({ template_id, version, kind: "command", argv: Object.freeze(argv), artifacts: Object.freeze(artifacts), read_only: true });
}

/** Artifacts whose observed digest differs from the pin. A missing file is a mismatch. */
export function artifactMismatches(template: VerifierTemplate, observed: Readonly<Record<string, string | null>>): readonly string[] {
  return template.artifacts.filter((artifact) => observed[artifact.name] !== artifact.sha256).map((artifact) => artifact.name);
}

/** Instantiate the argv. Only the effect identity is substituted; artifact names resolve to their pinned paths. */
export function instantiate(template: VerifierTemplate, effectIdentity: string, pathOf: (artifact: string) => string): readonly string[] {
  text(effectIdentity, "effect identity");
  return Object.freeze(template.argv.map((part) => ("artifact" in part ? pathOf(part.artifact) : "literal" in part ? part.literal : effectIdentity)));
}

/* --------------------------------------------------------------------------------------------
 * The expected outcome
 * ------------------------------------------------------------------------------------------ */

export interface ExpectedOutcome {
  readonly modality: Modality;
  readonly statement: string;
  readonly refuted_by: string;
  readonly irrelevant: readonly string[];
  readonly unaccounted: readonly string[];
  /** A reference to the operation binding's vetted template. A verifier is never free text. */
  readonly verifier: { readonly template_ref: string };
  readonly window_s: number;
}

export function assertExpectedOutcome(value: unknown): ExpectedOutcome {
  if (value === null || typeof value !== "object" || Array.isArray(value)) reject("an expected outcome must be an object");
  const raw = value as Record<string, unknown>;
  const allowed = ["modality", "statement", "refuted_by", "irrelevant", "unaccounted", "verifier", "window_s"];
  const extra = Object.keys(raw).filter((key) => !allowed.includes(key));
  if (extra.length > 0) reject(`an expected outcome carries undeclared fields: ${extra.join(", ")}`);
  if (typeof raw["modality"] !== "string" || !(MODALITIES as readonly string[]).includes(raw["modality"])) reject(`unknown modality ${String(raw["modality"])}`);
  const verifier = raw["verifier"];
  if (verifier === null || typeof verifier !== "object" || Array.isArray(verifier)) {
    reject("verifier must reference the operation binding's template ({ template_ref }), not free text");
  }
  const verifierKeys = Object.keys(verifier as object);
  if (verifierKeys.length !== 1 || verifierKeys[0] !== "template_ref") reject("verifier must reference the operation binding's template ({ template_ref }), not free text");
  const window = raw["window_s"];
  if (typeof window !== "number" || !Number.isInteger(window) || window <= 0) reject("window_s must be a positive integer");
  return Object.freeze({
    modality: raw["modality"] as Modality,
    statement: text(raw["statement"], "statement"),
    refuted_by: text(raw["refuted_by"], "refuted_by"),
    irrelevant: texts(raw["irrelevant"], "irrelevant"),
    unaccounted: texts(raw["unaccounted"], "unaccounted"),
    verifier: Object.freeze({ template_ref: text((verifier as Record<string, unknown>)["template_ref"], "verifier.template_ref") }),
    window_s: window as number,
  });
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value as object).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** sha256 over the canonical JSON form; part of the intent's canonical input and duplicate check. */
export const expectationDigest = (expectation: ExpectedOutcome): string => `sha256:${createHash("sha256").update(canonical(expectation)).digest("hex")}`;

/* --------------------------------------------------------------------------------------------
 * Applicability and the settlement_access gate
 * ------------------------------------------------------------------------------------------ */

export interface SettlementBinding {
  /** `required` makes even a read-only operation require operational settlement. */
  readonly settlement?: "required";
  readonly verifier?: VerifierTemplate;
}

export const requiresSettlement = (reversibility: ReversibilityClass, binding: SettlementBinding): boolean =>
  reversibility !== "read_only" || binding.settlement === "required";

export interface SettlementAccessInput {
  readonly reversibility: ReversibilityClass;
  readonly binding: SettlementBinding;
  /** The concrete expectation as supplied (unvalidated), or undefined when none was supplied. */
  readonly expectation: unknown;
  /** Observed digests of the template's artifacts, by artifact name. */
  readonly observed_digests: Readonly<Record<string, string | null>>;
  /** SEA-Forge settlement with RealityTrace corroboration is configured. */
  readonly settlement_configured: boolean;
}

/**
 * REQ-NAV-013. The discrimination check is not an input: it runs after authority, inside the
 * invocation. Assessment, inspection and diagnostics never call this.
 */
export function settlementAccessGate(input: SettlementAccessInput, basisRef = "horizon:settlement-access"): GateAssessment {
  if (!requiresSettlement(input.reversibility, input.binding)) return { verdict: "pass", reason: "read_only: nothing to settle", basis_ref: basisRef };
  if (input.expectation === undefined) return { verdict: "fail", reason: "no expected outcome was stated", basis_ref: basisRef, prerequisite_ref: "expectation:state" };
  let expectation: ExpectedOutcome;
  try {
    expectation = assertExpectedOutcome(input.expectation);
  } catch (error) {
    return { verdict: "fail", reason: `invalid expected outcome: ${(error as Error).message}`, basis_ref: basisRef, prerequisite_ref: "expectation:state" };
  }
  const template = input.binding.verifier;
  if (template === undefined) return { verdict: "fail", reason: "the operation binding declares no vetted verifier template", basis_ref: basisRef, prerequisite_ref: "binding:verifier" };
  if (expectation.modality !== "obligation") {
    return { verdict: "fail", reason: `modality ${expectation.modality} is not supported by the configured verifiers`, basis_ref: basisRef };
  }
  if (expectation.verifier.template_ref !== templateRef(template)) {
    return { verdict: "fail", reason: `verifier ${expectation.verifier.template_ref} is not the binding's template ${templateRef(template)}`, basis_ref: basisRef };
  }
  const mismatched = artifactMismatches(template, input.observed_digests);
  if (mismatched.length > 0) return { verdict: "fail", reason: `verifier artifact digest mismatch: ${mismatched.join(", ")}`, basis_ref: basisRef };
  if (!input.settlement_configured) {
    return { verdict: "unknown", reason: "SEA-Forge settlement with RealityTrace corroboration is not configured", basis_ref: basisRef, prerequisite_ref: "settlement:configure" };
  }
  return { verdict: "pass", basis_ref: basisRef };
}

/* --------------------------------------------------------------------------------------------
 * Window, discrimination and evidence
 * ------------------------------------------------------------------------------------------ */

export interface SettlementWindow {
  readonly opens_at: string;
  readonly closes_at: string;
}

export const DEFAULT_CLOSE_GRACE_S = 30;

export const openWindow = (committedAt: Date, windowS: number): SettlementWindow =>
  Object.freeze({ opens_at: committedAt.toISOString(), closes_at: new Date(committedAt.getTime() + windowS * 1000).toISOString() });

/** An invocation that would start after the window closes is refused. */
export const windowOpen = (window: SettlementWindow, now: Date): boolean => now.getTime() < Date.parse(window.closes_at);

/**
 * The timeout for a verification run started at `now`: it must end at least `graceS` before the
 * deadline. Null means no run may start.
 */
export function runTimeoutS(window: SettlementWindow, now: Date, graceS = DEFAULT_CLOSE_GRACE_S): number | null {
  const remaining = Math.floor((Date.parse(window.closes_at) - graceS * 1000 - now.getTime()) / 1000);
  return remaining >= 1 ? remaining : null;
}

/** One RealityTrace `command` verifier record, as read from RealityTrace's own ledger. */
export interface VerifierEvidence {
  readonly ledger_position: number;
  readonly exit_code: number | null;
  /** Recorded by RealityTrace when its watchdog observed the child's exit (RT-1); null for old evidence. */
  readonly completed_at: string | null;
  readonly started_at: string | null;
  readonly argv: readonly string[];
  /** Whether every artifact digest matched immediately before this run. */
  readonly digests_ok: boolean;
  /** Started after the execution event (verification) — false for discrimination or earlier runs. */
  readonly started_after_execution: boolean;
}

export type RunResult = "known_0" | "known_nonzero" | "undefined";

export type DiscriminationDecision =
  | { readonly proceed: true }
  | { readonly proceed: false; readonly refusal: "expected outcome already holds before acting" | "discrimination unknown" };

/** Exit 0 before acting means the expectation cannot tell success from no change. */
export function discriminate(run: VerifierEvidence | null, expectedArgv: readonly string[]): DiscriminationDecision {
  if (run === null || run.exit_code === null || !run.digests_ok || !sameArgv(run.argv, expectedArgv)) return { proceed: false, refusal: "discrimination unknown" };
  if (run.exit_code === 0) return { proceed: false, refusal: "expected outcome already holds before acting" };
  return { proceed: true };
}

const sameArgv = (left: readonly string[], right: readonly string[]): boolean => left.length === right.length && left.every((part, index) => part === right[index]);

export interface EvidenceFrame {
  /** Ledger position of the discrimination run's evidence. */
  readonly B: number;
  /** Ledger head recorded at window close. */
  readonly C: number;
  readonly deadline: string;
  readonly expected_argv: readonly string[];
}

/** Admissible runs only (null when excluded), each with its three-valued result. */
export function classify(run: VerifierEvidence, frame: EvidenceFrame): RunResult | null {
  if (!run.started_after_execution) return null;
  if (run.ledger_position <= frame.B || run.ledger_position > frame.C) return null;
  if (run.completed_at === null || Date.parse(run.completed_at) > Date.parse(frame.deadline)) return "undefined";
  if (!run.digests_ok || !sameArgv(run.argv, frame.expected_argv) || run.exit_code === null) return "undefined";
  return run.exit_code === 0 ? "known_0" : "known_nonzero";
}

export type EpistemicStatus = "supported" | "contradicted" | "inconsistent" | "unresolved";
export type OperationalSettlement = "settled" | "rejected" | "unsettled" | "pending" | "not_required";

export interface SettlementJudgment {
  readonly epistemic_status: EpistemicStatus | null;
  readonly operational: OperationalSettlement;
  readonly reason: string;
  readonly admissible: number;
}

export interface ClosureRecord {
  readonly C: number;
  readonly recorded_at: string;
}

export interface SettlementInput {
  readonly requires: boolean;
  readonly expectation: ExpectedOutcome | null;
  readonly window: SettlementWindow | null;
  readonly now: Date;
  readonly closure: ClosureRecord | null;
  readonly B: number | null;
  readonly runs: readonly VerifierEvidence[];
  readonly expected_argv: readonly string[];
  readonly close_grace_s?: number;
}

/** REQ-NAV-012. SEA-Forge settles from RealityTrace's evidence; this is the rule Horizon records it by. */
export function judgeSettlement(input: SettlementInput): SettlementJudgment {
  if (!input.requires && input.expectation === null) return { epistemic_status: null, operational: "not_required", reason: "read_only: nothing to settle", admissible: 0 };
  if (input.expectation === null || input.window === null || input.B === null) return reject("an intent that requires settlement must carry an expectation, a window and a discrimination position");
  if (input.expectation.modality !== "obligation") return reject(`modality ${input.expectation.modality} is not supported in this version`);
  if (windowOpen(input.window, input.now)) return { epistemic_status: null, operational: "pending", reason: "the window is still open", admissible: 0 };
  const grace = input.close_grace_s ?? DEFAULT_CLOSE_GRACE_S;
  const latest = Date.parse(input.window.closes_at) + grace * 1000;
  if (input.closure === null || Date.parse(input.closure.recorded_at) > latest) {
    return { epistemic_status: "unresolved", operational: "rejected", reason: "no on-time closure record: C cannot be proven on time", admissible: 0 };
  }
  const frame: EvidenceFrame = { B: input.B, C: input.closure.C, deadline: input.window.closes_at, expected_argv: input.expected_argv };
  const results = input.runs.map((run) => classify(run, frame)).filter((result): result is RunResult => result !== null);
  const pass = results.includes("known_0");
  const failed = results.includes("known_nonzero");
  if (pass && failed) return { epistemic_status: "inconsistent", operational: "unsettled", reason: "known 0 and known non-zero results", admissible: results.length };
  if (pass) return { epistemic_status: "supported", operational: "settled", reason: "the statement was observed", admissible: results.length };
  if (failed) return { epistemic_status: "contradicted", operational: "rejected", reason: "the verifier refuted the statement", admissible: results.length };
  return { epistemic_status: "unresolved", operational: "rejected", reason: "asserted occurrence unsupported: no known result", admissible: results.length };
}
