/**
 * Enrolling a phone is an authority change, so it needs the operator, not the invitation.
 *
 * The invitation (the pairing link) proves the phone was shown it. The passkey proves the phone
 * holds a new credential. Neither authorizes a controller. A verified registration waits for the
 * operator to type the one-time code the desk shows on its own terminal, and only that
 * confirmation commits the enrolment. Each test starts a fresh desk so no test depends on another.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApplication, type HorizonApplication } from "../src/app.ts";
import { addDevice, listDevices } from "../src/capabilities/remote-records.ts";
import { stateOf } from "../src/capabilities/pending-confirmations.ts";
import { seedOperationalFixture } from "./support/operational-fixture.ts";
import { horizonDocument, writeConfig } from "./support/config.ts";
import { SoftwareAuthenticator } from "./support/remote-authenticator.ts";
import { TestOperatorChannel } from "./support/operator-channel.ts";
import { Pairing, PAIRING_TTL_MS } from "../src/remote/pairing.ts";
import { identityStoreOf } from "../src/remote/identity-store.ts";
import { SESSIONS } from "@godspeed/identity";

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";

interface Rig {
  readonly app: HorizonApplication;
  readonly channel: TestOperatorChannel;
  readonly base: string;
  readonly phone: Client;
  close(): Promise<void>;
}

let savedPort: string | undefined;

async function freshRig(): Promise<Rig> {
  savedPort = process.env.HORIZON_REMOTE_PORT;
  process.env.HORIZON_REMOTE_PORT = "0";
  const root = mkdtempSync(join(tmpdir(), "enrol-"));
  const configPath = await writeConfig(join(root, "horizon.toml"), horizonDocument({ storePath: join(root, "e.sqlite"), secretPath: join(root, "launch.secret") }));
  const channel = new TestOperatorChannel();
  const app = await createApplication({ configPath, operatorChannel: channel });
  await seedOperationalFixture(app.runtime.runtime.store, undefined, app.caller.tenant);
  await app.remote.start();
  const base = app.remote.origin;
  const rig: Rig = {
    app,
    channel,
    base,
    phone: new Client(() => rig),
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

function sessionCookieOf(response: Response): string {
  return /__Host-hz_remote=[^;]+/.exec(response.headers.get("set-cookie") ?? "")?.[0] ?? "";
}

/** One phone: its cookie, and the requests it makes to the desk's phone routes. */
class Client {
  cookie = "";
  constructor(private readonly rigOf: () => Rig) {}

  request(path: string, init: RequestInit = {}, headers: Record<string, string> = {}): Promise<Response> {
    const rig = this.rigOf();
    const merged: Record<string, string> = { origin: rig.base, ...(init.headers as Record<string, string> | undefined), ...headers };
    if (this.cookie !== "") merged.cookie = this.cookie;
    return fetch(`${rig.base}${path}`, { redirect: "manual", ...init, headers: merged });
  }

  post(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
    return this.request(path, { method: "POST", body: JSON.stringify(body) }, { "content-type": "application/json", ...headers });
  }

  /** Redeems an invitation and registers a passkey: the phone's half of pairing. Returns the finish response. */
  async finish(device: SoftwareAuthenticator): Promise<Response> {
    const rig = this.rigOf();
    const link = rig.app.remote.pairingLink();
    if (link === null) throw new Error("no invitation is open");
    const redeemed = await this.post("/m/api/pair/redeem", { secret: secretOf(link) });
    expect(redeemed.status).toBe(200);
    const { ticket, options } = (await redeemed.json()) as { ticket: string; options: { challenge: string; rp: { id: string } } };
    const credential = await device.register({ challenge: options.challenge, origin: rig.base, rpId: options.rp.id });
    return this.post("/m/api/pair/finish", { ticket, credential }, { "user-agent": IPHONE_UA });
  }

  awaitAuthorization(pendingId: string): Promise<Response> {
    return this.post("/m/api/pair/await", { pending_id: pendingId });
  }

