import { readFileSync } from "node:fs";
import { z } from "zod";

/**
 * The frozen parameter schemas (`contracts/identity/v1/params.yaml`).
 *
 * A schema names the fields one operation's parameters carry. The names on the wire are the
 * contract's own: a record's `parameters` hold the values the handler reads, so a confirmation
 * digest binds the effect that actually happens and not a description of it.
 *
 * This module is the one place that reads and checks them. The record validator uses it to check
 * a record's parameters against the schema the record names, and the binding check uses it to
 * compare a schema against the live handler.
 */

/** One element of an array field: the same shape as a field, without a name of its own. */
export interface ParamItemSpec {
  readonly type: string;
  readonly enum?: readonly (string | number | boolean)[];
  readonly nullable?: boolean;
  readonly object_fields?: readonly ParamFieldSpec[];
  readonly items?: ParamItemSpec;
  readonly note?: string;
}

/**
 * One field of a parameter schema.
 *
 * The type, the shape, the optionality and the nullability are four separate facts. A field is
 * `optional` when it may be absent, `nullable` when it may be null, and it may be both, either,
 * or neither. An object field carries its members in `object_fields`; an array field carries its
 * element in `items`. The two are checked recursively, so a nested field's own optionality and
 * nullability are enforced rather than assumed.
 */
export interface ParamFieldSpec {
  readonly name: string;
  /** The field's name on the wire. Defaults to the contract's own name. */
  readonly wire?: string;
  readonly type: string;
  readonly enum?: readonly (string | number | boolean)[];
  readonly nullable?: boolean;
  readonly optional?: boolean;
  readonly object_fields?: readonly ParamFieldSpec[];
  readonly items?: ParamItemSpec;
  readonly note?: string;
}

/** One variant of a schema whose effect is chosen by the code operation rather than by a field. */
export interface ParamVariantSpec {
  readonly fields: readonly ParamFieldSpec[];
  readonly rule?: string;
}

export interface ParamSchemaSpec {
  readonly fields?: readonly ParamFieldSpec[];
  readonly variants?: Readonly<Record<string, ParamVariantSpec>>;
  /** The record field that chooses the variant, when the choice is the caller's kind. */
  readonly discriminator?: string;
  /** The code operation that chooses the variant. */
  readonly discriminated_by?: string;
  readonly rule?: string;
  readonly alias_rule?: string;
}

/** An enum's values are not always strings: a flag's legal values are `true` or `false`. */
const enumValue = z.union([z.string(), z.boolean(), z.number()]);

const itemSchema: z.ZodType<ParamItemSpec> = z.lazy(() =>
  z
    .object({
      type: z.string().min(1),
      enum: z.array(enumValue).optional(),
      nullable: z.boolean().optional(),
      object_fields: z.array(z.lazy(() => fieldSchema)).optional(),
      items: z.lazy(() => itemSchema).optional(),
      note: z.string().optional(),
    })
    .strict(),
);

const fieldSchema: z.ZodType<ParamFieldSpec> = z.lazy(() =>
  z
    .object({
      name: z.string().min(1),
      wire: z.string().min(1).optional(),
      type: z.string().min(1),
      enum: z.array(enumValue).optional(),
      nullable: z.boolean().optional(),
      optional: z.boolean().optional(),
      object_fields: z.array(z.lazy(() => fieldSchema)).optional(),
      items: itemSchema.optional(),
      note: z.string().optional(),
    })
    .strict(),
);

const variantSchema = z
  .object({
    fields: z.array(fieldSchema),
    /** Prose that says what the variant requires. The validator checks the fields; this says why. */
    requires: z.string().optional(),
    rule: z.string().optional(),
  })
  .strict();

const schemaSchema = z
  .object({
    fields: z.array(fieldSchema).optional(),
    variants: z.record(variantSchema).optional(),
    discriminator: z.string().min(1).optional(),
    discriminated_by: z.string().min(1).optional(),
    rule: z.string().optional(),
    alias_rule: z.string().optional(),
    /** A schema that accepts no parameter at all says so here. */
    allows_empty: z.boolean().optional(),
  })
  .strict();

const documentSchema = z
  .object({
    schemas_version: z.string().min(1),
    contract_id: z.string().min(1),
    contract_version: z.string().min(1),
    frozen_at: z.string().min(1),
    schemas: z.record(schemaSchema),
  })
  .passthrough();

