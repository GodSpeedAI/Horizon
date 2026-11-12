/**
 * The publication status of an external interface, read from the frozen contract at the repository
 * root. Governed mode consumes SEA-Forge's authority decision; while the owner has not published it,
 * the application refuses that mode at startup rather than read facts nothing authenticates.
 */
import { readFileSync } from "node:fs";

export const AUTHORITY_DECISION_INTERFACE = "sea_forge.authority_decision";

const CONTRACT = new URL("../../../contracts/identity/v1/external-interfaces.json", import.meta.url);

export function interfacePublicationStatus(interfaceId: string): string | null {
  const document = JSON.parse(readFileSync(CONTRACT, "utf8")) as { interfaces: { interface_id: string; publication_status: string }[] };
  return document.interfaces.find((entry) => entry.interface_id === interfaceId)?.publication_status ?? null;
}
