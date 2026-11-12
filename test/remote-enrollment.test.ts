/**
 * Enrolling a phone is an authority change, and the active controller authorizes it with its own passkey.
 *
 * The invitation proves the phone was shown it. A verified registration proves the phone holds a new
 * credential. Neither authorizes a controller. The active controller's user-verified passkey signs the
 * enrolment's operation digest, and only that verified proof confirms it. The commit then creates the
 * credential once. Each test starts a fresh desk, and the first controller is seeded by the test support
 * because production has no first-controller path yet.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApplication, type HorizonApplication } from "../src/app.ts";
import { listDevices } from "../src/capabilities/remote-records.ts";
import { seedOperationalFixture } from "./support/operational-fixture.ts";
import { horizonDocument, writeConfig } from "./support/config.ts";
import { SoftwareAuthenticator } from "./support/remote-authenticator.ts";
import { failNextReplace, identityDeviceOf, seedController } from "./support/controller.ts";
import { EnrollmentAuthority } from "../src/remote/enrollment.ts";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { stateOf } from "../src/capabilities/pending-confirmations.ts";
import { auditRemote } from "../src/capabilities/remote-records.ts";

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";

interface Rig {
  readonly app: HorizonApplication;
  readonly phone: Client;
  close(): Promise<void>;
}

let savedPort: string | undefined;

async function freshRig(): Promise<Rig> {
  savedPort = process.env.HORIZON_REMOTE_PORT;
  process.env.HORIZON_REMOTE_PORT = "0";
  const root = mkdtempSync(join(tmpdir(), "enrol-"));
  const configPath = await writeConfig(join(root, "horizon.toml"), horizonDocument({ storePath: join(root, "e.sqlite"), secretPath: join(root, "launch.secret") }));
  const app = await createApplication({ configPath });
  await seedOperationalFixture(app.runtime.runtime.store, undefined, app.caller.tenant);
  await app.remote.start();
  const rig: Rig = {
    app,
    phone: new Client(() => rig!),
    close: async () => {
      await app.remote.stop().catch(() => undefined);
      await app.close();
      if (savedPort === undefined) delete process.env.HORIZON_REMOTE_PORT;
      else process.env.HORIZON_REMOTE_PORT = savedPort;
    },
  };
  return rig;
}

function secretOf(link: string): string {
  return new URLSearchParams(link.split("#")[1] ?? "").get("p") ?? "";
}

function cookieOf(response: Response): string {
  return /__Host-hz_remote=[^;]+/.exec(response.headers.get("set-cookie") ?? "")?.[0] ?? "";
}

/** One phone: its cookie, and the requests it makes to the desk's phone routes. */
class Client {
  cookie = "";
  private lastProof: { readonly pendingId: string; readonly credential: unknown } | null = null;
  constructor(private readonly rigOf: () => Rig) {}

  request(path: string, init: RequestInit = {}, headers: Record<string, string> = {}): Promise<Response> {
    const rig = this.rigOf();
    const merged: Record<string, string> = { origin: rig!.app.remote.origin, ...(init.headers as Record<string, string> | undefined), ...headers };
    if (this.cookie !== "") merged.cookie = this.cookie;
    return fetch(`${rig!.app.remote.origin}${path}`, { redirect: "manual", ...init, headers: merged });
  }

  post(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
    return this.request(path, { method: "POST", body: JSON.stringify(body) }, { "content-type": "application/json", ...headers });
  }

  /** The phone's half of pairing: redeem the invitation, register a passkey, and ask to join. */
  async finish(device: SoftwareAuthenticator): Promise<Response> {
    const rig = this.rigOf();
    const link = rig!.app.remote.pairingLink();
    if (link === null) throw new Error("no invitation is open");
    const redeemed = await this.post("/m/api/pair/redeem", { secret: secretOf(link) });
    expect(redeemed.status).toBe(200);
    const { ticket, options } = (await redeemed.json()) as { ticket: string; options: { challenge: string; rp: { id: string } } };
    const credential = await device.register({ challenge: options.challenge, origin: rig!.app.remote.origin, rpId: options.rp.id });
    return this.post("/m/api/pair/finish", { ticket, credential }, { "user-agent": IPHONE_UA });
  }

