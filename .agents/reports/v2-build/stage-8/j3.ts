// Journey 3: an agent on the page proposes through the page tools (document.modelContext). Confirm -> done; discard -> "Nothing was sent."
import { BASE, launch, open, toConversation, rowsText, save, OUT } from "./lib.ts";
const b = await launch(); const { page, errors } = await open(b); const log: Record<string, unknown> = {};
const failed: string[] = [];
page.on("console", (m) => { if (m.type() === "error") failed.push(`console@${new Date().toISOString().slice(11,19)} ${JSON.stringify(m.location())}`); });
page.on("request", (q) => { if (q.method() !== "GET") failed.push(`${new Date().toISOString().slice(11,19)} ${q.method()} ${q.url().replace(BASE, "")}`); });
page.on("response", async (r) => { if (r.status() !== 200) failed.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, "")} ${(await r.text().catch(() => "")).slice(0, 200)}`); });
await toConversation(page);
const call = (name: string, args: unknown) => page.evaluate(async ([n, a]) => {
  const mc = (document as any).modelContext; const tools = await mc.getTools(); const t = tools.find((x: any) => x.name === n);
  if (!t) return { missing: n };
  const r = await mc.executeTool(t, JSON.stringify(a)); return typeof r === "string" ? (() => { try { return JSON.parse(r); } catch { return r; } })() : r;
}, [name, args] as const);
log.tools = await page.evaluate(async () => (await (document as any).modelContext.getTools()).map((t: any) => ({ name: t.name, description: t.description })));
log.desk_state = await call("desk_state", {});
log.desk_find = await call("desk_find", { q: "checkout" });
log.desk_inspect_first_row = await call("desk_inspect", { row_id: ((await (await fetch("http://127.0.0.1:4339/desk/conversation")).json()) as any).rows[0].row_id });
save("j3-desk_state.json", log.desk_state); save("j3-desk_find.json", log.desk_find);
// Proposal 1 - confirm.
log.propose1 = await call("desk_propose_handoff", { words: "Stage 8 proof: agent suggests a changelog check" });
await page.waitForTimeout(6500);
await page.screenshot({ path: `${OUT}/j3-1-proposal-waiting.png`, fullPage: true });
const card1 = page.locator("[data-waiting-move]").filter({ hasText: "changelog check" });
log.card1_text = await card1.innerText(); log.card1_row = await page.locator(".cv-row").filter({ hasText: "changelog check" }).first().evaluate((e) => ({ status: e.getAttribute("data-status"), badge: (e.querySelector(".cv-badge") as HTMLElement)?.innerText, text: (e as HTMLElement).innerText.replace(/\s+/g, " ") }));
await card1.locator("[data-confirm-move]").click(); await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/j3-2-confirm-preview.png`, fullPage: true });
log.preview_text = await page.locator("[aria-label='Hand off preview']").innerText().catch(() => "NO PREVIEW");
log.out_of_date_seen = (await page.locator("[data-out-of-date]").count()) > 0;
if (log.out_of_date_seen) {
  log.out_of_date_words = await page.locator("[data-out-of-date]").innerText();
  await page.screenshot({ path: `${OUT}/j3-2b-out-of-date.png`, fullPage: true });
  await page.getByRole("button", { name: /new preview/i }).first().click(); await page.waitForTimeout(3000);
}
await page.locator("[data-confirm-handoff]").first().click(); await page.waitForTimeout(8000);
await page.screenshot({ path: `${OUT}/j3-3-confirmed.png`, fullPage: true });
log.row_after_confirm = await page.locator(".cv-row").filter({ hasText: "changelog check" }).evaluateAll((els) => els.map((e) => ({ kind: e.getAttribute("data-row-kind"), status: e.getAttribute("data-status"), badge: (e.querySelector(".cv-badge") as HTMLElement)?.innerText, text: (e as HTMLElement).innerText.replace(/\s+/g, " ") })));
// Proposal 2 - discard.
log.propose2 = await call("desk_propose_handoff", { words: "Stage 8 proof: agent suggests something you do not want" });
await page.waitForTimeout(6500);
const card2 = page.locator("[data-waiting-move]").filter({ hasText: "do not want" });
await card2.locator("[data-discard-move]").click(); await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/j3-4-discarded.png`, fullPage: true });
log.row_after_discard = await page.locator(".cv-row").filter({ hasText: "do not want" }).evaluateAll((els) => els.map((e) => ({ status: e.getAttribute("data-status"), text: (e as HTMLElement).innerText.replace(/\s+/g, " ") })));
// Server side: did the discarded one reach the case keeper? Look at the conversation.
log.conversation_after = ((await (await fetch("http://127.0.0.1:4339/desk/conversation")).json()) as any).rows.map((r: any) => ({ kind: r.kind, source: r.source, status: r.status, words: r.words, outcome: r.outcome }));
log.console_errors = errors; log.failed_responses = failed;
save("j3-log.json", log); console.log(JSON.stringify({ ...log, desk_state: "(saved)", desk_find: "(saved)", conversation_after: undefined, tools: (log.tools as any[]).map((t) => t.name) }, null, 1)); await b.close();
