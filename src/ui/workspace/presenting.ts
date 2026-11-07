/**
 * Presenting (design D4): real project and repository names are swapped for stable stand-ins.
 *
 * One implementation serves the view-model and `export.ts`; no page substitutes names on its own.
 * Stand-in = "Project " + the first 4 base32 (RFC 4648, upper-case) characters of HMAC-SHA256(key, name).
 * Two names that land on the same stand-in in one view both extend by one more character.
 */
import { createHmac } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

const digest = (key: string | Uint8Array, name: string): string => base32(createHmac("sha256", key).update(name).digest());

/** The stand-in for one name, 4 characters of the HMAC unless `length` asks for more. */
export function standIn(key: string | Uint8Array, name: string, length = 4): string {
  return `Project ${digest(key, name).slice(0, length)}`;
}

/** Stand-ins for a set of names; colliding ones extend one character at a time until they differ. */
export function standInMap(key: string | Uint8Array, names: readonly string[]): Map<string, string> {
  const unique = [...new Set(names.filter((name) => name.length > 0))];
  const lengths = new Map(unique.map((name) => [name, 4]));
  for (let guard = 0; guard < 52; guard += 1) {
    const groups = new Map<string, string[]>();
    for (const name of unique) {
      const label = standIn(key, name, lengths.get(name)!);
      groups.set(label, [...(groups.get(label) ?? []), name]);
    }
    const clashing = [...groups.values()].filter((group) => group.length > 1);
    if (clashing.length === 0) break;
    for (const group of clashing) for (const name of group) lengths.set(name, lengths.get(name)! + 1);
  }
  return new Map(unique.map((name) => [name, standIn(key, name, lengths.get(name)!)]));
}

const escapeRe = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replaces every real name (longest first, case-insensitive) in a string. */
export function standInText(text: string, map: ReadonlyMap<string, string>): string {
  const names = [...map.keys()].sort((a, b) => b.length - a.length);
  if (names.length === 0) return text;
  const lookup = new Map([...map].map(([name, label]) => [name.toLowerCase(), label]));
  // A name is a whole word: "app" inside "mapping" is not the project "app".
  return text.replace(new RegExp(`(?<![A-Za-z0-9])(?:${names.map(escapeRe).join("|")})(?![A-Za-z0-9])`, "gi"), (hit) => lookup.get(hit.toLowerCase()) ?? hit);
}

/** Applies stand-ins to every string (keys and values) of a JSON-like view. Returns a new value; the input is untouched. */
export function applyStandIns<T>(view: T, key: string | Uint8Array, names: readonly string[]): T {
  const map = standInMap(key, names);
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return standInText(value, map);
    if (Array.isArray(value)) return value.map(walk);
    if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [standInText(k, map), walk(v)]));
    return value;
  };
  return walk(view) as T;
}

/** True when `text` holds `name` as a whole word, case-insensitively (the test `presenting-scan` and the replacement share). */
export function mentions(text: string, name: string): boolean {
  return new RegExp(`(?<![A-Za-z0-9])${escapeRe(name)}(?![A-Za-z0-9])`, "i").test(text);
}

/** The names to hide: each repository's folder name and full path. */
export function namesOfRepos(repos: readonly { readonly repo_id?: string; readonly path: string | null }[]): string[] {
  const names: string[] = [];
  for (const repo of repos) {
    if (repo.path) {
      names.push(repo.path);
      const base = repo.path.split("/").filter(Boolean).pop();
      if (base && base.length >= 3) names.push(base);
    }
  }
  return names;
}