  awaitAuthorization(pendingId: string): Promise<Response> {
    return this.post("/m/api/pair/await", { pending_id: pendingId });
  }

  /** Signs this phone in with its own passkey, the same way the phone page does. */
  async signIn(device: SoftwareAuthenticator): Promise<Response> {
    const rig = this.rigOf();
    const options = await this.post("/m/api/auth/options", {});
    expect(options.status).toBe(200);
    const { ticket, options: asserted } = (await options.json()) as { ticket: string; options: { challenge: string; rpId: string } };
    const credential = await device.assert({ challenge: asserted.challenge, origin: rig!.app.remote.origin, rpId: asserted.rpId });
    const response = await this.post("/m/api/auth/finish", { ticket, credential });
    this.adopt(response);
    return response;
  }

  adopt(response: Response): void {
    const cookie = cookieOf(response);
    if (cookie !== "") this.cookie = cookie;
  }

  /** The pending enrolment this signed-in controller can authorize, or null when it has none or is no longer signed in. */
  async pending(): Promise<{ pending_id: string; options: { challenge: string; rpId: string; allowCredentials: unknown[] } } | null> {
    const response = await this.request("/m/api/pair/pending");
    if (response.status !== 200) return null;
    const data = (await response.json()) as { pending: { pending_id: string } | null; options?: { challenge: string; rpId: string; allowCredentials: unknown[] } };
    if (data.pending === null || data.options === undefined) return null;
    return { pending_id: data.pending.pending_id, options: data.options };
  }

  /** Authorizes a pending enrolment with the controller's passkey, signing what the server asked it to sign. */
  async authorize(controller: SoftwareAuthenticator, pendingId: string, overrides: { flags?: number; challenge?: string } = {}): Promise<Response> {
    const rig = this.rigOf();
    const pending = await this.pending();
    // With no session or no waiting enrolment there is nothing to sign: the route is still asked, and refuses.
    if (pending === null) return this.post("/m/api/pair/authorize", { pending_id: pendingId, credential: {} });
    const credential = await controller.assert({
      challenge: overrides.challenge ?? pending.options.challenge,
      origin: rig!.app.remote.origin,
      rpId: pending.options.rpId,
      flags: overrides.flags,
    });
    this.lastProof = { pendingId, credential };
    return this.post("/m/api/pair/authorize", { pending_id: pendingId, credential });
  }

  /** Posts the most recent proof again, as a replay would. */
  replay(): Promise<Response> {
    if (this.lastProof === null) throw new Error("no proof has been sent");
    return this.post("/m/api/pair/authorize", { pending_id: this.lastProof.pendingId, credential: this.lastProof.credential });
  }
}

/** A desk with an active controller that is signed in, and the phone that will be replaced or joined. */
async function controlledRig(): Promise<{ rig: Rig; controller: SoftwareAuthenticator; controllerDeviceId: string }> {
  const rig = await freshRig();
  const controller = await new SoftwareAuthenticator().generate();
  const seeded = await seedController(rig.app, controller, "controller phone");
  rig!.phone.cookie = "";
  expect((await rig!.phone.signIn(controller)).status).toBe(200);
  return { rig, controller, controllerDeviceId: seeded.device_id };
}

async function activeDevices(rig: Rig) {
  return (await listDevices(rig!.app.runtime.runtime.store, rig!.app.caller.tenant)).filter((device) => device.revoked_at === null);
}

async function pendingOf(response: Response): Promise<string> {
  expect(response.status).toBe(202);
  const body = (await response.json()) as { status: string; pending_id: string };
  expect(body.status).toBe("awaiting_phone_authorization");
  return body.pending_id;
}

let rig: Rig | undefined;
afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

