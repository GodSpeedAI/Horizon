/**
 * `bun run scripts/presenting-scan.ts --dir <folder> --setup <name> [--file <path>]`
 * Exit 1 if any real repository or project name from `repo list` (every record source of the setup) appears in the files.
 * Scans every file under `--dir` except the author's own notes (`notes.md`, `cleanup.md`), which are not captured output.
 * Prints file names and counts, never the matched text beyond the name itself being the thing found.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { argValue, setupMapping, SETUP_NAMES, type SetupName } from "../src/config/setup.ts";
import { mentions, namesOfRepos } from "../src/ui/workspace/presenting.ts";
import { recordSourcesOf, repoList } from "./setup-health.ts";

type Env = Record<string, string | undefined>;
const SKIP = new Set(["notes.md", "cleanup.md"]);

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : SKIP.has(entry) ? [] : [path];
  });
}

/** The names to hide, from every record source of the setup. */
export function realNames(setup: SetupName, env: Env): string[] {
  const mapping = setupMapping(setup, env);
  const repos: { path: string | null }[] = [];
  for (const source of recordSourcesOf(mapping)) {
    const listed = repoList(source, env);
    for (const repo of listed.repos as { filesystem_path?: unknown }[]) repos.push({ path: typeof repo.filesystem_path === "string" ? repo.filesystem_path : null });
  }
  return [...new Set(namesOfRepos(repos))];
}

export function scan(files: readonly string[], names: readonly string[]): { file: string; name: string }[] {
  const hits: { file: string; name: string }[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const name of names) if (mentions(text, name)) hits.push({ file, name });
  }
  return hits;
}

export function run(args: readonly string[], env: Env, out: (line: string) => void, err: (line: string) => void, names?: readonly string[]): number {
  const setup = argValue(args, "setup");
  const dir = argValue(args, "dir");
  const file = argValue(args, "file");
  if (!setup || !(SETUP_NAMES as readonly string[]).includes(setup) || (!dir && !file)) {
    err("presenting-scan: --setup <testing|production> and --dir <folder> (or --file <path>)");
    return 2;
  }
  const files = file ? [file] : filesUnder(dir!);
  const hidden = names ?? realNames(setup as SetupName, env);
  const hits = scan(files, hidden);
  out(`scanned ${files.length} file(s) for ${hidden.length} real name(s)`);
  for (const hit of hits) err(`FOUND real name "${hit.name}" in ${hit.file}`);
  return hits.length === 0 ? 0 : 1;
}

if (import.meta.main) process.exit(run(process.argv.slice(2), process.env, console.log, console.error));
