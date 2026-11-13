#!/usr/bin/env bun
/**
 * Regenerate the design's class rows and its generated tables from the frozen contracts.
 *
 * The design is the normative document; the contracts are its checked expression. When the
 * catalog changes — a read is promoted to a live binding, a projection route is given its own
 * row — the design's class rows and its generated tables must follow, or the design is a
 * second, competing specification.
 *
 * The class rows are written from the operation manifest itself, so the row can never name an
 * operation the catalog does not have, and can never omit one it does.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadOperationManifest } from "../src/contracts/identity/manifest.ts";
import { renderParameterTable } from "./gen-design-parameter-table.ts";
import { renderExternalInterfaceTable } from "./gen-design-external-interface-table.ts";
import { renderLiveEnforcementTables } from "./gen-design-live-enforcement-table.ts";

const ROOT = path.resolve(import.meta.dir, "..");
const designPath = path.join(ROOT, "design_draft.md");
const manifest = loadOperationManifest();

let text = readFileSync(designPath, "utf8");

/** The operation ids of one class group, in the catalog's order. */
const ids = (group: string): string =>
  (manifest.manifest.operations[group] ?? []).map((operation) => operation.id).map((id) => `\`${id}\``).join(", ");

const ROWS: readonly (readonly [string, string])[] = [
  ["| P0 |", "P0"],
  ["| P1 |", "P1"],
  ["| P2 human-reserved |", "P2"],
  ["| P3 |", "P3"],
];

for (const [prefix, group] of ROWS) {
  const lines = text.split("\n");
  const index = lines.findIndex((line) => line.startsWith(prefix) && line.includes("`"));
  if (index === -1) throw new Error(`design: the ${group} row is missing`);
  const cells = lines[index]!.trim().slice(1, -1).split("|").map((cell) => cell.trim());
  if (cells.length < 4) throw new Error(`design: the ${group} row has ${cells.length} cells, not four`);
  lines[index] = `| ${cells[0]} | ${ids(group)} | ${cells[2]} | ${cells[3]} |`;
  text = lines.join("\n");
}

for (const [marker, body] of [
  ["parameter-table", renderParameterTable(ROOT)],
  ["external-interface-table", renderExternalInterfaceTable(ROOT)],
  ["live-enforcement-tables", renderLiveEnforcementTables(ROOT)],
] as const) {
  const begin = `<!-- BEGIN GENERATED: ${marker} -->`;
  const end = `<!-- END GENERATED: ${marker} -->`;
  const at = text.indexOf(begin);
  const stop = text.indexOf(end);
  if (at === -1 || stop === -1) throw new Error(`design: the ${marker} markers are missing`);
  text = `${text.slice(0, at + begin.length)}\n${body}\n${text.slice(stop)}`;
}

writeFileSync(designPath, text);
console.log(`design: class rows and three generated tables regenerated from the contracts`);
