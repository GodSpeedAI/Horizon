import { createApplication } from "./app.ts";
import { mcpTools, renderText } from "./ui/surface2/render.ts";
import { HORIZON_OPERATIONS, isConsequential, type HorizonOperation, type SurfaceRole } from "./ui/surface2/grammar.ts";
import { openSequential, renderSequentialText, type SequentialIntent } from "./ui/sequential/controller.ts";
import { ttyConfirmIO } from "./capabilities/confirm-command.ts";
import { announceReady, exitWhenStdinCloses, prepareServe } from "./desktop.ts";

/**
 * Three transports, one surface. The CLI and MCP verbs below resolve their target through the
 * same `application.surface()` seam the GUI route uses and commit through the same
 * `application.commitSurfaceIntent()`, so a verb cannot mean something the GUI does not.
 */
const [command, ...rest] = process.argv.slice(2);
// `surface` only reads, so it opens the store read-only and may run while a desk holds the write lock. Every other command writes.
// `serve` is the headless server verb (also the desktop sidecar's); it settles resource and data locations before the application opens.
const serving = command === "serve" ? prepareServe(rest) : undefined;
const application = await createApplication(command === "surface" ? { readOnly: true } : {});

function flag(name: string): string | undefined {
  const index = rest.indexOf(`--${name}`);
  return index === -1 ? undefined : rest[index + 1];
}

function hasFlag(name: string): boolean {
  return rest.includes(`--${name}`);
}

/**
 * Mount the Clack-style renderer on the real OpenTUI renderer. The intent callback is the boundary:
 * T08 records the typed intent and does not execute it, so no terminal keystroke becomes a world
 * mutation before the capability and authority tasks bind one.
 */
async function runSequentialTui(
  session: ReturnType<typeof openSequential>,
  onIntent: (intent: SequentialIntent) => void,
): Promise<void> {
  const [{ createCliRenderer }, { createRoot }, { createElement }, { SequentialTerminal }] = await Promise.all([
    import("@opentui/core"),
    import("@opentui/react"),
    import("react"),
    import("./ui/sequential/terminal.tsx"),
  ]);
  const renderer = await createCliRenderer({ exitOnCtrlC: true, useKittyKeyboard: { disambiguate: true }, targetFps: 30 });
  const root = createRoot(renderer);
  await new Promise<void>((resolve) => {
    root.render(
      createElement(SequentialTerminal, {
        initialSession: session,
        onIntent,
        onExit: () => {
          renderer.destroy();
          resolve();
        },
      }),
    );
  });
}

/**
 * Which projection the local console reduces the surface for. This is a projection selector, not
 * an identity: the intent's actor is always the frame's observer, and the CLI is the operator's
 * own process (DEF-ROLE-FROM-REQUEST).
 */
function roleFlag(): SurfaceRole {
  const role = flag("role");
  if (role === "human" || role === "agent" || role === "system") return role;
  if (role !== undefined) throw new Error(`horizon: unknown role '${role}'`);
  return "human";
}

if (command === "frame") {
  const frame = await application.navigationFrame({
    ...(flag("focus") === undefined ? {} : { focusRef: flag("focus") as string }),
    ...(flag("case") === undefined ? {} : { caseRef: flag("case") as string }),
    ...(flag("purpose") === undefined ? {} : { purpose: flag("purpose") as string }),
  });
  const session = openSequential(frame, { source: "operational-projection" });
  if (hasFlag("json")) {
    process.stdout.write(
      `${JSON.stringify(
        {
          schema: "horizon.frame/1",
          source: session.source,
          frame,
          prompt: session.prompt,
          intent_schema: "horizon.sequential-intent/1",
        },
        null,
        2,
      )}\n`,
    );
    await application.close();
  } else if (hasFlag("text") || (!process.stdout.isTTY && !hasFlag("tui"))) {
    process.stdout.write(renderSequentialText(session.prompt));
    await application.close();
  } else {
    const intents: SequentialIntent[] = [];
    await runSequentialTui(session, (intent) => intents.push(intent));
    await application.close();
  }
} else if (command === "surface") {
  const projection = application.surface(roleFlag());
  if (!projection.ok) {
    // A surface the grammar refuses is a failure, not a degraded page.
    console.error(JSON.stringify({ code: projection.code, issues: projection.issues }));
    process.exit(1);
  }
  process.stdout.write(renderText(projection.view));
  await application.close();
} else if (command === "schema") {
  process.stdout.write(`${JSON.stringify(application.surfaceSchema(), null, 2)}\n`);
  await application.close();
} else if (command === "act") {
  // `horizon act --operation horizon.health` — the CLI's expression of the same intent.
  const operation = flag("operation");
  const nodeId = flag("node");
  if (operation === undefined && nodeId === undefined) throw new Error("horizon: act requires --operation or --node");
  const frameId = flag("frame");
  const outcome = await application.commitSurfaceIntent({
    transport: "cli",
    ...(operation === undefined ? {} : { operation }),
    ...(nodeId === undefined ? {} : { node_id: nodeId }),
    ...(frameId === undefined ? {} : { frame_id: frameId }),
  }, roleFlag());
  process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
  await application.close();
  if (!outcome.ok) process.exit(1);
} else if (command === "confirm") {
  // Stage 0B: the local terminal names the waiting operation and asks for the code the Horizon terminal showed. It runs on /dev/tty only.
  const pendingId = flag("pending");
  if (pendingId === undefined) {
    process.stderr.write("horizon confirm: name the waiting operation with --pending <id>\n");
    await application.close();
    process.exit(2);
  }
  const outcome = await application.confirmPending(pendingId, ttyConfirmIO());
  process.stdout.write(`${outcome.message}\n`);
  await application.close();
  if (!outcome.ok) process.exit(1);
} else if (command === "mcp") {
  // MCP tools are derived from the grammar's operation vocabulary, never hand-listed (PE-01).
  process.stdout.write(`${JSON.stringify(mcpTools(HORIZON_OPERATIONS, (operation: string) => isConsequential(operation as HorizonOperation)), null, 2)}\n`);
  await application.close();
} else {
  const server = serving?.desktop ? application.startServer(serving.port, { launch: announceReady }) : application.startServer(serving?.port);

  console.log(`horizon: ${application.loaded.config.deployment_profile} listening on ${server.url}`);
  console.log(`horizon: workspace ${new URL("workspace", server.url).href}`);
  console.log(`horizon: world ${application.world.worldRef}`);
  console.log(`horizon: cognate ${application.world.cognateWorldRef}`);
  console.log(`horizon: semantics ${application.world.objectCount} objects / ${application.world.relationCount} relations`);

  let closing = false;
  async function shutdown(): Promise<void> {
    if (closing) return;
    closing = true;
    server.stop();
    await application.close();
    if (serving !== undefined) process.exit(0);
  }
  if (serving?.desktop) exitWhenStdinCloses(() => void shutdown());
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}
