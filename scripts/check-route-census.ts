#!/usr/bin/env bun
/**
 * The route census.
 *
 * Every route either server answers is named exactly once in the catalog: by an operation row's
 * `routes`, by a dispatch entry, by a route alias, by an acknowledged catalog gap, or by the
 * non-operation list. A route that is in none of them is a census gap: an endpoint the contract
 * says nothing about, which is the same defect as an operation the contract does not know.
 *
 * The fourth independent review found two such gaps and one method defect. The phone served both
 * `/m` and `/m/` while the non-operation list named only `/m`, so the census assertion was
 * false. The liveness probe, the diagnostics read and several other read-like branches did not
 * constrain the method at all, so a method the catalog never bound could reach the handler
 * behind them. Both are checked here rather than trusted (R4-09).
 *
 * The check reads the live source, so a route added without a catalog entry fails the build, and
 * a catalog entry for a route that no longer exists fails it too.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadOperationManifest } from "../src/contracts/identity/manifest.ts";

const ROOT = path.resolve(import.meta.dir, "..");
const APP = path.join(ROOT, "src/app.ts");
const REMOTE = path.join(ROOT, "src/remote/server.ts");

/** One answered route, as the live source states it. */
interface ServedRoute {
  readonly route: string;
  readonly file: string;
  readonly line: number;
  /** The methods the branch answers, or null when the branch does not constrain the method. */
  readonly methods: readonly string[] | null;
}

const READ_METHODS = ["GET", "HEAD", "OPTIONS"];

/** The route branches the live source answers, with the method each one claims. */
function servedRoutes(file: string): ServedRoute[] {
  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");
  const found: ServedRoute[] = [];
  for (const [index, line] of lines.entries()) {
    // A route branch is a comparison that decides what the request answers. A pathname that
    // appears in an ordinary expression is not a route: the desk's refusal message picks its
    // words from the path, and that names no route.
    if (!/\bif\s*\(/.test(line)) continue;
    const pattern = /(?:url\.)?pathname === "([^"]+)"|(?<![a-zA-Z])path === "([^"]+)"/g;
    for (const match of line.matchAll(pattern)) {
      const path = match[1] ?? match[2];
      if (path === undefined) continue;
      const method = /(?:request\.)?method === "([A-Z]+)"/.exec(line);
      const readSet = /READ_METHODS\.has\((?:request\.)?method\)/.test(line);
      const methods = method === null ? (readSet ? READ_METHODS : null) : [method[1]!];
      found.push({ route: path, file: path2(file), line: index + 1, methods });
    }
  }
  return found;
}

/** The file's name relative to the repository root, for the message. */
function path2(file: string): string {
  return file.startsWith(ROOT) ? file.slice(ROOT.length + 1) : file;
}

export interface CensusResult {
  readonly ok: boolean;
  readonly checked: number;
  readonly failures: readonly string[];
}

export function checkRouteCensus(): CensusResult {
  const manifest = loadOperationManifest();
  const failures: string[] = [];

  const operationRoutes = new Set<string>();
  for (const operation of manifest.byId.values()) {
    for (const route of operation.routes) operationRoutes.add(route);
  }
  const dispatchRoutes = new Set(manifest.dispatch.keys());
  const aliasRoutes = new Set(manifest.aliases.keys());
  const gapRoutes = new Set(manifest.manifest.catalog_gaps.map((gap) => gap.route));
  const nonOperationRoutes = new Set(manifest.manifest.non_operation_routes.map((route) => route.route));

  const served = [...servedRoutes(APP), ...servedRoutes(REMOTE)];
  const answered = new Set<string>();
  for (const entry of served) {
    // A branch that does not constrain the method answers every method, and a method the
    // catalog never bound is not allowed to reach a handler.
    if (entry.methods === null) {
      failures.push(`${entry.file}:${entry.line}: ${entry.route} does not constrain the method, so a method the catalog does not bind reaches the handler`);
      continue;
    }
    for (const method of entry.methods) {
      const route = `${method} ${entry.route}`;
      answered.add(route);
      if (operationRoutes.has(route)) continue;
      if (dispatchRoutes.has(route)) continue;
      if (aliasRoutes.has(route)) continue;
      if (gapRoutes.has(route)) continue;
      if (nonOperationRoutes.has(route)) continue;
      failures.push(`${entry.file}:${entry.line}: ${route} is answered but the catalog names no operation, dispatch entry, alias, gap or non-operation route for it`);
    }
  }

  // A non-operation route that no longer exists is a stale entry: the list must be exact in
  // both directions, or a reviewer cannot tell which routes are accounted for.
  for (const route of nonOperationRoutes) {
    if (!answered.has(route)) failures.push(`the non-operation route ${route} is listed but no branch in the live source answers it`);
  }

  // A live-bound row that claims a route the source does not answer is a row whose binding
  // cannot be confirmed: the catalog says a route performs it and the route is not there.
  for (const operation of manifest.byId.values()) {
    if (operation.binding !== "verified") continue;
    for (const route of operation.routes) {
      if (answered.has(route)) continue;
      if (dispatchRoutes.has(route)) continue;
      failures.push(`the live-bound row ${operation.id} claims ${route}, but no branch in the live source answers it`);
    }
  }

  return { ok: failures.length === 0, checked: answered.size, failures };
}

if (import.meta.main) {
  const result = checkRouteCensus();
  for (const failure of result.failures) console.log(`  FAIL ${failure}`);
  if (!result.ok) {
    console.error(`route census: ${result.failures.length} failure(s) across ${result.checked} answered routes`);
    process.exit(1);
  }
  console.log(`route census: ok — ${result.checked} answered routes are all named in the catalog`);
}
