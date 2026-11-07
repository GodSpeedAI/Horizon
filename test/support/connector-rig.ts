/** Test support for the GitHub connector: the fake `gh`, a fake case keeper and a memory store, wired together. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import type { DurableStore } from "@godspeedai/cognate-events";
import { Connector, type ConnectorConfig } from "../../connectors/github/index.ts";
import { createGh, type GhOptions } from "../../connectors/github/gh.ts";
import { emptyRest, installFakeGh, restIssue, type FakeGh, type FakeGhState, type FakeRestIssue } from "./fake-gh.ts";
import { startFakeKeeper, type FakeKeeper } from "./fake-case-keeper-stateful.ts";

export const REPO = "GodSpeedAI/horizon-sandbox";

export interface Rig {
  readonly dir: string;
  readonly fake: FakeGh;
  readonly keeper: FakeKeeper;
  readonly store: DurableStore;
  readonly config: ConnectorConfig;
  connector(over?: { store?: DurableStore; ghOptions?: GhOptions; config?: Partial<ConnectorConfig>; now?: () => number }): Connector;
  rest(): NonNullable<FakeGhState["rest"]>;
  issue(n: number): FakeRestIssue;
  /** Add an issue as GitHub would hold it. */
  seedIssue(n: number, over?: Partial<FakeRestIssue>): void;
  /** Make the fake `gh` change its state between calls. */
  change(change: (state: FakeGhState) => void): void;
  cleanup(): void;
}

export function makeRig(over: { subIssues?: boolean; env?: Record<string, string | undefined> } = {}): Rig {
  const dir = mkdtempSync(join(tmpdir(), "horizon-connector-"));
  const fake = installFakeGh(dir, { rest: emptyRest({ subIssues: over.subIssues ?? true }) });
  const keeper = startFakeKeeper();
  const store = createMemoryStore();
  const config: ConnectorConfig = { setup: "testing", repo: REPO, subIssues: over.subIssues ?? true, board: { org: "GodSpeedAI", title: "Horizon testing" } };
  return {
    dir,
    fake,
    keeper,
    store,
    config,
    connector(o = {}) {
      return new Connector({
        gh: createGh({ env: fake.env(over.env), timeoutMs: 20_000, ...(o.ghOptions ?? {}) }),
        keeper: { socketPath: keeper.socketPath, actor: { actor_id: "cognate-service", role: "service" }, timeoutMs: 3_000 },
        store: o.store ?? store,
        config: { ...config, ...(o.config ?? {}) },
        ...(o.now ? { now: o.now } : {}),
      });
    },
    rest: () => fake.state().rest!,
    issue: (n) => fake.state().rest!.issues.find((i) => i.number === n)!,
    seedIssue(n, issueOver = {}) {
      fake.update((s) => {
        s.rest!.issues.push(restIssue(REPO, n, issueOver));
      });
    },
    change: (change) => fake.update(change),
    cleanup() {
      keeper.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const waitFor = async (check: () => boolean | Promise<boolean>, ms = 10_000): Promise<void> => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("waitFor: condition not met in time");
};
