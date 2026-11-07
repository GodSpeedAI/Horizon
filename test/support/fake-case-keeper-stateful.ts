/**
 * Test support: a fake case keeper on a Unix socket, speaking the few SFWP verbs the GitHub connector uses
 * (`case_list`, `case_get_horizon`, `case_add_item`, `case_advance`, `events_get_range`, `events_subscribe`). It keeps cases and an
 * event ledger in memory, replays the stored outcome of a repeated `request_id` (a refusal is replayed as a refusal, like the real one), refuses a changed payload with `request_id_reused`, and records
 * every verb it was sent so a test can prove what was never sent (a decision, for one).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface FakeItem {
  plan_item_id: string;
  name: string;
  item_kind: string;
  execution: string;
  settlement: string;
  external_ref?: { kind: string; id: string; url: string } | null;
}
export interface FakeCase {
  case_id: string;
  summary: string;
  case_state: string;
  created_at: string;
  items: FakeItem[];
}

export interface FakeKeeper {
  readonly socketPath: string;
  readonly verbs: Record<string, unknown>[];
  readonly cases: FakeCase[];
  readonly events: { cursor: string; kind: string; case_id?: string; detail: unknown; committed_at: string }[];
  /** The next n `case_add_item` requests (new request ids only) are refused outright, as a policy would; nothing is written. */
  refuseAdds(n: number): void;
  /** Steps made by `case_add_item` (a replay makes none). */
  readonly added: string[];
  addCase(id: string, summary: string, items?: FakeItem[]): FakeCase;
  /** Change a step and append the event the real case keeper would. */
  setStep(caseId: string, stepId: string, change: Partial<FakeItem>): void;
  emit(kind: string, caseId?: string): string;
  /** Close every live subscription (the stream drops). */
  drop(): void;
  /** While true, the live stream sends nothing (frames are only in the ledger). */
  silence: boolean;
  close(): void;
}

