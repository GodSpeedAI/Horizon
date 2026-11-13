#!/usr/bin/env bun
/**
 * Regenerate the fixtures' embedded parameter schema specs from the frozen parameter contract.
 *
 * A fixture case carries the parameter schema it was written against, so the two validators can
 * check a case without reading `params.yaml`. That copy drifted: the schemas gained fields, lost
 * fields, gained arrays and nested optionality, and the embedded copies did not follow. The
 * expectation set of a case is the author's claim and is never touched here — only the mechanical
 * copy of the schema is refreshed, and only from the frozen contract.
 *
 * The script refuses a case whose `params_schema_ref` names a schema the contract does not
 * declare, so a typo fails loudly instead of producing an empty spec.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const ROOT = path.resolve(import.meta.dir, "..");

const fixturesPath = path.join(ROOT, "contracts/identity/v1/fixtures/record-cases.json");
const paramsPath = path.join(ROOT, "contracts/identity/v1/params.yaml");
const recordsPath = path.join(ROOT, "contracts/identity/v1/records.json");

const params = Bun.YAML.parse(readFileSync(paramsPath, "utf8")) as {
  schemas: Record<string, unknown>;
};
const records = JSON.parse(readFileSync(recordsPath, "utf8")) as { contract_version: string };
const fixtures = JSON.parse(readFileSync(fixturesPath, "utf8")) as {
  contract_version: string;
  cases: {
    id: string;
    catalog?: { params_schema?: string | null; params_schema_spec?: unknown };
    record?: { params_schema_ref?: string };
  }[];
};

if (fixtures.contract_version !== records.contract_version) {
  fixtures.contract_version = records.contract_version;
  console.log(`contract_version updated to ${records.contract_version}`);
}

let refreshed = 0;
for (const entry of fixtures.cases) {
  const catalog = entry.catalog;
  if (catalog === undefined) continue;
  const schemaName = catalog.params_schema ?? entry.record?.params_schema_ref ?? null;
  if (schemaName === null) continue;
  const schema = params.schemas[schemaName];
  if (schema === undefined) throw new Error(`${entry.id}: the contract declares no schema "${schemaName}"`);
  if (JSON.stringify(catalog.params_schema_spec) !== JSON.stringify(schema)) refreshed += 1;
  catalog.params_schema_spec = schema;
}

writeFileSync(fixturesPath, `${JSON.stringify(fixtures, null, 2)}\n`, "utf8");
console.log(`${refreshed} embedded schema spec(s) refreshed from ${path.relative(ROOT, paramsPath)}`);
