/** Step 4: one rule. A step is blocked iff an answer on it has waiting_on = agent. Nothing else blocks acceptance. */
import { describe, expect, test } from "bun:test";
import { acceptanceBlocked, waitsForAgent } from "../src/capabilities/panel-answers.ts";

describe("the acceptance rule", () => {
  test("an answer that waits for the agent blocks its step", () => {
    expect(acceptanceBlocked([{ step: "s", replied: false, waiting_on: "agent" }], "s")).toBe(true);
  });
  test("an answer that waits for nobody does not block, even when it has no reply yet", () => {
    expect(acceptanceBlocked([{ step: "s", replied: false, waiting_on: "none" }], "s")).toBe(false);
  });
  test("a record without waiting_on reads as waiting for the agent until it is replied", () => {
    expect(acceptanceBlocked([{ step: "s", replied: false }], "s")).toBe(true);
    expect(acceptanceBlocked([{ step: "s", replied: true }], "s")).toBe(false);
  });
  test("only the step's own answers count", () => {
    expect(acceptanceBlocked([{ step: "other", replied: false, waiting_on: "agent" }], "s")).toBe(false);
  });
  test("waitsForAgent is the one test the desk uses", () => {
    expect(waitsForAgent({ replied: false, waiting_on: "agent" })).toBe(true);
    expect(waitsForAgent({ replied: false, waiting_on: "none" })).toBe(false);
  });
});
