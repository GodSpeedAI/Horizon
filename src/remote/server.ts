/**
 * The phone remote: a second, loopback-only listener that serves the phone pages and a JSON + SSE
 * API. It never accepts the launch secret, never uses the cockpit's Host allowlist, and every
 * request except pairing carries a passkey-backed session. Decisions are made by the same
 * application functions the cockpit uses; this file only authenticates and shapes the exchange.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Server } from "bun";
import type { DurableStore } from "@godspeedai/cognate-events";
import { auditRemote, addDevice, listDevices, updateDevice, type RemoteDevice } from "../capabilities/remote-records.ts";
import { checkPurpose } from "../capabilities/workspace-records.ts";
import type { WorkspaceChrome, WorkspaceMove, WorkspaceReceipt } from "../ui/workspace/model.ts";
import { Pairing } from "./pairing.ts";
import { Sessions, clearedCookie, cookieOf, sessionCookie, type Session } from "./sessions.ts";
import { assertionOptions, newChallenge, registrationOptions, verifyAssertion, verifyRegistration, WebAuthnError } from "./webauthn.ts";
import { phonePage, pairPage } from "./phone.ts";
import type { RemoteSettings } from "./settings.ts";

export const REMOTE_SCHEMA = "horizon.remote/1";
const BODY_LIMIT = 16 * 1024;
const COMMAND_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** What the listener needs from the application: reads, and the same write paths the cockpit uses. */
export interface RemoteDeps {
  readonly store: DurableStore;
  readonly tenant: string;
  readonly operator: string;
  /** The cockpit's default read: frame, closed surface view and its actions. */
  readonly workspace: () => Promise<{
    readonly frame: { readonly frame_id: string; readonly revision: number };
    readonly view: { readonly actions: readonly { readonly action_id: string; readonly label: string; readonly operation: string; readonly posture: string; readonly affordance: string; readonly consequential: boolean }[] };
  }>;
  readonly chrome: (receipt?: string | null) => Promise<WorkspaceChrome>;
  readonly position: () => Promise<number>;
  readonly approvalIntent: (approvalId: string) => Promise<string | null>;
  /** Throws when SEA-Forge refuses; a rejected commit is audited and throws by design. */
  readonly resolveApproval: (approvalId: string, resolution: "approved" | "rejected") => Promise<void>;
  /** The cockpit's commit of one offered action, under the operator's identity. */
  readonly commitAction: (actionId: string, intentId: string) => Promise<{ readonly ok: true } | { readonly ok: false; readonly code: string; readonly message: string }>;
  readonly settle: (intentId: string, phase: "observe" | "rule") => Promise<void>;
  readonly openCase: (purpose: string) => Promise<void>;
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
  private readonly sessions = new Sessions();
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

  private async revokeDevices(at: string): Promise<void> {
    for (const device of await listDevices(this.deps.store, this.deps.tenant)) {
      if (device.revoked_at === null) await updateDevice(this.deps.store, device.device_id, { revoked_at: at });
    }
  }

  /** Bind the loopback listener and open a pairing link. Old devices stay revoked from any earlier stop. */
  async start(): Promise<void> {
    if (this.server !== null) return;
    const now = this.clock();
    const floor = Math.max(0, ...(await listDevices(this.deps.store, this.deps.tenant)).map((device) => device.generation));
    this.server = Bun.serve({ hostname: "127.0.0.1", port: this.settings.port, fetch: (request) => this.handle(request) });
    this.pairing.start(now, floor);
  }

  /** New link, new generation: every prior link, credential and session is revoked at once. */
  async refresh(): Promise<void> {
    if (this.server === null) return;
    const at = new Date(this.clock()).toISOString();
    await this.revokeDevices(at);
    this.sessions.clear();
    this.pairing.refresh(this.clock());
  }

