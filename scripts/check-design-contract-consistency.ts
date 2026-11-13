#!/usr/bin/env bun
/**
 * The design/contract consistency check.
 *
 * The design is the normative document; the contracts under `contracts/identity/v1/` are its
 * checked expression. A design that names a different catalog, a different parameter schema, a
 * different record, or a different evidence vocabulary than the contracts is not a description of
 * the contracts: it is a second, competing specification, and a reader who trusts it is misled.
 *
 * The round-2 independent review found exactly that. The design's parameter table and the frozen
 * schemas disagreed field for field, the design's P2/P3 table spelled the evidence requirements in
 * prose the catalog never used, and the design's A3 receipt row described a claim the record does
 * not carry. Each of those is now checked here rather than trusted.
 *
 * Five things are compared:
 *
 * 1. The design's parameter table against the frozen parameter contract, field for field. The
 *    table is generated from the contract by `scripts/gen-design-parameter-table.ts`, so this is a
 *    byte comparison between the design and its own source.
 * 2. The design's section 11 catalog against the operation manifest: every row, in its class, and
 *    every live-bound P0/P1 row's own parameter schema.
 * 3. The design's Appendix A record table against the record contract: every kind and every field.
 * 4. The design's Appendix A P2/P3 policy table against the catalog rows and against the A3
 *    mechanism's evidence vocabulary.
 * 5. The identity YAML against YAML 1.1's boolean words. A bare `on` is a string in YAML 1.2 and
 *    a boolean in YAML 1.1, so the two implementations of the same contract would read different
 *    values from the same bytes.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadOperationManifest } from "../src/contracts/identity/manifest.ts";
import { ENTITLEMENT_INTERFACE_ID } from "../src/contracts/identity/records.ts";
import { renderParameterTable } from "./gen-design-parameter-table.ts";
import { loadExternalInterfaces, renderExternalInterfaceTable } from "./gen-design-external-interface-table.ts";
import { renderLiveEnforcementTables } from "./gen-design-live-enforcement-table.ts";

const ROOT = path.resolve(import.meta.dir, "..");
const DESIGN = path.join(ROOT, "design_draft.md");

const IDENTITY_YAML = [
  "contracts/identity/v1/a3-mechanism.yaml",
  "contracts/identity/v1/issuer-profile.yaml",
  "contracts/identity/v1/operations.yaml",
  "contracts/identity/v1/params.yaml",
  "contracts/identity/v1/platform-claims.yaml",
  "contracts/identity/v1/policy.yaml",
] as const;

export interface ConsistencyResult {
  readonly ok: boolean;
  readonly checked: number;
  readonly failures: readonly string[];
}

/** The rows of a markdown table, split into their cells. */
function tableRows(section: string): string[][] {
  const rows: string[][] = [];
  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (/^\|[\s:|-]+\|$/.test(trimmed)) continue;
    rows.push(trimmed.slice(1, trimmed.endsWith("|") ? -1 : undefined).split("|").map((cell) => cell.trim()));
  }
  return rows;
}

/** The backticked names in one cell. */
function names(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1]!);
}

/**
 * The field names in a record's cell.
 *
 * The cell writes a field's name in backticks and, in parentheses, the values a field may take
 * or the fields of a nested object. Only the names outside the parentheses are the record's own
 * fields, and an array is written with a trailing `[]` that is not part of the name.
 */
function fieldNames(cell: string): string[] {
  const masked = cell.replace(/\([^)]*\)/g, (span) => " ".repeat(span.length));
  return [...masked.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1]!.replace(/\[\]$/, ""))
    .filter((name) => /^[a-z][a-z0-9_]*$/.test(name));
}

/** The section of the design between two headings. */
function section(text: string, from: string, to: string): string {
  const start = text.indexOf(from);
  if (start === -1) throw new Error(`the design has no section "${from}"`);
  const end = text.indexOf(to, start);
  if (end === -1) throw new Error(`the design has no section "${to}" after "${from}"`);
  return text.slice(start, end);
}

