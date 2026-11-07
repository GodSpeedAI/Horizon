/**
 * `bun run scripts/setup-check-empty.ts --setup production [--exclude personal]`
 * Counts what production must not hold yet and exits 0 only if every count is zero: SEA-Forge cases,
 * `horizon-cases`, `horizon-notes`, `horizon-labels`, record repositories in the Horizon and workshop record dirs, and
 * GitHub production items. The personal record is skipped only when excluded by name.
 */
import { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { listCases } from "../src/adapters/sea-forge-case.ts";
import { argValue, setupMapping } from "../src/config/setup.ts";
import { gh } from "./setup-github.ts";
import { recordSourcesOf, repoList } from "./setup-health.ts";

type Env = Record<string, string | undefined>;
const COLLECTIONS = ["horizon-cases", "horizon-notes", "horizon-labels"] as const;

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
      counts.push([`record repositories in ${source.name}${result.ok ? "" : ` (unreadable: ${result.error})`}`, result.ok ? result.repos.length : 1]);
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