  adopt(response: Response): void {
    const cookie = sessionCookieOf(response);
    if (cookie !== "") this.cookie = cookie;
  }
}

/** The pending enrolment a finish response is waiting on. */
async function pendingOf(response: Response): Promise<string> {
  expect(response.status).toBe(202);
  const body = (await response.json()) as { status: string; pending_id: string };
  expect(body.status).toBe("awaiting_operator_authorization");
  return body.pending_id;
}

async function activeDevices(rig: Rig) {
  return (await listDevices(rig.app.runtime.runtime.store, rig.app.caller.tenant)).filter((device) => device.revoked_at === null);
}

let rig: Rig;
beforeEach(async () => {
  rig = await freshRig();
});
afterEach(async () => {
  await rig.close();
});

describe("enrolment: the invitation proposes a controller and the operator authorizes it", () => {
  test("PE-60: starting remote control creates no device and grants no authority", async () => {
    expect(await activeDevices(rig)).toHaveLength(0);
    const options = await rig.phone.post("/m/api/auth/options", {});
    expect(options.status).toBe(404);
    expect(((await options.json()) as { code: string }).code).toBe("not_paired");
  });

  test("NE-47: the invitation alone enrols nothing: redeeming it opens a passkey prompt and no session", async () => {
    const link = rig.app.remote.pairingLink();
    if (link === null) throw new Error("no invitation is open");
    const redeemed = await rig.phone.post("/m/api/pair/redeem", { secret: secretOf(link) });
    expect(redeemed.status).toBe(200);
    expect(await activeDevices(rig)).toHaveLength(0);
    expect((await rig.phone.request("/m/api/state")).status).toBe(401);
  });

  test("PE-61: a verified passkey waits for the operator: no device, no session cookie, no signed-in state", async () => {
    const device = await new SoftwareAuthenticator().generate();
    const response = await rig.phone.finish(device);
    await pendingOf(response);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await activeDevices(rig)).toHaveLength(0);
    rig.phone.adopt(response);
    expect((await rig.phone.request("/m/api/state")).status).toBe(401);
  });

  test("the desk shows the operator what is being authorized, with a one-time code and the pending id", async () => {
    const device = await new SoftwareAuthenticator().generate();
    const pendingId = await pendingOf(await rig.phone.finish(device));
    const line = rig.channel.shown.find((shown) => shown.includes(pendingId));
    expect(line).toBeDefined();
    expect(line).toContain("iPhone · Safari");
    expect(line).toMatch(/Code: \d{6}\./);
  });

  test("NE-48: the phone's own retries before authorization do not sign it in", async () => {
    const device = await new SoftwareAuthenticator().generate();
    const pendingId = await pendingOf(await rig.phone.finish(device));
    const early = await rig.phone.awaitAuthorization(pendingId);
    expect(early.status).toBe(202);
    expect(await activeDevices(rig)).toHaveLength(0);
  });

  test("a wrong code leaves the request waiting, and the right code then authorizes it", async () => {
    const device = await new SoftwareAuthenticator().generate();
    const pendingId = await pendingOf(await rig.phone.finish(device));
    await rig.channel.type("000000");
    expect((await rig.phone.awaitAuthorization(pendingId)).status).toBe(202);
    await rig.channel.type(rig.channel.codeFor(pendingId));
    const committed = await rig.phone.awaitAuthorization(pendingId);
    expect(committed.status).toBe(200);
    expect(await activeDevices(rig)).toHaveLength(1);
  });

  test("NE-49: five wrong codes abandon the request: the right code afterwards authorizes nothing", async () => {
    const device = await new SoftwareAuthenticator().generate();
    const pendingId = await pendingOf(await rig.phone.finish(device));
    const code = rig.channel.codeFor(pendingId);
    for (let attempt = 0; attempt < 5; attempt += 1) await rig.channel.type("000000");
    await rig.channel.type(code);
    expect((await rig.phone.awaitAuthorization(pendingId)).status).toBe(410);
    expect(await activeDevices(rig)).toHaveLength(0);
  });

  test("PE-62: the operator's code authorizes once: the enrolment commits and the phone is signed in", async () => {
    const device = await new SoftwareAuthenticator().generate();
    const pendingId = await pendingOf(await rig.phone.finish(device));
    await rig.channel.type(rig.channel.codeFor(pendingId));
    const committed = await rig.phone.awaitAuthorization(pendingId);
    expect(committed.status).toBe(200);
    rig.phone.adopt(committed);
    expect(rig.phone.cookie).not.toBe("");
    expect((await rig.phone.request("/m/api/state")).status).toBe(200);
    expect(await activeDevices(rig)).toHaveLength(1);
  });

  test("NE-50: replaying an authorized enrolment is refused and creates no second device", async () => {
    const device = await new SoftwareAuthenticator().generate();
    const pendingId = await pendingOf(await rig.phone.finish(device));
    await rig.channel.type(rig.channel.codeFor(pendingId));
    expect((await rig.phone.awaitAuthorization(pendingId)).status).toBe(200);
    expect((await rig.phone.awaitAuthorization(pendingId)).status).toBe(410);
    await rig.channel.type(rig.channel.codeFor(pendingId));
    expect(await activeDevices(rig)).toHaveLength(1);
  });

  test("NE-51: simultaneous requests after one authorization commit exactly one device", async () => {
    const device = await new SoftwareAuthenticator().generate();
    const pendingId = await pendingOf(await rig.phone.finish(device));
    await rig.channel.type(rig.channel.codeFor(pendingId));
    const [first, second] = await Promise.all([rig.phone.awaitAuthorization(pendingId), rig.phone.awaitAuthorization(pendingId)]);
    expect([first.status, second.status].sort()).toEqual([200, 410]);
    expect(await activeDevices(rig)).toHaveLength(1);
  });

  test("PE-63: a refresh before authorization voids the waiting enrolment, so the operator's late code authorizes nothing", async () => {
    const device = await new SoftwareAuthenticator().generate();
    const pendingId = await pendingOf(await rig.phone.finish(device));
    const code = rig.channel.codeFor(pendingId);
    await rig.app.remote.refresh();
    expect(await stateOf(rig.app.runtime.runtime.store, pendingId)).toBe("expired");
    await rig.channel.type(code);
    expect((await rig.phone.awaitAuthorization(pendingId)).status).toBe(410);
    expect(await activeDevices(rig)).toHaveLength(0);
  });

  test("PE-64: stopping before authorization voids the waiting enrolment", async () => {
    const device = await new SoftwareAuthenticator().generate();
    const pendingId = await pendingOf(await rig.phone.finish(device));
    await rig.app.remote.stop();
    expect(await stateOf(rig.app.runtime.runtime.store, pendingId)).toBe("expired");
    expect(await activeDevices(rig)).toHaveLength(0);
  });

  test("NE-52: a controller enrolled by another route while the request waits makes the request stale and it is refused", async () => {
    const device = await new SoftwareAuthenticator().generate();
    const pendingId = await pendingOf(await rig.phone.finish(device));
    const other = await new SoftwareAuthenticator().generate();
    await addDevice(rig.app.runtime.runtime.store, {
      device_id: "device_other",
      credential_id: Buffer.from(other.credentialId).toString("base64url"),
      public_key: "",
      sign_count: 0,
      label: "other",
      generation: 0,
      tenant: rig.app.caller.tenant,
      operator: "operator",
      created_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      revoked_at: null,
    } as Parameters<typeof addDevice>[1]);
    await rig.channel.type(rig.channel.codeFor(pendingId));
    const refused = await rig.phone.awaitAuthorization(pendingId);
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { code: string }).code).toBe("controller_changed");
    expect((await activeDevices(rig)).map((active) => active.device_id)).toEqual(["device_other"]);
  });
});

