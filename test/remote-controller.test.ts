/**
 * The phone remote over real HTTP on a real application: the cockpit panel starts it, a SOFTWARE
 * AUTHENTICATOR (test/support) pairs and signs in, and every guard, revocation and command rule is
 * checked against the listener the phone would reach. The states run in the order an operator
 * reaches them, so one application carries them all.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createApplication, type HorizonApplication } from "../src/app.ts";
import { listDevices } from "../src/capabilities/remote-records.ts";
import { readIntentRecords } from "../src/capabilities/navigation-intent.ts";
import { seedOperationalFixture } from "./support/operational-fixture.ts";
import { writeConfig, horizonDocument } from "./support/config.ts";
import { SoftwareAuthenticator } from "./support/remote-authenticator.ts";
import { TestOperatorChannel } from "./support/operator-channel.ts";
import { b64url } from "../src/remote/webauthn.ts";

let application: HorizonApplication;
/** The desk's terminal for the test: the operator authorizes each enrolment by typing the code it shows. */
const operatorChannel = new TestOperatorChannel();
let cockpit: ReturnType<HorizonApplication["startServer"]>;
let cockpitBase: string;
let savedPort: string | undefined;
let phone: { readonly origin: string } | null = null;
let cookie = "";
let authenticator: SoftwareAuthenticator;
let phoneLink = "";

const intents = async () => (await readIntentRecords(application.runtime.runtime.store)).length;
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

beforeAll(async () => {
  savedPort = process.env.HORIZON_REMOTE_PORT;
  process.env.HORIZON_REMOTE_PORT = "0";
  const root = mkdtempSync(join(tmpdir(), "remote-"));
  const configPath = await writeConfig(
    join(root, "horizon.toml"),
    horizonDocument({ storePath: join(root, "remote.sqlite"), secretPath: join(root, "launch.secret") }),
  );
  application = await createApplication({ configPath, operatorChannel });
  await seedOperationalFixture(application.runtime.runtime.store, undefined, application.caller.tenant);
  cockpit = application.startServer(0);
  cockpitBase = `http://127.0.0.1:${cockpit.port}`;
}, 60_000);

afterAll(async () => {
  await application?.remote.stop().catch(() => undefined);
  await cockpit?.stop(true);
  await application?.close();
  if (savedPort === undefined) delete process.env.HORIZON_REMOTE_PORT;
  else process.env.HORIZON_REMOTE_PORT = savedPort;
});

/** The phone's origin, from the listener once the cockpit has started it. */
function phoneBase(): string {
  if (phone === null) throw new Error("the remote is not started");
  return phone.origin;
}

function phoneRequest(path: string, init: RequestInit & { readonly headers?: Record<string, string> } = {}): Promise<Response> {
  const headers: Record<string, string> = { origin: phoneBase(), ...(init.headers as Record<string, string> | undefined ?? {}) };
  if (cookie !== "") headers.cookie = cookie;
  return fetch(`${phoneBase()}${path}`, { redirect: "manual", ...init, headers });
}

function postJson(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return phoneRequest(path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });
}

function sessionCookieOf(response: Response): string {
  const header = response.headers.get("set-cookie") ?? "";
  const match = /__Host-hz_remote=[^;]+/.exec(header);
  return match === null ? "" : match[0];
}

function secretOf(link: string): string {
  const fragment = link.split("#")[1] ?? "";
  return new URLSearchParams(fragment).get("p") ?? "";
}

async function startFromCockpit(): Promise<string> {
  await fetch(`${cockpitBase}/workspace/remote/start`, { method: "POST", redirect: "manual" });
  phone = { origin: application.remote.origin };
  const link = application.remote.pairingLink();
  if (link === null) throw new Error("no pairing link after start");
  return link;
}

async function pairWith(link: string, device: SoftwareAuthenticator): Promise<Response> {
  const redeemed = await postJson("/m/api/pair/redeem", { secret: secretOf(link) });
  expect(redeemed.status).toBe(200);
  const { ticket, options } = (await redeemed.json()) as { ticket: string; options: { challenge: string; rp: { id: string } } };
  const credential = await device.register({ challenge: options.challenge, origin: phoneBase(), rpId: options.rp.id });
  const finished = await postJson("/m/api/pair/finish", { ticket, credential }, { "user-agent": IPHONE_UA });
  expect(finished.status).toBe(202);
  const { pending_id: pendingId } = (await finished.json()) as { pending_id: string };
  // The operator types the code the desk showed on its terminal; only then does the phone's retry enrol it.
  await operatorChannel.type(operatorChannel.codeFor(pendingId));
  return postJson("/m/api/pair/await", { pending_id: pendingId });
}

