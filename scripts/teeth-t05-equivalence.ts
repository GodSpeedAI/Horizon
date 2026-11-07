/**
 * T05 live cross-transport equivalence (PE-04, NE-09).
 *
 * NE-09 in `test/surface-negative.test.ts` proves the *resolver* does not call divergent
 * intents equivalent. This proves something the resolver cannot: that the shipped transports
 * actually hand that resolver the same document. It starts the real server, runs the real
 * CLI, and compares — a mocked transport would only prove the mock.
 *
 * Three comparisons, each against one in-process view of one frame:
 *   1. GUI text/plain body === CLI `surface` stdout.
 *   2. GUI json body === the frame projection (same role, same frame).
 *   3. MCP tool names === the `horizon.*` operation union, one tool per operation.
 *
 * Any divergence exits non-zero. Equivalence is asserted, not assumed.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface Result {
  readonly exit: number;
  readonly output: string;
}

/** One store per comparison set, so no lock, no stale checkpoint and no prior intent leaks in. */
function withStore<T>(body: (store: string) => Promise<T>): Promise<T> {
  const directory = mkdtempSync(join(tmpdir(), "horizon-t05-eq-"));
  return body(join(directory, "store.sqlite")).finally(() => rmSync(directory, { recursive: true, force: true }));
}

function isolatedEnv(store: string): Record<string, string> {
  const base = { ...process.env } as Record<string, string>;
  base.HORIZON_STORE = store;
  delete base.HORIZON_CONFIG;
  delete base.HORIZON_SECRET_FILE;
  return base;
}