let cached: Record<string, ParamSchemaSpec> | null = null;

/**
 * The frozen schemas, read once. A malformed contract fails loudly rather than loading empty.
 *
 * Only the default path is cached. A caller that names another path — a check reading a
 * throwaway copy, say — gets that file's bytes, not the cached ones: a check that cannot see
 * the tree it was given is a check that passes for the wrong reason.
 */
export function loadParamSchemas(path = defaultPath()): Record<string, ParamSchemaSpec> {
  if (cached !== null && path === defaultPath()) return cached;
  const document = documentSchema.parse(Bun.YAML.parse(readFileSync(path, "utf8")));
  if (path === defaultPath()) cached = document.schemas;
  return document.schemas;
}

function defaultPath(): string {
  return new URL("../../../contracts/identity/v1/params.yaml", import.meta.url).pathname;
}

/** The field's name on the wire. */
export function wireName(field: ParamFieldSpec): string {
  return field.wire ?? field.name;
}

const DECIMAL = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function typeHolds(type: string, value: unknown): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "uint64":
    case "decimal":
      return typeof value === "string" && DECIMAL.test(value);
    case "integer":
      return typeof value === "number" && Number.isSafeInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "timestamp":
      return typeof value === "string" && TIMESTAMP.test(value);
    case "json":
      return value !== undefined;
    case "jwk":
      return typeof value === "object" && value !== null && !Array.isArray(value) && typeof (value as { kty?: unknown }).kty === "string";
    case "string_array":
      return Array.isArray(value) && value.every((entry) => typeof entry === "string");
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "object_array":
      return Array.isArray(value) && value.every((entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry));
    case "string_or_string_array":
      return typeof value === "string" || (Array.isArray(value) && value.every((entry) => typeof entry === "string"));
    default:
      return false;
  }
}

/** The violations one field list finds in one parameter object. */
function fieldViolations(fields: readonly ParamFieldSpec[], parameters: Record<string, unknown>): string[] {
  const out: string[] = [];
  const declared = new Map<string, ParamFieldSpec>();
  for (const field of fields) declared.set(wireName(field), field);
  for (const field of fields) {
    const name = wireName(field);
    if (!(name in parameters)) {
      if (field.optional !== true) out.push(`params:missing:${name}`);
      continue;
    }
    checkField(field, parameters[name], name, out);
  }
  for (const name of Object.keys(parameters)) {
    if (!declared.has(name)) out.push(`params:unknown:${name}`);
  }
  return out;
}

/**
 * Check one value against one field's declaration, recursively.
 *
 * A nested object's members are checked against their own declarations, so a nested field's
 * optionality and nullability are facts rather than assumptions, and an array's elements are
 * checked against the element declaration. The path names where the violation is: `surface.title`,
 * `ask.options[0].option_id`.
 */
function checkField(field: ParamFieldSpec, value: unknown, path: string, out: string[]): void {
  if (value === null) {
    if (field.nullable !== true) out.push(`params:null:${path}`);
    return;
  }
  if (!typeHolds(field.type, value)) {
    out.push(`params:type:${path}:${field.type}`);
    return;
  }
  if (field.enum !== undefined && !field.enum.some((allowed) => allowed === value)) {
    out.push(`params:enum:${path}`);
  }
  if (field.object_fields !== undefined && isPlainObject(value)) {
    for (const nested of field.object_fields) {
      const key = wireName(nested);
      const nestedPath = `${path}.${key}`;
      if (!(key in value)) {
        if (nested.optional !== true) out.push(`params:missing:${nestedPath}`);
        continue;
      }
      checkField(nested, value[key], nestedPath, out);
    }
  }
  if (field.items !== undefined && Array.isArray(value)) {
    value.forEach((entry, index) => checkItem(field.items!, entry, `${path}[${index}]`, out));
  }
}

/** Check one array element against the element declaration. */
function checkItem(item: ParamItemSpec, value: unknown, path: string, out: string[]): void {
  if (value === null) {
    if (item.nullable !== true) out.push(`params:null:${path}`);
    return;
  }
  if (!typeHolds(item.type, value)) {
    out.push(`params:type:${path}:${item.type}`);
    return;
  }
  if (item.enum !== undefined && !item.enum.some((allowed) => allowed === value)) {
    out.push(`params:enum:${path}`);
  }
  if (item.object_fields !== undefined && isPlainObject(value)) {
    for (const nested of item.object_fields) {
      const key = wireName(nested);
      const nestedPath = `${path}.${key}`;
      if (!(key in value)) {
        if (nested.optional !== true) out.push(`params:missing:${nestedPath}`);
        continue;
      }
      checkField(nested, value[key], nestedPath, out);
    }
  }
  if (item.items !== undefined && Array.isArray(value)) {
    value.forEach((entry, index) => checkItem(item.items!, entry, `${path}[${index}]`, out));
  }
}