  /** Generation bump and listener closed: immediate revocation. */
  async stop(): Promise<void> {
    const at = new Date(this.clock()).toISOString();
    this.pairing.stop();
    this.sessions.clear();
    await this.revokeDevices(at);
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
    else if (device !== null) state = this.sessions.connected(device.device_id, this.pairing.generation, now) ? "connected" : "restoring";
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

  /** The phone's session, if any: this generation, this device, not expired. */
  private sessionOf(request: Request): Session | null {
    return this.sessions.get(cookieOf(request), this.pairing.generation, this.clock());
  }

  async handle(request: Request): Promise<Response> {
    try {
      return await this.route(request);
    } catch {
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
      const options = registrationOptions({ challenge: result.challenge, rpId: this.rpId, userId: hashed(`${this.deps.tenant}/${this.deps.operator}`).slice(0, 16), userName: this.deps.operator });
      return json(200, { ticket: result.ticket, options, expires_at: result.expiresAt });
    }

    if (request.method === "POST" && path === "/m/api/pair/finish") {
      if (!this.limiter.allow("finish", 10, 60_000, now)) return refusal(429, "rate_limited", "REMOTE: too many attempts, wait a minute");
      const body = await bodyOf(request);
      const challenge = this.pairing.takeChallenge(body?.ticket, "register", now);
      if (challenge === null) return refusal(410, "challenge_expired", "The passkey request expired. Scan the QR on your desktop again.");
      try {
        const verified = verifyRegistration(body?.credential as Parameters<typeof verifyRegistration>[0], { challenge, origin: this.origin, rpId: this.rpId });
        // One active controller: the previous device is revoked and its sessions dropped before the new one exists.
        const at = new Date(now).toISOString();
        await this.revokeDevices(at);
        this.sessions.clear();
        const device: RemoteDevice = {
          device_id: randomUUID(),
          credential_id: verified.credentialId,
          public_key: verified.publicKey,
          sign_count: verified.signCount,
          label: labelOf(request.headers.get("user-agent")),
          generation: this.pairing.generation,
          tenant: this.deps.tenant,
          operator: this.deps.operator,
          created_at: at,
          last_seen: at,
          revoked_at: null,
        };
        await addDevice(this.deps.store, device);
        const token = this.sessions.open(device.device_id, this.pairing.generation, now);
        await auditRemote(this.deps.store, { tenant: this.deps.tenant, operator: this.deps.operator, device_id: device.device_id, action: "pair", outcome: "registered", at });
        return json(200, { ok: true, label: device.label }, { "set-cookie": sessionCookie(token) });
      } catch (error) {
        const message = error instanceof WebAuthnError ? error.message : "The passkey could not be registered.";
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
      const credential = body?.credential as Parameters<typeof verifyAssertion>[0] | undefined;
      if (challenge === null || device === null || credential === undefined || (credential as { id?: unknown }).id !== device.credential_id) {
        return refusal(401, "passkey_refused", "The passkey was not recognised for this desktop. Try again.");
      }
      try {
        const asserted = await verifyAssertion(credential, { challenge, origin: this.origin, rpId: this.rpId, publicKey: device.public_key, signCount: device.sign_count });
        await updateDevice(this.deps.store, device.device_id, { sign_count: asserted.signCount, last_seen: new Date(now).toISOString() });
        const token = this.sessions.open(device.device_id, this.pairing.generation, now);
        return json(200, { ok: true }, { "set-cookie": sessionCookie(token) });
      } catch (error) {
        const message = error instanceof WebAuthnError ? error.message : "The passkey could not be verified.";
        return refusal(401, "passkey_refused", message);
      }
    }

    if (request.method === "POST" && path === "/m/api/signout") {
      this.sessions.drop(cookieOf(request));
      return json(200, { ok: true }, { "set-cookie": clearedCookie() });
    }

    if (path.startsWith("/m/api/")) return this.authenticated(request, path, now);
    return refusal(404, "not_found", "REMOTE: no such route");
  }

  private async authenticated(request: Request, path: string, now: number): Promise<Response> {
    if (!this.pairing.isEnabled) return refusal(409, "remote_off", "Remote control is off on the desktop.");
    const session = this.sessionOf(request);
    if (session === null) return refusal(401, "not_signed_in", "Use your passkey to continue.");
    if (request.method === "GET" && path === "/m/api/state") return json(200, await this.snapshot(session));
    if (request.method === "GET" && path === "/m/api/events") return this.events(request, session);
    if (request.method === "POST" && path === "/m/api/command") return this.command(request, session, now);
    return refusal(404, "not_found", "REMOTE: no such route");
  }

  /** The phone's home: the same canonical reads the cockpit makes, shaped for a narrow screen. */
  private async snapshot(session: Session): Promise<unknown> {
    const data = await this.deps.workspace();
    const chrome = await this.deps.chrome();
    const device = (await listDevices(this.deps.store, this.deps.tenant)).find((candidate) => candidate.device_id === session.deviceId) ?? null;
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
  private events(request: Request, session: Session): Response {
    const encoder = new TextEncoder();
    let sent = request.headers.get("last-event-id") ?? "";
    let timer: ReturnType<typeof setInterval> | null = null;
    let beat = 0;
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const write = (text: string) => controller.enqueue(encoder.encode(text));
        const tick = async () => {
          const at = this.clock();
          if (this.sessions.get(cookieOf(request), this.pairing.generation, at) !== session) {
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

  /** One command: validated, dedup'd by command id, and answered with its distinct claims. */
  private async command(request: Request, session: Session, now: number): Promise<Response> {
    if (!this.limiter.allow(`command:${session.deviceId}`, 60, 60_000, now)) return refusal(429, "rate_limited", "REMOTE: too many commands, wait a minute");
    const body = await bodyOf(request);
    const commandId = typeof body?.command_id === "string" ? body.command_id : "";
    if (!COMMAND_ID.test(commandId)) return refusal(400, "invalid_argument", "REMOTE: command_id must be a UUID");
    const seen = session.commands.get(commandId);
    if (seen !== undefined) {
      const replay = seen as { status: number; body: unknown };
      return json(replay.status, replay.body);
    }
    const reply = async (status: number, accepted: boolean, outcome: Outcome) => {
      const payload = { command_id: commandId, received: true, accepted, outcome };
      session.commands.set(commandId, { status, body: payload });
      return json(status, payload);
    };
    const kind = body?.kind;
    if (kind === "open_case") {
      const check = checkPurpose(body?.purpose);
      if (!check.ok) return reply(400, false, { state: "refused", code: check.code, message: check.code === "empty" ? "Write the purpose in one line." : "The purpose is longer than 200 characters." });
      await this.deps.openCase(check.purpose);
      await this.audit(session, "open_case", "accepted", now);
      return reply(200, true, { state: "done", receipt: null });
    }
    if (kind === "commit") {
      const data = await this.deps.workspace();
      if (body?.frame_id !== data.frame.frame_id || String(body?.frame_revision) !== String(data.frame.revision)) {
        return reply(409, false, { state: "refused", code: "stale_surface", message: "The desktop has moved on. Refresh the phone and choose again." });
      }
      const action = data.view.actions.find((candidate) => candidate.action_id === body?.action_id);
      if (action === undefined || action.posture !== "offered" || action.affordance !== "available") {
        return reply(409, false, { state: "refused", code: "not_available", message: "That move is no longer available." });
      }
      const intentId = randomUUID();
      const result = await this.deps.commitAction(action.action_id, intentId);
      if (!result.ok && result.code !== "awaiting_authority") return reply(409, false, { state: "refused", code: result.code, message: result.message });
      const receipt = (await this.deps.chrome(intentId)).receipt;
      await this.audit(session, "commit", result.ok ? "accepted" : "awaiting", now);
      return reply(200, true, { state: result.ok ? "done" : "waiting", intent_id: intentId, receipt });
    }
    if (kind === "approve" || kind === "reject") {
      const approvalId = typeof body?.approval_id === "string" ? body.approval_id : "";
      const intentId = approvalId === "" ? null : await this.deps.approvalIntent(approvalId);
      if (intentId === null) return reply(404, false, { state: "refused", code: "not_found", message: "No escalated commit waits on this approval." });
      try {
        await this.deps.resolveApproval(approvalId, kind === "approve" ? "approved" : "rejected");
      } catch (error) {
        // A rejected commit fails by design and is audited; its receipt says so. Anything else is refused.
        if (!(error instanceof Error && error.message.startsWith("INTENT: governed commit refused"))) {
          return reply(409, false, { state: "refused", code: "approval_refused", message: "SEA-Forge did not accept this decision. Check the desktop." });
        }
      }
      await this.audit(session, kind, "decided", now);
      return reply(200, true, { state: "done", intent_id: intentId, receipt: (await this.deps.chrome(intentId)).receipt });
    }
    if (kind === "settle") {
      const intentId = typeof body?.intent_id === "string" ? body.intent_id : "";
      if (intentId === "") return reply(400, false, { state: "refused", code: "invalid_argument", message: "intent_id is required" });
      // Observation and the SEA-Forge ruling are separate requests, as on the desktop: a combined settle is not offered.
      const phase = body?.phase;
      if (phase !== "observe" && phase !== "rule") return reply(400, false, { state: "refused", code: "invalid_argument", message: "phase must be observe or rule" });
      try {
        await this.deps.settle(intentId, phase);
      } catch {
        return reply(409, false, { state: "refused", code: "settlement_refused", message: "Settlement was refused. The receipt on the desktop says why." });
      }
      await this.audit(session, "settle", "requested", now);
      return reply(200, true, { state: "done", intent_id: intentId, receipt: (await this.deps.chrome(intentId)).receipt });
    }
    return reply(400, false, { state: "refused", code: "invalid_argument", message: "REMOTE: kind must be open_case, commit, approve, reject or settle" });
  }

  private async audit(session: Session, action: string, outcome: string, now: number): Promise<void> {
    await auditRemote(this.deps.store, { tenant: this.deps.tenant, operator: this.deps.operator, device_id: session.deviceId, action, outcome, at: new Date(now).toISOString() });
  }

}
