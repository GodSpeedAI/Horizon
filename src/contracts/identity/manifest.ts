import { readFileSync } from "node:fs";
import { z } from "zod";
import { loadParamSchemas, wireName } from "./params.ts";

/**
 * The closed operation catalog, frozen at Stage 0A (`contracts/identity/v1/operations.yaml`).
 *
 * The catalog is closed: an operation ID that is not in the manifest, or a write route that maps
 * to no row, is Px and fails closed. Nothing here grants authority; it decides which row governs
 * an operation and therefore which evidence, authority writer, and expiry apply. A route name, an
 * HTTP method, a client label, or a caller role can never move an operation to a weaker class.
 *
 * A route that carries several semantic actions is dispatched from the action the handler
 * performs (see `dispatch`), never from a blanket route class.
 */

export const IDENTITY_CLASSES = ["P0", "P1", "P2", "P3", "PX"] as const;

/**
 * Separation of duty, stated by role. A P3 row names who asks, who approves and who executes, and the
 * approver must be a different principal from both the requester and the executor. A bare boolean
 * says nothing the catalog can check; the three roles are what the pending record enforces.
 */
export interface SeparationOfDuty {
  readonly requester: string;
  readonly approver: string;
  readonly executor: string;
}
const separationOfDutySchema = z.object({ requester: z.string().min(1), approver: z.string().min(1), executor: z.string().min(1) }).strict();
export type IdentityClass = (typeof IDENTITY_CLASSES)[number];

/** Classes whose effects are externally binding or human-reserved. These may never be satisfied
 * by a local-read or local-policy writer, and never by A0/A1 evidence. */
export const GOVERNED_CLASSES: readonly IdentityClass[] = ["P2", "P3"];

const AUTHORITY_WRITERS = [
  "local_read_policy",
  "cognate_local_policy",
  "cognate_local_continuation",
  "sea_forge",
  "issuer_root",
  "case_record.authority",
  "identity_service",
] as const;
export type AuthorityWriter = (typeof AUTHORITY_WRITERS)[number];

export const OWNERSHIPS = [
  "none_required",
  "caller_owns_panel",
  "caller_owns_question",
  "caller_own_session",
  "person_owns_board",
  "caller_scoped_own_rows",
] as const;
export type Ownership = (typeof OWNERSHIPS)[number];

/**
 * Who acts. A closed list: an executor outside it is a contract error, not a new caller kind.
 * `anonymous_connection` is the public liveness probe — it authenticates nobody and owns nothing.
 * `code_holder` is the holder of a one-time pairing code: the route proves possession of the code
 * and cannot prove who presented it, so it never claims local-console presence.
 */
export const EXECUTORS = [
  "human_session",
  "registered_agent",
  "registered_agent_or_human_session",
  "local_console",
  "code_holder",
  "anonymous_connection",
  "unauthenticated_caller",
  "device_credential",
  "credential_issuer",
] as const;
export type Executor = (typeof EXECUTORS)[number];

/** The credential a route authenticates. Closed for the same reason the executor list is. */
export const CALLER_AUTHENTICATIONS = [
  "registered_agent_key",
  "registered_agent_key_or_human_session",
  "human_session",
  "local_console_presence",
  "one_time_pairing_code",
  "none_public_liveness",
  "none_unauthenticated",
  "device_passkey_assertion",
  "authorized_pending_record",
] as const;
export type CallerAuthentication = (typeof CALLER_AUTHENTICATIONS)[number];

/**
 * The credential each executor's route authenticates.
 *
 * A row's caller authentication is derived from its executor, never stated beside it. A route
 * proves one credential; a row that named a different one would let the catalog claim a check the
 * route does not perform, or hide one it does. A row that disagrees with this table is a contract
 * error, refused when the manifest loads.
 */
export const EXECUTOR_CALLER_AUTHENTICATION: Readonly<Record<Executor, CallerAuthentication>> = {
  human_session: "human_session",
  registered_agent: "registered_agent_key",
  registered_agent_or_human_session: "registered_agent_key_or_human_session",
  local_console: "local_console_presence",
  code_holder: "one_time_pairing_code",
  anonymous_connection: "none_public_liveness",
  unauthenticated_caller: "none_unauthenticated",
  device_credential: "device_passkey_assertion",
  credential_issuer: "authorized_pending_record",
};

/**
 * The caller path each executor's route presents, as the freeze's enforcement table names it.
 * A path says who is at the route; the authentication says what the route proves.
 */
export const EXECUTOR_CALLER_PATHS: Readonly<Record<Executor, readonly string[]>> = {
  human_session: ["human_session"],
  registered_agent: ["registered_agent"],
  registered_agent_or_human_session: ["human_session", "registered_agent"],
  local_console: ["local_console"],
  code_holder: ["code_holder"],
  anonymous_connection: ["none"],
  unauthenticated_caller: ["none_unauthenticated"],
  device_credential: ["device_credential"],
  credential_issuer: ["authorized_pending_record"],
};

/**
 * The caller kinds a record may carry.
 *
 * The record contract's `caller_kind` names the kind of caller, and the catalog says which kinds
 * each operation permits. The kinds are the catalog's own caller paths, not a second vocabulary:
 * a code holder and a device credential are callers, and a record that cannot name them cannot
 * describe what they did (R5-05).
 */
