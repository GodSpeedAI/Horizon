import { describe, expect, test } from "bun:test";
import { hasBannedWords, readableTitle } from "../src/ui/desk/banned-words.ts";

describe("case titles", () => {
  test("a short plain description is the title", () => {
    expect(readableTitle("Sort the new bug reports", "triage@0.1.0")).toBe("Sort the new bug reports");
  });
  test("jargon or code-like text falls back to the template name made readable", () => {
    const long = "A governed draft write followed by a human sign-off gate (ItemKind HumanTask with require_approval";
    expect(readableTitle(long, "signoff_gate@0.1.0")).toBe("Signoff gate");
    expect(readableTitle("Uses ItemKind HumanTask", "signoff_gate@0.1.0")).toBe("Signoff gate");
    expect(readableTitle("Set require_approval first", "signoff_gate@0.1.0")).toBe("Signoff gate");
    expect(readableTitle("Writes to the ledger", "signoff_gate@0.1.0")).toBe("Signoff gate");
  });
  test("a description that is cut off falls back; a long one keeps its first whole sentence", () => {
    expect(readableTitle("x".repeat(40) + " " + "y".repeat(70), "plan-review@1")).toBe("Plan review");
    expect(readableTitle("Review the plan. Then " + "more ".repeat(30), "plan-review@1")).toBe("Review the plan.");
  });
  test("no description gives the template name", () => {
    expect(readableTitle(undefined, "signoff_gate@0.1.0")).toBe("Signoff gate");
    expect(hasBannedWords("Plain words only")).toBe(false);
  });
});
