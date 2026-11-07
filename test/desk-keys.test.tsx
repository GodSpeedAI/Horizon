/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { START, deskReducer } from "../src/ui/desk/attention.ts";
import { Desk } from "../src/ui/desk/Desk.tsx";
import { resolveKey, type KeyInfo } from "../src/ui/desk/keys.ts";
import { deskState } from "./support/desk-fixture.ts";
import { quietIo } from "./support/desk-io.ts";

const key = (k: string, over: Partial<KeyInfo> = {}): KeyInfo => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, targetTag: "body", editable: false, ...over });
const typing = { targetTag: "textarea" };

describe("desk keys", () => {
  test("shortcuts do not fire while typing", () => {
    for (const k of ["j", "k", "J", "?", "a", "r", "h", "Enter"]) {
      expect(resolveKey(key(k, typing), { decisionCard: true })).toBeNull();
      expect(resolveKey(key(k, { targetTag: "div", editable: true }), { decisionCard: true })).toBeNull();
      expect(resolveKey(key(k, { targetTag: "input" }), { decisionCard: true })).toBeNull();
    }
    // The same keys work when you are not typing.
    expect(resolveKey(key("j"))).toEqual({ type: "cursor", delta: 1 });
    expect(resolveKey(key("k"))).toEqual({ type: "cursor", delta: -1 });
    expect(resolveKey(key("Enter"))).toEqual({ type: "open" });
    expect(resolveKey(key("?"))).toEqual({ type: "keys-help" });
    // Enter on a button belongs to the button.
    expect(resolveKey(key("Enter", { targetTag: "button" }))).toBeNull();
    // No single key completes a decision: A, R and H only open the preview, and only on a decision card.
    expect(resolveKey(key("a"))).toBeNull();
    expect(resolveKey(key("a"), { decisionCard: true })).toEqual({ type: "preview", choice: "accept" });
    expect(resolveKey(key("r"), { decisionCard: true })).toEqual({ type: "preview", choice: "reject" });
    expect(resolveKey(key("h"), { decisionCard: true })).toEqual({ type: "preview", choice: "hold" });
    // Escape always works, even in a text box.
    expect(resolveKey(key("Escape", typing))).toEqual({ type: "escape" });
  });

  test("Ctrl+K focuses the composer", () => {
    for (const mod of [{ ctrlKey: true }, { metaKey: true }]) {
      expect(resolveKey(key("k", { ...mod, ...typing }))).toEqual({ type: "focus-composer" });
      expect(resolveKey(key("K", mod))).toEqual({ type: "focus-composer" });
    }
    const ui = deskReducer({ ...START, data: deskState() }, { type: "focus", target: "composer" });
    expect(ui.focus).toBe("composer");
    // The composer is in the page and reachable by its label.
    const html = renderToStaticMarkup(<Desk ui={ui} dispatch={() => undefined} io={quietIo()} />);
    expect(html).toContain('id="composer-input"');
  });

  test("Ctrl+1..4 switch views", () => {
    const expected = ["today", "explore", "decide", "work"] as const;
    for (const [i, view] of expected.entries()) {
      for (const mod of [{ ctrlKey: true }, { metaKey: true }]) {
        const action = resolveKey(key(String(i + 1), mod));
        expect(action).toEqual({ type: "view", view });
        const ui = deskReducer({ ...START, data: deskState() }, { type: "view", view });
        expect(ui.view).toBe(view);
      }
    }
    expect(resolveKey(key("5", { ctrlKey: true }))).toBeNull();
    expect(resolveKey(key("[", { ctrlKey: true }))).toEqual({ type: "day", delta: -1 });
    expect(resolveKey(key("]", { metaKey: true }))).toEqual({ type: "day", delta: 1 });
    expect(resolveKey(key("p", { ctrlKey: true }))).toEqual({ type: "quick-menu" });
  });
});
