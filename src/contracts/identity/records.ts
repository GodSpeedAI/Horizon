import { readFileSync } from "node:fs";
import { resourcePath } from "../../runtime/resource-root.ts";
import { loadParamSchemas, validateAgainstSchema, wireName, type ParamFieldSpec, type ParamSchemaSpec } from "./params.ts";

/**
 * The eight signed record schemas of the identity contract, plus the unsigned `Refusal`, read from
 * `contracts/identity/v1/records.json`.
 *
 * The descriptor is JSON rather than YAML on purpose: one file, one set of bytes, read by this
 * TypeScript validator and by an independent Python checker with no new dependency. The descriptor
 * decides field names, types, and nullability. Cross-field rules live in `constraints` and are
 * implemented once per language over the same rule ids, so a disagreement fails a test.
 *
 * Nothing here mints, signs, or verifies anything. It decides whether a record is well formed and
 * internally consistent, which is the Stage 0A gate. Liveness, epochs, and revocation are Stage 3
 * and Stage 5 observations and are named as not enforceable from one record.
 */

export interface FieldSpec {
  readonly name: string;
  readonly type: string;
  readonly nullable?: boolean;
  readonly enum?: readonly string[];
}

export interface RecordSpec {
  readonly signed: boolean;
  readonly identity: string;
  readonly nullability: string;
  readonly fields: readonly FieldSpec[];
}

export interface RecordsContract {
  readonly records_version: string;
  readonly contract_id: string;
  readonly contract_version: string;
  readonly frozen_at: string;
  readonly authority: Record<string, unknown>;
  readonly encoding: Record<string, string>;
  readonly envelope: readonly FieldSpec[];
  readonly records: Readonly<Record<string, RecordSpec>>;
  readonly constraints: Readonly<Record<string, { applies_to: readonly string[]; rule: string }>>;
  readonly not_enforceable_from_one_record: Record<string, string>;
  /** The register of parameters that name a delegation, and what each one means per caller kind. */
  readonly delegation_reference_parameters?: DelegationReferenceRegister;
}

/** One delegation-reference parameter: a field that names a delegation, and its meaning. */
export interface DelegationReferenceEntry {
  readonly schema: string;
  readonly field: string;
  readonly meaning: string;
  /**
   * What the field means to each caller kind: `authority` (the delegation the caller acts
   * under), `target` (the delegation the operation acts on), or `forbidden` (the caller may not
   * name it). A caller kind the map does not list is treated as `forbidden`.
   */
  readonly per_caller_kind: Readonly<Record<string, string>>;
}

/** The register itself: the rule that reads it, the entries it holds, and the vocabulary that
 * decides which parameters are delegation references at all. */
export interface DelegationReferenceRegister {
  readonly rule: string;
  readonly entries: readonly DelegationReferenceEntry[];
  /**
   * The parameter names that name a delegation, on the wire.
   *
   * A parameter whose name is in this list is a delegation reference whether or not its schema
   * registers it, so a request cannot smuggle a delegation under a schema that forgot to say so.
   * A (schema, field) pair the register does not list is forbidden to every caller kind.
   */
  readonly delegation_reference_fields?: readonly string[];
  /** Why a name that looks like a delegation reference is not one. */
  readonly notes?: Readonly<Record<string, string>>;
}

/** Catalog facts about the operation a descriptor names. Supplied by the caller, verified against
 * the manifest by the test, so both language implementations read the same facts. */
export interface CatalogFacts {
  readonly operation_id: string;
  readonly class: string;
  readonly params_schema?: string | null;
  /**
   * The parameter schema itself, when the caller holds it. The cross-language fixture carries the
   * schema beside the record so the TypeScript validator and the Python one check the same bytes;
   * when it is absent the schema is read from the frozen parameter contract by name.
   */
  readonly params_schema_spec?: ParamSchemaSpec | null;
  readonly alias_fixed?: { readonly field: string; readonly value: string } | null;
  readonly listed_targets?: readonly string[];
  /** The writer that holds the authority for the row. A pending record needs it to know whether
   * the row's authority is the local continuation or something outside it. */
  readonly authority_writer?: string | null;
  /** The caller kinds the operation permits. A record whose caller kind is not among them is
   * refused: a device credential's record may not claim a human session, and a human session's
   * record may not claim a device (R5-05). */
  readonly permitted_caller_kinds?: readonly string[];
}

/** The frozen parameter schema by name, or null when the contract does not declare it. */
function paramSchemaNamed(name: string): ParamSchemaSpec | null {
  return loadParamSchemas()[name] ?? null;
}

/** Previous-record facts a single record cannot contain: the parent of a child grant, nonces
 * already spent, the record this one replaces, and the pending record a replacement supersedes. */
