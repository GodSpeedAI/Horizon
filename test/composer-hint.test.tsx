/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { START } from "../src/ui/desk/attention.ts";
import { Desk } from "../src/ui/desk/Desk.tsx";
import { deskState } from "./support/desk-fixture.ts";
import { quietIo } from "./support/desk-io.ts";

const keeperCase = { case_ref: "case:c1", purpose: "Case started 2026-11-07", opened_at: "2026-11-07T06:00:00Z", source: "case keeper" as const, state: "Running" };
const draw = (text: string): string =>
  renderToStaticMarkup(<Desk ui={{ ...START, data: deskState({ cases: [keeperCase] }), composer: { ...START.composer, mode: "handoff", text } }} dispatch={() => undefined} io={quietIo()} nowMs={Date.parse("2026-11-07T12:00:00Z")} />);

describe("Hand off help line", () => {
  test("an empty box is not scolded before anyone tries to send it (as after a successful hand off)", () => {
    expect(draw("")).not.toContain("Type what you want done first.");
  });
  test("typed words show no empty-box hint either", () => {
    expect(draw("Fix the checkout total")).not.toContain("Type what you want done first.");
  });
});
