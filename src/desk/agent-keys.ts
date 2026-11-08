/**
 * Who an agent is, by its key. The setup's `agent.key` is the default agent. Every other agent has its own key, listed in the
 * registry (`agents.json`, beside agent.key). The registry holds each key's SHA-256 hash, never the key: a key is shown once,
 * when `scripts/agent-key.ts add <name>` makes it, and it cannot be read back from the file.
 *
 * The owner of a question is the key id that put it up (`ag_...`, or `default`). The display name is a label the agent sends;
 * it never decides who owns a question.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync } from "node:fs";
import { dirname } from "node:path";

export const AGENTS_REGISTRY_SCHEMA = "horizon.agents/1";
export const DEFAULT_AGENT_KEY_ID = "default";
export const DEFAULT_AGENT_NAME = "Default agent";
const MAX_NAME = 60;

export interface AgentEntry {
  readonly key_id: string;
  readonly name: string;
  readonly sha256: string;
  readonly added: string;
}

export interface AgentOwner {
  readonly key_id: string;
  readonly name: string;
}

export const keyHash = (key: string): string => createHash("sha256").update(key).digest("hex");

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** A display name: plain text, 1 to 60 characters, no control characters, not the default agent's name. */
export function checkAgentName(name: unknown): { readonly ok: true; readonly name: string } | { readonly ok: false; readonly message: string } {
  const text = typeof name === "string" ? name.trim() : "";
  if (text === "" || text.length > MAX_NAME || /[\u0000-\u001f\u007f]/.test(text)) return { ok: false, message: `Give the agent a name of 1 to ${MAX_NAME} plain characters.` };
  if (text.toLowerCase() === DEFAULT_AGENT_NAME.toLowerCase()) return { ok: false, message: `${DEFAULT_AGENT_NAME} is the name of the setup's own agent. Pick another name.` };
  return { ok: true, name: text };
}

/**
 * The registry's entries. A missing file is an empty registry. A file that is not a registry is an error: the caller must
 * not treat it as empty (that would let a damaged file hand out a second writer's key ids).
 */
export function readRegistry(path: string): AgentEntry[] {
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { schema?: unknown; agents?: unknown } | null;
  if (parsed === null || typeof parsed !== "object" || parsed.schema !== AGENTS_REGISTRY_SCHEMA || !Array.isArray(parsed.agents)) {
    throw new Error(`The agent registry at ${path} is not a ${AGENTS_REGISTRY_SCHEMA} file.`);
  }
  return parsed.agents as AgentEntry[];
}

/** Which agent a presented key belongs to: the default key, a registry key, or nobody (null). Nothing is written. */
export function ownerOfKey(presented: string, defaultKey: string, registryPath: string): AgentOwner | null {
  if (presented === "") return null;
  if (safeEqual(presented, defaultKey)) return { key_id: DEFAULT_AGENT_KEY_ID, name: DEFAULT_AGENT_NAME };
  let entries: AgentEntry[];
  try {
    entries = readRegistry(registryPath);
  } catch {
    // A damaged registry opens no registry key; the default key still works.
    return null;
  }
  const hash = keyHash(presented);
  const hit = entries.find((entry) => typeof entry.sha256 === "string" && safeEqual(hash, entry.sha256));
  return hit === undefined ? null : { key_id: hit.key_id, name: hit.name };
}

/**
 * Makes a key for a new agent and records only its hash. The key is returned once, to the caller that prints it; it is not
 * stored anywhere else. Names are unique in the registry, so a name always means one key.
 */
export function addAgentKey(registryPath: string, name: string, now: Date = new Date()): { readonly key_id: string; readonly key: string; readonly name: string } {
  const checked = checkAgentName(name);
  if (!checked.ok) throw new Error(checked.message);
  const entries = readRegistry(registryPath);
  if (entries.some((entry) => entry.name.toLowerCase() === checked.name.toLowerCase())) throw new Error(`An agent named ${checked.name} is already in the registry. Pick another name.`);
  const key = randomBytes(32).toString("hex");
  const keyId = `ag_${randomBytes(6).toString("hex")}`;
  const next = { schema: AGENTS_REGISTRY_SCHEMA, agents: [...entries, { key_id: keyId, name: checked.name, sha256: keyHash(key), added: now.toISOString() }] };
  mkdirSync(dirname(registryPath), { recursive: true });
  const temp = `${registryPath}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, registryPath);
  return { key_id: keyId, key, name: checked.name };
}
