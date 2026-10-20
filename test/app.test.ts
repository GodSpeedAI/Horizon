import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StoredEvent } from "@godspeedai/cognate-events";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { createApplication, type HorizonApplication } from "../src/app.ts";
import { readIntentAttempts, readIntentRecords } from "../src/capabilities/navigation-intent.ts";
import { REQUIRED_COGNATE } from "../src/runtime/required-cognate.ts";
import { bindingContextOf, projectFrame } from "../src/ui/surface.ts";
import { PINNED_WORLD_REF, horizonDocument, writeConfig } from "./support/config.ts";

const PINNED = PINNED_WORLD_REF;
/** Every real SQLite file begins with these 16 bytes; a marker file does not. */
const SQLITE_HEADER = "SQLite format 3\u0000";
const PROJECTION = "horizon.navigation-context";

/** An independent connection to the configured file — not the runtime's own handle. */
const openStore = (path: string) => openSqliteStore({ path });

let application: HorizonApplication | undefined;

afterAll(async () => {
  await application?.close();
});

/** Construct the application from a written config file; never override the store path. */
async function configuredApplication(
  root: string,
  overrides: { readonly researchCommand?: readonly string[] } = {},
): Promise<HorizonApplication> {
  const configPath = await writeConfig(
    join(root, "horizon.toml"),
    horizonDocument({ storePath: join(root, "app.sqlite"), secretPath: join(root, "launch.secret"), ...overrides }),
  );
  return createApplication({ configPath });
}

async function readAllEvents(path: string): Promise<StoredEvent[]> {
  const store = openStore(path);
  try {
    return await store.readAll({});
  } finally {
    await store.close();
  }
}

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) out.push(item);
  return out;
}

async function waitForRun(app: HorizonApplication, runId: string) {
  for (let i = 0; i < 500; i += 1) {
    const view = await app.runtime.runtime.service.getRun(app.caller, { runId });
    if (view.status !== "running" && view.status !== "waiting") return view;
    await Bun.sleep(10);
  }
  throw new Error(`run ${runId} did not finish`);
}

