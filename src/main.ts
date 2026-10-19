import { createApplication } from "./app.ts";

const application = await createApplication();
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