export const RECORD_CALLER_KINDS = [
  "human_session",
  "registered_agent",
  "agent_execution",
  "local_console",
  "code_holder",
  "device_credential",
  "credential_issuer",
] as const;
export type RecordCallerKind = (typeof RECORD_CALLER_KINDS)[number];

/**
 * The caller kinds each executor's records may name.
 *
 * A row is performed by its executor, and a record names the caller that asked. The two are not
 * the same field and never collapse: a person may ask for an operation a person performs, and an
 * agent may ask for an operation a person confirms, so a human-performed row permits the agent
 * kinds as well as the human one. What no row permits is a substitution across a boundary it
 * does not cross: a device credential never speaks for a person, a code holder never speaks for a
 * console, and a console never speaks for an agent.
 */
export const EXECUTOR_CALLER_KINDS: Readonly<Record<Executor, readonly string[]>> = {
  human_session: ["human_session", "registered_agent", "agent_execution"],
  registered_agent: ["registered_agent", "agent_execution"],
  registered_agent_or_human_session: ["human_session", "registered_agent", "agent_execution"],
  local_console: ["local_console"],
  code_holder: ["code_holder"],
  anonymous_connection: [],
  unauthenticated_caller: [],
  device_credential: ["device_credential"],
  credential_issuer: ["credential_issuer"],
};

/**
 * The callers whose path cannot produce an assurance predicate at all.
 *
 * A public probe, an unauthenticated challenge and a one-time pairing code prove possession of
 * nothing that identifies a person, so a row on one of those paths may not inherit the class
 * default's assurance predicate: the catalog would be claiming evidence the route cannot produce
 * (R5-07). Such a row states `human_evidence: null` — no human confirmation applies — and keeps
 * its own `caller_authentication`.
 */
export const EXECUTORS_WITHOUT_ASSURANCE: readonly Executor[] = [
  "anonymous_connection",
  "unauthenticated_caller",
  "code_holder",
];

/**
 * The evidence requirement ids the catalog may name. They are declared by the A3 mechanism
 * contract (`contracts/identity/v1/a3-mechanism.yaml`), which says what each one requires and
 * which separate claims accompany it. The list is read from that contract, so the catalog and the
 * receipts cannot drift into two vocabularies, and an id outside it is refused rather than rounded
 * to the nearest known one.
 */
let evidenceRequirements: readonly string[] | null = null;
export function assuranceRequirementIds(): readonly string[] {
  if (evidenceRequirements === null) {
    const path = new URL("../../../contracts/identity/v1/a3-mechanism.yaml", import.meta.url).pathname;
    const document = Bun.YAML.parse(readFileSync(path, "utf8")) as { assurance_requirements?: { id?: unknown }[] };
    const ids = (document.assurance_requirements ?? []).map((entry) => entry.id).filter((id): id is string => typeof id === "string");
    if (ids.length === 0) throw new Error("a3-mechanism: the assurance requirement vocabulary is empty");
    evidenceRequirements = ids;
  }
  return evidenceRequirements;
}

const bindingSchema = z.enum(["verified", "candidate", "reserved"]);

const rowSchema = z
  .object({
    id: z.string().min(1),
    class: z.enum(IDENTITY_CLASSES).optional(),
    executor: z.enum(EXECUTORS).nullable().optional(),
    authority_writer: z.string().nullable().optional(),
    human_evidence: z.string().nullable().optional(),
    stage0b_evidence: z.string().nullable().optional(),
    pending_expiry: z.string().nullable().optional(),
    params_schema: z.string().nullable().optional(),
    offline_allowed: z.boolean().optional(),
    writable: z.boolean().optional(),
    ownership: z.enum(OWNERSHIPS).optional(),
    scope_rule: z.string().optional(),
    caller_authentication: z.enum(CALLER_AUTHENTICATIONS).optional(),
    binding: bindingSchema,
    routes: z.array(z.string()).optional(),
    code_ops: z.array(z.string()).optional(),
    /**
     * A locator a candidate row was seen at. It records where the row was observed; it is not a
     * binding, so it never puts the row on a route and never makes the route resolvable to it.
     */
    observed_routes: z.array(z.string()).optional(),
    observed_code_ops: z.array(z.string()).optional(),
    dispatcher: z.boolean().optional(),
    inherits: z.array(z.string()).optional(),
    separation_of_duty: separationOfDutySchema.optional(),
    fixed_parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    note: z.string().optional(),
  })
  .strict();

const dispatchSchema = z
  .object({
    route: z.string(),
    action_field: z.string(),
    selector: z.enum(["action_value", "declared_effect"]).optional(),
    actions: z.record(z.string()),
    /**
     * The name of the qualifier the handler resolves and hands to the resolver. It is never read
     * from the request: the desk resolves the card's kind from the card it fetched, and the phone
     * resolves the settlement phase from the command it accepted. A qualifier the handler did not
     * resolve is absent, and the pair that needs it does not match.
     */
    resolved_field: z.string().min(1).optional(),
    /**
     * The caller path this route presents, when the route is not a human or agent surface. The
     * phone's command route presents a device credential: it proves which enrolled device is at
     * the route and never which person is holding it, so the rows it selects are device-credential
     * rows and a governed one is refused rather than downgraded.
     */
    caller_path: z.string().min(1).optional(),
    /**
     * The pairs that select an operation: the resolved qualifier and the action together. A pair
     * the catalog does not list is Px, whatever the action alone would have selected.
     */
    combinations: z
      .array(
        z.object({
          resolved: z.string().min(1),
          action: z.string().min(1),
          operation: z.string().min(1),
        }),
      )
      .optional(),
    /**
     * The literal values of the action field that select each action, when the action names are
     * semantic rather than literal. `absent` means the field is not in the request at all. A
     * value that is in no list is Px: the route refuses it before the action runs.
     */
    action_values: z
      .record(
        z.object({
          values: z.array(z.union([z.string(), z.boolean()])),
          requires_non_empty_query: z.boolean().optional(),
        }),
      )
      .optional(),
    unknown_action: z.literal("PX"),
    refused_prefixes: z.array(z.string()).optional(),
    note: z.string().optional(),
  })
  .strict();

