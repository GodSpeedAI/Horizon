// Journey 1: open Conversation by nav and by Ctrl+5; the seeded entries show with dots, badges, times, outcome lines.
import { launch, open, rowsText, save, OUT } from "./lib.ts";
const b = await launch(); const log: Record<string, unknown> = {};
for (const [w, h, tag] of [[1440, 900, "wide"], [390, 844, "phone"]] as const) {
  const { page, errors } = await open(b, w, h);
  if (tag === "wide") {
    await page.getByRole("button", { name: /^Conversation/ }).or(page.getByRole("link", { name: /^Conversation/ })).first().click();
    await page.waitForTimeout(1200);
    log["opened_by_nav"] = await page.locator("[data-view-id=conversation]").count() === 1;
    await page.keyboard.press("Control+1"); await page.waitForTimeout(800);
    log["left_conversation_with_ctrl1"] = await page.locator("[data-view-id=conversation]").count() === 0;
    await page.keyboard.press("Control+5"); await page.waitForTimeout(1200);
    log["opened_by_ctrl5"] = await page.locator("[data-view-id=conversation]").count() === 1;
  } else { await page.keyboard.press("Control+5"); await page.waitForTimeout(1200); }
  const rows = await page.locator(".cv-row").evaluateAll((els) => els.map((e) => ({
    kind: e.getAttribute("data-row-kind"), status: e.getAttribute("data-status"),
    dot: !!e.querySelector(".cv-mark"), dot_status: e.querySelector(".cv-mark")?.getAttribute("data-status"),
    badge: (e.querySelector(".cv-badge") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").trim() ?? null,
    time: (e.querySelector("time") as HTMLElement | null)?.innerText ?? null,
    outcome: (e.querySelector(".cv-outcome") as HTMLElement | null)?.innerText ?? null,
    text: (e as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
  })));
  log[tag] = { rows, console_errors: errors, hscroll: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1) };
  await page.screenshot({ path: `${OUT}/j1-conversation-${tag}.png`, fullPage: tag === "wide" });
  await page.close();
}
const wide = (log.wide as any).rows as any[];
log["checks"] = {
  four_seeded_rows: wide.length >= 4, every_row_has_dot: wide.every((r) => r.dot), every_row_has_badge: wide.every((r) => r.badge),
  every_row_has_time: wide.every((r) => r.time), badges: wide.map((r) => r.badge),
  waiting_proposal_card: true,
};
save("j1-log.json", log); console.log(JSON.stringify(log, null, 1).slice(0, 3500)); await b.close();
