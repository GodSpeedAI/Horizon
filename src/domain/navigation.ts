/**
 * `horizon.navigation/2` — deterministic, observer-relative navigation (T07).
 *
 * The controller is pure. It reads no clock, no store and no network: every fact arrives as a
 * typed reference, and every gate outcome is an observation someone else made. That is what makes
 * the frame reproducible and what keeps gate evaluation from becoming invocation authority
 * (REQ-NAV-006, REQ-OUT-002).
 *
 * The vocabulary is the canonical IDM's, not a second one:
 *   - `AffordanceStatus` — possible | available | blocked | unknown | conflicted
 *   - `GateKey` — exactly visibility, reach, payment, authority, capability, recovery,
 *     settlement_access
 *   - `AuthorityOutcome` — the six REQ-NAV-006 values, plus `not_applicable` for read-only moves
 *   - `ReversibilityClass`, `NavigationResponsibility`
 *
 * A case is a derived view over authoritative fact references and a declared direction. It has no
 * entities, classes or predicates of its own: adding one would make it a competing ontology
 * (REQ-CASE-001). Nothing here is stored, so there is no second case database.
 */

export const NAVIGATION_SCHEMA = "horizon.navigation/2" as const;

export const GATE_KEYS = [
  "visibility",
  "reach",
  "payment",
  "authority",
  "capability",
  "recovery",
  "settlement_access",
] as const;
export type GateKey = (typeof GATE_KEYS)[number];

export const AFFORDANCE_STATUSES = ["possible", "available", "blocked", "unknown", "conflicted"] as const;
export type AffordanceStatus = (typeof AFFORDANCE_STATUSES)[number];

export const AUTHORITY_OUTCOMES = [
  "likely_allow",
  "requires_approval",
  "deferred_to_invocation",
  "denied",
  "unreachable",
  "unknown",
  "not_applicable",
] as const;
export type AuthorityOutcome = (typeof AUTHORITY_OUTCOMES)[number];

export const REVERSIBILITY_CLASSES = ["read_only", "reversible", "compensable", "irreversible", "unknown"] as const;
export type ReversibilityClass = (typeof REVERSIBILITY_CLASSES)[number];

export const NAVIGATION_RESPONSIBILITIES = ["orient", "inspect", "choose", "commit", "observe", "review"] as const;
export type NavigationResponsibility = (typeof NAVIGATION_RESPONSIBILITIES)[number];

export type GateVerdict = "pass" | "fail" | "unknown" | "conflicted";

export class NavigationError extends Error {
  override readonly name = "NavigationError";
  constructor(
    readonly code: "invalid_argument" | "undeclared_gate" | "stale_frame" | "unavailable_choice",
    message: string,
  ) {
    super(`NAVIGATION: ${message}`);
  }
}

const fail = (message: string): never => {
  throw new NavigationError("invalid_argument", message);
};

function nonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") fail(`${field} must be a non-empty string`);
  return value as string;
}

/* --------------------------------------------------------------------------------------------
 * Gates
 * ------------------------------------------------------------------------------------------ */

export interface GateAssessment {
  readonly verdict: GateVerdict;
  /** Required for every non-pass verdict: a blocked gate without a reason is not evidence. */
  readonly reason?: string;
  readonly basis_ref?: string;
  /**
   * A known, reachable step that would clear this gate. "Ask an approver" is a prerequisite;
   * "blocked" alone tells the observer nothing they can act on (REQ-NAV-003).
   */
  readonly prerequisite_ref?: string;
  /** Only the authority gate carries an AuthorityOutcome. */
  readonly authority_outcome?: AuthorityOutcome;
}

export type AffordanceGates = Readonly<Record<GateKey, GateAssessment>>;

const VERDICTS = new Set<GateVerdict>(["pass", "fail", "unknown", "conflicted"]);
const AUTHORITY = new Set<AuthorityOutcome>(AUTHORITY_OUTCOMES);

