/**
 * The phone remote end to end in Chromium (playwright-core, pinned). The desktop cockpit starts remote
 * control and shows the QR; a phone context at 390x844 with a mobile user agent opens the link and
 * registers a passkey on a CDP VIRTUAL AUTHENTICATOR (WebAuthn.addVirtualAuthenticator, ctap2 internal,
 * user verified). Skipped with a stated reason when the Chromium build is not in the Playwright cache.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { createApplication, type HorizonApplication } from "../src/app.ts";
import { seedController } from "./support/controller.ts";
import { SoftwareAuthenticator } from "./support/remote-authenticator.ts";
import { seedOperationalFixture } from "./support/operational-fixture.ts";
import { writeConfig, horizonDocument } from "./support/config.ts";
import { testCodeFor } from "./support/write-token.ts";

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/** The Chromium binary from the Playwright cache, or null with the reason it was not found. */
function chromeBinary(): { readonly path: string | null; readonly reason: string } {
  const cache = join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(cache)) return { path: null, reason: `no Playwright browser cache at ${cache}` };
  for (const entry of readdirSync(cache).filter((name) => name.startsWith("chromium-")).sort().reverse()) {
    for (const candidate of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
      const path = join(cache, entry, candidate);
      if (existsSync(path)) return { path, reason: "" };
    }
  }
  return { path: null, reason: "no chromium build under the Playwright cache" };
}

const browser = chromeBinary();
const suite = browser.path === null ? describe.skip : describe;
if (browser.path === null) console.warn(`E2E-remote skipped: ${browser.reason}`);

