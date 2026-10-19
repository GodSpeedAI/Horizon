export class ResearchAdapterError extends Error {
  override readonly name = "ResearchAdapterError";
}

export interface ResearchHealth {
  readonly contract: "horizon.research/1";
  readonly status: "ok";
  readonly capabilities: readonly string[];
  readonly ml: false;
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
    contract: "horizon.research/1",
    status: "ok",
    capabilities: record.capabilities as string[],
    ml: false,
  };
}

export async function researchHealth(command: readonly string[], cwd = process.cwd()): Promise<ResearchHealth> {
  if (command.length === 0) fail("research command is empty");
  const proc = Bun.spawn([...command, "--health"], { cwd, stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => proc.kill(), 15_000);
  try {
    const [exit, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    if (exit !== 0) fail(`research contract exited ${exit}: ${stderr.trim().slice(0, 400)}`);
    return parseHealth(stdout.trim());
  } finally {
    clearTimeout(timer);
  }
}