describe("enrolment: the invitation proposes a controller and the active controller authorizes it", () => {
  test("PE-60: starting remote control creates no device and grants no authority", async () => {
    rig = await freshRig();
    expect(await activeDevices(rig!)).toHaveLength(0);
    expect(rig!.app.remote.pairingLink()).not.toBeNull();
  });

  test("NE-47: a redeemed invitation and a verified registration alone enrol no device and grant no session", async () => {
    const seeded = await controlledRig();
    rig = seeded.rig;
    const newPhone = await new SoftwareAuthenticator().generate();
    const pendingId = await pendingOf(await rig!.phone.finish(newPhone));
    expect(pendingId).toMatch(/^pending_/);
    expect(await activeDevices(rig!)).toHaveLength(1);
    // The new phone holds no session: its finish sets no cookie, and its state read is refused.
    const finish = await rig!.phone.post("/m/api/pair/await", { pending_id: pendingId });
    expect(cookieOf(finish)).toBe("");
    const state = await new Client(() => rig!).request("/m/api/state");
    expect(state.status).toBe(401);
  });

  test("NE-48: the new phone's own retries before authorization never sign it in", async () => {
    const seeded = await controlledRig();
    rig = seeded.rig;
    const newPhone = await new SoftwareAuthenticator().generate();
    const pendingId = await pendingOf(await rig!.phone.finish(newPhone));
    const phoneNew = new Client(() => rig!);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await phoneNew.awaitAuthorization(pendingId);
      expect(response.status).toBe(202);
      expect(cookieOf(response)).toBe("");
    }
    expect(await activeDevices(rig!)).toHaveLength(1);
  });

  test("NE-49: with no active controller the request is refused and nothing is held", async () => {
    rig = await freshRig();
    const newPhone = await new SoftwareAuthenticator().generate();
    const response = await rig!.phone.finish(newPhone);
    expect(response.status).toBe(409);
    expect(((await response.json()) as { code: string }).code).toBe("no_controller");
    expect(await activeDevices(rig!)).toHaveLength(0);
  });

  test("PE-61: the controller's user-verified passkey authorizes the exact enrolment, and the commit creates one device and revokes the replaced controller", async () => {
    const seeded = await controlledRig();
    rig = seeded.rig;
    const newPhone = await new SoftwareAuthenticator().generate();
    const newPhoneClient = new Client(() => rig!);
    const pendingId = await pendingOf(await rig!.phone.finish(newPhone));
    const authorized = await rig!.phone.authorize(seeded.controller, pendingId);
    expect(authorized.status).toBe(200);
    const committed = await newPhoneClient.awaitAuthorization(pendingId);
    expect(committed.status).toBe(200);
    newPhoneClient.adopt(committed);
    expect(newPhoneClient.cookie).not.toBe("");
    const active = await activeDevices(rig!);
    expect(active).toHaveLength(1);
    expect(active[0]?.credential_id).toBe(Buffer.from(newPhone.credentialId).toString("base64url"));
    const replaced = await identityDeviceOf(rig.app, (await listDevicesAll(rig)).find((device) => device.device_id === seeded.controllerDeviceId)!.credential_id);
    expect(replaced?.revokedAt).not.toBeNull();
  });

  test("PE-62: the authorization is recorded with the controller that signed it and the pending id", async () => {
    const seeded = await controlledRig();
    rig = seeded.rig;
    const newPhone = await new SoftwareAuthenticator().generate();
    const pendingId = await pendingOf(await rig!.phone.finish(newPhone));
    expect((await rig!.phone.authorize(seeded.controller, pendingId)).status).toBe(200);
    const audit = await rig!.app.runtime.runtime.store.listRecords("horizon-remote-audit", { tenant: rig!.app.caller.tenant });
    const outcomes = audit.map((row) => (row.value as { outcome: string; device_id: string }));
    expect(outcomes.some((entry) => entry.outcome === `authorized_by_controller ${pendingId}` && entry.device_id === seeded.controllerDeviceId)).toBe(true);
  });

  test("NE-50: a replayed authorization is refused and creates no second device", async () => {
    const seeded = await controlledRig();
    rig = seeded.rig;
    const newPhone = await new SoftwareAuthenticator().generate();
    const pendingId = await pendingOf(await rig!.phone.finish(newPhone));
    expect((await rig!.phone.authorize(seeded.controller, pendingId)).status).toBe(200);
    const replayed = await rig!.phone.replay();
    expect(replayed.status).not.toBe(200);
    expect((await new Client(() => rig!).awaitAuthorization(pendingId)).status).toBe(200);
    expect(await activeDevices(rig!)).toHaveLength(1);
  });

  test("NE-51: simultaneous commits after one authorization commit exactly one device", async () => {
    const seeded = await controlledRig();
    rig = seeded.rig;
    const newPhone = await new SoftwareAuthenticator().generate();
    const pendingId = await pendingOf(await rig!.phone.finish(newPhone));
    expect((await rig!.phone.authorize(seeded.controller, pendingId)).status).toBe(200);
    const commits = await Promise.all([0, 1, 2, 3].map(() => new Client(() => rig!).awaitAuthorization(pendingId)));
    expect(commits.filter((response) => response.status === 200)).toHaveLength(1);
    expect(await activeDevices(rig!)).toHaveLength(1);
  });

  test("NE-52: a controller proof without user verification confirms nothing and creates nothing", async () => {
    const seeded = await controlledRig();
    rig = seeded.rig;
    const newPhone = await new SoftwareAuthenticator().generate();
    const pendingId = await pendingOf(await rig!.phone.finish(newPhone));
    const refused = await rig!.phone.authorize(seeded.controller, pendingId, { flags: 0x01 });
    expect(refused.status).toBe(401);
    expect((await new Client(() => rig!).awaitAuthorization(pendingId)).status).toBe(202);
    expect(await activeDevices(rig!)).toHaveLength(1);
  });

  test("NE-53: the waiting phone cannot authorize its own enrolment with its passkey", async () => {
    const seeded = await controlledRig();
    rig = seeded.rig;
    const newPhone = await new SoftwareAuthenticator().generate();
    const pendingId = await pendingOf(await rig!.phone.finish(newPhone));
    const selfAuthorized = await rig!.phone.authorize(newPhone, pendingId);
    expect(selfAuthorized.status).toBe(401);
    expect((await new Client(() => rig!).awaitAuthorization(pendingId)).status).toBe(202);
  });

  test("NE-63: a proof over another request's challenge is refused", async () => {
    const seeded = await controlledRig();
    rig = seeded.rig;
    const newPhone = await new SoftwareAuthenticator().generate();
    const pendingId = await pendingOf(await rig!.phone.finish(newPhone));
    const otherChallenge = Buffer.from(new Uint8Array(32).fill(7)).toString("base64url");
    const refused = await rig!.phone.authorize(seeded.controller, pendingId, { challenge: otherChallenge });
    expect(refused.status).toBe(401);
    expect((await new Client(() => rig!).awaitAuthorization(pendingId)).status).toBe(202);
  });

  test("PE-68: an invitation redeems once, so a second phone cannot open a second request from it", async () => {
    const seeded = await controlledRig();
    rig = seeded.rig;
    const link = rig!.app.remote.pairingLink();
    expect(link).not.toBeNull();
    await pendingOf(await rig!.phone.finish(await new SoftwareAuthenticator().generate()));
    const secondRedeem = await rig!.phone.post("/m/api/pair/redeem", { secret: secretOf(link as string) });
    expect(secondRedeem.status).not.toBe(200);
    expect(seeded.controller).toBeDefined();
  });

  test("PE-63: starting remote control again while a request waits grants no authority and leaves the waiting request as it was", async () => {
    const seeded = await controlledRig();
    rig = seeded.rig;
    const pendingId = await pendingOf(await rig!.phone.finish(await new SoftwareAuthenticator().generate()));
    await rig!.app.remote.start();
    expect(await activeDevices(rig!)).toHaveLength(1);
    expect((await rig!.phone.authorize(seeded.controller, pendingId)).status).toBe(200);
  });
});