export function startFakeKeeper(): FakeKeeper {
  const dir = mkdtempSync(join(tmpdir(), "horizon-keeper-"));
  const socketPath = join(dir, "k.sock");
  const cases: FakeCase[] = [];
  const events: FakeKeeper["events"] = [];
  const verbs: Record<string, unknown>[] = [];
  const added: string[] = [];
  const seen = new Map<string, { payload: string; reply: Record<string, unknown> }>();
  let refusals = 0;
  const subscribers = new Set<{ write(data: string): number; end(): void }>();
  let counter = 0;
  const state = { silence: false };

  const emit = (kind: string, case_id?: string): string => {
    counter += 1;
    const cursor = `E${String(counter).padStart(8, "0")}`;
    const frame = { cursor, kind, ...(case_id ? { case_id } : {}), detail: {}, committed_at: new Date().toISOString() };
    events.push(frame);
    if (!state.silence) for (const s of subscribers) s.write(`${JSON.stringify({ type: "event", event: frame })}\n`);
    return cursor;
  };

  const respond = (request: Record<string, any>, socket: { write(data: string): number; end(): void }): Record<string, unknown> | null => {
    verbs.push(request);
    switch (request.verb) {
      case "case_list":
        return { cases: cases.map(({ items: _i, ...c }) => c) };
      case "case_get_horizon": {
        const c = cases.find((x) => x.case_id === request.case_id);
        return c ? { case_id: c.case_id, case_state: c.case_state, items: c.items } : { error: "no such case", error_class: "not_found" };
      }
      case "case_add_item": {
        const c = cases.find((x) => x.case_id === request.case_id);
        if (!c) return { error: "no such case", error_class: "not_found" };
        const payload = JSON.stringify({ case_id: request.case_id, item: request.item });
        const prior = seen.get(request.request_id);
        if (prior !== undefined) return prior.payload === payload ? { ...prior.reply, ...(prior.reply.ok === true ? { replayed: true } : {}) } : { ok: false, error: "request id reused", error_class: "request_id_reused" };
        const remember = (reply: Record<string, unknown>) => {
          seen.set(request.request_id, { payload, reply });
          return reply;
        };
        if (refusals > 0) {
          refusals -= 1;
          return remember({ ok: false, error: "authority decision does not grant this action", error_class: "authority_denied" });
        }
        if (c.items.some((i) => i.plan_item_id === request.item.plan_item_id)) return remember({ ok: false, error: "duplicate item", error_class: "plan_invalid" });
        c.items.push({ plan_item_id: request.item.plan_item_id, name: request.item.name, item_kind: request.item.item_kind, execution: "pending", settlement: "unsettled", external_ref: request.item.external_ref ?? null });
        added.push(request.item.plan_item_id);
        emit("case.trace.item_added", c.case_id);
        return remember({ ok: true, case_id: c.case_id, plan_item_id: request.item.plan_item_id, proposed_by: "operator_local" });
      }
      case "case_advance": {
        const c = cases.find((x) => x.case_id === request.case_id);
        if (!c) return { error: "no such case", error_class: "not_found" };
        const prior = seen.get(request.request_id);
        if (prior !== undefined) return { ...prior.reply, replayed: true };
        const reply = { ok: true, case_id: c.case_id };
        seen.set(request.request_id, { payload: "", reply });
        for (const i of c.items) if (i.execution === "pending") i.execution = "active";
        emit("case.trace.item_changed", c.case_id);
        return reply;
      }
      case "events_get_range": {
        const from = request.from_cursor as string | undefined;
        if (from !== undefined && !events.some((e) => e.cursor === from)) return { error: "unknown cursor", error_class: "unknown_cursor" };
        return { events: events.filter((e) => from === undefined || e.cursor > from).slice(0, request.limit ?? 500) };
      }
      case "events_subscribe": {
        const from = request.from_cursor as string | undefined;
        const replay = events.filter((e) => from === undefined || e.cursor > from);
        for (const e of replay) socket.write(`${JSON.stringify({ type: "event", event: e })}\n`);
        subscribers.add(socket);
        return { ok: true, subscribed: true, replayed: replay.length };
      }
      default:
        return { error: `unknown verb ${String(request.verb)}`, error_class: "bad_request" };
    }
  };

  const listener = Bun.listen<{ buf: string }>({
    unix: socketPath,
    socket: {
      open(socket) {
        socket.data = { buf: "" };
      },
      data(socket, chunk) {
        socket.data.buf += chunk.toString();
        for (let nl = socket.data.buf.indexOf("\n"); nl >= 0; nl = socket.data.buf.indexOf("\n")) {
          const line = socket.data.buf.slice(0, nl);
          socket.data.buf = socket.data.buf.slice(nl + 1);
          const answer = respond(JSON.parse(line), socket);
          if (answer) socket.write(`${JSON.stringify(answer)}\n`);
        }
      },
      close(socket) {
        subscribers.delete(socket);
      },
    },
  });

  return {
    socketPath,
    verbs,
    cases,
    events,
    added,
    refuseAdds(n) {
      refusals = n;
    },
    addCase(id, summary, items = []) {
      const c: FakeCase = { case_id: id, summary, case_state: "active", created_at: new Date(1_000_000 + cases.length).toISOString(), items };
      cases.push(c);
      emit("case.submitted", id);
      return c;
    },
    setStep(caseId, stepId, change) {
      const item = cases.find((c) => c.case_id === caseId)!.items.find((i) => i.plan_item_id === stepId)!;
      Object.assign(item, change);
      emit("case.trace.item_changed", caseId);
    },
    emit,
    drop() {
      for (const s of subscribers) s.end();
      subscribers.clear();
    },
    get silence() {
      return state.silence;
    },
    set silence(value: boolean) {
      state.silence = value;
    },
    close() {
      listener.stop(true);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
