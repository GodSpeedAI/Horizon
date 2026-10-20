import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApplication } from "../src/app.ts";
import { ContractError, evaluateDeviation, resolvableContext } from "../src/domain/contracts.ts";
import { buildStructuralFrame, type NavigationFrameV1 } from "../src/domain/frame.ts";
import { projectFrame } from "../src/ui/surface.ts";
import { horizonDocument, writeConfig } from "./support/config.ts";

const world = { worldRef: "world:horizon@sha256:6c18d6a608bd9d83e6aa354d5a8cc804009ca208562021c1736ee429412309f0" };

function frame(): NavigationFrameV1 {
  return buildStructuralFrame({ frameId: "frame-acceptance", observerRef: "os:operator:1000", world, checkpointRef: "cognate:7" });
}

/**
 * AC-CASE-002-01 (candidate contract T04-CR-001). The deviation input is supplied by the
 * test because the ruler defines no materiality predicate; the assertions state only what
 * REQ-CASE-002 requires of that input.
 */
describe("AC-CASE-002-01 next primary move responds to material deviation", () => {
  test("an undertaken deviation is answered by naming the operation that deviated", () => {
    const move = evaluateDeviation({
      deviation: { kind: "undertaken", operation_ref: "horizon.health", observed: "failed" },
      previousRecommended: "horizon.health",
      choices: frame().choices,
    });
    expect(move).toEqual({
      kind: "primary",
      operation_ref: "horizon.health",
      responds_to: "horizon.health",
      changed_from: "horizon.health",
    });
  });

  test.each(["completed", "refused", "failed", "contradicted"] as const)("a %s outcome counts as an undertaken deviation", (observed) => {
    const move = evaluateDeviation({
      deviation: { kind: "undertaken", operation_ref: "horizon.research.health", observed },
      previousRecommended: null,
      choices: frame().choices,
    });
    expect(move.kind).toBe("primary");
    expect(move.responds_to).toBe("horizon.research.health");
  });

  test("no deviation and only optional choices names no primary move", () => {
    const move = evaluateDeviation({ deviation: { kind: "none", observed: null }, previousRecommended: null, choices: frame().choices });
    expect(move).toEqual({ kind: "optional-only", operation_ref: null, responds_to: null });
  });

  test("an undertaken deviation that names nothing is refused, not silently accepted", () => {
    expect(() =>
      evaluateDeviation({ deviation: { kind: "undertaken", observed: "failed" }, previousRecommended: null, choices: frame().choices }),
    ).toThrow(ContractError);
    expect(() =>
      evaluateDeviation({ deviation: { kind: "undertaken", operation_ref: "horizon.health", observed: null }, previousRecommended: null, choices: frame().choices }),
    ).toThrow(ContractError);
  });
});

/**
 * AC-NAV-005-01 (candidate contract T04-CR-001): context already present in the frame is
 * resolved rather than asked for; anything else is not claimed as resolved.
 */
describe("AC-NAV-005-01 the controller does not ask for context the frame can resolve", () => {
  test("each reference class the frame carries is resolved from the frame", () => {
    const current = frame();
    const resolved = resolvableContext(current, [
      { reference: "checkpoint" },
      { reference: "world" },
      { reference: "operation" },
      { reference: "focus" },
    ]);
    expect(resolved.map((entry) => entry.reference)).toEqual(["checkpoint", "world", "operation", "focus"]);
    expect(resolved.find((entry) => entry.reference === "checkpoint")!.resolved_from).toBe("cognate:7");
    expect(resolved.find((entry) => entry.reference === "world")!.resolved_from).toBe(world.worldRef);
    expect(resolved.find((entry) => entry.reference === "operation")!.resolved_from).toBe(current.choices[0]!.operation_ref);
  });

  test("an unknown checkpoint is not resolvable, and a conflicting value is not claimed", () => {
    const unknown = buildStructuralFrame({ frameId: "frame-unknown", observerRef: "os:o:1", world, checkpointRef: "cognate:none" });
    expect(resolvableContext(unknown, [{ reference: "checkpoint" }])).toEqual([]);
    expect(resolvableContext(frame(), [{ reference: "world", value: `world:horizon@sha256:${"0".repeat(64)}` }])).toEqual([]);
  });
});

/**
 * AC-CONFIG-004-01 (candidate contract T04-CR-001): provider configuration stays below the
 * stable behaviour contracts. World and frame are identical; only the provider endpoint,
 * credential, scope and timeout differ between the two applications.
 */
describe("AC-CONFIG-004-01 configured provider endpoints stay below stable behavior contracts", () => {
  const providerA = { endpoint: "http://127.0.0.1:11434/v1", timeout_ms: 2_000, scope: "local:operator", credential: "credential-reference-a" };
  const providerB = { endpoint: "http://127.0.0.1:11435/v1", timeout_ms: 9_000, scope: "local:research", credential: "credential-reference-b" };

  async function observe(provider: typeof providerA) {
    const root = mkdtempSync(join(tmpdir(), "horizon-acceptance-"));
    const configPath = await writeConfig(
      join(root, "horizon.toml"),
      horizonDocument({ storePath: join(root, "app.sqlite"), secretPath: join(root, "launch.secret") }),
    );
    const app = await createApplication({ configPath });
    try {
      const commit = await app.commitNavigationIntent({ operationRef: "horizon.health" });
      const current = app.frames.current()!;
      return {
        choices: current.choices,
        intentIds: current.choices.map((choice) => choice.operation_ref),
        surface: projectFrame(current),
        provider,
        world_ref: current.world_ref,
        frame_id: commit.intent.frame_id,
      };
    } finally {
      await app.close();
    }
  }

  test("typed choices, intent ids and surface blocks are unchanged; only provider configuration differs", async () => {
    const first = await observe(providerA);
    const second = await observe(providerB);
    expect(second.world_ref).toBe(first.world_ref);
    expect(second.choices).toEqual(first.choices);
    expect(second.intentIds).toEqual(first.intentIds);
    expect(second.surface).toEqual(first.surface);
    expect(second.provider).not.toEqual(first.provider);
  }, 60_000);
});
