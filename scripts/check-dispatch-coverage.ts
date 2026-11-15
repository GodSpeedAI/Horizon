#!/usr/bin/env bun
/**
 * The dispatch table's coverage check.
 *
 * A route that performs several effects is a dispatcher: the caller names an action, the server
 * resolves the qualifier, and the catalog says which operation the pair performs. Two things can
 * go wrong, and both are the same kind of wrong — the catalog's claim about a route and the
 * dispatch table's behaviour disagree:
 *
 * 1. A row claims a route the dispatch table never resolves to. The catalog says the route
 *    performs that operation; the route never performs it. This is how a P3 approval ends up
 *    travelling a P2 row: the P3 row claims `POST /desk/decide`, the dispatch table resolves the
 *    escalation pair to the lesson row, and the lesson row claims the same route. The catalog
 *    looked complete and the route was quietly downgraded.
 * 2. A dispatch entry resolves to a row that does not claim the route. The route performs an
 *    operation the catalog does not say it performs, which is the same defect seen from the other
 *    side.
 * 3. Two combinations resolve the same (resolved kind, action) pair to different operations. The
 *    pair is ambiguous, and which one runs depends on the order the table is read in.
 *
 * The check reads the frozen catalog and compares its two halves. It does not judge which effect
 * a pair should perform — that is the catalog's own decision, and the design's prose — but it
 * refuses a catalog whose dispatch table and route claims cannot both be true.
 */
import path from "node:path";
import { loadOperationManifest } from "../src/contracts/identity/manifest.ts";

const ROOT = path.resolve(import.meta.dir, "..");

export interface DispatchCoverageResult {
  readonly ok: boolean;
  readonly checked: number;
  readonly failures: readonly string[];
}

export function checkDispatchCoverage(root: string = ROOT): DispatchCoverageResult {
  const failures: string[] = [];
  const manifest = loadOperationManifest(path.join(root, "contracts/identity/v1/operations.yaml"));
  let checked = 0;

  for (const [route, entry] of manifest.dispatch) {
    /** The operations this route's dispatch table can reach. */
    const reachable = new Set<string>();
    /** The (resolved kind, action) pairs, so an ambiguous pair is caught. */
    const pairs = new Map<string, string>();

    const note = (operationId: string, detail: string): void => {
      failures.push(`${route}: ${operationId} ${detail}`);
    };

    for (const [action, operationId] of Object.entries(entry.actions)) {
      checked += 1;
      const operation = manifest.byId.get(operationId);
      if (operation === undefined) {
        note(operationId, "is not an operation the catalog declares");
        continue;
      }
      reachable.add(operationId);
      if (!operation.routes.includes(route)) {
        note(operationId, `is performed by ${route} but does not claim that route`);
      }
      const key = `action:${action}`;
      const previous = pairs.get(key);
      if (previous !== undefined && previous !== operationId) {
        failures.push(`${route}: the action ${action} resolves to both ${previous} and ${operationId}`);
      }
      pairs.set(key, operationId);
    }

    for (const combination of entry.combinations ?? []) {
      checked += 1;
      const operationId = combination.operation;
      const operation = manifest.byId.get(operationId);
      if (operation === undefined) {
        note(operationId, "is not an operation the catalog declares");
        continue;
      }
      reachable.add(operationId);
      if (!operation.routes.includes(route)) {
        note(operationId, `is performed by ${route} but does not claim that route`);
      }
      const key = `pair:${combination.resolved}:${combination.action}`;
      const previous = pairs.get(key);
      if (previous !== undefined && previous !== operationId) {
        failures.push(
          `${route}: the pair (${combination.resolved}, ${combination.action}) resolves to both ${previous} and ${operationId}`,
        );
      }
      pairs.set(key, operationId);
    }

    // Every row that claims this route must be reachable through the route's dispatch table.
    for (const operation of manifest.routes.get(route) ?? []) {
      if (operation.binding !== "verified") continue;
      if (!reachable.has(operation.id)) {
        failures.push(
          `${route}: ${operation.id} claims this route but the dispatch table never resolves to it, so the route cannot perform what the catalog says it performs`,
        );
      }
    }
  }

  return { ok: failures.length === 0, checked, failures };
}

if (import.meta.main) {
  const result = checkDispatchCoverage();
  for (const failure of result.failures) console.log(`  FAIL ${failure}`);
  if (!result.ok) {
    console.error(`dispatch coverage: ${result.failures.length} failure(s) across ${result.checked} dispatch entries`);
    process.exit(1);
  }
  console.log(`dispatch coverage: ok — ${result.checked} dispatch entries agree with the rows that claim their routes`);
}
