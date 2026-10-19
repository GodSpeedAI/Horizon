import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { loadSemanticWorld, type SemanticProjection } from "@godspeedai/cognate-domainforge";

export class SemanticAdapterError extends Error {
  override readonly name = "SemanticAdapterError";
}

export interface LoadedWorld {
  readonly worldRef: string;
  readonly cognateWorldRef: string;
  readonly projection: SemanticProjection;
  readonly objectCount: number;
  readonly relationCount: number;
  readonly unmapped: readonly { readonly kind: string; readonly reason: string }[];
}

function fail(message: string): never {
  throw new SemanticAdapterError(`SEMANTIC: ${message}`);
}

function readSources(root: string, dir = root, sources: Record<string, string> = {}): Record<string, string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "validation" || entry.name === "__pycache__") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      readSources(root, path, sources);
    } else if (entry.isFile() && entry.name.endsWith(".sea")) {
      sources[relative(root, path).split("\\").join("/")] = readFileSync(path, "utf8");
    }
  }
  return sources;
}

export function loadWorld(pinnedWorldRef: string, root = "domain", worldName = "horizon"): LoadedWorld {
  const absolute = resolve(root);
  let sources: Record<string, string>;
  try {
    sources = readSources(absolute);
  } catch (error) {
    fail(`cannot read semantic world at ${root}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (Object.keys(sources).length === 0) fail(`no .sea sources found under ${root}`);

  const result = loadSemanticWorld({
    entry: "interaction-model.sea",
    sources,
    worldName,
  });
  if (!result.ok) fail(`DomainForge rejected the world: ${JSON.stringify(result.error)}`);

  const closure = result.identity.semantic_closure_hash;
  const canonical = `${result.worldRef.slice(0, result.worldRef.lastIndexOf("@"))}@${closure}`;
  if (canonical !== pinnedWorldRef) {
    fail(`world identity mismatch: expected ${pinnedWorldRef}, observed ${canonical}`);
  }

  return {
    worldRef: canonical,
    cognateWorldRef: result.worldRef,
    projection: result.projection,
    objectCount: result.projection.objects.length,
    relationCount: result.projection.relations.length,
    unmapped: result.projection.unmapped,
  };
}

export function assertSemanticOutput(value: unknown): {
  readonly world_ref: string;
  readonly cognate_world_ref: string;
  readonly object_count: number;
  readonly relation_count: number;
} {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("capability returned a non-object");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.world_ref !== "string" || typeof record.cognate_world_ref !== "string") {
    fail("capability output is missing world identities");
  }
  if (typeof record.object_count !== "number" || typeof record.relation_count !== "number") {
    fail("capability output is missing projection counts");
  }
  return {
    world_ref: record.world_ref,
    cognate_world_ref: record.cognate_world_ref,
    object_count: record.object_count,
    relation_count: record.relation_count,
  };
}