/**
 * A route alias is a narrowing route: it reaches an operation the target route also reaches, and
 * it fixes some parameters and adds some requirements. The fixed values and the added checks are
 * data, not prose: a validator derives the facts from them, so an alias cannot claim to be
 * narrowing while carrying no machine-checkable difference from the target route.
 */
const aliasSchema = z
  .object({
    route: z.string(),
    operation: z.string(),
    basis: z.string(),
    narrowing: z.string(),
    /** The class of the aliased row, stated so a check never has to infer it. */
    target_class: z.enum(IDENTITY_CLASSES).optional(),
    /** Parameter values this route fixes. A supplied value that disagrees is refused. */
    fixed_parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    /** The machine-checkable differences between this route and the target route. */
    narrowing_checks: z
      .array(
        z.object({
          kind: z.enum(["fixed_parameter", "offered_action_required", "frame_revision_match", "additional_requirement"]),
          name: z.string().optional(),
          equals: z.union([z.string(), z.number(), z.boolean()]).optional(),
        }),
      )
      .optional(),
    added_requirements: z.array(z.string()).optional(),
  })
  .strict();

const defectSchema = z
  .object({
    id: z.string(),
    route: z.string(),
    operation: z.string(),
    observed: z.string(),
    required: z.string(),
    consequence: z.string(),
    /**
     * `fixed` means the defect is closed: the route no longer honours the untrusted input and the
     * runtime evidence carries the authenticated identity. A fixed defect keeps its `resolution`
     * and `evidence`, and any `residual` names the later stage that extends the contract.
     */
    status: z.enum(["recorded_not_fixed", "recorded_for_owner", "fixed"]),
    stage: z.string(),
    resolution: z.string().optional(),
    evidence: z.string().optional(),
    residual: z.string().optional(),
  })
  .strict();

/**
 * One live-bound row's enforcement state. The class says what a row is; this says whether the
 * running code enforces it. A row whose enforcement is missing names what is missing and the
 * stage that must close it.
 */
const enforcementSchema = z
  .object({
    id: z.string().min(1),
    caller_path: z.string().min(1).optional(),
    enforced_today: z.boolean(),
    /**
     * Whether the runtime refuses this row at this freeze. A refused row performs no target
     * effect: there is no handler that reads its parameters, so there is nothing for the
     * parameter schema to disagree with. The row is still catalogued, still classed, and still
     * named by the dispatch table, so the refusal is a containment rather than an absence.
     */
    refused_today: z.boolean().optional(),
    /** Why the runtime refuses the row, and what would have to exist for it to run. */
    refusal_reason: z.string().optional(),
    /** What the row's own effect does at this freeze: nothing, or the effect itself. */
    target_effect: z.enum(["none", "runs"]).optional(),
    /** What a refusal writes: nothing, or the refusal audit. */
    refusal_audit: z.enum(["none", "appends_refusal_audit"]).optional(),
    enforced_by: z.string().optional(),
    missing: z.array(z.string()),
    required_stage: z.string().optional(),
    production_stage: z.string().optional(),
    variants: z
      .array(
        z.object({
          code_op: z.string(),
          routes: z.array(z.string()).optional(),
          caller_path: z.string().min(1),
          refused_today: z.boolean().optional(),
          refusal_reason: z.string().optional(),
          required_stage: z.string().optional(),
          production_stage: z.string().optional(),
        }),
      )
      .optional(),
    note: z.string().optional(),
  })
  .strict();

const liveEnforcementSchema = z
  .object({
    version: z.number(),
    paths: z.record(z.object({ authority: z.string(), evidence: z.string(), note: z.string().optional() }).strict()),
    rows: z.array(enforcementSchema),
  })
  .strict();

/**
 * The operations the identity catalog does not classify.
 *
 * The catalog classifies Horizon's own operations. A deployment may bind other operations — a
 * product operation whose authority is its own binding contract. Such an operation is declared by
 * the deployment configuration, and the identity catalog never calls it a P0/P1 local write.
 *
 * The block says what the runtime does with a reference that is neither catalogued nor bound.
 */
const deploymentOperationsSchema = z
  .object({
    rule: z.string(),
    minimum_class: z.enum(IDENTITY_CLASSES),
    /** What happens to a deployment-bound reference on the plain intent path. */
    refusal_rule: z.string().optional(),
    note: z.string().optional(),
  })
  .strict();