suite("phone remote control, end to end in Chromium", () => {
  let application: HorizonApplication;
  let cockpit: ReturnType<HorizonApplication["startServer"]>;
  let cockpitBase: string;
  let chrome: Browser;
  let desktop: BrowserContext;
  let desktopPage: Page;
  let phone: { context: BrowserContext; page: Page; authenticator: string; cdp: Awaited<ReturnType<BrowserContext["newCDPSession"]>>; requests: string[] };
  let secondPhone: typeof phone;
  let link = "";
  let savedPort: string | undefined;
  let deskController: SoftwareAuthenticator | null = null;

  /** The desk's active controller authorizes the phone that is waiting: its passkey signs the enrolment's digest over HTTP. */
  async function authorizeWaitingPhone(): Promise<void> {
    if (deskController === null || application === undefined) throw new Error("no desk controller");
    const origin = application.remote.origin;
    const rpId = new URL(origin).hostname;
    const headers = { origin, "content-type": "application/json" };
    const first = await fetch(`${origin}/m/api/auth/options`, { method: "POST", headers, body: "{}" });
    const signed = (await first.json()) as { ticket: string; options: { challenge: string; rpId: string } };
    if (first.status !== 200) throw new Error(`auth options refused: ${first.status} ${JSON.stringify(signed)}`);
    const credential = await deskController.assert({ challenge: signed.options.challenge, origin, rpId: signed.options.rpId });
    const finish = await fetch(`${origin}/m/api/auth/finish`, { method: "POST", headers, body: JSON.stringify({ ticket: signed.ticket, credential }) });
    const cookie = /__Host-hz_remote=[^;]+/.exec(finish.headers.get("set-cookie") ?? "")?.[0] ?? "";
    const deadline = Date.now() + 20_000;
    let pending: { pending_id: string } | null = null;
    let options: { challenge: string; rpId: string } | null = null;
    while (Date.now() < deadline && (pending === null || options === null)) {
      const response = await fetch(`${origin}/m/api/pair/pending`, { headers: { origin, cookie } });
      const body = (await response.json()) as { pending: { pending_id: string } | null; options?: { challenge: string; rpId: string } };
      if (body.pending !== null && body.options !== undefined) { pending = body.pending; options = body.options; break; }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (pending === null || options === null) throw new Error("no enrolment waited for authorization");
    const proof = await deskController.assert({ challenge: options.challenge, origin, rpId: options.rpId });
    const authorized = await fetch(`${origin}/m/api/pair/authorize`, { method: "POST", headers: { ...headers, cookie }, body: JSON.stringify({ pending_id: pending.pending_id, credential: proof }) });
    if (authorized.status !== 200) throw new Error(`authorize refused: ${authorized.status}`);
  }

  async function openPhone(): Promise<typeof phone> {
    const context = await chrome.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: IPHONE_UA, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    const cdp = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable", { enableUI: false });
    // CDP VIRTUAL AUTHENTICATOR: an in-browser passkey, user verified, resident keys allowed.
    const { authenticatorId } = (await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
    })) as { authenticatorId: string };
    return { context, page, authenticator: authenticatorId, cdp, requests };
  }

  beforeAll(async () => {
    savedPort = process.env.HORIZON_REMOTE_PORT;
    process.env.HORIZON_REMOTE_PORT = "0";
    const root = mkdtempSync(join(tmpdir(), "e2e-remote-"));
    const configPath = await writeConfig(join(root, "horizon.toml"), horizonDocument({ storePath: join(root, "e2e.sqlite"), secretPath: join(root, "launch.secret") }));
    application = await createApplication({ configPath });
    await seedOperationalFixture(application.runtime.runtime.store, undefined, application.caller.tenant);
    cockpit = application.startServer(0);
    cockpitBase = `http://127.0.0.1:${cockpit.port}`;
    // No production path makes the first controller yet, so the test seeds one once remote control is on. Every later phone is authorized by a controller's passkey.
    deskController = await new SoftwareAuthenticator().generate();
    chrome = await chromium.launch({ executablePath: browser.path ?? undefined, headless: true });
    desktop = await chrome.newContext({ viewport: { width: 1280, height: 860 } });
    // The desktop browser pairs with the code the cockpit printed at start. The session cookie then lives in this context.
    expect((await desktop.request.post(`${cockpitBase}/desk/pair`, { data: { code: testCodeFor(cockpitBase) } })).status()).toBe(200);
    desktopPage = await desktop.newPage();
  }, 120_000);

  afterAll(async () => {
    await chrome?.close().catch(() => undefined);
    await application?.remote.stop().catch(() => undefined);
    await cockpit?.stop(true);
    await application?.close();
    if (savedPort === undefined) delete process.env.HORIZON_REMOTE_PORT;
    else process.env.HORIZON_REMOTE_PORT = savedPort;
  });

  test("the desktop starts remote control and reads the pairing link from the QR panel", async () => {
    await desktopPage.goto(`${cockpitBase}/workspace/remote`);
    await Promise.all([desktopPage.waitForURL(/\/workspace\/remote$/), desktopPage.getByRole("button", { name: "Start remote control" }).click()]);
    await desktopPage.locator("#pair-link").waitFor({ state: "visible", timeout: 20_000 });
    const text = await desktopPage.locator("#pair-link").innerText();
    expect(text).toMatch(/^http:\/\/localhost:\d+\/m\/pair#p=[A-Za-z0-9_-]{43}$/);
    link = text;
    expect(await desktopPage.locator("svg[role='img']").count()).toBeGreaterThan(0);
  }, 60_000);

  test("the phone opens the link, registers a passkey on a virtual authenticator, and lands on Home with no secret in the address bar", async () => {
    phone = await openPhone();
    await seedController(application, deskController as SoftwareAuthenticator, "desk controller");
    await phone.page.goto(link);
    // The phone waits for the desk controller: its passkey authorizes the enrolment, then the phone completes.
    await authorizeWaitingPhone();
    await phone.page.waitForURL((url) => url.pathname === "/m", { timeout: 30_000 });
    await (phone.page.locator("#home")).waitFor({ state: "visible", timeout: 30_000 });
    expect(phone.page.url()).not.toContain("#");
    expect(phone.page.url()).not.toContain("p=");
    const secret = new URL(link).hash.slice("#p=".length);
    expect(phone.requests.some((url) => url.includes(secret))).toBe(false);
    const credentials = (await phone.cdp.send("WebAuthn.getCredentials", { authenticatorId: phone.authenticator })) as { credentials: unknown[] };
    expect(credentials.credentials.length).toBe(1);
    const panel = await desktopPage.goto(`${cockpitBase}/workspace/remote`).then(() => desktopPage.locator("#state").innerText());
    expect(panel).toBe("Phone connected");
  }, 90_000);

  test("the phone opens a case from its own form, and a case opened on the desktop appears on the phone without a reload", async () => {
    const { page } = phone;
    await page.getByLabel("Purpose of the case").fill("Phone opens the first case");
    await page.getByRole("button", { name: "Open a case" }).click();
    await (page.getByText("Phone opens the first case")).waitFor({ state: "visible", timeout: 15_000 });
    // The paired desktop browser sends its session cookie with this form post, as the desk's own form does.
    const posted = await desktop.request.post(`${cockpitBase}/workspace/case`, { form: { purpose: "Desktop changes the case" }, maxRedirects: 0 });
    expect(posted.status()).toBe(303);
    await (page.getByText("Desktop changes the case")).waitFor({ state: "visible", timeout: 20_000 });
  }, 90_000);

  test("the phone's commit is refused in the catalog's words, and the desktop records no new move", async () => {
    // R5-03: a device credential never proves which person holds the phone, so the phone's commit
    // is refused before any target effect. The phone says so; the desktop gets no intent or receipt.
    const { page } = phone;
    await desktopPage.goto(`${cockpitBase}/workspace`);
    const before = await desktopPage.locator("[data-intent]").count();
    await page.getByRole("button", { name: "Commit", exact: true }).first().click();
    await page.getByRole("button", { name: "Confirm commit" }).click();
    const notice = page.locator("#notice[data-kind='error']");
    await notice.waitFor({ state: "visible", timeout: 20_000 });
    expect(await notice.textContent()).toContain("delegation");
    await desktopPage.goto(`${cockpitBase}/workspace`);
    expect(await desktopPage.locator("[data-intent]").count()).toBe(before);
  }, 90_000);

  test("the phone reloads, signs out on the phone, and signs back in with its passkey", async () => {
    const { page } = phone;
    await page.getByRole("button", { name: "This phone" }).click();
    await page.getByRole("button", { name: "Sign out on this phone" }).click();
    await (page.locator("#connect")).waitFor({ state: "visible", timeout: 15_000 });
    await page.reload();
    await (page.locator("#connect")).waitFor({ state: "visible", timeout: 15_000 });
    await page.getByRole("button", { name: "Use your passkey" }).click();
    await (page.locator("#home")).waitFor({ state: "visible", timeout: 30_000 });
  }, 90_000);

  test("the phone has no horizontal overflow at 320px", async () => {
    const { page } = phone;
    await page.setViewportSize({ width: 320, height: 640 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.setViewportSize({ width: 390, height: 844 });
  }, 30_000);

  test("Replace phone keeps the first phone signed in until a new phone is authorized", async () => {
    await desktopPage.goto(`${cockpitBase}/workspace/remote`);
    await desktopPage.getByRole("button", { name: "Replace phone" }).click();
    await desktopPage.locator("#pair-link").waitFor({ state: "visible", timeout: 20_000 });
    const status = await phone.page.evaluate(async () => (await fetch("/m/api/state", { credentials: "same-origin" })).status);
    expect(status).toBe(200);
  }, 90_000);

  test("a second phone pairs with the new link; the first phone authorizes it with its passkey and is then replaced; a refused passkey prompt is retried without a new scan", async () => {
    await desktopPage.goto(`${cockpitBase}/workspace/remote`);
    const second = await desktopPage.locator("#pair-link").innerText();
    secondPhone = await openPhone();
    // The virtual authenticator first fails user verification, as a refused or gesture-less prompt does.
    await secondPhone.cdp.send("WebAuthn.setUserVerified", { authenticatorId: secondPhone.authenticator, isUserVerified: false });
    await secondPhone.page.goto(second);
    const retry = secondPhone.page.getByRole("button", { name: "Create passkey" });
    await retry.waitFor({ state: "visible", timeout: 30_000 });
    await secondPhone.cdp.send("WebAuthn.setUserVerified", { authenticatorId: secondPhone.authenticator, isUserVerified: true });
    await retry.click();
    // The second phone now waits. The first phone, the active controller, authorizes it with its own user-verified passkey.
    await phone.page.getByRole("button", { name: "Authorize the new phone" }).click({ timeout: 30_000 });
    await (secondPhone.page.locator("#home")).waitFor({ state: "visible", timeout: 30_000 });
    const firstStatus = await phone.page.evaluate(async () => (await fetch("/m/api/state", { credentials: "same-origin" })).status);
    expect(firstStatus).toBe(401);
    const panel = await desktopPage.goto(`${cockpitBase}/workspace/remote`).then(() => desktopPage.locator("#state").innerText());
    expect(panel).toBe("Phone connected");
  }, 120_000);

  test("Stop on the desktop closes the listener: the phone can no longer reach it", async () => {
    await desktopPage.goto(`${cockpitBase}/workspace/remote`);
    await desktopPage.getByRole("button", { name: "Stop" }).click();
    await desktopPage.getByText("Remote control is off.").waitFor({ state: "visible", timeout: 20_000 });
    const reached = await secondPhone.page.evaluate(async () => {
      try {
        await fetch("/m/health");
        return true;
      } catch {
        return false;
      }
    });
    expect(reached).toBe(false);
    expect(application.remote.listening).toBe(false);
  }, 60_000);
});
