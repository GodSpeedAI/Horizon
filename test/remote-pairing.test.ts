/**
 * Pairing, challenges and sessions as pure state: expiry, single use under concurrent redemption,
 * generation revocation, stop, and the session cookie's attributes. Time is passed in explicitly.
 */
import { describe, expect, test } from "bun:test";
import { PAIRING_TTL_MS, Pairing } from "../src/remote/pairing.ts";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { createIdentityService } from "@godspeed/identity";
import { clearedCookie, COOKIE_NAME, sessionCookie, SESSION_TTL_MS } from "../src/remote/sessions.ts";
import { newChallenge } from "../src/remote/webauthn.ts";
import { publicOriginOf, remoteSettings } from "../src/remote/settings.ts";

const T0 = 1_700_000_000_000;

describe("pairing link", () => {
  test("expires after five minutes and is refused as expired, not as invalid", () => {
    const pairing = new Pairing();
    const { secret } = pairing.start(T0);
    expect(pairing.redeem(secret, T0 + PAIRING_TTL_MS - 1).ok).toBe(true);
    const late = new Pairing();
    const issued = late.start(T0);
    expect(late.redeem(issued.secret, T0 + PAIRING_TTL_MS)).toEqual({ ok: false, reason: "expired" });
  });

  test("is single use: two concurrent redemptions, only one succeeds and the other says used", () => {
    const pairing = new Pairing();
    const { secret } = pairing.start(T0);
    const first = pairing.redeem(secret, T0);
    const second = pairing.redeem(secret, T0);
    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, reason: "used" });
  });

  test("a wrong or malformed secret is invalid and never consumes the real link", () => {
    const pairing = new Pairing();
    const { secret } = pairing.start(T0);
    expect(pairing.redeem("A".repeat(43), T0)).toEqual({ ok: false, reason: "invalid" });
    expect(pairing.redeem("not a secret", T0)).toEqual({ ok: false, reason: "invalid" });
    expect(pairing.redeem(undefined, T0)).toEqual({ ok: false, reason: "invalid" });
    expect(pairing.redeem(secret, T0).ok).toBe(true);
  });

  test("refresh revokes every prior link and bumps the generation; stop turns remote control off", () => {
    const pairing = new Pairing();
    const first = pairing.start(T0);
    const second = pairing.refresh(T0 + 1000);
    expect(second.generation).toBe(first.generation + 1);
    expect(pairing.redeem(first.secret, T0 + 1000)).toEqual({ ok: false, reason: "invalid" });
    expect(pairing.redeem(second.secret, T0 + 1000).ok).toBe(true);
    pairing.stop();
    expect(pairing.isEnabled).toBe(false);
    expect(pairing.redeem(second.secret, T0 + 2000)).toEqual({ ok: false, reason: "off" });
    expect(pairing.current(T0 + 2000)).toBeNull();
  });

  test("a restart floor keeps the new generation above any stored device generation", () => {
    const pairing = new Pairing();
    const issued = pairing.start(T0, 7);
    expect(issued.generation).toBe(8);
  });
});

describe("challenges", () => {
  test("a challenge is single use, bound to its kind and to the generation", () => {
    const pairing = new Pairing();
    pairing.start(T0);
    const challenge = newChallenge();
    const ticket = pairing.issueChallenge(challenge, "auth", T0);
    expect(pairing.takeChallenge(ticket, "register", T0)).toBeNull();
    const again = pairing.issueChallenge(challenge, "auth", T0);
    expect(pairing.takeChallenge(again, "auth", T0)).toEqual(challenge);
    expect(pairing.takeChallenge(again, "auth", T0)).toBeNull();
  });

  test("a challenge expires after two minutes and does not survive a refresh", () => {
    const pairing = new Pairing();
    pairing.start(T0);
    const expiring = pairing.issueChallenge(newChallenge(), "auth", T0);
    expect(pairing.takeChallenge(expiring, "auth", T0 + 120_000)).toBeNull();
    const stale = pairing.issueChallenge(newChallenge(), "auth", T0);
    pairing.refresh(T0);
    expect(pairing.takeChallenge(stale, "auth", T0)).toBeNull();
  });
});

describe("sessions", () => {
  test("a session is durable, resolves to its operator, and a bumped operator generation drops it", async () => {
    const identity = createIdentityService(createMemoryStore(), { clock: () => T0 });
    await identity.registerOperator({ tenant: "t1", operatorId: "operator" });
    const issued = await identity.issueSession({ tenant: "t1", operatorId: "operator" });
    const resolved = await identity.resolveSession(issued.token);
    expect(resolved?.caller.actor.id).toBe("operator");
    expect(await identity.resolveSession(null)).toBeUndefined();
    await identity.revokeAll("t1", "operator", "test");
    expect(await identity.resolveSession(issued.token)).toBeUndefined();
  });

  test("a session expires after twelve hours", async () => {
    let now = T0;
    const identity = createIdentityService(createMemoryStore(), { clock: () => now });
    await identity.registerOperator({ tenant: "t1", operatorId: "operator" });
    const issued = await identity.issueSession({ tenant: "t1", operatorId: "operator", ttlMs: SESSION_TTL_MS });
    now = T0 + SESSION_TTL_MS - 1;
    expect(await identity.resolveSession(issued.token)).toBeDefined();
    now = T0 + SESSION_TTL_MS;
    expect(await identity.resolveSession(issued.token)).toBeUndefined();
  });

  test("the cookie is __Host-, HttpOnly, Secure, SameSite=Strict and path-scoped; clearing expires it", () => {
    const cookie = sessionCookie("token");
    expect(cookie.startsWith(`${COOKIE_NAME}=token;`)).toBe(true);
    for (const attribute of ["Path=/", "HttpOnly", "Secure", "SameSite=Strict"]) expect(cookie).toContain(attribute);
    expect(cookie).not.toContain("Domain=");
    expect(clearedCookie()).toContain("Max-Age=0");
  });
});

describe("remote settings", () => {
  test("the public URL is an origin only, HTTPS or localhost; the port defaults to 4320", () => {
    expect(remoteSettings({})).toEqual({ port: 4320, publicUrl: null });
    expect(remoteSettings({ HORIZON_REMOTE_PORT: "4330", HORIZON_REMOTE_PUBLIC_URL: "https://horizon.example/" })).toEqual({ port: 4330, publicUrl: "https://horizon.example" });
    expect(publicOriginOf("http://localhost:4320")).toBe("http://localhost:4320");
    expect(() => publicOriginOf("http://horizon.example")).toThrow("https");
    expect(() => publicOriginOf("https://horizon.example/path")).toThrow("origin");
    expect(() => publicOriginOf("https://user:pw@horizon.example")).toThrow("origin");
    expect(() => remoteSettings({ HORIZON_REMOTE_PORT: "99999" })).toThrow("port");
  });
});