/** A plain object: not null, not an array. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The fields a record's parameters are checked against.
 *
 * A schema with variants is chosen by the record's own discriminator when it has one (a caller's
 * kind, or a code operation the record carries). When the record does not carry the discriminator,
 * the parameters must satisfy at least one variant: the effect a variant names is the effect the
 * parameters describe, so the record is valid when they describe one of them.
 *
 * A discriminator the record *does* carry but the schema does not know is a different case, and it
 * is refused rather than fitted (R4-06). `caller_kind: local_console` on a schema that declares
 * only an agent and a human is not a record whose parameters happen to look like one of them: it
 * is a record from a caller kind the schema never described, and the only honest answer is that
 * the schema does not cover it. Falling back to the closest variant would hand that caller the
 * other caller's wire contract.
 */
export function fieldsFor(
  schema: ParamSchemaSpec,
  record: Record<string, unknown> = {},
): { readonly fields: readonly ParamFieldSpec[]; readonly variant: string | null; readonly resolved: boolean; readonly unknownVariant: string | null } {
  if (schema.variants === undefined) return { fields: schema.fields ?? [], variant: null, resolved: true, unknownVariant: null };
  const key = schema.discriminator ?? schema.discriminated_by;
  if (key !== undefined) {
    const value = record[key];
    if (typeof value === "string" && schema.variants[value] !== undefined) {
      return { fields: schema.variants[value]!.fields, variant: value, resolved: true, unknownVariant: null };
    }
    // The record names a discriminator the schema does not have a variant for. When the
    // discriminator is the caller's own kind, that caller kind is outside this schema's
    // vocabulary, and the schema refuses it. When the discriminator is an external code
    // operation, the record may simply not carry one, so the best-fit rule below still applies.
    if (schema.discriminator !== undefined && typeof value === "string") {
      return { fields: [], variant: null, resolved: false, unknownVariant: value };
    }
  }
  return { fields: [], variant: null, resolved: false, unknownVariant: null };
}

/**
 * Check one parameter object against one schema.
 *
 * The violations are named `params:<what>:<field>` so a record that carries the wrong values is
 * reported field by field, and the record validator turns them into a single refused record.
 */
export function validateParameters(
  schemaName: string,
  parameters: unknown,
  record: Record<string, unknown> = {},
): string[] {
  const schemas = loadParamSchemas();
  const schema = schemas[schemaName];
  if (schema === undefined) return [`params:unknown_schema:${schemaName}`];
  return validateAgainstSchema(schema, parameters, record);
}

/**
 * Check one parameter object against one schema the caller already holds.
 *
 * The cross-language fixture carries the schema beside the record, so the TypeScript validator and
 * the Python one check the same bytes rather than two readings of the same contract.
 */
export function validateAgainstSchema(
  schema: ParamSchemaSpec,
  parameters: unknown,
  record: Record<string, unknown> = {},
): string[] {
  if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) {
    return [`params:type:parameters:object`];
  }
  const values = parameters as Record<string, unknown>;
  if (schema.variants === undefined) return fieldViolations(schema.fields ?? [], values);
  const chosen = fieldsFor(schema, record);
  if (chosen.resolved) return fieldViolations(chosen.fields, values);
  // The record names a caller kind this schema does not declare. That is not a variant to fit:
  // it is a caller the schema never described, so the parameters are refused by name (R4-06).
  if (chosen.unknownVariant !== null) {
    return [`params:unknown_variant:${schema.discriminator}:${chosen.unknownVariant}`];
  }
  // No discriminator: the parameters must describe one of the variants. The report is the variant
  // with the fewest violations, so the message names the closest fit rather than every variant.
  let best: string[] | null = null;
  for (const key of Object.keys(schema.variants).sort()) {
    const found = fieldViolations(schema.variants[key]!.fields, values);
    if (best === null || found.length < best.length) best = found;
  }
  return best ?? [];
}
