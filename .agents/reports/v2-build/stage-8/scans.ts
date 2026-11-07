// Scans: axe on every view (wide and phone), 390 px sideways scroll, console errors, and a keyboard-only Tab pass with a visible-ring check on Conversation.
// "with parts" runs repeat Conversation with the stand-in agent's 15-part panel open (see panel-harness.ts).
import { launch, open, save, OUT, AXE } from "./lib.ts";
import { installHarness, catalogue } from "./panel-harness.ts";
const b = await launch(); const result: Record<string, any> = {};
const VIEWS: [string, string][] = [["Today", "1"], ["Conversation", "5"], ["Explore", "2"], ["Decide", "3"], ["Work", "4"]];
const axeOf = async (page: any) => { await page.addScriptTag({ path: AXE }); return page.evaluate(async () => { const r = await (window as any).axe.run(document, { resultTypes: ["violations"] }); return { violations: r.violations.map((v: any) => ({ id: v.id, impact: v.impact, count: v.nodes.length, first: v.nodes[0]?.target?.join(" ") })) }; }); };
for (const [w, h, tag] of [[1440, 900, "wide"], [390, 844, "phone"]] as const) {
  for (const withParts of [false, true]) {
    const { page, errors } = await open(b, w, h);
    if (withParts) { const hs = await installHarness(page); const cat = await catalogue(); hs.agent({ tool: "show_surface", surface: { id: "all_parts", title: "All fifteen parts", step: null, blocks: Object.values(cat).map((e) => e.example) } }); }
    for (const [view, key] of VIEWS) {
      if (withParts && view !== "Conversation") continue;
      await page.keyboard.press(`Control+${key}`); await page.waitForTimeout(withParts ? 3500 : 1800);
      const name = `${tag}${withParts ? "-parts" : ""}:${view}`;
      await page.screenshot({ path: `${OUT}/scan-${tag}${withParts ? "-parts" : ""}-${view.toLowerCase()}.png`, fullPage: tag === "wide" && !withParts });
      const a = await axeOf(page);
      result[name] = { axe_violations: a.violations, horizontal_scroll: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth) };
    }
    result[`${tag}${withParts ? "-parts" : ""}:console_errors`] = errors;
    await page.close();
  }
}
// Keyboard: Tab through Conversation. The composer box draws its ring on its card; Esc leaves the box.
for (const withParts of [false, true]) {
  const { page } = await open(b, 1440, 900);
  if (withParts) { const hs = await installHarness(page); const cat = await catalogue(); hs.agent({ tool: "show_surface", surface: { id: "all_parts", title: "All fifteen parts", step: null, blocks: Object.values(cat).map((e) => e.example) } }); }
  await page.keyboard.press("Control+5"); await page.waitForTimeout(withParts ? 3500 : 1500);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  const stops: string[] = []; const noRing: string[] = []; let lastShot = false;
  for (let i = 0; i < 160; i++) {
    if (await page.evaluate(() => document.activeElement?.tagName === "TEXTAREA" && !!document.activeElement.closest(".cv-box"))) await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
    const s = await page.evaluate(() => {
      const e = document.activeElement as HTMLElement | null; if (!e || e === document.body) return { n: "body", ring: true };
      const cs = getComputedStyle(e);
      const drawn = (c: CSSStyleDeclaration) => (c.outlineStyle !== "none" && parseFloat(c.outlineWidth) > 0) || c.boxShadow !== "none";
      const card = e.tagName === "TEXTAREA" ? e.closest(".cv-box") : null;
      // A graph node draws its focus as a thicker accent border on its box (outline is off on purpose), so that counts.
      const box = e.classList.contains("hb-node") ? e.querySelector("rect") : null;
      const ring = drawn(cs) || (card !== null && drawn(getComputedStyle(card))) || (box !== null && parseFloat(getComputedStyle(box).strokeWidth) >= 2.5);
      return { n: `${e.tagName.toLowerCase()}:${(e.getAttribute("aria-label") || e.innerText || e.getAttribute("placeholder") || e.getAttribute("name") || "").trim().replace(/\s+/g, " ").slice(0, 40)}`, ring };
    });
    stops.push(s.n); if (!s.ring) noRing.push(`${i}:${s.n}`);
    if (i > 8 && stops.slice(0, -1).filter((x) => x === s.n).length > 0 && stops[0] === s.n) break;
    if (!lastShot && i === 12) { await page.screenshot({ path: `${OUT}/scan-keyboard-focus${withParts ? "-parts" : ""}.png` }); lastShot = true; }
  }
  result[`keyboard${withParts ? "-parts" : ""}`] = { tab_stops: stops.length, distinct: new Set(stops).size, without_focus_ring: noRing, stops };
  await page.close();
}
save("scans-log.json", result);
for (const [k, v] of Object.entries(result)) console.log(k, k.includes("console") ? (v as any[]).length : k.startsWith("keyboard") ? JSON.stringify({ stops: v.tab_stops, distinct: v.distinct, noRing: v.without_focus_ring }) : `axe ${(v.axe_violations as any[]).map((a) => `${a.id}/${a.impact}x${a.count}`).join(",") || "none"}; hscroll ${v.horizontal_scroll}`);
await b.close();
