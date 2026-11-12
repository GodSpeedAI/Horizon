/**
 * The phone remote: a second, loopback-only listener that serves the phone pages and a JSON + SSE
 * API. It never accepts the launch secret, never uses the cockpit's Host allowlist, and every
 * request except pairing carries a passkey-backed session. Decisions are made by the same
 * application functions the cockpit uses; this file only authenticates and shapes the exchange.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Server } from "bun";
import type { DurableStore } from "@godspeedai/cognate-events";
import type { Caller } from "@godspeedai/cognate-runtime-api";
import {
  IdentityError,
  SESSIONS,
  WebAuthnError,
  assertionOptions,
  newChallenge,
  registrationOptions,
  verifyRegistration,
  type IdentityService,
  type ResolvedSession,
  type SessionRecord,
} from "@godspeed/identity";
import { auditRemote, addDevice, listDevices, updateDevice, type RemoteDevice } from "../capabilities/remote-records.ts";
import { checkPurpose } from "../capabilities/workspace-records.ts";
import type { WorkspaceChrome, WorkspaceMove, WorkspaceReceipt } from "../ui/workspace/model.ts";
import { identityStoreOf } from "./identity-store.ts";
import { reservedActorField, unknownField } from "../contracts/identity/reserved-fields.ts";
import { refusalWords, type FrozenRefusal } from "../contracts/identity/enforcement.ts";
import { Pairing } from "./pairing.ts";
import type { EnrollmentAuthority } from "./enrollment.ts";
import { clearedCookie, cookieOf, sessionCookie } from "./sessions.ts";
import { phonePage, pairPage } from "./phone.ts";
import type { RemoteSettings } from "./settings.ts";

export const REMOTE_SCHEMA = "horizon.remote/1";
/** The actor id an enrolled device is called by. It is not a person, and its prefix says so in every record it writes. */
export const DEVICE_ACTOR_PREFIX = "device:";
/**
 * The durable operator an enrolled device is associated with. It is attribution — who the device
 * belongs to and who is answerable for it — never the caller of a device-authenticated request.
 */
export interface DeviceAttribution {
  readonly operator: string;
}
const BODY_LIMIT = 16 * 1024;
/**
 * Request fields that would name an actor. The actor is never taken from the request.
 *
 * The list is the contract's one list (`contracts/identity/reserved-fields.ts`), not a copy of
 * it: the phone once kept a shorter set of its own, so a field the desktop refused outright —
 * `caller_ref`, `principal`, `executor`, `authority` — was an ordinary unknown field here
 * (R4-07).
 */
const COMMAND_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** What the listener needs from the application: reads, and the same write paths the cockpit uses. */
export interface RemoteDeps {
  readonly store: DurableStore;
  /** The runtime tenant (what stored records are scoped by). */
  readonly tenant: string;
  /** The shared identity service over the same store: durable sessions, devices and operators. */
  readonly identity: IdentityService;
  /** The identity-store tenant slug for this runtime tenant. */
  readonly identityTenant: string;
  /**
   * The durable operator the cockpit's own session approves pairing for. A pairing link enrols a
   * passkey for exactly this operator; it never creates one and never grants a role.
   */
  readonly operator: string;
  /**
   * The operator's authorization of a new controller. A verified passkey is held here until the operator
   * types the code the desk shows on its terminal; nothing is enrolled before that.
   */
  readonly enrollment: EnrollmentAuthority;
  /** The cockpit's default read: frame, closed surface view and its actions. */
  readonly workspace: () => Promise<{
    readonly frame: { readonly frame_id: string; readonly revision: number };
    readonly view: { readonly actions: readonly { readonly action_id: string; readonly label: string; readonly operation: string; readonly posture: string; readonly affordance: string; readonly consequential: boolean }[] };
  }>;
  readonly chrome: (receipt?: string | null) => Promise<WorkspaceChrome>;
  readonly position: () => Promise<number>;
  /**
   * The cockpit's commit of one offered action, run with the session's Caller (never the server
   * operator's) and the operator the enrolled device is associated with, as attribution only.
   */
  readonly commitAction: (
    actionId: string,
    intentId: string,
    who: Caller,
    attribution: DeviceAttribution,
  ) => Promise<{ readonly ok: true } | { readonly ok: false; readonly code: string; readonly message: string }>;
  readonly openCase: (purpose: string, who: Caller, attribution: DeviceAttribution) => Promise<void>;
  /**
   * The operation the phone's command performs, resolved from the identity catalog's dispatch
   * table for `POST /m/api/command`, and the class that operation carries.
   *
   * The phone names a kind, never an operation. The catalog says which row a kind selects, and
   * the settlement command's phase selects between the two settlement rows. A kind or a pair
   * the catalog does not list resolves to nothing, and the command is refused before any effect
   * runs (R3-01, R3-02).
   *
   * The class comes back with the operation because the phone's credential is a device
   * credential: it proves which enrolled device is at the route and never which person is
   * holding it. A governed row therefore needs a protected operation-bound confirmation the
   * remote path does not have, and the command is refused rather than downgraded (R4-02).
   *
   * The catalog's own refusal comes back with the operation (R5-01): the row the catalog refuses
   * is the row the command refuses, with the catalog's own words and its refusal audit, so the
   * contract and this route cannot drift.
   */
  readonly resolveCommand: (kind: string, phase: string | null) => { readonly operation: string; readonly class: string; readonly fields: readonly string[]; readonly refusal: FrozenRefusal | null } | null;
}

