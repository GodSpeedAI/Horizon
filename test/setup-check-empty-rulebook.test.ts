/** The empty check leaves out the setup's own rulebook folder only while it holds what a start writes. */
import { expect, test } from "bun:test";
import { isRulebookFolder, onlyStartRecords } from "../scripts/setup-check-empty.ts";

const folder = "/s/production/cell/realitytrace-repo-obligations";
const enrollment = { payload: { envelope_kind: "execution_trace", scope: { filesystem_path: folder } } };
const snapshot = { payload: { envelope_kind: "semantic_snapshot", scope: {} } };

test("only the setup's own rulebook folder is recognised", () => {
  expect(isRulebookFolder(folder, "/s/production")).toBe(true);
  expect(isRulebookFolder("/s/production/cell/realitytrace/seed-repo", "/s/production")).toBe(false);
  expect(isRulebookFolder("/elsewhere/cell/realitytrace-repo-obligations", "/s/production")).toBe(false);
});

test("the enrollment trace and rulebook snapshots are start records; anything else is data", () => {
  expect(onlyStartRecords([], folder)).toBe(true);
  expect(onlyStartRecords([enrollment, snapshot, snapshot], folder)).toBe(true);
  expect(onlyStartRecords([enrollment, { payload: { envelope_kind: "work_request" } }], folder)).toBe(false);
  expect(onlyStartRecords([{ payload: { envelope_kind: "execution_trace", scope: { filesystem_path: "/some/project" } } }], folder)).toBe(false);
});