async function waitForRow(app: HorizonApplication, runId: string) {
  for (let i = 0; i < 200; i += 1) {
    const projection = await app.runtime.runtime.service.readProjection(app.caller, { name: PROJECTION });
    const row = projection.rows.find((entry) => entry.key === runId);
    if (row) return { checkpoint: projection.checkpoint, row };
    await Bun.sleep(10);
  }
  throw new Error(`projection row for ${runId} never appeared`);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function assertDeclaredCognateClosure(): void {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  const declared = new Set(Object.keys(manifest.dependencies ?? {}));
  const imported = new Set<string>();
  for (const file of sourceFiles(join(process.cwd(), "src"))) {
    for (const match of readFileSync(file, "utf8").matchAll(/from\s+["'](@godspeedai\/cognate-[a-z0-9-]+)/g)) {
      imported.add(match[1]!);
    }
  }
  expect(imported.size).toBeGreaterThan(0);
  const missing = [...new Set([...REQUIRED_COGNATE, ...imported])].filter((name) => !declared.has(name)).sort();
  expect(missing).toEqual([]);
}

describe("durable store boundary", () => {
  test("the configured store is a Cognate SQLite database that survives a close and reopen", async () => {
    // This test writes and reopens before any application assertion can observe a
    // substitute: an in-memory fake that writes a marker file fails on the header.
    const root = mkdtempSync(join(tmpdir(), "horizon-store-"));
    const path = join(root, "probe.sqlite");
    await Bun.write(path, "");
    const first = openStore(path);
    const outcome = await first.commit({
      appends: [
        {
          streamId: "horizon.store-probe",
          expectedVersion: 0,
          events: [
            {
              eventType: "horizon.store.probe",
              schemaVersion: 1,
              occurredAt: new Date().toISOString(),
              tenant: "local:probe",
              correlationId: "corr-store-probe",
              causationId: null,
              runId: null,
              scopeId: "horizon-store-probe",
              payload: { probe: true },
            },
          ],
        },
      ],
      result: { ok: true },
    });
    expect(outcome.kind).toBe("committed");
    await first.close();

    const header = new TextDecoder().decode(new Uint8Array(await Bun.file(path).slice(0, 16).arrayBuffer()));
    expect(header).toBe(SQLITE_HEADER);

    const second = openStore(path);
    try {
      const events = await second.readStream("horizon.store-probe", {});
      expect(events.map((event) => event.eventType)).toEqual(["horizon.store.probe"]);
    } finally {
      await second.close();
    }
  });
});

describe("structural walking skeleton", () => {
  const fixture = (): string => mkdtempSync(join(tmpdir(), "horizon-app-"));

  test("source world -> frame -> typed intent -> Cognate run -> projection, durable across reopen", async () => {
    // The composition is a declared Cognate project, not whatever happens to be installed:
    // removing a required package (or any Cognate package the source imports) from
    // package.json fails this E2E even while node_modules still resolves it (prereg falsifier).
    assertDeclaredCognateClosure();
    const root = fixture();
    application = await configuredApplication(root);
    const app = application;
    const { world, runtime, caller } = app;

    // Configuration, not an override: the store is the configured path.
    expect(runtime.storePath).toBe(join(root, "app.sqlite"));
    expect(world.worldRef).toBe(PINNED);
    expect(world.cognateWorldRef.startsWith("world:horizon@sha256:")).toBe(true);
    expect(world.objectCount).toBeGreaterThan(0);
    expect(world.relationCount).toBeGreaterThan(0);
    const header = new TextDecoder().decode(new Uint8Array(await Bun.file(runtime.storePath).slice(0, 16).arrayBuffer()));
    expect(header).toBe(SQLITE_HEADER);

    const semantic = await runtime.runtime.service.invoke(caller, {
      capability: "horizon.semantics.world",
      input: {},
      idempotencyKey: "t04-semantic",
    });
    expect((semantic as Record<string, unknown>).world_ref).toBe(PINNED);

    // Typed intent: built from the issued frame, committed through the runtime.
    const commit = await app.commitNavigationIntent({ operationRef: "horizon.health" });
    const frame = app.frames.current();
    expect(frame).not.toBeNull();
    expect(commit.intent.frame_id).toBe(frame!.frame_id);
    expect(commit.intent.actor_ref).toBe(caller.actor.id);
    expect(commit.result.correlation_ref).toBeTypeOf("string");
    expect(commit.position).toBeGreaterThan(0);

    // Observation run started from the committed intent (no frame cast to JSON).
    const started = await app.startObservation(commit);
    await runtime.runtime.idle(10_000);
    const view = await waitForRun(app, started.runId);
    expect(view.status === "completed" ? "completed" : `${view.status}: ${view.error}`).toBe("completed");
    const output = view.output as Record<string, unknown>;
    expect(output.world_ref).toBe(PINNED);
    expect(output.input_world_ref).toBe(PINNED);
    expect(output.correlation_ref).toBe(view.correlationId);
    expect(output.intent_id).toBe(commit.intent.intent_id);
    expect(output.frame_id).toBe(commit.intent.frame_id);
    expect(output.input_checkpoint_ref).toBe(`cognate:${commit.position}`);
    // The checkpoint of the run's own `run.started`, read from the durable log through the
    // public event query and cross-checked against the store's transparent read below.
    const runEvents = await collect(app.runtime.runtime.service.events(caller, { runId: view.runId }));
    const runStartedPosition = runEvents.find((event) => event.eventType === "run.started")!.position;
    expect(runStartedPosition).toBeGreaterThan(commit.position);

    // Projection: the run, its own checkpoint and the intent provenance.
    const projected = await waitForRow(app, view.runId);
    expect(projected.checkpoint).not.toBeNull();
    const row = projected.row.value as Record<string, unknown>;
    // The row's checkpoint is the position of its own `run.started` event; the projection's
    // checkpoint is the last position it folded, which is never behind the rows (DEBT-021).
    expect(row.checkpoint_ref).toBe(`cognate:${runStartedPosition}`);
    expect(projected.checkpoint!.position).toBeGreaterThanOrEqual(runStartedPosition);
    expect(projected.checkpoint!.position).toBeGreaterThanOrEqual(commit.position);
    expect(row.correlation_ref).toBe(view.correlationId);
    expect(row.world_ref).toBe(PINNED);
    expect(row.intent).toEqual({
      intent_id: commit.intent.intent_id,
      frame_id: commit.intent.frame_id,
      frame_revision: commit.intent.frame_revision,
      operation_ref: "horizon.health",
      input_checkpoint_ref: `cognate:${commit.position}`,
    });

    // Renderer-neutral surface over the same frame, as the in-process route presents it.
    const surface = projectFrame(frame!, bindingContextOf({ root: process.cwd(), allowFileReads: true }));
    expect(surface.ok).toBe(true);
    if (!surface.ok) throw new Error("surface rejected");
    expect(surface.view.world_ref).toBe(PINNED);
    expect(surface.view.nodes.length).toBeGreaterThan(0);
    expect(JSON.stringify(surface.view)).not.toContain("<");

    // Close, then read the same facts through independent store connections.
    await app.close();
    application = undefined;
    const events = (await readAllEvents(runtime.storePath)).filter((event) => event.runId === view.runId);
    const types = events.map((event) => event.eventType);
    expect(types).toContain("run.started");
    expect(types).toContain("run.completed");
    const runStarted = events.find((event) => event.eventType === "run.started")!;
    expect(runStarted.correlationId).toBe(view.correlationId);
    expect(runStarted.metadata?.startedBy).toBe(caller.actor.id);
    const store = openStore(runtime.storePath);
    let records;
    try {
      records = await readIntentRecords(store);
    } finally {
      await store.close();
    }
    const record = records.find((entry) => entry.record.intent_id === commit.intent.intent_id);
    expect(record).toBeDefined();
    expect(record!.record.frame_revision).toBe(commit.intent.frame_revision);
    expect(record!.record.actor_ref).toBe(caller.actor.id);
    expect(record!.record.correlation_ref).toBe(commit.result.correlation_ref);
    expect(record!.event.position).toBe(commit.position);

    // Reopen on the same configuration: the observation is still there.
    application = await configuredApplication(root);
    const reopened = await application.runtime.runtime.service.readProjection(application.caller, { name: PROJECTION });
    expect(reopened.checkpoint?.position).toBeGreaterThanOrEqual(projected.checkpoint!.position);
    expect(reopened.rows.find((entry) => entry.key === view.runId)).toBeDefined();
    const historical = await application.runtime.runtime.service.getRun(application.caller, { runId: view.runId });
    expect(historical.status).toBe("completed");
    expect((historical.output as Record<string, unknown>).intent_id).toBe(commit.intent.intent_id);

    const server = application.startServer(0);
    try {
      const response = await fetch(new URL("/health", server.url));
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.status).toBe("ok");
      expect(body.profile).toBe("local_operator");
      expect((body.world as Record<string, unknown>).world_ref).toBe(PINNED);
      expect(body.research).toEqual({
        kind: "research",
        contract: "horizon.research/1",
        status: "ok",
        capabilities: ["health", "typed-process-contract"],
        ml: false,
      });
    } finally {
      server.stop();
    }
  }, 60_000);

  test("configured in-memory storage is rejected by construction, with no E2E override", async () => {
    // NE-02's remaining condition: the *E2E's* configuration path rejects an in-memory
    // store. Constructing through app.ts runs loadConfig -> assertStoreBoundary exactly as
    // `bun run src/main.ts` does; nothing substitutes a store path.
    for (const store of [":memory:", "file::memory:?cache=shared", "postgres://localhost/horizon"]) {
      process.env.HORIZON_STORE = store;
      try {
        const root = fixture();
        const configPath = await writeConfig(
          join(root, "horizon.toml"),
          horizonDocument({ storePath: join(root, "app.sqlite"), secretPath: join(root, "launch.secret") }),
        );
        const error = await createApplication({ configPath }).then(
          () => null,
          (reason: unknown) => reason,
        );
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/^RUNTIME: local_operator (forbids an in-memory runtime|supports the local SQLite store only)/);
      } finally {
        delete process.env.HORIZON_STORE;
      }
    }
  }, 60_000);

  test("a spoofed observer is refused, the committed observer is the OS session, and the attempt is auditable", async () => {
    const root = fixture();
    application = await configuredApplication(root);
    const app = application;
    const { runtime, caller } = app;
    const operator = caller.actor.id;
    expect(operator.startsWith("os:")).toBe(true);
    expect(app.frame()).toBeNull();

    const issued = await app.commitNavigationIntent({ operationRef: "horizon.health" });
    const frame = app.frames.current()!;

    // The attempt claims another observer for the current frame revision.
    app.frames.issue({ ...frame, frame_id: "frame-spoof-surface", revision: 9 });
    const current = app.frames.current()!;
    const spoofed = {
      intent_id: crypto.randomUUID(),
      frame_id: current.frame_id,
      frame_revision: current.revision,
      actor_ref: "agent:horizon.health",
      operation_ref: "horizon.health",
    };
    // The app path refuses it and records the refusal in the durable audit...
    const refused = await app.submitIntent(spoofed).then(
      () => null,
      (reason: unknown) => reason as Error,
    );
    expect(refused).not.toBeNull();
    expect(refused!.message).toContain("is not the authenticated observer");
    const attempts = await readIntentAttempts(runtime.runtime.store);
    const refusal = attempts.find((attempt) => attempt.outcome === "refused" && attempt.intent_id === spoofed.intent_id);
    // The audit records the claimed (spoofed) observer alongside the real caller and reason.
    expect(refusal).toMatchObject({ intent_id: spoofed.intent_id, actor_ref: spoofed.actor_ref });
    expect(refusal!.caller_ref).toBe(operator);
    expect(refusal!.reason).toContain("is not the authenticated observer");
    // ...and the same intent is equally refused when invoked by hand through the runtime.
    const error = await runtime.runtime.service
      .invoke(caller, { capability: "horizon.navigation.intent.commit", input: spoofed, idempotencyKey: "spoof" })
      .then(
        () => null,
        (reason: unknown) => reason,
      );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("is not the authenticated observer");
    // No NavigationIntentRecord was written for either refusal: only the accepted commit remains.
    const recordsAfter = await readIntentRecords(runtime.runtime.store);
    expect(recordsAfter.map((entry) => entry.record.intent_id)).toEqual([issued.intent.intent_id]);
    expect(recordsAfter.map((entry) => entry.record.actor_ref)).toEqual([operator]);
    expect(attempts.find((attempt) => attempt.intent_id === issued.intent.intent_id)).toMatchObject({ outcome: "accepted" });

    // Presentation metadata cannot become the effective observer: the surface's own
    // attribution is the authenticated operator, and the committed record is unchanged.
    const surface = projectFrame(frame, bindingContextOf({ root: process.cwd(), allowFileReads: true }));
    expect(surface.ok).toBe(true);
    if (!surface.ok) throw new Error("surface rejected");
    expect(surface.surface.blocks.map((block) => block.provenance.attributed_to.actor_ref)).toEqual([operator]);
    for (const action of surface.surface.actions) expect(action.by.actor_ref).toBe(operator);
    const records = await readIntentRecords(runtime.runtime.store);
    expect(records.at(-1)!.record.actor_ref).toBe(operator);
    expect(records.at(-1)!.record.intent_id).toBe(issued.intent.intent_id);
  }, 60_000);

  test("a failed optional research source degrades one gate and leaves read-only startup and operations intact", async () => {
    const root = fixture();
    application = await configuredApplication(root, { researchCommand: ["/usr/bin/false"] });
    const app = application;
    expect(app.research.kind).toBe("research_unavailable");
    if (app.research.kind !== "research_unavailable") throw new Error("expected degraded research");
    expect(app.research.code).toBe("research_source_unavailable");

    // Read-only startup still works: world, runtime, typed intent and a completed run.
    const semantic = await app.runtime.runtime.service.invoke(app.caller, { capability: "horizon.semantics.world", input: {} });
    expect((semantic as Record<string, unknown>).world_ref).toBe(PINNED);
    const commit = await app.commitNavigationIntent({ operationRef: "horizon.health" });
    const started = await app.startObservation(commit);
    await app.runtime.runtime.idle(10_000);
    expect((await waitForRun(app, started.runId)).status).toBe("completed");

    // The affected gate is explicit and named; the unaffected gate is not withdrawn.
    const frame = app.frames.current()!;
    const research = frame.choices.find((choice) => choice.operation_ref === "horizon.research.health")!;
    const health = frame.choices.find((choice) => choice.operation_ref === "horizon.health")!;
    expect(health.assessment.status).toBe("available");
    expect(research.assessment.status).toBe("unknown");
    expect(research.assessment.first_blocker).toBe("research_source: research_source_unavailable");

    // Research-dependent operations fail closed with a typed observation.
    const refusal = (() => {
      try {
        app.researchContract();
        return null;
      } catch (error) {
        return error as { readonly code?: string; readonly message: string };
      }
    })();
    expect(refusal?.code).toBe("research_source_unavailable");
    expect(refusal?.message).toContain("research contract exited 1");

    const server = app.startServer(0);
    try {
      const body = (await (await fetch(new URL("/health", server.url))).json()) as Record<string, unknown>;
      expect(body.status).toBe("ok");
      expect(body.research).toMatchObject({
        kind: "research_unavailable",
        contract: "horizon.research/1",
        status: "unavailable",
        code: "research_source_unavailable",
        ml: false,
      });
    } finally {
      server.stop();
    }
  }, 60_000);

  test("an absent research source is a typed absent observation, not a startup failure", async () => {
    const root = fixture();
    application = await configuredApplication(root, { researchCommand: [] });
    expect(application.research).toMatchObject({ kind: "research_unavailable", code: "research_source_absent" });
    const refusal = (() => {
      try {
        application!.researchContract();
        return null;
      } catch (error) {
        return error as { readonly code?: string };
      }
    })();
    expect(refusal?.code).toBe("research_source_absent");
  }, 60_000);
});
