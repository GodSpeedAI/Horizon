#!/usr/bin/env bun
/**
 * The design's external-interface table, generated from the frozen external-interface contract.
 *
 * The design names the interfaces Horizon consumes from other projects. Restating that list by
 * hand let the design and the contract drift: the design claimed a versioned external entitlement
 * interface that no contract file carried, and the second independent review found exactly that.
 *
 * So the table is generated from `contracts/identity/v1/external-interfaces.json` and the design's
 * copy is compared against this output by `scripts/check-design-contract-consistency.ts`. The
 * rendering is mechanical: it says which interfaces exist, at which version, owned by whom, pinned
 * where, and which facts they must carry. The prose around the table says what they mean.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

export interface ExternalInterfaceFact {
  readonly fact: string;
  readonly meaning: string;
  readonly binds: string | null;
}
export interface ExternalInterface {
  readonly interface_id: string;
  readonly interface_version: string;
  readonly owner: string;
  readonly repository: string;
  readonly pinned_commit: string | null;
  readonly publication_status: string;
  readonly horizon_mints: boolean;
  readonly horizon_binding: string;
  readonly required_facts: readonly ExternalInterfaceFact[];
}
export interface ExternalInterfacesContract {
  readonly contract_id: string;
  readonly contract_version: string;
  readonly interfaces: readonly ExternalInterface[];
}

export function loadExternalInterfaces(root: string = ROOT): ExternalInterfacesContract {
  const parsed = JSON.parse(
    readFileSync(path.join(root, "contracts/identity/v1/external-interfaces.json"), "utf8"),
  ) as ExternalInterfacesContract;
  if (parsed.contract_id !== "horizon.identity.external_interfaces") {
    throw new Error(`external interfaces: unexpected contract id ${parsed.contract_id}`);
  }
  return parsed;
}

/** The pin, as the design writes it: the commit's short hash, or the word for no pin. */
function renderPin(entry: ExternalInterface): string {
  if (entry.pinned_commit === null || entry.pinned_commit === undefined) return "no pin";
  return `\`${entry.pinned_commit.slice(0, 8)}\``;
}

/** The facts the interface must carry, as the design writes them. */
function renderFacts(entry: ExternalInterface): string {
  return entry.required_facts.map((fact) => `\`${fact.fact}\``).join(", ");
}

/** The table the design carries, generated from the contract. */
export function renderExternalInterfaceTable(root: string = ROOT): string {
  const contract = loadExternalInterfaces(root);
  const lines: string[] = [];
  lines.push("| Interface | Version | Owner | Pin | Publication | Horizon binding | Facts the interface must carry |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const entry of contract.interfaces) {
    lines.push(
      [
        `\`${entry.interface_id}\``,
        `\`${entry.interface_version}\``,
        entry.owner,
        renderPin(entry),
        entry.publication_status,
        `\`${entry.horizon_binding}\``,
        renderFacts(entry),
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"),
    );
  }
  return lines.join("\n");
}

if (import.meta.main) {
  console.log(renderExternalInterfaceTable());
}
