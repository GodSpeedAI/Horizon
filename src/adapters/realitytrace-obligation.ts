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
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExpectedOutcome } from "../domain/expectation.ts";

export interface RealityTraceObligationConfig {
  readonly bin: string;
  readonly dataHome: string;
  readonly stateHome: string;
  /** The repository RealityTrace enrolls; verifier argv runs with this as its working directory. */
  readonly repoDir: string;
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

const TARGET = "concept:navigation_intent";

export class RealityTraceObligation {
  private repoId: string | null = null;

  constructor(private readonly config: RealityTraceObligationConfig) {}

  private sxr(args: readonly string[]): any {
    const result = spawnSync(this.config.bin, [...args, "--json"], {
      cwd: this.config.repoDir,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/", XDG_DATA_HOME: this.config.dataHome, XDG_STATE_HOME: this.config.stateHome },
      encoding: "utf8",
      timeout: 120_000,
    });
    if (result.error) throw new RealityTraceError(`realitytrace ${args[0]} ${args[1]}: ${result.error.message}`);
    if (result.status !== 0) throw new RealityTraceError(`realitytrace ${args.slice(0, 2).join(" ")} failed (exit ${result.status}): ${(result.stderr || result.stdout).trim()}`);
    try {
      return JSON.parse(result.stdout);
    } catch {
      throw new RealityTraceError(`realitytrace ${args.slice(0, 2).join(" ")} printed no JSON`);
    }
  }

  /** The enrolled repository, enrolling it once (an empty git repository is enough). */
  repo(): string {
    if (this.repoId !== null) return this.repoId;
    mkdirSync(this.config.repoDir, { recursive: true });
    const git = (args: string[]) => spawnSync("git", args, { cwd: this.config.repoDir, encoding: "utf8" });
    if (git(["rev-parse", "--git-dir"]).status !== 0) {
      git(["init", "-q"]);
      git(["-c", "user.email=horizon@localhost", "-c", "user.name=horizon", "commit", "--allow-empty", "-qm", "horizon realitytrace enrollment"]);
    }
    const listed = this.sxr(["repo", "list"]) as { repos?: { repo_id: string; path?: string; root?: string }[] };
    const known = (listed.repos ?? []).find((repo) => [repo.path, repo.root].includes(this.config.repoDir));
    this.repoId = known?.repo_id ?? (this.sxr(["repo", "enroll", this.config.repoDir]) as { repo_id: string }).repo_id;
    return this.repoId;
  }

  private withFile<T>(name: string, content: unknown, body: (path: string) => T): T {
    const dir = mkdtempSync(join(tmpdir(), "horizon-rt-"));
    try {
      const path = join(dir, name);
      writeFileSync(path, JSON.stringify(content));
      return body(path);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  /** Register the expectation as a question and threshold; returns T. Before authority is requested. */
  declare(intentId: string, expectation: ExpectedOutcome): DeclaredThreshold {
    const repo = this.repo();
    const questionId = `q-${intentId}`;
    const thresholdId = `t-${intentId}`;
    this.withFile("question.json", { question_id: questionId, question_form: "is_true", question_type: "verification", target_entities: [], expected_answer_shape: "boolean", title: expectation.statement }, (file) =>
      this.sxr(["question", "declare", "--repo", repo, "--file", file]),
    );
    const threshold = this.withFile("threshold.json", { threshold_id: thresholdId, minimum_relevance: "medium", minimum_reliability: "medium" }, (file) =>
      this.sxr(["threshold", "declare", "--repo", repo, "--question", questionId, "--file", file]),
    ) as { threshold_id: string; ledger_position?: { ledger_id: string; append_ordinal: number } };
    if (!threshold.ledger_position) throw new RealityTraceError("threshold declare returned no ledger position");
    return { question_id: questionId, threshold_id: threshold.threshold_id, position: { ledger_id: threshold.ledger_position.ledger_id, ordinal: threshold.ledger_position.append_ordinal } };
  }

  /** Run the instantiated verifier once, confined by `launcher`, as its own RealityTrace run. */
  run(threshold: DeclaredThreshold, argv: readonly string[], launcher: readonly string[], timeoutS: number): VerifierRun {
    const repo = this.repo();
    const run = this.sxr(["run", "begin", "--repo", repo, "--snapshot", "snapshot:horizon", "--question", threshold.question_id, "--threshold", threshold.threshold_id]) as { run_id: string };
    this.sxr([
      "plan", "create", "--run", run.run_id, "--verifier", "command", "--target", TARGET,
      "--argv-json", JSON.stringify(argv), "--cwd", ".", "--timeout-s", String(Math.max(1, Math.floor(timeoutS))),
      ...(launcher.length > 0 ? ["--launcher-json", JSON.stringify(launcher)] : []),
    ]);
    const verified = this.sxr(["verify", "run", "--run", run.run_id]) as { observations?: Record<string, any>[] };
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
