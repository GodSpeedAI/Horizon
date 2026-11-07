// Journey 5: an agent puts up a panel with all 15 parts and a question; you answer; the agent routes the answer; other asks; withdraw.
// The agent side is the stand-in in panel-harness.ts (see its header): the live server has no route for agent panel calls.
import { launch, open, toConversation, save, OUT } from "./lib.ts";
import { installHarness, catalogue } from "./panel-harness.ts";
const b = await launch(); const { page, errors } = await open(b, 1440, 1000); const log: Record<string, unknown> = {};
const h = await installHarness(page);
const cat = await catalogue();
log.catalogue_types = Object.keys(cat);
// Panel A: one part of each of the 15 types, the select ask included (the catalogue's own examples).
log.show_all = h.agent({ tool: "show_surface", surface: { id: "all_parts", title: "All fifteen parts", step: null, blocks: Object.values(cat).map((e) => e.example) } });
await toConversation(page); await page.waitForTimeout(3500);
await page.setViewportSize({ width: 1440, height: 5200 }); await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/j5-1-all-parts-wide.png` });
await page.setViewportSize({ width: 1440, height: 1000 }); await page.waitForTimeout(400);
const parts = await page.locator("section.hb").evaluateAll((els) => els.map((e) => ({ type: e.getAttribute("data-block"), from_agent: e.getAttribute("data-from-agent"), text: (e as HTMLElement).innerText.replace(/\s+/g, " ").slice(0, 160) })));
log.parts_drawn = parts; log.part_types_drawn = [...new Set(parts.map((p) => p.type))].sort();
log.missing_types = Object.keys(cat).filter((t) => !parts.some((p) => p.type === t));
log.cannot_be_shown_lines = await page.locator(".hb-fallback").evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText));
log.panel_text_has_cannot_show = /cannot be shown|could not be shown/i.test(await page.innerText("body"));
let i = 0;
for (const s of await page.locator("section.hb").all()) { const t = await s.getAttribute("data-block"); await s.scrollIntoViewIfNeeded(); await s.screenshot({ path: `${OUT}/j5-part-${String(++i).padStart(2, "0")}-${t}.png` }); }
// Answer the select question.
const ask = page.locator("fieldset.hb-ask[data-input=select]").first();
await ask.getByRole("radio").first().check();
await page.screenshot({ path: `${OUT}/j5-2-select-picked.png`, fullPage: true });
await ask.getByRole("button", { name: /^answer/i }).first().click().catch(async () => { await page.getByRole("button", { name: /^Answer/ }).first().click(); });
await page.waitForTimeout(1500);
const unfold = async () => { for (const d of await page.locator("details.panel-card, [data-panel-id] details, details").all()) { if (!(await d.evaluate((e: HTMLDetailsElement) => e.open)) && (await d.locator(".hb-ask").count()) > 0) await d.locator("summary").first().click().catch(() => undefined); } await page.waitForTimeout(300); };
await unfold();
log.echo_after_answer = await page.locator(".hb-ask[data-state=waiting]").first().textContent().catch(() => "NO ECHO");
await page.screenshot({ path: `${OUT}/j5-3-answered-waiting-for-agent.png`, fullPage: true });
log.answer_rows = (await page.locator(".cv-row[data-row-kind=answer]").allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
// The agent says where it went.
log.route = h.agent({ tool: "answer.route", panel_id: "all_parts", ask_id: "which_way", routed_as: "step handoff_0a49 in Seed: triage inbox" });
await page.waitForTimeout(3500);
await unfold();
log.echo_after_route = await page.locator(".hb-ask[data-state=routed]").first().textContent().catch(() => "NO ROUTED ECHO");
await page.screenshot({ path: `${OUT}/j5-4-agent-took-it.png`, fullPage: true });
log.answer_rows_after_route = (await page.locator(".cv-row[data-row-kind=answer]").allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
// Panel B: confirm, multiselect, text; Panel C: an ask the agent withdraws.
const pb = { id: "more_asks", title: "Three more questions", step: null };
log.show_b = h.agent({ tool: "show_surface", surface: { ...pb, blocks: [{ ...cat.callout!.example, id: "intro", text: "Three quick questions about the release." }] } });
log.ask_confirm = h.agent({ tool: "ask_human", panel: "more_asks", ask: { id: "ship_it", input: "confirm", question: "Ship the release today?", why_needed: "Only you can decide the date.", resolves: "decision: release date" } });
log.ask_multi = h.agent({ tool: "ask_human", panel: "more_asks", ask: { id: "which_checks", input: "multiselect", question: "Which checks should I run?", why_needed: "Each check takes time.", options: [{ option_id: "unit", label: "Unit tests", consequence: "Quick." }, { option_id: "e2e", label: "End-to-end", consequence: "Slow, but thorough." }, { option_id: "lint", label: "Lint" }] } });
log.ask_text = h.agent({ tool: "ask_human", panel: "more_asks", ask: { id: "what_name", input: "text", question: "What should the report be called?", why_needed: "It names the file." } });
log.show_c = h.agent({ tool: "show_surface", surface: { id: "withdraw_me", title: "A question taken back", step: null, blocks: [] } });
log.ask_withdraw_src = h.agent({ tool: "ask_human", panel: "withdraw_me", ask: { id: "old_q", input: "confirm", question: "Is the staging copy current?", why_needed: "To pick the right build." } });
await page.waitForTimeout(3500);
await page.screenshot({ path: `${OUT}/j5-5-more-asks-open.png`, fullPage: true });
const q = (id: string) => page.locator("fieldset.hb-ask").filter({ hasText: id });
// confirm
const conf = page.locator("fieldset.hb-ask[data-input=confirm]").filter({ hasText: "Ship the release" });
await conf.getByRole("radio", { name: /yes/i }).check().catch(async () => { await conf.getByText(/^Yes/).first().click(); });
await conf.getByRole("button", { name: /^answer/i }).first().click(); await page.waitForTimeout(800);
// multiselect
const multi = page.locator("fieldset.hb-ask[data-input=multiselect]");
await multi.getByRole("checkbox").nth(0).check(); await multi.getByRole("checkbox").nth(1).check();
await multi.getByRole("button", { name: /^answer/i }).first().click(); await page.waitForTimeout(800);
// text
const txt = page.locator("fieldset.hb-ask[data-input=text]");
await txt.locator("input[type=text], input:not([type])").first().fill("Release readiness report");
await txt.getByRole("button", { name: /^answer/i }).first().click(); await page.waitForTimeout(800);
await unfold();
log.echoes_waiting = await page.locator(".hb-ask[data-state=waiting]").allTextContents();
await page.screenshot({ path: `${OUT}/j5-6-three-answered.png`, fullPage: true });
log.route_confirm = h.agent({ tool: "answer.route", panel_id: "more_asks", ask_id: "ship_it", routed_as: "decision: release date set to today" });
log.route_multi = h.agent({ tool: "answer.route", panel_id: "more_asks", ask_id: "which_checks", routed_as: "no action: I run both from the build job" });
log.route_short = h.agent({ tool: "answer.route", panel_id: "more_asks", ask_id: "what_name", routed_as: "ok" }); // too short, refused
log.route_text = h.agent({ tool: "answer.route", panel_id: "more_asks", ask_id: "what_name", routed_as: "file name in the release step" });
log.withdraw = h.agent({ tool: "ask.withdraw", panel_id: "withdraw_me", ask_id: "old_q", reason: "I found the answer in the build log myself." });
await page.waitForTimeout(3500);
await unfold();
log.echoes_routed = await page.locator(".hb-ask[data-state=routed]").allTextContents();
log.withdrawn_text = await page.locator(".hb-ask[data-state=withdrawn]").allTextContents();
await page.screenshot({ path: `${OUT}/j5-7-routed-and-withdrawn.png`, fullPage: true });
// Phone view of the 15 parts.
await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/j5-8-phone.png`, fullPage: true });
log.phone_hscroll = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
log.agent_calls = h.log; log.console_errors = errors;
save("j5-log.json", log);
console.log(JSON.stringify({ ...log, parts_drawn: undefined, agent_calls: undefined, catalogue_types: undefined }, null, 1));
await b.close();
