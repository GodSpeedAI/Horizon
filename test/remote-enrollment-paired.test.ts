/**
 * The phone enrollment link carries the remote's pairing secret (`/m/pair#p=...`). Only a paired desk session may read it: an
 * unpaired caller gets a refusal that holds no link, on every route that can show one.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApplication, type HorizonApplication } from "../src/app.ts";
import { seedOperationalFixture } from "./support/operational-fixture.ts";
import { horizonDocument, writeConfig } from "./support/config.ts";
import "./support/write-token.ts";
import { p3AuthorityDouble } from "./support/p3-authority-double.ts";

let application: HorizonApplication;
let cockpit: ReturnType<HorizonApplication["startServer"]>;
let base: string;
let savedPort: string | undefined;

beforeAll(async () => {
  savedPort = process.env.HORIZON_REMOTE_PORT;
  process.env.HORIZON_REMOTE_PORT = "0";
  const root = mkdtempSync(join(tmpdir(), "enrollment-"));
  const configPath = await writeConfig(join(root, "horizon.toml"), horizonDocument({ storePath: join(root, "e.sqlite"), secretPath: join(root, "launch.secret") }));
  application = await createApplication({ configPath, remoteP3Authority: p3AuthorityDouble() });
  await seedOperationalFixture(application.runtime.runtime.store, undefined, application.caller.tenant);
  cockpit = application.startServer(0);
  base = `http://127.0.0.1:${cockpit.port}`;
  // The preload pairs this client, then the start is a paired write.
  await fetch(`${base}/workspace/remote/start`, { method: "POST", redirect: "manual" });
}, 60_000);

afterAll(async () => {
  await application?.remote.stop().catch(() => undefined);
  await cockpit?.stop(true);
  await application?.close();
  if (savedPort === undefined) delete process.env.HORIZON_REMOTE_PORT;
  else process.env.HORIZON_REMOTE_PORT = savedPort;
});

const bare = (path: string) => fetch(`${base}${path}`, { headers: { "x-test-no-session": "1" } });

describe("the enrollment link", () => {
  test("the remote is started and holds a link", () => {
    expect(application.remote.pairingLink()).toContain("pair#p=");
  });

  test.each(["/desk/remote.json", "/workspace/remote", "/workspace/remote/status", "/workspace/remote/events"])("an unpaired GET of %s holds no link and no secret", async (path) => {
    const response = await bare(path);
    expect(response.status).toBe(401);
    const text = await response.text();
    expect(text).not.toContain("pair#p=");
    expect(text).not.toContain(application.remote.pairingLink()!.split("#p=")[1]!);
  });

  test("a paired session reads the link from the desk's remote route", async () => {
    const info = (await (await fetch(`${base}/desk/remote.json`)).json()) as { link: string | null };
    expect(info.link).toBe(application.remote.pairingLink());
    expect(info.link).toContain("pair#p=");
  });
});
