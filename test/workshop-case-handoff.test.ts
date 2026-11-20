// J8 (cognitiveos convergence 9, ticket #119): Horizon's exploratory handoff carries the CEP
// `CaseContext` and its provenance on the existing `expert.converse` call. Asserted context stays
// asserted; `worldCorroboration` is `verified` only when a registry check ran. Evaluated work needs
// the trusted Execution Episode binding, invalid provenance is refused, and a local Execution State
// Digest is never accepted as a CEP World Reference.
import { describe, expect, test } from "bun:test";
import { assign, deriveCaseHandoff, type Access, type CaseHandoff } from "../src/adapters/workshop.ts";

const HEX = "c".repeat(64);
const base: CaseHandoff = {
  worldRef: `world:horizon@sha256:${HEX}`,
  registryChecked: true,
  semanticRef: "horizon.interaction::CaseRecord",
  caseId: "case_1",
  planItemId: "step_1",
  role: "executor",
  kind: "exploratory",
  caseStepCorrelation: "assign:case_1:step_1",
  assertedBy: "horizon:operator",
};

/** A stand-in workshop that records the `expert.converse` inputs it is handed. */
function recordingWorkshop() {
  const calls: { capability: string; input: Record<string, unknown> }[] = [];
  const access: Access = {
    kind: "ready",
    client: {
      async invoke(capability, input) {
        calls.push({ capability, input: input as Record<string, unknown> });
        return { assignmentId: String((input as Record<string, unknown>).id) };
      },
    },
  };
  return { access, calls };
}

const ok = (handoff: CaseHandoff) => {
  const derived = deriveCaseHandoff(handoff);
  if (derived.kind !== "ok") throw new Error(`expected ok, got ${derived.code}: ${derived.words}`);
  return derived;
};

describe("Horizon case handoff with CEP context provenance", () => {
  test("an exploratory handoff forwards the caseContext, provenance and Case-Step Correlation", async () => {
    const derived = ok(base);
    expect(derived.caseContext).toEqual({
      worldRef: base.worldRef, semanticRef: base.semanticRef, caseId: "case_1", planItemId: "step_1",
      role: "executor", kind: "exploratory",
    });
    expect(derived.worldCorroboration).toBe("verified");
    const w = recordingWorkshop();
    const result = await assign(w.access, {
      caseId: "case_1", stepId: "step_1", expertId: "builder", workspaceId: "ws", message: "Explore.",
      caseContext: derived.caseContext, assertedBy: derived.assertedBy,
      worldCorroboration: derived.worldCorroboration, caseStepCorrelation: derived.caseStepCorrelation,
    });
    expect(result.kind).toBe("ok");
    const input = w.calls[0]!.input;
    expect(w.calls[0]!.capability).toBe("expert.converse");
    expect(input.caseContext).toEqual(derived.caseContext);
    expect(input.assertedBy).toBe("horizon:operator");
    expect(input.worldCorroboration).toBe("verified");
    expect(input.caseStepCorrelation).toBe("assign:case_1:step_1");
    // Existing Horizon fields and boot pins are preserved.
    expect(input.id).toBe("assign:case_1:step_1");
    expect(input.requestId).toBe("assign:case_1:step_1");
    expect(input.message).toBe("Explore.");
  });

  test("without a registry check, the context is only asserted", () => {
    const derived = ok({ ...base, registryChecked: false });
    expect(derived.worldCorroboration).toBe("asserted");
  });

  test("an evaluated handoff without a trusted episode binding is refused", () => {
    const derived = deriveCaseHandoff({ ...base, kind: "evaluated" });
    expect(derived.kind).toBe("refused");
    if (derived.kind === "refused") expect(derived.code).toBe("evaluated_without_episode");
  });

  test("an evaluated handoff with the trusted episode binding forwards it", () => {
    const derived = ok({ ...base, kind: "evaluated", episodeRef: `episode:case_1:step_1:1@sha256:${"d".repeat(64)}` });
    expect(derived.caseContext.kind).toBe("evaluated");
    expect(derived.caseContext.episodeRef).toBe(`episode:case_1:step_1:1@sha256:${"d".repeat(64)}`);
  });

  test("a local Execution State Digest is refused as a CEP World Reference", () => {
    const derived = deriveCaseHandoff({ ...base, worldRef: `sha256:${HEX}` });
    expect(derived.kind).toBe("refused");
    if (derived.kind === "refused") expect(derived.code).toBe("world_ref_not_cep");
  });

  test("invalid provenance is refused", () => {
    for (const bad of [
      { ...base, assertedBy: "" },
      { ...base, caseStepCorrelation: "" },
      { ...base, semanticRef: "no-namespace" },
      { ...base, kind: "guessed" as CaseHandoff["kind"] },
      { ...base, episodeRef: "not-an-episode" },
    ]) {
      const derived = deriveCaseHandoff(bad);
      expect(derived.kind).toBe("refused");
      if (derived.kind === "refused") expect(derived.code).toBe("invalid_provenance");
    }
  });

  test("assertedBy is recorded verbatim and is never itself the refusal", async () => {
    const weird = ok({ ...base, assertedBy: "  whoever claims this  " });
    expect(weird.assertedBy).toBe("  whoever claims this  ");
    const w = recordingWorkshop();
    const result = await assign(w.access, {
      caseId: "case_1", stepId: "step_1", expertId: "builder", workspaceId: "ws", message: "Explore.",
      caseContext: weird.caseContext, assertedBy: weird.assertedBy, worldCorroboration: weird.worldCorroboration, caseStepCorrelation: weird.caseStepCorrelation,
    });
    expect(result.kind).toBe("ok");
    expect(w.calls[0]!.input.assertedBy).toBe("  whoever claims this  ");
  });

  test("a handoff with no caseContext sends the existing request unchanged", async () => {
    const w = recordingWorkshop();
    const result = await assign(w.access, { caseId: "case_1", stepId: "step_1", expertId: "builder", workspaceId: "ws", message: "Do it." });
    expect(result.kind).toBe("ok");
    const input = w.calls[0]!.input;
    expect("caseContext" in input).toBe(false);
    expect("assertedBy" in input).toBe(false);
    expect("worldCorroboration" in input).toBe(false);
    expect("caseStepCorrelation" in input).toBe(false);
  });
});
