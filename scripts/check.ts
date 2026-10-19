import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { configFromDocument } from "../src/config/load.ts";

function run(command: readonly string[]): number {
  const proc = Bun.spawnSync([...command], { stdout: "inherit", stderr: "inherit" });
  return proc.exitCode ?? 1;
}

const tsc = join(process.cwd(), "node_modules", ".bin", "tsc");
if (!existsSync(tsc)) {
  console.error("check: typescript is not installed; run `bun install`");
  process.exit(1);
}
const typeExit = run([tsc, "--noEmit"]);
if (typeExit !== 0) process.exit(typeExit);

const document = Bun.TOML.parse(readFileSync("config/horizon.toml", "utf8"));
const config = configFromDocument(document);
if (config.deployment_profile !== "local_operator") {
  console.error("check: config/horizon.toml must declare local_operator");
  process.exit(1);
}
if (config.bind_host !== "127.0.0.1" && config.bind_host !== "::1") {
  console.error("check: local_operator must bind a loopback address");
  process.exit(1);
}
console.log(`check: ok (${config.deployment_profile}, ${config.bind_host}:${config.port}, ${config.world_alias})`);
