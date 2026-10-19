import type { Caller } from "@godspeedai/cognate-runtime-api";
import { loadWorld, type LoadedWorld } from "./adapters/semantic.ts";
import { researchHealth, type ResearchHealth } from "./adapters/research.ts";
import { loadConfig } from "./config/load.ts";
import type { LoadedConfig } from "./config/types.ts";
import { createHorizonRuntime, type HorizonRuntime } from "./runtime/create.ts";
import type { Server } from "bun";

type HttpServer = Server<unknown>;

export interface HorizonApplication {
  readonly loaded: LoadedConfig;
  readonly world: LoadedWorld;
  readonly runtime: HorizonRuntime;
  readonly caller: Caller;
  readonly research: ResearchHealth;
  startServer(port?: number): HttpServer;
  close(): Promise<void>;
}

export async function createApplication(options: { readonly storePath?: string } = {}): Promise<HorizonApplication> {
  const loaded = loadConfig();
  const world = loadWorld(loaded.config.world_ref);
  const research = await researchHealth(loaded.config.research_command);
  const caller: Caller = { actor: loaded.operator.principal, tenant: loaded.operator.tenant };
  const runtime = await createHorizonRuntime(loaded.config, world, {
    caller,
    ...(options.storePath ? { storePath: options.storePath } : {}),
  });

  return {
    loaded,
    world,
    runtime,
    caller,
    research,
    startServer(port = loaded.config.port): HttpServer {
      return Bun.serve({
        hostname: loaded.config.bind_host,
        port,
        async fetch(request) {
          const url = new URL(request.url);
          if (url.pathname === "/health") {
            const semantic = await runtime.runtime.service.invoke(caller, {
              capability: "horizon.semantics.world",
              input: {},
            });
            return Response.json({
              status: "ok",
              profile: loaded.config.deployment_profile,
              operator_ref: loaded.operator.principal.id,
              world: semantic,
              research,
              transports: loaded.config.transports,
            });
          }
          if (url.pathname === "/") {
            return new Response("Horizon structural skeleton\n", {
              headers: { "content-type": "text/plain; charset=utf-8" },
            });
          }
          return new Response("not found\n", { status: 404 });
        },
      });
    },
    async close() {
      await runtime.runtime.close();
    },
  };
}
