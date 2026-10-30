/**
 * Read-only RealityTrace reader for the case-economics view (HC-06).
 *
 * Runs exactly three commands of RealityTrace's CLI, none of which writes or rebuilds anything:
 *   realitytrace repo list --json
 *   realitytrace ledger export --repo <id> --json
 *   realitytrace projections export --repo <id> --canonical-json
 * (`query evidence`, `delta` and `context` rebuild projections, so they are never run here.)
 * Nothing it returns is stored; the pure model arranges it for display.
 */
import { spawnSync } from "node:child_process";
import type { EconomicsConfig } from "../config/types.ts";
import { economicsModel, type EconomicsModel } from "../economics/model.ts";

export interface EconomicsRepo {
  readonly repo_id: string;
  readonly path: string | null;
  readonly model: EconomicsModel | null;
  /** A brief error from RealityTrace for this repo, or null. */
  readonly error: string | null;
}

export type EconomicsReadout =
  | { readonly state: "not_configured" }
  | { readonly state: "unavailable"; readonly message: string }
  | { readonly state: "empty"; readonly repos: readonly EconomicsRepo[] }
  | { readonly state: "ok"; readonly repos: readonly EconomicsRepo[] };

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
export const READ_ONLY_COMMANDS = [["repo", "list"], ["ledger", "export"], ["projections", "export"]] as const;

const spawnRunner: Runner = (bin, args, env) => {
  const result = spawnSync(bin, [...args], { env, encoding: "utf8", timeout: 60_000, maxBuffer: 512 * 1024 * 1024 });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "", ...(result.error ? { error: result.error.message } : {}) };
};

const brief = (text: string): string => text.trim().replace(/\s+/g, " ").slice(0, 240);

export function realityTraceEconomics(config: EconomicsConfig | undefined, run: Runner = spawnRunner): EconomicsSource {
  return {
    read(): EconomicsReadout {
      if (!config) return { state: "not_configured" };
      const env: Record<string, string> = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/" };
      if (config.data_home) env.XDG_DATA_HOME = config.data_home;
      if (config.state_home) env.XDG_STATE_HOME = config.state_home;

      const call = (args: string[]): { ok: true; json: unknown } | { ok: false; message: string } => {
        assertReadOnly(args);
        const result = run(config.realitytrace_bin, args, env);
        if (result.error) return { ok: false, message: `realitytrace ${args.slice(0, 2).join(" ")}: ${brief(result.error)}` };
        if (result.status !== 0) return { ok: false, message: `realitytrace ${args.slice(0, 2).join(" ")} failed (exit ${result.status}): ${brief(result.stderr || result.stdout)}` };
        try {
          return { ok: true, json: JSON.parse(result.stdout) };
        } catch {
          return { ok: false, message: `realitytrace ${args.slice(0, 2).join(" ")} printed no JSON` };
        }
      };

      const listed = call(["repo", "list", "--json"]);
      if (!listed.ok) return { state: "unavailable", message: listed.message };
      const all = isObject(listed.json) && Array.isArray(listed.json.repos) ? listed.json.repos : [];
      const enrolled = all.filter(isObject).filter((repo) => typeof repo.repo_id === "string" && (repo.state === undefined || repo.state === "enrolled"));
      if (enrolled.length === 0) return { state: "empty", repos: [] };

      const repos: EconomicsRepo[] = enrolled.map((repo) => {
        const repo_id = repo.repo_id as string;
        const path = typeof repo.filesystem_path === "string" ? repo.filesystem_path : null;
        const ledger = call(["ledger", "export", "--repo", repo_id, "--json"]);
        if (!ledger.ok) return { repo_id, path, model: null, error: ledger.message };
        const rows = rowsOf(ledger.json);
        // Residuals are a bonus: a failed projection export leaves them empty and says so, it never hides the ledger.
        const projection = call(["projections", "export", "--repo", repo_id, "--canonical-json"]);
        const model = economicsModel(rows, projection.ok ? rowsOf(projection.json) : []);
        return { repo_id, path, model, error: projection.ok ? null : `${projection.message} (residuals unavailable)` };
      });
      return { state: repos.some((repo) => repo.model && repo.model.audit.agent_events > 0) ? "ok" : "empty", repos };
    },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** `ledger export --json` may be a bare array or wrapped in a result object; take the array either way. */
function rowsOf(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (isObject(json)) {
    for (const key of ["entries", "rows", "data"]) if (Array.isArray(json[key])) return json[key] as unknown[];
  }
  return [];
}

function assertReadOnly(args: readonly string[]): void {
  if (!READ_ONLY_COMMANDS.some(([a, b]) => args[0] === a && args[1] === b)) throw new Error(`ECONOMICS: refusing to run non-read-only realitytrace command '${args.slice(0, 2).join(" ")}'`);
}
