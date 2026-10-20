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
 * AC-CASE-002-01 (candidate contract T04-CR-001). The contract restates REQ-CASE-002:
 * "The next primary move MUST respond to material deviation; no primary recommendation is
 * required when only optional choices remain." Evaluation follows the frozen spec's
 * reference algorithm, which selects the first *available* choice that addresses the
 * deviation. No list of outcomes and no materiality threshold is asserted here: the
 * requirement names none.
 */
describe("AC-CASE-002-01 next primary move responds to material deviation", () => {
  test("a deviation is answered by the first available move, which reports what it responds to", () => {
    const move = evaluateDeviation({
      deviation: { kind: "undertaken", operation_ref: "horizon.health", observed: "failed" },
      choices: frame().choices,
    });
    const firstAvailable = frame().choices.find((choice) => choice.assessment.status === "available")!;
    expect(move.kind).toBe("primary");
    expect(move.operation_ref).toBe(firstAvailable.operation_ref);
    expect(move.responds_to).toBe("horizon.health");
  });

  test("a blocked choice is not a primary move even when it deviated (possibility is not an affordance)", () => {
    const blocked = buildStructuralFrame({
      frameId: "frame-blocked",
      observerRef: "os:operator:1000",
      world,
      checkpointRef: "cognate:7",
      availability: { status: "blocked", firstBlockers: { "horizon.research.health": "authority" } },
    });
    const unavailable = blocked.choices.find((choice) => choice.assessment.status === "blocked")!;
    const move = evaluateDeviation({
      deviation: { kind: "undertaken", operation_ref: unavailable.operation_ref, observed: "failed" },
      choices: blocked.choices,
    });
    // The deviation is still answered, but never by repeating an unavailable operation.
    expect(move.responds_to).toBe(unavailable.operation_ref);
    expect(move.operation_ref).not.toBe(unavailable.operation_ref);
    expect(move.operation_ref).toBe(blocked.choices.find((choice) => choice.assessment.status === "available")!.operation_ref);
  });

  test("no deviation and only optional choices names no primary move", () => {
    const move = evaluateDeviation({ deviation: { kind: "none", observed: null }, choices: frame().choices });
    expect(move).toEqual({ kind: "optional-only", operation_ref: null, responds_to: null });
  });

  test("an undertaken deviation that names nothing is refused, not silently accepted", () => {
    expect(() =>
      evaluateDeviation({ deviation: { kind: "undertaken", observed: "failed" }, choices: frame().choices }),
    ).toThrow(ContractError);
    expect(() =>
      evaluateDeviation({ deviation: { kind: "undertaken", operation_ref: "horizon.health", observed: null }, choices: frame().choices }),
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
 * AC-CONFIG-004-01 (candidate contract T04-CR-001). The contract restates REQ-CONFIG-004:
 * "Configured provider endpoints, credentials, timeouts and scope MUST remain below stable
 * behavior contracts."
 *
 * What this witness can and cannot establish:
 * - It *observes* the requirement: the two configurations differ in the endpoint Horizon is
 *   bound to and in the launch-secret (credential) path, both read from `horizon.toml`
 *   through `loadConfig`, and the typed choices, intent ids and surface blocks are identical.
 * - It does *not* exercise configurable provider timeouts or scopes: `HorizonConfig`
 *   declares neither today, so Horizon has no such control to keep "below" anything
 *   (DEBT D-019). This test does not claim to cover them.
 */
describe("AC-CONFIG-004-01 configured provider endpoints stay below stable behavior contracts", () => {
  async function observe(variation: { readonly port: number; readonly secret: string; readonly bindHost: string }) {
    const root = mkdtempSync(join(tmpdir(), "horizon-acceptance-"));
    const document = horizonDocument({ storePath: join(root, "app.sqlite"), secretPath: join(root, variation.secret) });
    document.bind_host = variation.bindHost;
    document.port = variation.port;
    const configPath = await writeConfig(join(root, "horizon.toml"), document);
    const app = await createApplication({ configPath });
    try {
      const commit = await app.commitNavigationIntent({ operationRef: "horizon.health" });
      const current = app.frames.current()!;
      return {
        choices: current.choices,
        intentIds: current.choices.map((choice) => choice.operation_ref),
        surface: projectFrame(current),
        world_ref: current.world_ref,
        frameRevision: commit.intent.frame_revision,
        // Read back from the configuration the application actually loaded, not from the
        // object this test passed in.
        loaded: {
          endpoint: `${app.loaded.config.bind_host}:${app.loaded.config.port}`,
          credentialPath: app.loaded.secretPath,
          secretsMode: app.loaded.config.secrets.mode,
        },
      };
    } finally {
      await app.close();
    }
  }

  test("typed choices, intent ids and surface blocks are unchanged when the configured endpoint and credential differ", async () => {
    const first = await observe({ port: 11434, secret: "launch-a.secret", bindHost: "127.0.0.1" });
    const second = await observe({ port: 11435, secret: "launch-b.secret", bindHost: "localhost" });

    // The two configurations are genuinely different, on fields the runtime actually reads.
    expect(second.loaded.endpoint).not.toBe(first.loaded.endpoint);
    expect(second.loaded.credentialPath).not.toBe(first.loaded.credentialPath);
    expect(first.loaded.secretsMode).toBe("per_launch");

    // The stable behavior contracts do not depend on either difference.
    expect(second.world_ref).toBe(first.world_ref);
    expect(second.choices).toEqual(first.choices);
    expect(second.intentIds).toEqual(first.intentIds);
    expect(second.surface).toEqual(first.surface);
    expect(second.frameRevision).toBe(first.frameRevision);
  }, 60_000);
});
