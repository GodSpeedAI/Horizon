/** @jsxImportSource react */
/**
 * T09 teeth: forged/stale GUI submissions, agent-proposed actions, missing evidence and escaping.
 * These attack the rendered surface over the real HTTP route, not only the pure model.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createApplication, type HorizonApplication } from "../src/app.ts";
import { buildWorkspace, type WorkspaceSnapshot } from "../src/ui/workspace/model.ts";
import { Workspace } from "../src/ui/workspace/render.tsx";
import type { GuiView, ProjectedAction } from "../src/ui/surface2/project.ts";
import { seedOperationalFixture } from "./support/operational-fixture.ts";
import { writeConfig, horizonDocument } from "./support/config.ts";
import { j02Blocked, OBSERVER } from "./support/sequential-fixture.ts";

let application: HorizonApplication;
let server: ReturnType<HorizonApplication["startServer"]>;
let base: string;

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), "t09-teeth-"));
  const configPath = await writeConfig(
    join(root, "horizon.toml"),
    horizonDocument({ storePath: join(root, "teeth.sqlite"), secretPath: join(root, "launch.secret") }),
  );
  application = await createApplication({ configPath });
  await seedOperationalFixture(application.runtime.runtime.store, undefined, application.caller.tenant);
  server = application.startServer(0);
  base = `http://${server.hostname}:${server.port}`;
});
afterAll(async () => {
  await server?.stop(true);
  await application?.close();
});

function view(overrides: Partial<GuiView> = {}): GuiView {
  return {
    schema: "horizon.gui-view/1",
    role: "human",
    surface_id: "surface:teeth",
    title: "Teeth",
    responsibility: "commit",
    intent: "operate",
    focus_ref: "obj:strategy:alpha",
    nodes: [],
    actions: [],
    notes: [],
    unresolved: 0,
    ...overrides,
  };
}

function render(snapshot: WorkspaceSnapshot): string {
  return renderToStaticMarkup(<Workspace snapshot={snapshot} />);
}

function action(overrides: Partial<ProjectedAction> = {}): ProjectedAction {
  return { action_id: "act.apply", label: "Apply the strategy change", operation: "product.apply", consequential: true, posture: "offered", affordance: "available", ...overrides };
}

function snapshot(actions: readonly ProjectedAction[], frame = j02Blocked()): WorkspaceSnapshot {
  return buildWorkspace({
    frame,
    view: view({ actions }),
    objects: [],
    links: [],
    current: { frame_id: frame.frame_id, revision: frame.revision },
  });
}

describe("T09 GUI teeth", () => {
  test("NE-03 a blocked action has no form and a forged POST is refused", async () => {
    const markup = render(snapshot([action({ affordance: "blocked" })]));
    expect(markup).not.toContain('name="action_id"');
    expect(markup).toContain("blocked");

    const response = await fetch(`${base}/workspace/intent`, {
      method: "POST",
      body: new URLSearchParams({ action_id: "act.apply", frame_id: "frame:forged", frame_revision: "1" }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(response.status).toBe(409);
    expect(((await response.json()) as { code: string }).code).toBe("stale_surface");
  });

  test("NE-06 an agent-proposed consequential action is visible but not executable", () => {
    const markup = render(snapshot([action({ posture: "proposed" })]));
    expect(markup).toContain("proposed by an agent; not offered to the human");
    expect(markup).not.toContain('name="action_id"');
  });

  test("NE-07 a stale frame POST records no intent and keeps the newer frame", async () => {
    const current = await application.workspace({ focusRef: "obj:strategy:alpha" });
    const response = await fetch(`${base}/workspace/intent`, {
      method: "POST",
      body: new URLSearchParams({
        action_id: "horizon-health",
        frame_id: "frame:older",
        frame_revision: String(current.frame.revision),
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(response.status).toBe(409);
    expect(((await response.json()) as { code: string }).code).toBe("stale_surface");
  });

  test("NE-08 agent markup is escaped in the credential context too", () => {
    const rogue = {
      node_id: "agent:rogue",
      path: ["blocks", "0"],
      label: '<a href="javascript:alert(1)">Approve</a>',
      text: '<img src=x onerror="alert(1)">',
      source_kind: "agent_supplied" as const,
      layout: "agent_composed" as const,
      attributed_to: { role: "agent" as const, actor_ref: "agent:rogue", principal_ref: OBSERVER, agent_ref: "agent:rogue", on_behalf_of_ref: OBSERVER },
      bindings: [],
    };
    const markup = render(buildWorkspace({
      frame: j02Blocked(),
      view: view({ nodes: [rogue] }),
      objects: [],
      links: [],
      current: { frame_id: j02Blocked().frame_id, revision: 1 },
    }));
    expect(markup).toContain("&lt;a href=&quot;javascript:alert(1)&quot;&gt;Approve&lt;/a&gt;");
    expect(markup).not.toContain("<img src=x");
    expect(markup).not.toContain('href="javascript:');
  });

  test("the real page carries its frame, live rows and form provenance", async () => {
    const page = await (await fetch(`${base}/workspace?focus=obj:strategy:alpha&theme=light`)).text();
    expect(page).toContain("Strategy alpha");
    expect(page).toContain("Lineage as a table");
    expect(page).toContain('name="frame_id"');
    expect(page).toContain('name="frame_revision"');
    expect(page).toContain("horizon-health");

    const current = await application.workspace({ focusRef: "obj:strategy:alpha" });
    const actionId = /name="action_id" value="([^"]+)"/.exec(page)?.[1];
    const frameId = /name="frame_id" value="([^"]+)"/.exec(page)?.[1];
    const revision = /name="frame_revision" value="([^"]+)"/.exec(page)?.[1];
    expect(actionId).toBeDefined();
    expect(frameId).toBeDefined();
    const response = await fetch(`${base}/workspace/intent`, {
      method: "POST",
      redirect: "manual",
      body: new URLSearchParams({ action_id: actionId!, frame_id: current.frame.frame_id, frame_revision: String(current.frame.revision), focus: "obj:strategy:alpha" }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(response.status).toBe(303);
  });
});