const manifestSchema = z
  .object({
    manifest_version: z.string(),
    contract_id: z.string(),
    contract_version: z.string(),
    frozen_at: z.string(),
    authority: z.record(z.unknown()),
    classes: z.array(z.enum(IDENTITY_CLASSES)),
    authority_writers: z.record(z.string()),
    budget_units: z.array(z.string()).optional(),
    class_defaults: z.record(rowSchema.partial()),
    operations: z.record(z.array(rowSchema)),
    deployment_operations: deploymentOperationsSchema.optional(),
    dispatch: z.array(dispatchSchema),
    route_aliases: z.array(aliasSchema),
    live_enforcement: liveEnforcementSchema,
    binding_defects: z.array(defectSchema),
    catalog_gaps: z.array(z.object({ route: z.string(), code_ops: z.array(z.string()).optional(), reason: z.string() })),
    non_operation_routes: z.array(z.object({ route: z.string(), reason: z.string() })),
    refusal_codes: z.record(z.string()),
  })
  .strict();

export type RawOperationRow = z.infer<typeof rowSchema>;
export type OperationManifest = z.infer<typeof manifestSchema>;
export type DispatchEntry = z.infer<typeof dispatchSchema>;
export type RouteAlias = z.infer<typeof aliasSchema>;
export type BindingDefect = z.infer<typeof defectSchema>;

/** A resolved row: class defaults materialized, so a caller never has to know the defaults. */
export interface Operation {
  readonly id: string;
  readonly class: IdentityClass;
  readonly executor: string | null;
  readonly authorityWriter: AuthorityWriter | string | null;
  readonly humanEvidence: string | null;
  readonly stage0bEvidence: string | null;
  readonly pendingExpiry: string | null;
  readonly paramsSchema: string | null;
  readonly offlineAllowed: boolean;
  readonly writable: boolean;
  readonly ownership: Ownership;
  /** Why the row needs no owner beyond the caller's own scope, or what its scope is. */
  readonly scopeRule: string;
  /** Whether an approver must differ from the requester and the executor. A P3 row states it;
   * a row of another class leaves it unset. */
  readonly separationOfDuty: SeparationOfDuty | null;
  /** The caller kinds a record for this row may name. A dispatcher inherits every kind, because
   * its targets decide what class it binds and the caller only asks. */
  readonly permittedCallerKinds: readonly string[];
  readonly callerAuthentication: string | null;
  readonly binding: "verified" | "candidate" | "reserved";
  readonly routes: readonly string[];
  readonly codeOps: readonly string[];
  /** Where a candidate row was observed. An observation is not a binding: it never resolves a route. */
  readonly observedRoutes: readonly string[];
  readonly observedCodeOps: readonly string[];
  readonly dispatcher: boolean;
  /** Parameter values this row fixes. A supplied value that disagrees is refused. */
  readonly fixedParameters: Readonly<Record<string, string | number | boolean>>;
}

export interface UnlistedOperation {
  readonly id: string;
  readonly class: "PX";
  readonly reason: "unlisted_operation";
  readonly refusal: "unlisted_operation";
}

/** A refusal produced by dispatch: the route exists, the action does not, or it is reserved. */
export interface RefusedDispatch {
  readonly id: string;
  readonly class: "PX";
  readonly refusal: "unknown_action" | "reserved_for_person" | "no_dispatch_route";
  readonly route: string;
}

export type Classification = Operation | UnlistedOperation | RefusedDispatch;

export interface LoadedManifest {
  readonly manifest: OperationManifest;
  readonly byId: ReadonlyMap<string, Operation>;
  readonly routes: ReadonlyMap<string, readonly Operation[]>;
  readonly rows: readonly (RawOperationRow & { class: IdentityClass })[];
  readonly dispatch: ReadonlyMap<string, DispatchEntry>;
  readonly aliases: ReadonlyMap<string, RouteAlias>;
}

function defaultPath(): string {
  return new URL("../../../contracts/identity/v1/operations.yaml", import.meta.url).pathname;
}

function resolveRow(raw: RawOperationRow, groupClass: IdentityClass, defaults: Record<string, Partial<RawOperationRow>>): Operation {
  const declared = raw.class ?? groupClass;
  const base = defaults[declared] ?? {};
  const executor = (raw.executor ?? base.executor ?? null) as Executor | null;
  // The credential a row's route authenticates is derived from who acts. A row that states a
  // different credential beside its executor is a contract error: it would let the catalog claim a
  // check the route does not make, or hide one it does.
  const derivedAuthentication = executor === null ? null : EXECUTOR_CALLER_AUTHENTICATION[executor];
  const statedAuthentication = raw.caller_authentication ?? null;
  if (statedAuthentication !== null && derivedAuthentication !== null && statedAuthentication !== derivedAuthentication) {
    throw new Error(
      `operations: "${raw.id}" states caller_authentication "${statedAuthentication}" but its executor "${executor}" authenticates "${derivedAuthentication}"`,
    );
  }
  return {
    id: raw.id,
    class: declared,
    executor,
    authorityWriter: raw.authority_writer ?? base.authority_writer ?? null,
    // `null` is a value here, not an absence: a row that states `human_evidence: null` says that
    // no human confirmation applies to it, which is different from saying nothing and inheriting
    // the class default (R5-07).
    humanEvidence: raw.human_evidence !== undefined ? raw.human_evidence : (base.human_evidence ?? null),
    stage0bEvidence: raw.stage0b_evidence ?? base.stage0b_evidence ?? null,
    pendingExpiry: raw.pending_expiry ?? base.pending_expiry ?? null,
    paramsSchema: raw.params_schema ?? base.params_schema ?? null,
    offlineAllowed: raw.offline_allowed ?? base.offline_allowed ?? false,
    writable: raw.writable ?? base.writable ?? false,
    ownership: raw.ownership ?? base.ownership ?? "none_required",
    scopeRule: raw.scope_rule ?? base.scope_rule ?? "",
    separationOfDuty: raw.separation_of_duty ?? base.separation_of_duty ?? null,
    permittedCallerKinds:
      // A row with no executor permits the caller kinds a person or a device may name. The credential issuer is the
      // commit's own kind, produced only by the authorized pending record, so no unexecuted row permits it.
      executor === null ? RECORD_CALLER_KINDS.filter((kind) => kind !== "credential_issuer") : [...(EXECUTOR_CALLER_KINDS[executor as Executor] ?? [])],
    callerAuthentication: derivedAuthentication,
    binding: raw.binding,
    routes: raw.routes ?? [],
    codeOps: raw.code_ops ?? [],
    observedRoutes: raw.observed_routes ?? [],
    observedCodeOps: raw.observed_code_ops ?? [],
    dispatcher: raw.dispatcher ?? false,
    fixedParameters: raw.fixed_parameters ?? {},
  };
}

