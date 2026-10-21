/**
 * The two attacks named by T08, plus the adjacent ways a terminal could smuggle authority.
 * These are deliberately separate from the happy-path suites so `just teeth-t08` cannot pass
 * merely because a consumer test is green.
 */
import { describe, expect, test } from "bun:test";
import { applySequential, openSequential, presentSequentialFrame } from "../src/ui/sequential/controller.ts";
import { frame, j02, j02Blocked, readOnly } from "./support/sequential-fixture.ts";

describe("T08 teeth", () => {
  test("stale frame revision after focus change is refused and requests refresh", () => {
    const opened = openSequential(j02());
    const focusChanged = presentSequentialFrame(
      opened,
      frame({ frame_id: "frame:focus-changed", revision: 2, focus: "obj:strategy:beta", candidates: [readOnly("horizon.inspect.focus", "Inspect Beta")] }),
    );
    const attack = applySequential(focusChanged, {
      type: "select",
      choice_id: "product.apply",
      frame_id: "frame:t08:1",
      revision: 1,
    });
    expect(attack.ok).toBe(false);
    expect(attack.intent).toBeNull();
    expect(attack.session.error?.code).toBe("stale_frame");
    expect(attack.session.frame.focus_ref).toBe("obj:strategy:beta");
    expect(attack.session.intents).toHaveLength(0);
  });

  test("cancel midway through a choice leaves no side effect and erases no context", () => {
    const opened = openSequential(j02());
    const reviewed = applySequential(opened, {
      type: "select",
      choice_id: "product.apply",
      frame_id: opened.frame.frame_id,
      revision: opened.frame.revision,
    });
    expect(reviewed.session.prompt.kind).toBe("review");
    const cancelled = applySequential(reviewed.session, { type: "cancel" });
    expect(cancelled.intent).toBeNull();
    expect(cancelled.session.intents).toHaveLength(0);
    expect(cancelled.session.frame).toBe(opened.frame);
    expect(cancelled.session.latest_frame).toBe(opened.frame);
    expect(cancelled.session.selection).toBe("product.apply");
    expect(cancelled.session.prompt.context.focus_ref).toBe(opened.frame.focus_ref);

    const resumed = applySequential(cancelled.session, { type: "resume" });
    expect(resumed.session.frame).toBe(opened.frame);
    expect(resumed.session.prompt.kind).toBe("choice");
  });

  test("a blocked move cannot be smuggled through as a choice", () => {
    const opened = openSequential(j02Blocked());
    const attack = applySequential(opened, {
      type: "select",
      choice_id: "product.apply",
      frame_id: opened.frame.frame_id,
      revision: opened.frame.revision,
    });
    expect(attack.ok).toBe(false);
    expect(attack.intent).toBeNull();
    expect(attack.session.error?.code).toBe("unavailable_choice");
  });

  test("a historical frame cannot be acted on after going back", () => {
    const opened = openSequential(j02());
    const moved = presentSequentialFrame(opened, frame({ frame_id: "frame:new", revision: 2, candidates: [readOnly("horizon.inspect.focus", "Inspect")] }));
    const back = applySequential(moved, { type: "back" });
    expect(back.session.prompt.current).toBe(false);
    const attack = applySequential(back.session, {
      type: "select",
      choice_id: "product.apply",
      frame_id: back.session.frame.frame_id,
      revision: back.session.frame.revision,
    });
    expect(attack.ok).toBe(false);
    expect(attack.session.error?.code).toBe("stale_frame");
  });
});
