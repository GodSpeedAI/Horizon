/**
 * The one list of request fields that would name an actor, and the strict field check.
 *
 * A caller is never taken from a request body. The actor comes from the authenticated session,
 * the agent key, the device credential, or the durable operator record, and every one of those is
 * checked against the store rather than read from the request. A body that carries a name like
 * `actor`, `executor` or `authority` is therefore refused outright rather than quietly ignored:
 * a field the caller believes was read is worse than a field that was not.
 *
 * One list serves every write boundary — the desktop's doors, the phone's command route, and the
 * surfaces that come after them. A list each boundary keeps for itself is a list that drifts: the
 * phone once refused only `actor` and `role` and accepted `caller_ref`, `principal`, `executor`
 * and `authority` as ordinary unknown fields, so a phone command could carry a name that the
 * desktop would have refused (R4-07).
 *
 * The list names the *field*, not the value. `owner_rev` is not `owner`: the question's owner
 * revision is a fact about the question, and the owner key a person saw is named by
 * `from_key_id` and `to_key_id`. Those are the caller's own facts, not a claim about who is
 * calling.
 */
import { loadParamSchemas, wireName } from "./params.ts";

export const RESERVED_ACTOR_FIELDS = [
  "actor",
  "actor_id",
  "actor_ref",
  "acting_as",
  "as_user",
  "authority",
  "authority_ref",
  "caller",
  "caller_id",
  "caller_ref",
  "executed_by",
  "executed_by_key",
  "executor",
  "executor_ref",
  "impersonate",
  "initiated_by",
  "on_behalf",
  "on_behalf_of",
  "operator",
  "operator_id",
  "principal",
  "principal_ref",
  "proposed_by",
  "requested_by",
  "role",
  "submitted_by",
  "user",
  "user_id",
  "username",
] as const;

/**
 * The first reserved field the body carries, or null when it carries none.
 *
 * The field is returned rather than a boolean so the refusal can name what it refused.
 */
export function reservedActorField(body: Record<string, unknown> | null | undefined): string | null {
  if (body === null || body === undefined) return null;
  for (const field of RESERVED_ACTOR_FIELDS) {
    if (field in body) return field;
  }
  return null;
}

/**
 * The first field the body carries that this boundary does not accept, or null.
 *
 * A boundary that names its fields has a closed vocabulary: a field the contract does not
 * declare is refused rather than ignored, because an ignored field is a field the caller may
 * believe was read. The boundary's own protocol fields — the action selector, the request id,
 * the dispatch envelope — are passed in as `allowed`, so the exclusion is visible where it is
 * made.
 */
export function unknownField(
  body: Record<string, unknown> | null | undefined,
  allowed: readonly string[],
): string | null {
  if (body === null || body === undefined) return null;
  const known = new Set(allowed);
  for (const field of Object.keys(body)) {
    if (!known.has(field)) return field;
  }
  return null;
}

/**
 * The fields one parameter schema accepts, on the wire.
 *
 * A schema with variants accepts the union of its variants' fields: which variant runs is
 * decided by the record's own discriminator, and a body is refused for a field no variant names.
 * An unknown schema names no field, which refuses every field — a boundary that cannot read the
 * contract must not guess at what it accepts.
 */
export function schemaFieldNames(schema: string): readonly string[] {
  const spec = loadParamSchemas()[schema];
  if (spec === undefined) return [];
  const fields = spec.variants === undefined
    ? (spec.fields ?? [])
    : Object.values(spec.variants).flatMap((variant) => variant.fields ?? []);
  return [...new Set(fields.map(wireName))];
}
