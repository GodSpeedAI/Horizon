export class ResearchAdapterError extends Error {
  override readonly name = "ResearchAdapterError";
}

/**
 * The optional Python research subsystem's typed observation (REQ-RES-001).
 *
 * `research_source` is optional in the spec: absent or failing research is a
 * *degraded typed observation*, never a startup-wide prerequisite (REQ-CONFIG-012:
 * a failed preflight blocks only dependent operations). The contract itself is
 * unchanged: a command that runs and reports an unhealthy contract is still a
 * contract violation, and research-dependent operations fail closed on either state.
 */
export type ResearchStatus =
  | {
      readonly kind: "research";
      readonly contract: "horizon.research/1";
      readonly status: "ok";
      readonly capabilities: readonly string[];
      readonly ml: false;
    }
  | {
      readonly kind: "research_unavailable";
      readonly contract: "horizon.research/1";
      readonly status: "unavailable";
      readonly code: "research_source_absent" | "research_source_unavailable" | "research_contract_invalid";
      readonly reason: string;
      readonly ml: false;
    };

/** Backwards-compatible alias for the healthy observation. */
export type ResearchHealth = Extract<ResearchStatus, { readonly status: "ok" }>;

export class ResearchUnavailableError extends Error {
  override readonly name = "ResearchUnavailableError";
  constructor(
    readonly code: Extract<ResearchStatus, { readonly status: "unavailable" }>["code"],
    message: string,
  ) {
    super(`RESEARCH: ${message}`);
  }
}

function fail(message: string): never {
  throw new ResearchAdapterError(`RESEARCH: ${message}`);
}

function parseHealth(text: string): ResearchHealth {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail("research contract did not emit JSON");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("research contract emitted a non-object");
  const record = value as Record<string, unknown>;
  if (record.contract !== "horizon.research/1") fail("research contract version mismatch");
  if (record.status !== "ok") fail("research contract is not healthy");
  if (!Array.isArray(record.capabilities) || !record.capabilities.every((item) => typeof item === "string")) {
    fail("research contract capabilities are malformed");
  }
  if (record.ml !== false) fail("research contract must not claim ML capability");
  return {
    kind: "research",
    contract: "horizon.research/1",
    status: "ok",
    capabilities: record.capabilities as string[],
    ml: false,
  };
}

/**
 * Observe the research subsystem without making it a startup prerequisite.
 *
 * - empty command: the optional source is absent (spec `research_source` default);
 * - spawn failure or non-zero exit: `research_source_unavailable` (degraded);
 * - a command that runs but violates the typed contract: `research_contract_invalid`
 *   (degraded and reported, never silently accepted);
 * - otherwise the healthy typed contract.
 */
export async function observeResearch(command: readonly string[], cwd = process.cwd()): Promise<ResearchStatus> {
  if (command.length === 0) {
    return {
      kind: "research_unavailable",
      contract: "horizon.research/1",
      status: "unavailable",
      code: "research_source_absent",
      reason: "research_command is empty; the optional research source is absent",
      ml: false,
    };
  }
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn([...command, "--health"], { cwd, stdout: "pipe", stderr: "pipe" });
  } catch (error) {
    return unavailable("research_source_unavailable", `research command could not start: ${error instanceof Error ? error.message : String(error)}`);
  }
  const timer = setTimeout(() => proc.kill(), 15_000);
  try {
    const [exit, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout as ReadableStream).text(),
      new Response(proc.stderr as ReadableStream).text(),
    ]);
    if (exit !== 0) {
      return unavailable("research_source_unavailable", `research contract exited ${exit}: ${stderr.trim().slice(0, 400)}`);
    }
    try {
      return parseHealth(stdout.trim());
    } catch (error) {
      if (error instanceof ResearchAdapterError) {
        return unavailable("research_contract_invalid", error.message.replace(/^RESEARCH: /, ""));
      }
      throw error;
    }
  } finally {
    clearTimeout(timer);
  }
}

function unavailable(
  code: Extract<ResearchStatus, { readonly status: "unavailable" }>["code"],
  reason: string,
): ResearchStatus {
  return { kind: "research_unavailable", contract: "horizon.research/1", status: "unavailable", code, reason, ml: false };
}

/** Research-dependent operations fail closed on any non-healthy observation. */
export function requireResearch(status: ResearchStatus): ResearchHealth {
  if (status.kind !== "research") throw new ResearchUnavailableError(status.code, status.reason);
  return status;
}

/** Historical name kept for existing callers; equivalent to `observeResearch`. */
export const researchHealth = observeResearch;
