/**
 * T09 workspace model over the real T06 read and the T07 frame vocabulary.
 *
 * The GUI is not a second policy: every choice, blocked reason, action availability and review
 * field comes from the frame or the closed surface. These tests attack the renderer's own
 * obligations — owner pinning, historical scope, bounded lineage and plain-language order.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApplication, type HorizonApplication } from "../src/app.ts";
import { approvalAssuranceOf, buildLineage, buildWorkspace, moveOf, onboardingOf, scopeOf, shortRef, workspaceState, WORKSPACE_REGION_ORDER } from "../src/ui/workspace/model.ts";
import type { GuiView, ProjectedNode } from "../src/ui/surface2/project.ts";
import { seedOperationalFixture } from "./support/operational-fixture.ts";
import { writeConfig, horizonDocument } from "./support/config.ts";
import { j02, j02Blocked, j04Unknown, CHECKPOINT, OBSERVER, WORLD } from "./support/sequential-fixture.ts";

let application: HorizonApplication;

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), "t09-workspace-"));
  const configPath = await writeConfig(
    join(root, "horizon.toml"),
    horizonDocument({ storePath: join(root, "workspace.sqlite"), secretPath: join(root, "launch.secret") }),
  );
  application = await createApplication({ configPath });
  await seedOperationalFixture(application.runtime.runtime.store, undefined, application.caller.tenant);
});
afterAll(async () => {
  await application?.close();
});

function emptyView(overrides: Partial<GuiView> = {}): GuiView {
  return {
    schema: "horizon.gui-view/1",
    role: "human",
    surface_id: "surface:test",
    title: "Test workspace",
    responsibility: "orient",
    intent: "inspect",
    focus_ref: "obj:strategy:alpha",
    nodes: [],
    actions: [],
    notes: [],
    unresolved: 0,
    ...overrides,
  };
}

function agentNode(): ProjectedNode {
  return {
    node_id: "agent:rogue",
    path: ["blocks", "0"],
    label: "Agent proposal",
    text: "Current and approved",
    source_kind: "agent_supplied",
    layout: "owner_pinned",
    attributed_to: { role: "agent", actor_ref: "agent:rogue", principal_ref: OBSERVER, agent_ref: "agent:rogue", on_behalf_of_ref: OBSERVER },
    bindings: [],
  };
}

describe("T09 workspace projection", () => {
  test("PE-01/PE-03/PE-07 reads the real projection and keeps the owner region order", async () => {
    const data = await application.workspace({ focusRef: "obj:strategy:alpha" });
    expect(data.snapshot.schema).toBe("horizon.workspace/1");
    expect(data.snapshot.regions.map((region) => region.id)).toEqual([...WORKSPACE_REGION_ORDER]);
    expect(data.snapshot.context.find((element) => element.id === "world")?.value).toBe(WORLD);
    expect(data.snapshot.context.find((element) => element.id === "focus")?.value).toBe("obj:strategy:alpha");
    expect(data.snapshot.scope).toBe("current");
    expect(data.snapshot.lineage.total_nodes).toBeGreaterThanOrEqual(4);
    expect(data.snapshot.lineage.table.rows.length).toBe(data.snapshot.lineage.total_nodes + data.snapshot.lineage.total_edges);
    expect(data.snapshot.lineage.fit).toBe("content");
  });

  test("PE-02/REQ-NAV-007 leads with plain language and a single next prerequisite", () => {
    const frame = j02Blocked();
    const snapshot = buildWorkspace({
      frame,
      view: emptyView(),
      objects: [],
      links: [],
      current: { frame_id: frame.frame_id, revision: frame.revision },
    });
    expect(snapshot.state).toBe("blocked");
    expect(snapshot.blocked).toHaveLength(1);
    expect(snapshot.blocked[0]?.reason).toContain("not authorized");
    expect(snapshot.blocked[0]?.next_step).toContain("sea-forge:approval:42");
    expect(snapshot.blocked[0]?.gates.find((gate) => gate.gate === "authority")?.prerequisite_ref).toBe("sea-forge:approval:42");
  });

  test("PE-04/PE-09 preserves actor attribution and source drill-down", () => {
    const view = emptyView({
      nodes: [
        {
          node_id: "evidence:1",
          path: ["blocks", "0"],
          label: "Receipt",
          text: "observed",
          source_kind: "bound",
          layout: "default_order",
          attributed_to: { role: "agent", actor_ref: "agent:helper", principal_ref: OBSERVER, agent_ref: "agent:helper", on_behalf_of_ref: OBSERVER },
          bindings: [{ expression: "horizon:evidence", namespace: "horizon", status: "bound", observation: "available", value: "ok", agent_supplied: false }],
        },
      ],
    });
    const frame = j02();
    const snapshot = buildWorkspace({ frame, view, objects: [], links: [], current: { frame_id: "other", revision: 9 } });
    expect(snapshot.evidence[0]?.actor.agent_ref).toBe("agent:helper");
    expect(snapshot.evidence[0]?.actor.on_behalf_of).toBe(OBSERVER);
    expect(snapshot.evidence[0]?.sources[0]?.expression).toBe("horizon:evidence");
    expect(snapshot.sources[0]?.status).toBe("bound");
  });

  test("PE-05/NE-01 an agent block claiming owner_pinned is appended, never moved into the decision", () => {
    const frame = j02();
    const view = emptyView({
      nodes: [agentNode(), {
        node_id: "owner:evidence",
        path: ["blocks", "1"],
        label: "Owner evidence",
        source_kind: "bound",
        layout: "owner_pinned",
        attributed_to: { role: "human", actor_ref: OBSERVER, principal_ref: OBSERVER },
        bindings: [],
      }],
      notes: [{ kind: "layout_authority_claimed", target: "agent:rogue", detail: "'owner_pinned' downgraded to 'agent_proposed'" }],
    });
    const snapshot = buildWorkspace({ frame, view, objects: [], links: [], current: { frame_id: frame.frame_id, revision: 1 } });
    expect(snapshot.regions.map((region) => region.id)).toEqual([...WORKSPACE_REGION_ORDER]);
    expect(snapshot.evidence.map((entry) => entry.node_id)).toEqual(["owner:evidence"]);
    expect(snapshot.reduction_notes[0]).toContain("layout_authority_claimed");
    expect(snapshot.notices.find((notice) => notice.tone === "reduction")?.text).toContain("owner order is unchanged");
  });

  test("PE-06/NE-02 historical scope comes from the frame comparison, not agent text", () => {
    const frame = j04Unknown();
    const view = emptyView({
      nodes: [{ ...agentNode(), label: "Current", text: "Approved by the owner" }],
    });
    const snapshot = buildWorkspace({
      frame,
      view,
      objects: [],
      links: [],
      current: { frame_id: "frame:newer", revision: 7 },
    });
    expect(snapshot.scope).toBe("historical");
    expect(snapshot.scope_banner).toContain("Historical frame");
    expect(snapshot.scope_banner).toContain("not current world state");
    expect(snapshot.scope_banner).not.toContain("Approved by the owner");
    expect(snapshot.state).toBe("blocked");
  });

  test("PE-07/NE-04 the graph aggregates beyond the bound and the table keeps every row", async () => {
    const data = await application.workspace({ focusRef: "obj:strategy:alpha" });
    const lineage = buildLineage(data.objects, data.links, 2);
    expect(lineage.aggregated).toBe(true);
    expect(lineage.nodes).toHaveLength(2);
    expect(lineage.omitted_nodes).toBe(data.objects.length - 2);
    expect(lineage.table.rows).toHaveLength(data.objects.length + data.links.length);
    expect(lineage.table.rows.length).toBeGreaterThan(lineage.nodes.length);
  });

  test("PE-10 empty, unknown and partial are distinct states", () => {
    const empty = buildWorkspace({
      frame: { ...j02(), choices: [], decision: "inspect" },
      view: emptyView(),
      objects: [],
      links: [],
      current: { frame_id: "frame:t08:1", revision: 1 },
    });
    expect(empty.state).toBe("empty");

    const unknown = buildWorkspace({
      frame: { ...j02(), checkpoint_ref: null, checkpoint_unknown_reason: "not read" },
      view: emptyView(),
      objects: [],
      links: [],
      current: { frame_id: "frame:t08:1", revision: 1 },
    });
    expect(unknown.state).toBe("unknown");

    const partial = buildWorkspace({
      frame: j02(),
      view: emptyView({ unresolved: 1 }),
      objects: [],
      links: [],
      current: { frame_id: "frame:t08:1", revision: 1 },
    });
    expect(partial.state).toBe("partial");
  });

  test("PE-01 scopeOf rejects a different revision, not only a different id", () => {
    const frame = { ...j02(), frame_id: "frame:a", revision: 2 };
    expect(scopeOf(frame, { frame_id: "frame:a", revision: 2 })).toBe("current");
    expect(scopeOf(frame, { frame_id: "frame:a", revision: 1 })).toBe("historical");
    expect(scopeOf(frame, { frame_id: "frame:b", revision: 2 })).toBe("historical");
  });
});

/** First-run derivations are pure: the same stored facts always give the same claims. */
describe("first-run derivations", () => {
  const governed = { governed: true, realitytrace: true };
  const ungoverned = { governed: false, realitytrace: false };

  test("short refs keep the readable part and the digest prefix", () => {
    expect(shortRef("world:horizon@sha256:0a10c20d22ee11a184165005a553390e7a45ce0b858773e2220e442eb0cf9d2b")).toBe("horizon@0a10c20d");
    expect(shortRef("obj:strategy:alpha")).toBe("obj:strategy:alpha");
    expect(shortRef("case:0123456789abcdef0123456789abcdef")).toBe("case:0123456789a…abcdef");
  });

  test("ungoverned onboarding names the missing pieces and the exact fix, and nothing is checked", () => {
    const off = onboardingOf({ ...ungoverned, caseOpen: false, committed: false, skipped: false });
    expect(off.visible).toBe(true);
    expect(off.steps.map((step) => step.done)).toEqual([false, false, false]);
    expect(off.steps[0]!.detail).toBe("Missing: SEA-Forge governance is off and RealityTrace is not configured.");
    expect(off.steps[0]!.fix).toBe("Start the cockpit with bun run ignite (see docs/IGNITION.md).");
    const on = onboardingOf({ ...governed, caseOpen: true, committed: false, skipped: false });
    expect(on.steps[0]!.done).toBe(true);
    expect(on.steps[0]!.fix).toBeNull();
  });

  test("skip hides the path until it is resumed, and the first commit ends it for good", () => {
    expect(onboardingOf({ ...ungoverned, caseOpen: false, committed: false, skipped: true }).visible).toBe(false);
    expect(onboardingOf({ ...ungoverned, caseOpen: false, committed: false, skipped: false }).visible).toBe(true);
    expect(onboardingOf({ ...governed, caseOpen: true, committed: true, skipped: false }).visible).toBe(false);
  });

  test("a governed refusal is attributed to SEA-Forge and states that nothing was recorded", () => {
    const move = moveOf(
      { intent_id: "intent-1", operation_ref: "horizon.health", committed: null, attempt: { outcome: "refused", reason: "policy denied" }, settlement: null, at: "2026-10-24T00:00:00.000Z" },
      governed,
    );
    expect(move.decided).toEqual({ state: "refused", text: "Refused by SEA-Forge: policy denied." });
    expect(move.recorded.state).toBe("not_recorded");
    expect(move.observed.state).toBe("not_applicable");
    expect(move.settleable).toBe(false);
  });

  test("an escalated commit waits on the approval named in its stored attempt", () => {
    const move = moveOf(
      { intent_id: "intent-2", operation_ref: "horizon.health", committed: null, attempt: { outcome: "awaiting_authority", reason: "SEA-Forge escalated; awaiting approval approval:42", approvalId: "approval:42" }, settlement: null, at: null },
      governed,
    );
    expect(move.decided.state).toBe("awaiting");
    expect(move.approval_id).toBe("approval:42");
  });

  test("a legacy attempt whose text names an approval but has no typed id is unverified and offers no approve control", () => {
    const move = moveOf(
      { intent_id: "intent-3", operation_ref: "horizon.health", committed: null, attempt: { outcome: "awaiting_authority", reason: "SEA-Forge escalated; awaiting approval approval:99" }, settlement: null, at: null },
      governed,
    );
    expect(move.approval_identity).toEqual({ state: "unverified" });
    expect(move.approval_id).toBeNull();
  });

  test("a new attempt record carries its typed approval id and the model reads it without parsing text", () => {
    const move = moveOf(
      { intent_id: "intent-4", operation_ref: "horizon.health", committed: null, attempt: { outcome: "awaiting_authority", reason: "unrelated wording", approvalId: "approval:typed" }, settlement: null, at: null },
      governed,
    );
    expect(move.approval_identity).toEqual({ state: "verified", approvalId: "approval:typed" });
    expect(move.approval_id).toBe("approval:typed");
  });

  test("an ungoverned commit is policy only, never SEA-Forge's decision, and is not observed", () => {
    const move = moveOf(
      { intent_id: "intent-3", operation_ref: "horizon.health", committed: { at: "2026-10-24T00:00:00.000Z", expected: false }, attempt: null, settlement: null, at: null },
      ungoverned,
    );
    expect(move.decided.text).toBe("Horizon policy only: SEA-Forge is off.");
    expect(move.settlement.state).toBe("not_required");
    expect(move.observed.state).toBe("unavailable");
    expect(move.settleable).toBe(false);
  });

  test("a governed commit with an observation names the evidence and can be settled until it is final", () => {
    const facts = {
      intent_id: "intent-4",
      operation_ref: "product.apply",
      committed: { at: "2026-10-24T00:00:00.000Z", expected: true },
      decision: { ref: "inv-4" },
      attempt: null,
      settlement: { status: "pending", final: false, reason: null, observation: { evidence_id: "ev-1", sxr_observation_id: "sxr-1" } },
      at: null,
    };
    const move = moveOf(facts, governed);
    expect(move.observed).toEqual({ state: "observed", text: "Observed by RealityTrace: ev-1." });
    expect(move.settleable).toBe(true);
    expect(moveOf({ ...facts, settlement: { ...facts.settlement, final: true } }, governed).settleable).toBe(false);
  });

  test("a governed commit with no recorded SEA-Forge decision is never presented as allowed by SEA-Forge", () => {
    const base = {
      intent_id: "intent-5",
      operation_ref: "product.apply",
      committed: { at: "2026-10-24T00:00:00.000Z", expected: true },
      attempt: null,
      settlement: null,
      at: null,
    };
    const unrecorded = moveOf(base, governed);
    expect(unrecorded.decided.state).not.toBe("allowed");
    expect(unrecorded.decided.text).not.toContain("Allowed by SEA-Forge");
    expect(unrecorded.decided.text).toContain("no SEA-Forge decision is recorded");
    expect(unrecorded.settleable).toBe(false);

    const recorded = moveOf({ ...base, decision: { ref: "inv-7" } }, governed);
    expect(recorded.decided.state).toBe("allowed");
    expect(recorded.decided.text).toBe("Allowed by SEA-Forge: decision inv-7.");
  });

  test("observation and the SEA-Forge ruling are separate steps: observing never offers or performs the ruling", () => {
    const base = {
      intent_id: "intent-6",
      operation_ref: "product.apply",
      committed: { at: "2026-10-24T00:00:00.000Z", expected: true },
      decision: { ref: "inv-6" },
      attempt: null,
      at: null,
    };
    const unobserved = moveOf({ ...base, settlement: null }, governed);
    expect(unobserved.observable).toBe(true);
    expect(unobserved.settleable).toBe(false);

    const observed = moveOf(
      { ...base, settlement: { status: "pending", final: false, reason: null, observation: { evidence_id: "ev-6" } } },
      governed,
    );
    expect(observed.observable).toBe(false);
    expect(observed.settleable).toBe(true);
  });

  test("the no-affordance message names the moves that can still be committed", () => {
    const base = { unresolved: 0, checkpointKnown: true, objects: 1, choices: 1, decision: "no_affordance" as const };
    expect(workspaceState({ ...base, submittable: 2 }).message).toBe("2 moves are available from this focus. Blocked moves show their reasons below.");
    expect(workspaceState({ ...base, submittable: 0 }).message).toBe("No move is available from this focus yet. The blocked reasons are shown below.");
  });
});