export interface RemoteStatus {
  readonly state: "off" | "waiting" | "expired" | "connected" | "restoring";
  readonly generation: number;
  readonly expires_at: number | null;
  readonly device: { readonly label: string; readonly paired_at: string; readonly last_seen: string | null } | null;
  readonly public_url: string | null;
  readonly reachable: "not_checked" | "ok" | "failed";
}

type Outcome = {
  readonly state: "done" | "refused" | "waiting";
  readonly code?: string;
  readonly message?: string;
  readonly intent_id?: string;
  readonly receipt?: WorkspaceReceipt | null;
};

/** A coarse device label from the user agent, for the desktop panel. Never the full string. */
export function labelOf(userAgent: string | null): string {
  const ua = userAgent ?? "";
  const device = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Phone";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "browser";
  return `${device} · ${browser}`;
}

/** Fixed-window limits per key; the phone is one operator, so this only stops a runaway client. */
class Limiter {
  private readonly hits = new Map<string, number[]>();
  allow(key: string, max: number, windowMs: number, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < windowMs);
    if (recent.length >= max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "cache-control": "no-store",
  "x-frame-options": "DENY",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...SECURITY_HEADERS, ...headers } });
}

function refusal(status: number, code: string, message: string): Response {
  return json(status, { code, message });
}

function html(body: string, nonce: string): Response {
  const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
  return new Response(body, {
    headers: { ...SECURITY_HEADERS, "content-type": "text/html; charset=utf-8", "content-security-policy": csp },
  });
}

