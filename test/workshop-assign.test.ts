import { describe, expect, test } from "bun:test";
import { assign, assignmentId, type Access } from "../src/adapters/workshop.ts";

/** A workshop that behaves like the real one for assignments: an id may be used once, the same request replays. */
function fakeWorkshop() {
  const calls: { capability: string; input: Record<string, unknown> }[] = [];
  const made = new Map<string, { requestId: string }>();
  const access: Access = {
    kind: "ready",
    client: {
      async invoke(capability, input) {
        const body = input as Record<string, unknown>;
        calls.push({ capability, input: body });
        const id = String(body.id);
        const known = made.get(id);
        if (known !== undefined && known.requestId !== body.requestId) throw new Error("Assignment identity already exists");
        made.set(id, { requestId: String(body.requestId) });
        return { assignmentId: id };
      },
    },
  };
  return { access, calls, made };
}
const request = { caseId: "case_1", stepId: "step_1", expertId: "builder", workspaceId: "ws", message: "Do step one." };

describe("assigning a step to a workshop agent", () => {
  test("the assignment id and the request id are both assign:<case>:<step>", async () => {
    const w = fakeWorkshop();
    const result = await assign(w.access, request);
    expect(result).toEqual({ kind: "ok", value: { assignmentId: "assign:case_1:step_1" } });
    expect(w.calls[0]!.capability).toBe("expert.converse");
    expect(w.calls[0]!.input.id).toBe("assign:case_1:step_1");
    expect(w.calls[0]!.input.requestId).toBe("assign:case_1:step_1");
    expect(assignmentId("a", "b")).toBe("assign:a:b");
  });

  test("one assignment per step", async () => {
    const w = fakeWorkshop();
    const first = await assign(w.access, request);
    const again = await assign(w.access, request);
    // The same request replays: still one assignment.
    expect(first).toEqual(again);
    expect(w.made.size).toBe(1);
    // A second, different request for the same step is refused by the workshop and said in words.
    const other: Access = { kind: "ready", client: { invoke: (c, i) => w.access.kind === "ready" ? w.access.client.invoke(c, { ...(i as Record<string, unknown>), requestId: "other-request" }) : Promise.reject(new Error("x")) } };
    const second = await assign(other, request);
    expect(second.kind).toBe("already_assigned");
    expect(w.made.size).toBe(1);
    if (second.kind === "already_assigned") expect(second.words).toContain("already has an agent assigned");
  });

  test("when the workshop is not connected nothing is sent", async () => {
    const result = await assign({ kind: "not_connected", why: "missing", words: "Agent work is not connected: there is no access key yet." }, request);
    expect(result.kind).toBe("refused");
    if (result.kind === "refused") expect(result.words).toContain("not connected");
  });
});
