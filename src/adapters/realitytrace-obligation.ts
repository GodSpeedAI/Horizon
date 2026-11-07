/**
 * RealityTrace for obligation settlement (HORIZON-001 1.1.0, REQ-NAV-011/012), over its documented CLI.
 *
 * Per intent, the expectation is registered as a question and a threshold *before* authority is requested;
 * their committed ledger position is T. Every verifier execution (the discrimination run and each
 * verification run) is its own RealityTrace run with one `command` plan: RealityTrace runs exactly the
 * instantiated argv under the configured launcher (the confinement) and records the exit code, argv,
 * started_at and completed_at in its own ledger, where SEA-Forge reads them back. Horizon never writes an
 * outcome RealityTrace did not record.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExpectedOutcome } from "../domain/expectation.ts";
import { redact } from "./redact.ts";
import { runChild } from "./run-child.ts";

export interface RealityTraceObligationConfig {
  readonly bin: string;
  readonly dataHome: string;
  readonly stateHome: string;
  /** The repository RealityTrace enrolls; verifier argv runs with this as its working directory. */
  readonly repoDir: string;
  /** Each RealityTrace command is killed after this long. Default 120 s. */
  readonly timeoutMs?: number;
  /** Largest answer read from any command, in bytes. Default 16 MB. */
  readonly maxBytes?: number;
}

export interface DeclareInput {
  readonly intentId: string;
  readonly statement: string;
  readonly target: string;
  readonly criteria: { readonly minimum_relevance: string; readonly minimum_reliability: string };
}

export interface RunOptions {
  readonly target: string;
  readonly snapshot: string;
}

export interface LedgerPosition {
  readonly ledger_id: string;
  readonly ordinal: number;
}

export interface DeclaredThreshold {
  readonly question_id: string;
  readonly threshold_id: string;
  /** T: the threshold's committed ledger position. */
  readonly position: LedgerPosition;
}

export interface VerifierRun {
  readonly observation_id: string;
  readonly exit_code: number | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly crashed: boolean;
  readonly position: LedgerPosition;
}

export class RealityTraceError extends Error {
  override readonly name = "RealityTraceError";
}

export class RealityTraceObligation {
  private repoId: string | null = null;

  constructor(private readonly config: RealityTraceObligationConfig) {}

  /**
   * One RealityTrace command. It runs as a child process and is awaited, so the event loop keeps serving while it works.
   * After the time limit the child is killed and the error says so.
   */
  private async sxr(args: readonly string[]): Promise<any> {
    const label = args.slice(0, 2).join(" ");
    const limitMs = this.config.timeoutMs ?? 120_000;
    let result;
    try {
      result = await runChild([this.config.bin, ...args, "--json"], {
        cwd: this.config.repoDir,
        env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/", XDG_DATA_HOME: this.config.dataHome, XDG_STATE_HOME: this.config.stateHome },
        timeoutMs: limitMs,
        maxBytes: this.config.maxBytes ?? 16 * 1024 * 1024,
      });
    } catch (error) {
      throw new RealityTraceError(redact(`realitytrace ${label}: ${error instanceof Error ? error.message : String(error)}`));
    }
    if (result.timedOut) throw new RealityTraceError(`realitytrace ${label} timed out after ${Math.round(limitMs / 1000)} s and was stopped`);
    if (result.tooLarge) throw new RealityTraceError(`realitytrace ${label} answer was too large to read and the command was stopped`);
    if (result.code !== 0) throw new RealityTraceError(redact(`realitytrace ${label} failed (exit ${result.code}): ${(result.stderr || result.stdout).trim()}`).slice(0, 600));
    try {
      return JSON.parse(result.stdout);
    } catch {
      throw new RealityTraceError(`realitytrace ${label} printed no JSON`);
    }
  }

  /** One git command with no hooks, a time limit and a checked exit code. */
  private async git(args: readonly string[]): Promise<{ code: number | null; text: string }> {
    const result = await runChild(["git", "-c", "core.hooksPath=/dev/null", ...args], {
      cwd: this.config.repoDir,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/", GIT_TERMINAL_PROMPT: "0" },
      timeoutMs: 30_000,
      maxBytes: 1024 * 1024,
    });
    if (result.timedOut) throw new RealityTraceError(`git ${args[0]} timed out and was stopped`);
    return { code: result.code, text: redact(`${result.stderr}${result.stdout}`.trim()).slice(0, 300) };
  }

