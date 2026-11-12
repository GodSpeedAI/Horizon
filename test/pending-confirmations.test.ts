/**
 * Stage 0B containment: a reserved operation waits for an exact local confirmation. Each test names
 * the expectation it proves (see .agents/prereg/horizon/STAGE-0B-CONTAINMENT.prereg.yaml).
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DurableStore } from "@godspeedai/cognate-events";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import {
  CONFIRM_TTL_MS,
  PENDING_COLLECTION,
  confirm,
  describe as describeDescriptor,
  gate,
  operationDigest,
  setConfirmationCodeSink,
  stateOf,
  summon,
  type CodeOutput,
} from "../src/capabilities/pending-confirmations.ts";
import { runConfirm, type ConfirmIO } from "../src/capabilities/confirm-command.ts";

// The test preload installs a sink that confirms for the suite. These tests prove the waiting state
// itself, so they take the sink away for their run and put the preload's sink back afterwards.
beforeAll(() => setConfirmationCodeSink(null));
afterAll(() => setConfirmationCodeSink(() => undefined));

const roots: string[] = [];
const stores: DurableStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function storeAt(): DurableStore {
  const root = mkdtempSync(join(tmpdir(), "stage0b-"));
  roots.push(root);
  const store = openSqliteStore({ path: join(root, "store.sqlite") });
  stores.push(store);
  return store;
}

/** A fake controlling terminal: it keeps every line, so the test reads the code the way a person would. */
function terminal(available = true): CodeOutput & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    terminal: (line) => {
      if (!available) return false;
      lines.push(line);
      return true;
    },
  };
}

const codeIn = (lines: readonly string[]): string => {
  const match = lines.map((line) => /Code: (\d{6})\./.exec(line)).find((found) => found !== null);
  if (match === undefined || match === null) throw new Error("no code was shown on the terminal");
  return match[1]!;
};

const NOW = new Date("2026-11-11T12:00:00Z");
const base = { tenant: "t1", operator: "op_alice", operationId: "workspace.label", params: { session: "s1", verdict: "pass" } };

