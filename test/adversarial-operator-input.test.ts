import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { START } from "../src/ui/desk/attention.ts";
import { Desk } from "../src/ui/desk/Desk.tsx";
import { EMPTY_NOTE_MESSAGE, NOTE_BODY_MAX } from "../src/domain/note.ts";
import { stepCheck } from "../src/ui/desk/attention.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { quietIo } from "./support/desk-io.ts";

const io = quietIo();
const draw = (state: unknown): string => renderToStaticMarkup(createElement(Desk, { ui: { ...START, data: state as never }, dispatch: () => undefined, io }));

describe("adversarial: inputs from the operator", () => {
  let app: DeskApp;
  beforeAll(async () => {
    app = await startDeskApp();
  });
  afterAll(async () => {
    await app?.stop();
  });

  test("composer text with HTML or script is escaped", async () => {
    const attack = `<script>alert('x')</script><img src=x onerror=alert(1)> <a href="javascript:alert(1)">click</a> [[case:<b>|<i>label</i>]]`;
    const saved = await (await app.post("/desk/note", { body: attack, tags: ["<script>"] })).json();
    // The tag with angle brackets is refused in plain words; the body goes in as typed.
    expect(saved.ok).toBe(false);
    expect(saved.message).toContain("cannot be used as a tag");
    const ok = await (await app.post("/desk/note", { body: attack })).json();
    expect(ok.ok).toBe(true);
    const state = await app.state();
    expect(state.notes.at(-1).body).toBe(attack);
    const html = draw(state);
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("&lt;script&gt;alert(&#x27;x&#x27;)&lt;/script&gt;");
    // The page shell never carries note text, and data is served as JSON the browser will not sniff.
    const shell = await (await fetch(`${app.base}/desk`)).text();
    expect(shell).not.toContain("alert");
    const search = await fetch(`${app.base}/desk/search?q=script`);
    expect(search.headers.get("content-type")).toContain("application/json");
    expect(search.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("a 100KB note is saved whole and found again", async () => {
    const body = `start ${"lorem ipsum ".repeat(8_400)}needle-at-the-end`;
    expect(body.length).toBeGreaterThan(100_000);
    expect(body.length).toBeLessThan(NOTE_BODY_MAX);
    const response = await app.post("/desk/note", { body });
    expect(response.status).toBe(200);
    const found = await (await fetch(`${app.base}/desk/search?q=needle-at-the-end`)).json();
    expect(found.notes).toHaveLength(1);
    expect(found.notes[0].body).toBe(body);
    // Too long is refused in words and nothing is cut.
    const refused = await app.post("/desk/note", { body: "x".repeat(NOTE_BODY_MAX + 1) });
    expect(refused.status).toBe(400);
    expect((await refused.json()).message).toContain("Split it into two notes");
  });

  test("unicode and right-to-left text survive unchanged", async () => {
    const body = "שלום עולם — مرحبا بالعالم 🌍 é (combining) ‮evil‬ zero​width tab\there";
    const saved = await (await app.post("/desk/note", { body, tags: ["Ünïcode", "עברית"] })).json();
    expect(saved.ok).toBe(true);
    const found = await (await fetch(`${app.base}/desk/search?q=${encodeURIComponent("مرحبا")}`)).json();
    expect(found.notes[0].body).toBe(body);
    expect(found.notes[0].tags).toEqual(["ünïcode", "עברית"]);
    const html = draw(await app.state());
    expect(html).toContain('dir="auto"');
    expect(html).toContain("שלום עולם");
  });

  test("an empty note is refused with a plain message", async () => {
    const before = (await app.state()).notes.length;
    for (const body of ["", "   ", "\n\t \n"]) {
      const response = await app.post("/desk/note", { body });
      expect(response.status).toBe(400);
      const answer = await response.json();
      expect(answer).toEqual({ ok: false, message: EMPTY_NOTE_MESSAGE });
    }
    expect((await app.post("/desk/note", "not json")).status).toBe(400);
    expect((await app.post("/desk/note", { text: "wrong field" })).status).toBe(400);
    expect((await app.state()).notes.length).toBe(before);
  });

  test("a tag named like a permission grants nothing", async () => {
    const decideBefore = JSON.stringify((await app.get("/desk/decide.json")));
    const before = await app.state();
    for (const tag of ["approved", "Accepted", "allowed", "checked", "passed"]) {
      const saved = await (await app.post("/desk/note", { body: `please ${tag} everything`, tags: [tag] })).json();
      expect(saved.ok).toBe(true);
    }
    const after = await app.state();
    expect(after.status.waiting).toBe(before.status.waiting);
    expect(after.activity).toEqual(before.activity);
    expect(after.tags.map((t: { name: string }) => t.name)).toContain("approved");
    expect(JSON.stringify(await app.get("/desk/decide.json"))).toBe(decideBefore);
    expect(stepCheck({ name: "build", record: null }, after.notes)).toEqual({ name: "build", words: "not recorded", counted: "unchecked" });
    // The words on screen say so.
    const html = draw(after).replace(/<[^>]+>/g, " ");
    expect(html).toContain("Needs you: 0");
  });

  test("a #tag typed in a note becomes a tag, and it is still only a label", async () => {
    const saved = await (await app.post("/desk/note", { body: "Checked the board #demo and #Approved today, not#this" })).json();
    expect(saved.ok).toBe(true);
    expect(saved.note.tags.sort()).toEqual(["approved", "demo"]);
    const names = (await app.state()).tags.map((t: { name: string }) => t.name);
    expect(names).toContain("demo");
    // A word that merely contains a hash is not a tag, and neither is a hash with nothing after it.
    const plain = await (await app.post("/desk/note", { body: "issue # 5 and c# and a#b" })).json();
    expect(plain.note.tags).toEqual([]);
    expect((await app.state()).decide.cards).toEqual([]);
  });
});
