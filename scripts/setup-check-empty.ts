/**
 * `bun run scripts/setup-check-empty.ts --setup production [--exclude personal]`
 * Counts what production must not hold yet and exits 0 only if every count is zero: SEA-Forge cases,
 * `horizon-cases`, `horizon-notes`, `horizon-labels`, `horizon-conversation`, record repositories in the Horizon and workshop record dirs, and
 * GitHub production items. The personal record is skipped only when excluded by name.
 */
import { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { listCases } from "../src/adapters/sea-forge-case.ts";
import { argValue, setupMapping } from "../src/config/setup.ts";
import { gh } from "./setup-github.ts";
import { recordReader, type RecordReader } from "../src/adapters/realitytrace-economics.ts";
import { recordSourcesOf, repoList } from "./setup-health.ts";

type Env = Record<string, string | undefined>;
const COLLECTIONS = ["horizon-cases", "horizon-notes", "horizon-labels", "horizon-conversation"] as const;

/** The setup's own rulebook folder, which every start enrolls with the record keeper. */
export const isRulebookFolder = (path: string, setupRoot: string): boolean => path === `${setupRoot}/cell/realitytrace-repo-obligations`;
/** What a start writes there: the folder's enrollment trace and one rulebook snapshot per start. Anything else is data. */
export function onlyStartRecords(rows: readonly unknown[], folder: string): boolean {
  return rows.every((row) => {
    const r = row as { payload?: Record<string, unknown> } & Record<string, unknown>;
    const p = (r.payload ?? r) as { envelope_kind?: unknown; scope?: { filesystem_path?: unknown } };
    if (p.envelope_kind === "semantic_snapshot") return true;
    return p.envelope_kind === "execution_trace" && p.scope?.filesystem_path === folder;
  });
}
const emptyLedger = (reader: RecordReader, repoId: string, folder: string): boolean => {
  const ledger = reader.ledger(repoId);
  return ledger.ok && onlyStartRecords(ledger.rows, folder);
};

export async function run(args: readonly string[], env: Env, out: (line: string) => void, err: (line: string) => void): Promise<number> {
  if (argValue(args, "setup") !== "production") {
    err("setup-check-empty: --setup production");
    return 2;
  }
  const exclude = argValue(args, "exclude");
  if (exclude !== undefined && exclude !== "personal") {
    err("setup-check-empty: --exclude accepts only: personal");
    return 2;
  }
  const mapping = setupMapping("production", env);
  const counts: [string, number][] = [];

  // Case keeper: ask it (`case_list`). A socket that is not there holds no cases. A socket that is there but does not give a
  // usable answer cannot be proven empty, so it counts as one unanswered item: the check fails safe.
  if (existsSync(mapping.socket)) {
    const listed = await listCases({ socketPath: mapping.socket, service: { actor_id: "cognate-service", role: "service" }, timeoutMs: 3_000 });
    if (listed.kind === "ok") counts.push(["SEA-Forge cases", listed.value.cases.length + listed.value.unreadable.length]);
    else counts.push([`SEA-Forge cases (not answered: ${listed.words})`, 1]);
  } else counts.push(["SEA-Forge cases (no socket)", 0]);

  const store = `${mapping.cell}/app.sqlite`;
  for (const collection of COLLECTIONS) {
    let n = 0;
    if (existsSync(store)) {
      const db = new Database(store, { readonly: true });
      try {
        n = (db.query("SELECT COUNT(*) AS n FROM records WHERE collection = ?").get(collection) as { n: number }).n;
      } catch {
        n = 0; // no records table yet: nothing has been written
      } finally {
        db.close();
      }
    }
    counts.push([collection, n]);
  }

  if (existsSync(mapping.config)) {
    for (const source of recordSourcesOf(mapping)) {
      if (source.kind === "personal" && exclude === "personal") continue;
      const result = repoList(source, env);
      if (!result.ok) {
        counts.push([`record repositories in ${source.name} (unreadable: ${result.error})`, 1]);
        continue;
      }
      // Every start enrolls the setup's own rulebook folder. It is machinery, not data, so it is left out while it holds only what a start writes.
      const reader = recordReader(source, env.REALITYTRACE_BIN?.trim() || "realitytrace");
      const listed = reader.repos();
      // Count from the raw list, so an entry in a shape the reader does not know still counts; subtract only a rulebook folder that is positively identified.
      const startOnly = listed.ok ? listed.repos.filter((r) => r.path !== null && isRulebookFolder(r.path, mapping.root) && emptyLedger(reader, r.repo_id, r.path)).length : 0;
      const counted = Math.max(0, result.repos.length - startOnly);
      counts.push([`record repositories in ${source.name}`, counted]);
    }
  }

  const githubFile = `${mapping.root}/github.json`;
  if (existsSync(githubFile)) {
    const { repo, projectNumber } = JSON.parse(readFileSync(githubFile, "utf8")) as { repo: string; projectNumber?: number };
    const issues = gh(["issue", "list", "-R", repo, "--state", "all", "--json", "number"], env);
    counts.push([`GitHub issues in ${repo}${issues.code === 0 ? "" : " (unreadable)"}`, issues.code === 0 ? (JSON.parse(issues.stdout) as unknown[]).length : 1]);
    if (projectNumber !== undefined) {
      const items = gh(["project", "item-list", String(projectNumber), "--owner", repo.split("/")[0]!, "--format", "json"], env);
      const n = items.code === 0 ? ((JSON.parse(items.stdout) as { items?: unknown[] }).items ?? []).length : 1;
      counts.push([`GitHub board items${items.code === 0 ? "" : " (unreadable)"}`, n]);
    }
  } else {
    out("GitHub production items: not named yet (no github.json); nothing to count");
  }

  for (const [label, n] of counts) out(`${n === 0 ? "ok  " : "FAIL"} ${label}: ${n}`);
  return counts.every(([, n]) => n === 0) ? 0 : 1;
}

if (import.meta.main) process.exit(await run(process.argv.slice(2), process.env, console.log, console.error));