async function signIn(device: SoftwareAuthenticator): Promise<Response> {
  const optionsResponse = await postJson("/m/api/auth/options", {});
  expect(optionsResponse.status).toBe(200);
  const { ticket, options } = (await optionsResponse.json()) as { ticket: string; options: { challenge: string; rpId: string } };
  const assertion = await device.assert({ challenge: options.challenge, origin: phoneBase(), rpId: options.rpId });
  return postJson("/m/api/auth/finish", { ticket, credential: assertion });
}

describe("remote control: off by default, started only from the cockpit", () => {
  test("the phone listener is not running until the desktop starts it", async () => {
    expect(application.remote.listening).toBe(false);
    expect(application.remote.pairingLink()).toBeNull();
  });

  test("the desktop panel reports Off with a start action and no link", async () => {
    const markup = await (await fetch(`${cockpitBase}/workspace/remote`)).text();
    expect(markup).toContain("Remote control is off.");
    expect(markup).toContain("Start remote control");
    expect(markup).not.toContain("pair#p=");
    expect(markup).toContain("Control from your phone");
    const panelCsp = (await fetch(`${cockpitBase}/workspace/remote`)).headers.get("content-security-policy") ?? "";
    expect(panelCsp).toContain("form-action 'self'");
  });

  test("the desk's Settings holds the phone panel and says the remote state in words", async () => {
    // The desk draws the panel under Settings; its state comes from /desk/remote.json, the same controller as the old panel page.
    const info = (await (await fetch(`${cockpitBase}/desk/remote.json`)).json()) as { status: { state: string }; link: string | null };
    expect(info.status.state).toBe("off");
    expect(info.link).toBeNull();
    const { RemotePanel } = await import("../src/ui/desk/RemotePanel.tsx");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const html = renderToStaticMarkup(createElement(RemotePanel, { remote: { load: async () => null, act: async () => undefined } }));
    expect(html).toContain("Phone remote");
    // The legacy panel page is kept, and still says it is off.
    expect(await (await fetch(`${cockpitBase}/workspace/remote`)).text()).toContain("Remote control is off.");
  });
});

