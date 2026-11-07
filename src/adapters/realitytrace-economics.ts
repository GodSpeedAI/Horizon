/**
 * Read-only RealityTrace reader for the case-economics view (HC-06).
 *
 * Runs exactly these commands of RealityTrace's CLI, none of which writes or rebuilds anything:
 *   realitytrace repo list --json
 *   realitytrace ledger verify --repo <id> --json   (stage 1: "record intact", and the ledger's record count)
 *   realitytrace ledger export --repo <id> --json
 *   realitytrace projections export --repo <id> --canonical-json
 * (`query evidence`, `delta` and `context` rebuild projections, so they are never run here.)
 * Nothing it returns is stored; the pure model arranges it for display.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { EconomicsConfig, RecordSource } from "../config/types.ts";
import { redact } from "./redact.ts";
import { economicsModel, type EconomicsModel } from "../economics/model.ts";

export type { EconomicsReadout, EconomicsRepo, EconomicsSkipped } from "../economics/readout.ts";
import type { EconomicsReadout, EconomicsRepo, EconomicsSkipped } from "../economics/readout.ts";

export type PathExists = (path: string) => boolean;

export interface EconomicsSource {
  read(): EconomicsReadout;
}

export interface RunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: string;
}
export type Runner = (bin: string, args: readonly string[], env: Record<string, string>) => RunResult;

/** The only commands this reader may run; a test asserts nothing else is spawned. */
export const READ_ONLY_COMMANDS = [["repo", "list"], ["ledger", "export"], ["projections", "export"], ["ledger", "verify"]] as const;

/** The real runner; `timeoutMs` exists so a test can prove a hung binary is stopped without waiting a minute. */
export const makeSpawnRunner = (timeoutMs = 60_000): Runner => (bin, args, env) => {
  const result = spawnSync(bin, [...args], { env, encoding: "utf8", timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 512 * 1024 * 1024 });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "", ...(result.error ? { error: result.error.message } : {}) };
};
const spawnRunner: Runner = makeSpawnRunner();

const brief = (text: string): string => redact(text).trim().replace(/\s+/g, " ").slice(0, 240);

/** What a failure to start or finish the binary means, in words (the raw message follows for the curious). */
function explain(error: string): string {
  if (/ENOENT/.test(error)) return `the record keeper program was not found (${brief(error)})`;
  if (/EACCES/.test(error)) return `the record keeper program cannot be run (${brief(error)})`;
  if (/ETIMEDOUT/.test(error)) return `the record keeper did not answer in time and was stopped (${brief(error)})`;
  if (/ENOBUFS|maxBuffer/i.test(error)) return `the record keeper's answer was too large to read (${brief(error)})`;
  return brief(error);
}

