/** @jsxImportSource react */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildDesk } from "../scripts/build-desk.ts";
import { START, type UiState } from "../src/ui/desk/attention.ts";
import { Desk, type DeskIo } from "../src/ui/desk/Desk.tsx";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { deskState, note } from "./support/desk-fixture.ts";
import { quietIo } from "./support/desk-io.ts";

const io: DeskIo = quietIo();
const draw = (ui: UiState): string => renderToStaticMarkup(<Desk ui={ui} dispatch={() => undefined} io={io} />);
const text = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const SECRET = "SecretClientApp";

describe("desk pages", () => {
  let app: DeskApp;
  beforeAll(async () => {
    await buildDesk();
    app = await startDeskApp({ repoPath: `/home/someone/projects/${SECRET}` });
  });
  afterAll(async () => {
    await app?.stop();
  });

  test("desk bundle builds and /desk/app.js is served", async () => {
    const js = await fetch(`${app.base}/desk/app.js`);
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toContain("javascript");
    expect((await js.text()).length).toBeGreaterThan(10_000);
    const css = await fetch(`${app.base}/desk/app.css`);
    expect(css.status).toBe(200);
    expect(await css.text()).toContain("--focus");
    const page = await fetch(`${app.base}/desk`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("script-src 'self'");
    const html = await page.text();
    expect(html).toContain("/desk/app.js");
    expect(html).toContain("/desk/app.css");
    // The older pages keep working until they are cut over.
    expect((await fetch(`${app.base}/workspace`)).status).toBe(200);
  });

  test("state is polled by revision and a saved note shows on today", async () => {
    const first = await app.state();
    expect(first.today).toBe("2026-11-06");
    expect(first.status.parts.map((p: { words: string }) => p.words)).toContain("Reference library: Not connected");
    expect(first.notes).toEqual([]);
    const unchanged = await app.state(`since=${first.rev}`);
    expect(unchanged).toEqual({ unchanged: true, rev: first.rev });
    const saved = await (await app.post("/desk/note", { body: "first note of the day", tags: ["Plan"] })).json();
    expect(saved.ok).toBe(true);
    const next = await app.state(`since=${first.rev}`);
    expect(next.rev).not.toBe(first.rev);
    expect(next.notes.map((n: { body: string }) => n.body)).toEqual(["first note of the day"]);
    expect(next.tags).toEqual([{ name: "plan", count: 1 }]);
    const found = await (await fetch(`${app.base}/desk/search?q=first&day=2026-11-06`)).json();
    expect(found.notes).toHaveLength(1);
    const byTag = await (await fetch(`${app.base}/desk/search?tag=plan`)).json();
    expect(byTag.notes).toHaveLength(1);
    const withHistory = await app.state(`note=${saved.note.note_id}`);
    expect(withHistory.selected.history).toHaveLength(1);
  });

  test("Presenting hides project names in notes and results", async () => {
    await app.post("/desk/note", { body: `shipping ${SECRET} on Friday` });
    const form = (on: string) => fetch(`${app.base}/workspace/presenting`, { method: "POST", redirect: "manual", body: new URLSearchParams({ on, return: "" }) });
    await form("1");
    const state = JSON.stringify(await app.state());
    expect(state).not.toContain(SECRET);
    expect(state).toMatch(/Project [A-Z2-7]{4}/);
    expect(JSON.stringify(await (await fetch(`${app.base}/desk/search?q=shipping`)).json())).not.toContain(SECRET);
    expect((await app.state()).status.presenting).toBe(true);
    await form("0");
    expect(JSON.stringify(await app.state())).toContain(SECRET);
  });
});

describe("desk components", () => {
  test("status bar shows the setup, part health in plain words and the Presenting switch", () => {
    for (const setup of ["testing", "production"] as const) {
      const base = deskState();
      const html = draw({ ...START, data: { ...base, status: { ...base.status, setup } } });
      expect(text(html)).toContain(`Setup: ${setup}`);
    }
    const html = text(draw({ ...START, data: deskState() }));
    expect(html).toContain("Presenting: off");
    expect(html).toContain("Cases: connected");
    expect(html).toContain("Records: Not connected");
    expect(html).toContain("Agent work: Not connected");
    const on = deskState();
    expect(draw({ ...START, data: { ...on, status: { ...on.status, presenting: true } } })).toContain('data-presenting="on"');
  });

  test("Ask says Not connected and gives a next step", () => {
    const html = text(draw({ ...START, data: deskState(), composer: { ...START.composer, mode: "ask" } }));
    expect(html).toContain("Not connected");
    expect(html).toContain("Use Find to search your own notes");
    expect(draw({ ...START, data: deskState(), composer: { ...START.composer, mode: "ask" } })).toContain("disabled");
  });

  test("empty states say why and offer one next step; the words stay plain", () => {
    const empty = deskState({ days: [], notes: [] });
    const html = text(draw({ ...START, data: empty }));
    expect(html).toContain("No notes yet today. Click the box below");
    expect(html).toContain("Records are not connected");
    expect(html).toContain("No days yet. Write a note");
    expect(html).toContain("No tags yet");
    expect(html).toContain("Nothing is selected. Press J or K");
    for (const jargon of ["SFWP", "ledger", "digest", "tenant", "witness"]) expect(html.toLowerCase()).not.toContain(jargon.toLowerCase());
    expect(text(draw({ ...START, view: "decide", data: empty }))).toContain("Nothing needs you right now");
    expect(text(draw({ ...START, view: "explore", data: empty, results: { q: "", day: null, tag: null, notes: [], cases: [], days: [], tags: [], records: { name: "Records", connected: false, words: "", href: null } } }))).toContain("No notes match");
  });

  test("the cursor and focus are visible without colour", () => {
    const html = draw({ ...START, data: deskState({}, [note(1), note(2)]), cursor: 1 });
    expect(html).toContain('data-cursor="true"');
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('tabindex="0"');
  });
});