export interface RecordContext {
  readonly parent_grant?: Record<string, unknown>;
  readonly previous_nonces?: readonly string[];
  readonly previous_ref?: string | null;
  readonly superseded_pending?: Record<string, unknown>;
  /** The transitions already appended for one pending operation, oldest first. The chain is what
   * the next transition must continue: a pending operation's state lives in these records. */
  readonly pending_transitions?: readonly Record<string, unknown>[];
  /** The authority the case record carries: local or governed. */
  readonly case_authority?: string;
  /** The external entitlement an entitlement-backed authority record rests on. It is not a Horizon
   * record: it is the owner's artifact, mapped onto the facts the external interface declares. */
  readonly entitlement?: Record<string, unknown>;
}

export type Violation = string;

const UINT64_MAX = "18446744073709551615";
const UINT64 = /^(0|[1-9][0-9]*)$/;
const DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;
const BASE64URL = /^[A-Za-z0-9_-]{16,}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const PRIVATE_JWK = ["d", "p", "q", "dp", "dq", "qi", "oth"];

function defaultPath(): string {
  return resourcePath("contracts", "identity", "v1", "records.json");
}

let cached: RecordsContract | null = null;

export function loadRecordsContract(path = defaultPath()): RecordsContract {
  if (cached !== null && path === defaultPath()) return cached;
  const parsed = JSON.parse(readFileSync(path, "utf8")) as RecordsContract;
  if (parsed.contract_id !== "horizon.identity.records") throw new Error(`records: unexpected contract id ${parsed.contract_id}`);
  if (!parsed.records.Credential) throw new Error("records: missing Credential");
  if (path === defaultPath()) cached = parsed;
  return parsed;
}

/** One fact an external interface must carry, and what it binds to in a Horizon record. */
export interface ExternalInterfaceFact {
  readonly fact: string;
  readonly meaning: string;
  readonly binds: string | null;
}
/** An interface another project owns and mints. Horizon consumes it; it never authors it. */
export interface ExternalInterface {
  readonly interface_id: string;
  readonly interface_version: string;
  readonly owner: string;
  readonly publication_status: string;
  readonly horizon_mints: boolean;
  readonly horizon_binding: string;
  readonly required_facts: readonly ExternalInterfaceFact[];
  readonly failure_rule: string;
  readonly dependency: string | null;
  /** The record field each kind's subject fact binds to, named per record kind. */
  readonly subject_binding?: Readonly<Record<string, string>>;
  /** The checks Horizon applies to the owner's artifact, named so each one is derived from a fact. */
  readonly horizon_checks?: readonly string[];
}
export interface ExternalInterfacesContract {
  readonly contract_id: string;
  readonly contract_version: string;
  readonly interfaces: readonly ExternalInterface[];
}
/** The interface the human entitlement path rests on. Its owner publishes it; Horizon names it. */
export const ENTITLEMENT_INTERFACE_ID = "sea_forge.human_entitlement";
function defaultExternalInterfacesPath(): string {
  return resourcePath("contracts", "identity", "v1", "external-interfaces.json");
}
let externalInterfacesCached: ExternalInterfacesContract | null = null;
export function loadExternalInterfaces(path = defaultExternalInterfacesPath()): ExternalInterfacesContract {
  if (externalInterfacesCached !== null && path === defaultExternalInterfacesPath()) return externalInterfacesCached;
  const parsed = JSON.parse(readFileSync(path, "utf8")) as ExternalInterfacesContract;
  if (parsed.contract_id !== "horizon.identity.external_interfaces") {
    throw new Error(`external interfaces: unexpected contract id ${parsed.contract_id}`);
  }
  if (path === defaultExternalInterfacesPath()) externalInterfacesCached = parsed;
  return parsed;
}
/** The entitlement interface, or null when the interface contract cannot be read. A contract that
 * cannot be read is a refusal, never a pass. */
