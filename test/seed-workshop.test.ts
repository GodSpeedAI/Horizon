/** The workshop agent part of the seed, against a stand-in workshop and temp folders only. */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearWorkshop, printStatus, seedWorkshop, workshopPart, type Context, type IO, type Ports, type WorkshopPort } from "../scripts/seed.ts";
import type { Access } from "../src/adapters/workshop.ts";

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const TOML = `# my setup
port = 3100

[workshop]
url = "http://127.0.0.1:3190" # local
key_path = "/secret/workbench.key"

[ui]
timezone = "UTC"
`;

function rig(options: { connected?: boolean; fail?: Error } = {}) {
  const root = mkdtempSync(join(tmpdir(), "horizon-seed-workshop-"));
  dirs.push(root);
  const configPath = join(root, "horizon.toml");
  writeFileSync(configPath, TOML);
  const calls: { capability: string; input: unknown }[] = [];
  const access: Access =
    options.connected === false
      ? { kind: "not_connected", why: "missing", words: "Agent work is not connected: there is no access key yet." }
      : {
          kind: "ready",
          client: {
            invoke: async (capability: string, input: unknown): Promise<never> => {
              calls.push({ capability, input });
              if (options.fail) throw options.fail;
              return (capability === "workspace.select" ? { ok: true, workspaceId: "ws-from-workshop" } : { ok: true }) as never;
            },
          },
        };
  const port: WorkshopPort = { access: () => access, configPath, root };
  const lines: string[] = [];
  const io: IO = { out: (l) => void lines.push(l), err: (l) => void lines.push(l) };
  const ctx = { ports: { workshop: port } as unknown as Ports, io } as unknown as Context;
  return { root, configPath, calls, port, lines, io, ctx, toml: () => readFileSync(configPath, "utf8") };
}

describe("seed: workshop agent", () => {
  test("connected: makes the folder, both calls, and writes both lines; a second run changes nothing", async () => {
    const r = rig();
    await seedWorkshop(r.ctx);
    expect(r.calls.map((c) => c.capability)).toEqual(["workspace.select", "expert.save"]);
    const folder = join(r.root, "workbench-demo-workspace", "demo-1");
    expect(existsSync(folder)).toBe(true);
    expect(r.calls[0]!.input).toEqual({ path: folder });
    expect((r.calls[1]!.input as { expertId: string }).expertId).toBe("horizon-demo-helper");
    expect(r.toml()).toBe(TOML.replace('key_path = "/secret/workbench.key"\n', 'key_path = "/secret/workbench.key"\nexpert_id = "horizon-demo-helper"\nworkspace_id = "ws-from-workshop"\n'));
    expect(r.lines.join("\n")).toContain("restart the desk");
    expect(r.lines.join("\n")).toContain("Settings > Models");
    const once = r.toml();
    r.lines.length = 0;
    await seedWorkshop(r.ctx);
    expect(r.toml()).toBe(once);
    expect(r.lines.join("\n")).toContain("already set up");
  });

  test("status lists the part as present, missing or skipped", async () => {
    const part = (r: ReturnType<typeof rig>) => {
      const out: string[] = [];
      printStatus([workshopPart(r.ctx)!], { out: (l) => void out.push(l), err: () => {} });
      return out.join("\n");
    };
    const a = rig();
    expect(part(a)).toContain("MISSING  workshop agent");
    await seedWorkshop(a.ctx);
    expect(part(a)).toContain("present  workshop agent");
    expect(part(rig({ connected: false }))).toContain("skipped  workshop agent");
  });

  test("not connected: skipped in the stated words, no calls, nothing written", async () => {
    const r = rig({ connected: false });
    await seedWorkshop(r.ctx);
    expect(r.lines.join("\n")).toContain("skipped: agent work is not connected (Connect Horizon in the workshop's Settings > Governance & evidence first)");
    expect(r.calls).toHaveLength(0);
    expect(r.toml()).toBe(TOML);
  });

  test("the workshop refuses: plain words, no raw error text, nothing written", async () => {
    const r = rig({ fail: new Error("403 forbidden wbs1.SECRET-TOKEN") });
    await seedWorkshop(r.ctx);
    const said = r.lines.join("\n");
    expect(said).toContain("The workshop did not allow this.");
    expect(said).not.toContain("SECRET-TOKEN");
    expect(r.toml()).toBe(TOML);
  });

  test("clear: archives the agent and removes only the two lines", async () => {
    const r = rig();
    await seedWorkshop(r.ctx);
    r.calls.length = 0;
    await clearWorkshop(r.port, r.io);
    expect(r.calls).toEqual([{ capability: "expert.archive", input: { expertId: "horizon-demo-helper" } }]);
    expect(r.toml()).toBe(TOML);
  });

  test("clear with the workshop failing: says so, still removes the lines", async () => {
    const r = rig();
    await seedWorkshop(r.ctx);
    const down = rig({ fail: new Error("connect refused") });
    writeFileSync(down.configPath, r.toml());
    await clearWorkshop(down.port, down.io);
    expect(down.lines.join("\n")).toContain("could not archive");
    expect(down.toml()).toBe(TOML);
  });
});