export function parseOperationManifest(source: string): LoadedManifest {
  const manifest = manifestSchema.parse(Bun.YAML.parse(source));
  const defaults = manifest.class_defaults as Record<string, Partial<RawOperationRow>>;
  const byId = new Map<string, Operation>();
  const routes = new Map<string, Operation[]>();
  const rows: (RawOperationRow & { class: IdentityClass })[] = [];
  for (const [group, groupRows] of Object.entries(manifest.operations)) {
    if (!(IDENTITY_CLASSES as readonly string[]).includes(group)) {
      throw new Error(`operations: unknown class group "${group}"`);
    }
    for (const raw of groupRows) {
      const operation = resolveRow(raw, group as IdentityClass, defaults);
      if (byId.has(operation.id)) throw new Error(`operations: duplicate id "${operation.id}"`);
      byId.set(operation.id, operation);
      rows.push({ ...raw, class: operation.class });
      for (const route of operation.routes) {
        const owners = routes.get(route) ?? [];
        owners.push(operation);
        routes.set(route, owners);
      }
    }
  }
  for (const entry of manifest.dispatch) {
    for (const operationId of Object.values(entry.actions)) {
      if (!byId.has(operationId)) throw new Error(`dispatch: ${entry.route} names unknown operation "${operationId}"`);
    }
    // When the action names are semantic, the literal values that select them are declared. Every
    // declared action must have a value list, and no list may name an action the route does not
    // carry: an unlisted value has to fail closed, so the mapping may not be ambiguous.
    if (entry.action_values !== undefined) {
      for (const [action, values] of Object.entries(entry.action_values)) {
        if (entry.actions[action] === undefined) throw new Error(`dispatch: ${entry.route} declares values for "${action}", which the route does not carry`);
        if (values.values.length === 0) throw new Error(`dispatch: ${entry.route} declares no value for action "${action}"`);
      }
      for (const action of Object.keys(entry.actions)) {
        if (entry.action_values[action] === undefined) throw new Error(`dispatch: ${entry.route} carries action "${action}" but declares no value that selects it`);
      }
    }
  }
  if (new Set(manifest.dispatch.map((entry) => entry.route)).size !== manifest.dispatch.length) {
    throw new Error("dispatch: a route appears in more than one dispatch entry");
  }
  for (const alias of manifest.route_aliases) {
    if (!byId.has(alias.operation)) throw new Error(`route_aliases: ${alias.route} names unknown operation "${alias.operation}"`);
    const target = byId.get(alias.operation)!;
    if (alias.target_class !== undefined && alias.target_class !== target.class) {
      throw new Error(`route_aliases: ${alias.route} declares target_class ${alias.target_class} but "${alias.operation}" is ${target.class}`);
    }
    // The alias must carry machine-checkable differences from the target route, not only prose.
    const checks = alias.narrowing_checks ?? [];
    if (checks.length === 0) throw new Error(`route_aliases: ${alias.route} declares no narrowing_checks; an alias with no check is not a narrowing route`);
    for (const check of checks) {
      if (check.kind === "fixed_parameter") {
        if (check.name === undefined || check.equals === undefined) throw new Error(`route_aliases: ${alias.route} has a fixed_parameter check without a name and value`);
        const fixed = alias.fixed_parameters?.[check.name];
        if (fixed === undefined) throw new Error(`route_aliases: ${alias.route} fixes "${check.name}" in a check but declares no fixed_parameters value`);
        if (fixed !== check.equals) throw new Error(`route_aliases: ${alias.route} declares fixed_parameters.${check.name}=${String(fixed)} but its check says ${String(check.equals)}`);
      }
    }
    // An alias may not weaken the class of the route it stands in for.
    for (const owner of routes.get(alias.route) ?? []) {
      if (target.class !== owner.class) {
        throw new Error(`route_aliases: ${alias.route} aliases ${target.class} "${alias.operation}" but the route also carries ${owner.class} "${owner.id}"`);
      }
    }
  }
  // Every evidence requirement the catalog names must be in the A3 mechanism's vocabulary, and
  // every writable row must say what its scope is. Both fail closed: an unknown requirement and
  // an unstated scope are contract errors, not defaults.
  const requirementIds = new Set(assuranceRequirementIds());
  for (const operation of byId.values()) {
    for (const evidence of [operation.humanEvidence, operation.stage0bEvidence]) {
      if (evidence === null) continue;
      if (!requirementIds.has(evidence)) {
        throw new Error(`operations: "${operation.id}" names evidence requirement "${evidence}", which the A3 mechanism contract does not declare`);
      }
    }
    if (operation.writable && operation.scopeRule.trim() === "") {
      throw new Error(`operations: "${operation.id}" is writable but states no scope rule`);
    }
  }
  // A row that fixes a parameter says so in data, and the fixed value must be one the row's own
  // parameter schema allows. A fixed value the schema refuses would make the row unsatisfiable,
  // and a fixed value the schema does not name would be checked against nothing.
  const schemas = loadParamSchemas();
  for (const operation of byId.values()) {
    if (Object.keys(operation.fixedParameters).length === 0) continue;
    if (operation.paramsSchema === null) {
      throw new Error(`operations: "${operation.id}" fixes parameters but names no parameter schema`);
    }
    const schema = schemas[operation.paramsSchema];
    if (schema === undefined) {
      throw new Error(`operations: "${operation.id}" fixes parameters against "${operation.paramsSchema}", which the parameter contract does not declare`);
    }
    const fields = schema.fields ?? [];
    for (const [name, value] of Object.entries(operation.fixedParameters)) {
      const field = fields.find((candidate) => wireName(candidate) === name || candidate.name === name);
      if (field === undefined) {
        throw new Error(`operations: "${operation.id}" fixes parameter "${name}", which "${operation.paramsSchema}" does not declare`);
      }
      const allowed = field.enum;
      if (allowed !== undefined && !allowed.includes(value as string)) {
        throw new Error(`operations: "${operation.id}" fixes parameter "${name}" to ${JSON.stringify(value)}, which "${operation.paramsSchema}" does not allow`);
      }
    }
  }
  // Every live-bound row must say whether the runtime enforces it today. A governed row that
  // claims enforcement it does not have is the failure this block exists to prevent, so the
  // claims are checked against the row's class and against the entries themselves.
  const paths = new Set(Object.keys(manifest.live_enforcement.paths));
  const enforcement = new Map<string, (typeof manifest.live_enforcement.rows)[number]>();
  for (const entry of manifest.live_enforcement.rows) {
    if (!byId.has(entry.id)) throw new Error(`live_enforcement: "${entry.id}" is not a catalog row`);
    if (enforcement.has(entry.id)) throw new Error(`live_enforcement: "${entry.id}" has more than one entry`);
    enforcement.set(entry.id, entry);
    const named = [entry.caller_path, ...(entry.variants ?? []).map((variant) => variant.caller_path)].filter((path): path is string => path !== undefined);
    for (const path of named) {
      if (!paths.has(path)) throw new Error(`live_enforcement: "${entry.id}" names caller path "${path}", which the block does not declare`);
    }
    if (entry.variants === undefined && entry.caller_path === undefined) {
      throw new Error(`live_enforcement: "${entry.id}" names no caller path`);
    }
    // The caller path says who is at the route. It must be the path the row's executor presents:
    // a row whose enforcement names a path its executor cannot produce is claiming a check on a
    // route that never runs. A dispatcher resolves its path from its targets at run time, so it is
    // checked against the targets rather than against a row-level executor.
    const operation = byId.get(entry.id)!;
    if (!operation.dispatcher && operation.executor !== null) {
      const implied = EXECUTOR_CALLER_PATHS[operation.executor as Executor];
      const named = new Set(
        [entry.caller_path, ...(entry.variants ?? []).map((variant) => variant.caller_path)].filter(
          (path): path is string => path !== undefined,
        ),
      );
      for (const path of named) {
        if (!implied.includes(path)) {
          throw new Error(`live_enforcement: "${entry.id}" names caller path "${path}", which its executor "${operation.executor}" does not present`);
        }
      }
      for (const path of implied) {
        if (!named.has(path)) {
          throw new Error(`live_enforcement: "${entry.id}" omits the caller path "${path}" its executor "${operation.executor}" presents`);
        }
      }
    }
    if (entry.enforced_today) {
      if (entry.missing.length > 0) throw new Error(`live_enforcement: "${entry.id}" claims enforcement today but lists what is missing`);
      if (entry.enforced_by === undefined || entry.enforced_by.trim() === "") {
        throw new Error(`live_enforcement: "${entry.id}" claims enforcement today but does not say by what`);
      }
    } else {
      if (entry.missing.length === 0) throw new Error(`live_enforcement: "${entry.id}" does not enforce its row but lists nothing that is missing`);
      if (entry.required_stage === undefined || entry.required_stage.trim() === "") {
        throw new Error(`live_enforcement: "${entry.id}" does not enforce its row but names no stage that must close it`);
      }
    }
    // What the runtime does with the row at this freeze is part of the row's contract, so the
    // contract states it: a governed row is either refused, with a reason and the audit the
    // refusal writes, or it runs and says so. A row that says neither leaves the runtime to
    // guess, and a guess that performs the effect is the defect this rule exists for (R5-01).
    const governedRow = byId.get(entry.id)!;
    const governed = governedRow.class === "P2" || governedRow.class === "P3" || governedRow.class === "PX";
    if (entry.variants === undefined) {
      if (governed && entry.refused_today === undefined) {
        throw new Error(`live_enforcement: "${entry.id}" does not say whether the runtime refuses it at this freeze`);
      }
      if (entry.refused_today === true) {
        if (entry.refusal_reason === undefined || entry.refusal_reason.trim() === "") {
          throw new Error(`live_enforcement: "${entry.id}" is refused but names no reason`);
        }
        if (entry.target_effect !== "none") {
          throw new Error(`live_enforcement: "${entry.id}" is refused but does not say that its target effect is none`);
        }
        if (entry.refusal_audit !== "appends_refusal_audit") {
          throw new Error(`live_enforcement: "${entry.id}" is refused but does not say what the refusal writes`);
        }
      }
      if (entry.refused_today === false && entry.target_effect === "none") {
        throw new Error(`live_enforcement: "${entry.id}" runs at this freeze but claims its target effect is none`);
      }
    } else {
      for (const variant of entry.variants) {
        if (variant.refused_today === undefined) {
          throw new Error(`live_enforcement: "${entry.id}" variant "${variant.code_op}" does not say whether the runtime refuses it`);
        }
        if (variant.refused_today === true && (variant.refusal_reason === undefined || variant.refusal_reason.trim() === "")) {
          throw new Error(`live_enforcement: "${entry.id}" variant "${variant.code_op}" is refused but names no reason`);
        }
      }
      if (entry.refused_today !== undefined) {
        throw new Error(`live_enforcement: "${entry.id}" names its variants, so the refusal belongs to the variant and not to the row`);
      }
    }
  }
  for (const operation of byId.values()) {
    // R5-09: separation of duty is a closed per-row requirement. The P3 class no longer claims
    // it for every row, so every P3 row states it and a row that says nothing is a contract
    // error rather than a row that happens not to need it.
    if (operation.class === "P3") {
      const separation = operation.separationOfDuty;
      if (separation === null) throw new Error(`operations: the P3 row "${operation.id}" does not state separation_of_duty`);
      if (separation.approver === separation.requester || separation.approver === separation.executor) {
        throw new Error(`operations: the P3 row "${operation.id}" names one principal as approver and as requester or executor; separation of duty needs three distinct roles`);
      }
      // The separation executor names the principal that performs the effect, so it must be the row's executor.
      if (operation.executor !== null && separation.executor !== operation.executor) {
        throw new Error(`operations: the P3 row "${operation.id}" names separation executor "${separation.executor}" but its executor is "${operation.executor}"`);
      }
    }
    // R5-07: a public probe, an unauthenticated challenge and a one-time code identify no
    // person, so a row on one of those paths may not inherit an assurance predicate.
    if (
      operation.executor !== null &&
      EXECUTORS_WITHOUT_ASSURANCE.includes(operation.executor as Executor) &&
      operation.humanEvidence !== null
    ) {
      throw new Error(
        `operations: the row "${operation.id}" is performed by "${operation.executor}", which proves no person, but it claims the assurance predicate "${operation.humanEvidence}"`,
      );
    }
    if (operation.binding !== "verified") continue;
    const entry = enforcement.get(operation.id);
    if (entry === undefined) throw new Error(`live_enforcement: the live-bound row "${operation.id}" has no enforcement entry`);
    if ((operation.class === "P2" || operation.class === "P3") && entry.enforced_today) {
      throw new Error(`live_enforcement: "${operation.id}" is ${operation.class} but claims the runtime enforces it today`);
    }
  }
  for (const id of enforcement.keys()) {
    const operation = byId.get(id)!;
    if (operation.binding !== "verified") {
      throw new Error(`live_enforcement: "${id}" has an enforcement entry but is not a live-bound row`);
    }
  }
  const dispatch = new Map(manifest.dispatch.map((entry) => [entry.route, entry] as const));
  const aliases = new Map(manifest.route_aliases.map((alias) => [alias.route, alias] as const));
  return { manifest, byId, routes, rows, dispatch, aliases };
}

