import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SeaForgeAuthority, type ApprovalStanding } from "@godspeedai/cognate-runtime-bun";
import type { ApprovalAuthority } from "../src/adapters/sea-forge-config.ts";
import { buildInbox } from "../src/domain/approval-inbox.ts";
import { parseInboxErrorCode, renderApprovalInboxPage } from "../src/ui/workspace/approval-inbox.tsx";
import { ApprovalFollowUpError, afterRecordedDecision, approvalErrorCode, createApplication, selfApprovalRefusal } from "../src/app.ts";
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

describe("renderApprovalInboxPage clarity (issue #24)", () => {
  const page = (rows: ApprovalStanding[], excluded = 0, waiting: string[] = [], notice?: Parameters<typeof renderApprovalInboxPage>[2]) =>
    renderApprovalInboxPage({ state: "listed", inbox: buildInbox(rows, excluded, { now: NOW, waitingApprovalIds: new Set(waiting), operatorRef: OPERATOR }) }, undefined, notice);

  test("a pending item says what is approved, who asked, when it expires, and what each button does", () => {
    const html = page([row({ approval_id: "apr-a", operation_name: "navigation.commit", requester: "cognate-service" })], 0, ["apr-a"]);
    expect(html).toContain("Waiting for a decision: navigation.commit, requested by cognate-service");
    expect(html).toContain("2026-11-02T13:00:00Z");
    expect(html).toContain("does not report when it was requested");
    expect(html).toMatch(/<button[^>]*value="approve"[^>]*>Approve<\/button>/);
    expect(html).toMatch(/<button[^>]*value="reject"[^>]*>Reject<\/button>/);
    expect(html).toContain("SEA-Forge lets the waiting commit go ahead.");
    expect(html).toContain("SEA-Forge refuses the waiting commit; it will not run.");
    expect(html).toContain('name="return_to" value="inbox"');
  });
  test("a decided item shows who resolved it", () => {
    const html = page([row({ approval_id: "apr-d", state: "approved", resolved_by: "actor:operator" })]);
    expect(html).toContain("Approved by actor:operator: run.start, requested by cognate-service");
  });
  test("an empty inbox says so", () => {
    const html = page([]);
    expect(html).toContain("The inbox is empty");
    expect(html).toContain("Nothing is waiting at SEA-Forge, so nothing needs your decision.");
  });
  test("excluded rows are a count with an explanation, also when nothing else is listed", () => {
    const html = page([], 3);
    expect(html).toContain('data-excluded="3"');
    expect(html).toContain("3 approval record(s) excluded");
    expect(html).toContain("so they are not hidden");
    expect(html).not.toContain("The inbox is empty");
  });
  test("after a click the banner reports the listed state and resolver, not the click", () => {
    const decided = page([row({ approval_id: "apr-a", state: "approved", resolved_by: "actor:operator" })], 0, [], { kind: "resolved", approvalId: "apr-a", decision: "approve" });
    expect(decided).toContain('data-notice="resolved"');
    expect(decided).toContain("resolved by");
    expect(decided).toContain("actor:operator");
    const rejected = page([row({ approval_id: "apr-a", state: "rejected", resolved_by: "actor:operator" })], 0, [], { kind: "resolved", approvalId: "apr-a", decision: "reject" });
    expect(rejected).toContain("will not run");
    // A link claiming success for an approval that is still pending is not believed.
    const forged = page([row({ approval_id: "apr-a" })], 0, ["apr-a"], { kind: "resolved", approvalId: "apr-a", decision: "approve" });
    expect(forged).toContain('data-notice="unconfirmed"');
    expect(forged).not.toContain('data-notice="resolved"');
    const missing = page([], 0, [], { kind: "resolved", approvalId: "apr-x", decision: "approve" });
    expect(missing).toContain('data-notice="unconfirmed"');
  });
  test("a refusal is shown as an alert and says nothing was changed", () => {
    const html = page([row()], 0, [], { kind: "error", approvalId: "apr-a", code: "refused" });
    expect(html).toContain('role="alert"');
    expect(html).toContain("That decision was not recorded.");
    expect(html).toContain("refused the decision");
    expect(html).toContain("Nothing was approved or rejected by this click.");
  });
  test("a refusal for an approval the listing shows resolved says so and never claims nothing changed", () => {
    const html = page([row({ approval_id: "apr-a", state: "approved", resolved_by: "actor:other" })], 0, [], { kind: "error", approvalId: "apr-a", code: "refused" });
    expect(html).toContain("SEA-Forge lists approval");
    expect(html).toContain("actor:other");
    expect(html).not.toContain("Nothing was approved");
  });
  test("follow-up failed: a listing that shows the approval resolved is stated, and nothing says nothing changed", () => {
    const html = page([row({ approval_id: "apr-a", state: "approved", resolved_by: "actor:operator" })], 0, [], { kind: "error", approvalId: "apr-a", code: "followup_failed" });
    expect(html).toContain('data-notice="followup_failed"');
    expect(html).toContain("A follow-up step failed");
    expect(html).toContain("SEA-Forge lists approval");
    expect(html).toContain("actor:operator");
    expect(html).not.toContain("Nothing was approved");
    expect(html).not.toContain("not recorded");
  });
  test("follow-up failed: a forged link for an approval still pending, or absent, is Not confirmed and does not say the decision was recorded", () => {
    for (const rows of [[row({ approval_id: "apr-a" })], []]) {
      const html = page(rows, 0, [], { kind: "error", approvalId: "apr-a", code: "followup_failed" });
      expect(html).toContain('data-notice="followup_unconfirmed"');
      expect(html).toContain("Not confirmed");
      expect(html).not.toContain("was recorded");
      expect(html).not.toContain("Nothing was approved");
    }
  });
  test("resolve succeeds, then the follow-up throws: the failure is a follow-up failure, not a failed resolve", async () => {
    let resolved = false;
    const stub = { resolveApproval: async () => { resolved = true; return { ok: true as const }; }, pollApprovals: async () => { throw new Error("poll: socket closed"); } };
    const run = async () => {
      const result = await stub.resolveApproval();
      if (!result.ok) throw new Error("APPROVAL: SEA-Forge refused the resolution");
      return afterRecordedDecision(async () => { await stub.pollApprovals(); return "settled"; });
    };
    const error = await run().catch((e: unknown) => e);
    expect(resolved).toBe(true);
    expect(error).toBeInstanceOf(ApprovalFollowUpError);
    expect((error as Error).message).toBe("poll: socket closed");
    expect(approvalErrorCode(error)).toBe("followup_failed");
    // A refused commit after a recorded decision keeps its own message and is not reclassified.
    const refused = await afterRecordedDecision(async () => { throw new Error("INTENT: governed commit refused: rejected"); }).catch((e: unknown) => e);
    expect(refused).not.toBeInstanceOf(ApprovalFollowUpError);
  });
  test("an unknown error code renders generic fixed copy", () => {
    const html = page([row()], 0, [], { kind: "error", approvalId: null, code: parseInboxErrorCode("<script>alert(1)</script>") });
    expect(html).toContain("Something went wrong with that decision.");
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("Nothing was approved");
  });
  test("a claimed decision that disagrees with the listed state is not confirmed, and the listed state is shown", () => {
    const html = page([row({ approval_id: "apr-b", state: "rejected", resolved_by: "actor:other" })], 0, [], { kind: "resolved", approvalId: "apr-b", decision: "approve" });
    expect(html).toContain('data-notice="unconfirmed"');
    expect(html).not.toContain('data-notice="resolved"');
    expect(html).toContain("shows it as");
    expect(html).toContain("rejected");
    expect(html).toContain("The listed state is the truth.");
  });
  test("hostile text in every notice field and every row field is escaped", () => {
    const evil = '"><script>alert(1)</script>';
    const html = page(
      [row({ approval_id: "apr-x", operation_name: evil, requester: evil, resource_id: evil, resolved_by: evil, state: "approved" })],
      0,
      [],
      { kind: "resolved", approvalId: "apr-x", decision: "approve" },
    );
    expect(html).not.toContain("<script>alert");
    const alert = page([], 0, [], { kind: "error", approvalId: evil, code: "refused" });
    expect(html + alert).not.toContain("<script>alert");
  });
  test("approvalErrorCode maps failures to the fixed set", () => {
    expect(approvalErrorCode(new ApprovalFollowUpError("boom"))).toBe("followup_failed");
    expect(approvalErrorCode(new Error("APPROVAL: abc was already decided (run failed)"))).toBe("not_pending");
    expect(approvalErrorCode(new Error("APPROVAL: no governed commit waits on abc"))).toBe("not_pending");
    expect(approvalErrorCode(new Error("APPROVAL: SEA-Forge refused the resolution: x"))).toBe("refused");
    expect(approvalErrorCode(new Error("APPROVAL: the requester cannot approve its own escalation"))).toBe("refused");
    expect(approvalErrorCode(new Error("socket closed"))).toBe("unavailable");
    expect(approvalErrorCode("x")).toBe("unavailable");
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

describe("POST /workspace/approval from the inbox returns to the inbox", () => {
  test("a refusal comes back as a banner on the inbox, not as raw JSON", async () => {
    const root = mkdtempSync(join(tmpdir(), "inbox-post-"));
    try {
      const configPath = await writeConfig(join(root, "horizon.toml"), horizonDocument({ storePath: join(root, "inbox.sqlite"), secretPath: join(root, "launch.secret") }));
      const application = await createApplication({ configPath });
      const started = application.startServer(0);
      try {
        const base = new URL(started.url);
        const body = new URLSearchParams({ approval_id: "apr-none", decision: "reject", return_to: "inbox" });
        const post = await fetch(new URL("/workspace/approval", base), { method: "POST", body, redirect: "manual" });
        expect(post.status).toBe(303);
        const location = post.headers.get("location") ?? "";
        expect(location).toContain("/workspace/approvals?");
        expect(new URL(location, base).searchParams.get("error")).toBe("not_pending");
        const html = await (await fetch(new URL(location, base))).text();
        expect(html).toContain('data-notice="error"');
        expect(html).toContain("That decision was not recorded.");
        // Invalid arguments from the inbox come back as a fixed code, not as JSON and not as text.
        const bad = await fetch(new URL("/workspace/approval", base), { method: "POST", body: new URLSearchParams({ approval_id: "apr-x", decision: "maybe", return_to: "inbox" }), redirect: "manual" });
        expect(bad.status).toBe(303);
        expect(new URL(bad.headers.get("location") ?? "", base).searchParams.get("error")).toBe("invalid");
        const badPlain = await fetch(new URL("/workspace/approval", base), { method: "POST", body: new URLSearchParams({ approval_id: "apr-x", decision: "maybe" }), redirect: "manual" });
        expect(badPlain.status).toBe(400);
        // Hostile query parameters never reach the page as markup or as text.
        const evil = encodeURIComponent('"><script>alert(1)</script>');
        const hostile = await (await fetch(new URL(`/workspace/approvals?resolved=${evil}&decision=${evil}&error=${evil}&approval=${evil}`, base))).text();
        expect(hostile).not.toContain("<script>alert");
        expect(hostile).not.toContain("alert(1)");
        // Without return_to the older JSON answer is unchanged.
        const plain = await fetch(new URL("/workspace/approval", base), { method: "POST", body: new URLSearchParams({ approval_id: "apr-none", decision: "reject" }), redirect: "manual" });
        expect(plain.status).toBe(404);
      } finally {
        started.stop(true);
        await application.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