function entitlementInterface(): ExternalInterface | null {
  try {
    return loadExternalInterfaces().interfaces.find((entry) => entry.interface_id === ENTITLEMENT_INTERFACE_ID) ?? null;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalUint64(value: unknown): boolean {
  if (typeof value !== "string" || !UINT64.test(value)) return false;
  if (value.length !== UINT64_MAX.length) return value.length < UINT64_MAX.length;
  return value <= UINT64_MAX;
}

function canonicalDecimal(value: unknown): boolean {
  return typeof value === "string" && DECIMAL.test(value);
}

/** A canonical UTC timestamp in milliseconds, or null when the value is not one. Two timestamps
 * are compared as instants, not as text, so a fractional second cannot reorder them. */
function timestampMillis(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/.exec(value);
  if (match === null) return null;
  const [, year, month, day, hour, minute, second, fraction] = match;
  const millis = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  if (!Number.isFinite(millis)) return null;
  return millis + (fraction === undefined ? 0 : Number(`0.${fraction}`) * 1000);
}

function compareDecimal(left: string, right: string): number {
  const [leftWhole = "0", leftFraction = ""] = left.split(".");
  const [rightWhole = "0", rightFraction = ""] = right.split(".");
  const width = Math.max(leftFraction.length, rightFraction.length);
  const scaled = (whole: string, fraction: string): string => `${whole}${fraction.padEnd(width, "0")}`.replace(/^0+(?=\d)/, "");
  const a = scaled(leftWhole, leftFraction);
  const b = scaled(rightWhole, rightFraction);
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  return a === b ? 0 : a < b ? -1 : 1;
}

function typeViolation(type: string, value: unknown): boolean {
  switch (type) {
    case "string":
      return typeof value !== "string";
    case "uint64":
      return !canonicalUint64(value);
    case "decimal":
      return !canonicalDecimal(value);
    case "timestamp":
      return typeof value !== "string" || !TIMESTAMP.test(value);
    case "boolean":
      return typeof value !== "boolean";
    case "base64url":
      return typeof value !== "string" || !BASE64URL.test(value);
    case "digest":
      return typeof value !== "string" || !DIGEST.test(value);
    case "string_array":
      return !Array.isArray(value) || value.some((entry) => typeof entry !== "string");
    case "object":
      return !isObject(value);
    case "jwk": {
      if (!isObject(value)) return true;
      if (typeof value.kty !== "string") return true;
      if (["EC", "RSA", "OKP"].includes(value.kty) === false) return true;
      return PRIVATE_JWK.some((member) => member in value);
    }
    case "money": {
      if (!isObject(value)) return true;
      if (!canonicalDecimal(value.amount)) return true;
      if (typeof value.unit !== "string" || value.unit === "") return true;
      if (value.remaining !== undefined && !canonicalDecimal(value.remaining)) return true;
      return false;
    }
    default:
      throw new Error(`records: unknown field type ${type}`);
  }
}

/** Field-level validation shared by every record: presence, nullability, type, enum, and unknown
 * keys. The envelope is required on every record. */
export function checkFields(contract: RecordsContract, kind: string, value: unknown): Violation[] {
  const spec = contract.records[kind];
  if (spec === undefined) return [`unknown_record:${kind}`];
  if (!isObject(value)) return [`type:record:${kind}`];
  const violations: Violation[] = [];
  const declared = new Map<string, FieldSpec>();
  for (const field of [...contract.envelope, ...spec.fields]) declared.set(field.name, field);
  for (const field of declared.values()) {
    if (!(field.name in value)) {
      violations.push(`missing:${field.name}`);
      continue;
    }
    const present = value[field.name];
    if (present === null) {
      if (field.nullable !== true) violations.push(`null:${field.name}`);
      continue;
    }
    if (typeViolation(field.type, present)) violations.push(`type:${field.name}:${field.type}`);
    if (field.enum !== undefined && typeof present === "string" && !field.enum.includes(present)) violations.push(`enum:${field.name}`);
  }
  for (const key of Object.keys(value)) {
    if (!declared.has(key)) violations.push(`unknown:${key}`);
  }
  return violations;
}

const stringOf = (record: Record<string, unknown>, field: string): string | null => {
  const value = record[field];
  return typeof value === "string" ? value : null;
};

const isNull = (record: Record<string, unknown>, field: string): boolean => record[field] === null || record[field] === undefined;

/**
 * Does the external entitlement cover the record it authorizes?
 *
 * The record's own facts and the owner's facts have to agree. A wider entitlement is fine — the
 * owner may grant more than this operation needs — but a narrower scope, a smaller ceiling, a
 * different subject, a different operation, a different epoch, an expiry before the record's, or
 * a revoked entitlement are all refusals.
 *
 * The fact names come from the external interface contract, so the contract decides what the
 * owner's artifact must carry; this function decides what "the same" means.
 */
export function entitlementBinds(
  record: Record<string, unknown>,
  kind: string,
  view: Record<string, unknown>,
  spec: ExternalInterface,
): boolean {
  for (const fact of spec.required_facts) {
    if (!(fact.fact in view)) return false;
    const owned = view[fact.fact];
    // The issuer's key identifier and the owner's signature are not optional text: an artifact
    // that names no key or carries no signature is not authority, whatever else it says.
    if (fact.fact === "issuer_key_id" || fact.fact === "signature") {
      if (typeof owned !== "string" || owned.length === 0) return false;
    }
    if (fact.binds === null) continue;
    switch (fact.binds) {
      case "interface_id":
        if (owned !== spec.interface_id) return false;
        break;
      case "interface_version":
        if (owned !== spec.interface_version) return false;
        break;
      case "entitlement_ref":
        if (owned !== record.entitlement_ref) return false;
        break;
      case "record_subject": {
        // The subject a fact binds to is named per record kind by the interface's own subject
        // binding map. A kind the map does not name is a contract defect, not a pass.
        const field = spec.subject_binding?.[kind] ?? null;
        if (field === null) return false;
        const subject = stringOf(record, field);
        if (subject === null || owned !== subject) return false;
        break;
      }
      case "operation_digest":
        if (owned !== record.operation_digest) return false;
        break;
      case "resource_scope": {
        const covered = Array.isArray(owned) ? (owned as unknown[]) : null;
        const named = Array.isArray(record.resource_refs) ? (record.resource_refs as string[]) : [];
        if (covered === null) return false;
        if (!named.every((resource) => covered.includes(resource))) return false;
        break;
      }
      case "amount": {
        // The entitlement is bounded: a ceiling is required, and it covers the record's amount in
        // the same unit. An unbounded entitlement is not a bounded one.
        if (!isObject(owned) || typeof owned.amount !== "string" || typeof owned.unit !== "string") return false;
        if (!canonicalDecimal(owned.amount)) return false;
        const own = record.amount;
        if (own === undefined || own === null) break;
        if (!isObject(own) || typeof own.amount !== "string" || typeof own.unit !== "string") return false;
        if (!canonicalDecimal(own.amount)) return false;
        if (own.unit !== owned.unit) return false;
        if (compareDecimal(owned.amount, own.amount) < 0) return false;
        break;
      }
      case "authority_epoch":
        if (owned !== record.authority_epoch) return false;
        break;
      case "expiry": {
        const own = stringOf(record, "expires_at");
        if (own === null || typeof owned !== "string") return false;
        const ownMillis = timestampMillis(own);
        const ownedMillis = timestampMillis(owned);
        if (ownMillis === null || ownedMillis === null) return false;
        if (ownedMillis < ownMillis) return false;
        break;
      }
      case "revocation_state":
        if (owned !== "active") return false;
        break;
      default:
        // An unknown binding is a contract defect, not a pass.
        return false;
    }
  }
  return true;
}

/**
 * Every field of a schema, its variants' fields included, and each field's nested members.
 *
 * The walk is recursive because a delegation can be named inside an object or an array element:
 * a schema that buries a `grant_ref` one level down has still declared a delegation reference.
 */
function everyFieldOf(spec: ParamSchemaSpec): ParamFieldSpec[] {
  const found: ParamFieldSpec[] = [];
  const walk = (fields: readonly ParamFieldSpec[] | undefined): void => {
    for (const field of fields ?? []) {
      found.push(field);
      walk(field.object_fields);
      if (field.items !== undefined) walk(field.items.object_fields);
    }
  };
  walk(spec.fields);
  for (const variant of Object.values(spec.variants ?? {})) walk(variant.fields);
  return found;
}

/**
 * The parameter names of one schema that name a delegation, on the wire.
 *
 * A parameter is a delegation reference when its name is in the register's vocabulary, or when
 * the schema declares a field whose own name is in the vocabulary — the second case catches a
 * schema that renames a delegation reference on the wire to smuggle it past the rule. The
 * vocabulary itself is always included, so a request that carries a delegation reference under a
 * schema that does not declare it is still seen.
 */
export function delegationReferenceWireNames(
  schemaRef: string,
  vocabulary: readonly string[],
  spec?: ParamSchemaSpec | null,
): string[] {
  const names = new Set<string>(vocabulary);
  const effective = spec ?? paramSchemaNamed(schemaRef);
  if (effective !== null) {
    for (const field of everyFieldOf(effective)) {
      if (vocabulary.includes(field.name) || vocabulary.includes(wireName(field))) names.add(wireName(field));
    }
  }
  return [...names];
}

/**
 * What a delegation-reference parameter means to one caller kind.
 *
 * `authority` — the delegation the caller acts under, so the record's own `delegation_ref` must
 * be that same reference. `target` — the delegation the operation acts on; naming it claims
 * nothing. `forbidden` — the caller may not name it at all. A caller kind the register does not
 * list is `forbidden`: a parameter whose meaning is not stated is a parameter whose authority is
 * not stated. A (schema, field) pair the register does not list at all is `forbidden` too, so an
 * unstated parameter cannot become an unstated permission.
 */
function delegationReferenceMeaning(
  contract: RecordsContract,
  schemaRef: string,
  fieldName: string,
  callerKind: string | null,
): "authority" | "target" | "forbidden" {
  const entries = contract.delegation_reference_parameters?.entries ?? [];
  const entry = entries.find((candidate) => candidate.schema === schemaRef && candidate.field === fieldName);
  if (entry === undefined) return "forbidden";
  const meaning = callerKind === null ? undefined : entry.per_caller_kind[callerKind];
  if (meaning === "authority" || meaning === "target" || meaning === "forbidden") return meaning;
  return "forbidden";
}

/** Every cross-field rule in the descriptor, keyed by the rule id the fixtures name. Each rule
 * returns no violation when its own inputs are absent, so a field-level defect is never reported
 * twice under two names. */
export function checkConstraints(
  contract: RecordsContract,
  kind: string,
  value: unknown,
  catalog?: CatalogFacts,
  context?: RecordContext,
): Violation[] {
  const spec = contract.records[kind];
  if (spec === undefined || !isObject(value)) return [];
  const record = value;
  const out: Violation[] = [];
  const fail = (id: string): void => {
    if (contract.constraints[id] === undefined) throw new Error(`records: fixture names unknown constraint ${id}`);
    out.push(`constraint:${id}`);
  };
  const parameters = isObject(record.parameters) ? record.parameters : null;
  const callerKind = stringOf(record, "caller_kind");

  // The fence's caller is the principal that asked; the execution is the one that will act. They
  // must differ. On a descriptor the caller may legitimately be the executing principal, so the
  // caller_kind rules below are what catch substitution there.
  if (kind === "EffectFence") {
    const caller = stringOf(record, "caller_ref");
    const execution = stringOf(record, "execution_ref");
    if (caller !== null && execution !== null && caller === execution) fail("caller_is_not_target");
  }

  if (kind === "OperationDescriptor" || kind === "PendingOperation") {
    if (callerKind === "human_session") {
      if (!isNull(record, "delegation_ref")) fail("human_has_no_grant");
      if (!isNull(record, "execution_ref")) fail("human_has_no_credential");
    }
    // The delegation-reference register. A parameter that names a delegation is the caller's
    // authority, the operation's target, or forbidden to that caller, and the register says
    // which. The vocabulary decides which parameters are delegation references at all, so a
    // request cannot smuggle one under a schema that forgot to register it: an unlisted
    // (schema, field) pair is forbidden to every caller kind.
    if (parameters !== null && callerKind !== null) {
      const schemaRef = stringOf(record, "params_schema_ref");
      if (schemaRef !== null) {
        const vocabulary = contract.delegation_reference_parameters?.delegation_reference_fields ?? [];
        const names = delegationReferenceWireNames(schemaRef, vocabulary, catalog?.params_schema_spec ?? null);
        for (const name of names) {
          const named = parameters[name];
          if (named === undefined || named === null) continue;
          const meaning = delegationReferenceMeaning(contract, schemaRef, name, callerKind);
          if (meaning === "target") continue;
          if (callerKind === "human_session") {
            fail("human_has_no_grant");
            continue;
          }
          if (meaning === "authority") {
            // The caller acts under the delegation it names, so the record must hold that same
            // one. A console caller holds no delegation at all and can never be the authority.
            if (callerKind === "local_console" || stringOf(record, "delegation_ref") !== named) {
              fail("delegation_reference_kind");
            }
            continue;
          }
          fail("delegation_reference_kind");
        }
      }
    }
    if (callerKind === "agent_execution" && isNull(record, "execution_ref")) fail("agent_needs_execution");
    if (callerKind === "local_console") {
      if (!isNull(record, "execution_ref") || !isNull(record, "delegation_ref")) fail("console_has_no_execution");
    }
    // A device credential and a code holder hold none of the three caller channels. A record that
    // gives one of them a session, an execution or a delegation head is refused (R5-05).
    if (callerKind === "device_credential" || callerKind === "code_holder") {
      if (
        !isNull(record, "session_ref") ||
        !isNull(record, "execution_ref") ||
        !isNull(record, "delegation_ref")
      ) {
        fail("non_principal_caller_has_no_credential");
      }
    }
    // The registered key proves the agent principal and not a logical execution, so the record
    // names no session and no execution. It holds no delegation head of its own either: the agent
    // door has no grant to spend until the issuer exists.
    if (callerKind === "registered_agent") {
      if (
        !isNull(record, "session_ref") ||
        !isNull(record, "execution_ref") ||
        !isNull(record, "delegation_ref")
      ) {
        fail("caller_channel_exclusive");
      }
    }
    if (catalog !== undefined) {
      // The operation's own permitted caller kinds. The record's kind must be one of them, so a
      // device's record cannot claim a human session and a human's record cannot claim a device
      // (R5-05). The fact is the catalog's, not the validator's.
      if (catalog.permitted_caller_kinds !== undefined && (callerKind === null || !catalog.permitted_caller_kinds.includes(callerKind))) {
        fail("caller_kind_permitted");
      }
      const governed = catalog.class === "P2" || catalog.class === "P3";
      if (governed && callerKind === "agent_execution" && isNull(record, "delegation_ref")) fail("governed_agent_needs_delegation");
      const expected = catalog.params_schema ?? null;
      if (expected !== null && stringOf(record, "params_schema_ref") !== expected) fail("params_schema_mismatch");
      const fixed = catalog.alias_fixed ?? null;
      if (fixed !== null) {
        const supplied = parameters === null ? undefined : parameters[fixed.field];
        if (supplied !== fixed.value) fail("alias_fixes_action");
      }
      if (catalog.listed_targets !== undefined && parameters !== null) {
        const single = parameters.target_operation;
        const planned = Array.isArray(parameters.resolved_operations) ? (parameters.resolved_operations as unknown[]) : null;
        const targets = typeof single === "string" ? [single] : planned !== null ? planned.filter((entry): entry is string => typeof entry === "string") : [];
        const namesOne = typeof single === "string" || (planned !== null && planned.length > 0);
        if (!namesOne) fail("dispatcher_target_listed");
        else if (targets.length === 0 || targets.some((target) => !catalog.listed_targets?.includes(target))) fail("dispatcher_target_listed");
      }
      // A governed row may not be described with a local read or local write schema.
      if (governed && ["params.read", "params.local_write"].includes(expected ?? "")) fail("params_schema_mismatch");
      // The parameters themselves are checked against the schema the record names. The name alone
      // proves nothing: a record that names the right schema and carries the wrong fields is the
      // defect this rule exists for.
      if (parameters !== null && expected !== null) {
        const spec = catalog.params_schema_spec ?? paramSchemaNamed(expected);
        if (spec === null) fail("parameters_match_schema");
        else if (validateAgainstSchema(spec, parameters, record).length > 0) fail("parameters_match_schema");
      }
    }
  }

  if (kind === "PendingOperation") {
    // The descriptor is immutable and carries no confirmation. The confirmation is a
    // PendingTransition from pending to confirmed; a descriptor that claims one is refused rather
    // than believed.
    const confirmer = stringOf(record, "confirmer_ref");
    const presence = record.presence_evidence;
    const receipt = record.local_receipt;
    const hasPresence = presence !== undefined && presence !== null;
    const hasReceipt = receipt !== undefined && receipt !== null;
    if (confirmer !== null || hasPresence || hasReceipt) fail("pending_confirmation_not_caller_supplied");
    // The caller channel. A pending record names exactly one, and it is the one its caller kind
    // implies.
    const session = stringOf(record, "session_ref");
    const execution = stringOf(record, "execution_ref");
    const delegation = stringOf(record, "delegation_ref");
    if (callerKind === "human_session") {
      if (session === null || execution !== null || delegation !== null) fail("caller_channel_exclusive");
    } else if (callerKind === "agent_execution") {
      if (execution === null || session !== null) fail("caller_channel_exclusive");
      if (catalog !== undefined) {
        // An agent execution holds a delegation exactly when the operation is governed: a local
        // P0/P1 run has no delegation head to spend.
        const governed = catalog.class === "P2" || catalog.class === "P3";
        if (governed !== (delegation !== null)) fail("caller_channel_exclusive");
      }
    } else if (callerKind === "local_console") {
      if (session !== null || execution !== null || delegation !== null) fail("caller_channel_exclusive");
    }
    // A replacement record inherits the authority of the record it replaces: it may not widen it.
    const superseded = context?.superseded_pending;
    if (isObject(superseded)) {
      if (stringOf(record, "case_authority") !== stringOf(superseded, "case_authority")) fail("pending_case_authority_immutable");
      if (stringOf(record, "operation_id") !== stringOf(superseded, "operation_id")) fail("pending_case_authority_immutable");
    }
    if (catalog !== undefined) {
      const writer = catalog.authority_writer ?? null;
      const outside = writer === "sea_forge" || writer === "issuer_root";
      if ((outside || catalog.class === "P3") && stringOf(record, "case_authority") !== "governed") {
        fail("pending_governed_needs_governed_authority");
      }
      // A row that takes its authority from the case record must say the same authority the case
      // record carries.
      if (writer === "case_record.authority" && context?.case_authority !== undefined) {
        if (stringOf(record, "case_authority") !== context.case_authority) fail("pending_case_authority_matches_case");
      }
    }
  }
  if (kind === "PendingTransition") {
    // The complete transition table. A transition names the state it leaves and the state it
    // enters, and only these pairs exist. The reason is part of the claim: the same pair for a
    // different reason is a different event, and the table says which reason belongs to which pair.
    const from = stringOf(record, "from_state");
    const to = stringOf(record, "to_state");
    const reason = stringOf(record, "reason");
    const allowed: Record<string, { readonly to: string; readonly reasons: readonly string[] }[]> = {
      pending: [
        { to: "confirmed", reasons: ["human_confirmation"] },
        { to: "expired", reasons: ["window_closed", "launch_ended"] },
      ],
      confirmed: [
        { to: "dispatching", reasons: ["redemption_claim"] },
        { to: "expired", reasons: ["launch_ended"] },
      ],
      dispatching: [
        { to: "applied", reasons: ["effect_applied"] },
        { to: "uncertain", reasons: ["effect_uncertain", "launch_ended"] },
      ],
    };
    if (from === null || to === null || reason === null) {
      // The field-level check has already reported the missing or malformed value.
    } else {
      const successors = allowed[from] ?? [];
      const match = successors.find((entry) => entry.to === to);
      if (match === undefined) fail("pending_transition_chain");
      else if (!match.reasons.includes(reason)) fail("pending_transition_chain");
      // The chain: the state this transition leaves is the state the operation's prior transitions
      // leave it in, and `pending` when it is the first.
      const prior = context?.pending_transitions ?? [];
      const previous = prior.length === 0 ? "pending" : stringOf(prior[prior.length - 1]!, "to_state");
      if (previous !== from) fail("pending_transition_chain");
    }
    // The confirmation lives in the transition that makes it, and nowhere else.
    const confirmer = stringOf(record, "confirmer_ref");
    const presence = record.presence_evidence;
    const receipt = record.local_receipt;
    const hasPresence = presence !== undefined && presence !== null;
    const hasReceipt = receipt !== undefined && receipt !== null;
    const makesConfirmation = from === "pending" && to === "confirmed";
    if (makesConfirmation) {
      if (confirmer === null || !hasPresence || !hasReceipt) fail("pending_confirmation_not_caller_supplied");
    } else if (to === "expired" && (confirmer !== null || hasPresence || hasReceipt)) {
      // An expiry is the absence of a new confirmation. A confirmation that happened earlier stays
      // in its own transition: expiry never erases it, and an expired operation is never redeemable.
      fail("pending_expired_carries_no_confirmation");
    } else if (confirmer !== null || hasPresence || hasReceipt) {
      fail("pending_confirmation_not_caller_supplied");
    }
  }
  if (kind === "Approval") {
    const approver = stringOf(record, "approver_ref");
    const requester = stringOf(record, "requester_ref");
    const executor = stringOf(record, "executor_ref");
    if (approver !== null && (approver === requester || (executor !== null && approver === executor))) fail("separation_of_duty");
  }

  if (kind === "HorizonDelegationGrant") {
    const parent = context?.parent_grant;
    if (isObject(parent)) {
      const parentOperations = Array.isArray(parent.operations) ? (parent.operations as string[]) : [];
      const parentResources = Array.isArray(parent.resource_selectors) ? (parent.resource_selectors as string[]) : [];
      const parentLabels = Array.isArray(parent.data_labels) ? (parent.data_labels as string[]) : [];
      const operations = Array.isArray(record.operations) ? (record.operations as string[]) : [];
      const resources = Array.isArray(record.resource_selectors) ? (record.resource_selectors as string[]) : [];
      const labels = Array.isArray(record.data_labels) ? (record.data_labels as string[]) : [];
      const ownBudget = isObject(record.budget) ? record.budget : null;
      const parentBudget = isObject(parent.budget) ? parent.budget : null;
      const wider =
        operations.some((operation) => !parentOperations.includes(operation)) ||
        resources.some((resource) => !parentResources.includes(resource)) ||
        labels.some((label) => !parentLabels.includes(label)) ||
        (typeof record.audience === "string" && record.audience !== parent.audience) ||
        (stringOf(record, "expires_at") !== null &&
          typeof parent.expires_at === "string" &&
          stringOf(record, "expires_at")! > parent.expires_at) ||
        (typeof record.depth_remaining === "string" &&
          typeof parent.depth_remaining === "string" &&
          compareDecimal(record.depth_remaining, parent.depth_remaining) > 0) ||
        (record.redelegate === true && parent.redelegate !== true) ||
        (record.offline === true && parent.offline !== true) ||
        (typeof record.delegator_ref === "string" && typeof parent.agent_ref === "string" && record.delegator_ref !== parent.agent_ref) ||
        (typeof record.authority_epoch === "string" &&
          typeof parent.authority_epoch === "string" &&
          record.authority_epoch !== parent.authority_epoch) ||
        (ownBudget !== null &&
          parentBudget !== null &&
          canonicalDecimal(ownBudget.amount) &&
          canonicalDecimal(parentBudget.amount) &&
          compareDecimal(ownBudget.amount as string, parentBudget.amount as string) > 0) ||
        (ownBudget !== null &&
          canonicalDecimal(ownBudget.amount) &&
          canonicalDecimal(ownBudget.remaining) &&
          compareDecimal(ownBudget.remaining as string, ownBudget.amount as string) > 0);
      if (wider) fail("child_subset_of_parent");
    }
  }

  if (kind === "EffectFence" || kind === "HorizonAuthorityDecision") {
    const hasGrant = !isNull(record, "grant_ref");
    const hasEntitlement = !isNull(record, "entitlement_ref");
    if (hasGrant === hasEntitlement) fail("fence_authority_exactly_one");
    // An entitlement is an external record: SEA-Forge mints it and Horizon binds to it. A record
    // that names one is only as good as the entitlement behind it, so the two are checked
    // together. The rule applies only when the entitlement is the record's sole authority; a
    // record that carries both a grant and an entitlement is refused by the rule above.
    if (hasEntitlement && !hasGrant) {
      const spec = entitlementInterface();
      const view = context?.entitlement;
      // While the owner has published no entitlement artifact there is nothing to authenticate, so
      // the path is unavailable rather than merely unsigned.
      if (spec === null || spec.publication_status !== "published") fail("entitlement_is_external");
      else if (!isObject(view)) fail("entitlement_is_external");
      else if (!entitlementBinds(record, kind, view, spec)) fail("entitlement_is_external");
    }
  }

  if (kind === "A3Receipt") {
    const predicate = stringOf(record, "assurance_predicate");
    if (predicate === "A3-UV" && record.uv !== true) fail("a3_uv_requires_uv");
    // A3-T rests on the protected-terminal claim. Without it the receipt claims an assurance it
    // cannot show, and the two claims never stand in for each other.
    if (predicate === "A3-T" && record.protected_terminal_presence !== true) fail("a3_t_requires_protected_terminal_presence");
    if (predicate === "A3-UV" && record.protected_terminal_presence === true) fail("a3_uv_is_not_terminal_presence");
  }

  if (kind === "Approval" || kind === "OperationDescriptor" || kind === "PendingOperation") {
    const nonce = stringOf(record, "nonce");
    if (nonce !== null && (context?.previous_nonces ?? []).includes(nonce)) fail("nonce_not_reused");
  }

  if (kind === "EffectFence" || kind === "EvidenceRecord" || kind === "PendingOperation") {
    const previous = context?.previous_ref;
    if (previous !== undefined) {
      const supplied = stringOf(record, "supersedes_ref");
      if (previous === null ? supplied !== null : supplied !== previous) fail("supersedes_chain");
    }
  }

  return out;
}

/** The whole check: field-level then cross-field, sorted and deduplicated so two implementations
 * can be compared as sets rather than as orderings. */
export function validateRecord(
  contract: RecordsContract,
  kind: string,
  value: unknown,
  catalog?: CatalogFacts,
  context?: RecordContext,
): Violation[] {
  const violations = [...checkFields(contract, kind, value), ...checkConstraints(contract, kind, value, catalog, context)];
  return [...new Set(violations)].sort();
}

/** A child grant with an absent field grants nothing. The absent field is not inherited from the
 * parent, so this reports the effective authority of the child as written. */
export function effectiveChildGrant(contract: RecordsContract, child: Record<string, unknown>): Record<string, unknown> {
  const spec = contract.records.HorizonDelegationGrant;
  const effective: Record<string, unknown> = {};
  for (const field of spec?.fields ?? []) {
    if (field.name === "signature") continue;
    const present = child[field.name];
    if (present !== undefined && present !== null) {
      effective[field.name] = present;
      continue;
    }
    switch (field.name) {
      case "operations":
      case "resource_selectors":
      case "data_labels":
        effective[field.name] = [];
        break;
      case "budget":
        effective[field.name] = { amount: "0", unit: "currency", remaining: "0" };
        break;
      case "expires_at":
        effective[field.name] = null;
        break;
      case "depth_remaining":
        effective[field.name] = "0";
        break;
      case "redelegate":
      case "offline":
        effective[field.name] = false;
        break;
      case "audience":
        effective[field.name] = "";
        break;
      default:
        effective[field.name] = null;
    }
  }
  return effective;
}
