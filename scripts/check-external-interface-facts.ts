#!/usr/bin/env bun
/**
 * Do the external interfaces name artifacts the owner actually publishes?
 *
 * A contract that says an external interface is "published" is making a claim about another
 * project's source. The round-4 independent review found that claim false: `AuthorityDecision`
 * carries no `resource_scope`, no `amount`, no `issuer_key_id` and no `signature`, and
 * `ActionGrant` is move-only and "intentionally not serializable". The contract demanded facts the
 * pinned artifact did not have, and no check noticed, because nothing read the owner's source.
 *
 * This check reads it. For every interface the contract calls published, it reads the pinned
 * owner's files **at the pinned commit** — not at the checkout's HEAD, so a sibling that has
 * moved does not silently change what the contract means — and requires every declared fact to be
 * a field the owner's source actually has.
 *
 * An unpublished interface has nothing to read, so it is checked the other way: it names no
 * commit and no artifact path, because an interface whose owner has published nothing has no
 * artifact to point at.
 *
 * The owner's checkout is located in this order: `HORIZON_SEA_FORGE_ROOT`, `~/projects/sea-rs`,
 * then `../sea-rs`. Nothing in this repository is modified, pulled, reset or switched; the pinned
 * commit is read out of the local object store, and a missing commit is reported as a missing
 * dependency rather than worked around.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export interface ExternalInterfaceFactResult {
  readonly ok: boolean;
  readonly interfaces: number;
  readonly facts: number;
  readonly failures: readonly string[];
}

interface ExternalInterface {
  readonly interface_id: string;
  readonly publication_status: string;
  readonly pinned_commit: string | null;
  readonly artifact_path: string | null;
  readonly artifact_paths?: readonly string[];
  readonly required_facts: readonly {
    readonly fact: string;
    readonly binds?: string | null;
    readonly component?: string | null;
    readonly conditional?: string;
  }[];
  readonly components?: Readonly<Record<string, { readonly file: string; readonly struct: string | null }>>;
  readonly subject_binding?: unknown;
}

/** The body of `pub struct NAME { ... }` in a Rust source text, or null when the struct is absent. */
export function structBody(text: string, name: string): string | null {
  const head = new RegExp(`\\bpub\\s+struct\\s+${name}\\b[^{;]*\\{`).exec(text);
  if (head === null) return null;
  let depth = 1;
  for (let index = head.index + head[0].length; index < text.length; index += 1) {
    const char = text[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(head.index + head[0].length, index);
    }
  }
  return null;
}

/** The owner checkout: the environment first, then the plan's documented sibling path. */
export function resolveOwnerCheckout(root: string): string | null {
  const candidates = [
    process.env.HORIZON_SEA_FORGE_ROOT,
    path.join(homedir(), "projects", "sea-rs"),
    path.join(root, "..", "sea-rs"),
  ];
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== "" && existsSync(path.join(candidate, ".git"))) {
      return candidate;
    }
  }
  return null;
}

/** Read one file out of the owner's source at a pinned commit, without touching the working tree. */
function readAtCommit(checkout: string, commit: string, file: string): { readonly text: string } | { readonly error: string } {
  try {
    const text = execFileSync("git", ["-C", checkout, "show", `${commit}:${file}`], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    return { text };
  } catch (error) {
    const detail = error instanceof Error ? error.message.split("\n")[0] ?? "" : String(error);
    return { error: detail };
  }
}

/**
 * Does the owner's source carry this fact?
 *
 * A fact is a field, so it appears either as a quoted key (`"entry_hash"`, which is how the
 * envelope's JSON is written) or as a Rust field (`pub entry_hash: String`). A bare mention in a
 * comment is not enough, and neither is a word that happens to occur in prose.
 */
function sourceCarriesFact(text: string, fact: string): boolean {
  const escaped = fact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`"${escaped}"|\\bpub\\s+${escaped}\\s*:`).test(text);
}

