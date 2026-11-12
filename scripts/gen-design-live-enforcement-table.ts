#!/usr/bin/env bun
/**
 * The design's live-enforcement tables, generated from the frozen operation manifest.
 *
 * The manifest says, for every live-bound row, the caller path it runs on, whether the runtime
 * enforces it at this freeze, what enforces it, what is still missing, and the stage that must
 * close the gap. The design restates the same statement in prose, and a restatement drifts: the
 * third independent review found routes in the running code that the catalog did not carry at all.
 * The tables are therefore generated from the manifest and compared byte for byte by
 * `scripts/check-design-contract-consistency.ts` (R3-01).
 *
 * The missing-fact ids are the manifest's own vocabulary. The legend below the table says what
 * each one means, so the table stays readable, and the generator refuses an id the legend does
 * not explain rather than printing an unexplained token.
 */
import path from "node:path";
import { loadOperationManifest } from "../src/contracts/identity/manifest.ts";
const ROOT = path.resolve(import.meta.dir, "..");

/** What each missing-fact id means, in words. */
export const MISSING_LEGEND: Readonly<Record<string, string>> = {
  durable_principal_binding: "the durable human principal binding",
  evidence_A3_UV: "A3-UV evidence",
  authority_cognate_local_continuation: "the Cognate local continuation authority",
  authority_sea_forge: "the SEA-Forge authority",
  authority_sea_forge_confirmation: "the SEA-Forge authority's confirmation",
  separation_of_duty: "separation of duty",
  separation_of_duty_check: "the separation-of-duty check",
  execution_proof: "the execution proof",
  live_bounded_grant: "the live bounded grant",
  pending_record: "the operation-bound pending record",
  target_resolution: "the target resolution",
  resolved_row_evidence: "the resolved row's evidence",
  device_delegation_from_operator: "a device-attributed delegation from the operator (none exists at this freeze)",
  resolved_row_authority: "the resolved row's authority",
  enrollment_presence_receipt: "the enrollment presence receipt",
};

interface EnforcementVariant {
  readonly code_op: string;
  readonly caller_path: string;
  readonly required_stage?: string;
  readonly production_stage?: string;
}
interface EnforcementRow {
  readonly id: string;
  readonly caller_path?: string;
  readonly enforced_today: boolean;
  readonly enforced_by?: string;
  readonly missing: readonly string[];
  readonly required_stage?: string;
  readonly production_stage?: string;
  readonly variants?: readonly EnforcementVariant[];
}

/** One line of a table: the operation, the caller path, and what the row says about it. */
export interface EnforcementLine {
  readonly operation: string;
  readonly caller_path: string;
  readonly enforced_today: boolean;
  readonly enforced_by: string;
  readonly missing: readonly string[];
  readonly required_stage: string | null;
  readonly production_stage: string | null;
}

/** The rows of the manifest's live-enforcement block, one line per caller path. */
export function enforcementLines(root: string = ROOT): EnforcementLine[] {
  const manifest = loadOperationManifest(path.join(root, "contracts/identity/v1/operations.yaml"));
  const lines: EnforcementLine[] = [];
  for (const row of manifest.manifest.live_enforcement.rows as readonly EnforcementRow[]) {
    if (row.variants !== undefined && row.variants.length > 0) {
      for (const variant of row.variants) {
        lines.push({
          operation: `${row.id} (${variant.code_op})`,
          caller_path: variant.caller_path,
          enforced_today: row.enforced_today,
          enforced_by: row.enforced_by ?? "",
          missing: row.missing,
          required_stage: variant.required_stage ?? row.required_stage ?? null,
          production_stage: variant.production_stage ?? row.production_stage ?? null,
        });
      }
      continue;
    }
    lines.push({
      operation: row.id,
      caller_path: row.caller_path ?? "",
      enforced_today: row.enforced_today,
      enforced_by: row.enforced_by ?? "",
      missing: row.missing,
      required_stage: row.required_stage ?? null,
      production_stage: row.production_stage ?? null,
    });
  }
  return lines;
}

/** The stage that closes a gap: the stage that must close it, and the stage that closes it for good. */
function closedBy(line: EnforcementLine): string {
  if (line.required_stage === null) return line.production_stage ?? "";
  if (line.production_stage === null || line.production_stage === line.required_stage) return line.required_stage;
  return `${line.required_stage} — ${line.production_stage} for the production path`;
}

/** The whole block: the enforced table, the unenforced table, and the legend. */
export function renderLiveEnforcementTables(root: string = ROOT): string {
  const lines = enforcementLines(root);
  const rows: string[] = [];
  rows.push("| Operation | Caller path | Enforced by |");
  rows.push("|---|---|---|");
  for (const line of lines.filter((entry) => entry.enforced_today)) {
    rows.push(`| \`${line.operation}\` | \`${line.caller_path}\` | ${line.enforced_by} |`);
  }
  rows.push("");
  rows.push("| Operation | Caller path | Missing | Closed by |");
  rows.push("|---|---|---|---|");
  for (const line of lines.filter((entry) => !entry.enforced_today)) {
    rows.push(`| \`${line.operation}\` | \`${line.caller_path}\` | ${line.missing.join(", ")} | ${closedBy(line)} |`);
  }
  const used = new Set(lines.flatMap((line) => line.missing));
  for (const id of used) {
    if (MISSING_LEGEND[id] === undefined) throw new Error(`live enforcement: the missing-fact id "${id}" has no legend entry`);
  }
  rows.push("");
  rows.push("The missing-fact ids mean:");
  rows.push("");
  for (const id of [...used].sort()) {
    rows.push(`- \`${id}\` — ${MISSING_LEGEND[id]}`);
  }
  return rows.join("\n");
}

if (import.meta.main) {
  console.log(renderLiveEnforcementTables());
}