let cached: LoadedManifest | null = null;

export function loadOperationManifest(path = defaultPath()): LoadedManifest {
  if (cached !== null && path === defaultPath()) return cached;
  const loaded = parseOperationManifest(readFileSync(path, "utf8"));
  if (path === defaultPath()) cached = loaded;
  return loaded;
}

/**
 * Classify an operation ID. An unlisted ID is Px: it has no executor, no authority writer, and no
 * expiry, so every gate downstream refuses it rather than defaulting to something weaker.
 */
export function classify(manifest: LoadedManifest, operationId: string): Classification {
  const operation = manifest.byId.get(operationId);
  if (operation !== undefined) return operation;
  return { id: operationId, class: "PX", reason: "unlisted_operation", refusal: "unlisted_operation" };
}

/**
 * Resolve one semantic action on a route to its catalog row. The action is what the handler is
 * about to perform; it is not a client-supplied risk label. An action the catalog does not list is
 * Px, and so is an action under a prefix the route refuses outright.
 */
export function dispatchAction(manifest: LoadedManifest, route: string, action: string): Classification {
  const entry = manifest.dispatch.get(route);
  if (entry === undefined) return { id: `${route}#${action}`, class: "PX", refusal: "no_dispatch_route", route };
  if ((entry.refused_prefixes ?? []).some((prefix) => action.startsWith(prefix))) {
    return { id: `${route}#${action}`, class: "PX", refusal: "reserved_for_person", route };
  }
  const operationId = entry.actions[action];
  if (operationId === undefined) return { id: `${route}#${action}`, class: "PX", refusal: "unknown_action", route };
  return classify(manifest, operationId);
}

