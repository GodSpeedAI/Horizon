// Journey 8: the box is also a command line.
import { launch, open, toConversation, rowsText, save, OUT, BASE } from "./lib.ts";
const b = await launch(); const { page, errors } = await open(b); const log: Record<string, unknown> = {};
await toConversation(page);
const box = page.locator("textarea").first();
// 1. "/" shows the hint list.
await box.click(); await box.fill("/"); await page.waitForTimeout(400);
log.hint_list = await page.locator("[aria-label='Commands you can type'] li").allInnerTexts();
await page.screenshot({ path: `${OUT}/j8-1-slash-hints.png` });
await box.fill("/fi"); await page.waitForTimeout(300); log.hint_list_after_fi = await page.locator("[aria-label='Commands you can type'] li").allInnerTexts();
// 2. /find <word> records one find entry.
const finds = async () => (await (await fetch(`${BASE}/desk/conversation`)).json() as any).rows.filter((r: any) => r.kind === "find").length;
const f0 = await finds(); await box.fill("/find release"); await page.keyboard.press("Enter"); await page.waitForTimeout(2500);
const f1 = await finds(); log.find_entries_before = f0; log.find_entries_after = f1; log.find_added_exactly_one = f1 === f0 + 1;
await page.screenshot({ path: `${OUT}/j8-2-find.png` });
await toConversation(page); await page.waitForTimeout(1500);
log.find_row = (await rowsText(page)).filter((r) => /Find: release/.test(r)).slice(-1);
// 3. /nope
await toConversation(page); await box.click(); await box.fill("/nope"); await page.keyboard.press("Enter"); await page.waitForTimeout(600);
log.nope_notice = await page.locator("[data-notice]").allInnerTexts();
log.nope_exact = (log.nope_notice as string[]).some((t) => t.includes("No command called /nope. Try /find, /handoff, /note, /done or /hold."));
await page.screenshot({ path: `${OUT}/j8-3-nope.png` });
// 4. /done on a waiting step opens the preview; nothing changes without Confirm.
const snapState = async () => ({ decide: ((await (await fetch(`${BASE}/desk/decide.json`)).json()) as any).cards.length, conversation: ((await (await fetch(`${BASE}/desk/conversation`)).json()) as any).rows.length });
const s0 = await snapState();
await toConversation(page); await box.click(); await box.fill("/done 1"); await page.keyboard.press("Enter"); await page.waitForTimeout(1800);
log.done_preview_open = (await page.locator("#decision-preview").count()) === 1;
log.done_preview_text = (await page.locator("#decision-preview").innerText().catch(() => "NO PREVIEW")).replace(/\s+/g, " ");
log.confirm_button_present = (await page.locator("[data-confirm]").count()) === 1;
await page.screenshot({ path: `${OUT}/j8-4-done-preview.png`, fullPage: true });
await page.waitForTimeout(3000);
const s1 = await snapState(); log.state_before = s0; log.state_after_preview_without_confirm = s1; log.nothing_changed = JSON.stringify(s0) === JSON.stringify(s1);
// Leave the preview with Esc (still not confirming) and check again.
await page.keyboard.press("Escape"); await page.waitForTimeout(1500);
log.preview_closed_by_esc = (await page.locator("#decision-preview").count()) === 0;
const s2 = await snapState(); log.nothing_changed_after_esc = JSON.stringify(s0) === JSON.stringify(s2);
// /hold likewise
await toConversation(page); await box.click(); await box.fill("/hold 1"); await page.keyboard.press("Enter"); await page.waitForTimeout(1800);
log.hold_preview_open = (await page.locator("#decision-preview").count()) === 1; await page.keyboard.press("Escape"); await page.waitForTimeout(800);
log.nothing_changed_after_hold_preview = JSON.stringify(s0) === JSON.stringify(await snapState());
log.console_errors = errors;
save("j8-log.json", log); console.log(JSON.stringify(log, null, 1)); await b.close();
