/**
 * Finding R2-11, browser side. The server refuses a panel change with no request id. Every state-changing request the desk page
 * sends must carry one, from the same helper, so a retry of a command is told apart from a new one.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { requestIdFor, settleRequest } from "../src/ui/desk/client/request-ids.ts";

const CLIENT = join(import.meta.dir, "..", "src", "ui", "desk", "client", "main.tsx");
const source = readFileSync(CLIENT, "utf8");

/** The text of each `fetch(` call in the client: from the call to the next call (or 400 characters). */
function fetchCalls(text: string): string[] {
  const starts = [...text.matchAll(/fetch\(/g)].map((m) => m.index ?? 0);
  return starts.map((start, i) => text.slice(start, Math.min(starts[i + 1] ?? text.length, start + 400)));
}

/**
 * Routes that take a POST and change state, but which the server does not read a request id from: each has its own id (the
 * decision's id, the handoff's draft id, a case's own attempt id) or none is needed. A new POST must be added here, on purpose.
 */
const SERVER_OWNED_ID_ROUTES = ["/desk/decide", "/desk/handoff", "/desk/handoff/preview", "/desk/start", "/desk/note", "/desk/draft", "/desk/conversation/discard", "/desk/search", "/desk/pair", "/workspace/label", "/workspace/presenting", "/workspace/remote/"];

describe("every state-changing request from the desk page carries a request id", () => {
  const calls = fetchCalls(source);
  const posts = calls.filter((c) => /method:\s*"POST"/.test(c));

  test("the page makes POST calls it can check", () => {
    expect(posts.length).toBeGreaterThan(0);
  });

  test("every panel operation sends its id from requestIdFor", () => {
    const panelOps = posts.filter((c) => c.includes("/desk/panels/op"));
    expect(panelOps.length).toBe(4);
    for (const call of panelOps) expect(call).toMatch(/request_id: requestIdFor\(/);
    expect(source).not.toMatch(/crypto\.randomUUID\(\)[\s\S]{0,80}request_id/);
  });

  test("every other POST is a route that owns its own id, so a new POST cannot skip the rule unnoticed", () => {
    for (const call of posts.filter((c) => !c.includes("/desk/panels/op"))) {
      const route = SERVER_OWNED_ID_ROUTES.find((r) => call.includes(`"${r}"`) || call.includes(`\`${r}`) || call.includes(`\`${r}\``));
      expect({ call: call.slice(0, 80), owned: route !== undefined }).toEqual({ call: call.slice(0, 80), owned: true });
    }
  });
});

describe("the request id of a command is kept until the desk replies", () => {
  test("a retry of the same command reuses its id", () => {
    const first = requestIdFor("answer:retry-test");
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestIdFor("answer:retry-test")).toBe(first);
  });

  test("a definite reply ends the command, so the next one gets a new id", () => {
    const first = requestIdFor("stop:step-1");
    settleRequest("stop:step-1");
    const next = requestIdFor("stop:step-1");
    expect(next).not.toBe(first);
  });

  test("different commands have different ids", () => {
    expect(requestIdFor("pin:a:true")).not.toBe(requestIdFor("pin:a:false"));
  });
});