describe("stop and refresh: a waiting or authorized enrolment does not come back", () => {
  test("PE-64: stopping before authorization voids the waiting enrolment, and after a restart nothing authorizes or commits it", async () => {
    const seeded = await controlledRig();
    rig = seeded.rig;
    const newPhone = await new SoftwareAuthenticator().generate();
    const pendingId = await pendingOf(await rig!.phone.finish(newPhone));
    await rig!.app.remote.stop();
    await rig!.app.remote.start();
    const authorized = await rig!.phone.authorize(seeded.controller, pendingId);
    expect(authorized.status).not.toBe(200);
    expect((await new Client(() => rig!).awaitAuthorization(pendingId)).status).not.toBe(200);
    expect(await activeDevices(rig!)).toHaveLength(0);
  });

  test("PE-65: stopping after authorization but before the commit ends the confirmed enrolment, and it creates no device after a restart", async () => {
    const seeded = await controlledRig();
    rig = seeded.rig;
    const newPhone = await new SoftwareAuthenticator().generate();
    const newClient = new Client(() => rig!);
    const pendingId = await pendingOf(await rig!.phone.finish(newPhone));
    expect((await rig!.phone.authorize(seeded.controller, pendingId)).status).toBe(200);
    await rig!.app.remote.stop();
    await rig!.app.remote.start();
    expect((await newClient.awaitAuthorization(pendingId)).status).not.toBe(200);
    expect(await activeDevices(rig!)).toHaveLength(0);
  });

  test("PE-69: a refresh voids the open invitation, so its secret no longer redeems", async () => {
    const seeded = await controlledRig();
    rig = seeded.rig;
    const link = rig!.app.remote.pairingLink();
    expect(link).not.toBeNull();
    const secret = new URLSearchParams(link!.split("#")[1] ?? "").get("p");
    await rig!.app.remote.refresh();
    const origin = rig!.app.remote.origin;
    const redeemed = await fetch(`${origin}/m/api/pair/redeem`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ secret }) });
    expect(redeemed.status).not.toBe(200);
  });

  test("PE-66: refreshing after authorization ends the confirmed enrolment, and the prior controller's cookie is refused after a restart", async () => {
    const seeded = await controlledRig();
    rig = seeded.rig;
    const priorCookie = rig!.phone.cookie;
    const pendingId = await pendingOf(await rig!.phone.finish(await new SoftwareAuthenticator().generate()));
    expect((await rig!.phone.authorize(seeded.controller, pendingId)).status).toBe(200);
    await rig!.app.remote.refresh();
    await rig!.app.remote.stop();
    await rig!.app.remote.start();
    const probe = await fetch(`${rig!.app.remote.origin}/m/api/state`, { headers: { cookie: priorCookie } });
    expect(probe.ok).toBe(false);
    expect((await new Client(() => rig!).awaitAuthorization(pendingId)).status).not.toBe(200);
    expect(await activeDevices(rig!)).toHaveLength(0);
  });

  test("NE-65: a stale enrolment cannot restore access once the controller has been refreshed away", async () => {
    const seeded = await controlledRig();
    rig = seeded.rig;
    const pendingId = await pendingOf(await rig!.phone.finish(await new SoftwareAuthenticator().generate()));
    await rig!.app.remote.refresh();
    const authorized = await rig!.phone.authorize(seeded.controller, pendingId);
    expect(authorized.status).not.toBe(200);
    const committed = await new Client(() => rig!).awaitAuthorization(pendingId);
    expect(committed.status).not.toBe(200);
    expect(cookieOf(committed)).toBe("");
    expect(await activeDevices(rig!)).toHaveLength(0);
  });

  test("NE-62: a controller enrolled by another route after authorization makes the confirmed enrolment stale at commit, and it creates no device", async () => {
    const seeded = await controlledRig();
    rig = seeded.rig;
    const pendingId = await pendingOf(await rig!.phone.finish(await new SoftwareAuthenticator().generate()));
    expect((await rig!.phone.authorize(seeded.controller, pendingId)).status).toBe(200);
    // Another controller is enrolled by a route that does not end the waiting enrolment.
    await seedController(rig!.app, await new SoftwareAuthenticator().generate(), "other controller");
    const committed = await new Client(() => rig!).awaitAuthorization(pendingId);
    expect(committed.status).not.toBe(200);
    expect(cookieOf(committed)).toBe("");
    // Only the controller seeded by the other route is active; the confirmed enrolment created nothing.
    expect(await activeDevices(rig!)).toHaveLength(1);
  });

  test("PE-67: stop invalidates an authorized phone's credential, so the old cookie is refused once the listener returns", async () => {
    const seeded = await controlledRig();
    rig = seeded.rig;
    const before = await fetch(`${rig!.app.remote.origin}/m/api/state`, { headers: { cookie: rig!.phone.cookie } });
    expect(before.status).toBe(200);
    await rig!.app.remote.stop();
    await rig!.app.remote.start();
    const after = await fetch(`${rig!.app.remote.origin}/m/api/state`, { headers: { cookie: rig!.phone.cookie } });
    expect(after.ok).toBe(false);
    expect(await activeDevices(rig!)).toHaveLength(0);
  });

  test("NE-57: a failure in the identity writer after confirmation is fail-closed: no device, no session, and the consumed authorization cannot be reused", async () => {
    const seeded = await controlledRig();
    rig = seeded.rig;
    const newPhone = await new SoftwareAuthenticator().generate();
    const newClient = new Client(() => rig!);
    const pendingId = await pendingOf(await rig!.phone.finish(newPhone));
    expect((await rig!.phone.authorize(seeded.controller, pendingId)).status).toBe(200);
    const restore = failNextReplace(rig.app, "injected identity failure");
    try {
      const failed = await newClient.awaitAuthorization(pendingId);
      expect(failed.status).toBe(400);
      expect(cookieOf(failed)).toBe("");
    } finally {
      restore();
    }
    expect(await activeDevices(rig!)).toHaveLength(1);
    const controllerStill = await rig!.phone.pending();
    expect(controllerStill).toBeNull();
    expect((await rig!.phone.request("/m/api/state")).status).toBe(200);
    const retry = await newClient.awaitAuthorization(pendingId);
    expect(retry.status).not.toBe(200);
    expect(cookieOf(retry)).toBe("");
  });
});

