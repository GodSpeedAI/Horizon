/**
 * Annex J.1, Workshop (Connect RPC). Each case drives a stand-in workshop (or a bad key file) and checks the rule:
 * Horizon says the honest state in words, never shows stale data as current, never loses or doubles a write, never leaks the key.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assign, workshopAccess, type Access } from "../src/adapters/workshop.ts";
import { sampleLedger } from "./support/economics-fixture.ts";
import { compareSession, workshopLink } from "../src/ui/workspace/compare-model.ts";

const TOKEN = "wbs1.ADVERSARIAL-SECRET-TOKEN-0123456789";
const caller = { actor: { id: "operator", kind: "user" }, tenant: "t" } as never;
const request = { caseId: "case_1", stepId: "step_1", expertId: "builder", workspaceId: "ws", message: "Do it.", timeoutMs: 800 };
const NOW = new Date("2026-11-07T00:00:00Z");

const servers: { stop(close?: boolean): void }[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.stop(true);
});
function workshop(fetch: (req: Request) => Response | Promise<Response>) {
  const seen: Request[] = [];
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req) => (seen.push(req), fetch(req)) });
  servers.push(server);
  return { url: `http://127.0.0.1:${server.port}`, seen };
}
function keyFile(contents: string | null, mode: number, expiresAt = "2099-01-01T00:00:00Z") {
  const dir = mkdtempSync(join(tmpdir(), "adv-workshop-"));
  const key_path = join(dir, "workbench.key");
  if (contents !== null) {
    writeFileSync(key_path, contents, { mode });
    chmodSync(key_path, mode);
    writeFileSync(`${key_path}.json`, JSON.stringify({ sessionId: "s", expiresAt }));
  }
  return key_path;
}
const readyFor = (url: string, key_path: string): Access => workshopAccess({ url, key_path }, caller, NOW);
const noSecret = (value: unknown): void => expect(JSON.stringify(value)).not.toContain(TOKEN);

describe("adversarial: the workshop", () => {
  test("down: says the workshop is not answering and nothing is handed over", async () => {
    const down = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("") });
    const url = `http://127.0.0.1:${down.port}`;
    down.stop(true);
    const result = await assign(readyFor(url, keyFile(`${TOKEN}\n`, 0o600)), request);
    expect(result.kind).toBe("unreachable");
    if (result.kind === "unreachable") {
      expect(result.words).toMatch(/workshop (is not answering|did not answer)/);
      noSecret(result);
    }
  });

  test("401 from an expired key: says the key has run out", async () => {
    const w = workshop(() => Response.json({ code: "unauthenticated", message: "key expired" }, { status: 401 }));
    const result = await assign(readyFor(w.url, keyFile(`${TOKEN}\n`, 0o600)), request);
    expect(result.kind).toBe("unreachable");
    if (result.kind === "unreachable") {
      expect(result.why).toBe("key_rejected");
      expect(result.maybe_done).toBe(false);
      expect(result.words).toContain("has run out");
      noSecret(result);
    }
  });

  test("an expiry date in the past is caught before anything is sent", async () => {
    const w = workshop(() => new Response("never asked"));
    const access = readyFor(w.url, keyFile(`${TOKEN}\n`, 0o600, "2026-11-01T00:00:00Z"));
    expect(access.kind).toBe("not_connected");
    const result = await assign(access, request);
    expect(result.kind).toBe("refused");
    expect(w.seen.length).toBe(0);
  });

  test("401 from a revoked key: says the key was turned off, not that it ran out", async () => {
    const w = workshop(() => Response.json({ code: "unauthenticated", message: "unknown key" }, { status: 401 }));
    const result = await assign(readyFor(w.url, keyFile(`${TOKEN}\n`, 0o600)), request);
    expect(result.kind).toBe("unreachable");
    if (result.kind === "unreachable") {
      expect(result.why).toBe("key_rejected");
      expect(result.words).toContain("turned off or replaced");
      expect(result.words).not.toContain("has run out");
      noSecret(result);
    }
  });

  test("key file missing: not connected, nothing offered", async () => {
    const access = readyFor("http://127.0.0.1:1", join(tmpdir(), "no-such-dir-adv", "workbench.key"));
    expect(access).toMatchObject({ kind: "not_connected", why: "missing" });
    expect((await assign(access, request)).kind).toBe("refused");
  });

  test("key file readable by others is refused unless the mode is 0600", async () => {
    const w = workshop(() => Response.json({ assignmentId: "x" }));
    const open = readyFor(w.url, keyFile(`${TOKEN}\n`, 0o644));
    expect(open).toMatchObject({ kind: "not_connected", why: "unsafe" });
    if (open.kind === "not_connected") expect(open.words).toContain("can be read by other people");
    expect((await assign(open, request)).kind).toBe("refused");
    expect(w.seen.length).toBe(0);
    const group = readyFor(w.url, keyFile(`${TOKEN}\n`, 0o640));
    expect(group).toMatchObject({ kind: "not_connected", why: "unsafe" });
    expect(readyFor(w.url, keyFile(`${TOKEN}\n`, 0o600)).kind).toBe("ready");
  });

  test("key file empty: not connected", async () => {
    const empty = readyFor("http://127.0.0.1:1", keyFile("  \n", 0o600));
    expect(empty).toMatchObject({ kind: "not_connected", why: "empty" });
  });

  test("slow reply: gives up in time, says the work may or may not have been handed over", async () => {
    const w = workshop(async () => {
      await Bun.sleep(3000);
      return Response.json({ assignmentId: "late" });
    });
    const started = Date.now();
    const result = await assign(readyFor(w.url, keyFile(`${TOKEN}\n`, 0o600)), request);
    expect(Date.now() - started).toBeLessThan(2500);
    expect(result.kind).toBe("unreachable");
    if (result.kind === "unreachable") {
      expect(result.why).toBe("slow");
      expect(result.maybe_done).toBe(true);
      expect(result.words).toContain("same step is never given out twice");
    }
  });

  test("the workshop answers but refuses: the words name the reason, never 'not answering'", async () => {
    const refusing = (code: string, message: string): Access => ({ kind: "ready", client: { invoke: async () => { throw Object.assign(new Error(`invocation of expert.converse failed: {"kind":"failed","message":"${message}"}`), { code }); } } });
    const noModel = await assign(refusing("failed_precondition", "Configure a model in Settings or select a model route for this Expert"), request);
    const noAgent = await assign(refusing("failed_precondition", "Active Expert not found"), request);
    const other = await assign(refusing("failed_precondition", `something with ${TOKEN}`), request);
    expect(noModel.kind).toBe("refused");
    expect(noAgent.kind).toBe("refused");
    expect(other.kind).toBe("refused");
    if (noModel.kind === "refused") expect(noModel.words).toContain("no AI model set up");
    if (noAgent.kind === "refused") expect(noAgent.words).toContain("not in the workshop");
    if (other.kind === "refused") expect(other.words).toBe("The workshop answered but would not start this work. Nothing was handed over.");
    for (const r of [noModel, noAgent, other]) {
      noSecret(r);
      expect(JSON.stringify(r)).not.toContain("not answering");
    }
  });
  test("a duplicate assignment id: said in words, never a second assignment", async () => {
    const access: Access = { kind: "ready", client: { invoke: async () => { throw new Error("Assignment identity already exists"); } } };
    const result = await assign(access, request);
    expect(result.kind).toBe("already_assigned");
  });

  test("an unknown session id in a deep link: no comparison is made up and the link stays one encoded piece", () => {
    // The session is not in the record, so there is nothing to show (never a blank comparison dressed as a real one).
    expect(compareSession({ rows: sampleLedger(), sessionId: "no-such-session", workshopUrl: "http://127.0.0.1:4777", intact: null })).toBeNull();
    expect(workshopLink("http://127.0.0.1:4777", "", "e1")).toBeNull();
    expect(workshopLink(undefined, "s-1", "e1")).toBeNull();
    const link = workshopLink("http://127.0.0.1:4777", "../../x?y=1#z", "e 1")!;
    expect(link).not.toContain("../");
    expect(link.includes("?")).toBe(false);
    expect(link.split("#").length).toBe(2);
  });
});
