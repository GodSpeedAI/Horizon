#!/usr/bin/env bun
/**
 * The delegation-reference register's exhaustiveness check.
 *
 * The register says what a parameter that names a delegation means: the caller's authority, the
 * operation's target, or forbidden to that caller. The vocabulary says which parameter names name
 * a delegation at all. Between them they have to cover every parameter the frozen schemas
 * declare — otherwise a schema could grow a delegation reference that the register never says
 * anything about, and the rule would refuse a request that is in fact legal, or accept one that
 * is in fact not.
 *
 * The check therefore reads both sides and refuses four ways of being wrong:
 *
 * 1. A schema declares a field whose name is in the vocabulary and the register has no entry for
 *    that schema and field. The request would be refused for a reason nobody wrote down.
 * 2. A register entry names a schema that does not exist, or a field the schema does not declare.
 *    The entry would never fire, and it would look as though it did.
 * 3. A register entry names a field that is not in the vocabulary. The entry claims to govern a
 *    parameter the rule would never look at.
 * 4. A vocabulary name that no schema declares and no register entry names is dead: it says a
 *    delegation reference exists that nothing carries. That is not an error — the vocabulary may
 *    name a field a future schema uses — but it is reported so the drift is visible.
 *
 * The check reads the same bytes the validators read: the frozen parameter contract and the
 * frozen record contract.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadParamSchemas, wireName, type ParamFieldSpec, type ParamSchemaSpec } from "../src/contracts/identity/params.ts";

const ROOT = path.resolve(import.meta.dir, "..");

interface RegisterEntry {
  readonly schema: string;
  readonly field: string;
  readonly per_caller_kind: Readonly<Record<string, string>>;
}
interface Register {
  readonly rule: string;
  readonly entries: readonly RegisterEntry[];
  readonly delegation_reference_fields?: readonly string[];
  readonly notes?: Readonly<Record<string, string>>;
}

/** Every field of a schema, its variants' fields included, and each field's nested members. */
function everyField(spec: ParamSchemaSpec): ParamFieldSpec[] {
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

export interface RegisterResult {
  readonly ok: boolean;
  readonly failures: readonly string[];
  readonly checked: number;
}

export function checkDelegationRegister(root: string = ROOT): RegisterResult {
  const failures: string[] = [];
  const schemas = loadParamSchemas(path.join(root, "contracts/identity/v1/params.yaml"));
  const contract = JSON.parse(readFileSync(path.join(root, "contracts/identity/v1/records.json"), "utf8")) as {
    delegation_reference_parameters?: Register;
  };
  const register = contract.delegation_reference_parameters;
  if (register === undefined) {
    return { ok: false, failures: ["records.json declares no delegation-reference register"], checked: 0 };
  }
  const vocabulary = register.delegation_reference_fields ?? [];
  if (vocabulary.length === 0) {
    failures.push("the register names no delegation-reference field, so no parameter is ever seen as a delegation");
  }
  const entries = register.entries;

  // 1. Every schema field in the vocabulary has a register entry.
  let checked = 0;
  for (const [schemaName, spec] of Object.entries(schemas)) {
    for (const field of everyField(spec)) {
      const wire = wireName(field);
      const inVocabulary = vocabulary.includes(field.name) || vocabulary.includes(wire);
      if (!inVocabulary) continue;
      checked += 1;
      const entry = entries.find((candidate) => candidate.schema === schemaName && candidate.field === wire);
      if (entry === undefined) {
        failures.push(`${schemaName}.${wire}: the field is a delegation reference and the register does not say what it means`);
        continue;
      }
      // The entry must govern every caller kind: an unstated caller kind is forbidden, which is
      // the safe answer, but the register says what each one means, so all of them are stated.
      for (const callerKind of ["human_session", "agent_execution", "local_console"]) {
        const meaning = entry.per_caller_kind[callerKind];
        if (meaning !== "authority" && meaning !== "target" && meaning !== "forbidden") {
          failures.push(`${schemaName}.${wire}: the register does not say what the field means for a ${callerKind} caller`);
        }
      }
    }
  }

  // 2 and 3. Every entry names a schema and a field that exist, and the field is in the vocabulary.
  for (const entry of entries) {
    const spec = schemas[entry.schema];
    if (spec === undefined) {
      failures.push(`${entry.schema}.${entry.field}: the register names a schema the parameter contract does not declare`);
      continue;
    }
    const declared = everyField(spec).some((field) => wireName(field) === entry.field);
    if (!declared) {
      failures.push(`${entry.schema}.${entry.field}: the register names a field the schema does not declare`);
    }
    if (!vocabulary.includes(entry.field)) {
      failures.push(`${entry.schema}.${entry.field}: the register governs a field that is not a delegation-reference name`);
    }
  }

  // 4. A vocabulary name that nothing carries is dead weight.
  for (const name of vocabulary) {
    const carried = Object.entries(schemas).some(([schemaName, spec]) =>
      everyField(spec).some((field) => wireName(field) === name || field.name === name),
    );
    const registered = entries.some((entry) => entry.field === name);
    if (!carried && !registered) {
      failures.push(`${name}: the vocabulary names a delegation reference that no schema declares and no entry governs`);
    }
  }

  return { ok: failures.length === 0, failures, checked };
}

if (import.meta.main) {
  const result = checkDelegationRegister();
  for (const failure of result.failures) console.log(`  FAIL ${failure}`);
  if (!result.ok) {
    console.error(`delegation register: ${result.failures.length} failure(s) across ${result.checked} delegation references`);
    process.exit(1);
  }
  console.log(`delegation register: ok — ${result.checked} delegation references are all registered`);
}
