/**
 * The connection from Horizon to the workshop (Cognate Workbench).
 *
 * `connectTransport` -> `createRemoteRuntimeService` -> `createClient`, the same path the workshop's own tests use.
 * The session key is read from `workshop.key_path` at call time and handed to the transport; it is never logged,
 * stored, exported or put in an error message. The key's expiry comes from the companion `workbench.key.json`
 * (`{sessionId, expiresAt}`), which holds no secret.
 */
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@godspeedai/cognate-client";
import { createRemoteRuntimeService } from "@godspeedai/cognate-protocol-connect";
import { connectTransport } from "@godspeedai/cognate-protocol-connect-bun";
import type { Caller, RuntimeService } from "@godspeedai/cognate-runtime-api";
import type { WorkshopConfig } from "../config/types.ts";

export const KEY_WARNING_DAYS = 7;

export type KeyState = { readonly state: "missing" } | { readonly state: "ok" | "expiring" | "expired"; readonly expiresAt: string | null; readonly days_left: number | null };

/** Reads the key file's trimmed contents, or null when it is absent or empty. The only place the secret is read. */
function readKey(keyPath: string): string | null {
  try {
    const key = readFileSync(keyPath, "utf8").trim();
    return key === "" ? null : key;
  } catch {
    return null;
  }
}

/** State of the key from the companion file only; the key itself is not opened. */
export function keyState(config: WorkshopConfig, now: Date = new Date()): KeyState {
  if (!existsSync(config.key_path)) return { state: "missing" };
  let expiresAt: string | null = null;
  try {
    const doc = JSON.parse(readFileSync(`${config.key_path}.json`, "utf8")) as { expiresAt?: unknown };
    if (typeof doc.expiresAt === "string") expiresAt = doc.expiresAt;
  } catch {
    // The key exists but its expiry is unknown: shown as ok with no date, never as a guess.
  }
  if (expiresAt === null) return { state: "ok", expiresAt: null, days_left: null };
  const days = Math.floor((Date.parse(expiresAt) - now.getTime()) / 86_400_000);
  if (Number.isNaN(days)) return { state: "ok", expiresAt: null, days_left: null };
  return { state: days < 0 ? "expired" : days <= KEY_WARNING_DAYS ? "expiring" : "ok", expiresAt, days_left: days };
}

export interface WorkshopConnection {
  readonly service: RuntimeService;
  readonly client: ReturnType<typeof createClient>;
}

/** A client bound to the workshop, or null when no key file exists. The token is supplied lazily to the transport. */
export function connectWorkshop(config: WorkshopConfig, caller: Caller): WorkshopConnection | null {
  if (readKey(config.key_path) === null) return null;
  const service = createRemoteRuntimeService(connectTransport(config.url), () => readKey(config.key_path) ?? "");
  return { service, client: createClient({ service, caller }) };
}
