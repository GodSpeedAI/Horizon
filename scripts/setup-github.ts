/**
 * `bun run scripts/setup-github.ts --setup testing`
 * Verifies the `project` scope and the sandbox repository, creates the board "Horizon testing" if absent,
 * ensures two issues exist, tests sub-issue linking and writes `<root>/github.json`.
 * Only ever talks to the sandbox repository named in the setup mapping.
 */
import { existsSync, writeFileSync } from "node:fs";
import { argValue, setupMapping } from "../src/config/setup.ts";

export interface GhResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs `gh` found on PATH (tests put a fake first). Never logs its arguments' secrets: none are passed. */
export function gh(args: readonly string[], env: Record<string, string | undefined> = process.env): GhResult {
  const result = Bun.spawnSync(["gh", ...args], { env: env as Record<string, string>, stdout: "pipe", stderr: "pipe" });
  return { code: result.exitCode ?? 1, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

export const PARENT_TITLE = "Horizon testing: parent task";
export const CHILD_TITLE = "Horizon testing: child task";

export function run(args: readonly string[], env: Record<string, string | undefined>, out: (line: string) => void, err: (line: string) => void): number {
  if (argValue(args, "setup") !== "testing") {
    err("setup-github: only --setup testing is supported");
    return 2;
  }
  const mapping = setupMapping("testing", env);
  const github = mapping.github!;
  const owner = github.repo.split("/")[0]!;
  const fail = (message: string) => {
    err(`setup-github: ${message}`);
    return 1;
  };

  if (!existsSync(mapping.marker)) return fail(`${mapping.marker} is missing; run setup-init.ts --setup testing first`);

  const auth = gh(["auth", "status"], env);
  if (!`${auth.stdout}${auth.stderr}`.includes("'project'")) return fail("the gh token lacks the 'project' scope (OP2: gh auth refresh -s project)");
  out("project scope: present");

  const view = gh(["repo", "view", github.repo, "--json", "name"], env);
  if (view.code !== 0) return fail(`${github.repo} is not reachable (OP1)`);
  out(`repository: ${github.repo}`);

  const projects = gh(["project", "list", "--owner", owner, "--format", "json"], env);
  if (projects.code !== 0) return fail(`cannot list projects: ${projects.stderr.trim()}`);
  const known = (JSON.parse(projects.stdout) as { projects?: { number: number; title: string }[] }).projects ?? [];
  let board = known.find((p) => p.title === github.board);
  if (!board) {
    const created = gh(["project", "create", "--owner", owner, "--title", github.board, "--format", "json"], env);
    if (created.code !== 0) return fail(`cannot create the board: ${created.stderr.trim()}`);
    board = JSON.parse(created.stdout) as { number: number; title: string };
  }
  out(`board: ${github.board} (#${board.number})`);

  const existing = gh(["issue", "list", "-R", github.repo, "--state", "all", "--json", "number,title", "--limit", "200"], env);
  if (existing.code !== 0) return fail(`cannot list issues: ${existing.stderr.trim()}`);
  const issues = JSON.parse(existing.stdout) as { number: number; title: string }[];
  const ensure = (title: string): number | undefined => {
    const found = issues.find((i) => i.title === title);
    if (found) return found.number;
    const made = gh(["issue", "create", "-R", github.repo, "--title", title, "--body", "Created by setup-github for the Horizon testing setup."], env);
    const match = /\/issues\/(\d+)/.exec(made.stdout);
    return made.code === 0 && match ? Number(match[1]) : undefined;
  };
  const parent = ensure(PARENT_TITLE);
  const child = ensure(CHILD_TITLE);
  if (parent === undefined || child === undefined) return fail("cannot create the test issues");

  const childId = gh(["api", `repos/${github.repo}/issues/${child}`, "--jq", ".id"], env);
  let subIssues = false;
  if (childId.code === 0 && /^\d+$/.test(childId.stdout.trim())) {
    const link = gh(["api", "-X", "POST", `repos/${github.repo}/issues/${parent}/sub_issues`, "-F", `sub_issue_id=${childId.stdout.trim()}`], env);
    // Already linked is also proof that linking works.
    subIssues = link.code === 0 || /already/i.test(`${link.stdout}${link.stderr}`);
  }
  out(`sub-issues: ${subIssues}`);

  writeFileSync(`${mapping.root}/github.json`, `${JSON.stringify({ repo: github.repo, projectNumber: board.number, subIssues }, null, 2)}\n`);
  out(`wrote ${mapping.root}/github.json`);
  return 0;
}

if (import.meta.main) process.exit(run(process.argv.slice(2), process.env, console.log, console.error));
