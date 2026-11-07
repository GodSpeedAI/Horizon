// Stage 7 proof: the conversation and composer. Screenshots, an axe scan with the composer open, and a keyboard walk.
// Never confirms a hand off: it previews, then Cancels.
import { chromium } from "/home/sprime01/projects/Horizon/node_modules/playwright-core/index.mjs";
import { readdirSync, writeFileSync } from "node:fs";
const out = process.argv[2]!;
const AXE = "/home/sprime01/projects/cognate/landing/node_modules/axe-core/axe.min.js";
const root = `${process.env.HOME}/.cache/ms-playwright`;
const exe = `${root}/${readdirSync(root).find((d) => d.startsWith("chromium-"))}/chrome-linux64/chrome`;
const browser = await chromium.launch({ executablePath: exe, headless: true });
const URL = "http://127.0.0.1:4339/desk";
const report: Record<string, unknown> = {};
const open = async (w: number, h: number, scheme: "light" | "dark" = "light") => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, bypassCSP: true, colorScheme: scheme });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  return page;
};
const toMode = async (page: any, label: string) => {
  for (let i = 0; i < 4; i++) {
    const t = (await page.locator(".mode-tag").innerText()).trim();
    if (t.startsWith(label)) return;
    await page.locator(".mode-tag").click();
  }
};
const hscroll = (page: any) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

// 1. Empty composer, wide and phone.
for (const [w, h, tag] of [[1440, 900, "wide"], [390, 844, "phone"]] as const) {
  const page = await open(w, h);
  await page.screenshot({ path: `${out}/composer-empty-${tag}.png` });
  report[`${tag}:hscroll`] = await hscroll(page);
  await page.close();
}

// 2. Hand off preview card, after Cancel, Write mode, dark; axe with the card open.
const page = await open(1440, 900);
await toMode(page, "Hand off");
await page.locator("#composer-input").fill("Fix the checkout total");
await page.locator("#composer-input").press("Enter");
await page.locator("[data-confirm-handoff]").waitFor({ timeout: 8000 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/composer-handoff-preview.png` });
await page.addScriptTag({ path: AXE });
const axe = await page.evaluate(async () => {
  // @ts-ignore
  const r = await window.axe.run(document, { resultTypes: ["violations"] });
  return r.violations.map((v: any) => ({ id: v.id, impact: v.impact, count: v.nodes.length, first: v.nodes[0]?.target?.join(" ") }));
});
report.axe_with_preview_open = axe;
await page.getByRole("button", { name: "Cancel" }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/composer-thread-after-cancel.png` });
// Axe again with the thread showing and the composer idle.
const axeIdle = await page.evaluate(async () => {
  // @ts-ignore
  const r = await window.axe.run(document, { resultTypes: ["violations"] });
  return r.violations.map((v: any) => ({ id: v.id, impact: v.impact, count: v.nodes.length }));
});
report.axe_thread_idle = axeIdle;
writeFileSync(`${out}/axe.json`, JSON.stringify({ url: URL, with_preview_open: { violations: axe.length, detail: axe }, thread_after_cancel: { violations: axeIdle.length, detail: axeIdle } }, null, 2));
await toMode(page, "Write");
await page.locator("#composer-input").fill("Call the supplier about the invoice");
await page.screenshot({ path: `${out}/composer-write.png` });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: `${out}/composer-thread-phone.png` });
report["phone:thread hscroll"] = await hscroll(page);
await page.close();

// 3. Dark mode, with a preview card.
const dark = await open(1440, 900, "dark");
await toMode(dark, "Hand off");
await dark.locator("#composer-input").fill("Fix the checkout total");
await dark.locator("#composer-input").press("Enter");
await dark.locator("[data-confirm-handoff]").waitFor({ timeout: 8000 });
await dark.screenshot({ path: `${out}/composer-handoff-preview-dark.png` });
await dark.getByRole("button", { name: "Cancel" }).click();
await dark.close();

// 4. Keyboard walk. Tab inside the box changes the mode (by design), so the walk goes forward to the box, then backward from the end of the page.
const kb = await open(1440, 900);
const describe = () => {
  const e = document.activeElement as HTMLElement | null;
  if (!e) return { n: "none", ring: false, inComposer: false };
  const cs = getComputedStyle(e);
  const box = e.closest(".cv-box") as HTMLElement | null;
  let ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
  if (!ring && box) { const b = getComputedStyle(box); ring = b.outlineStyle !== "none" && parseFloat(b.outlineWidth) > 0; }
  return { n: `${e.tagName.toLowerCase()}:${(e.getAttribute("aria-label") || (e as HTMLInputElement).placeholder || e.innerText || "").trim().slice(0, 40)}`, ring, inComposer: !!e.closest(".convo") };
};
await toMode(kb, "Hand off");
await kb.locator("#composer-input").fill("Fix the checkout total");
await kb.locator("#composer-input").press("Enter");
await kb.locator("[data-confirm-handoff]").waitFor({ timeout: 8000 });
await kb.locator("body").click({ position: { x: 5, y: 5 } });
const stops: { n: string; ring: boolean; inComposer: boolean }[] = [];
await kb.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
// Backward from the end: reaches the send button, the chips and the box.
await kb.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
for (let i = 0; i < 70; i++) { await kb.keyboard.press("Shift+Tab"); stops.push(await kb.evaluate(describe)); }
const inC = stops.filter((s) => s.inComposer);
const names = [...new Set(inC.map((s) => s.n))];
await kb.screenshot({ path: `${out}/composer-keyboard-focus.png` });
report.keyboard = { stops: stops.length, composer_stops: names, composer_without_focus_ring: inC.filter((s) => !s.ring).map((s) => s.n) };
await kb.getByRole("button", { name: "Cancel" }).click();
await kb.close();
writeFileSync(`${out}/composer-walk.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
