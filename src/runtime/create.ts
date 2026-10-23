import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AgentDefinition, Caller } from "@godspeedai/cognate-runtime-api";
import { createRuntime, type ActionPolicy, type GovernanceOptions, type PendingEvent, type Runtime } from "@godspeedai/cognate-runtime-bun";
import type { OutboxIntent } from "@godspeedai/cognate-events";
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
  },
): Promise<HorizonRuntime> {
  const storePath = assertStoreBoundary(config, options.storePath ?? config.runtime_store);
  const runtime = await createRuntime({
    store: storePath,
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