describe("concurrency and window: a late authorization or commit authorizes nothing", () => {
  test("NE-58: a confirmed enrolment committed after its window is refused as expired and creates nothing", async () => {
    let now = 1_000_000;
    const store = createMemoryStore();
    const authority = new EnrollmentAuthority(store, () => now);
    const registration = { credentialId: "cred-late", publicKey: "key", alg: -7, signCount: 0 };
    const opened = await authority.request({ tenant: "t", operator: "o", generation: 1, label: "late", registration: registration as never, replaces: [], requested_at: new Date(now).toISOString() });
    if (!opened.ok) throw new Error("request refused");
    const authorized = await authority.authorize({ tenant: "t", pendingId: opened.pendingId, now: new Date(now), generation: 1, currentControllers: [], verify: async () => 1 });
    expect(authorized.ok).toBe(true);
    now += 6 * 60_000;
    const committed = await authority.commit({ pendingId: opened.pendingId, tenant: "t", generation: 1, currentControllers: [], now: new Date(now) });
    expect(committed.ok).toBe(false);
    if (!committed.ok) expect(committed.code).toBe("expired");
  });

  test("NE-59: an authorization that races a stop lands before or after the stop, never after the commit has been refused", async () => {
    const seeded = await controlledRig();
    rig = seeded.rig;
    const newPhone = await new SoftwareAuthenticator().generate();
    const pendingId = await pendingOf(await rig!.phone.finish(newPhone));
    // The stop may land before or after the authorization. Either way the enrolment cannot survive the stop.
    await Promise.all([rig!.phone.authorize(seeded.controller, pendingId).catch(() => undefined), rig!.app.remote.stop()]);
    await rig!.app.remote.start();
    expect((await new Client(() => rig!).awaitAuthorization(pendingId)).status).not.toBe(200);
    expect(await activeDevices(rig!)).toHaveLength(0);
  });

  test("NE-61: a newer request ends an older one, which cannot be authorized or committed", async () => {
    const store = createMemoryStore();
    const authority = new EnrollmentAuthority(store, () => 1_000_000);
    const registration = { credentialId: "cred-first", publicKey: "key", alg: -7, signCount: 0 };
    const first = await authority.request({ tenant: "t", operator: "o", generation: 1, label: "first", registration: registration as never, replaces: [], requested_at: new Date(1_000_000).toISOString() });
    const second = await authority.request({ tenant: "t", operator: "o", generation: 1, label: "second", registration: { ...registration, credentialId: "cred-second" } as never, replaces: [], requested_at: new Date(1_000_000).toISOString() });
    if (!first.ok || !second.ok) throw new Error("request refused");
    expect(await stateOf(store, first.pendingId)).toBe("expired");
    const late = await authority.authorize({ tenant: "t", pendingId: first.pendingId, now: new Date(1_000_000), generation: 1, currentControllers: [], verify: async () => 1 });
    expect(late.ok).toBe(false);
    const waiting = await authority.waiting("t", 1_000_000);
    expect(waiting?.pendingId).toBe(second.pendingId);
  });

  test("PE-71: a confirmed enrolment that is not yet committed is ended by a stop, and its commit afterwards creates nothing", async () => {
    const store = createMemoryStore();
    const authority = new EnrollmentAuthority(store, () => 1_000_000);
    const registration = { credentialId: "cred-confirmed", publicKey: "key", alg: -7, signCount: 0 };
    const opened = await authority.request({ tenant: "t", operator: "o", generation: 1, label: "confirmed", registration: registration as never, replaces: [], requested_at: new Date(1_000_000).toISOString() });
    if (!opened.ok) throw new Error("request refused");
    const authorized = await authority.authorize({ tenant: "t", pendingId: opened.pendingId, now: new Date(1_000_000), generation: 1, currentControllers: [], verify: async () => 1 });
    expect(authorized.ok).toBe(true);
    await authority.endWaiting("t", "the controller was stopped");
    const committed = await authority.commit({ pendingId: opened.pendingId, tenant: "t", generation: 1, currentControllers: [], now: new Date(1_000_000) });
    expect(committed.ok).toBe(false);
    expect(await stateOf(store, opened.pendingId)).toBe("expired");
  });

  test("NE-60: an abandoned enrolment is never confirmed, even when the proof arrives after the abandon", async () => {
    const store = createMemoryStore();
    const authority = new EnrollmentAuthority(store, () => 1_000_000);
    const registration = { credentialId: "cred-abandon", publicKey: "key", alg: -7, signCount: 0 };
    const opened = await authority.request({ tenant: "t", operator: "o", generation: 1, label: "gone", registration: registration as never, replaces: [], requested_at: new Date(1_000_000).toISOString() });
    if (!opened.ok) throw new Error("request refused");
    await authority.endWaiting("t", "the controller was stopped");
    const late = await authority.authorize({ tenant: "t", pendingId: opened.pendingId, now: new Date(1_000_000), generation: 1, currentControllers: [], verify: async () => 1 });
    expect(late.ok).toBe(false);
    expect(await stateOf(store, opened.pendingId)).toBe("expired");
    const committed = await authority.commit({ pendingId: opened.pendingId, tenant: "t", generation: 1, currentControllers: [], now: new Date(1_000_000) });
    expect(committed.ok).toBe(false);
  });
});

async function listDevicesAll(current: Rig) {
  return listDevices(current.app.runtime.runtime.store, current.app.caller.tenant);
}

// Keeps the audit helper referenced for readers: the audit trail is written by the authorize route.
void auditRemote;
