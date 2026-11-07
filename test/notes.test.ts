import { describe, expect, test } from "bun:test";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import type { DurableStore } from "@godspeedai/cognate-events";
import { NOTE_COLLECTION, NOTE_PLACEMENT_COLLECTION, NOTE_REVISION_COLLECTION, TAG_COLLECTION, getNote, listCase, listDay, listDays, listTags, noteHistory, removeFromCase, saveNote, search } from "../src/capabilities/notes.ts";

const me = { tenant: "local:h:testing", operator: "op-1" };
const at = new Date("2026-11-06T10:00:00Z");
const save = (store: DurableStore, input: unknown, over: Record<string, unknown> = {}) => saveNote(store, { ...me, input, now: at, timeZone: "UTC", ...over });

describe("notes", () => {
  test("a save is one commit", async () => {
    const store = createMemoryStore();
    let commits = 0;
    const counting: DurableStore = { ...store, commit: (request) => ((commits += 1), store.commit(request)) };
    await save(counting, { body: "first", tags: ["a", "b"], case_ref: "case:1" });
    expect(commits).toBe(1);
    await save(counting, { body: "edited", note_id: (await listDay(store, me, "2026-11-06"))[0]!.note_id, tags: ["a"] });
    expect(commits).toBe(2);
  });

  test("crash in mid-save keeps the previous revision", async () => {
    const store = createMemoryStore();
    const first = await save(store, { body: "version one", tags: ["keep"] });
    const crashing: DurableStore = {
      ...store,
      commit: async () => {
        throw new Error("disk went away");
      },
    };
    await expect(save(crashing, { note_id: first.note_id, body: "version two", tags: [] })).rejects.toThrow("disk went away");
    const after = await getNote(store, me, first.note_id);
    expect(after?.body).toBe("version one");
    expect(after?.rev).toBe(1);
    expect((await noteHistory(store, me, first.note_id)).map((r) => r.body)).toEqual(["version one"]);
    expect((await listTags(store, me)).map((t) => t.name)).toEqual(["keep"]);
  });

  test("two-organization count: counts never include another org's notes", async () => {
    const store = createMemoryStore();
    await save(store, { body: "mine" });
    await save(store, { body: "theirs" }, { tenant: "local:other" });
    expect((await listDays(store, me)).map((d) => d.count)).toEqual([1]);
    expect(await search(store, me, {})).toHaveLength(1);
    expect(await listDay(store, { tenant: "local:other", operator: me.operator }, "2026-11-06")).toHaveLength(1);
  });

  test("visibility is filtered before counting", async () => {
    const store = createMemoryStore();
    await save(store, { body: "mine", tags: ["shared-name"] });
    await save(store, { body: "someone else's secret", tags: ["shared-name"] }, { operator: "op-2" });
    expect((await listTags(store, me))[0]).toEqual({ name: "shared-name", count: 1 });
    expect((await listDays(store, me))[0]!.count).toBe(1);
    const hidden = await search(store, me, { q: "secret" });
    expect(hidden).toHaveLength(0);
    // A tag seen only by someone else is not listed to me, not even as a zero.
    await save(store, { body: "private", tags: ["only-op-2"] }, { operator: "op-2" });
    expect((await listTags(store, me)).map((t) => t.name)).toEqual(["shared-name"]);
    const id = (await listDay(store, { ...me, operator: "op-2" }, "2026-11-06"))[0]!.note_id;
    expect(await getNote(store, me, id)).toBeNull();
    await expect(save(store, { note_id: id, body: "overwrite" })).rejects.toThrow("could not be found");
  });

  test("day key follows the chosen time zone around midnight", async () => {
    const store = createMemoryStore();
    const late = new Date("2026-11-06T23:30:00Z");
    expect((await save(store, { body: "utc" }, { now: late, timeZone: "UTC" })).day).toBe("2026-11-06");
    expect((await save(store, { body: "tokyo" }, { now: late, timeZone: "Asia/Tokyo" })).day).toBe("2026-11-07");
    expect((await save(store, { body: "la" }, { now: late, timeZone: "America/Los_Angeles" })).day).toBe("2026-11-06");
    expect((await listDay(store, me, "2026-11-07")).map((n) => n.body)).toEqual(["tokyo"]);
  });

  test("tags and placements round-trip", async () => {
    const store = createMemoryStore();
    const note = await save(store, { body: "ship it [[case:case:9|Checkout fix]]", tags: ["Urgent", "urgent", " Money "], case_ref: "case:9" });
    expect(note.tags).toEqual(["urgent", "money"]);
    expect(note.links).toEqual([{ kind: "case", ref: "case:9" }]);
    expect((await store.listRecords(TAG_COLLECTION, {})).map((r) => r.id).sort()).toEqual([`tag:${me.tenant}:money`, `tag:${me.tenant}:urgent`]);
    expect((await store.listRecords(NOTE_PLACEMENT_COLLECTION, {})).map((r) => `${r.value.kind}:${r.value.ref}`).sort()).toEqual(["case:case:9", "day:2026-11-06"]);
    expect((await listCase(store, me, "case:9")).map((n) => n.note_id)).toEqual([note.note_id]);
    expect((await search(store, me, { tag: "urgent" })).map((n) => n.note_id)).toEqual([note.note_id]);
    // The same note appears in both places; editing changes it in both; removing it from the case does not delete it.
    await save(store, { note_id: note.note_id, body: "ship it now", tags: ["money"] });
    expect((await listCase(store, me, "case:9"))[0]!.body).toBe("ship it now");
    expect((await listDay(store, me, "2026-11-06"))[0]!.body).toBe("ship it now");
    expect(await search(store, me, { tag: "urgent" })).toHaveLength(0);
    await removeFromCase(store, { ...me, noteId: note.note_id, caseRef: "case:9", now: at });
    expect(await listCase(store, me, "case:9")).toHaveLength(0);
    expect(await listDay(store, me, "2026-11-06")).toHaveLength(1);
    // Every edit is kept.
    expect((await noteHistory(store, me, note.note_id)).map((r) => r.body)).toEqual(["ship it [[case:case:9|Checkout fix]]", "ship it now"]);
    expect((await store.listRecords(NOTE_REVISION_COLLECTION, {})).length).toBe(2);
    expect((await store.listRecords(NOTE_COLLECTION, {})).length).toBe(1);
  });
});
