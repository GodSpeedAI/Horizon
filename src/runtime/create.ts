import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import type { AgentDefinition, Caller } from "@godspeedai/cognate-runtime-api";
import { createRuntime, type ActionPolicy, type GovernanceOptions, type PendingEvent, type Runtime } from "@godspeedai/cognate-runtime-bun";
import type { DurableStore, OutboxIntent } from "@godspeedai/cognate-events";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import type { Component, Policy } from "@godspeedai/cognate-kernel-api";
import type { HorizonConfig } from "../config/types.ts";
import type { LoadedWorld } from "../adapters/semantic.ts";
import { healthAgent } from "../agents/health.ts";
import type { ContextKernelAdapter } from "../adapters/context-kernel.ts";
import { contextReferenceComponent } from "../capabilities/context.ts";
import { CONTEXT_REFERENCE } from "../capabilities/context.ts";
import { semanticWorldComponent } from "../capabilities/semantic.ts";
import { navigationContextProjection } from "../projections/navigation-context.ts";
import { operationalObjectsProjection } from "../projections/operational-objects.ts";

export class RuntimeBoundaryError extends Error {
  override readonly name = "RuntimeBoundaryError";
}

function fail(message: string): never {
  throw new RuntimeBoundaryError(`RUNTIME: ${message}`);
}

/** Capabilities the structural skeleton resolves. Anything else is denied (spec §32). */
const READ_ONLY_CAPABILITIES = new Set(["horizon.semantics.world", "horizon.navigation.intent.commit", CONTEXT_REFERENCE.id]);

const policy: Policy = {
  authorize(request) {
    if (READ_ONLY_CAPABILITIES.has(request.capability.id) && (request.actor.kind === "user" || request.actor.kind === "agent")) {
      return {
        allow: true,
        policyId: "horizon.local.read-only-semantics",
        reason: "read-only semantic projection, reference retrieval or intent commit",
      };
    }
    return { allow: false, policyId: "horizon.local.default-deny", reason: "capability is not part of the structural skeleton" };
  },
};

const actions: ActionPolicy = {
  authorize({ caller, action }) {
    const allowed = action === "run.start" || action === "run.cancel";
    if (!allowed) return { allow: false, reason: "structural skeleton permits run lifecycle only" };
    if (caller.actor.kind !== "user" && caller.actor.kind !== "agent") {
      return { allow: false, reason: "caller is not an operator or agent principal" };
    }
    return { allow: true, reason: "local_operator run lifecycle" };
  },
};

export interface HorizonRuntime {
  readonly runtime: Runtime;
  readonly caller: Caller;
  readonly storePath: string;
}

/** The store's write methods. A read-only open refuses each one, so nothing run against that store can change it. */
const WRITE_METHODS: ReadonlySet<string> = new Set([
  "commit",
  "claimOutbox",
  "settleOutbox",
  "claimOutboxLeased",
  "renewOutboxLease",
  "settleOutboxLease",
  "requeueOutbox",
  "claimRunOwnership",
  "renewRunOwnership",
  "releaseRunOwnership",
  "commitProjection",
  "failProjection",
  "resetProjection",
  "putBlob",
  "deleteBlob",
  "erasePayload",
]);

/** Raised when a read-only open is asked to write. */
export class ReadOnlyStoreWrite extends Error {
  override readonly name = "ReadOnlyStoreWrite";
  constructor(method: string) {
    super(`STORE: opened read-only, so ${method} is refused`);
  }
}

/** The schema version a store records for its newest applied migration (0 when none is recorded). Reads through a read-only connection. */
function storedSchemaVersion(storePath: string): number {
  const db = new Database(storePath, { readonly: true });
  try {
    const table = db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_versions'").get();
    if (table === null || table === undefined) return 0;
    const row = db.query("SELECT MAX(version) AS version FROM schema_versions").get() as { version: number | null } | null;
    return row?.version ?? 0;
  } finally {
    db.close();
  }
}

let buildSchemaVersionCache: number | undefined;
/**
 * The schema version this build's store opener brings a store to. The opener's migrations are not exported, so it is read from a
 * fresh store the opener creates in a scratch directory, once per process.
 */