describe("refresh and stop: the controller's authority ends and does not come back", () => {
  test("PE-65: refresh invalidates the enrolled phone's session and an old invitation, and a refreshed invitation does not authorize by itself", async () => {
    const device = await new SoftwareAuthenticator().generate();
    const pendingId = await pendingOf(await rig.phone.finish(device));
    await rig.channel.type(rig.channel.codeFor(pendingId));
    rig.phone.adopt((await rig.phone.awaitAuthorization(pendingId)) as Response);
    expect((await rig.phone.request("/m/api/state")).status).toBe(200);
    const oldLink = rig.app.remote.pairingLink();
    await rig.app.remote.refresh();
    expect((await rig.phone.request("/m/api/state")).status).toBe(401);
    if (oldLink !== null) expect((await rig.phone.post("/m/api/pair/redeem", { secret: secretOf(oldLink) })).status).toBe(401);
    const replacement = await new SoftwareAuthenticator().generate();
    const waiting = await rig.phone.finish(replacement);
    await pendingOf(waiting);
    expect(await activeDevices(rig)).toHaveLength(0);
  });

  test("PE-66: a refreshed controller cannot be restored: its passkey gets no options and no sign-in", async () => {
    const device = await new SoftwareAuthenticator().generate();
    const pendingId = await pendingOf(await rig.phone.finish(device));
    await rig.channel.type(rig.channel.codeFor(pendingId));
    rig.phone.adopt((await rig.phone.awaitAuthorization(pendingId)) as Response);
    await rig.app.remote.refresh();
    // Refresh revokes the session; it renews nothing, so no active session is left behind.
    const sessions = await identityStoreOf(rig.app.runtime.runtime.store).listRecords(SESSIONS, {});
    expect(sessions.every((row) => (row.value as { status?: string }).status !== "active")).toBe(true);
    const options = await rig.phone.post("/m/api/auth/options", {});
    expect(options.status).toBe(404);
    expect(((await options.json()) as { code: string }).code).toBe("not_paired");
  });

  test("PE-67: stop invalidates an authorized phone's remote access at once", async () => {
    const device = await new SoftwareAuthenticator().generate();
    const pendingId = await pendingOf(await rig.phone.finish(device));
    await rig.channel.type(rig.channel.codeFor(pendingId));
    rig.phone.adopt((await rig.phone.awaitAuthorization(pendingId)) as Response);
    const origin = rig.base;
    await rig.app.remote.stop();
    await expect(fetch(`${origin}/m/api/state`, { headers: { cookie: rig.phone.cookie } })).rejects.toThrow();
    expect(await activeDevices(rig)).toHaveLength(0);
  });
});