/**
 * A dispatcher carries no authority of its own: its class, executor, writer, evidence, and expiry
 * are inherited from the resolved target rows. A dispatcher with no resolvable target is Px.
 */
export function isDispatcher(operation: Operation): boolean {
  return operation.dispatcher;
}

/** The field on a route's body that carries the semantic action. */
export function actionFieldFor(manifest: LoadedManifest, route: string): string | null {
  return manifest.dispatch.get(route)?.action_field ?? null;
}

/**
 * Resolve the operation a dispatched route performs.
 *
 * The route names an action, and the handler resolves the qualifier the catalog asks for: the
 * desk resolves the kind of the card it fetched, the phone resolves the settlement phase it
 * accepted. A pair the catalog lists selects that pair's operation. An action with no pair
 * selects the action's own row. An action that is in neither is Px: the route refuses it before
 * the effect runs, and a route never picks a weaker row for the same action.
 */
export function resolveDispatchedOperation(
  manifest: LoadedManifest,
  route: string,
  action: string,
  resolved?: string | null,
): string | null {
  const entry = manifest.dispatch.get(route);
  if (entry === undefined) return null;
  for (const combination of entry.combinations ?? []) {
    if (combination.action !== action) continue;
    if (combination.resolved === "*") return combination.operation;
    if (resolved !== undefined && resolved !== null && combination.resolved === resolved) return combination.operation;
  }
  return entry.actions[action] ?? null;
}