/**
 * Validate a gate map against the closed key set. A missing key is refused because a default would
 * silently invent an assessment; an extra key is refused because it would become a second gate
 * vocabulary (REQ-NAV-002).
 */
export function assertGates(value: unknown): AffordanceGates {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("gates must be an object");
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const missing = GATE_KEYS.filter((key) => !keys.includes(key));
  const extra = keys.filter((key) => !(GATE_KEYS as readonly string[]).includes(key));
  if (missing.length > 0) fail(`gates are missing canonical keys: ${missing.join(", ")}`);
  if (extra.length > 0) fail(`gates carry non-canonical keys: ${extra.join(", ")}`);

  const gates = {} as Record<GateKey, GateAssessment>;
  for (const key of GATE_KEYS) {
    const raw = record[key];
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) fail(`gate ${key} must be an object`);
    const entry = raw as Record<string, unknown>;
    const verdict = entry["verdict"];
    if (typeof verdict !== "string" || !VERDICTS.has(verdict as GateVerdict)) {
      fail(`gate ${key} has no valid verdict`);
    }
    if (verdict !== "pass" && (typeof entry["reason"] !== "string" || (entry["reason"] as string).trim() === "")) {
      fail(`gate ${key} is ${String(verdict)} without a material reason`);
    }
    if (key === "authority") {
      const outcome = entry["authority_outcome"];
      if (typeof outcome !== "string" || !AUTHORITY.has(outcome as AuthorityOutcome)) {
        fail("the authority gate must carry one of the canonical authority outcomes");
      }
      gates[key] = {
        verdict: verdict as GateVerdict,
        ...(typeof entry["reason"] === "string" ? { reason: entry["reason"] } : {}),
        ...(typeof entry["basis_ref"] === "string" ? { basis_ref: entry["basis_ref"] } : {}),
        ...(typeof entry["prerequisite_ref"] === "string" ? { prerequisite_ref: entry["prerequisite_ref"] } : {}),
        authority_outcome: outcome as AuthorityOutcome,
      };
      continue;
    }
    if (entry["authority_outcome"] !== undefined) fail(`gate ${key} must not carry an authority outcome`);
    gates[key] = {
      verdict: verdict as GateVerdict,
      ...(typeof entry["reason"] === "string" ? { reason: entry["reason"] } : {}),
      ...(typeof entry["basis_ref"] === "string" ? { basis_ref: entry["basis_ref"] } : {}),
      ...(typeof entry["prerequisite_ref"] === "string" ? { prerequisite_ref: entry["prerequisite_ref"] } : {}),
    };
  }
  return Object.freeze(gates);
}

/* --------------------------------------------------------------------------------------------
 * Candidates and assessment
 * ------------------------------------------------------------------------------------------ */

export interface PaymentEstimate {
  readonly estimate: string;
  /** Where the estimate came from. Advisory only; it never changes a gate (REQ-NAV-002). */
  readonly provenance: string;
}

export interface EscalationBehavior {
  readonly behavior: "none" | "approval" | "unknown";
  readonly approval_ref?: string;
  readonly note?: string;
}

export interface CandidateOperation {
  readonly operation_ref: string;
  readonly label: string;
  /** `move` is a world-touching choice; `navigation` is read-only exploration. */
  readonly kind: "move" | "navigation";
  readonly responsibility: NavigationResponsibility;
  readonly reversibility: ReversibilityClass;
  readonly gates: AffordanceGates;
  readonly payment?: PaymentEstimate;
  readonly expected_evidence?: readonly string[];
  readonly escalation?: EscalationBehavior;
}

export interface Blocker {
  readonly gate: GateKey;
  readonly severity: "blocked" | "unknown";
  readonly reason: string;
  readonly prerequisite_ref?: string;
}

