/**
 * `horizon-verify-intent`: the vetted verifier for "the navigation intent record exists" (HORIZON-001 1.1.0,
 * REQ-NAV-011). Compiled to one self-contained binary (`bun run scripts/build-verifier.ts`) so its sha256 pins
 * everything it executes; the operation binding names that digest.
 *
 *   horizon-verify-intent --store <horizon store.sqlite> --tenant <tenant> --intent <intent_id>
 *
 * Exit 0: the store records the committed NavigationIntentRecord for exactly this intent (the effect
 * identity). Exit 1: it does not. Exit 2: the check could not be made (undefined, never a pass).
 *
 * Read-only by construction: the database is opened read-only, nothing else is touched, and RealityTrace runs
 * it under a launcher that gives it a read-only view and no network.
 */
import { Database } from "bun:sqlite";

const INDEX_COLLECTION = "horizon.navigation-intent-index";

function arg(name: string): string {
  const at = process.argv.indexOf(name);
  const value = at >= 0 ? process.argv[at + 1] : undefined;
  if (!value) {
    console.error(`horizon-verify-intent: missing ${name}`);
    process.exit(2);
  }
  return value;
}

const store = arg("--store");
const tenant = arg("--tenant");
const intentId = arg("--intent");

try {
  const db = new Database(store, { readonly: true });
  const row = db.query("SELECT value FROM records WHERE collection = ? AND id = ?").get(INDEX_COLLECTION, `${tenant}/${intentId}`) as { value: string } | null;
  db.close();
  if (row === null) {
    console.log(`intent ${intentId} is not recorded`);
    process.exit(1);
  }
  const value = JSON.parse(row.value) as { intent_id?: unknown };
  if (value.intent_id !== intentId) {
    console.log(`the index entry for ${intentId} names ${String(value.intent_id)}`);
    process.exit(1);
  }
  console.log(`intent ${intentId} is recorded`);
  process.exit(0);
} catch (error) {
  console.error(`horizon-verify-intent: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
