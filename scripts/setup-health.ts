/**
 * `bun run scripts/setup-health.ts --setup <name> [--only records]`
 * Health checks of the technical annex §D. Later stages add entries to CHECKS; with no `--only` every check that
 * exists for the current stage runs in order and the first failure stops the run (exit 1).
 */
import { readFileSync } from "node:fs";
import { configFromDocument } from "../src/config/load.ts";
import { SETUP_NAMES, argValue, setupMapping, type SetupMapping, type SetupName } from "../src/config/setup.ts";
import type { RecordSource } from "../src/config/types.ts";

type Env = Record<string, string | undefined>;
export interface CheckResult {
  readonly ok: boolean;
  readonly detail: string;
}
export type Check = (mapping: SetupMapping, env: Env) => CheckResult | Promise<CheckResult>;

/** `realitytrace repo list --json` for one record source; its own paths when it has them, the default location otherwise. */
export function repoList(source: RecordSource, env: Env): { readonly ok: boolean; readonly repos: readonly unknown[]; readonly error?: string } {
  const bin = env.REALITYTRACE_BIN?.trim() || "realitytrace";
  const childEnv: Env = { ...env };
  if (source.data_home) childEnv.XDG_DATA_HOME = source.data_home;
  if (source.state_home) childEnv.XDG_STATE_HOME = source.state_home;
  try {
    const result = Bun.spawnSync([bin, "repo", "list", "--json"], { env: childEnv as Record<string, string>, stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) return { ok: false, repos: [], error: result.stderr.toString().trim() || `exit ${result.exitCode}` };
    const doc = JSON.parse(result.stdout.toString()) as { repos?: unknown[] };
    return { ok: true, repos: doc.repos ?? [] };
  } catch (error) {
    return { ok: false, repos: [], error: error instanceof Error ? error.message : String(error) };
  }
}

/** The record sources named by the setup's `horizon.toml`. */
export function recordSourcesOf(mapping: SetupMapping): readonly RecordSource[] {
  return configFromDocument(Bun.TOML.parse(readFileSync(mapping.config, "utf8"))).records?.sources ?? [];
}

const recordsCheck: Check = (mapping, env) => {
  let sources: readonly RecordSource[];
  try {
    sources = recordSourcesOf(mapping);
  } catch (error) {
    return { ok: false, detail: `cannot read ${mapping.config}: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (sources.length === 0) return { ok: false, detail: `${mapping.config} has no [[records.sources]]` };
  const failed: string[] = [];
  for (const source of sources) {
    const result = repoList(source, env);
    if (!result.ok) failed.push(`${source.name}: ${result.error}`);
  }
  return failed.length === 0
    ? { ok: true, detail: `every record source answers repo list (${sources.map((s) => s.name).join(", ")})` }
    : { ok: false, detail: failed.join("; ") };
};

/** Stage 0 has one check; later stages append (workbench, horizon, seaforge, tap, connector). */
export const CHECKS: Record<string, Check> = { records: recordsCheck };

export async function run(args: readonly string[], env: Env, out: (line: string) => void, err: (line: string) => void): Promise<number> {
  const name = argValue(args, "setup");
  if (!name || !(SETUP_NAMES as readonly string[]).includes(name)) {
    err(`setup-health: --setup must be ${SETUP_NAMES.join(" | ")}`);
    return 2;
  }
  const only = argValue(args, "only");
  if (only !== undefined && !(only in CHECKS)) {
    err(`setup-health: --only must be one of ${Object.keys(CHECKS).join(", ")}`);
    return 2;
  }
  const mapping = setupMapping(name as SetupName, env);
  for (const [id, check] of Object.entries(CHECKS)) {
    if (only !== undefined && only !== id) continue;
    const result = await check(mapping, env);
    out(`${result.ok ? "ok  " : "FAIL"} ${id}: ${result.detail}`);
    if (!result.ok) return 1;
  }
  return 0;
}

if (import.meta.main) process.exit(await run(process.argv.slice(2), process.env, console.log, console.error));