export interface AffordanceAssessment {
  readonly operation_ref: string;
  readonly label: string;
  readonly kind: "move" | "navigation";
  readonly responsibility: NavigationResponsibility;
  readonly status: Exclude<AffordanceStatus, "possible">;
  readonly gates: AffordanceGates;
  readonly blockers: readonly Blocker[];
  readonly first_blocker: string | null;
  readonly next_prerequisite_ref: string | null;
  readonly reversibility: ReversibilityClass;
  readonly payment: PaymentEstimate | null;
  readonly expected_evidence: readonly string[];
  readonly escalation: EscalationBehavior | null;
  readonly spendable: boolean;
  readonly basis_refs: readonly string[];
}

function isConsequential(reversibility: ReversibilityClass): boolean {
  return reversibility !== "read_only";
}

function recoveryIsHard(reversibility: ReversibilityClass): boolean {
  return reversibility === "irreversible" || reversibility === "unknown";
}

/**
 * Assess one candidate. Availability is the *last* outcome: every failed or unknown hard gate is
 * collected first, so a later pass cannot mask an earlier problem.
 *
 * The authority mapping follows the T02 behavioral proof: likely_allow and deferred_to_invocation
 * pass without granting, requires_approval is pending, denied blocks, and unreachable/unknown
 * block as unknown.
 */
export function assessAffordance(candidate: CandidateOperation): AffordanceAssessment {
  nonEmpty(candidate.operation_ref, "operation_ref");
  nonEmpty(candidate.label, "label");
  if (!REVERSIBILITY_CLASSES.includes(candidate.reversibility)) fail(`unknown reversibility ${String(candidate.reversibility)}`);
  const gates = assertGates(candidate.gates);
  const blockers: Blocker[] = [];
  const consequential = isConsequential(candidate.reversibility);

  const authority = gates.authority;
  const outcome = authority.authority_outcome ?? "unknown";
  if (consequential && outcome === "not_applicable") {
    blockers.push({ gate: "authority", severity: "unknown", reason: "consequential operation declares authority not applicable" });
  } else if (outcome === "denied") {
    blockers.push({ gate: "authority", severity: "blocked", reason: authority.reason ?? "authority denied" });
  } else if (outcome === "requires_approval") {
    blockers.push({
      gate: "authority",
      severity: "blocked",
      reason: authority.reason ?? "approval required",
      ...(authority.prerequisite_ref !== undefined ? { prerequisite_ref: authority.prerequisite_ref } : { prerequisite_ref: "authority:approval" }),
    });
  } else if (outcome === "unreachable" || outcome === "unknown") {
    blockers.push({
      gate: "authority",
      severity: "unknown",
      reason: authority.reason ?? `authority outcome ${outcome}`,
    });
  } else if (authority.verdict !== "pass") {
    blockers.push({ gate: "authority", severity: "blocked", reason: authority.reason ?? "authority did not pass" });
  }

  for (const key of GATE_KEYS) {
    if (key === "authority") continue;
    const gate = gates[key];
    if (gate.verdict === "pass") continue;
    if (key === "recovery" && !recoveryIsHard(candidate.reversibility)) continue;
    blockers.push({
      gate: key,
      severity: gate.verdict === "conflicted" ? "blocked" : gate.verdict === "fail" ? "blocked" : "unknown",
      reason: gate.reason ?? `${key} is ${gate.verdict}`,
      ...(gate.prerequisite_ref !== undefined ? { prerequisite_ref: gate.prerequisite_ref } : {}),
    });
  }

  const conflicts = blockers.filter((blocker) => gates[blocker.gate].verdict === "conflicted");
  const status: Exclude<AffordanceStatus, "possible"> =
    conflicts.length > 0 ? "conflicted" : blockers.some((blocker) => blocker.severity === "blocked") ? "blocked" : blockers.length > 0 ? "unknown" : "available";

  const ordered = [...blockers].sort((left, right) => {
    if (left.severity !== right.severity) return left.severity === "blocked" ? -1 : 1;
    return GATE_KEYS.indexOf(left.gate) - GATE_KEYS.indexOf(right.gate);
  });
  const first = ordered[0] ?? null;
  const prerequisite = ordered.find((blocker) => blocker.prerequisite_ref !== undefined)?.prerequisite_ref ?? null;
  const basis = [...new Set([...GATE_KEYS.map((key) => gates[key].basis_ref).filter((ref): ref is string => ref !== undefined), ...(candidate.expected_evidence ?? [])])].sort();

  return Object.freeze({
    operation_ref: candidate.operation_ref,
    label: candidate.label,
    kind: candidate.kind,
    responsibility: candidate.responsibility,
    status,
    gates,
    blockers: Object.freeze(ordered),
    first_blocker: first === null ? null : `${first.gate}: ${first.reason}`,
    next_prerequisite_ref: prerequisite,
    reversibility: candidate.reversibility,
    payment: candidate.payment ?? null,
    expected_evidence: Object.freeze([...(candidate.expected_evidence ?? [])]),
    escalation: candidate.escalation ?? null,
    spendable: status === "available",
    basis_refs: Object.freeze(basis),
  });
}