/** The action prefixes a route refuses outright, in the route's own terms. */
export function refusedPrefixesFor(manifest: LoadedManifest, route: string): readonly string[] {
  return manifest.dispatch.get(route)?.refused_prefixes ?? [];
}

/** How an operation reference classifies at a live boundary. */
export type ReferenceClass = IdentityClass | "deployment";

export type ReferenceReason =
  | "catalogued_local_operation"
  | "governed_operation_needs_confirmation"
  | "px_operation"
  | "deployment_bound_operation"
  | "deployment_bound_operation_needs_its_own_path"
  | "unclassified_operation";

export interface ReferenceClassification {
  readonly operationRef: string;
  readonly class: ReferenceClass;
  /** Whether the local intent path may carry this reference. */
  readonly allowed: boolean;
  readonly reason: ReferenceReason;
}

/**
 * Classify an operation reference before anything runs.
 *
 * The catalog classifies Horizon's own operations. A reference the catalog does not know may still
 * be a deployment-bound operation, whose authority is its own binding contract and never this
 * catalog's. A reference that is neither is Px: it is refused before a capability is invoked and
 * before a record is appended.
 *
 * A governed row (P2 or P3) is not allowed on the local intent path. Its effect needs the pending
 * record, the confirmation and the authority writer its own row names, and a plain intent commit
 * carries none of them.
 */
export function classifyReference(
  manifest: LoadedManifest,
  operationRef: string,
  deploymentBound: ReadonlySet<string>,
): ReferenceClassification {
  const operation = manifest.byId.get(operationRef);
  if (operation !== undefined) {
    if (operation.class === "P0" || operation.class === "P1") {
      return { operationRef, class: operation.class, allowed: true, reason: "catalogued_local_operation" };
    }
    if (operation.class === "P2" || operation.class === "P3") {
      return { operationRef, class: operation.class, allowed: false, reason: "governed_operation_needs_confirmation" };
    }
    return { operationRef, class: "PX", allowed: false, reason: "px_operation" };
  }
  if (deploymentBound.has(operationRef)) {
    // A deployment-bound operation keeps its own binding contract: its authority, its evidence and
    // its expiry. The plain intent path has no pending record, no confirmation and no authority
    // writer, so it cannot honour any of those. The reference is refused here, before a capability
    // is invoked and before a record is appended, and it reaches its own path instead.
    return { operationRef, class: "deployment", allowed: false, reason: "deployment_bound_operation_needs_its_own_path" };
  }
  return { operationRef, class: "PX", allowed: false, reason: "unclassified_operation" };
}

/** Writers that may never decide a governed (P2/P3) operation. */
const LOCAL_ONLY_WRITERS: readonly string[] = ["local_read_policy", "cognate_local_policy"];

/**
 * The downgrade predicate the design asks CI to enforce: a governed operation cannot be satisfied
 * by a local-policy writer, and it cannot be satisfied by A0/A1 evidence.
 */
export function isDowngrade(operation: Operation): boolean {
  if (!GOVERNED_CLASSES.includes(operation.class)) return false;
  const writer = operation.authorityWriter ?? "";
  if (LOCAL_ONLY_WRITERS.includes(writer)) return true;
  const evidence = (operation.humanEvidence ?? "").toUpperCase();
  return evidence === "A0" || evidence === "A0_OR_A1" || evidence === "A1";
}

/** Whether a pending record must exist for this operation before its effect is written. */
export function requiresPendingRecord(operation: Operation): boolean {
  return GOVERNED_CLASSES.includes(operation.class) || operation.writable;
}
