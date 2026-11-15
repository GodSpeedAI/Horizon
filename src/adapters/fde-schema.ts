/**
 * A small JSON Schema (draft 2020-12 subset) validator for the vendored FDE contracts
 * (`contracts/fde/*.json`, copied by digest from SEA-Forge and RealityTrace).
 *
 * Scope: exactly the keywords those four contracts use. A schema that uses any other validating
 * keyword makes `validate` THROW (fail closed): an unrecognised constraint is never skipped, so
 * "valid" always means every constraint in the vendored schema was checked.
 * Pure and read-only; it has no I/O.
 */
export type Schema = { readonly [key: string]: unknown };

const ANNOTATIONS = new Set(["$schema", "$id", "title", "description", "$defs", "$comment", "default", "examples"]);
const KEYWORDS = new Set([
  "$ref", "type", "const", "enum", "pattern", "minLength", "minimum", "minItems", "items", "properties", "required",
  "additionalProperties", "allOf", "oneOf", "not", "if", "then", "else",
]);

export class SchemaRegistry {
  private readonly byId = new Map<string, Schema>();
  add(schema: Schema): void {
    const id = schema["$id"];
    if (typeof id !== "string") throw new Error("schema without $id");
    this.byId.set(id, schema);
  }
  /** Validate `value` against `rootId` (optionally a `#/$defs/...` fragment). Returns violation paths; empty means valid. */
  validate(rootId: string, value: unknown): string[] {
    const [id, fragment] = rootId.split("#");
    const root = this.byId.get(id!);
    if (root === undefined) throw new Error(`unknown schema ${id}`);
    const node = fragment === undefined || fragment === "" ? root : this.pointer(root, fragment);
    const errors: string[] = [];
    this.check(node, root, value, "", errors);
    return errors;
  }
  private pointer(root: Schema, fragment: string): Schema {
    let node: unknown = root;
    for (const part of fragment.split("/").slice(1)) node = (node as Schema | undefined)?.[part.replace(/~1/g, "/").replace(/~0/g, "~")];
    if (node === undefined || typeof node !== "object") throw new Error(`unresolved pointer ${fragment}`);
    return node as Schema;
  }
  private resolve(ref: string, root: Schema): { node: Schema; root: Schema } {
    const [id, fragment] = ref.split("#");
    const target = id === "" ? root : this.byId.get(id!);
    if (target === undefined) throw new Error(`unresolved $ref ${ref}`);
    return { node: fragment === undefined || fragment === "" ? target : this.pointer(target, fragment), root: target };
  }
  private ok(node: Schema, root: Schema, value: unknown, path: string): boolean {
    const errors: string[] = [];
    this.check(node, root, value, path, errors);
    return errors.length === 0;
  }
  private check(node: Schema, root: Schema, value: unknown, path: string, errors: string[]): void {
    for (const key of Object.keys(node)) if (!KEYWORDS.has(key) && !ANNOTATIONS.has(key)) throw new Error(`unsupported schema keyword '${key}' at ${path || "/"}`);
    const here = path === "" ? "/" : path;
    if (typeof node["$ref"] === "string") {
      const target = this.resolve(node["$ref"], root);
      this.check(target.node, target.root, value, path, errors);
    }
    const type = node["type"];
    if (type !== undefined && !typeIs(type as string, value)) { errors.push(`${here}: expected ${String(type)}`); return; }
    if ("const" in node && JSON.stringify(node["const"]) !== JSON.stringify(value)) errors.push(`${here}: not the constant`);
    if (Array.isArray(node["enum"]) && !(node["enum"] as unknown[]).some((e) => JSON.stringify(e) === JSON.stringify(value))) errors.push(`${here}: not in enum`);
    if (typeof value === "string") {
      if (typeof node["pattern"] === "string" && !new RegExp(node["pattern"] as string, "u").test(value)) errors.push(`${here}: pattern`);
      if (typeof node["minLength"] === "number" && [...value].length < (node["minLength"] as number)) errors.push(`${here}: minLength`);
    }
    if (typeof value === "number" && typeof node["minimum"] === "number" && value < (node["minimum"] as number)) errors.push(`${here}: minimum`);
    if (Array.isArray(value)) {
      if (typeof node["minItems"] === "number" && value.length < (node["minItems"] as number)) errors.push(`${here}: minItems`);
      if (node["items"] !== undefined) value.forEach((item, i) => this.check(node["items"] as Schema, root, item, `${path}/${i}`, errors));
    }
    if (isObject(value)) {
      const props = (node["properties"] ?? {}) as Record<string, Schema>;
      for (const req of (node["required"] ?? []) as string[]) if (!(req in value)) errors.push(`${path}/${req}: required`);
      for (const [k, v] of Object.entries(value)) {
        if (k in props) this.check(props[k]!, root, v, `${path}/${k}`, errors);
        else if (node["additionalProperties"] === false) errors.push(`${path}/${k}: additional property`);
        else if (isObject(node["additionalProperties"])) this.check(node["additionalProperties"] as Schema, root, v, `${path}/${k}`, errors);
      }
    }
    for (const sub of (node["allOf"] ?? []) as Schema[]) this.check(sub, root, value, path, errors);
    if (Array.isArray(node["oneOf"])) {
      const hits = (node["oneOf"] as Schema[]).filter((s) => this.ok(s, root, value, path)).length;
      if (hits !== 1) errors.push(`${here}: oneOf matched ${hits}`);
    }
    if (isObject(node["not"]) && this.ok(node["not"] as Schema, root, value, path)) errors.push(`${here}: matches a forbidden schema`);
    if (isObject(node["if"])) {
      const branch = this.ok(node["if"] as Schema, root, value, path) ? node["then"] : node["else"];
      if (isObject(branch)) this.check(branch as Schema, root, value, path, errors);
    }
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function typeIs(type: string, value: unknown): boolean {
  switch (type) {
    case "object": return isObject(value);
    case "array": return Array.isArray(value);
    case "string": return typeof value === "string";
    case "integer": return typeof value === "number" && Number.isInteger(value);
    case "number": return typeof value === "number";
    case "boolean": return typeof value === "boolean";
    case "null": return value === null;
    default: throw new Error(`unsupported type ${type}`);
  }
}
