import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SeaForgeAuthority, type ApprovalStanding } from "@godspeedai/cognate-runtime-bun";
import type { ApprovalAuthority } from "../src/adapters/sea-forge-config.ts";
import { buildInbox } from "../src/domain/approval-inbox.ts";
import { renderApprovalInboxPage } from "../src/ui/workspace/approval-inbox.tsx";
import { createApplication, selfApprovalRefusal } from "../src/app.ts";
import { writeConfig, horizonDocument } from "./support/config.ts";

const NOW = new Date("2026-11-02T12:00:00Z");
const OPERATOR = "actor:operator";

function row(over: Partial<ApprovalStanding> = {}): ApprovalStanding {
  return {
    approval_id: "apr-cep:op-1",
    state: "pending",
    requester: "cognate-service",
    world_ref: "world:horizon@sha256:abc",
    operation_kind: "action",
    operation_name: "run.start",
    resource_id: "res-7",
    subject_actor_ref: "actor:operator",
    request_ref: "env-1",
    expires_at: "2026-11-02T13:00:00Z",
    resolved_by: null,
    ...over,
  };
}

describe("buildInbox", () => {
  test("only a pending approval that a Horizon commit waits on is decidable here", () => {
    const inbox = buildInbox([row({ approval_id: "apr-a" }), row({ approval_id: "apr-b" })], 0, { now: NOW, waitingApprovalIds: new Set(["apr-a"]), operatorRef: OPERATOR });
    const byId = Object.fromEntries(inbox.waiting.map((item) => [item.approval_id, item.decision.kind]));
    expect(byId).toEqual({ "apr-a": "decidable", "apr-b": "not_decidable_here" });
  });
  test("a clock-expired pending approval is never offered, even if a commit waits on it", () => {
    const inbox = buildInbox([row({ expires_at: "2026-11-02T11:00:00Z" })], 0, { now: NOW, waitingApprovalIds: new Set(["apr-cep:op-1"]), operatorRef: OPERATOR });
    expect(inbox.waiting[0]?.decision).toEqual({ kind: "not_decidable_here", reason: "past its expiry time" });
    expect(inbox.waiting[0]?.past_expiry).toBe(true);
  });
  test("a decided approval is listed as decided, with who resolved it, and offers nothing", () => {
    const inbox = buildInbox([row({ state: "approved", resolved_by: "actor:operator" })], 0, { now: NOW, waitingApprovalIds: new Set(["apr-cep:op-1"]), operatorRef: OPERATOR });
    expect(inbox.waiting).toHaveLength(0);
    expect(inbox.decided[0]?.resolved_by).toBe("actor:operator");
    expect(inbox.decided[0]?.decision).toEqual({ kind: "not_decidable_here", reason: "already approved" });
  });
  test("a request the operator made is not decidable by the operator", () => {
    const inbox = buildInbox([row({ requester: OPERATOR })], 0, { now: NOW, waitingApprovalIds: new Set(["apr-cep:op-1"]), operatorRef: OPERATOR });
    expect(inbox.waiting[0]?.decision.kind).toBe("not_decidable_here");
  });
  test("rows the client excluded are reported and never shown", () => {
    const inbox = buildInbox([row()], 2, { now: NOW, waitingApprovalIds: new Set(), operatorRef: OPERATOR });
    expect(inbox.excluded).toBe(2);
    expect(inbox.waiting).toHaveLength(1);
  });
  test("waiting items are ordered soonest expiry first", () => {
    const inbox = buildInbox(
      [row({ approval_id: "apr-late", expires_at: "2026-11-02T15:00:00Z" }), row({ approval_id: "apr-soon", expires_at: "2026-11-02T13:00:00Z" })],
      0,
      { now: NOW, waitingApprovalIds: new Set(), operatorRef: OPERATOR },
    );
    expect(inbox.waiting.map((item) => item.approval_id)).toEqual(["apr-soon", "apr-late"]);
  });
});

describe("renderApprovalInboxPage", () => {
  test("offers the existing decision form only for a decidable item", () => {
    const inbox = buildInbox([row({ approval_id: "apr-a" }), row({ approval_id: "apr-b" })], 0, { now: NOW, waitingApprovalIds: new Set(["apr-a"]), operatorRef: OPERATOR });
    const html = renderApprovalInboxPage({ state: "listed", inbox });
    expect(html.match(/action="\/workspace\/approval"/g)?.length).toBe(1);
    expect(html).toContain('data-approval="apr-a" data-state="pending" data-decidable="yes"');
    expect(html).toContain('data-approval="apr-b" data-state="pending" data-decidable="no"');
    expect(html).toContain("no Horizon commit waits on it");
  });
  test("escapes SEA-Forge-supplied text", () => {
    const inbox = buildInbox([row({ operation_name: "<script>x</script>" })], 0, { now: NOW, waitingApprovalIds: new Set(), operatorRef: OPERATOR });
    const html = renderApprovalInboxPage({ state: "listed", inbox });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });
  test("an unreachable SEA-Forge is said plainly, not shown as an empty inbox", () => {
    const html = renderApprovalInboxPage({ state: "unreachable", message: "SEA-Forge did not answer in time" });
    expect(html).toContain("did not list approvals");
    expect(html).not.toContain("Nothing is waiting");
    expect(html).not.toContain('action="/workspace/approval"');
  });
  test("an unconfigured approver shows no decision form", () => {
    const html = renderApprovalInboxPage({ state: "not_configured" });
    expect(html).toContain("No approver is configured");
    expect(html).not.toContain('action="/workspace/approval"');
  });
});

