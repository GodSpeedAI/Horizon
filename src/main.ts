import { createApplication } from "./app.ts";
import { mcpTools, renderText } from "./ui/surface2/render.ts";
import { HORIZON_OPERATIONS, isConsequential, type HorizonOperation, type SurfaceRole } from "./ui/surface2/grammar.ts";

/**
 * Three transports, one surface. The CLI and MCP verbs below resolve their target through the
 * same `application.surface()` seam the GUI route uses and commit through the same
 * `application.commitSurfaceIntent()`, so a verb cannot mean something the GUI does not.
 */
const application = await createApplication();
const [command, ...rest] = process.argv.slice(2);

function flag(name: string): string | undefined {
  const index = rest.indexOf(`--${name}`);
  return index === -1 ? undefined : rest[index + 1];
}

function roleFlag(): SurfaceRole {
  const role = flag("role");
  if (role === "human" || role === "agent" || role === "system") return role;
  if (role !== undefined) throw new Error(`horizon: unknown role '${role}'`);
  return "human";
}

if (command === "surface") {
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
    role: roleFlag(),
    ...(operation === undefined ? {} : { operation }),
    ...(nodeId === undefined ? {} : { node_id: nodeId }),
    ...(frameId === undefined ? {} : { frame_id: frameId }),
  });
  process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
  await application.close();
  if (!outcome.ok) process.exit(1);
} else if (command === "mcp") {
  // MCP tools are derived from the grammar's operation vocabulary, never hand-listed (PE-01).
  process.stdout.write(`${JSON.stringify(mcpTools(HORIZON_OPERATIONS, (operation: string) => isConsequential(operation as HorizonOperation)), null, 2)}\n`);
  await application.close();
} else {
  const server = application.startServer();

  console.log(`horizon: ${application.loaded.config.deployment_profile} listening on ${server.url}`);
  console.log(`horizon: world ${application.world.worldRef}`);
  console.log(`horizon: cognate ${application.world.cognateWorldRef}`);
  console.log(`horizon: semantics ${application.world.objectCount} objects / ${application.world.relationCount} relations`);

  let closing = false;
  async function shutdown(): Promise<void> {
    if (closing) return;
    closing = true;
    server.stop();
    await application.close();
  }
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}
