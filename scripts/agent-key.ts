#!/usr/bin/env bun
/**
 * Adds an agent with its own key to the setup's registry (agents.json, beside agent.key).
 *
 *   bun run scripts/agent-key.ts add <name>
 *
 * The key is printed once, to this terminal. The registry keeps only its SHA-256 hash, so the key cannot be read back:
 * if it is lost, add the agent again under another name.
 */
import { addAgentKey } from "../src/desk/agent-keys.ts";
import { agentRegistryPath } from "../src/config/load.ts";

const [command, ...rest] = process.argv.slice(2);
if (command !== "add" || rest.length !== 1) {
  console.error("Usage: bun run scripts/agent-key.ts add <name>");
  process.exit(2);
}
const name = rest[0]!;
try {
  const made = addAgentKey(agentRegistryPath(), name);
  console.log(`Added the agent ${made.name} (key id ${made.key_id}).`);
  console.log("Its key is shown once, here. Horizon keeps only a hash of it. Give the key to the agent now:");
  console.log(made.key);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