/* --------------------------------------------------------------------------------------------
 * Case derivation
 * ------------------------------------------------------------------------------------------ */

export interface CaseDirection {
  readonly direction_ref: string;
  readonly statement: string;
  readonly target_ref: string;
}

export interface CaseFact {
  readonly fact_ref: string;
  readonly subject_ref: string;
  /** The authoritative record the fact was read from. */
  readonly source_ref: string;
  readonly statement: string;
  readonly deviation: boolean;
  /** Only a deviation can be material; a material fact without a deviation is refused. */
  readonly material: boolean;
}

export interface CaseInput {
  readonly case_ref: string;
  readonly purpose: string;
  readonly world_ref: string;
  readonly focus_ref: string;
  readonly direction: CaseDirection;
  readonly facts: readonly CaseFact[];
}

export interface DerivedCase {
  readonly case_ref: string;
  readonly purpose: string;
  readonly world_ref: string;
  readonly focus_ref: string;
  readonly direction_ref: string;
  readonly target_ref: string;
  readonly authoritative_fact_refs: readonly string[];
  readonly material_deviations: readonly CaseFact[];
  /** No material deviation: the observer may choose, but nothing forces a settlement. */
  readonly optional_only: boolean;
  readonly ontology: null;
}

const CASE_INPUT_KEYS = new Set(["case_ref", "purpose", "world_ref", "focus_ref", "direction", "facts"]);
const CASE_DIRECTION_KEYS = new Set(["direction_ref", "statement", "target_ref"]);
const CASE_FACT_KEYS = new Set(["fact_ref", "subject_ref", "source_ref", "statement", "deviation", "material"]);

function assertKeys(record: Record<string, unknown>, allowed: ReadonlySet<string>, what: string): void {
  const extra = Object.keys(record).filter((key) => !allowed.has(key));
  if (extra.length > 0) fail(`${what} carries undeclared fields: ${extra.join(", ")}`);
}

/**
 * Derive a case from facts and a declared direction.
 *
 * The result contains refs, statements and flags only. There is deliberately no entity, class or
 * predicate section, and unknown keys are refused, so a case cannot quietly become an ontology.
 */