describe("a reserved operation waits for a local confirmation", () => {
  test("PE-53: a reserved operation without a confirmation writes nothing and answers that it is waiting", async () => {
    const store = storeAt();
    const out = terminal();
    const answer = await gate(store, { ...base, now: NOW }, out);
    expect(answer.ok).toBe(false);
    if (answer.ok) return;
    expect(answer.code).toBe("awaiting_local_confirmation");
    expect(await stateOf(store, answer.pending_id!)).toBe("pending");
    expect(out.lines.length).toBe(1);
  });

  test("PE-54: the code is shown on the terminal and never stored, only a keyed digest of it", async () => {
    const store = storeAt();
    const out = terminal();
    const answer = await gate(store, { ...base, now: NOW }, out);
    const code = codeIn(out.lines);
    const stored = JSON.stringify(await describeDescriptor(store, answer.pending_id!));
    expect(stored).not.toContain(code);
    expect(stored).toContain("confirmation_digest");
  });

  test("PE-55: the typed code confirms exactly the named operation, and one repeat consumes it once", async () => {
    const store = storeAt();
    const out = terminal();
    const waiting = await gate(store, { ...base, now: NOW }, out);
    if (waiting.ok) throw new Error("expected a waiting operation");
    const confirmed = await confirm(store, { tenant: "t1", pendingId: waiting.pending_id!, typedCode: codeIn(out.lines), now: NOW });
    expect(confirmed.ok).toBe(true);
    const applied = await gate(store, { ...base, now: NOW }, out);
    expect(applied.ok).toBe(true);
    expect(await stateOf(store, waiting.pending_id!)).toBe("applied");
    const again = await gate(store, { ...base, now: NOW }, out);
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.pending_id!).not.toBe(waiting.pending_id!);
  });

  test("PE-56: the confirm command renders the exact operation and confirms through the terminal it is given", async () => {
    const store = storeAt();
    const out = terminal();
    const waiting = await gate(store, { ...base, now: NOW }, out);
    if (waiting.ok) throw new Error("expected a waiting operation");
    const shown: string[] = [];
    const io: ConfirmIO = {
      write: (line) => shown.push(line),
      readLine: () => codeIn(out.lines),
    };
    const outcome = await runConfirm(store, waiting.pending_id!, io, NOW);
    expect(outcome.ok).toBe(true);
    expect(shown.join("\n")).toContain("workspace.label");
    expect(shown.join("\n")).toContain("op_alice");
  });

  test("PE-57: a second request while one descriptor still waits reuses it rather than piling up descriptors", async () => {
    const store = storeAt();
    const out = terminal();
    const first = await gate(store, { ...base, now: NOW }, out);
    const second = await gate(store, { ...base, now: NOW }, out);
    if (first.ok || second.ok) throw new Error("both requests should wait");
    expect(second.pending_id!).toBe(first.pending_id!);
    expect((await store.listRecords(PENDING_COLLECTION, { tenant: "t1" })).length).toBe(1);
    expect(operationDigest("workspace.label", base.params)).toBe(operationDigest("workspace.label", { verdict: "pass", session: "s1" }));
  });

  test("NE-41: a wrong code confirms nothing and leaves the descriptor waiting", async () => {
    const store = storeAt();
    const out = terminal();
    const waiting = await gate(store, { ...base, now: NOW }, out);
    if (waiting.ok) throw new Error("expected a waiting operation");
    const wrong = codeIn(out.lines) === "000000" ? "111111" : "000000";
    const result = await confirm(store, { tenant: "t1", pendingId: waiting.pending_id!, typedCode: wrong, now: NOW });
    expect(result).toMatchObject({ ok: false, code: "wrong_code" });
    expect(await stateOf(store, waiting.pending_id!)).toBe("pending");
  });

  test("NE-42: an expired descriptor cannot be confirmed and is never applied", async () => {
    const store = storeAt();
    const out = terminal();
    const waiting = await gate(store, { ...base, now: NOW }, out);
    if (waiting.ok) throw new Error("expected a waiting operation");
    const late = new Date(NOW.getTime() + CONFIRM_TTL_MS + 1000);
    const result = await confirm(store, { tenant: "t1", pendingId: waiting.pending_id!, typedCode: codeIn(out.lines), now: late });
    expect(result).toMatchObject({ ok: false, code: "expired" });
    expect(await stateOf(store, waiting.pending_id!)).toBe("expired");
    const retry = await gate(store, { ...base, now: late }, out);
    expect(retry.ok).toBe(false);
  });

  test("NE-43: a confirmed descriptor is consumed exactly once when two requests race for it", async () => {
    const store = storeAt();
    const out = terminal();
    const waiting = await gate(store, { ...base, now: NOW }, out);
    if (waiting.ok) throw new Error("expected a waiting operation");
    await confirm(store, { tenant: "t1", pendingId: waiting.pending_id!, typedCode: codeIn(out.lines), now: NOW });
    const [a, b] = await Promise.all([gate(store, { ...base, now: NOW }, out), gate(store, { ...base, now: NOW }, out)]);
    expect([a.ok, b.ok].filter(Boolean).length).toBe(1);
    expect(await stateOf(store, waiting.pending_id!)).toBe("applied");
  });

  test("NE-44: without a terminal nothing is written: no descriptor, no code, and the operation is not started", async () => {
    const store = storeAt();
    const answer = await gate(store, { ...base, now: NOW }, terminal(false));
    expect(answer).toMatchObject({ ok: false, code: "no_terminal" });
    expect((await store.listRecords(PENDING_COLLECTION, { tenant: "t1" })).length).toBe(0);
    const direct = await summon(store, { ...base, now: NOW }, terminal(false));
    expect(direct.ok).toBe(false);
  });

  test("NE-45: a confirmation for one operation, parameters or operator is never consumed by another", async () => {
    const store = storeAt();
    const out = terminal();
    const waiting = await gate(store, { ...base, now: NOW }, out);
    if (waiting.ok) throw new Error("expected a waiting operation");
    await confirm(store, { tenant: "t1", pendingId: waiting.pending_id!, typedCode: codeIn(out.lines), now: NOW });
    const otherParams = await gate(store, { ...base, params: { session: "s2", verdict: "pass" }, now: NOW }, out);
    expect(otherParams.ok).toBe(false);
    const otherOperator = await gate(store, { ...base, operator: "op_bob", now: NOW }, out);
    expect(otherOperator.ok).toBe(false);
    expect(await stateOf(store, waiting.pending_id!)).toBe("confirmed");
  });
});
