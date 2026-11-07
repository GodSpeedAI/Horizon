// Presenting scan: turn Presenting on, walk every view and the inspector, and look for real names and paths.
import { chromium } from "/home/sprime01/projects/Horizon/node_modules/playwright-core/index.mjs";
import { readdirSync, writeFileSync, mkdirSync } from "node:fs";
const out = process.argv[2]!;
const PRIVATE = ["seed-repo", "sprime01", "/home/", "GodSpeedAI", "horizon-sandbox", "horizon_sandbox", "Yoga7i".toLowerCase() === "" ? "" : "__none__"];
const root = `${process.env.HOME}/.cache/ms-playwright`;
const exe = `${root}/${readdirSync(root).find((d) => d.startsWith("chromium-"))}/chrome-linux64/chrome`;
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://127.0.0.1:4339/desk", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const before: Record<string, string[]> = {}, after: Record<string, string[]> = {};
const scan = async (into: Record<string, string[]>, tag: string) => {
  for (const view of ["Today", "Explore", "Decide", "Work"]) {
    await page.getByRole("button", { name: new RegExp(`^▸? ?${view}`) }).or(page.getByRole("link", { name: new RegExp(`^${view}`) })).first().click();
    await page.waitForTimeout(1500);
    // Open every closed disclosure so hidden text is scanned too.
    await page.evaluate(() => document.querySelectorAll("details").forEach((d) => ((d as HTMLDetailsElement).open = true)));
    const html = await page.innerText("body");
    into[view] = PRIVATE.filter((p) => html.includes(p));
    mkdirSync(`${out}-text`, { recursive: true }); writeFileSync(`${out}-text/${tag}-${view.toLowerCase()}.txt`, html); writeFileSync(`${out}-text/${tag}-${view.toLowerCase()}.html`, await page.content());
    await page.screenshot({ path: `${out}-${tag}-${view.toLowerCase()}.png`, fullPage: true });
  }
};
await scan(before, "off");
await page.locator("[data-presenting-switch]").click();
await page.waitForTimeout(1500);
console.log("toggle now reads:", await page.locator("[data-presenting-switch]").innerText());
await scan(after, "on");
await page.locator("[data-presenting-switch]").click();
writeFileSync(`${out}-present.json`, JSON.stringify({ private_strings: PRIVATE, presenting_off: before, presenting_on: after }, null, 2));
console.log("off:", JSON.stringify(before)); console.log("on:", JSON.stringify(after));
await browser.close();