describe("pairing: the link authorizes one passkey registration and nothing else", () => {
  test("starting from the cockpit opens a loopback listener and a QR panel with the pairing link", async () => {
    const link = await startFromCockpit();
    expect(application.remote.listening).toBe(true);
    expect(link).toMatch(/\/m\/pair#p=[A-Za-z0-9_-]{43}$/);
    const markup = await (await fetch(`${cockpitBase}/workspace/remote`)).text();
    expect(markup).toContain("<svg");
    expect(markup).toContain("Scanning opens a page that asks your phone to create a passkey for Horizon.");
    expect(markup).toContain("Copy link");
    authenticator = await new SoftwareAuthenticator().generate();
    phoneLink = link;
  });

  test("the pairing secret is refused as a session: the phone shell reports not signed in", async () => {
    const response = await phoneRequest("/m/api/state");
    expect(response.status).toBe(401);
    expect(((await response.json()) as { code: string }).code).toBe("not_signed_in");
  });

  test("the phone shell and the pairing page are served with a nonce CSP and no-referrer", async () => {
    const shell = await phoneRequest("/m");
    expect(shell.status).toBe(200);
    const csp = shell.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toMatch(/script-src 'nonce-[A-Za-z0-9+/=]+'/);
    expect(shell.headers.get("referrer-policy")).toBe("no-referrer");
    expect(shell.headers.get("cache-control")).toBe("no-store");
    const pair = await phoneRequest("/m/pair");
    expect(pair.status).toBe(200);
  });

  test("a forged Host is refused on every route, and a cross-origin POST is refused", async () => {
    const hostless = await fetch(`${phoneBase()}/m/health`, { headers: { host: "evil.example" } });
    expect(hostless.status).toBe(403);
    // DNS rebinding against the cockpit: the panel's GET carries the pairing link, so Host is checked on reads too.
    const rebound = await fetch(`${cockpitBase}/workspace/remote`, { headers: { host: "evil.example:4319" } });
    expect(rebound.status).toBe(403);
    expect(await rebound.text()).not.toContain("/m/pair#p=");
    const cross = await postJson("/m/api/pair/redeem", { secret: "x" }, { origin: "https://evil.example" });
    expect(cross.status).toBe(403);
  });

  test("a bad secret is refused without consuming the real link", async () => {
    const bad = await postJson("/m/api/pair/redeem", { secret: "B".repeat(43) });
    expect(bad.status).toBe(401);
    expect(((await bad.json()) as { code: string }).code).toBe("pairing_invalid");
  });

  test("a valid link registers the passkey, signs the phone in, and the cookie is host-bound and strict", async () => {
    const response = await pairWith(phoneLink, authenticator);
    expect(response.status).toBe(200);
    const header = response.headers.get("set-cookie") ?? "";
    expect(header.startsWith("__Host-hz_remote=")).toBe(true);
    for (const attribute of ["Path=/", "HttpOnly", "Secure", "SameSite=Strict"]) expect(header).toContain(attribute);
    cookie = sessionCookieOf(response);
    const state = await phoneRequest("/m/api/state");
    expect(state.status).toBe(200);
    const snapshot = (await state.json()) as { schema: string; device: { label: string } | null };
    expect(snapshot.schema).toBe("horizon.remote/1");
    expect(snapshot.device?.label).toBe("iPhone · Safari");
  });

  test("the link is single use: the same link is refused as used", async () => {
    const again = await postJson("/m/api/pair/redeem", { secret: secretOf(phoneLink) });
    expect(again.status).toBe(410);
    expect(((await again.json()) as { code: string }).code).toBe("pairing_used");
  });

  test("the desktop panel now shows a connected phone and no QR", async () => {
    const markup = await (await fetch(`${cockpitBase}/workspace/remote`)).text();
    expect(markup).toContain("Phone connected.");
    expect(markup).not.toContain("pair#p=");
  });
});

describe("sign-in with the passkey, and the phone's live views", () => {
  test("a signed-out phone is asked for its passkey, and signing out drops the session", async () => {
    const out = await phoneRequest("/m/api/signout", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
    expect(out.status).toBe(200);
    const after = await phoneRequest("/m/api/state", { headers: { cookie: cookie } });
    expect(after.status).toBe(401);
    const signedIn = await signIn(authenticator);
    expect(signedIn.status).toBe(200);
    cookie = sessionCookieOf(signedIn);
    expect((await phoneRequest("/m/api/state")).status).toBe(200);
  });

  test("a sign-in with a different passkey is refused", async () => {
    const stranger = await new SoftwareAuthenticator().generate();
    const response = await signIn(stranger);
    expect(response.status).toBe(401);
    expect(((await response.json()) as { code: string }).code).toBe("passkey_refused");
  });

  test("the events stream opens with a retry hint and reports a store change as a state event", async () => {
    const controller = new AbortController();
    const response = await phoneRequest("/m/api/events", { signal: controller.signal });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    const read = async (until: string) => {
      const deadline = Date.now() + 8000;
      while (!text.includes(until) && Date.now() < deadline) {
        const chunk = await reader.read();
        if (chunk.done) break;
        text += decoder.decode(chunk.value);
      }
      return text;
    };
    expect(await read("retry:")).toContain("retry:");
    await fetch(`${cockpitBase}/workspace/case`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ purpose: "Phone sees the desktop move" }),
    });
    expect(await read("event: state")).toContain("event: state");
    controller.abort();
  });
});