export function checkExternalInterfaceFacts(
  root: string = process.cwd(),
  options: { readonly sourceRoot?: string; readonly quiet?: boolean } = {},
): ExternalInterfaceFactResult {
  const failures: string[] = [];
  const ok = (message: string): void => {
    if (options.quiet !== true) console.log(`  ok   ${message}`);
  };
  const fail = (message: string): void => {
    failures.push(message);
    console.log(`  FAIL ${message}`);
  };
  const document = JSON.parse(
    readFileSync(path.join(root, "contracts/identity/v1/external-interfaces.json"), "utf8"),
  ) as {
    readonly interfaces: readonly ExternalInterface[];
    readonly bind_targets?: { readonly envelope_checks?: Readonly<Record<string, string>> };
  };
  const checkout = options.sourceRoot ?? resolveOwnerCheckout(root);
  let facts = 0;

  for (const entry of document.interfaces) {
    const id = entry.interface_id;
    if (entry.publication_status !== "published") {
      // An unpublished interface has no artifact to point at, so it may name neither a commit nor
      // a path. A path here would claim an artifact nobody published.
      if (entry.pinned_commit !== null) fail(`${id}: an unpublished interface pins no commit`);
      if (entry.artifact_path !== null) fail(`${id}: an unpublished interface names no artifact path`);
      if ((entry.artifact_paths ?? []).length > 0) fail(`${id}: an unpublished interface names no artifact files`);
      if (entry.required_facts.length === 0) fail(`${id}: an interface must declare the facts it must carry`);
      ok(`${id}: unpublished — it names no artifact, so there is nothing to read`);
      continue;
    }
    if (entry.pinned_commit === null) fail(`${id}: a published interface must name the commit it was read at`);
    if (entry.artifact_path === null) fail(`${id}: a published interface must name the artifact it was read at`);
    const files = [...new Set([entry.artifact_path, ...(entry.artifact_paths ?? [])].filter((file): file is string => file !== null))];
    if (files.length === 0) {
      fail(`${id}: a published interface names no file to read`);
      continue;
    }
    if (checkout === null) {
      fail(
        `${id}: the owner's checkout is not available, so a published interface cannot be verified against its pinned source. Set HORIZON_SEA_FORGE_ROOT, or clone the owner at ${entry.pinned_commit}.`,
      );
      continue;
    }
    if (entry.pinned_commit === null) continue;
    const texts: string[] = [];
    let readFailure = false;
    for (const file of files) {
      const read = readAtCommit(checkout, entry.pinned_commit, file);
      if ("error" in read) {
        fail(`${id}: cannot read ${file} at ${entry.pinned_commit.slice(0, 12)} in the owner's checkout: ${read.error}`);
        readFailure = true;
        break;
      }
      texts.push(read.text);
    }
    if (readFailure) continue;
    const byFile = new Map<string, string>(files.map((file, index) => [file, texts[index] ?? ""]));
    const components = entry.components ?? {};
    const missing: string[] = [];
    for (const entryFact of entry.required_facts) {
      facts += 1;
      const name = entryFact.fact;
      const component = entryFact.component ?? null;
      if (component === null || components[component] === undefined) {
        fail(`${id}: fact "${name}" names no source component, so there is no owner struct it is checked against`);
        continue;
      }
      const source = components[component];
      const text = byFile.get(source.file);
      if (text === undefined) {
        fail(`${id}: component "${component}" reads ${source.file}, which the interface does not list as an artifact file`);
        continue;
      }
      const scope = source.struct === null ? text : structBody(text, source.struct);
      if (scope === null) {
        fail(`${id}: component "${component}" names struct ${source.struct}, which ${source.file} does not declare at ${entry.pinned_commit.slice(0, 12)}`);
        continue;
      }
      if (!sourceCarriesFact(scope, name)) missing.push(`${name} (${component})`);
    }
    if (missing.length > 0) {
      fail(
        `${id}: the owner's source at ${entry.pinned_commit.slice(0, 12)} does not carry ${missing.length} declared fact(s): ${missing.join(", ")}. The contract would be checking a field the artifact does not have.`,
      );
      continue;
    }
    ok(`${id}: ${entry.required_facts.length} facts verified in their named owner components at ${entry.pinned_commit.slice(0, 12)}`);
  }

  // Every fact names what it binds to: a Horizon record field, or a closed envelope check.
  const records = JSON.parse(readFileSync(path.join(root, "contracts/identity/v1/records.json"), "utf8")) as {
    readonly records: Readonly<Record<string, { readonly fields: readonly ({ readonly name: string } | string)[] }>>;
  };
  const envelopeChecks = new Set(Object.keys(document.bind_targets?.envelope_checks ?? {}));
  for (const entry of document.interfaces) {
    for (const entryFact of entry.required_facts) {
      const bind = entryFact.binds ?? null;
      if (bind === null) {
        fail(`${entry.interface_id}: fact "${entryFact.fact}" binds to nothing`);
        continue;
      }
      if (bind.startsWith("envelope:")) {
        if (!envelopeChecks.has(bind)) fail(`${entry.interface_id}: fact "${entryFact.fact}" binds to "${bind}", which is not a declared envelope check`);
        continue;
      }
      const match = /^(Horizon[A-Za-z]+)\.([a-z_]+)$/.exec(bind);
      if (match === null) {
        fail(`${entry.interface_id}: fact "${entryFact.fact}" binds to "${bind}", which is neither a Horizon record field nor an envelope check`);
        continue;
      }
      const [, kind, field] = match as unknown as [string, string, string];
      const record = records.records[kind];
      const names = (record?.fields ?? []).map((f) => (typeof f === "string" ? f : f.name));
      if (!names.includes(field)) fail(`${entry.interface_id}: fact "${entryFact.fact}" binds to ${kind}.${field}, which records.json does not declare`);
    }
    for (const entryFact of entry.required_facts) {
      if (entryFact.conditional !== undefined && !entryFact.conditional.startsWith("only when")) {
        fail(`${entry.interface_id}: fact "${entryFact.fact}" has a condition that does not say when it applies`);
      }
    }
  }

  if (failures.length === 0) {
    console.log(`check-external-interface-facts: ok — ${document.interfaces.length} interfaces, ${facts} facts verified against the owner's pinned source`);
  }
  return { ok: failures.length === 0, interfaces: document.interfaces.length, facts, failures };
}

if (import.meta.main) {
  const result = checkExternalInterfaceFacts();
  process.exit(result.ok ? 0 : 1);
}
