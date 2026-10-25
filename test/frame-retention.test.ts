import { expect, test } from "bun:test";
import { buildStructuralFrame, type NavigationFrameV1 } from "../src/domain/frame.ts";
import { createFrameRegister, frameForIntent } from "../src/capabilities/navigation-intent.ts";
import { refusedBy } from "../src/ui/workspace/model.ts";

const frame = (id: string): NavigationFrameV1 =>
  buildStructuralFrame({ frameId: id, observerRef: "os:test", world: { worldRef: "world:horizon@sha256:00" }, checkpointRef: "cp" });

test("a new intent may only act on the current frame; an older frame is not retained by default", () => {
  const register = createFrameRegister();
  register.issue(frame("frame-a"));
  register.issue(frame("frame-b"));
  expect(frameForIntent(register, { frame_id: "frame-a", operation_ref: "horizon.health" }).frame_id).toBe("frame-b");
});

test("an escalated intent resumes against the frame it named while its move is still a choice", () => {
  const register = createFrameRegister();
  register.issue(frame("frame-a"));
  register.retain("frame-a");
  register.issue(frame("frame-b"));
  expect(frameForIntent(register, { frame_id: "frame-a", operation_ref: "horizon.health" }).frame_id).toBe("frame-a");
  expect(() => frameForIntent(register, { frame_id: "frame-a", operation_ref: "horizon.not-a-choice" })).toThrow(/no longer a choice/);
});

test("retaining a frame this register never issued keeps nothing", () => {
  const register = createFrameRegister();
  register.issue(frame("frame-a"));
  register.retain("frame-forged");
  expect(register.retained("frame-forged")).toBeNull();
});

test("a refusal names SEA-Forge only when the reason shows it", () => {
  expect(refusedBy('Invocation failed: {"message":"INTENT: intent frame x is not the current frame y","name":"IntentError"}', true)).toBe("Refused by Horizon's own checks");
  expect(refusedBy("authority refused: cep_policy_denied", true)).toBe("Refused by SEA-Forge");
  expect(refusedBy("run failed", true)).toBe("Refused");
  expect(refusedBy("run failed", false)).toBe("Refused by Horizon policy");
});

test("a refusal shows the reason inside the invocation wrapper", async () => {
  const { refusalText } = await import("../src/ui/workspace/model.ts");
  expect(refusalText('Invocation of x failed: {"kind":"denied","policyId":"sea-forge","reason":"sea-forge decided deny (auth_01)"}')).toBe("sea-forge decided deny (auth_01)");
  expect(refusalText("run failed")).toBe("run failed");
});