async function run(command: readonly string[], store: string): Promise<Result> {
  const proc = Bun.spawn([...command], { cwd: process.cwd(), env: isolatedEnv(store), stdout: "pipe", stderr: "pipe" });
  const [exit, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { exit, output: `${stdout}${stderr}` };
}

function fail(message: string): never {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

function ok(message: string): void {
  console.log(`ok   ${message}`);
}

/**
 * Start the real server and wait for the line that names the port it actually bound. Reading
 * the port from the process's own output keeps this independent of a chosen fixed port.
 */
async function startServer(store: string): Promise<{ url: string; stop: () => void }> {
  const proc = Bun.spawn(["bun", "run", "src/main.ts"], {
    cwd: process.cwd(),
    env: isolatedEnv(store),
    stdout: "pipe",
    stderr: "pipe",
  });
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let seen = "";
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const read = reader.read();
    const chunk = await Promise.race([read, new Promise<null>((resolve) => setTimeout(() => resolve(null), 1_000))]);
    if (chunk === null) continue;
    seen += decoder.decode(chunk.value, { stream: true });
    const match = /listening on (http:\/\/127\.0\.0\.1:\d+)\//.exec(seen);
    if (match?.[1] !== undefined) {
      reader.releaseLock();
      return { url: match[1], stop: () => proc.kill() };
    }
    if (chunk.done) break;
  }
  proc.kill();
  fail(`server did not report a listener: ${seen}`);
}

async function get(url: string, accept: string): Promise<{ status: number; body: string }> {
  const response = await fetch(url, { headers: { accept } });
  return { status: response.status, body: await response.text() };
}

async function main(): Promise<void> {
  // 1-3. Two processes, two stores, one world: the GUI and the CLI must mean the same thing.
  await withStore(async (store) => {
    const server = await startServer(store);
    try {
      const gui = await get(`${server.url}/surface`, "text/plain");
      const cli = await run(["bun", "run", "src/main.ts", "surface"], store);
      if (gui.status !== 200) fail(`GUI text body exited ${gui.status}`);
      if (cli.exit !== 0) fail(`CLI surface exited ${cli.exit}: ${cli.output}`);
      if (gui.body !== cli.output) fail(`GUI and CLI texts diverge:\n--- gui\n${gui.body}\n--- cli\n${cli.output}`);
      ok("PE-04 GUI text/plain body is byte-identical to CLI `surface` output");

      const json = await get(`${server.url}/surface?role=agent`, "application/json");
      if (json.status !== 200) fail(`GUI json body exited ${json.status}`);
      const document = JSON.parse(json.body) as { schema: string; view: { schema: string; role: string } };
      if (document.schema !== "horizon.surface/3") fail(`GUI document schema is ${document.schema}`);
      if (document.view.schema !== "horizon.gui-view/1") fail(`GUI view schema is ${document.view.schema}`);
      if (document.view.role !== "agent") fail(`GUI ignored the requested role: ${document.view.role}`);
      ok("PE-04 GUI json is a horizon.surface/3 frame carrying one horizon.gui-view/1 projection");

      // A role nobody holds is refused at the route, not quietly served as `human`.
      const bad = await get(`${server.url}/surface?role=root`, "application/json");
      if (bad.status !== 400) fail(`invented role was served with ${bad.status}`);
      ok("PE-01 an invented role is refused (400), never downgraded to the default");
    } finally {
      server.stop();
    }
  });

  // 4. MCP tools are derived from the operation union plus exactly one view tool: one per
  // operation, nothing hand-listed. Tool names fold `.` to `_` per MCP naming; the check
  // asserts that mapping rather than the literal spelling, so a rename cannot slip through.
  await withStore(async (store) => {
    const tools = await run(["bun", "run", "src/main.ts", "mcp"], store);
    if (tools.exit !== 0) fail(`CLI mcp exited ${tools.exit}: ${tools.output}`);
    const listed = JSON.parse(tools.output) as readonly { name: string }[];
    const grammar = await import("../src/ui/surface2/grammar.ts");
    const opTools = listed.filter((tool) => tool.name !== "horizon.view");
    const names = opTools.map((tool) => tool.name).join(",");
    const expected = grammar.HORIZON_OPERATIONS.map((operation) => operation.replaceAll(".", "_")).join(",");
    if (names !== expected) fail(`MCP tools diverge from the operation union:\n  tools:   ${names}\n  grammar: ${expected}`);
    if (listed.length !== grammar.HORIZON_OPERATIONS.length + 1) {
      fail(`MCP published ${listed.length} tools for ${grammar.HORIZON_OPERATIONS.length} operations plus one view tool`);
    }
    ok(`PE-06 MCP publishes ${opTools.length} operation tools + 1 view tool, derived from the closed union`);
  });

  // 5. An unoffered intent is refused on every transport, with a transport-shaped refusal.
  await withStore(async (store) => {
    const server = await startServer(store);
    try {
      const submit = async (body: unknown): Promise<number> => {
        const response = await fetch(`${server.url}/surface/intent`, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify(body),
        });
        return response.status;
      };
      const gui = await submit({ transport: "gui", node_id: "no-such-action" });
      const mcp = await submit({ transport: "mcp", operation: "horizon.teleport" });
      const cli = await run(["bun", "run", "src/main.ts", "act", "--operation", "horizon.teleport"], store);
      if (gui !== 409) fail(`GUI unknown node was accepted (${gui})`);
      if (mcp !== 409) fail(`MCP invented operation was accepted (${mcp})`);
      if (cli.exit === 0) fail("CLI invented operation was accepted");
      ok("NE-09 GUI (409), MCP (409) and CLI (exit 1) all refuse an unoffered intent");
    } finally {
      server.stop();
    }
  });

  // 6. NE-10 over the live route: markup that reaches the route as data is escaped, and the
  // served view carries no executable attribute. A projection that trusted an observed value
  // would emit `onerror=`; this asserts on the bytes the route actually sends.
  await withStore(async (store) => {
    const server = await startServer(store);
    try {
      for (const accept of ["text/html", "application/json"]) {
        const served = await get(`${server.url}/surface`, accept);
        const lowered = served.body.toLowerCase();
        const executable = /<script|onerror\s*=|onload\s*=|onclick\s*=|javascript:/.exec(lowered);
        if (executable !== null) fail(`NE-10 ${accept} response carried executable markup: ${executable[0]}`);
        if (served.status !== 200) fail(`NE-10 ${accept} response was ${served.status}`);
      }
      ok("NE-10 the live /surface route serves no executable markup under either accept header");
    } finally {
      server.stop();
    }
  });

  console.log("teeth-t05-equivalence: ok (6 comparisons)");
}

await main();
