import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import type { AgentDefinition, Caller } from "@godspeedai/cognate-runtime-api";
import { createRuntime, type ActionPolicy, type GovernanceOptions, type PendingEvent, type Runtime } from "@godspeedai/cognate-runtime-bun";
import type { DurableStore, Json, OutboxIntent, OutboxItem, ProjectionCheckpoint, ProjectionSnapshot, StoredEvent, StoredRecord } from "@godspeedai/cognate-events";
import { buildListRecordsQuery, openSqliteStore } from "@godspeedai/cognate-store-sqlite";
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

/** Opens the file on a read-only connection, or refuses. A store that cannot be read that way is not surfaced: there is no writable fallback. */
function openReadOnlyConnection(storePath: string): Database {
  try {
    return new Database(storePath, { readonly: true });
  } catch (error) {
    return fail(`the desk's database at ${storePath} cannot be read read-only (${(error as Error).message}), so it cannot be surfaced. Surfacing never opens it for writing.`);
  }
}

/** The schema version a store records for its newest applied migration (0 when none is recorded). Reads through a read-only connection. */
function storedSchemaVersion(storePath: string): number {
  const db = openReadOnlyConnection(storePath);
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const EVENT_SELECT = "SELECT e.*, p.payload AS payload FROM events e LEFT JOIN payloads p ON p.event_id = e.event_id";

/** Row shapes as the SQLite store maps them (the store's own mappers are module-private, so they are mirrored here, read side only). */
function eventOf(row: Row): StoredEvent {
  const event: Row = {
    eventId: row.event_id,
    streamId: row.stream_id,
    streamSequence: row.stream_sequence,
    position: row.position,
    eventType: row.event_type,
    schemaVersion: row.schema_version,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    tenant: row.tenant,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    runId: row.run_id,
    scopeId: row.scope_id,
    payload: row.payload != null ? JSON.parse(row.payload as string) : null,
  };
  if (row.component_id != null) event.componentId = row.component_id;
  if (row.fiber_id != null) event.fiberId = row.fiber_id;
  if (row.semantic_ref != null) event.semanticRef = JSON.parse(row.semantic_ref as string);
  if (row.metadata != null) event.metadata = JSON.parse(row.metadata as string);
  if (row.erasure_reason != null) event.erasure = { reason: row.erasure_reason, erasedAt: row.erasure_at };
  return event as StoredEvent;
}

function recordOf(row: Row): StoredRecord {
  return { collection: row.collection, id: row.id, version: row.version, value: JSON.parse(row.value as string) };
}

function outboxOf(row: Row): OutboxItem {
  const item: OutboxItem = {
    id: row.id,
    topic: row.topic,
    payload: JSON.parse(row.payload as string),
    status: row.status,
    attempts: row.attempts,
    availableAt: row.claimed_until,
    lastError: row.last_error ?? null,
    receipt: row.receipt != null ? JSON.parse(row.receipt as string) : null,
    createdAt: row.created_at,
  };
  if (row.lease_owner != null) return { ...item, lease: { ownerId: row.lease_owner, generation: row.lease_generation, expiresAt: row.claimed_until } };
  return item;
}

function checkpointOf(row: Row): ProjectionCheckpoint {
  return {
    name: row.name,
    version: row.version,
    position: row.position,
    status: row.status,
    error: row.error_event_id != null ? { position: row.error_position, eventId: row.error_event_id, message: row.error_message } : null,
  };
}

/**
 * The store's read methods over a read-only connection. It has no write methods at all: the guard in openReadOnlyStore refuses each
 * write method by name, so nothing run against a read-only open can change the file.
 */
function readOnlyDurableStore(db: Database): DurableStore {
  const all = (sql: string, params: readonly unknown[] = []): Row[] => db.query(sql).all(...(params as [])) as Row[];
  const one = (sql: string, params: readonly unknown[] = []): Row | null => db.query(sql).get(...(params as [])) as Row | null;
  const reads = {
    async streamVersion(streamId: string): Promise<number> {
      return one("SELECT version FROM event_streams WHERE stream_id = ?", [streamId])?.version ?? 0;
    },
    async readStream(streamId: string, options?: { readonly afterSequence?: number; readonly limit?: number }): Promise<StoredEvent[]> {
      let sql = `${EVENT_SELECT} WHERE e.stream_id = ?`;
      const params: unknown[] = [streamId];
      if (options?.afterSequence != null) {
        sql += " AND e.stream_sequence > ?";
        params.push(options.afterSequence);
      }
      sql += " ORDER BY e.stream_sequence";
      if (options?.limit != null) {
        sql += " LIMIT ?";
        params.push(options.limit);
      }
      return all(sql, params).map(eventOf);
    },
    async readAll(options?: { readonly afterPosition?: number; readonly limit?: number }): Promise<StoredEvent[]> {
      let sql = `${EVENT_SELECT} WHERE 1 = 1`;
      const params: unknown[] = [];
      if (options?.afterPosition != null) {
        sql += " AND e.position > ?";
        params.push(options.afterPosition);
      }
      sql += " ORDER BY e.position";
      if (options?.limit != null) {
        sql += " LIMIT ?";
        params.push(options.limit);
      }
      return all(sql, params).map(eventOf);
    },
    async getEvent(eventId: string): Promise<StoredEvent | undefined> {
      const row = one(`${EVENT_SELECT} WHERE e.event_id = ?`, [eventId]);
      return row ? eventOf(row) : undefined;
    },
    /** Nothing commits through a read-only open, so no listener is ever called. */
    onCommitted: (): (() => void) => () => undefined,
    async getRecord(collection: string, id: string): Promise<StoredRecord | undefined> {
      const row = one("SELECT * FROM records WHERE collection = ? AND id = ?", [collection, id]);
      return row ? recordOf(row) : undefined;
    },
    async listRecords(collection: string, where?: { readonly [field: string]: string | number | boolean | null }): Promise<StoredRecord[]> {
      const query = buildListRecordsQuery(collection, where);
      return all(query.sql, query.params).map(recordOf);
    },
    async listOutbox(options?: { readonly topic?: string; readonly status?: string }): Promise<OutboxItem[]> {
      let sql = "SELECT * FROM outbox WHERE 1 = 1";
      const params: unknown[] = [];
      if (options?.topic != null) {
        sql += " AND topic = ?";
        params.push(options.topic);
      }
      if (options?.status != null) {
        sql += " AND status = ?";
        params.push(options.status);
      }
      sql += " ORDER BY rowid";
      return all(sql, params).map(outboxOf);
    },
    async getProjection(name: string): Promise<ProjectionCheckpoint | undefined> {
      const row = one("SELECT * FROM projection_checkpoints WHERE name = ?", [name]);
      return row ? checkpointOf(row) : undefined;
    },
    async readProjection(name: string, key: string): Promise<Json | undefined> {
      const row = one("SELECT value FROM projection_state WHERE name = ? AND key = ?", [name, key]) as { value: string } | null;
      return row ? (JSON.parse(row.value) as Json) : undefined;
    },
    async listProjection(name: string): Promise<{ readonly key: string; readonly value: Json }[]> {
      return all("SELECT key, value FROM projection_state WHERE name = ? ORDER BY key", [name]).map((row) => ({ key: row.key, value: JSON.parse(row.value) as Json }));
    },
    async readProjectionSnapshot(name: string): Promise<ProjectionSnapshot> {
      // One statement, one snapshot, as the store's own read does.
      const row = one(
        `SELECT
           (SELECT json_object('name', name, 'version', version, 'position', position, 'status', status,
                               'error_position', error_position, 'error_event_id', error_event_id, 'error_message', error_message)
            FROM projection_checkpoints WHERE name = ?1) AS checkpoint,
           (SELECT json_group_array(json_object('key', ordered.key, 'value', json(ordered.value)))
            FROM (SELECT key, value FROM projection_state WHERE name = ?1 ORDER BY key) AS ordered) AS rows`,
        [name],
      ) as Row;
      const checkpoint = row.checkpoint ? JSON.parse(row.checkpoint as string) : undefined;
      return {
        checkpoint: checkpoint
          ? { ...checkpoint, error: checkpoint.error_event_id != null ? { position: checkpoint.error_position, eventId: checkpoint.error_event_id, message: checkpoint.error_message } : null }
          : undefined,
        rows: (JSON.parse(row.rows as string) as { key: string; value: Json }[]).map((entry) => ({ key: entry.key, value: entry.value })),
      };
    },
    async getBlob(hash: string): Promise<Uint8Array | undefined> {
      const row = one("SELECT bytes FROM blobs WHERE hash = ?", [hash]) as { bytes: Uint8Array } | null;
      return row ? new Uint8Array(row.bytes) : undefined;
    },
    async close(): Promise<void> {
      db.close();
    },
  };
  return reads as unknown as DurableStore;
}

/**
 * Opens an existing desk database for reading while a desk may be writing it. It never creates the file, and it never opens the file
 * through the writable store opener: the file is read through a connection opened read-only, so its journal mode and its bytes are
 * left as they were. A store older than this build is refused, and so is one that cannot be read read-only; there is no writable
 * fallback. Every write method is replaced by one that rejects, so a read-only open cannot change the store even where the runtime
 * tries to.
 */
export function openReadOnlyStore(storePath: string): DurableStore {
  if (!existsSync(storePath)) fail(`no desk database at ${storePath} yet, so there is nothing to surface`);
  const stored = storedSchemaVersion(storePath);
  const built = buildSchemaVersion();
  if (stored < built) fail(`the desk's database is at schema version ${stored}, older than this build (${built}), so it cannot be surfaced read-only. Start the desk once to upgrade it, then surface again.`);
  const store = readOnlyDurableStore(openReadOnlyConnection(storePath));
  return new Proxy(store, {
    get(target, property) {
      if (typeof property === "string" && WRITE_METHODS.has(property)) {
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
