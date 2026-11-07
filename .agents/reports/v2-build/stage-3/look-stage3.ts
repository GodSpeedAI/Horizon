// Visual check of the stage 3 desk: starts the application in-process (not ignite) with a fake case keeper, seeds two decision cards, and drives the real bundle in Chromium.
import { chromium } from "/home/sprime01/projects/Horizon/node_modules/playwright-core/index.mjs";
import { readdirSync } from "node:fs";
import { startDeskApp } from "/home/sprime01/projects/Horizon/test/support/desk-app.ts";
import { fakeCaseKeeper } from "/home/sprime01/projects/Horizon/test/support/fake-case-keeper.ts";

const out = process.argv[2]!;
let digest = "sha256:d1";
const row = (id: string, at: string) => ({ approval_id: id, case_id: "case_1", plan_item_id: `step_${id}`, requested_at: at, expires_at: "2099-11-09T10:00:00Z", expired: false, digest: { ref: `approval:${id}`, expected_digest: id === "ap1" ? digest : "sha256:x2" } });
let listed = [row("ap1", new Date(Date.now() - 2 * 3600e3).toISOString()), row("ap2", new Date(Date.now() - 20 * 60e3).toISOString())];
const keeper = fakeCaseKeeper((r) => {
  if (r.verb === "authority_approvals") return { json: { ok: true, approvals: [] } };
  if (r.verb === "approval_list") return { json: { approvals: listed.map((x) => (x.approval_id === "ap1" ? row("ap1", x.requested_at) : x)) } };
  if (r.verb === "case_list") return { json: { cases: [{ case_id: "case_1", case_state: "awaiting_approval", summary: "Checkout fix", created_at: "2026-11-07T08:00:00Z" }], unreadable: [] } };
  if (r.verb === "approval_decide") {
    const recs = (r.preconditions as any).records;
    if (recs.some((x: any) => x.ref === "approval:ap1" && x.expected_digest !== digest)) return { json: { outcome: "rejected_as_stale", code: "precondition_failed", changed_records: [{ ref: "approval:ap1", expected_digest: recs[0].expected_digest, current_digest: digest }], next_actions: [] } };
    listed = listed.filter((x) => x.approval_id !== r.approval_id);
    return { json: { ok: true } };
  }
  return { json: { ok: false, error_class: "unscripted_verb" } };
});
const app = await startDeskApp({ approvals: { socketPath: keeper.socketPath, service: { actor_id: "cognate-service", role: "service" }, operator: { actor_id: "actor:operator", role: "operator" }, timeoutMs: 2000 } });
await app.post("/desk/note", { body: "Checked the sandbox board today #demo" });
const root = `${process.env.HOME}/.cache/ms-playwright`;
const dir = readdirSync(root).find((d) => d.startsWith("chromium-"))!;
const browser = await chromium.launch({ executablePath: `${root}/${dir}/chrome-linux64/chrome`, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`${app.base}/workspace`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}-1-today.png`, fullPage: true });
console.log("TODAY:\n" + (await page.innerText("body")).slice(0, 1800));
await page.keyboard.press("Control+3");
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}-2-decide.png`, fullPage: true });
console.log("DECIDE:\n" + (await page.innerText(".main")).slice(0, 1800));
await page.keyboard.press("a");
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}-3-preview.png`, fullPage: true });
console.log("FOCUS after A:", await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120)));
// the case keeper's record moves on while the preview is open: Confirm must turn off
digest = "sha256:d2";
await page.waitForTimeout(2600);
await page.screenshot({ path: `${out}-4-out-of-date.png`, fullPage: true });
console.log("CONFIRM:", await page.evaluate(() => { const b = document.querySelector<HTMLButtonElement>("[data-confirm]"); return b ? `${b.disabled} ${b.textContent}` : "none"; }));
await page.keyboard.press("Escape");
await page.click('[data-choice="hold"]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}-5-hold.png`, fullPage: true });
await page.keyboard.press("Escape");
await page.keyboard.press("Control+4");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}-6-work.png`, fullPage: true });
console.log("WORK:\n" + (await page.innerText(".main")).slice(0, 1500));
await page.setViewportSize({ width: 390, height: 844 });
await page.keyboard.press("Control+1");
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}-7-phone.png`, fullPage: false });
console.log("ERRORS:", JSON.stringify(errors));
await browser.close();
await app.stop();
keeper.stop();
