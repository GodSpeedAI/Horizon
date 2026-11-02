/**
 * Phone session cookie helpers. Sessions themselves are durable records in the shared identity
 * service (`@godspeed/identity`): the server keeps only the SHA-256 of the token, a session resolves
 * to a durable operator, and it is bound to a device and a generation. Nothing about a session is
 * held in memory here.
 */
import { DEFAULT_SESSION_TTL_MS } from "@godspeed/identity";

export const SESSION_TTL_MS = DEFAULT_SESSION_TTL_MS;
export const COOKIE_NAME = "__Host-hz_remote";

export function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}`;
}

export function clearedCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

/** The session token from the Cookie header, or null. */
export function cookieOf(request: Request): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === COOKIE_NAME && value.length > 0) return value.join("=");
  }
  return null;
}
