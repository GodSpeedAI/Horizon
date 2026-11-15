/** What the person is told after answering a question or saving a note: the returned words reach the screen. Runs the desk's own components in Chromium. */
import { setDefaultTimeout, afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";

function chromeBinary(): string | null {
  const cache = join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(cache)) return null;
  for (const entry of readdirSync(cache).filter((name) => name.startsWith("chromium-")).sort().reverse()) {
    for (const candidate of ["chrome-linux64/chrome", "chrome-linux/chrome"]) if (existsSync(join(cache, entry, candidate))) return join(cache, entry, candidate);
  }
  return null;
}
setDefaultTimeout(20_000);
const binary = chromeBinary();
const suite = binary === null ? describe.skip : describe;

suite("the words that come back are shown", () => {
  let browser: Browser;
  let script = "";
  beforeAll(async () => {
    const built = await Bun.build({ entrypoints: [join(import.meta.dir, "support/ui-harness.tsx")], target: "browser" });
    if (!built.success) throw new Error(built.logs.map(String).join("\n"));
    script = await built.outputs[0]!.text();
    browser = await chromium.launch({ executablePath: binary ?? undefined, headless: true });
  }, 60_000);
  afterAll(async () => browser?.close());

  async function open(call: string): Promise<Page> {
    const page = await browser.newPage();
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: script });
    await page.evaluate(call);
    return page;
  }

  test("a refused answer (the question changed) shows the reason on the card", async () => {
    const page = await open('window.mountPanel({ ok: false, message: "This question changed after you looked at it. Look again, then answer." })');
    await page.getByRole("button", { name: "Not yet" }).click();
    await page.locator("[data-answer-outcome]").waitFor({ timeout: 2000 });
    expect(await page.locator("[data-answer-outcome]").innerText()).toContain("This question changed after you looked at it");
    await page.close();
  });

  test("an answer that was sent but not recorded shows the recording warning on the card", async () => {
    const page = await open('window.mountPanel({ ok: true, message: "Sent. Waiting for the agent to say where it went. This was done, but it could not be added to the conversation. Check the desk log." })');
    await page.getByRole("button", { name: "Skip" }).click();
    await page.locator("[data-answer-outcome]").waitFor({ timeout: 2000 });
    expect(await page.locator("[data-answer-outcome]").innerText()).toContain("could not be added to the conversation");
    await page.close();
  });

  test("a note saved but not recorded shows its warning and does not close without it", async () => {
    const page = await open('window.mountNote({ ok: true, recorded_words: "This was done, but it could not be added to the conversation. Check the desk log." })');
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.locator("[data-recorded-warning]").waitFor({ timeout: 2000 });
    expect(await page.locator("[data-recorded-warning]").innerText()).toContain("could not be added to the conversation");
    expect(await page.evaluate("window.closedWith")).toBeUndefined();
    await page.getByRole("button", { name: "Close" }).click();
    expect(await page.evaluate("window.closedWith")).toBe("saved");
    await page.close();
  });

  test("a note saved and recorded closes at once", async () => {
    const page = await open("window.mountNote({ ok: true })");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForFunction("window.closedWith === 'saved'");
    await page.close();
  });
});
