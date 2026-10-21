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
import { buildLineage, buildWorkspace, scopeOf, WORKSPACE_REGION_ORDER } from "../src/ui/workspace/model.ts";
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
