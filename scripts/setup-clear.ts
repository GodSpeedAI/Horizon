/**
 * `bun run scripts/setup-clear.ts --setup testing [--yes]`
 * Lists every path under the testing root and every GitHub item (sandbox issues, board "Horizon testing").
 * Without `--yes` it stops there. It refuses `production`, a missing marker, and any path that resolves outside
 * the root (including through symlinks). It never deletes a repository and never needs `delete_repo`.
 */
import { lstatSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { dirname, join, relative, isAbsolute } from "node:path";
import { argValue, readMarker, setupMapping } from "../src/config/setup.ts";
import { gh } from "./setup-github.ts";

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Every entry under `root`, without following symlinks. A link is listed and later removed as a link: the remove never
 * follows it, so whatever it points at (inside or outside the root, or nothing) is left alone. The workshop makes such links.
 * Any other entry that resolves outside the real root is refused.
 */
export function planPaths(root: string): string[] {
  const realRoot = realpathSync(root);
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) {
        found.push(`${full} (link; only the link is removed)`);
        continue;
      }
      if (!inside(realRoot, realpathSync(full))) throw new Error(`${full} resolves outside ${realRoot}`);
      found.push(full);
      if (stat.isDirectory()) walk(full);
    }
  };
  walk(root);
  return found;
}

export function run(args: readonly string[], env: Record<string, string | undefined>, out: (line: string) => void, err: (line: string) => void): number {
  const name = argValue(args, "setup");
  const refuse = (message: string) => {
    err(`setup-clear: refused: ${message}`);
    return 1;
  };
  if (name === "production") return refuse("production is never cleared");
  if (name !== "testing") return refuse("--setup testing is the only setup that can be cleared");
  const mapping = setupMapping("testing", env);
  const marker = readMarker(mapping);
  if (!marker) return refuse(`${mapping.marker} is missing or unreadable`);
  let realRoot: string;
  let paths: string[];
  try {
    realRoot = realpathSync(mapping.root);
    if (realRoot !== join(realpathSync(dirname(mapping.root)), "testing")) {
      return refuse(`${mapping.root} resolves to ${realRoot}, outside the setups folder`);
    }
    if (realpathSync(marker.root) !== realRoot) return refuse(`SETUP.json names root ${marker.root}, not ${mapping.root}`);
    paths = planPaths(mapping.root);
  } catch (error) {
    return refuse(error instanceof Error ? error.message : String(error));
  }

  const github = mapping.github!;
  const owner = github.repo.split("/")[0]!;
  const issuesList = gh(["issue", "list", "-R", github.repo, "--state", "all", "--json", "id,number,title", "--limit", "1000"], env);
  const projectsList = gh(["project", "list", "--owner", owner, "--format", "json"], env);
  const issues = issuesList.code === 0 ? (JSON.parse(issuesList.stdout) as { id: string; number: number; title: string }[]) : [];
  const projects = projectsList.code === 0 ? ((JSON.parse(projectsList.stdout) as { projects?: { id: string; number: number; title: string }[] }).projects ?? []) : [];
  const boards = projects.filter((p) => p.title === github.board);

  out(`Folder (${paths.length} entries under ${mapping.root}, deleted with the folder):`);
  for (const p of paths) out(`  ${p}`);
  out(`  ${mapping.root}`);
  out(`Issues in ${github.repo}: ${issues.length}${issuesList.code === 0 ? "" : " (could not list)"}`);
  for (const i of issues) out(`  #${i.number} ${i.title}`);
  out(`Board "${github.board}": ${boards.length}${projectsList.code === 0 ? "" : " (could not list)"}`);
  for (const b of boards) out(`  #${b.number} ${b.title}`);
  out(`The repository ${github.repo} itself is never deleted.`);
  out(`Workshop database "${mapping.workshopDatabase}" (pg0, outside the folder): dropped too, if it exists.`);

  if (!args.includes("--yes")) {
    out("Nothing deleted. Re-run with --yes to delete the items above.");
    return 0;
  }

  let failed = 0;
  for (const i of issues) {
    const r = gh(["api", "graphql", "-f", `query=mutation { deleteIssue(input: {issueId: "${i.id}"}) { clientMutationId } }`], env);
    if (r.code !== 0) { failed++; err(`setup-clear: could not delete issue #${i.number}: ${r.stderr.trim()}`); }
  }
  for (const b of boards) {
    const r = gh(["api", "graphql", "-f", `query=mutation { deleteProjectV2(input: {projectId: "${b.id}"}) { clientMutationId } }`], env);
    if (r.code !== 0) { failed++; err(`setup-clear: could not delete board #${b.number}: ${r.stderr.trim()}`); }
  }
  rmSync(mapping.root, { recursive: true, force: false });
  out(`Deleted ${mapping.root}${failed ? ` (${failed} GitHub item(s) failed)` : ""}`);
  // The workshop keeps its database outside the folder, under its own name for this setup.
  const pg0 = env.PG0_BIN?.trim() || Bun.which("pg0", { PATH: env.PATH ?? process.env.PATH ?? "" });
  if (!pg0) {
    out(`The workshop database "${mapping.workshopDatabase}" was not checked: pg0 is not on PATH. Remove it with: pg0 drop --name ${mapping.workshopDatabase} --force`);
  } else {
    const listed = Bun.spawnSync([pg0, "list"], { stdout: "pipe", stderr: "pipe" });
    const present = listed.stdout.toString().split("\n").some((line) => line.trim().split(/\s+/)[0] === mapping.workshopDatabase);
    if (!present) out(`The workshop database "${mapping.workshopDatabase}" does not exist; nothing to drop.`);
    else {
      const dropped = Bun.spawnSync([pg0, "drop", "--name", mapping.workshopDatabase, "--force"], { stdout: "pipe", stderr: "pipe" });
      if (dropped.exitCode === 0) out(`Dropped the workshop database "${mapping.workshopDatabase}".`);
      else {
        failed++;
        err(`setup-clear: could not drop the workshop database "${mapping.workshopDatabase}". Stop the workshop and run: pg0 drop --name ${mapping.workshopDatabase} --force`);
      }
    }
  }
  return failed ? 1 : 0;
}

if (import.meta.main) process.exit(run(process.argv.slice(2), process.env, console.log, console.error));
