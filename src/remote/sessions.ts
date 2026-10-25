/**
 * Phone sessions: an opaque 32-byte token in an HttpOnly, Secure, SameSite=Strict cookie. The server
 * keeps only the SHA-256 of the token, in memory. A session is bound to a device and a generation.
 */
import { createHash, randomBytes } from "node:crypto";

export const SESSION_TTL_MS = 12 * 3600_000;
export const COOKIE_NAME = "__Host-hz_remote";

export interface Session {
  readonly deviceId: string;
  readonly generation: number;
  readonly expiresAt: number;
  lastSeen: number;
  /** Command outcomes by command id, kept for the session's lifetime so a retry is answered, not repeated. */
  readonly commands: Map<string, unknown>;
}

function hashOf(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class Sessions {
  private readonly byHash = new Map<string, Session>();

  open(deviceId: string, generation: number, now: number): string {
    const token = randomBytes(32).toString("base64url");
    this.byHash.set(hashOf(token), { deviceId, generation, expiresAt: now + SESSION_TTL_MS, lastSeen: now, commands: new Map() });
    return token;
  }

  /** The live session for this token and generation, or null. Expired and stale entries are removed. */
  get(token: string | null, generation: number, now: number): Session | null {
    if (token === null) return null;
    const key = hashOf(token);
    const session = this.byHash.get(key);
    if (session === undefined) return null;
    if (now >= session.expiresAt || session.generation !== generation) {
      this.byHash.delete(key);
      return null;
    }
    session.lastSeen = now;
    return session;
  }

  /** Whether this device has a live session in this generation (the phone is connected). */
  connected(deviceId: string, generation: number, now: number): boolean {
    for (const session of this.byHash.values()) {
      if (session.deviceId === deviceId && session.generation === generation && now < session.expiresAt) return true;
    }
    return false;
  }

  dropWhere(predicate: (session: Session) => boolean): void {
    for (const [key, session] of this.byHash) {
      if (predicate(session)) this.byHash.delete(key);
    }
  }

  drop(token: string | null): void {
    if (token !== null) this.byHash.delete(hashOf(token));
  }

  clear(): void {
    this.byHash.clear();
  }
}

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