export function deriveCase(input: CaseInput): DerivedCase {
  if (input === null || typeof input !== "object" || Array.isArray(input)) fail("case input must be an object");
  const record = input as unknown as Record<string, unknown>;
  assertKeys(record, CASE_INPUT_KEYS, "case input");
  nonEmpty(record["case_ref"], "case_ref");
  nonEmpty(record["purpose"], "purpose");
  nonEmpty(record["world_ref"], "world_ref");
  nonEmpty(record["focus_ref"], "focus_ref");
  const direction = record["direction"];
  if (direction === null || typeof direction !== "object" || Array.isArray(direction)) fail("case direction must be an object");
  const directionRecord = direction as Record<string, unknown>;
  assertKeys(directionRecord, CASE_DIRECTION_KEYS, "case direction");
  nonEmpty(directionRecord["direction_ref"], "direction_ref");
  nonEmpty(directionRecord["statement"], "direction statement");
  nonEmpty(directionRecord["target_ref"], "direction target_ref");

  const facts = record["facts"];
  if (!Array.isArray(facts) || facts.length === 0) return fail("case requires at least one authoritative fact");
  const parsed: CaseFact[] = [];
  for (const raw of facts) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return fail("each case fact must be an object");
    const fact = raw as Record<string, unknown>;
    assertKeys(fact, CASE_FACT_KEYS, "case fact");
    nonEmpty(fact["fact_ref"], "fact_ref");
    nonEmpty(fact["subject_ref"], "fact subject_ref");
    nonEmpty(fact["source_ref"], "fact source_ref");
    nonEmpty(fact["statement"], "fact statement");
    const deviation = fact["deviation"];
    const material = fact["material"];
    if (typeof deviation !== "boolean") return fail("fact deviation must be boolean");
    if (typeof material !== "boolean") return fail("fact material must be boolean");
    if (material && !deviation) return fail("a material fact must also be a deviation");
    parsed.push({
      fact_ref: fact["fact_ref"] as string,
      subject_ref: fact["subject_ref"] as string,
      source_ref: fact["source_ref"] as string,
      statement: fact["statement"] as string,
      deviation,
      material,
    });
  }

  const material = parsed.filter((fact) => fact.material);
  return Object.freeze({
    case_ref: record["case_ref"] as string,
    purpose: record["purpose"] as string,
    world_ref: record["world_ref"] as string,
    focus_ref: record["focus_ref"] as string,
    direction_ref: directionRecord["direction_ref"] as string,
    target_ref: directionRecord["target_ref"] as string,
    authoritative_fact_refs: Object.freeze(parsed.map((fact) => fact.fact_ref)),
    material_deviations: Object.freeze(material),
    optional_only: material.length === 0,
    ontology: null,
  });
}

/* --------------------------------------------------------------------------------------------
 * Context selection
 * ------------------------------------------------------------------------------------------ */

export interface ContextSelection {
  readonly resolved: readonly string[];
  readonly unresolved: readonly string[];
  /** Only unresolved fields are asked for (REQ-NAV-005). */
  readonly questions: readonly string[];
}

export function planContextSelection(
  required: readonly string[],
  resolved: Readonly<Record<string, unknown>>,
): ContextSelection {
  const present: string[] = [];
  const missing: string[] = [];
  for (const field of required) {
    const value = resolved[field];
    if (value !== undefined && value !== null && value !== "") present.push(field);
    else missing.push(field);
  }
  return Object.freeze({
    resolved: Object.freeze(present),
    unresolved: Object.freeze(missing),
    questions: Object.freeze([...missing]),
  });
}

/* --------------------------------------------------------------------------------------------
 * Frames
 * ------------------------------------------------------------------------------------------ */

export interface NavigationContext {
  readonly observer_ref: string;
  readonly tenant_ref: string;
  readonly world_ref: string;
  /** Null means the operational checkpoint is explicitly unknown, with a reason. */
  readonly checkpoint_ref: string | null;
  readonly checkpoint_unknown_reason: string | null;
  readonly focus_ref: string;
  readonly case_ref: string | null;
}

export interface SettlementJudgment {
  readonly authorized: boolean;
  readonly authority_ref: string;
  readonly judgment_ref: string;
}

export interface PossibleOperation {
  readonly operation_ref: string;
  readonly label: string;
}

export interface NavigationFrameInput {
  readonly frame_id: string;
  readonly revision: number;
  readonly context: NavigationContext;
  readonly case: DerivedCase | null;
  readonly possible_operations: readonly PossibleOperation[];
  readonly candidates: readonly CandidateOperation[];
  readonly settlement_judgment?: SettlementJudgment;
}