describe("invitations: they expire, they are single use, and a refresh voids them", () => {
  test("PE-68: an invitation is redeemable once, within its window, and never after it", () => {
    const pairing = new Pairing();
    const opened = pairing.start(0);
    const expired = pairing.redeem(opened.secret, PAIRING_TTL_MS + 1);
    expect(expired.ok).toBe(false);
    const fresh = new Pairing();
    const link = fresh.start(0);
    expect(fresh.redeem(link.secret, 1).ok).toBe(true);
    const again = fresh.redeem(link.secret, 2);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe("used");
  });

  test("NE-53: a redeemed invitation's ticket answers one registration challenge and no replay", () => {
    const pairing = new Pairing();
    const link = pairing.start(0);
    const redeemed = pairing.redeem(link.secret, 1);
    if (!redeemed.ok) throw new Error("the invitation should redeem");
    expect(pairing.takeChallenge(redeemed.ticket, "register", 2)).not.toBeNull();
    expect(pairing.takeChallenge(redeemed.ticket, "register", 3)).toBeNull();
  });

  test("PE-69: a refresh voids the open invitation: its secret no longer redeems", () => {
    const pairing = new Pairing();
    const old = pairing.start(0);
    pairing.refresh(10);
    const stale = pairing.redeem(old.secret, 11);
    expect(stale.ok).toBe(false);
    const current = pairing.current(11);
    expect(current).not.toBeNull();
  });
});
