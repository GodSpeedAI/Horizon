/** @jsxImportSource react */
/**
 * Teeth for the desk (replaces the T09 page teeth): forged or stale submissions are refused, agent-written text is shown as text,
 * and the page cannot run script it did not ship.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createApplication, type HorizonApplication } from "../src/app.ts";
import { START, type UiState } from "../src/ui/desk/attention.ts";
import { buildDecide } from "../src/ui/desk/decide-build.ts";
import { Desk } from "../src/ui/desk/Desk.tsx";
import { seedOperationalFixture } from "./support/operational-fixture.ts";
import { writeConfig, horizonDocument } from "./support/config.ts";
import { deskState } from "./support/desk-fixture.ts";
import { quietIo } from "./support/desk-io.ts";

let application: HorizonApplication;
let server: ReturnType<HorizonApplication["startServer"]>;
let base: string;

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), "desk-teeth-"));
  const configPath = await writeConfig(join(root, "horizon.toml"), horizonDocument({ storePath: join(root, "teeth.sqlite"), secretPath: join(root, "launch.secret") }));
  application = await createApplication({ configPath });
  await seedOperationalFixture(application.runtime.runtime.store, undefined, application.caller.tenant);
  server = application.startServer(0);
  base = `http://${server.hostname}:${server.port}`;
});
afterAll(async () => {
  await server?.stop(true);
  await application?.close();
});

const draw = (ui: UiState): string => renderToStaticMarkup(<Desk ui={ui} dispatch={() => undefined} io={quietIo()} />);

describe("desk teeth", () => {
  test("NE-03 a forged intent for a frame the server never made is refused", async () => {
    const response = await fetch(`${base}/workspace/intent`, {
      method: "POST",
      body: new URLSearchParams({ action_id: "act.apply", frame_id: "frame:forged", frame_revision: "1" }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(response.status).toBe(409);
    expect(((await response.json()) as { code: string }).code).toBe("stale_surface");
  });

  test("NE-07 a stale frame POST records no intent and keeps the newer frame", async () => {
    const current = await application.workspace({ focusRef: "obj:strategy:alpha" });
    const response = await fetch(`${base}/workspace/intent`, {
      method: "POST",
      body: new URLSearchParams({ action_id: "horizon-health", frame_id: "frame:older", frame_revision: String(current.frame.revision) }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(response.status).toBe(409);
    expect(((await response.json()) as { code: string }).code).toBe("stale_surface");
  });

  test("NE-08 agent-written text on a decision card is shown as text, never as markup", () => {
    const row = {
      approval_id: "apr-x", state: "pending", requester: "agent:rogue", world_ref: "w", operation_kind: "action",
      operation_name: '<img src=x onerror="alert(1)">', resource_id: '<a href="javascript:alert(1)">Approve</a>', subject_actor_ref: "actor:operator",
      request_ref: "env", expires_at: "2099-01-01T00:00:00Z", resolved_by: null,
    };
    const decide = buildDecide({
      inbox: { state: "listed", inbox: { waiting: [{ ...row, state: "pending", decision: { kind: "decidable" }, past_expiry: false }] as never, decided: [], malformed: 0 } },
      moves: [],
      caseApprovals: { kind: "none" },
      holds: new Map(),
    });
    const html = draw({ ...START, view: "decide", data: deskState({ decide }) });
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain('href="javascript:');
  });

  test("a decision cannot be sent with no preview: the old one-click routes are gone", async () => {
    for (const path of ["/workspace/approval", "/workspace/settle"]) {
      const response = await fetch(`${base}${path}`, { method: "POST", body: new URLSearchParams({ approval_id: "x", intent_id: "x", phase: "rule", decision: "approve" }) });
      expect(response.status).toBe(404);
    }
  });

  test("the page the desk is served in allows only its own script and style", async () => {
    for (const path of ["/workspace", "/desk", "/workspace/approvals", "/workspace/economics"]) {
      const response = await fetch(`${base}${path}`);
      const csp = response.headers.get("content-security-policy") ?? "";
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toContain("unsafe-inline");
    }
  });

  test("a foreign Host is refused on the new routes too", async () => {
    const refused = await fetch(`${base}/desk/decide`, { method: "POST", headers: { host: "evil.example:80", "content-type": "application/json" }, body: JSON.stringify({ card_id: "x", choice: "hold" }) });
    expect(refused.status).toBe(403);
  });
});
