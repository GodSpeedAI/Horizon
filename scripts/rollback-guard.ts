/**
 * Rollback guard (SPEC-CR-002 "Rollback"): run before starting a 1.0.1 build against a store.
 *
 *   bun run scripts/rollback-guard.ts <store.sqlite>
 *
 * Exit 0: the store holds no v2 state, so 1.0.1 may open it.
 * Exit 2: v2 state exists (marker, records or pending run inputs). Roll back by restoring the
 *         pre-upgrade backup, then revert; intents committed under 1.1.0 are lost from Horizon's
 *         store by that restore, while their SEA-Forge and RealityTrace records remain as history.
 * Exit 1: usage or read error.
 */
import { existsSync } from "node:fs";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { rollbackVerdict } from "../src/capabilities/contract-upgrade.ts";

const path = process.argv[2];
if (!path || !existsSync(path)) {
  console.error("usage: bun run scripts/rollback-guard.ts <existing store.sqlite>");
  process.exit(1);
}
const verdict = await rollbackVerdict(openSqliteStore({ path }));
if (verdict.allowed) {
  console.log(`rollback-guard: ${path} holds no contract_version 2 state; 1.0.1 may open it`);
  process.exit(0);
}
console.error(`rollback-guard: refusing to start 1.0.1 against ${path}:`);
for (const reason of verdict.reasons) console.error(`  - ${reason}`);
console.error("restore the pre-upgrade backup, then revert (SPEC-CR-002 Rollback)");
process.exit(2);
