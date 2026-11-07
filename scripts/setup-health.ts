/**
 * `bun run scripts/setup-health.ts --setup <name> [--only records]`
 * Health checks of the technical annex §D. Later stages add entries to CHECKS; with no `--only` every check that
 * exists for the current stage runs in order and the first failure stops the run (exit 1).
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { seaForgeCall } from "../src/adapters/sea-forge-wire.ts";
import { keyState } from "../src/adapters/workshop.ts";
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

async function healthOf(url: string): Promise<{ ok: boolean; body: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return { ok: res.ok, body: await res.text() };
  } catch (error) {
    return { ok: false, body: error instanceof Error ? error.message : String(error) };
  }
}

/** Stage 1: the workshop answers `/health`, and the Horizon key exists with its expiry in the future (a warning inside 7 days). */
const workbenchCheck: Check = async (mapping) => {
  const health = await healthOf(`http://127.0.0.1:${mapping.workshopPort}/health`);
  if (!health.ok) return { ok: false, detail: `workshop GET /health on port ${mapping.workshopPort} failed: ${health.body.slice(0, 120)}` };
  const key = keyState({ url: "", key_path: mapping.workbenchKey });
  if (key.state === "missing" || key.state === "empty" || key.state === "unsafe") {
    const why = key.state === "missing" ? `is missing (operator step OP3: Settings > Connect Horizon)` : key.state === "empty" ? "is empty" : "can be read by other users; its mode must be 0600";
    return { ok: false, detail: `workshop is up; ${mapping.workbenchKey} ${why}` };
  }
  if (key.state === "expired") return { ok: false, detail: `workshop key expired on ${key.expiresAt}` };
  const when = key.expiresAt === null ? "expiry unknown" : `expires ${key.expiresAt}`;
  return { ok: true, detail: `workshop /health ok; key present, ${when}${key.state === "expiring" ? " (expires within 7 days: issue a new one)" : ""}` };
};

/** Stage 1: Horizon answers `/health` with status ok. */
const horizonCheck: Check = async (mapping) => {
  const health = await healthOf(`http://127.0.0.1:${mapping.horizonPort}/health`);
  if (!health.ok) return { ok: false, detail: `Horizon GET /health on port ${mapping.horizonPort} failed: ${health.body.slice(0, 120)}` };
  return /"status"\s*:\s*"ok"/.test(health.body) ? { ok: true, detail: `Horizon /health ok on port ${mapping.horizonPort}` } : { ok: false, detail: "Horizon /health did not say status ok" };
};

/** Stage 1: the session copier ran in the last 24 hours. Only the file's modification time is read, never its content. */
const tapCheck: Check = (_mapping, env) => {
  const path = join(env.HOME?.trim() || homedir(), ".agents", "state", "rt", "drain-state.json");
  if (!existsSync(path)) return { ok: false, detail: `${path} does not exist` };
  const ageHours = (Date.now() - statSync(path).mtimeMs) / 3_600_000;
  return ageHours <= 24 ? { ok: true, detail: `drain state modified ${ageHours.toFixed(1)} h ago` } : { ok: false, detail: `drain state is ${ageHours.toFixed(1)} h old (limit 24 h)` };
};

/** Stage 3: the case keeper's socket answers `case_list` with a list of cases. */
const seaforgeCheck: Check = async (mapping, env) => {
  const actor = { actor_id: env.COGNATE_SEA_FORGE_ACTOR?.trim() || "cognate-service", role: "service" };
  try {
    const reply = await seaForgeCall(mapping.socket, { verb: "case_list", actor }, 4000);
    if (!Array.isArray(reply.cases)) return { ok: false, detail: `case keeper at ${mapping.socket} answered case_list without a cases list` };
    return { ok: true, detail: `case keeper answers case_list (${reply.cases.length} ${reply.cases.length === 1 ? "case" : "cases"})` };
  } catch (error) {
    return { ok: false, detail: `case keeper at ${mapping.socket} did not answer case_list: ${(error instanceof Error ? error.message : String(error)).slice(0, 120)}` };
  }
};

/** Stage 4: the GitHub connector wrote its heartbeat file in the last 30 s. Only the file's modification time is read. */
const connectorCheck: Check = (mapping) => {
  const path = join(mapping.run, "connector.heartbeat");
  if (!existsSync(path)) return { ok: false, detail: `${path} does not exist (is the connector running?)` };
  const ageS = (Date.now() - statSync(path).mtimeMs) / 1000;
  return ageS <= 30 ? { ok: true, detail: `connector heartbeat ${ageS.toFixed(0)} s ago` } : { ok: false, detail: `connector heartbeat is ${ageS.toFixed(0)} s old (limit 30 s); it is stopped or stuck` };
};

/** Stage 0 had records; stage 1 adds workbench, horizon and tap (seaforge in stage 3, connector in stage 4). */
export const CHECKS: Record<string, Check> = { records: recordsCheck, workbench: workbenchCheck, horizon: horizonCheck, tap: tapCheck, seaforge: seaforgeCheck, connector: connectorCheck };

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
