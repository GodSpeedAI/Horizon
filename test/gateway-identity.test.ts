import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_GATEWAY_ACCOUNT,
  planConfigWrite,
  resolveGatewaySettings,
  sidecarName,
  statusFor,
  validateGateway,
} from "../scripts/gateway-identity.ts";

const me = process.getuid!();
const other = me + 1 === 0 ? me + 2 : me + 1; // any uid that is not the current one, and not root
const governed = resolveGatewaySettings({});
const facts = (over: Partial<Parameters<typeof validateGateway>[1]> = {}) => ({
  gateway: { name: governed.account, uid: other },
  socketOwner: { name: governed.account, uid: other },
  currentUid: me,
  ...over,
});

describe("gateway identity", () => {
  test("defaults to the product name and honors env override", () => {
    expect(governed).toEqual({ account: DEFAULT_GATEWAY_ACCOUNT, socketOwner: DEFAULT_GATEWAY_ACCOUNT, mode: "governed" });
    expect(resolveGatewaySettings({ HORIZON_GATEWAY_ACCOUNT: "svc-x" }, { account: "cfg" }).account).toBe("svc-x");
  });
  test("a valid separate account passes", () => {
    expect(validateGateway(governed, facts()).ok).toBe(true);
  });
  test("missing account is refused", () => {
    const v = validateGateway(governed, facts({ gateway: { name: governed.account, uid: null } }));
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toContain("does not exist");
  });
  test("root is refused", () => {
    const v = validateGateway(governed, facts({ gateway: { name: governed.account, uid: 0 }, socketOwner: { name: governed.account, uid: 0 } }));
    expect(v.errors.join()).toContain("is root");
  });
  test("the account running Horizon is refused", () => {
    const v = validateGateway(governed, facts({ gateway: { name: governed.account, uid: me }, socketOwner: { name: governed.account, uid: me } }));
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toContain("must not be the gateway");
  });
  test("socket owner mismatch is refused", () => {
    const v = validateGateway(governed, facts({ socketOwner: { name: "someone-else", uid: other + 1 } }));
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toContain("expected");
  });
  test("unisolated-development is explicit and marked INSECURE", () => {
    expect(resolveGatewaySettings({}, {}, false).mode).toBe("governed");
    const s = resolveGatewaySettings({ HORIZON_GATEWAY_MODE: "unisolated-development" });
    const v = validateGateway(s, facts({ gateway: { name: s.account, uid: null }, socketOwner: null }));
    expect(v.ok && v.insecure).toBe(true);
    expect(statusFor(v, s).approvals).toBe("INSECURE");
    expect(JSON.stringify(statusFor(v, s))).not.toContain(String(me));
  });
  test("an existing config is not overwritten", () => {
    expect(planConfigWrite(null, "a").action).toBe("write");
    expect(planConfigWrite("a", "a").action).toBe("keep");
    const p = planConfigWrite("x\nold", "x\nnew");
    expect(p.action).toBe("sidecar");
    if (p.action === "sidecar") expect(p.summary).toContain("- old");
    expect(sidecarName("/c/server.yaml", new Date("2026-01-02T03:04:05.678Z"))).toBe("/c/server.yaml.generated-20260102T030405Z");
  });
});

describe("install-sea-forge-gateway.sh", () => {
  test("dry-run prints a plan and changes nothing", () => {
    const root = mkdtempSync(join(tmpdir(), "gw-plan-"));
    const emptyStage = mkdtempSync(join(tmpdir(), "gw-stage-"));
    try {
      // Point the stage at an empty directory so a developer's real staged bundle cannot change the result.
      const r = Bun.spawnSync(["bash", join(import.meta.dir, "..", "scripts", "install-sea-forge-gateway.sh"), "--dry-run"], {
        env: { ...process.env, HORIZON_GATEWAY_ROOT: root, HORIZON_GATEWAY_STAGE: emptyStage, HORIZON_GATEWAY_ACCOUNT: "horizon-test-absent-account" },
      });
      const out = r.stdout.toString();
      expect(r.exitCode).toBe(0);
      // The plan is generated from a staged bundle (just gateway-stage); without one, dry-run says so and changes nothing.
      expect(out).toContain("no staged bundle");
      expect(out).toContain("no changes made");
      expect(readdirSync(root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(emptyStage, { recursive: true, force: true });
    }
  });
});