  /** The enrolled repository, enrolling it once (an empty git repository is enough). */
  async repo(): Promise<string> {
    if (this.repoId !== null) return this.repoId;
    mkdirSync(this.config.repoDir, { recursive: true });
    if ((await this.git(["rev-parse", "--git-dir"])).code !== 0) {
      const init = await this.git(["init", "-q", "--template="]);
      if (init.code !== 0) throw new RealityTraceError(`git init failed: ${init.text}`);
      const commit = await this.git(["-c", "user.email=horizon@localhost", "-c", "user.name=horizon", "commit", "--allow-empty", "-qm", "horizon realitytrace enrollment"]);
      if (commit.code !== 0) throw new RealityTraceError(`git commit failed: ${commit.text}`);
    }
    const listed = (await this.sxr(["repo", "list"])) as { repos?: { repo_id: string; path?: string; root?: string }[] };
    const known = (listed.repos ?? []).find((repo) => [repo.path, repo.root].includes(this.config.repoDir));
    this.repoId = known?.repo_id ?? ((await this.sxr(["repo", "enroll", this.config.repoDir])) as { repo_id: string }).repo_id;
    return this.repoId;
  }

  private async withFile<T>(name: string, content: unknown, body: (path: string) => Promise<T>): Promise<T> {
    const dir = mkdtempSync(join(tmpdir(), "horizon-rt-"));
    try {
      const path = join(dir, name);
      writeFileSync(path, JSON.stringify(content));
      return await body(path);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  /** Register the expectation as a question and threshold; returns T. Before authority is requested. */
  async declare(input: DeclareInput): Promise<DeclaredThreshold> {
    const repo = await this.repo();
    const questionId = `q-${input.intentId}`;
    const thresholdId = `t-${input.intentId}`;
    await this.withFile("question.json", { question_id: questionId, question_form: "is_true", question_type: "verification", target_entities: [], expected_answer_shape: "boolean", title: input.statement }, (file) =>
      this.sxr(["question", "declare", "--repo", repo, "--file", file]),
    );
    const threshold = (await this.withFile("threshold.json", { threshold_id: thresholdId, minimum_relevance: input.criteria.minimum_relevance, minimum_reliability: input.criteria.minimum_reliability }, (file) =>
      this.sxr(["threshold", "declare", "--repo", repo, "--question", questionId, "--file", file]),
    )) as { threshold_id: string; ledger_position?: { ledger_id: string; append_ordinal: number } };
    if (!threshold.ledger_position) throw new RealityTraceError("threshold declare returned no ledger position");
    return { question_id: questionId, threshold_id: threshold.threshold_id, position: { ledger_id: threshold.ledger_position.ledger_id, ordinal: threshold.ledger_position.append_ordinal } };
  }

  /** Run the instantiated verifier once, confined by `launcher`, as its own RealityTrace run. */
  async run(threshold: DeclaredThreshold, argv: readonly string[], launcher: readonly string[], timeoutS: number, opts: RunOptions): Promise<VerifierRun> {
    const repo = await this.repo();
    const run = (await this.sxr(["run", "begin", "--repo", repo, "--snapshot", opts.snapshot, "--question", threshold.question_id, "--threshold", threshold.threshold_id])) as { run_id: string };
    await this.sxr([
      "plan", "create", "--run", run.run_id, "--verifier", "command", "--target", opts.target,
      "--argv-json", JSON.stringify(argv), "--cwd", ".", "--timeout-s", String(Math.max(1, Math.floor(timeoutS))),
      ...(launcher.length > 0 ? ["--launcher-json", JSON.stringify(launcher)] : []),
    ]);
    const verified = (await this.sxr(["verify", "run", "--run", run.run_id])) as { observations?: Record<string, any>[] };
    const observation = verified.observations?.[0];
    if (!observation?.ledger_position) throw new RealityTraceError("verify run recorded no observation");
    return {
      observation_id: String(observation.observation_id),
      exit_code: typeof observation.exit_code === "number" ? observation.exit_code : null,
      started_at: typeof observation.started_at === "string" ? observation.started_at : null,
      completed_at: typeof observation.completed_at === "string" ? observation.completed_at : null,
      crashed: observation.crashed === true,
      position: { ledger_id: observation.ledger_position.ledger_id, ordinal: observation.ledger_position.append_ordinal },
    };
  }
}