function buildSchemaVersion(): number {
  if (buildSchemaVersionCache === undefined) {
    const dir = mkdtempSync(join(tmpdir(), "horizon-schema-"));
    try {
      const probe = join(dir, "probe.sqlite");
      void openSqliteStore({ path: probe }).close();
      buildSchemaVersionCache = storedSchemaVersion(probe);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return buildSchemaVersionCache;
}

/**
 * Opens an existing desk database for reading while a desk may be writing it. It never creates the file. A store older than this build
 * is refused before anything is opened, because the opener would migrate it. Every write method is replaced by one that rejects, so a
 * read-only open cannot change the store even where the runtime tries to.
 *
 * The SQLite opener cannot open a file read-only (it always runs its migrations), so the schema check above is what keeps this open from
 * writing the file; the write guard covers the runtime's own writes.
 */
export function openReadOnlyStore(storePath: string): DurableStore {
  if (!existsSync(storePath)) fail(`no desk database at ${storePath} yet, so there is nothing to surface`);
  const stored = storedSchemaVersion(storePath);
  const built = buildSchemaVersion();
  if (stored < built) fail(`the desk's database is at schema version ${stored}, older than this build (${built}), so it cannot be surfaced read-only. Start the desk once to upgrade it, then surface again.`);
  const store = openSqliteStore({ path: storePath });
  return new Proxy(store, {
    get(target, property) {
      if (typeof property === "string" && WRITE_METHODS.has(property) && Reflect.has(target, property)) {
        return () => Promise.reject(new ReadOnlyStoreWrite(property));
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export function assertStoreBoundary(config: HorizonConfig, storePath: string): string {
  if (config.deployment_profile === "local_operator") {
    if (storePath.trim() === "" || storePath === ":memory:" || storePath.includes(":memory:")) {
      fail("local_operator forbids an in-memory runtime; a durable SQLite store is required");
    }
    if (storePath.startsWith("postgres")) {
      fail("local_operator supports the local SQLite store only");
    }
  }
  const absolute = resolve(storePath);
  mkdirSync(dirname(absolute), { recursive: true });
  return absolute;
}

export async function createHorizonRuntime(
  config: HorizonConfig,
  world: LoadedWorld,
  options: {
    readonly storePath?: string;
    readonly caller: Caller;
    /** Extra components; the application injects its typed-intent component here. */
    readonly components?: readonly Component[];
    /** Agent definitions; the application injects its intent-bound observation agent here. */
    readonly agents?: readonly AgentDefinition[];
    /**
     * The Context Kernel adapter the boot-registered capability binds, instead of building one
     * from `context_kernel.command`. This changes what the capability talks to, never whether it
     * is registered, so the capability stays the only path (REQ-STACK-010).
     */
    readonly contextAdapter?: ContextKernelAdapter;
    /**
     * The external authority (J02 IS3). With `mode: "sea-forge"`, Cognate's Governor sends every
     * capability invoke and consequential action to SEA-Forge as a CEP authority_request; Horizon only
     * carries the decision and never grants authority itself (AGENTS.md §9). Absent: governance is off.
     */
    readonly governance?: GovernanceOptions;
    /**
     * Outbox intents committed atomically with each run event (J02 IS6): the application asks for a
     * RealityTrace observation of each governed navigation commit. Absent: no observations.
     */
    readonly outboxFor?: (event: PendingEvent) => readonly OutboxIntent[];
    /** An already-open store the runtime uses instead of opening `storePath` itself (a read-only open passes a guarded one). */
    readonly store?: DurableStore;
  },
): Promise<HorizonRuntime> {
  const storePath = assertStoreBoundary(config, options.storePath ?? config.runtime_store);
  const runtime = await createRuntime({
    store: options.store === undefined ? storePath : { store: options.store },
    policy,
    actions,
    agents: options.agents ?? [healthAgent],
    // Retrieval is registered at boot whether or not a Context Kernel is configured: the capability
    // answers `absent` itself, so a route has one path and no configuration branch (REQ-STACK-010).
    components: [semanticWorldComponent(world), contextReferenceComponent(config.context_kernel, options.contextAdapter === undefined ? {} : { adapter: options.contextAdapter }), ...(options.components ?? [])],
    projections: [
      { projection: navigationContextProjection, public: true },
      { projection: operationalObjectsProjection, public: true },
    ],
    tickMs: 5,
    ...(options.governance ? { governance: options.governance } : {}),
    ...(options.outboxFor ? { outboxFor: options.outboxFor } : {}),
  });
  return { runtime, caller: options.caller, storePath };
}
