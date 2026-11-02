/** @jsxImportSource react */
/**
 * T09 GUI rendering: semantic HTML, keyboard/SR obligations, themes, graph/table equivalence and
 * the real Cognate React projection path. The page is server-rendered; there is no client state
 * that could enable an action on its own.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createApplication, type HorizonApplication } from "../src/app.ts";
import { buildWorkspace, moveOf, onboardingOf, statusOf, type WorkspaceChrome, type WorkspaceSnapshot } from "../src/ui/workspace/model.ts";
import { Workspace, renderWorkspacePage } from "../src/ui/workspace/render.tsx";
import type { GuiView } from "../src/ui/surface2/project.ts";
import { seedOperationalFixture } from "./support/operational-fixture.ts";
import { writeConfig, horizonDocument } from "./support/config.ts";
import { j02, j02Blocked, CHECKPOINT, OBSERVER } from "./support/sequential-fixture.ts";

let application: HorizonApplication;

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), "t09-render-"));
  const configPath = await writeConfig(
    join(root, "horizon.toml"),
    horizonDocument({ storePath: join(root, "render.sqlite"), secretPath: join(root, "launch.secret") }),
  );
  application = await createApplication({ configPath });
  await seedOperationalFixture(application.runtime.runtime.store, undefined, application.caller.tenant);
});
afterAll(async () => {
  await application?.close();
});

function view(overrides: Partial<GuiView> = {}): GuiView {
  return {
    schema: "horizon.gui-view/1",
    role: "human",
    surface_id: "surface:test",
    title: "Test workspace",
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

function snapshot(overrides: Partial<Parameters<typeof buildWorkspace>[0]> = {}): WorkspaceSnapshot {
  const frame = overrides.frame ?? j02();
  return buildWorkspace({
    frame,
    view: overrides.view ?? view({
      actions: [{ action_id: "act.apply", label: "Apply the strategy change", operation: "product.apply", consequential: true, posture: "offered", affordance: "available" }],
    }),
    objects: overrides.objects ?? [],
    links: overrides.links ?? [],
    current: overrides.current ?? { frame_id: frame.frame_id, revision: frame.revision },
    ...(overrides.evidenceRef === undefined ? {} : { evidenceRef: overrides.evidenceRef }),
    ...(overrides.theme === undefined ? {} : { theme: overrides.theme }),
    ...(overrides.error === undefined ? {} : { error: overrides.error }),
  });
}

function html(document: WorkspaceSnapshot): string {
  return renderToStaticMarkup(<Workspace snapshot={document} />);
}

describe("T09 workspace HTML", () => {
  test("PE-08/PE-03 renders landmarks, live scope, keyboard controls and theme tokens", () => {
    const markup = html(snapshot());
    // Intentional (brief: light by default): no theme asked for means no data-theme, so the OS preference applies.
    expect(markup).toContain('<html lang="en">');
    expect(markup).not.toContain('<html lang="en" data-theme=');
    expect(markup).toContain('class="skip" href="#main"');
    expect(markup).toContain('role="status" aria-live="polite" aria-atomic="true" data-scope="current"');
    expect(markup).toContain('data-owner-pinned="true"');
    expect(markup).toContain("<button type=\"submit\">");
    expect(markup).toContain("focus-visible");
    expect(markup).toContain("prefers-reduced-motion");
    expect(markup).toContain(':root[data-theme="light"]');
    expect(markup).toContain("aria-labelledby");
  });

  test("PE-02/REQ-NAV-007 renders why a choice is blocked before the gate drill-down", () => {
    const markup = html(snapshot({ frame: j02Blocked() }));
    const reason = markup.indexOf("authorized approver");
    const next = markup.indexOf("sea-forge:approval:42");
    const gates = markup.indexOf("Gates and evidence");
    expect(reason).toBeGreaterThan(-1);
    expect(next).toBeGreaterThan(reason);
    expect(gates).toBeGreaterThan(next);
    expect(markup).toContain("What this commitment means");
    expect(markup).toContain("It does not approve, execute or settle");
  });

  test("PE-05/NE-02 historical scope is a fixed banner and agent text is escaped", () => {
    const rogue = {
      node_id: "agent:rogue",
      path: ["blocks", "0"],
      label: "<script>alert(1)</script>",
      text: "Current — approved",
      source_kind: "agent_supplied" as const,
      layout: "agent_composed" as const,
      attributed_to: { role: "agent" as const, actor_ref: "agent:rogue", principal_ref: OBSERVER, agent_ref: "agent:rogue", on_behalf_of_ref: OBSERVER },
      bindings: [],
    };
    const markup = html(snapshot({
      frame: j02(),
      view: view({ nodes: [rogue] }),
      current: { frame_id: "frame:newer", revision: 9 },
    }));
    expect(markup).toContain('data-scope="historical"');
    expect(markup).toContain("Historical frame");
    expect(markup).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(markup).not.toContain("<script>alert(1)</script>");
    expect(markup).toContain("agent:rogue acting for");
  });

  test("PE-07/NE-04 graphs open fit-to-content, aggregate and always offer a full table", () => {
    const objects = [
      { schema: "horizon.operational-objects/1", object_ref: "obj:a", semantic_ref: "horizon.interaction::CanonicalJourney", label: "A", fields: {}, provenance: { product: "horizon", connector: "fixture", integration_level: "fixture", checkpoint_ref: CHECKPOINT, observed_at: "2026-10-20T00:00:00Z" } },
      { schema: "horizon.operational-objects/1", object_ref: "obj:b", semantic_ref: "horizon.interaction::CanonicalJourney", label: "B", fields: {}, provenance: { product: "horizon", connector: "fixture", integration_level: "fixture", checkpoint_ref: CHECKPOINT, observed_at: "2026-10-20T00:00:00Z" } },
      { schema: "horizon.operational-objects/1", object_ref: "obj:c", semantic_ref: "horizon.interaction::CanonicalJourney", label: "C", fields: {}, provenance: { product: "horizon", connector: "fixture", integration_level: "fixture", checkpoint_ref: CHECKPOINT, observed_at: "2026-10-20T00:00:00Z" } },
    ] as const;
    const markup = html(snapshot({ objects: objects as never, links: [] }));
    expect(markup).toContain("viewBox=");
    expect(markup).toContain("fit-to-content");
    expect(markup).toContain("Lineage as a table");
    expect(markup).toContain("obj:a");
    expect(markup).toContain("obj:c");
  });

  test("PE-10 error is an alert state and does not render a decision form", () => {
    const markup = html(snapshot({ error: { code: "unreadable", message: "store unavailable" } }));
    expect(markup).toContain('data-state="error"');
    expect(markup).toContain('role="alert"');
    expect(markup).not.toContain("<form method=\"post\"");
  });

  test("PE-09 evidence and source refs stay inspectable behind progressive disclosure", () => {
    const markup = html(snapshot({
      view: view({
        nodes: [{
          node_id: "evidence:1",
          path: ["blocks", "0"],
          label: "Receipt",
          text: "observed by the authority",
          source_kind: "bound",
          layout: "default_order",
          attributed_to: { role: "human", actor_ref: OBSERVER, principal_ref: OBSERVER },
          bindings: [{ expression: "horizon:evidence", namespace: "horizon", status: "bound", observation: "available", value: "ok", agent_supplied: false }],
        }],
      }),
    }));
    expect(markup).toContain("<summary>Sources for this evidence</summary>");
    expect(markup).toContain("<code>horizon:evidence</code>");
    expect(markup).toContain("<summary>Raw refs and gates</summary>");
    expect(markup).not.toContain("unknown_namespace");
  });

  test("NE-05 an unavailable source is reported as unresolved, never as an empty success", () => {
    const markup = html(snapshot({
      view: view({
        nodes: [{
          node_id: "evidence:missing",
          path: ["blocks", "0"],
          label: "Missing evidence",
          source_kind: "bound",
          layout: "default_order",
          attributed_to: { role: "human", actor_ref: OBSERVER, principal_ref: OBSERVER },
          bindings: [{ expression: "horizon:missing", namespace: "horizon", status: "refused", reason: "not_found", value: null, agent_supplied: false }],
        }],
      }),
    }));
    expect(markup).toContain("refused");
    expect(markup).toContain("not_found");
    expect(markup).not.toContain("No source bindings are present.");
  });

  test("Cognate React supplies the operational rows for the full page", async () => {
    const data = await application.workspace({ focusRef: "obj:strategy:alpha" });
    const page = await renderWorkspacePage({
      service: application.runtime.runtime.service,
      caller: application.caller,
      frame: data.frame,
      view: data.view,
      current: data.current,
      theme: "light",
      evidenceRef: null,
      expectedObjects: data.objects.length,
    });
    expect(page.startsWith("<!doctype html>")).toBe(true);
    expect(page).toContain('data-theme="light"');
    expect(page).toContain("Current frame");
    expect(page).toContain("Strategy alpha");
    expect(page).toContain("Lineage as a table");
    expect(page).not.toContain("Reading the workspace.");
  });
});

/** The first-run panel, status rail, receipt and moves: the stored state each one shows. */
describe("first-run cockpit rendering", () => {
  const status = statusOf({ worldRef: "world:horizon@sha256:0a10c20d22ee11a184165005a553390e7a45ce0b858773e2220e442eb0cf9d2b", governed: false, realitytrace: false, approvals: false, operator: "local_operator" });
  const chromeFor = (overrides: Partial<WorkspaceChrome> = {}): WorkspaceChrome => ({
    status,
    onboarding: onboardingOf({ governed: false, realitytrace: false, caseOpen: false, committed: false, skipped: false }),
    openCase: null,
    caseError: null,
    receipt: null,
    moves: [],
    ...overrides,
  });

  test("the empty moves list says what appears there and points at step 3", () => {
    const markup = pageWith(snapshot(), chromeFor());
    expect(markup).toContain("Committed moves and refusals appear here");
    expect(markup).toContain("step 3 of Getting started");
  });

  test("steps are announced as Step N of 3 with the active step marked", () => {
    const markup = pageWith(snapshot(), chromeFor());
    expect(markup).toContain('aria-labelledby="heading-start"');
    expect(markup).toContain("Step 1 of 3");
    expect(markup).toContain("Step 3 of 3");
    expect(markup.match(/<li data-step="[a-z]+" data-done="(?:true|false)" aria-current="step">/g)?.length).toBe(1);
    expect(markup).toContain('data-step="stack" data-done="false" aria-current="step"');
  });

  test("the page opens with one primary action, before the context and the decision", () => {
    const markup = pageWith(snapshot(), chromeFor());
    const primary = markup.indexOf('id="primary-action"');
    expect(primary).toBeGreaterThan(-1);
    expect(markup.slice(primary)).toContain("What to do now");
    expect(primary).toBeLessThan(markup.indexOf('id="region-context"'));
    expect(primary).toBeLessThan(markup.indexOf('id="region-decision"'));
    // The panel links to the place the operator acts; it does not submit anything itself.
    expect(markup.slice(primary, markup.indexOf("</section>", primary))).not.toContain("<form");
  });

  test("the status rail states every process in text, not colour alone", () => {
    const markup = pageWith(snapshot(), chromeFor());
    expect(markup).toContain("World: <code");
    expect(markup).toContain("horizon@0a10c20d");
    expect(markup).toContain("SEA-Forge: off");
    expect(markup).toContain("RealityTrace: off");
    expect(markup).toContain("Approvals: not configured");
    expect(markup).toContain("Operator: local_operator");
  });

  test("an escalated commit without approvals says so and gives the fix instead of buttons", () => {
    const move = moveOf(
      { intent_id: "intent-9", operation_ref: "product.apply", committed: null, attempt: { outcome: "awaiting_authority", reason: "SEA-Forge escalated; awaiting approval approval:7" }, settlement: null, at: null },
      { governed: true, realitytrace: true },
    );
    const markup = pageWith(snapshot(), chromeFor({ receipt: { intent_id: "intent-9", found: true, move, approvals: false } }));
    expect(markup).toContain("Waiting for your decision");
    expect(markup).toContain("Approvals are not configured");
    expect(markup).toContain("COGNATE_SEA_FORGE_OPERATOR");
    expect(markup).not.toContain('name="decision"');
  });

  test("with approvals configured the escalation offers Approve and Reject on its own approval", () => {
    const move = moveOf(
      { intent_id: "intent-10", operation_ref: "product.apply", committed: null, attempt: { outcome: "awaiting_authority", reason: "SEA-Forge escalated; awaiting approval approval:8" }, settlement: null, at: null },
      { governed: true, realitytrace: true },
    );
    const markup = pageWith(snapshot(), chromeFor({ receipt: { intent_id: "intent-10", found: true, move, approvals: true } }));
    expect(markup).toContain('action="/workspace/approval"');
    expect(markup).toContain('name="approval_id" value="approval:8"');
    expect(markup).toContain('value="approve"');
    expect(markup).toContain('value="reject"');
    expect(markup.match(/name="decision"/g)?.length).toBe(2);
  });

  test("an unknown receipt renders No such commit and the case error uses fixed copy", () => {
    const markup = pageWith(snapshot(), chromeFor({ receipt: { intent_id: "<b>x</b>", found: false, move: null, approvals: false }, caseError: "empty" }));
    expect(markup).toContain("No such commit.");
    expect(markup).not.toContain("<b>x</b>");
    expect(markup).toContain("The case cannot be blank.");
  });
});

function pageWith(document: WorkspaceSnapshot, chrome: WorkspaceChrome): string {
  return renderToStaticMarkup(<Workspace snapshot={document} chrome={chrome} />);
}
