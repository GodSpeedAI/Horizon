#!/usr/bin/env bun
/**
 * The design's parameter table, generated from the frozen parameter contract.
 *
 * The design names every frozen parameter schema and the fields it carries. Duplicating that
 * list by hand let the two drift: the design's table and the contract's schemas disagreed about
 * the fields, the types, and even about which schemas existed. A table that is checked is a
 * table that cannot drift, so the table is generated from `contracts/identity/v1/params.yaml`
 * and the design's copy is compared against this output by
 * `scripts/check-design-contract-consistency.ts`.
 *
 * The rendering is mechanical on purpose. A schema's rule — why a field is fixed, what a
 * discriminator selects — is prose, and prose belongs in the contract's own `rule` field and in
 * the design's paragraphs. The table says what the fields are; the prose says what they mean.
 *
 * The rendering carries every fact the contract declares about a field: its wire name, its
 * type, whether it may be absent (`?`), whether it may be null (`|null`), the shape of a nested
 * object, and the shape of an array's elements. A nested field's own optionality and
 * nullability are facts, so they are rendered rather than assumed (R3-06).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
const ROOT = path.resolve(import.meta.dir, "..");

/** One array element's declaration. */
export interface ItemSpec {
  readonly type: string;
  readonly enum?: readonly (string | number | boolean)[];
  readonly nullable?: boolean;
  readonly object_fields?: readonly FieldSpec[];
  readonly items?: ItemSpec;
}

export interface FieldSpec {
  readonly name: string;
  readonly wire?: string;
  readonly type: string;
  readonly enum?: readonly (string | number | boolean)[];
  readonly nullable?: boolean;
  readonly optional?: boolean;
  readonly object_fields?: readonly FieldSpec[];
  readonly items?: ItemSpec;
}
export interface SchemaSpec {
  readonly fields?: readonly FieldSpec[];
  readonly variants?: Readonly<Record<string, { readonly fields?: readonly FieldSpec[] }>>;
  readonly discriminator?: string;
  readonly discriminated_by?: string;
}
/** The field's name on the wire. */
function wireName(field: FieldSpec): string {
  return field.wire ?? field.name;
}
/** The optionality markers, in the order the design writes them. */
function markers(spec: { readonly nullable?: boolean; readonly optional?: boolean }): string {
  let rendered = "";
  if (spec.nullable === true) rendered += "|null";
  if (spec.optional === true) rendered += "?";
  return rendered;
}
/** One array element's type, without a name: the element has a position, not a name. */
function renderItemType(item: ItemSpec): string {
  if (item.enum !== undefined) return item.enum.map((value) => JSON.stringify(value)).join("\\|");
  if (item.type === "object" && item.object_fields !== undefined) {
    const inner = item.object_fields.map((nested) => renderInline(nested)).join(", ");
    return `{${inner}}`;
  }
  if (item.type === "array" && item.items !== undefined) return `[${renderItemType(item.items)}]`;
  return item.type;
}
/** One field's inline form: its wire name, its type, and its optionality. */
function renderInline(field: FieldSpec): string {
  return `${wireName(field)}:${renderType(field)}${markers(field)}`;
}
/** One field's type, as the design writes it. */
function renderType(field: FieldSpec): string {
  if (field.enum !== undefined) return field.enum.map((value) => JSON.stringify(value)).join("\\|");
  if (field.type === "object" && field.object_fields !== undefined) {
    const inner = field.object_fields.map((nested) => renderInline(nested)).join(", ");
    return `{${inner}}`;
  }
  if (field.type === "array" && field.items !== undefined) return `[${renderItemType(field.items)}]`;
  return field.type;
}
/** One field, as the design writes it: its wire name and its type. */
function renderField(field: FieldSpec): string {
  return `\`${renderInline(field)}\``;
}

/** One schema's fields, as the design writes them. */
export function renderSchema(schema: SchemaSpec): string {
  if (schema.variants !== undefined) {
    const key = schema.discriminator ?? schema.discriminated_by ?? "variant";
    const parts = Object.keys(schema.variants)
      .sort()
      .map((name) => `**\`${name}\`** → ${(schema.variants![name]!.fields ?? []).map(renderField).join(", ")}`);
    return `discriminated by \`${key}\`: ${parts.join("; ")}`;
  }
  const fields = schema.fields ?? [];
  if (fields.length === 0) return "no fields";
  return fields.map(renderField).join(", ");
}

/** The frozen schemas, in the contract's own order. */
export function loadSchemas(root: string = ROOT): Record<string, SchemaSpec> {
  const document = Bun.YAML.parse(
    readFileSync(path.join(root, "contracts/identity/v1/params.yaml"), "utf8"),
  ) as { schemas: Record<string, SchemaSpec> };
  return document.schemas;
}

/** The whole table, header included. */
export function renderParameterTable(root: string = ROOT): string {
  const schemas = loadSchemas(root);
  const rows = [
    "| Schema | Fields (wire names) |",
    "|---|---|",
    ...Object.keys(schemas).map((name) => `| \`${name}\` | ${renderSchema(schemas[name]!)} |`),
  ];
  return rows.join("\n");
}

if (import.meta.main) {
  console.log(renderParameterTable());
}
