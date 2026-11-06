/**
 * Idempotency row (c): the bytes Horizon sends through the SDK equal the pre-migration format
 * (94748dc: src/adapters/delegating-authority.ts and sea-forge-approvals.ts). Captured as the raw line
 * on a scripted Unix-socket server.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAuthorityRequest, SeaForgeAuthority, type GovernedOperation } from "@godspeedai/cognate-runtime-bun";
import { delegatingAuthority } from "../src/adapters/delegating-authority.ts";
import { OperatorActors } from "../src/remote/operators.ts";

const SERVICE = { actor_id: "cognate-service", role: "service" } as const;
const MAPPED = "actor-mapped";
const dir = mkdtempSync(join(tmpdir(), "wire-sock-"));
const socketPath = join(dir, "sea-forge.sock");
const lines: string[] = [];
const server = Bun.listen({
  unix: socketPath,
  socket: {
    data(socket, chunk) {
      lines.push(new TextDecoder().decode(chunk));
      socket.write(`${JSON.stringify({ ok: true, approvals: [] })}\n`);
      socket.end();
    },
  },
});
afterAll(() => {
  server.stop(true);
  rmSync(dir, { recursive: true, force: true });
});
const client = new SeaForgeAuthority({ socketPath, actor: SERVICE, requestIdPrefix: "horizon", timeoutMs: 2_000 });

describe("wire bytes match the pre-migration format", () => {
  test("delegated decide: verb, envelope, request_id, actor, on_behalf_of, in the old key order", async () => {
    const authority = delegatingAuthority(
      { decide: async () => ({ disposition: "allow" as const, reason: "inner" }) },
      { service: SERVICE, actors: () => new OperatorActors(new Map([["operator", MAPPED]]), "operator"), serverPrincipalId: "os:server:1", client },
    );
    const operation: GovernedOperation = { kind: "action", action: "thread.state.read" as never, caller: { tenant: "t", actor: { id: "operator", kind: "user" } }, resource: "r" };
    lines.length = 0;
    await authority.decide(operation, "world:x");
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line.endsWith("\n")).toBe(true);
    const sent = JSON.parse(line) as { envelope: Record<string, unknown>; request_id: string };
    // The old code: JSON.stringify({verb, envelope, request_id: operationId, actor: service, on_behalf_of}) + "\n".
    const old = `${JSON.stringify({ verb: "authority_request", envelope: sent.envelope, request_id: sent.request_id, actor: SERVICE, on_behalf_of: { actor_id: MAPPED, role: "operator" } })}\n`;
    expect(line).toBe(old);
    expect(sent.envelope.envelope_id).toBe(`env-authority_request-${sent.request_id}`);
    expect(sent.request_id).toMatch(/^op-/);
    // The envelope is the builder's, unchanged: same keys as a fresh one.
    expect(Object.keys(sent.envelope)).toEqual(Object.keys(buildAuthorityRequest(operation, "world:x").envelope));
  });

  test("resolve: authority_approval with horizon:<id>:<resolution> and on_behalf_of", async () => {
    lines.length = 0;
    await client.resolveApproval({ approvalId: "apr-1", resolution: "approved", onBehalfOf: { actor_id: MAPPED, role: "operator" } });
    expect(lines).toEqual([`${JSON.stringify({ verb: "authority_approval", approval_id: "apr-1", resolution: "approved", request_id: "horizon:apr-1:approved", actor: SERVICE, on_behalf_of: { actor_id: MAPPED, role: "operator" } })}\n`]);
  });

  test("list: authority_approvals with the service actor", async () => {
    lines.length = 0;
    await client.listApprovals({ timeoutMs: 2_000 });
    expect(lines).toEqual([`${JSON.stringify({ verb: "authority_approvals", actor: SERVICE })}\n`]);
  });
});