export interface NavigationChoice extends AffordanceAssessment {
  readonly is_primary: boolean;
  /** False for every blocked, unknown or conflicted choice, whatever a UI says. */
  readonly selectable: boolean;
}

export interface NavigationFrame {
  readonly schema: typeof NAVIGATION_SCHEMA;
  readonly frame_id: string;
  readonly revision: number;
  readonly previous_frame_id: string | null;
  readonly observer_ref: string;
  readonly tenant_ref: string;
  readonly world_ref: string;
  readonly checkpoint_ref: string | null;
  readonly checkpoint_unknown_reason: string | null;
  readonly focus_ref: string;
  readonly case_ref: string | null;
  readonly view_mode: NavigationResponsibility;
  readonly possible_operation_refs: readonly string[];
  readonly choices: readonly NavigationChoice[];
  readonly allowed_choice_refs: readonly string[];
  readonly primary_choice_ref: string | null;
  readonly decision: "owner_choice" | "primary_available" | "no_affordance" | "inspect";
  readonly settlement_reachable: boolean;
  readonly should_settle_now: boolean;
  readonly settlement_reason: string;
  readonly reasons: readonly string[];
  readonly evidence_refs: readonly string[];
  /** Literal: no frame value grants authority (REQ-NAV-006, REQ-OUT-002). */
  readonly authority: { readonly grants_authority: false };
}

export function selectViewMode(input: {
  readonly checkpoint_known: boolean;
  readonly has_case: boolean;
  readonly optional_only: boolean;
  readonly has_available_move: boolean;
}): NavigationResponsibility {
  if (!input.checkpoint_known) return "orient";
  if (!input.has_case) return "inspect";
  if (input.optional_only) return "choose";
  if (input.has_available_move) return "commit";
  return "review";
}

function assertContext(context: NavigationContext): void {
  nonEmpty(context.observer_ref, "observer_ref");
  nonEmpty(context.tenant_ref, "tenant_ref");
  nonEmpty(context.world_ref, "world_ref");
  nonEmpty(context.focus_ref, "focus_ref");
  const known = typeof context.checkpoint_ref === "string" && context.checkpoint_ref.trim() !== "";
  const reason = typeof context.checkpoint_unknown_reason === "string" && context.checkpoint_unknown_reason.trim() !== "";
  if (known && reason) fail("a context cannot have both a checkpoint and an unknown reason");
  if (!known && !reason) fail("a context must carry a checkpoint or an explicit unknown reason");
}

function assertReviewable(assessment: AffordanceAssessment): void {
  if (!isConsequential(assessment.reversibility)) return;
  if (assessment.payment === null) fail(`${assessment.operation_ref} is consequential but carries no payment estimate`);
  if (assessment.expected_evidence.length === 0) fail(`${assessment.operation_ref} is consequential but declares no expected evidence`);
  if (assessment.escalation === null) fail(`${assessment.operation_ref} is consequential but declares no escalation behavior`);
}

function observerControls(): readonly CandidateOperation[] {
  const control = (operation_ref: string, label: string, responsibility: NavigationResponsibility): CandidateOperation => ({
    operation_ref,
    label,
    kind: "navigation",
    responsibility,
    reversibility: "read_only",
    gates: {
      visibility: { verdict: "pass", basis_ref: "horizon.navigation:observer-control" },
      reach: { verdict: "pass", basis_ref: "horizon.navigation:observer-control" },
      payment: { verdict: "pass", basis_ref: "horizon.navigation:observer-control" },
      authority: { verdict: "pass", authority_outcome: "not_applicable", basis_ref: "horizon.navigation:observer-control" },
      capability: { verdict: "pass", basis_ref: "horizon.navigation:observer-control" },
      recovery: { verdict: "pass", basis_ref: "horizon.navigation:observer-control" },
      settlement_access: { verdict: "pass", basis_ref: "horizon.navigation:observer-control" },
    },
  });
  return [
    control("horizon.navigation.inspect", "Inspect another alternative", "inspect"),
    control("horizon.navigation.defer", "Defer this decision", "choose"),
    control("horizon.navigation.reframe", "Reframe the problem", "orient"),
    control("horizon.navigation.disagree", "Disagree with this representation", "review"),
  ];
}

