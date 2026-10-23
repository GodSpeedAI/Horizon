// J02 live (readiness P04, step 1): Horizon's navigation commit is decided by a real SEA-Forge server.
// Horizon never grants authority itself (AGENTS.md §9); a mocked SEA-Forge would prove nothing (§7).
//   allow   -> the intent is committed exactly once;
//   deny    -> SEA-Forge refuses it: no record, and the refused attempt is audited;
//   offline -> SEA-Forge unreachable: the commit fails closed, no record.
// The world SEA-Forge registers is Horizon's own `domain/` source set; an unknown world would refuse the
// allow case, so it passing proves both sides derive the same world_ref.
// Opt-in: SEA_FORGE_SERVER_BIN (a sea-forge-server with the policy `resources` filter).
import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { randomUUID } from "node:crypto";
import { governanceFromEnv } from "@godspeedai/cognate-runtime-bun";
import { createApplication, type HorizonApplication } from "../src/app.ts";
import { loadWorld } from "../src/adapters/semantic.ts";
import { NAVIGATION_INTENT_COMMIT, readIntentAttempts, readIntentRecords } from "../src/capabilities/navigation-intent.ts";
import { PINNED_WORLD_REF, horizonDocument, writeConfig } from "./support/config.ts";

const BIN = process.env.SEA_FORGE_SERVER_BIN;
const liveTest = BIN ? test : test.skip;
const cleanups: (() => void)[] = [];
afterAll(() => { for (const c of cleanups.reverse()) c(); });

function seaFiles(root: string, dir = root, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "validation" || e.name === "__pycache__") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) seaFiles(root, p, out);
    else if (e.isFile() && e.name.endsWith(".sea")) out.push(relative(root, p).split("\\").join("/"));
  }
  return out;
}

const policy = (commit: "allow" | "deny") => `version: "0.1"
rules:
  - name: navigation-commit
    verdict: ${commit}
    actor_role: service
    operation_kind: cognate_capability
    resources: ["${NAVIGATION_INTENT_COMMIT.id}"]
  - { name: horizon-capabilities, verdict: allow, actor_role: service, operation_kind: cognate_capability }
  - { name: horizon-actions, verdict: allow, actor_role: service, operation_kind: cognate_action }
`;

async function until(ok: () => boolean, what: string, ms = 30_000): Promise<void> {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out: ${what}`);
    await Bun.sleep(50);
  }
}

liveTest("J02: SEA-Forge, not Horizon, decides whether a navigation intent is committed", async () => {
  const root = mkdtempSync(join(tmpdir(), "horizon-j02-"));
  const socket = join(tmpdir(), `horizon-j02-${process.pid}-${randomUUID().slice(0, 8)}.sock`);
  cleanups.push(() => rmSync(root, { recursive: true, force: true }), () => rmSync(socket, { force: true }));

  // SEA-Forge registers Horizon's own source set as the world `horizon`.
  const files = seaFiles("domain");
  for (const f of files) {
    mkdirSync(dirname(join(root, "worlds", f)), { recursive: true });
    writeFileSync(join(root, "worlds", f), readFileSync(join("domain", f)));
  }
  writeFileSync(join(root, "policy.yaml"), policy("allow"));
  writeFileSync(join(root, "server.yaml"), JSON.stringify({
    socket_path: socket,
    root,
    identity: { bindings: [{ uid: process.getuid!(), actor_id: "cognate-service", roles: ["service"] }] },
    cep_authority: { enabled: true, policy: "policy.yaml", worlds: [{ name: "horizon", base: "worlds", entry: "interaction-model.sea", files }] },
  }));
  const server = Bun.spawn([BIN!], { env: { ...process.env, SEA_FORGE_ROOT: root, SEA_FORGE_SOCKET: socket }, stdout: "ignore", stderr: process.env.HZ_SF_LOG ? Bun.file(process.env.HZ_SF_LOG) : "ignore" });
  cleanups.push(() => server.kill());
  await until(() => existsSync(socket), "sea-forge-server socket");

  const worldRef = loadWorld(PINNED_WORLD_REF).cognateWorldRef;
  const governance = governanceFromEnv({ COGNATE_GOVERNANCE: "sea-forge", COGNATE_SEA_FORGE_SOCKET: socket, COGNATE_WORLD_REF: worldRef });
  expect(governance.mode).toBe("sea-forge");
  const configPath = await writeConfig(join(root, "horizon.toml"), horizonDocument({ storePath: join(root, "app.sqlite"), secretPath: join(root, "launch.secret") }));
  const app: HorizonApplication = await createApplication({ configPath, governance });
  cleanups.push(() => void app.close?.());
  const records = async () => (await readIntentRecords(app.runtime.runtime.store)).map((r) => r.record.intent_id);
  const attempts = async () => readIntentAttempts(app.runtime.runtime.store);

  // allow: committed exactly once.
  const allowed = await app.commitNavigationIntent({ operationRef: "horizon.health" });
  expect(await records()).toEqual([allowed.intent.intent_id]);

  // deny: SEA-Forge refuses this capability; Horizon's own policy would have allowed it.
  writeFileSync(join(root, "policy.yaml"), policy("deny"));
  const denied = await app.commitNavigationIntent({ operationRef: "horizon.health" }).then(() => null, (e: unknown) => e as Error);
  expect(denied, "SEA-Forge denied the commit, so Horizon must not commit it").not.toBeNull();
  expect(await records()).toEqual([allowed.intent.intent_id]);
  const refused = (await attempts()).filter((a) => a.outcome === "refused");
  expect(refused.length).toBeGreaterThanOrEqual(1);
  expect(JSON.stringify(refused.at(-1))).toMatch(/deny|denied|SEA-Forge|authority/i);

  // offline: no authority, no commit.
  writeFileSync(join(root, "policy.yaml"), policy("allow"));
  server.kill();
  await server.exited;
  rmSync(socket, { force: true });
  const offline = await app.commitNavigationIntent({ operationRef: "horizon.health" }).then(() => null, (e: unknown) => e as Error);
  expect(offline, "with SEA-Forge unreachable the commit must fail closed").not.toBeNull();
  expect(await records()).toEqual([allowed.intent.intent_id]);
}, 120_000);
