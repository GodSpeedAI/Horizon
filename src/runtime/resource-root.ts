/**
 * Where Horizon's read-only resource tree lives: `contracts/`, `domain/`, `config/` and `dist/desk/`.
 *
 * From a checkout it is the repository root, found from this file's own location. A compiled
 * binary has no such location (its modules live in a virtual file system), so the desktop and
 * headless packagings name the tree with `HORIZON_RESOURCE_ROOT`. The files are only ever read.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function resourceRoot(): string {
  const named = process.env.HORIZON_RESOURCE_ROOT?.trim();
  if (named) return named;
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

/** An absolute path inside the resource tree, e.g. `resourcePath("contracts", "identity", "v1", "records.json")`. */
export function resourcePath(...parts: readonly string[]): string {
  return join(resourceRoot(), ...parts);
}
