/**
 * Annex J.1, case keeper (SFWP socket): every way the case keeper can fail, against a fake Unix socket server.
 * The rule each test proves: Horizon says the honest state in words, never shows stale data as current,
 * and never loses or doubles a write.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addItem, approvalList, commit, decide, listCases, preflight, STALE_WORDS, type CaseKeeper } from "../src/adapters/sea-forge-case.ts";
import { followEvents, type EventFrame } from "../src/adapters/sea-forge-events.ts";
import { fakeCaseKeeper, type FakeKeeper, type FakeReply } from "./support/fake-case-keeper.ts";

const service = { actor_id: "cognate-service", role: "service" };
const operator = { actor_id: "operator_local", role: "operator" };
const keeperAt = (socketPath: string, timeoutMs = 400): CaseKeeper => ({ socketPath, service, operator, timeoutMs });
const pre = { records: [{ ref: "plan:tpl@1", expected_digest: "sha256:aaa" }] };
const commitRequest = { template_ref: "tpl@1", request_id: "horizon:commit:1", preconditions: pre };

let live: FakeKeeper | undefined;
afterEach(() => {
  live?.stop();
  live = undefined;
});
const start = (script: (request: Record<string, unknown>) => FakeReply): CaseKeeper => {
  live = fakeCaseKeeper(script);
  return keeperAt(live.socketPath);
};
const waitFor = async (check: () => boolean, ms = 3_000): Promise<void> => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 15));
  }
};

describe("case keeper adversarial: the socket", () => {
  test("socket missing: says the case keeper is not running and shows nothing from before", async () => {
    const result = await listCases(keeperAt(join(tmpdir(), "no-such-keeper.sock")));
    expect(result).toMatchObject({ kind: "unreachable", why: "socket_missing", maybe_written: false });
    if (result.kind === "unreachable") {
      expect(result.words).toContain("not running");
      expect(result.words).toContain("Nothing is shown from before");
    }
  });

  test("socket missing on a write: nothing was changed, and it says so", async () => {
    const result = await commit(keeperAt(join(tmpdir(), "no-such-keeper.sock")), commitRequest);
    expect(result).toMatchObject({ kind: "unreachable", why: "socket_missing", maybe_written: false });
    if (result.kind === "unreachable") expect(result.words).toContain("Nothing was changed");
  });

  test("connection refused: a socket path nothing listens on is reported as refused, not as an empty list", async () => {
    const dir = mkdtempSync(join(tmpdir(), "refused-"));
    const path = join(dir, "dead.sock");
    writeFileSync(path, "");
    try {
      const result = await listCases(keeperAt(path));
      expect(result.kind).toBe("unreachable");
      if (result.kind === "unreachable") {
        expect(["connection_refused", "other"]).toContain(result.why);
        expect(result.words).toContain("case keeper");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("reply never arrives: times out in words; a read is blank, a write may or may not have landed", async () => {
    const keeper = start(() => ({ hang: true }));
    const read = await listCases(keeper);
    expect(read).toMatchObject({ kind: "unreachable", why: "timeout", maybe_written: false });
    const write = await commit(keeper, commitRequest);
    expect(write).toMatchObject({ kind: "unreachable", why: "timeout", maybe_written: true });
    if (write.kind === "unreachable") expect(write.words).toContain("never applied twice");
  });

  test("garbage frame: an answer that is not JSON is reported, not parsed into something", async () => {
    const keeper = start(() => ({ raw: "<<< not json >>>\n" }));
    const result = await listCases(keeper);
    expect(result).toMatchObject({ kind: "unreachable", why: "garbled" });
    // Valid JSON of the wrong shape is also not an answer: it is never shown as an empty list.
    live!.script = () => ({ json: { cases: "none" } });
    expect(await listCases(keeper)).toMatchObject({ kind: "unreachable", why: "garbled" });
    live!.script = () => ({ json: [1, 2, 3] });
    expect(await listCases(keeper)).toMatchObject({ kind: "unreachable", why: "garbled" });
  });

  test("socket closing mid-reply: a half line is not an answer", async () => {
    const keeper = start(() => ({ partial: '{"ok":true,"cases":[{"case_id":"c1"' }));
    const read = await listCases(keeper);
    expect(read).toMatchObject({ kind: "unreachable", why: "closed" });
    const write = await decide(keeper, { case_id: "c1", approval_id: "a1", decision: "approve", request_id: "r1", preconditions: pre });
    expect(write).toMatchObject({ kind: "unreachable", why: "closed", maybe_written: true });
    if (write.kind === "unreachable") expect(write.words).toContain("hung up");
  });

  test("closing with no bytes at all is also a plain failure", async () => {
    const keeper = start(() => ({ close: true }));
    expect(await listCases(keeper)).toMatchObject({ kind: "unreachable", why: "closed" });
  });
});

describe("case keeper adversarial: refusals", () => {
  test("an error reply is a refusal with words, never an empty success", async () => {
    const keeper = start(() => ({ json: { ok: false, error_class: "invalid_decision", error: "unknown approval decision" } }));
    const result = await decide(keeper, { case_id: "c1", approval_id: "a1", decision: "approve", request_id: "r1", preconditions: pre });
    expect(result).toMatchObject({ kind: "refused", error_class: "invalid_decision" });
    if (result.kind === "refused") expect(result.words).toContain("Nothing was changed");
    live!.script = () => ({ json: { error: "boom" } });
    expect(await listCases(keeper)).toMatchObject({ kind: "refused" });
  });

  test("request_id_reused: the same id with a different request is refused and explained", async () => {
    const seen = new Map<string, string>();
    const keeper = start((request) => {
      const id = String(request.request_id);
      const body = JSON.stringify({ ...request, actor: undefined, on_behalf_of: undefined });
      if (seen.has(id) && seen.get(id) !== body) return { json: { ok: false, error_class: "request_id_reused", error: "request_id already used" } };
      seen.set(id, body);
      return { json: { ok: true, case_id: "case_1" } };
    });
    expect((await commit(keeper, commitRequest)).kind).toBe("ok");
    const other = await commit(keeper, { ...commitRequest, params: { x: "different" } });
    expect(other).toMatchObject({ kind: "refused", error_class: "request_id_reused" });
    if (other.kind === "refused") expect(other.words).toContain("already used");
  });

  test("a stale plan digest: the case keeper refuses with rejected_as_stale and nothing is written", async () => {
    let writes = 0;
    const keeper = start((request) => {
      const records = ((request.preconditions as { records?: { ref: string; expected_digest: string }[] } | undefined)?.records ?? []) as { ref: string; expected_digest: string }[];
      const stale = records.filter((r) => r.expected_digest !== "sha256:current");
      if (stale.length > 0) return { json: { outcome: "rejected_as_stale", code: "precondition_failed", changed_records: stale.map((r) => ({ ref: r.ref, expected_digest: r.expected_digest, current_digest: "sha256:current" })), next_actions: ["refetch"] } };
      writes += 1;
      return { json: { ok: true, case_id: "case_1" } };
    });
    const result = await commit(keeper, commitRequest);
    expect(result.kind).toBe("stale");
    if (result.kind === "stale") {
      expect(result.words).toBe(STALE_WORDS);
      expect(result.changed).toEqual([{ ref: "plan:tpl@1", expected_digest: "sha256:aaa", current_digest: "sha256:current" }]);
    }
    expect(writes).toBe(0);
    const added = await addItem(keeper, { case_id: "c1", item: { plan_item_id: "s1", name: "x" }, request_id: "r9", dry_run: false, preconditions: pre });
    expect(added.kind).toBe("stale");
    expect(writes).toBe(0);
    // The same call with the digest read fresh goes through once.
    const fresh = await commit(keeper, { ...commitRequest, preconditions: { records: [{ ref: "plan:tpl@1", expected_digest: "sha256:current" }] } });
    expect(fresh.kind).toBe("ok");
    expect(writes).toBe(1);
  });
});

describe("case keeper adversarial: a write is never lost or doubled", () => {
  test("a reply that never arrives, then a retry with the same request id, makes exactly one write", async () => {
    const applied = new Map<string, unknown>();
    let first = true;
    const keeper = start((request) => {
      const id = String(request.request_id);
      if (!applied.has(id)) applied.set(id, { ok: true, case_id: `case_for_${id}` }); // the write lands
      if (first) {
        first = false;
        return { hang: true }; // ...but the reply is lost
      }
      return { json: applied.get(id) };
    });
    const lost = await commit(keeper, commitRequest);
    expect(lost).toMatchObject({ kind: "unreachable", why: "timeout", maybe_written: true });
    const retried = await commit(keeper, commitRequest);
    expect(retried.kind).toBe("ok");
    expect(applied.size).toBe(1);
    expect(live!.received.map((r) => r.request_id)).toEqual(["horizon:commit:1", "horizon:commit:1"]);
  });

  test("a write names the operator it acts for; a read does not", async () => {
    const keeper = start(() => ({ json: { ok: true, cases: [], case_id: "c" } }));
    await listCases(keeper);
    await commit(keeper, commitRequest);
    expect(live!.received[0]).not.toHaveProperty("on_behalf_of");
    expect(live!.received[1]).toMatchObject({ verb: "case_commit", actor: service, on_behalf_of: operator, preconditions: pre });
  });

  test("a dry run changes nothing and returns the digest to carry into the real call", async () => {
    const keeper = start((request) => (request.dry_run === true ? { json: { ok: true, dry_run: true, outcome: "would_add", case_id: "c1", plan_item_id: "s1", proposed_by: "operator_local", plan_precondition: { ref: "plan:c1", expected_digest: "sha256:p1" } } } : { json: { ok: true, case_id: "c1", plan_item_id: "s1", proposed_by: "operator_local" } }));
    const preview = await addItem(keeper, { case_id: "c1", item: { plan_item_id: "s1", name: "Fix" }, dry_run: true });
    expect(preview).toMatchObject({ kind: "ok", value: { dry_run: true, plan_precondition: { ref: "plan:c1", expected_digest: "sha256:p1" } } });
    expect(live!.received[0]).not.toHaveProperty("on_behalf_of");
    expect(live!.received[0]).not.toHaveProperty("request_id");
    const real = await addItem(keeper, { case_id: "c1", item: { plan_item_id: "s1", name: "Fix" }, external_ref: { kind: "github_issue", id: "o/r#7", url: "https://github.com/o/r/issues/7" }, request_id: "handoff:1", dry_run: false, preconditions: { records: [(preview as { value: { plan_precondition: { ref: string; expected_digest: string } } }).value.plan_precondition] } });
    expect(real.kind).toBe("ok");
    expect(live!.received[1]).toMatchObject({ verb: "case_add_item", dry_run: false, request_id: "handoff:1", item: { external_ref: { kind: "github_issue" } }, preconditions: { records: [{ ref: "plan:c1" }] } });
  });

  test("the other reads keep their shape: preflight carries the plan digest, approval_list the approval digest", async () => {
    const keeper = start((request) =>
      request.verb === "case_preflight"
        ? { json: { ok: true, template_ref: "tpl@1", items: [{ plan_item_id: "a", name: "A", item_kind: "human_task" }], precondition: { ref: "template:tpl@1", expected_digest: "sha256:t" }, plan_precondition: { ref: "plan:tpl@1", expected_digest: "sha256:p" } } }
        : { json: { approvals: [{ approval_id: "ap1", case_id: "c1", plan_item_id: "a", requested_at: "2026-11-07T00:00:00Z", expires_at: "2026-11-08T00:00:00Z", expired: false, digest: { ref: "approval:ap1", expected_digest: "sha256:d" } }, { not: "an approval" }] } },
    );
    expect(await preflight(keeper, "tpl@1", { a: "b" })).toMatchObject({ kind: "ok", value: { plan_precondition: { ref: "plan:tpl@1" }, precondition: { ref: "template:tpl@1" } } });
    expect(live!.received[0]).toMatchObject({ verb: "case_preflight", template_ref: "tpl@1", params: { a: "b" } });
    const approvals = await approvalList(keeper);
    expect(approvals).toMatchObject({ kind: "ok", value: { approvals: [{ approval_id: "ap1", digest: { ref: "approval:ap1" } }] } });
  });

  test("a case row the shape does not fit is counted as unreadable, not dropped", async () => {
    const keeper = start(() => ({ json: { cases: [{ case_id: "c1", case_state: "active", summary: "s", created_at: "t" }, { oops: true }], unreadable: ["case_bad"] } }));
    const result = await listCases(keeper);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.value.cases).toHaveLength(1);
      expect(result.value.unreadable).toHaveLength(2);
    }
  });
});

describe("case keeper adversarial: the events stream", () => {
  const frame = (n: number): EventFrame => ({ cursor: `01J${String(n).padStart(4, "0")}`, kind: "case.updated", case_id: "c1", detail: { n } });

  test("the events stream dropping, then resuming from the cursor with no gap and no duplicate", async () => {
    const ledger: EventFrame[] = [frame(1), frame(2), frame(3)];
    const keeper = (live = fakeCaseKeeper((request) => {
      const after = typeof request.from_cursor === "string" ? request.from_cursor : "";
      if (request.verb === "events_get_range") return { json: { events: ledger.filter((e) => e.cursor > after).slice(0, Number(request.limit ?? 500)) } };
      if (request.verb === "events_subscribe") return { stream: [{ ok: true, subscribed: true }, ...ledger.filter((e) => e.cursor > after).map((event) => ({ type: "event", event }))] };
      return { json: { ok: false, error_class: "unscripted" } };
    }));
    const seen: string[] = [];
    const states: string[] = [];
    const follower = followEvents({ socketPath: keeper.socketPath, from_cursor: null, retryMs: 30, sweepMs: 60_000, timeoutMs: 400, onEvent: (e) => void seen.push(e.cursor), onState: (s) => void states.push(s) });
    try {
      await waitFor(() => seen.length === 3 && states.includes("following"));
      // Live: event 4 arrives, and the same frame arrives again (a repeat).
      ledger.push(frame(4));
      keeper.push({ type: "event", event: frame(4) });
      keeper.push({ type: "event", event: frame(4) });
      await waitFor(() => seen.length === 4);
      // The stream drops while two more events are committed; one of them is never pushed live.
      ledger.push(frame(5), frame(6));
      keeper.dropAll();
      await waitFor(() => seen.length === 6);
      expect(seen).toEqual([1, 2, 3, 4, 5, 6].map((n) => frame(n).cursor));
      expect(states).toContain("reconnecting");
      expect(follower.cursor()).toBe(frame(6).cursor);
      // The reconnect read what was missed from the last cursor it had (event 4), then subscribed from the new last one. It never started over.
      expect(keeper.received.filter((r) => r.verb === "events_get_range").some((r) => r.from_cursor === frame(4).cursor)).toBe(true);
      expect(keeper.received.filter((r) => r.verb === "events_subscribe").at(-1)).toMatchObject({ from_cursor: frame(6).cursor });
    } finally {
      follower.stop();
    }
  });

  test("a frame dropped from the live stream is recovered by the ranged read", async () => {
    const ledger: EventFrame[] = [frame(1)];
    const keeper = (live = fakeCaseKeeper((request) => {
      const after = typeof request.from_cursor === "string" ? request.from_cursor : "";
      if (request.verb === "events_get_range") return { json: { events: ledger.filter((e) => e.cursor > after) } };
      return { stream: [{ ok: true, subscribed: true }] };
    }));
    const seen: string[] = [];
    const follower = followEvents({ socketPath: keeper.socketPath, from_cursor: null, retryMs: 30, sweepMs: 50, timeoutMs: 400, onEvent: (e) => void seen.push(e.cursor) });
    try {
      await waitFor(() => seen.length === 1);
      ledger.push(frame(2), frame(3)); // committed, never pushed live
      await waitFor(() => seen.length === 3);
      expect(seen).toEqual([1, 2, 3].map((n) => frame(n).cursor));
    } finally {
      follower.stop();
    }
  });

  test("a saved cursor the case keeper does not know stops the follower and says so; it does not start over", async () => {
    const keeper = (live = fakeCaseKeeper(() => ({ json: { error: "unknown cursor", error_class: "unknown_cursor" } })));
    const states: string[] = [];
    const seen: string[] = [];
    const follower = followEvents({ socketPath: keeper.socketPath, from_cursor: "01JGONE", retryMs: 30, sweepMs: 60_000, timeoutMs: 400, onEvent: (e) => void seen.push(e.cursor), onState: (s, words) => void states.push(`${s}:${words}`) });
    try {
      await waitFor(() => states.some((s) => s.startsWith("cursor_unknown")));
      expect(states.find((s) => s.startsWith("cursor_unknown"))).toContain("cannot resume");
      expect(seen).toEqual([]);
    } finally {
      follower.stop();
    }
  });
});