export function realityTraceEconomics(config: EconomicsConfig | undefined, run: Runner = spawnRunner, pathExists: PathExists = existsSync): EconomicsSource {
  return {
    read(): EconomicsReadout {
      if (!config) return { state: "not_configured" };
      const env: Record<string, string> = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/" };
      if (config.data_home) env.XDG_DATA_HOME = config.data_home;
      if (config.state_home) env.XDG_STATE_HOME = config.state_home;

      const call = (args: string[]): { ok: true; json: unknown } | { ok: false; message: string } => {
        assertReadOnly(args);
        const result = run(config.realitytrace_bin, args, env);
        if (result.error) return { ok: false, message: `realitytrace ${args.slice(0, 2).join(" ")}: ${explain(result.error)}` };
        if (result.status !== 0) return { ok: false, message: `realitytrace ${args.slice(0, 2).join(" ")} failed (exit ${result.status}): ${brief(result.stderr || result.stdout)}` };
        try {
          return { ok: true, json: JSON.parse(result.stdout) };
        } catch {
          return { ok: false, message: `realitytrace ${args.slice(0, 2).join(" ")} printed no JSON` };
        }
      };

      const listed = call(["repo", "list", "--json"]);
      if (!listed.ok) return { state: "unavailable", message: listed.message };
      if (!isObject(listed.json) || !Array.isArray(listed.json.repos)) return { state: "unavailable", message: "realitytrace repo list answered in a shape Horizon does not know, so nothing is shown from it" };
      const all = listed.json.repos;
      const enrolled = all.filter(isObject).filter((repo) => typeof repo.repo_id === "string" && (repo.state === undefined || repo.state === "enrolled"));
      const present = enrolled.filter((repo) => typeof repo.filesystem_path !== "string" || pathExists(repo.filesystem_path));
      const skipped = { without_agent_activity: 0, missing_folder: enrolled.length - present.length };

      const repos: EconomicsRepo[] = [];
      for (const repo of present) {
        const repo_id = repo.repo_id as string;
        const path = typeof repo.filesystem_path === "string" ? repo.filesystem_path : null;
        const ledger = call(["ledger", "export", "--repo", repo_id, "--json"]);
        if (!ledger.ok) {
          repos.push({ repo_id, path, model: null, error: ledger.message });
          continue;
        }
        const rows = rowsOf(ledger.json);
        if (rows === null) {
          repos.push({ repo_id, path, model: null, error: "realitytrace ledger export answered in a shape Horizon does not know, so nothing is shown from it" });
          continue;
        }
        if (economicsModel(rows, []).audit.agent_events === 0) {
          skipped.without_agent_activity += 1;
          continue;
        }
        // Residuals are a bonus: a failed projection export leaves them empty and says so, it never hides the ledger.
        const projection = call(["projections", "export", "--repo", repo_id, "--canonical-json"]);
        const residualRows = projection.ok ? rowsOf(projection.json) : null;
        const model = economicsModel(rows, residualRows ?? []);
        const error = !projection.ok ? `${projection.message} (residuals unavailable)` : residualRows === null ? "unavailable: unexpected answer from the record keeper (residuals unavailable)" : null;
        repos.push({ repo_id, path, model, error });
      }
      return { state: repos.some((repo) => repo.model !== null) ? "ok" : "empty", repos, skipped };
    },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** `ledger export --json` may be a bare array or wrapped in a result object; take the array either way. */
function rowsOf(json: unknown): unknown[] | null {
  if (Array.isArray(json)) return json;
  if (isObject(json)) {
    for (const key of ["entries", "rows", "data"]) if (Array.isArray(json[key])) return json[key] as unknown[];
  }
  // Valid JSON that is not a list of records is not an empty ledger: say so.
  return null;
}

function assertReadOnly(args: readonly string[]): void {
  if (!READ_ONLY_COMMANDS.some(([a, b]) => args[0] === a && args[1] === b)) throw new Error(`ECONOMICS: refusing to run non-read-only realitytrace command '${args.slice(0, 2).join(" ")}'`);
}

// ---------------------------------------------------------------------------------------------- stage 1: per-source reads

/**
 * Reads of one `[[records.sources]]` entry for the comparison view. Same allow-list, same runner, same
 * environment rules as the economics reader; `personal` has no paths, so RealityTrace's own default location is read.
 */
export interface RecordReader {
  repos(): { readonly ok: true; readonly repos: readonly { repo_id: string; path: string | null }[] } | { readonly ok: false; readonly message: string };
  ledger(repoId: string): { readonly ok: true; readonly rows: unknown[] } | { readonly ok: false; readonly message: string };
  /** `ledger verify`: whether the hash chain holds and how many records it covers. */
  verify(repoId: string): { readonly ok: true; readonly intact: boolean; readonly records: number | null; readonly divergence: string | null } | { readonly ok: false; readonly message: string };
}

export function recordReader(source: Pick<RecordSource, "data_home" | "state_home">, bin: string, run: Runner = spawnRunner): RecordReader {
  const env: Record<string, string> = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/" };
  if (source.data_home) env.XDG_DATA_HOME = source.data_home;
  if (source.state_home) env.XDG_STATE_HOME = source.state_home;
  const call = (args: string[]): { ok: true; json: unknown } | { ok: false; message: string } => {
    assertReadOnly(args);
    const result = run(bin, args, env);
    if (result.error) return { ok: false, message: `realitytrace ${args.slice(0, 2).join(" ")}: ${explain(result.error)}` };
    if (result.status !== 0) return { ok: false, message: `realitytrace ${args.slice(0, 2).join(" ")} failed (exit ${result.status}): ${brief(result.stderr || result.stdout)}` };
    try {
      return { ok: true, json: JSON.parse(result.stdout) };
    } catch {
      return { ok: false, message: `realitytrace ${args.slice(0, 2).join(" ")} printed no JSON` };
    }
  };
  return {
    repos() {
      const listed = call(["repo", "list", "--json"]);
      if (!listed.ok) return listed;
      if (!isObject(listed.json) || !Array.isArray(listed.json.repos)) return { ok: false, message: "realitytrace repo list answered in a shape Horizon does not know" };
      const repos = listed.json.repos
        .filter(isObject)
        .filter((repo) => typeof repo.repo_id === "string" && (repo.state === undefined || repo.state === "enrolled"))
        .map((repo) => ({ repo_id: repo.repo_id as string, path: typeof repo.filesystem_path === "string" ? repo.filesystem_path : null }));
      return { ok: true, repos };
    },
    ledger(repoId) {
      const out = call(["ledger", "export", "--repo", repoId, "--json"]);
      if (!out.ok) return out;
      const rows = rowsOf(out.json);
      return rows === null ? { ok: false, message: "realitytrace ledger export answered in a shape Horizon does not know" } : { ok: true, rows };
    },
    verify(repoId) {
      const out = call(["ledger", "verify", "--repo", repoId, "--json"]);
      if (!out.ok) return out;
      const doc = isObject(out.json) ? out.json : {};
      return {
        ok: true,
        intact: doc.ok === true,
        records: typeof doc.verified_count === "number" ? doc.verified_count : null,
        divergence: doc.first_divergence === null || doc.first_divergence === undefined ? null : brief(JSON.stringify(doc.first_divergence)),
      };
    },
  };
}
