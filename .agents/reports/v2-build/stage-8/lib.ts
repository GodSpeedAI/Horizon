// Shared helpers for the stage 8 live proof. Deterministic: Playwright against the running testing desk, no invented numbers.
import { chromium, type Page, type Browser } from "/home/sprime01/projects/Horizon/node_modules/playwright-core/index.mjs";
import { readdirSync, writeFileSync } from "node:fs";
export const BASE = "http://127.0.0.1:4339";
export const OUT = "/home/sprime01/projects/Horizon/.agents/reports/v2-build/stage-8";
export const AXE = "/home/sprime01/projects/cognate/landing/node_modules/axe-core/axe.min.js";
const root = `${process.env.HOME}/.cache/ms-playwright`;
export const exe = `${root}/${readdirSync(root).find((d) => d.startsWith("chromium-"))}/chrome-linux64/chrome`;
export async function launch(): Promise<Browser> { return chromium.launch({ executablePath: exe, headless: true }); }
export async function open(b: Browser, w = 1440, h = 900): Promise<{ page: Page; errors: string[] }> {
  const page = await b.newPage({ viewport: { width: w, height: h }, bypassCSP: true });
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/desk`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  return { page, errors };
}
export const toConversation = async (page: Page) => { await page.keyboard.press("Control+5"); await page.waitForTimeout(1200); };
export const save = (name: string, data: unknown) => writeFileSync(`${OUT}/${name}`, JSON.stringify(data, null, 2));
export const rowsText = (page: Page) => page.locator(".cv-row").evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim()));