/** The parameter table the design carries, between its markers. */
function designParameterTable(text: string): string | null {
  return designGeneratedBlock(text, "parameter-table");
}

/** A generated block the design carries, between its markers. */
function designGeneratedBlock(text: string, name: string): string | null {
  const begin = `<!-- BEGIN GENERATED: ${name} -->`;
  const end = `<!-- END GENERATED: ${name} -->`;
  const start = text.indexOf(begin);
  const stop = text.indexOf(end);
  if (start === -1 || stop === -1) return null;
  return text.slice(start + begin.length, stop).trim();
}

/** The keys whose values the document parses as booleans. */
function booleanKeys(document: unknown): Set<string> {
  const keys = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node === null || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === "boolean") keys.add(key);
      walk(value);
    }
  };
  walk(document);
  return keys;
}

/**
 * YAML 1.1's boolean words. YAML 1.2 — which Bun's parser implements — treats them as strings.
 * The identity contracts are read by both a TypeScript and a Python implementation, so a word in
 * this set may never stand where a string is meant.
 */
const YAML11_BOOLEANS = new Set([
  "yes", "Yes", "YES", "no", "No", "NO",
  "true", "True", "TRUE", "false", "False", "FALSE",
  "on", "On", "ON", "off", "Off", "OFF",
]);

/** A line with its quoted spans blanked, so a scan cannot trip over a string's contents. */
function maskQuoted(line: string): string {
  return line.replace(/"[^"]*"/g, (span) => " ".repeat(span.length)).replace(/'[^']*'/g, (span) => " ".repeat(span.length));
}

/**
 * The places where the raw YAML spells a YAML 1.1 boolean word where a string is meant.
 *
 * A word may be a value only under a key whose value really is a boolean — the check derives that
 * set from the document itself, so it stays correct as the contracts change. A word used as a key
 * is always wrong: a key that parses as `true` names no key at all.
 */