async function bodyOf(request: Request): Promise<Record<string, unknown> | null> {
  if (!(request.headers.get("content-type") ?? "").startsWith("application/json")) return null;
  const text = await request.text();
  if (text.length > BODY_LIMIT) return null;
  try {
    const value = JSON.parse(text) as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function hashed(text: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(text).digest());
}

export class RemoteController {
  readonly pairing = new Pairing();
  /** Command outcomes by session and command id: a retry is answered, never repeated, even while the first is still running. */
  private readonly commands = new Map<string, Map<string, Promise<{ readonly status: number; readonly body: unknown }>>>();
  private commitChain: Promise<unknown> = Promise.resolve();
  private readonly limiter = new Limiter();
  private server: Server<unknown> | null = null;
  private reach: { readonly at: number; readonly ok: boolean } | null = null;

  constructor(
    private readonly settings: RemoteSettings,
    private readonly deps: RemoteDeps,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  get listening(): boolean {
    return this.server !== null;
  }

  /** The origin the phone uses: the public URL when one is configured, else this machine's localhost. */
  get origin(): string {
    if (this.settings.publicUrl !== null) return this.settings.publicUrl;
    return `http://localhost:${this.server?.port ?? this.settings.port}`;
  }

  get rpId(): string {
    return this.settings.publicUrl === null ? "localhost" : new URL(this.settings.publicUrl).hostname;
  }

  private allowedHosts(): string[] {
    if (this.settings.publicUrl !== null) return [new URL(this.settings.publicUrl).host];
    const port = this.server?.port ?? this.settings.port;
    return [`localhost:${port}`, `127.0.0.1:${port}`];
  }

  private async liveDevice(): Promise<RemoteDevice | null> {
    if (!this.pairing.isEnabled) return null;
    const devices = await listDevices(this.deps.store, this.deps.tenant);
    return devices.find((device) => device.revoked_at === null && device.generation === this.pairing.generation) ?? null;
  }

  /** The ledger's active controllers, sorted: what an enrolment request names as the controllers it would replace. */
  private async activeDeviceIds(): Promise<string[]> {
    return (await listDevices(this.deps.store, this.deps.tenant)).filter((device) => device.revoked_at === null).map((device) => device.device_id).sort();
  }

  /** Revoke every device in the Horizon ledger and in the identity service (which revokes their sessions). */
  private async revokeDevices(at: string, cause: string): Promise<void> {
    for (const device of await listDevices(this.deps.store, this.deps.tenant)) {
      if (device.revoked_at === null) await updateDevice(this.deps.store, device.device_id, { revoked_at: at });
    }
    for (const device of await this.deps.identity.listDevices(this.deps.identityTenant, this.deps.operator)) {
      if (device.revokedAt === null) await this.deps.identity.revokeDevice(device.id, cause);
    }
    this.commands.clear();
  }

  /** Whether the device's current session is live (the phone is connected). */
  private async connected(deviceId: string, now: number): Promise<boolean> {
    const device = (await this.deps.identity.listDevices(this.deps.identityTenant, this.deps.operator)).find((candidate) => candidate.id === deviceId);
    if (device === undefined || device.revokedAt !== null || device.sid === null) return false;
    const stored = await identityStoreOf(this.deps.store).getRecord(SESSIONS, device.sid);
    const session = stored?.value as unknown as SessionRecord | undefined;
    return session !== undefined && session.status === "active" && Date.parse(session.expiresAt) > now;
  }

  /**
   * The Caller for a resolved session: the enrolled device, in the runtime tenant.
   *
   * A device credential proves which device is at the route, never which person is holding it
   * (design §7), so the durable operator behind the enrolment is not substituted for the caller:
   * the device acts, and the operator is recorded beside it as attribution. The operator's own
   * actor still reaches the cockpit's own paths; it is simply not the caller of a
   * device-authenticated request (R5-03). `Principal.kind` has no device kind, so the device is
   * carried as a service principal whose id says it is one.
   */
  private callerOf(session: ResolvedSession): Caller {
    return { tenant: this.deps.tenant, actor: { id: `${DEVICE_ACTOR_PREFIX}${session.session.deviceId ?? session.session.sid}`, kind: "service" } };
  }

  /** The operator the enrolled device is associated with, as attribution beside the device caller. */
  private attributionOf(session: ResolvedSession): DeviceAttribution {
    return { operator: session.caller.actor.id };
  }

  /** Bind the loopback listener and open a pairing link. Old devices stay revoked from any earlier stop. */
  async start(): Promise<void> {
    if (this.server !== null) return;
    // The cockpit's own session approves pairing for one durable operator that must already exist and be active.
    const operator = await this.deps.identity.getOperator(this.deps.identityTenant, this.deps.operator);
    if (operator === undefined || operator.status !== "active") throw new Error(`REMOTE: operator ${this.deps.operator} is not an active durable operator; a pairing link never creates one`);
    const now = this.clock();
    const floor = Math.max(0, ...(await listDevices(this.deps.store, this.deps.tenant)).map((device) => device.generation));
    this.server = Bun.serve({ hostname: "127.0.0.1", port: this.settings.port, fetch: (request) => this.handle(request) });
    this.pairing.start(now, floor);
  }

  /** New link, new generation: every prior link, credential and session is revoked at once. */
  async refresh(): Promise<void> {
    if (this.server === null) return;
    const at = new Date(this.clock()).toISOString();
    await this.deps.enrollment.abandonWaiting("pairing refreshed");
    await this.revokeDevices(at, "pairing refreshed");
    this.pairing.refresh(this.clock());
  }

  /** Generation bump and listener closed: immediate revocation. */
  async stop(): Promise<void> {
    const at = new Date(this.clock()).toISOString();
    this.pairing.stop();
    await this.deps.enrollment.abandonWaiting("remote control stopped");
    await this.revokeDevices(at, "remote control stopped");
    this.server?.stop(true);
    this.server = null;
  }

  /** The pairing link to show, while it is redeemable. Only the desktop panel reads it. */
  pairingLink(): string | null {
    const current = this.pairing.current(this.clock());
    return current === null ? null : `${this.origin}/m/pair#p=${current.secret}`;
  }

  pairingExpiry(): number | null {
    return this.pairing.current(this.clock())?.expiresAt ?? null;
  }

  async status(): Promise<RemoteStatus> {
    const devices = await listDevices(this.deps.store, this.deps.tenant);
    const device = devices.find((candidate) => candidate.revoked_at === null && candidate.generation === this.pairing.generation) ?? null;
    const now = this.clock();
    const expiresAt = this.pairingExpiry();
    let state: RemoteStatus["state"];
    if (!this.pairing.isEnabled) state = "off";
    else if (device !== null) state = (await this.connected(device.device_id, now)) ? "connected" : "restoring";
    else state = expiresAt === null ? "expired" : "waiting";
    return {
      state,
      generation: this.pairing.generation,
      expires_at: expiresAt,
      device: device === null ? null : { label: device.label, paired_at: device.created_at, last_seen: device.last_seen },
      public_url: this.settings.publicUrl,
      reachable: this.reachability(),
    };
  }

  /** Self-check of the public URL's health path. Cached for thirty seconds; never blocks a page for longer than three. */
  async checkReachable(): Promise<void> {
    if (this.settings.publicUrl === null) return;
    const now = this.clock();
    if (this.reach !== null && now - this.reach.at < 30_000) return;
    let ok = false;
    try {
      const response = await fetch(`${this.settings.publicUrl}/m/health`, { signal: AbortSignal.timeout(3000), redirect: "manual" });
      ok = response.ok;
    } catch {
      ok = false;
    }
    this.reach = { at: now, ok };
  }

  private reachability(): RemoteStatus["reachable"] {
    if (this.settings.publicUrl === null) return "not_checked";
    if (this.reach === null) return "not_checked";
    return this.reach.ok ? "ok" : "failed";
  }

  /**
   * The phone's session, if any. The identity service refuses a revoked or expired session, an inactive
   * operator and a stale generation; on top of that the session's device must be this generation's
   * live device in the device ledger.
   */
  private async sessionOf(request: Request): Promise<ResolvedSession | null> {
    const resolved = await this.deps.identity.resolveSession(cookieOf(request));
    if (resolved === undefined || resolved.session.deviceId === null) return null;
    if (resolved.operator.tenant !== this.deps.identityTenant) return null;
    const device = await this.liveDevice();
    if (device === null || device.device_id !== resolved.session.deviceId) return null;
    return resolved;
  }

  async handle(request: Request): Promise<Response> {
    try {
      return await this.route(request);
    } catch (error) {
      // Errors never echo a secret, a token or a stack trace to the phone.
      return refusal(500, "internal", "REMOTE: the request could not be completed");
    }
  }

  private async route(request: Request): Promise<Response> {
    const now = this.clock();
    const url = new URL(request.url);
    if (!this.allowedHosts().includes(request.headers.get("host") ?? "")) return refusal(403, "forbidden_host", "REMOTE: the Host header does not name this remote");
    if (request.method === "POST" && request.headers.get("origin") !== this.origin) {
      return refusal(403, "forbidden_origin", "REMOTE: the Origin is not this remote");
    }
    const nonce = randomBytes(16).toString("base64");
    const path = url.pathname;
    if (request.method === "GET" && (path === "/m" || path === "/m/")) return html(phonePage(nonce), nonce);
    if (request.method === "GET" && path === "/m/pair") return html(pairPage(nonce), nonce);
    if (request.method === "GET" && path === "/m/health") return json(200, { status: "ok", remote: REMOTE_SCHEMA });

    if (request.method === "POST" && path === "/m/api/pair/redeem") {
      if (!this.limiter.allow("redeem", 10, 60_000, now)) return refusal(429, "rate_limited", "REMOTE: too many attempts, wait a minute");
      const body = await bodyOf(request);
      const result = this.pairing.redeem(body?.secret, now);
      if (!result.ok) {
        if (result.reason === "off") return refusal(409, "remote_off", "Remote control is off on the desktop.");
        if (result.reason === "used") return refusal(410, "pairing_used", "This link was already used.");
        if (result.reason === "expired") return refusal(410, "pairing_expired", "This link has expired. Refresh the QR on your desktop and scan again.");
        return refusal(401, "pairing_invalid", "This link is not valid. Refresh the QR on your desktop and scan again.");
      }
      const options = registrationOptions({ challenge: result.challenge, rpId: this.rpId, rpName: "Horizon", userId: hashed(`${this.deps.tenant}/${this.deps.operator}`).slice(0, 16), userName: this.deps.operator });
      return json(200, { ticket: result.ticket, options, expires_at: result.expiresAt });
    }

    if (request.method === "POST" && path === "/m/api/pair/finish") {
      if (!this.limiter.allow("finish", 10, 60_000, now)) return refusal(429, "rate_limited", "REMOTE: too many attempts, wait a minute");
      const body = await bodyOf(request);
      const challenge = this.pairing.takeChallenge(body?.ticket, "register", now);
      if (challenge === null) return refusal(410, "challenge_expired", "The passkey request expired. Scan the QR on your desktop again.");
      try {
        const verified = verifyRegistration(body?.credential as Parameters<typeof verifyRegistration>[0], { challenge, origin: this.origin, rpId: this.rpId });
        // A verified passkey proves the phone holds a new credential. It authorizes nothing. The enrolment is held
        // until the operator types the code the desk shows on its own terminal, which names this phone and the
        // controllers it would replace. Nothing is enrolled, and no session is granted, until then.
        const requested = await this.deps.enrollment.request({
          tenant: this.deps.tenant,
          operator: this.deps.operator,
          generation: this.pairing.generation,
          label: labelOf(request.headers.get("user-agent")),
          registration: verified,
          replaces: await this.activeDeviceIds(),
          requested_at: new Date(now).toISOString(),
        });
        if (!requested.ok) return refusal(409, "no_operator_terminal", requested.message);
        return json(202, { status: "awaiting_operator_authorization", pending_id: requested.pendingId, expires_at: requested.expiresAt });
      } catch (error) {
        const message = error instanceof WebAuthnError ? error.message : error instanceof IdentityError ? `Pairing refused: ${error.message}` : "The passkey could not be registered.";
        return refusal(400, "passkey_refused", message);
      }
    }

    if (request.method === "POST" && path === "/m/api/pair/await") {
      if (!this.limiter.allow("await", 60, 60_000, now)) return refusal(429, "rate_limited", "REMOTE: too many attempts, wait a minute");
      if (!this.pairing.isEnabled) return refusal(409, "remote_off", "Remote control is off on the desktop.");
      const body = await bodyOf(request);
      const pendingId = typeof body?.pending_id === "string" ? body.pending_id : "";
      // The commit: applies the operator's confirmation exactly once, after checking the request is still the one
      // the operator saw. Only this writes an active controller, and only after that check.
      const committed = await this.deps.enrollment.commit({
        pendingId,
        tenant: this.deps.tenant,
        operator: this.deps.operator,
        generation: this.pairing.generation,
        currentControllers: await this.activeDeviceIds(),
        now: new Date(now),
      });
      if (!committed.ok) {
        if (committed.code === "not_authorized") return json(202, { status: "awaiting_operator_authorization" });
        if (committed.code === "stale") return refusal(409, "controller_changed", "The desktop's controller changed while this phone waited. Refresh the QR on your desktop and scan again.");
        if (committed.code === "expired") return refusal(410, "authorization_expired", "The desktop did not authorize this phone in time. Refresh the QR on your desktop and scan again.");
        return refusal(410, "authorization_used", "This authorization was already used or is not valid. Refresh the QR on your desktop and scan again.");
      }
      const { registration, label } = committed.request;
      try {
        // One active controller, bound to one durable operator that the cockpit's session approved. The identity
        // service revokes the previous device and its sessions in the same commit that enrols this one; it refuses
        // when the operator does not exist or is not active, so the link cannot create an operator or grant a role.
        const at = new Date(now).toISOString();
        const enrolled = await this.deps.identity.replaceDevices({ tenant: this.deps.identityTenant, operatorId: this.deps.operator, label, registration });
        for (const stale of await listDevices(this.deps.store, this.deps.tenant)) {
          if (stale.revoked_at === null) await updateDevice(this.deps.store, stale.device_id, { revoked_at: at });
        }
        this.commands.clear();
        const device: RemoteDevice = {
          device_id: enrolled.device.id,
          credential_id: registration.credentialId,
          public_key: registration.publicKey,
          sign_count: registration.signCount,
          label,
          generation: this.pairing.generation,
          tenant: this.deps.tenant,
          operator: this.deps.operator,
          created_at: at,
          last_seen: at,
          revoked_at: null,
        };
        await addDevice(this.deps.store, device);
        await auditRemote(this.deps.store, { tenant: this.deps.tenant, operator: this.deps.operator, device_id: device.device_id, action: "pair", outcome: "authorized", at });
        return json(200, { ok: true, label: device.label }, { "set-cookie": sessionCookie(enrolled.session.token) });
      } catch (error) {
        const message = error instanceof IdentityError ? `Pairing refused: ${error.message}` : "The passkey could not be registered.";
        return refusal(400, "passkey_refused", message);
      }
    }

    if (request.method === "POST" && path === "/m/api/auth/options") {
      if (!this.limiter.allow("auth", 20, 60_000, now)) return refusal(429, "rate_limited", "REMOTE: too many attempts, wait a minute");
      if (!this.pairing.isEnabled) return refusal(409, "remote_off", "Remote control is off on the desktop.");
      const device = await this.liveDevice();
      if (device === null) return refusal(404, "not_paired", "No phone is paired with this desktop. Scan a new QR on the desktop.");
      const challenge = newChallenge();
      const ticket = this.pairing.issueChallenge(challenge, "auth", now);
      return json(200, { ticket, options: assertionOptions({ challenge, rpId: this.rpId, credentialIds: [device.credential_id] }) });
    }

    if (request.method === "POST" && path === "/m/api/auth/finish") {
      if (!this.limiter.allow("auth", 20, 60_000, now)) return refusal(429, "rate_limited", "REMOTE: too many attempts, wait a minute");
      if (!this.pairing.isEnabled) return refusal(409, "remote_off", "Remote control is off on the desktop.");
      const body = await bodyOf(request);
      const challenge = this.pairing.takeChallenge(body?.ticket, "auth", now);
      const device = await this.liveDevice();
      const credential = body?.credential as Parameters<IdentityService["authenticateDevice"]>[0]["credential"] | undefined;
      if (challenge === null || device === null || credential === undefined || (credential as { id?: unknown }).id !== device.credential_id) {
        return refusal(401, "passkey_refused", "The passkey was not recognised for this desktop. Try again.");
      }
      try {
        const issued = await this.deps.identity.authenticateDevice({
          credentialId: device.credential_id,
          credential: credential as Parameters<IdentityService["authenticateDevice"]>[0]["credential"],
          challenge,
          relyingParty: { rpId: this.rpId, origin: this.origin },
        });
        await updateDevice(this.deps.store, device.device_id, { last_seen: new Date(now).toISOString() });
        return json(200, { ok: true }, { "set-cookie": sessionCookie(issued.token) });
      } catch (error) {
        const message = error instanceof WebAuthnError ? error.message : error instanceof IdentityError ? `Sign-in refused: ${error.message}` : "The passkey could not be verified.";
        return refusal(401, "passkey_refused", message);
      }
    }

    if (request.method === "POST" && path === "/m/api/signout") {
      const current = await this.deps.identity.resolveSession(cookieOf(request));
      if (current !== undefined) await this.deps.identity.revokeSession(current.session.sid, "signed out");
      return json(200, { ok: true }, { "set-cookie": clearedCookie() });
    }

    if (path.startsWith("/m/api/")) return this.authenticated(request, path, now);
    return refusal(404, "not_found", "REMOTE: no such route");
  }

  private async authenticated(request: Request, path: string, now: number): Promise<Response> {
    if (!this.pairing.isEnabled) return refusal(409, "remote_off", "Remote control is off on the desktop.");
    const session = await this.sessionOf(request);
    if (session === null) return refusal(401, "not_signed_in", "Use your passkey to continue.");
    if (request.method === "GET" && path === "/m/api/state") return json(200, await this.snapshot(session));
    if (request.method === "GET" && path === "/m/api/events") return this.events(request, session);
    if (request.method === "POST" && path === "/m/api/command") return this.command(request, session, now);
    return refusal(404, "not_found", "REMOTE: no such route");
  }

  /** The phone's home: the same canonical reads the cockpit makes, shaped for a narrow screen. */
  private async snapshot(session: ResolvedSession): Promise<unknown> {
    const data = await this.deps.workspace();
    const chrome = await this.deps.chrome();
    const device = (await listDevices(this.deps.store, this.deps.tenant)).find((candidate) => candidate.device_id === session.session.deviceId) ?? null;
    const moves: readonly WorkspaceMove[] = chrome.moves;
    return {
      schema: REMOTE_SCHEMA,
      position: await this.deps.position(),
      device: device === null ? null : { label: device.label, paired_at: device.created_at, last_seen: device.last_seen },
      status: chrome.status,
      open_case: chrome.openCase,
      frame: { frame_id: data.frame.frame_id, revision: data.frame.revision },
      actions: data.view.actions
        .filter((action) => action.posture === "offered" && action.affordance === "available")
        .map((action) => ({ action_id: action.action_id, label: action.label, operation: action.operation, consequential: action.consequential })),
      decisions: moves.filter((move) => move.approval_id !== null && move.decided.state === "awaiting"),
      moves: moves.slice(0, 20),
    };
  }

  /**
   * Server-sent events. A record write (a case, a skip) does not move the event store, so the change
   * signal is the store position plus a digest of the cockpit state the phone shows; `id` carries both,
   * and a reconnect with the same `Last-Event-ID` is not told again. A revoked session is told so and
   * the stream closes. A heartbeat every 5s keeps a quiet stream under Bun's 10s idle timeout.
   */
  private events(request: Request, session: ResolvedSession): Response {
    const encoder = new TextEncoder();
    let sent = request.headers.get("last-event-id") ?? "";
    let timer: ReturnType<typeof setInterval> | null = null;
    let beat = 0;
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const write = (text: string) => controller.enqueue(encoder.encode(text));
        const tick = async () => {
          const current = await this.sessionOf(request);
          if (current === null || current.session.sid !== session.session.sid) {
            write("event: revoked\ndata: {}\n\n");
            if (timer !== null) clearInterval(timer);
            controller.close();
            return;
          }
          beat += 1;
          const position = await this.deps.position();
          const digest = createHash("sha256").update(JSON.stringify(await this.deps.chrome())).digest("hex").slice(0, 16);
          const marker = `${position}-${digest}`;
          if (marker !== sent) {
            sent = marker;
            write(`id: ${marker}\nevent: state\ndata: ${JSON.stringify({ position })}\n\n`);
          } else if (beat % 5 === 0) {
            write(": heartbeat\n\n");
          }
        };
        write("retry: 1000\n\n");
        void tick();
        timer = setInterval(() => void tick().catch(() => undefined), 1000);
      },
      cancel: () => {
        if (timer !== null) clearInterval(timer);
      },
    });
    return new Response(stream, { headers: { ...SECURITY_HEADERS, "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" } });
  }

  /** One command at a time through the commit path: a second submission sees the frame the first one moved. */
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const run = this.commitChain.then(work, work);
    this.commitChain = run.catch(() => undefined);
    return run;
  }

  /** One command: validated, dedup'd by command id (also while the first is in flight), and answered with its distinct claims. */
  private async command(request: Request, session: ResolvedSession, now: number): Promise<Response> {
    const sid = session.session.sid;
    if (!this.limiter.allow(`command:${sid}`, 60, 60_000, now)) return refusal(429, "rate_limited", "REMOTE: too many commands, wait a minute");
    const body = await bodyOf(request);
    const commandId = typeof body?.command_id === "string" ? body.command_id : "";
    if (!COMMAND_ID.test(commandId)) return refusal(400, "invalid_argument", "REMOTE: command_id must be a UUID");
    // The actor is the session's, from the durable operator record and the configured mapping. A request that
    // names one is refused outright rather than quietly ignored.
    const named = reservedActorField(body);
    if (body !== null && named !== null) return refusal(400, "forbidden_field", `REMOTE: a request cannot name its own actor (${named}); the actor comes from the signed-in session`);
    const perSession = this.commands.get(sid) ?? new Map<string, Promise<{ readonly status: number; readonly body: unknown }>>();
    this.commands.set(sid, perSession);
    const seen = perSession.get(commandId);
    if (seen !== undefined) {
      const replay = await seen;
      return json(replay.status, replay.body);
    }
    let settle!: (value: { readonly status: number; readonly body: unknown }) => void;
    perSession.set(commandId, new Promise((resolve) => (settle = resolve)));
    const reply = async (status: number, accepted: boolean, outcome: Outcome) => {
      const payload = { command_id: commandId, received: true, accepted, outcome };
      settle({ status, body: payload });
      return json(status, payload);
    };
    try {
      return await this.execute(body, session, now, reply);
    } catch (error) {
      perSession.delete(commandId);
      settle({ status: 500, body: { command_id: commandId, received: true, accepted: false, outcome: { state: "refused", code: "internal", message: "REMOTE: the command could not be completed" } } });
      throw error;
    }
  }

  private async execute(body: Record<string, unknown> | null, session: ResolvedSession, now: number, reply: (status: number, accepted: boolean, outcome: Outcome) => Promise<Response>): Promise<Response> {
    const who = this.callerOf(session);
    const kind = body?.kind;
    const namedKind = typeof kind === "string" ? kind : "";
    // The command route is a dispatcher: the phone names a kind, and the catalog says which
    // operation that kind performs. A kind or a pair the catalog does not list is Px and is
    // refused before any effect runs (R3-01, R3-02).
    const phase = typeof body?.phase === "string" ? body.phase : null;
    let resolved: { readonly operation: string; readonly class: string; readonly fields: readonly string[]; readonly refusal: FrozenRefusal | null } | null;
    try {
      resolved = this.deps.resolveCommand(namedKind, phase);
    } catch (error) {
      return reply(503, false, { state: "refused", code: "unavailable", message: `REMOTE: the identity catalog could not be loaded, so nothing was done (${error instanceof Error ? error.message : String(error)}).` });
    }
    if (resolved === null) {
      const message = namedKind === "settle" ? "REMOTE: that settlement is not one Horizon knows. Nothing was done." : "REMOTE: that command is not one Horizon knows. Nothing was done.";
      return reply(400, false, { state: "refused", code: "px", message });
    }
    const operation = resolved.operation;
    // Containment: a device credential may not reach a governed row. A governed row needs the
    // operation-bound pending record, the protected confirmation and its own A3-UV evidence, and
    // the remote path has none of them: the phone's credential proves which enrolled device is
    // at the route, never which person is holding it. The command is refused rather than
    // downgraded to something the device's session can do on its own (R3-01, R4-02).
    //
    // The refusal the catalog states is the refusal the command answers with (R5-01). The class
    // check below stays as a backstop for a catalog that stopped refusing a governed row: a row
    // this route cannot support is refused, never run.
    if (resolved.refusal !== null) {
      // A governed row is refused because the protected confirmation cannot exist on the phone. A
      // P0/P1 row is refused for its own stated reason — the commit row's is the missing
      // device-attributed delegation — and answers in the catalog's own words (R5-03).
      const governed = resolved.class === "P2" || resolved.class === "P3";
      await this.audit(session, namedKind, governed ? "refused:no_protected_confirmation_path" : `refused:catalog:${resolved.operation}`, now);
      return reply(
        403,
        false,
        governed
          ? { state: "refused", code: "no_protected_confirmation_path", message: "REMOTE: that action can only be taken on the desktop, where the confirmation is protected. Nothing was done." }
          : { state: "refused", code: "refused", message: refusalWords(resolved.refusal) },
      );
    }
    if (resolved.class === "P2" || resolved.class === "P3") {
      await this.audit(session, namedKind, "refused:no_protected_confirmation_path", now);
      return reply(403, false, { state: "refused", code: "no_protected_confirmation_path", message: "REMOTE: that action can only be taken on the desktop, where the confirmation is protected. Nothing was done." });
    }
    // The body has a closed vocabulary: the dispatch envelope plus the fields the resolved
    // operation's schema names. A field nothing names is refused rather than ignored, so a
    // caller never believes an unnamed field was read (R4-07).
    const extra = unknownField(body, ["command_id", "kind", "phase", ...resolved.fields]);
    if (extra !== null) {
      await this.audit(session, namedKind, `refused:unknown_field:${extra}`, now);
      return reply(400, false, { state: "refused", code: "unknown_field", message: `REMOTE: that command does not take ${extra}. Nothing was done.` });
    }
    if (operation === "device.case.open") {
      const check = checkPurpose(body?.purpose);
      if (!check.ok) return reply(400, false, { state: "refused", code: check.code, message: check.code === "empty" ? "Write the purpose in one line." : "The purpose is longer than 200 characters." });
      await this.deps.openCase(check.purpose, who, this.attributionOf(session));
      await this.audit(session, "open_case", "accepted", now);
      return reply(200, true, { state: "done", receipt: null });
    }
    if (operation === "device.surface.intent.commit") {
      return this.serial(async () => {
        const data = await this.deps.workspace();
        if (body?.frame_id !== data.frame.frame_id || String(body?.frame_revision) !== String(data.frame.revision)) {
          return reply(409, false, { state: "refused", code: "stale_surface", message: "The desktop has moved on. Refresh the phone and choose again." });
        }
        const action = data.view.actions.find((candidate) => candidate.action_id === body?.action_id);
        if (action === undefined || action.posture !== "offered" || action.affordance !== "available") {
          return reply(409, false, { state: "refused", code: "not_available", message: "That move is no longer available." });
        }
        const intentId = randomUUID();
        const result = await this.deps.commitAction(action.action_id, intentId, who, this.attributionOf(session));
        if (!result.ok && result.code !== "awaiting_authority") {
          await this.audit(session, "commit", `refused:${result.code}`, now);
          return reply(409, false, { state: "refused", code: result.code, message: result.message });
        }
        const receipt = (await this.deps.chrome(intentId)).receipt;
        await this.audit(session, "commit", result.ok ? "accepted" : "awaiting", now);
        return reply(200, true, { state: result.ok ? "done" : "waiting", intent_id: intentId, receipt });
      });
    }
    if (operation === "device.settlement.observe" || operation === "device.settlement.rule" || operation === "horizon.settlement.observe" || operation === "horizon.settlement.rule") {
      // Unreachable while the catalog holds: the settlement rows the phone's command selects are
      // device-credential rows, and a device credential may not reach a governed row. The branch
      // is kept as a backstop so a catalog that drifted back to the shared rows still refuses the
      // settlement rather than calling SEA-Forge's final settlement from a device session.
      return reply(403, false, { state: "refused", code: "no_protected_confirmation_path", message: "REMOTE: that action can only be taken on the desktop, where the confirmation is protected. Nothing was done." });
    }
    return reply(400, false, { state: "refused", code: "px", message: "REMOTE: that command is not one Horizon knows. Nothing was done." });
  }

  private async audit(session: ResolvedSession, action: string, outcome: string, now: number): Promise<void> {
    await auditRemote(this.deps.store, { tenant: this.deps.tenant, operator: session.session.operatorId, device_id: session.session.deviceId ?? session.session.sid, action, outcome, at: new Date(now).toISOString() });
  }

}
