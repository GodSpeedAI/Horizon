// Walk Today, Explore, Decide and Work; screenshot each; run axe on each; then a keyboard-only pass.
import { chromium } from "/home/sprime01/projects/Horizon/node_modules/playwright-core/index.mjs";
import { readdirSync, writeFileSync } from "node:fs";
const out = process.argv[2]!;
const AXE = "/home/sprime01/projects/cognate/landing/node_modules/axe-core/axe.min.js";
const root = `${process.env.HOME}/.cache/ms-playwright`;
const exe = `${root}/${readdirSync(root).find((d) => d.startsWith("chromium-"))}/chrome-linux64/chrome`;
const browser = await chromium.launch({ executablePath: exe, headless: true });
const result: Record<string, unknown> = {};
for (const [vw, vh, tag] of [[1440, 900, "wide"], [390, 844, "phone"]] as const) {
  const page = await browser.newPage({ viewport: { width: vw, height: vh }, bypassCSP: true });
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("http://127.0.0.1:4339/desk", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  for (const view of ["Today", "Explore", "Decide", "Work"]) {
    const link = page.getByRole("link", { name: new RegExp(`^${view}`) }).or(page.getByRole("button", { name: new RegExp(`^▸? ?${view}`) })).first();
    if (await link.count()) await link.click(); else await page.goto(`http://127.0.0.1:4339/desk/${view.toLowerCase()}`);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${out}-${tag}-${view.toLowerCase()}.png`, fullPage: tag === "wide" });
    await page.addScriptTag({ path: AXE });
    const axe = await page.evaluate(async () => {
      // @ts-ignore
      const r = await window.axe.run(document, { resultTypes: ["violations"] });
      return r.violations.map((v: any) => ({ id: v.id, impact: v.impact, count: v.nodes.length, first: v.nodes[0]?.target?.join(" ") }));
    });
    const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    result[`${tag}:${view}`] = { axe, horizontal_scroll: hscroll, words: (await page.innerText("body")).length };
  }
  result[`${tag}:console_errors`] = errors;
  await page.close();
}
// Keyboard only: Tab through the page, record what gets focus and whether a focus ring shows.
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://127.0.0.1:4339/desk", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const stops: string[] = []; let noRing = 0;
for (let i = 0; i < 60; i++) {
  // Tab inside the composer box changes its mode (by design); Esc leaves the box, as the key hints say.
  if (await page.evaluate(() => document.activeElement?.tagName === "TEXTAREA")) await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  const s = await page.evaluate(() => {
    const e = document.activeElement as HTMLElement | null; if (!e) return { n: "none", ring: false };
    const cs = getComputedStyle(e);
    const drawn = (c: CSSStyleDeclaration) => (c.outlineStyle !== "none" && parseFloat(c.outlineWidth) > 0) || c.boxShadow !== "none";
    // The composer box's ring is drawn by its card (.cv-box:has(textarea:focus-visible)), so the card counts for the box.
    const card = e.tagName === "TEXTAREA" ? e.closest(".cv-box") : null;
    const ring = drawn(cs) || (card !== null && drawn(getComputedStyle(card)) && getComputedStyle(card).outlineStyle !== "none");
    return { n: `${e.tagName.toLowerCase()}:${(e.getAttribute("aria-label") || e.innerText || e.getAttribute("placeholder") || "").trim().slice(0, 40)}`, ring };
  });
  stops.push(s.n); if (!s.ring) noRing++;
}
await page.screenshot({ path: `${out}-keyboard-focus.png` });
result.keyboard = { tab_stops: stops.length, distinct: new Set(stops).size, without_focus_ring: noRing, first: stops.slice(0, 12) };
writeFileSync(`${out}-walk.json`, JSON.stringify(result, null, 2));
const summary = Object.entries(result).map(([k, v]: any) => k.includes("console") ? `${k}: ${v.length}` : k === "keyboard" ? `keyboard: ${JSON.stringify({ ...v, first: undefined })}` : `${k}: axe ${v.axe.map((a: any) => `${a.id}/${a.impact}x${a.count}`).join(",") || "none"}; hscroll ${v.horizontal_scroll}`);
console.log(summary.join("\n"));
await browser.close();