function booleanTraps(source: string, allowedKeys: ReadonlySet<string>): string[] {
  const traps: string[] = [];
  const lines = source.split("\n");
  let blockIndent: number | null = null;
  lines.forEach((raw, index) => {
    const line = raw.replace(/\t/g, "  ");
    const trimmed = line.trim();
    if (blockIndent !== null) {
      const indent = line.length - line.trimStart().length;
      if (trimmed === "" || indent > blockIndent) return;
      blockIndent = null;
    }
    if (trimmed === "" || trimmed.startsWith("#")) return;
    // A block scalar's header opens prose that is not a mapping; its content is skipped.
    if (/:\s*[|>][-+]?\d*\s*(#.*)?$/.test(line)) {
      blockIndent = line.length - line.trimStart().length;
      return;
    }
    const masked = maskQuoted(line);
    // A boolean word used as a key.
    for (const match of masked.matchAll(/(?:^|[{,\s])([A-Za-z]+)\s*:/g)) {
      const word = match[1]!;
      if (!YAML11_BOOLEANS.has(word)) continue;
      traps.push(`line ${index + 1}: the key "${word}" is a YAML 1.1 boolean`);
    }
    // A boolean word used as a value.
    for (const match of masked.matchAll(/([A-Za-z_][A-Za-z0-9_.-]*)\s*:\s*([^,}\n#]+)/g)) {
      const key = match[1]!;
      const value = match[2]!.trim();
      if (!YAML11_BOOLEANS.has(value)) continue;
      if (allowedKeys.has(key)) continue;
      traps.push(`line ${index + 1}: "${key}: ${value}" is a YAML 1.1 boolean where a string is meant`);
    }
  });
  return traps;
}

export function checkDesignContractConsistency(root: string = ROOT): ConsistencyResult {
  const failures: string[] = [];
  let checked = 0;
  const design = readFileSync(path.join(root, "design_draft.md"), "utf8");
  const manifest = loadOperationManifest(path.join(root, "contracts/identity/v1/operations.yaml"));

  // --- 1. The parameter table. -----------------------------------------------------------
  checked += 1;
  const designTable = designParameterTable(design);
  if (designTable === null) {
    failures.push("design: the generated parameter table markers are missing");
  } else {
    const generated = renderParameterTable(root);
    if (designTable !== generated) {
      const designRows = designTable.split("\n");
      const generatedRows = generated.split("\n");
      const differences: string[] = [];
      for (let index = 0; index < Math.max(designRows.length, generatedRows.length); index += 1) {
        if (designRows[index] === generatedRows[index]) continue;
        differences.push(`row ${index + 1}: the design says ${designRows[index] ?? "(nothing)"}, the contract says ${generatedRows[index] ?? "(nothing)"}`);
        if (differences.length === 4) break;
      }
      failures.push(`design: the parameter table does not match the frozen schemas — ${differences.join("; ")}`);
    }
  }

  // --- 2. The catalog in section 11. -----------------------------------------------------
  checked += 1;
  const catalogSection = section(design, "### 11. V1 operation catalog", "### 12. Migration and vertical slice");
  const catalogRows = tableRows(catalogSection).filter((row) => row.length === 4);
  const designClasses = new Map<string, string[]>();
  for (const row of catalogRows) {
    const label = row[0]!;
    if (!/^(P0|P1|P2 human-reserved|P2 redelegation|P3|Dispatch)$/.test(label)) continue;
    // A phrase like `external_commitment=true` is prose about a rule, not an operation ID.
    const ids = names(row[1]!).filter((id) => id !== ".sea" && !id.includes("="));
    designClasses.set(label, [...(designClasses.get(label) ?? []), ...ids]);
  }
  const classGroups: readonly (readonly [string, readonly string[]])[] = [
    ["P0", ["P0"]],
    ["P1", ["P1"]],
    ["P2 human-reserved", ["P2"]],
    ["P3", ["P3"]],
    ["Dispatch", ["PX"]],
  ];
  for (const [label, groups] of classGroups) {
    const expected = groups.flatMap((group) =>
      (manifest.manifest.operations[group] ?? []).map((operation) => operation.id),
    );
    const actual = designClasses.get(label) ?? [];
    const missing = expected.filter((id) => !actual.includes(id));
    const extra = actual.filter((id) => !expected.includes(id));
    if (missing.length > 0) failures.push(`design section 11: the ${label} row omits ${missing.join(", ")}`);
    if (extra.length > 0) failures.push(`design section 11: the ${label} row names ${extra.join(", ")}, which the catalog does not have`);
  }
  // The redelegation row is an emphasis on a row the P2 list already carries, so it must name a
  // P2 row rather than a row of its own.
  for (const id of designClasses.get("P2 redelegation") ?? []) {
    if ((manifest.manifest.operations.P2 ?? []).some((operation) => operation.id === id)) continue;
    failures.push(`design section 11: the P2 redelegation row names ${id}, which is not a P2 row`);
  }
  // A live-bound P0/P1 row names the schema that describes the fields its handler reads. The
  // class default describes a body a capability takes, not the body this route parses.
  const classDefaults: Record<string, string | null | undefined> = {
    P0: manifest.manifest.class_defaults.P0?.params_schema,
    P1: manifest.manifest.class_defaults.P1?.params_schema,
  };
  for (const operation of manifest.byId.values()) {
    if (operation.binding !== "verified") continue;
    if (operation.class !== "P0" && operation.class !== "P1") continue;
    if (operation.paramsSchema === classDefaults[operation.class]) {
      failures.push(`${operation.id}: a live-bound ${operation.class} row still uses the class default parameter schema`);
    }
  }

  // --- 3. The record table in Appendix A. -------------------------------------------------
  checked += 1;
  const records = JSON.parse(
    readFileSync(path.join(root, "contracts/identity/v1/records.json"), "utf8"),
  ) as { records: Record<string, { fields: readonly { name: string }[] }> };
  const recordSection = section(design, "## Appendix A", "#### P2/P3 policy rows");
  const recordRows = tableRows(recordSection).filter((row) => row.length === 3 && /^\s*`[A-Za-z0-9]+`\s*$/.test(row[0]!));
  const designRecords = new Map<string, string[]>();
  for (const row of recordRows) {
    const kind = names(row[0]!)[0];
    if (kind === undefined) continue;
    designRecords.set(kind, fieldNames(row[1]!));
  }
  for (const [kind, spec] of Object.entries(records.records)) {
    const expected = spec.fields.map((field) => field.name).filter((name) => name !== "signature");
    const actual = designRecords.get(kind);
    if (actual === undefined) {
      failures.push(`design Appendix A: the record table has no row for ${kind}`);
      continue;
    }
    const missing = expected.filter((name) => !actual.includes(name));
    const extra = actual.filter((name) => !expected.includes(name));
    if (missing.length > 0) failures.push(`design Appendix A: the ${kind} row omits ${missing.join(", ")}`);
    if (extra.length > 0) failures.push(`design Appendix A: the ${kind} row names ${extra.join(", ")}, which the record does not carry`);
  }
  for (const kind of designRecords.keys()) {
    if (records.records[kind] === undefined) failures.push(`design Appendix A: the record table names ${kind}, which the contract does not declare`);
  }

  // --- 4. The P2/P3 policy table. ---------------------------------------------------------
  checked += 1;
  const mechanism = Bun.YAML.parse(
    readFileSync(path.join(root, "contracts/identity/v1/a3-mechanism.yaml"), "utf8"),
  ) as { assurance_requirements: readonly { id: string }[] };
  const requirementIds = new Set(mechanism.assurance_requirements.map((requirement) => requirement.id));
  const policySection = section(design, "#### P2/P3 policy rows", "P0/P1 operations use the common local rules");
  const policyRows = tableRows(policySection).filter((row) => row.length === 5);
  for (const row of policyRows) {
    const ids = names(row[0]!);
    if (ids.length === 0) continue;
    const executor = names(row[1]!)[0] ?? null;
    const writer = names(row[2]!)[0] ?? null;
    const evidence = names(row[3]!)[0] ?? null;
    if (evidence !== null && !requirementIds.has(evidence)) {
      failures.push(`design Appendix A: ${ids.join(", ")} names the evidence "${evidence}", which the A3 mechanism does not declare`);
    }
    for (const id of ids) {
      const operation = manifest.byId.get(id);
      if (operation === undefined) {
        failures.push(`design Appendix A: ${id} has no catalog row`);
        continue;
      }
      const inherited = row[1]!.startsWith("inherited");
      if (!inherited && operation.executor !== executor) {
        failures.push(`design Appendix A: ${id} names the executor "${executor}", and the catalog names "${operation.executor}"`);
      }
      if (!inherited && row[2]!.startsWith("inherited") === false && operation.authorityWriter !== writer) {
        failures.push(`design Appendix A: ${id} names the authority writer "${writer}", and the catalog names "${operation.authorityWriter}"`);
      }
      const catalogEvidence = operation.humanEvidence;
      if (catalogEvidence !== null && catalogEvidence !== evidence) {
        failures.push(`design Appendix A: ${id} names the evidence "${evidence}", and the catalog names "${catalogEvidence}"`);
      }
      if (catalogEvidence === null && !inherited && evidence !== "PER_TARGET_ROW" && evidence !== "NONE") {
        failures.push(`design Appendix A: ${id} names the evidence "${evidence}", and the catalog names none`);
      }
    }
  }

  // --- 5. The YAML 1.1 boolean words. ------------------------------------------------------
  checked += IDENTITY_YAML.length;
  for (const file of IDENTITY_YAML) {
    const source = readFileSync(path.join(root, file), "utf8");
    const document = Bun.YAML.parse(source);
    const allowed = booleanKeys(document);
    for (const trap of booleanTraps(source, allowed)) {
      failures.push(`${file}: ${trap}`);
    }
  }

  // --- 6. The external interfaces. --------------------------------------------------------
  // The second independent review found the design claiming a versioned external entitlement
  // interface that no contract file carried. The interface contract now carries it, and these
  // comparisons keep the three places that must agree — the design, the record contract, and the
  // code that enforces it — from drifting apart again.
  checked += 1;
  const designInterfaceTable = designGeneratedBlock(design, "external-interface-table");
  if (designInterfaceTable === null) {
    failures.push("design: the generated external-interface table markers are missing");
  } else {
    const generated = renderExternalInterfaceTable(root);
    if (designInterfaceTable !== generated) {
      const designRows = designInterfaceTable.split("\n");
      const generatedRows = generated.split("\n");
      const differences: string[] = [];
      for (let index = 0; index < Math.max(designRows.length, generatedRows.length); index += 1) {
        if (designRows[index] === generatedRows[index]) continue;
        differences.push(`row ${index + 1}: the design says ${designRows[index] ?? "(nothing)"}, the contract says ${generatedRows[index] ?? "(nothing)"}`);
        if (differences.length === 4) break;
      }
      failures.push(`design: the external-interface table does not match the frozen contract — ${differences.join("; ")}`);
    }
  }
  // --- 7. The live-enforcement tables. -----------------------------------------------------
  // The design restates what the running code enforces today. A restatement drifts, so it is
  // generated from the manifest's own live-enforcement block and compared byte for byte.
  checked += 1;
  const designLiveTable = designGeneratedBlock(design, "live-enforcement-tables");
  if (designLiveTable === null) {
    failures.push("design: the generated live-enforcement table markers are missing");
  } else {
    const generated = renderLiveEnforcementTables(root);
    if (designLiveTable !== generated) {
      const designRows = designLiveTable.split("\n");
      const generatedRows = generated.split("\n");
      const differences: string[] = [];
      for (let index = 0; index < Math.max(designRows.length, generatedRows.length); index += 1) {
        if (designRows[index] === generatedRows[index]) continue;
        differences.push(`row ${index + 1}: the design says ${designRows[index] ?? "(nothing)"}, the manifest says ${generatedRows[index] ?? "(nothing)"}`);
        if (differences.length === 4) break;
      }
      failures.push(`design: the live-enforcement table does not match the manifest — ${differences.join("; ")}`);
    }
  }

  checked += 1;
  const external = loadExternalInterfaces(root);  const entitlement = external.interfaces.find((entry) => entry.interface_id === ENTITLEMENT_INTERFACE_ID);
  if (entitlement === undefined) {
    failures.push(`external interfaces: the contract does not declare ${ENTITLEMENT_INTERFACE_ID}, which the validators enforce`);
  }
  for (const entry of external.interfaces) {
    if (entry.horizon_mints) failures.push(`${entry.interface_id}: an external interface may not be one Horizon mints`);
    if (entry.publication_status === "published" && entry.pinned_commit === null) {
      failures.push(`${entry.interface_id}: a published interface must name the commit it was read at`);
    }
    if (entry.publication_status !== "published" && entry.pinned_commit !== null) {
      failures.push(`${entry.interface_id}: an unpublished interface pins no commit`);
    }
    if (entry.required_facts.length === 0) failures.push(`${entry.interface_id}: an interface must declare the facts it must carry`);
  }
  checked += 1;
  const recordsContract = JSON.parse(
    readFileSync(path.join(root, "contracts/identity/v1/records.json"), "utf8"),
  ) as { constraints: Record<string, { rule: string }> };
  const entitlementRule = recordsContract.constraints.entitlement_is_external?.rule ?? "";
  if (!entitlementRule.includes(ENTITLEMENT_INTERFACE_ID)) {
    failures.push(`records: the entitlement rule does not name the ${ENTITLEMENT_INTERFACE_ID} interface the validators enforce`);
  }
  if (entitlement !== undefined && !entitlementRule.includes("entitlement")) {
    failures.push("records: the entitlement rule does not describe what an entitlement binds");
  }

  return { ok: failures.length === 0, checked, failures };
}

if (import.meta.main) {
  const result = checkDesignContractConsistency();
  for (const failure of result.failures) console.log(`  FAIL ${failure}`);
  if (!result.ok) {
    console.error(`design/contract consistency: ${result.failures.length} failure(s) across ${result.checked} comparisons`);
    process.exit(1);
  }
  console.log(`design/contract consistency: ok — ${result.checked} comparisons agree`);
}
