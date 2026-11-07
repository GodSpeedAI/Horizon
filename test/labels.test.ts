import { describe, expect, test } from "bun:test";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { listLabels, putLabel } from "../src/capabilities/labels.ts";

const base = { tenant: "local:h:testing", operator: "op", session_id: "s1", event_id: "e1", now: new Date("2026-11-06T10:00:00Z") };

describe("labels", () => {
  test("label verdict must be pass or fail", async () => {
    const store = createMemoryStore();
    await expect(putLabel(store, { ...base, verdict: "maybe" })).rejects.toThrow("bad_verdict");
    await expect(putLabel(store, { ...base, verdict: undefined })).rejects.toThrow("bad_verdict");
    expect((await putLabel(store, { ...base, verdict: "pass" })).verdict).toBe("pass");
    await expect(putLabel(store, { ...base, verdict: "fail", first_failure: "x".repeat(601) })).rejects.toThrow("too_long");
  });

  test("recordSeq is optional", async () => {
    const store = createMemoryStore();
    expect((await putLabel(store, { ...base, verdict: "pass" })).record_seq).toBeNull();
    expect((await putLabel(store, { ...base, event_id: "e2", record_seq: 17, verdict: "fail", first_failure: "bad" })).record_seq).toBe(17);
  });

  test("relabel keeps one current label per run", async () => {
    const store = createMemoryStore();
    await putLabel(store, { ...base, verdict: "pass" });
    await putLabel(store, { ...base, verdict: "fail", first_failure: "tests failed", now: new Date("2026-11-06T11:00:00Z") });
    const labels = await listLabels(store, base.tenant);
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({ verdict: "fail", first_failure: "tests failed" });
  });

  test("labels are scoped to the org", async () => {
    const store = createMemoryStore();
    await putLabel(store, { ...base, verdict: "pass" });
    await putLabel(store, { ...base, tenant: "local:h", verdict: "fail" });
    expect((await listLabels(store, "local:h:testing")).map((l) => l.verdict)).toEqual(["pass"]);
    expect((await listLabels(store, "local:h")).map((l) => l.verdict)).toEqual(["fail"]);
  });
});
