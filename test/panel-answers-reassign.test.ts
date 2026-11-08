/**
 * A route planned before a reassignment cannot restore the old owner (the queue and the read version), and a reassignment keeps
 * the authorship of the answers it moves (asked_by, asked_by_key) and records the change in a list.
 */
import { describe, expect, test } from "bun:test";
import type { DurableStore } from "@godspeedai/cognate-events";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { listAnswers, planReassign, planRoute, recordAnswer, routeAnswer, type PanelQueue } from "../src/capabilities/panel-answers.ts";

const now = new Date("2026-11-07T10:00:00Z");
const later = new Date("2026-11-07T10:05:00Z");
const who = { tenant: "t", operator: "sam" };
const ROUTE = "step handoff_0a49 in Seed: triage inbox";

/** The desk's FIFO, as panelCommand in app.ts runs it: one command at a time, in arrival order. */
function serialQueue(): PanelQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(command: () => Promise<T>): Promise<T> => {
    const run = tail.then(command);
    tail = run.catch(() => undefined);
    return run;
  };
}

/** Moves the waiting question from Alice to Bob, as the person does on a paired desk. */
function moveToBob(store: DurableStore) {
  return planReassign(store, { tenant: "t", panel_id: "p", ask: "q1", question: "Which plan?", from_key: "ag_alice", to_key: "ag_bob", from_name: "Alice", to_name: "Bob", paired: true, pairedAgeMs: 1000, targetRegistered: true, confirmed: true, who, now: later });
}

async function askedByAlice(store: DurableStore): Promise<void> {
  await recordAnswer(store, { tenant: "t", panel_id: "p", ask: "q1", outcome: "answered", value: "yes", step: "s1", asked_by: "Alice", asked_by_key: "ag_alice", now });
}

describe("a route planned before a reassignment cannot restore the old owner", () => {
  test("pause route, reassign, resume: the old owner is not restored", async () => {
    const store = createMemoryStore();
    await askedByAlice(store);
    // Alice's route is checked and planned, then paused before it is committed.
    const paused = await planRoute(store, "t", "p", "q1", ROUTE, "ag_alice");
    expect(paused.ok).toBe(true);
    // The person moves the question to Bob in between.
    const moved = await moveToBob(store);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    await store.commit({ appends: [], records: moved.records });
    // Resuming commits the stale plan: it was read before the move, so the store refuses it and nothing is restored.
    if (!paused.ok) throw new Error("the route was not planned");
    await expect(store.commit({ appends: [], records: paused.records })).rejects.toThrow();
    const [after] = await listAnswers(store, "t", "p");
    expect(after?.owner_key).toBe("ag_bob");
    expect(after?.state).toBe("waiting_for_agent");
    // Resuming through the queue: Alice is refused as not the owner, and Bob's route is accepted.
    const queue = serialQueue();
    expect(await routeAnswer(store, "t", "p", "q1", ROUTE, "ag_alice", queue)).toMatchObject({ ok: false });
    expect((await listAnswers(store, "t", "p"))[0]?.owner_key).toBe("ag_bob");
    expect(await routeAnswer(store, "t", "p", "q1", ROUTE, "ag_bob", queue)).toEqual({ ok: true, closed: 1 });
  });

  test("a route without the agent key is refused and changes nothing", async () => {
    const store = createMemoryStore();
    await askedByAlice(store);
    expect(await routeAnswer(store, "t", "p", "q1", ROUTE, "", serialQueue())).toMatchObject({ ok: false });
    expect((await listAnswers(store, "t", "p"))[0]?.state).toBe("waiting_for_agent");
  });
});