function deepFreezeFrame(frame: NavigationFrame): NavigationFrame {
  for (const choice of frame.choices) Object.freeze(choice);
  Object.freeze(frame.choices);
  Object.freeze(frame.possible_operation_refs);
  Object.freeze(frame.allowed_choice_refs);
  Object.freeze(frame.reasons);
  Object.freeze(frame.evidence_refs);
  Object.freeze(frame.authority);
  return Object.freeze(frame);
}

export function buildNavigationFrame(input: NavigationFrameInput): NavigationFrame {
  nonEmpty(input.frame_id, "frame_id");
  if (!Number.isInteger(input.revision) || input.revision < 0) fail("revision must be a non-negative integer");
  assertContext(input.context);

  if (input.case !== null) {
    if (input.case.world_ref !== input.context.world_ref) fail("case world_ref does not match the context world_ref");
    if (input.case.focus_ref !== input.context.focus_ref) fail("case focus_ref does not match the context focus_ref");
    if (input.case.case_ref !== input.context.case_ref) fail("case case_ref does not match the context case_ref");
  }

  const seen = new Set<string>();
  for (const candidate of input.candidates) {
    if (seen.has(candidate.operation_ref)) fail(`candidate ${candidate.operation_ref} appears twice`);
    seen.add(candidate.operation_ref);
  }
  for (const operation of input.possible_operations) {
    nonEmpty(operation.operation_ref, "possible operation_ref");
  }

  const assessed = input.candidates.map(assessAffordance);
  for (const assessment of assessed) assertReviewable(assessment);
  const controls = observerControls().map(assessAffordance);
  const availableMoves = assessed
    .filter((assessment) => assessment.kind === "move" && assessment.status === "available")
    .sort((left, right) => (left.operation_ref < right.operation_ref ? -1 : left.operation_ref > right.operation_ref ? 1 : 0));
  const validate = input.case !== null && input.case.material_deviations.length > 0;
  // Ranking never creates eligibility: `availableMoves` already excludes every non-available path,
  // and the survivor order is the operation ref, not a caller-supplied "high value" hint.
  const primary = validate ? (availableMoves[0] ?? null) : null;

  const possibleRefs = [
    ...new Set([
      ...input.possible_operations.map((operation) => operation.operation_ref),
      ...input.candidates.map((candidate) => candidate.operation_ref),
    ]),
  ].sort();

  const choices: NavigationChoice[] = [...assessed, ...controls]
    .map((assessment) => ({
      ...assessment,
      is_primary: primary !== null && assessment.operation_ref === primary.operation_ref,
      selectable: assessment.status === "available",
    }))
    .sort((left, right) => {
      if (left.is_primary !== right.is_primary) return left.is_primary ? -1 : 1;
      if (left.kind !== right.kind) return left.kind === "move" ? -1 : 1;
      return left.operation_ref < right.operation_ref ? -1 : left.operation_ref > right.operation_ref ? 1 : 0;
    });

  const settlementReachable = availableMoves.some((assessment) => assessment.gates.settlement_access.verdict === "pass");
  const judgment = input.settlement_judgment;
  const authorized = judgment !== undefined && judgment.authorized === true && judgment.authority_ref.trim() !== "" && judgment.judgment_ref.trim() !== "";
  const shouldSettleNow = settlementReachable && validate && authorized;
  const settlementReason = !settlementReachable
    ? "no available move has a visible settlement path"
    : !validate
      ? "no material deviation requires settlement now"
      : authorized
        ? "settlement is reachable and an authorized judgment requires it"
        : "settlement is reachable but an authorized judgment has not been recorded";

  const viewMode = selectViewMode({
    checkpoint_known: input.context.checkpoint_ref !== null,
    has_case: input.case !== null,
    optional_only: input.case === null || input.case.optional_only,
    has_available_move: availableMoves.length > 0,
  });

  const decision: NavigationFrame["decision"] =
    input.case === null ? "inspect" : input.case.optional_only ? "owner_choice" : primary !== null ? "primary_available" : "no_affordance";

  const reasons: string[] = [];
  if (input.context.checkpoint_ref === null) reasons.push(`checkpoint unknown: ${input.context.checkpoint_unknown_reason ?? "unspecified"}`);
  if (input.case === null) reasons.push("no case is focused; direct world exploration is valid");
  else if (input.case.optional_only) reasons.push("only optional choices remain; the observer must choose");
  else reasons.push(`${input.case.material_deviations.length} material deviation(s) require attention`);
  for (const assessment of assessed) {
    if (assessment.first_blocker !== null) reasons.push(`${assessment.operation_ref} is ${assessment.status}: ${assessment.first_blocker}`);
  }
  if (judgment !== undefined && !authorized) reasons.push("the settlement judgment is not authorized and cannot make settlement required");

  const evidenceRefs = [
    ...new Set([
      ...(input.case?.authoritative_fact_refs ?? []),
      ...assessed.flatMap((assessment) => assessment.basis_refs),
      ...(authorized && judgment !== undefined ? [judgment.authority_ref, judgment.judgment_ref] : []),
    ]),
  ].sort();

  const frame: NavigationFrame = {
    schema: NAVIGATION_SCHEMA,
    frame_id: input.frame_id,
    revision: input.revision,
    previous_frame_id: null,
    observer_ref: input.context.observer_ref,
    tenant_ref: input.context.tenant_ref,
    world_ref: input.context.world_ref,
    checkpoint_ref: input.context.checkpoint_ref,
    checkpoint_unknown_reason: input.context.checkpoint_unknown_reason,
    focus_ref: input.context.focus_ref,
    case_ref: input.context.case_ref,
    view_mode: viewMode,
    possible_operation_refs: possibleRefs,
    choices,
    allowed_choice_refs: choices.filter((choice) => choice.selectable).map((choice) => choice.operation_ref).sort(),
    primary_choice_ref: primary?.operation_ref ?? null,
    decision,
    settlement_reachable: settlementReachable,
    should_settle_now: shouldSettleNow,
    settlement_reason: settlementReason,
    reasons,
    evidence_refs: evidenceRefs,
    authority: { grants_authority: false },
  };
  return deepFreezeFrame(frame);
}

