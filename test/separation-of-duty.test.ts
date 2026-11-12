/**
 * Separation of duty is stated by role. A P3 row names its requester, approver and executor; the
 * catalog refuses a row whose approver is its requester or its executor, and refuses a bare boolean.
 */
import { expect, test, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { loadOperationManifest, parseOperationManifest } from "../src/contracts/identity/manifest.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const loaded = loadOperationManifest();

describe("separation of duty is stated by role, and a P3 approver must be distinct from the requester and the executor", () => {
  const sodSource = () => readFileSync(`${ROOT}contracts/identity/v1/operations.yaml`, "utf8");

  test("PE-70: every P3 row names a requester, an approver and an executor, the approver is distinct from the other two, and the executor is the row's executor", () => {
    for (const operation of loaded.byId.values()) {
      if (operation.class !== "P3") continue;
      const separation = operation.separationOfDuty;
      expect(separation, operation.id).not.toBeNull();
      expect(separation?.approver, operation.id).not.toBe(separation?.requester);
      expect(separation?.approver, operation.id).not.toBe(separation?.executor);
      if (operation.executor !== null) expect(separation?.executor, operation.id).toBe(operation.executor);
    }
  });

  test("NE-54: a P3 row whose approver is its own requester is refused", () => {
    const source = sodSource().replace(
      "{ requester: requesting_human, approver: independent_human, executor: human_session }",
      "{ requester: requesting_human, approver: requesting_human, executor: human_session }",
    );
    expect(() => parseOperationManifest(source)).toThrow(/separation of duty needs three distinct roles/);
  });

  test("NE-55: a P3 row whose approver is its executor is refused", () => {
    const source = sodSource().replace(
      "{ requester: run_owner_human, approver: independent_human, executor: human_session }",
      "{ requester: run_owner_human, approver: independent_human, executor: independent_human }",
    );
    expect(() => parseOperationManifest(source)).toThrow(/separation of duty needs three distinct roles/);
  });

  test("NE-56: a bare boolean is not a statement of separation and is refused by the schema", () => {
    const source = sodSource().replace("{ requester: requesting_human, approver: independent_human, executor: human_session }", "true");
    expect(() => parseOperationManifest(source)).toThrow();
  });
});

describe("specification-only P3 rows are non-executable and claim no runtime access", () => {
  // SEA-Forge is unpublished, so no grant revocation or run cancellation can be authorized here. Both rows are
  // reserved with no route; if either ever gained a route, this test forces a deliberate new decision.
  for (const id of ["grant.revoke", "gauntlet.run.cancel"]) {
    test(`${id} is reserved with no route`, () => {
      const row = loaded.byId.get(id);
      expect(row?.class).toBe("P3");
      expect(row?.binding).toBe("reserved");
      expect(row?.routes ?? []).toEqual([]);
    });
  }
});