describe("commands: one command id, one outcome; claims stay distinct", () => {
  test("a case opened from the phone is refused when blank and accepted once, and a retry is answered not repeated", async () => {
    const blank = await postJson("/m/api/command", { command_id: randomUUID(), kind: "open_case", purpose: "   " });
    expect(blank.status).toBe(400);
    const body = (await blank.json()) as { received: boolean; accepted: boolean; outcome: { state: string; code: string } };
    expect(body.received).toBe(true);
    expect(body.accepted).toBe(false);
    expect(body.outcome.code).toBe("empty");
    const id = randomUUID();
    const first = await postJson("/m/api/command", { command_id: id, kind: "open_case", purpose: "Open from the phone" });
    expect(first.status).toBe(200);
    const firstBody = await first.text();
    const retry = await postJson("/m/api/command", { command_id: id, kind: "open_case", purpose: "Open from the phone" });
    expect(await retry.text()).toBe(firstBody);
    const cases = JSON.stringify(await (await fetch(`${cockpitBase}/desk/state.json`)).json());
    expect(cases).toContain("Open from the phone");
  });

  test("a malformed command id and an unknown kind are refused", async () => {
    expect((await postJson("/m/api/command", { command_id: "nope", kind: "open_case", purpose: "x" })).status).toBe(400);
    expect((await postJson("/m/api/command", { command_id: randomUUID(), kind: "delete_everything" })).status).toBe(400);
  });

  test("a commit from the phone is refused before the frame is even checked, and nothing commits", async () => {
    // The commit runs under the person's own principal, and a device credential proves which
    // device is at the route and never which person is holding it: there is no device-attributed
    // delegation from the operator at this freeze, so the row is refused in the catalog's own
    // words before any commit is attempted. A stale frame is therefore not the reason, and
    // nothing at all is written (R5-03).
    const response = await postJson("/m/api/command", {
      command_id: randomUUID(),
      kind: "commit",
      frame_id: "frame:stale",
      frame_revision: 0,
      action_id: "horizon-health",
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { accepted: boolean; outcome: { state: string; code: string; message: string } };
    expect(body.accepted).toBe(false);
    expect(body.outcome).toMatchObject({ state: "refused", code: "refused" });
    expect(body.outcome.message).toContain("delegation");
    const audit = await (await fetch(`${cockpitBase}/desk/state.json`)).json();
    expect(JSON.stringify(audit)).not.toContain("horizon-health");
    expect(await intents()).toBe(0);
  });

  test("a commit of an offered move from the phone is refused: no receipt, no intent, and the desktop sees nothing", async () => {
    const state = (await (await phoneRequest("/m/api/state")).json()) as {
      frame: { frame_id: string; revision: number };
      actions: { action_id: string }[];
    };
    const action = state.actions.find((candidate) => candidate.action_id === "horizon-health");
    if (action === undefined) throw new Error("the default focus no longer offers horizon-health to the phone");
    const response = await postJson("/m/api/command", {
      command_id: randomUUID(),
      kind: "commit",
      frame_id: state.frame.frame_id,
      frame_revision: state.frame.revision,
      action_id: action.action_id,
    });
    // The action is genuinely offered and the frame genuinely holds; the refusal is about who is
    // asking, not about the move. The phone answers in the catalog's words and the desktop is
    // never told a move happened, because none did (R5-01, R5-03).
    expect(response.status).toBe(403);
    const body = (await response.json()) as { accepted: boolean; outcome: { state: string; code: string; message: string } };
    expect(body.accepted).toBe(false);
    expect(body.outcome.state).toBe("refused");
    expect(body.outcome.message).toContain("delegation");
    expect(await intents()).toBe(0);
    const desktop = (await (await fetch(`${cockpitBase}/desk/state.json`)).json()) as { home: { receipt: { found: boolean } | null } };
    expect(desktop.home.receipt).toBeNull();
  });
});

describe("revocation: refresh and replacement", () => {
  test("Refresh QR revokes the phone at once: its next call fails and the old link no longer works", async () => {
    const oldLink = application.remote.pairingLink() ?? phoneLink;
    await fetch(`${cockpitBase}/workspace/remote/refresh`, { method: "POST", redirect: "manual" });
    const next = await phoneRequest("/m/api/state");
    expect(next.status).toBe(401);
    expect((await postJson("/m/api/pair/redeem", { secret: secretOf(oldLink) })).status).toBe(401);
    const devices = await listDevices(application.runtime.runtime.store, application.caller.tenant);
    expect(devices.every((device) => device.revoked_at !== null)).toBe(true);
  });

  test("a second phone pairs and replaces the first, which is revoked for good", async () => {
    const link = application.remote.pairingLink();
    if (link === null) throw new Error("refresh should have opened a new link");
    const second = await new SoftwareAuthenticator().generate();
    const response = await pairWith(link, second);
    expect(response.status).toBe(200);
    cookie = sessionCookieOf(response);
    const active = (await listDevices(application.runtime.runtime.store, application.caller.tenant)).filter((device) => device.revoked_at === null);
    expect(active.length).toBe(1);
    expect(active[0]?.credential_id).toBe(b64url(second.credentialId));
    const status = (await (await fetch(`${cockpitBase}/workspace/remote/status`)).json()) as { state: string };
    expect(status.state).toBe("connected");
  });

  test("the audit trail records the remote commands with their outcomes and no secret", async () => {
    const rows = await application.runtime.runtime.store.listRecords("horizon-remote-audit", {});
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toMatch(/#p=|secret/);
  });

  test("Stop closes the listener and the phone can no longer reach it", async () => {
    const origin = phoneBase();
    await fetch(`${cockpitBase}/workspace/remote/stop`, { method: "POST", redirect: "manual" });
    expect(application.remote.listening).toBe(false);
    await expect(fetch(`${origin}/m/health`)).rejects.toThrow();
  });
});
