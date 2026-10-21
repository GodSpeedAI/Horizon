/**
 * The renderer proof for T08: real OpenTUI key events, the vendored Clack shell, and the
 * controller's typed intents. A frame is mounted exactly as the CLI mounts it; no test-only
 * shortcut chooses an option or includes business state in the component.
 */
import { describe, expect, test } from "bun:test";
import { flushSync } from "@opentui/react";
import { testRender } from "@opentui/react/test-utils";
import { act, createElement, type ReactNode } from "react";
import { openSequential, type SequentialIntent } from "../src/ui/sequential/controller.ts";
import { SequentialTerminal } from "../src/ui/sequential/terminal.tsx";
import { j02, j02Blocked, j05 } from "./support/sequential-fixture.ts";

interface Harness {
  frame(): string;
  key(key: string): Promise<void>;
  escape(): Promise<void>;
}

async function render(node: ReactNode): Promise<Harness> {
  const setup = await testRender(node, { width: 96, height: 32, kittyKeyboard: true, exitOnCtrlC: false });
  await setup.renderOnce();
  return {
    frame: () => setup.captureCharFrame(),
    async key(key) {
      act(() => {
        flushSync(() => setup.mockInput.pressKey(key));
      });
      await setup.flush();
    },
    async escape() {
      act(() => {
        flushSync(() => setup.mockInput.pressEscape());
      });
      await setup.flush();
    },
  };
}

function mount(initialSession: ReturnType<typeof openSequential>, intents: SequentialIntent[], exits: { count: number }): ReactNode {
  return createElement(SequentialTerminal, {
    initialSession,
    onIntent: (intent: SequentialIntent) => intents.push(intent),
    onExit: () => {
      exits.count += 1;
    },
  });
}

describe("T08 Clack-style terminal", () => {
  test("keyboard opens a review and confirms one typed intent", async () => {
    const intents: SequentialIntent[] = [];
    const exits = { count: 0 };
    const h = await render(mount(openSequential(j02()), intents, exits));

    expect(h.frame()).toContain("Next: Apply the strategy change");
    await h.key("RETURN");
    expect(h.frame()).toContain("Confirm Apply the strategy change?");
    expect(h.frame()).toContain("Reversibility: compensable");
    expect(intents).toHaveLength(0);

    await h.key("RETURN");
    expect(intents).toHaveLength(1);
    expect(intents[0]?.kind).toBe("confirm");
    expect(intents[0]?.operation_ref).toBe("product.apply");
  });

  test("a blocked move is visible, disabled, and its prerequisite is plain", async () => {
    const intents: SequentialIntent[] = [];
    const exits = { count: 0 };
    const h = await render(mount(openSequential(j02Blocked()), intents, exits));

    expect(h.frame()).toContain("Apply the strategy change");
    expect(h.frame()).toContain("not authorized yet");
    expect(h.frame()).toContain("sea-forge:approval:42");
    await h.key("RETURN");
    expect(intents).toHaveLength(0);
  });

  test("escape cancels without an intent and keeps a resume path; a second escape exits", async () => {
    const intents: SequentialIntent[] = [];
    const exits = { count: 0 };
    const h = await render(mount(openSequential(j05()), intents, exits));

    await h.escape();
    expect(intents).toHaveLength(0);
    expect(exits.count).toBe(0);
    expect(h.frame()).toContain("Decision cancelled");
    expect(h.frame()).toContain("Your frame, focus and selection are still here.");

    await h.escape();
    expect(exits.count).toBe(1);
    expect(intents).toHaveLength(0);
  });
});
