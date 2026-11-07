// Presenting on: screenshot Conversation and the 15-part panel, save the page text and the two JSON reads for the names scan.
// Then a word scan of the visible Conversation text (Presenting off). Run: bun presenting-words.ts
import { launch, open, save, OUT, BASE } from "./lib.ts";
import { installHarness, catalogue } from "./panel-harness.ts";
import { mkdirSync, writeFileSync } from "node:fs";
const b = await launch(); const log: Record<string, any> = {};
const dir = `${OUT}/presenting-on`; mkdirSync(dir, { recursive: true });
const { page, errors } = await open(b, 1440, 1000);
const hs = await installHarness(page); const cat = await catalogue();
const open15 = () => hs.agent({ tool: "show_surface", surface: { id: "all_parts", title: "All fifteen parts", step: null, blocks: Object.values(cat).map((e) => e.example) } });
const unfold = async () => { await page.evaluate(() => document.querySelectorAll("details").forEach((d) => ((d as HTMLDetailsElement).open = true))); await page.waitForTimeout(300); };
// --- word scan, Presenting off ---
const WORDS = [/WebMCP/i, /\brows?\b/i, /\bpanels?\b/i, /\bblocks?\b/i, /\bschema\b/i, /\bdrafts?\b/i, /\bintents?\b/i, /\bpayload\b/i, /\brow:/i, /handoff_/i];
const scanWords = (t: string) => WORDS.map((w) => ({ word: String(w), hits: [...t.matchAll(new RegExp(w.source, "gi"))].map((m) => t.slice(Math.max(0, m.index! - 40), m.index! + 50).replace(/\s+/g, " ")).slice(0, 5) })).filter((x) => x.hits.length > 0);
await page.keyboard.press("Control+5"); await page.waitForTimeout(2500); await unfold();
const textPlain = await page.innerText("body"); writeFileSync(`${OUT}/words-conversation-real.txt`, textPlain);
log.word_scan_real_conversation = scanWords(textPlain);
open15(); await page.waitForTimeout(3500); await unfold();
const textParts = await page.innerText("body"); writeFileSync(`${OUT}/words-conversation-with-parts.txt`, textParts);
log.word_scan_with_15_parts = scanWords(textParts);
// Answer and route, then scan the echo rows too.
await page.locator("fieldset.hb-ask[data-input=select]").first().getByRole("radio").first().check(); await page.getByRole("button", { name: /^Answer/ }).first().click(); await page.waitForTimeout(1500);
hs.agent({ tool: "answer.route", panel_id: "all_parts", ask_id: "which_way", routed_as: "no action: the agent chose Plan A" }); await page.waitForTimeout(3500); await unfold();
const textAnswered = await page.innerText("body"); writeFileSync(`${OUT}/words-conversation-answered.txt`, textAnswered);
log.word_scan_after_answer = scanWords(textAnswered);
// --- Presenting on ---
await page.locator("[data-presenting-switch]").click(); await page.waitForTimeout(2500);
log.toggle_reads = await page.locator("[data-presenting-switch]").innerText();
await page.keyboard.press("Control+5"); await page.waitForTimeout(3500); await unfold();
await page.screenshot({ path: `${OUT}/presenting-conversation.png` });
await page.setViewportSize({ width: 1440, height: 5200 }); await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/presenting-15-parts.png` });
await page.setViewportSize({ width: 1440, height: 1000 });
writeFileSync(`${dir}/conversation-page.txt`, await page.innerText("body")); writeFileSync(`${dir}/conversation-page.html`, await page.content());
for (const [name, url] of [["conversation.json", "/desk/conversation"], ["state.json", "/desk/state.json"], ["decide.json", "/desk/decide.json"], ["catalogue.json", "/desk/panels/catalogue"]] as const) writeFileSync(`${dir}/${name}`, await (await fetch(`${BASE}${url}`)).text());
log.presenting_was_on_server_side = (await (await fetch(`${BASE}/desk/state.json`)).json() as any).status?.presenting;
await page.locator("[data-presenting-switch]").click(); await page.waitForTimeout(1500);
log.toggle_after = await page.locator("[data-presenting-switch]").innerText();
log.console_errors = errors;
save("presenting-words-log.json", log); console.log(JSON.stringify(log, null, 1)); await b.close();
