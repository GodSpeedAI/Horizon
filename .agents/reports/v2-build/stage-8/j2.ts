// Journey 2: you hand off from the composer - plain words in Hand off mode, then via /handoff <words>. Preview card, Confirm, row shows You and done.
import { launch, open, toConversation, rowsText, save, OUT } from "./lib.ts";
const b = await launch(); const { page, errors } = await open(b); const log: Record<string, unknown> = {};
await toConversation(page);
const before = (await rowsText(page)).length;
// A) Hand off mode, plain words.
for (let i = 0; i < 4; i++) { const label = await page.locator(".cv-chip").first().getAttribute("aria-label"); if (label?.includes("Hand off")) break; await page.locator(".cv-chip").first().click(); }
log.mode = await page.locator(".cv-chip").first().getAttribute("aria-label");
await page.locator("textarea").fill("Stage 8 proof: draft the weekly release summary");
await page.keyboard.press("Enter"); await page.waitForTimeout(3000);
log.preview_a = await page.locator("[aria-label='Hand off preview']").innerText().catch(() => "NO PREVIEW");
await page.screenshot({ path: `${OUT}/j2-a-preview.png`, fullPage: true });
await page.locator("[data-confirm-handoff]").first().click(); await page.waitForTimeout(8000);
await page.screenshot({ path: `${OUT}/j2-a-after.png`, fullPage: true });
const afterA = await rowsText(page); log.rows_after_a = afterA.slice(before);
// B) /handoff <words> in any mode.
await page.locator("textarea").fill("/handoff Stage 8 proof: list open questions for the review");
await page.keyboard.press("Enter"); await page.waitForTimeout(3000);
log.preview_b = await page.locator("[aria-label='Hand off preview']").innerText().catch(() => "NO PREVIEW");
await page.screenshot({ path: `${OUT}/j2-b-preview.png`, fullPage: true });
await page.locator("[data-confirm-handoff]").first().click(); await page.waitForTimeout(8000);
await page.screenshot({ path: `${OUT}/j2-b-after.png`, fullPage: true });
const afterB = await rowsText(page); log.rows_after_b = afterB.slice(afterA.length);
const rows = await page.locator(".cv-row").evaluateAll((els) => els.map((e) => ({ kind: e.getAttribute("data-row-kind"), status: e.getAttribute("data-status"), badge: (e.querySelector(".cv-badge") as HTMLElement | null)?.innerText, text: (e as HTMLElement).innerText.replace(/\s+/g, " ") })));
log.new_handoff_rows = rows.filter((r) => /Stage 8 proof/.test(r.text));
log.console_errors = errors;
save("j2-log.json", log); console.log(JSON.stringify(log, null, 1)); await b.close();