/**
 * Revise a frame. Revision advances by exactly one; the frame identity is stable and the previous
 * identity is carried, so a consumer can detect that it is reading a successor.
 */
export function reviseNavigationFrame(
  previous: NavigationFrame,
  input: Omit<NavigationFrameInput, "frame_id" | "revision">,
): NavigationFrame {
  const next = buildNavigationFrame({ ...input, frame_id: previous.frame_id, revision: previous.revision + 1 });
  return Object.freeze({ ...next, previous_frame_id: previous.frame_id });
}

/** Refuse a choice made against any revision but the current one (optimistic concurrency). */
export function assertFrameChoice(frame: NavigationFrame, operationRef: string, revision: number): NavigationChoice {
  if (revision !== frame.revision) {
    throw new NavigationError("stale_frame", `revision ${revision} is stale; current frame ${frame.frame_id} is at ${frame.revision}`);
  }
  const choice = frame.choices.find((entry) => entry.operation_ref === operationRef);
  if (choice === undefined) {
    throw new NavigationError("unavailable_choice", `${operationRef} is not a choice of frame ${frame.frame_id}`);
  }
  if (!choice.selectable) {
    throw new NavigationError("unavailable_choice", `${operationRef} is ${choice.status} and cannot be selected`);
  }
  return choice;
}