describe("the SDK client listing over the SEA-Forge socket", () => {
  const dir = mkdtempSync(join(tmpdir(), "inbox-sock-"));
  const socketPath = join(dir, "sea-forge.sock");
  const received: Record<string, unknown>[] = [];
  let reply: Record<string, unknown> = { ok: true, approvals: [row()] };
  const server = Bun.listen({
    unix: socketPath,
    socket: {
      data(socket, chunk) {
        const request = JSON.parse(new TextDecoder().decode(chunk).trim()) as Record<string, unknown>;
        received.push(request);
        socket.write(`${JSON.stringify(reply)}\n`);
        socket.end();
      },
    },
  });
  afterAll(() => {
    server.stop(true);
    rmSync(dir, { recursive: true, force: true });
  });
  const client = new SeaForgeAuthority({ socketPath, actor: { actor_id: "cognate-service", role: "service" }, timeoutMs: 2_000 });

  test("sends the read-only verb as the service actor and returns the rows", async () => {
    reply = { ok: true, approvals: [row()] };
    const listed = await client.listApprovals();
    expect(listed.ok && listed.approvals).toHaveLength(1);
    expect(received.at(-1)).toEqual({ verb: "authority_approvals", actor: { actor_id: "cognate-service", role: "service" } });
  });

  test("a refusal from SEA-Forge is an error, never an empty list", async () => {
    reply = { ok: false, error_class: "identity_authentication_refused" };
    const listed = await client.listApprovals();
    expect(listed).toMatchObject({ ok: false, errorClass: "identity_authentication_refused" });
  });
});

describe("GET /workspace/approvals through the application", () => {
  const dir = mkdtempSync(join(tmpdir(), "inbox-app-"));
  const socketPath = join(dir, "sea-forge.sock");
  let listed: unknown[] = [row({ approval_id: "apr-live-1" })];
  const server = Bun.listen({
    unix: socketPath,
    socket: {
      data(socket, chunk) {
        const request = JSON.parse(new TextDecoder().decode(chunk).trim()) as Record<string, unknown>;
        const reply = request.verb === "authority_approvals" ? { ok: true, approvals: listed } : { ok: false, error_class: "unscripted_verb" };
        socket.write(`${JSON.stringify(reply)}\n`);
        socket.end();
      },
    },
  });
  afterAll(() => {
    server.stop(true);
    rmSync(dir, { recursive: true, force: true });
  });

  async function withApp(approvals: ApprovalAuthority | undefined, run: (base: URL) => Promise<void>): Promise<void> {
    const root = mkdtempSync(join(tmpdir(), "inbox-root-"));
    try {
      const configPath = await writeConfig(join(root, "horizon.toml"), horizonDocument({ storePath: join(root, "inbox.sqlite"), secretPath: join(root, "launch.secret") }));
      const application = await createApplication({ configPath, ...(approvals === undefined ? {} : { approvals }) });
      const started = application.startServer(0);
      try {
        await run(new URL(started.url));
      } finally {
        started.stop(true);
        await application.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  test("with no approver configured the page says so and offers no decision", async () => {
    await withApp(undefined, async (base) => {
      const response = await fetch(new URL("/workspace/approvals", base));
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(html).toContain("No approver is configured");
      expect(html).not.toContain('action="/workspace/approval"');
    });
  });

  test("with SEA-Forge listing a pending approval, it shows as waiting and is not decidable without a commit", async () => {
    listed = [row({ approval_id: "apr-live-1" })];
    await withApp({ socketPath, service: { actor_id: "cognate-service", role: "service" }, operator: { actor_id: OPERATOR, role: "operator" }, timeoutMs: 2_000 }, async (base) => {
      const html = await (await fetch(new URL("/workspace/approvals", base))).text();
      expect(html).toContain('data-approval="apr-live-1" data-state="pending" data-decidable="no"');
      expect(html).toContain("Waiting for a decision (1)");
      expect(html).not.toContain('action="/workspace/approval"');
    });
  });
});

describe("selfApprovalRefusal (fail closed)", () => {
  const actors = new Map([["op:sam", "actor:sam"], ["op:alex", "actor:alex"]]);
  const actorFor = (id: string) => actors.get(id);
  test("the requester approving its own escalation is refused, by recorded id or by mapped actor", () => {
    expect(selfApprovalRefusal({ requester: "actor:sam", approver: "actor:sam", actorFor })).toBe("the requester cannot approve its own escalation");
    expect(selfApprovalRefusal({ requester: "op:sam", approver: "actor:sam", actorFor })).toBe("the requester cannot approve its own escalation");
  });
  test("an unknown requester is refused, not allowed", () => {
    expect(selfApprovalRefusal({ requester: undefined, approver: "actor:alex", actorFor })).toContain("requester of this escalation cannot be determined");
    expect(selfApprovalRefusal({ requester: null, approver: "actor:alex", actorFor })).toContain("cannot be determined");
    expect(selfApprovalRefusal({ requester: "", approver: "actor:alex", actorFor })).toContain("cannot be determined");
  });
  test("an unknown approver is refused, not allowed", () => {
    expect(selfApprovalRefusal({ requester: "op:sam", approver: undefined, actorFor })).toContain("approver's identity cannot be determined");
    expect(selfApprovalRefusal({ requester: "op:sam", approver: "", actorFor })).toContain("cannot be determined");
  });
  test("a distinct requester and approver are allowed", () => {
    expect(selfApprovalRefusal({ requester: "op:sam", approver: "actor:alex", actorFor })).toBeNull();
    expect(selfApprovalRefusal({ requester: "agent:builder", approver: "actor:alex", actorFor })).toBeNull();
  });
});