describe("typed approval id on stored attempts", () => {
  test("appendIntentAttempt persists approvalId and readIntentAttempts returns it; an attempt without one reads as null", async () => {
    const { appendIntentAttempt, readIntentAttempts } = await import("../src/capabilities/navigation-intent.ts");
    const store = application.runtime.runtime.store;
    const base = { actor_ref: null, caller_ref: null, outcome: "awaiting_authority" as const, reason: "SEA-Forge escalated; awaiting approval ap-typed", at: new Date().toISOString() };
    await appendIntentAttempt(store, { attempt: { ...base, intent_id: "typed-1", approvalId: "ap-typed" }, tenant: "t", scopeId: "s" });
    await appendIntentAttempt(store, { attempt: { ...base, intent_id: "legacy-1" }, tenant: "t", scopeId: "s" });
    const attempts = await readIntentAttempts(store);
    expect(attempts.find((a) => a.intent_id === "typed-1")?.approvalId).toBe("ap-typed");
    expect(attempts.find((a) => a.intent_id === "legacy-1")?.approvalId).toBeNull();
  });
});

describe("approval assurance", () => {
  test("known values map to themselves", () => {
    expect(approvalAssuranceOf("governed")).toBe("governed");
    expect(approvalAssuranceOf("unisolated-development")).toBe("unisolated-development");
  });
  test("missing or unrecognised values are unknown, never governed", () => {
    expect(approvalAssuranceOf(undefined)).toBe("unknown");
    expect(approvalAssuranceOf(null)).toBe("unknown");
    expect(approvalAssuranceOf("")).toBe("unknown");
    expect(approvalAssuranceOf("Governed!")).toBe("unknown");
    expect(approvalAssuranceOf("production")).toBe("unknown");
  });
});
