import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AgentDefinition, Caller } from "@godspeedai/cognate-runtime-api";
import { createRuntime, type ActionPolicy, type Runtime } from "@godspeedai/cognate-runtime-bun";
import type { Component, Policy } from "@godspeedai/cognate-kernel-api";
import type { HorizonConfig } from "../config/types.ts";
import type { LoadedWorld } from "../adapters/semantic.ts";
import { healthAgent } from "../agents/health.ts";
import { semanticWorldComponent } from "../capabilities/semantic.ts";
import { navigationContextProjection } from "../projections/navigation-context.ts";

export class RuntimeBoundaryError extends Error {
  override readonly name = "RuntimeBoundaryError";
}

function fail(message: string): never {
  throw new RuntimeBoundaryError(`RUNTIME: ${message}`);
}

/** Capabilities the structural skeleton resolves. Anything else is denied (spec §32). */
const READ_ONLY_CAPABILITIES = new Set(["horizon.semantics.world", "horizon.navigation.intent.commit"]);

const policy: Policy = {
  authorize(request) {
    if (READ_ONLY_CAPABILITIES.has(request.capability.id) && (request.actor.kind === "user" || request.actor.kind === "agent")) {
      return { allow: true, policyId: "horizon.local.read-only-semantics", reason: "read-only semantic projection or intent commit" };
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
  },
): Promise<HorizonRuntime> {
  const storePath = assertStoreBoundary(config, options.storePath ?? config.runtime_store);
  const runtime = await createRuntime({
    store: storePath,
    policy,
    actions,
    agents: options.agents ?? [healthAgent],
    components: [semanticWorldComponent(world), ...(options.components ?? [])],
    projections: [{ projection: navigationContextProjection, public: true }],
    tickMs: 5,
  });
  return { runtime, caller: options.caller, storePath };
}
