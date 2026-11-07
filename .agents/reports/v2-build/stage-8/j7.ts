// Journey 7: reload. Everything from journeys 2 to 5 is still there. Rows from 2 to 4 come from the live stored conversation; the panel from 5 is held by the stand-in agent (see panel-harness.ts).
import { launch, open, toConversation, rowsText, save, OUT, BASE } from "./lib.ts";
import { installHarness, catalogue } from "./panel-harness.ts";
const b = await launch(); const { page, errors } = await open(b); const log: Record<string, unknown> = {};
const h = await installHarness(page); const cat = await catalogue();
h.agent({ tool: "show_surface", surface: { id: "reload_panel", title: "Reload check", step: null, blocks: [cat.callout!.example, { ...cat.ask!.example, id: "reload_ask" }] } });
await toConversation(page); await page.waitForTimeout(3500);
await page.locator("fieldset.hb-ask[data-input=select]").first().getByRole("radio").first().check();
await page.getByRole("button", { name: /^Answer/ }).first().click(); await page.waitForTimeout(1200);
h.agent({ tool: "answer.route", panel_id: "reload_panel", ask_id: "reload_ask", routed_as: "step handoff_0a49 in Seed: triage inbox" });
await page.waitForTimeout(3500);
const snap = async () => {
  for (const d of await page.locator("details").all()) if (!(await d.evaluate((e: HTMLDetailsElement) => e.open))) await d.locator("summary").first().click().catch(() => undefined);
  return { rows: await rowsText(page), echo: await page.locator(".hb-ask[data-state=routed]").allTextContents() };
};
const before = await snap();
await page.screenshot({ path: `${OUT}/j7-1-before-reload.png` });
await page.reload({ waitUntil: "networkidle" }); await page.waitForTimeout(1500); await toConversation(page); await page.waitForTimeout(3500);
const after = await snap();
await page.screenshot({ path: `${OUT}/j7-2-after-reload.png` });
const key = (r: string) => r.replace(/\s+/g, " ").replace(/\d\d:\d\d [AP]M/g, "");
log.rows_before = before.rows.length; log.rows_after = after.rows.length;
log.same_rows = JSON.stringify(before.rows.map(key)) === JSON.stringify(after.rows.map(key));
log.missing_after_reload = before.rows.map(key).filter((r) => !after.rows.map(key).includes(r));
log.echo_before = before.echo; log.echo_after = after.echo; log.echo_same = JSON.stringify(before.echo) === JSON.stringify(after.echo);
// A brand new browser context (no stand-in): the stored rows of journeys 2 to 4 are still on the server.
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p2 = await ctx.newPage(); await p2.goto(`${BASE}/desk`, { waitUntil: "networkidle" }); await p2.keyboard.press("Control+5"); await p2.waitForTimeout(2500);
const fresh = (await rowsText(p2)).map(key);
const want = [/Stage 8 proof: draft the weekly release summary.*You/, /Stage 8 proof: list open questions.*You/, /Stage 8 proof: agent suggests a changelog check.*Agent on this page.*Handed off/, /something you do not want.*Discarded by you\. Nothing was sent\./];
log.fresh_context_has = Object.fromEntries(want.map((w) => [String(w), fresh.some((r) => w.test(r))]));
await p2.screenshot({ path: `${OUT}/j7-3-fresh-browser.png` });
log.console_errors = errors;
save("j7-log.json", log); console.log(JSON.stringify(log, null, 1)); await b.close();
