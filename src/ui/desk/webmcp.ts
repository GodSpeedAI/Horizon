// The one place the desk registers WebMCP tools. The page's standard tool surface is installed by
// the polyfill; this file only projects the descriptors from webmcp-tools.ts onto it.
import { initializeWebMCPPolyfill } from "@mcp-b/webmcp-polyfill";
import { deskTools, type DeskAgentInvoker } from "./webmcp-tools.ts";

interface ToolSpec {
  name: string;
  description: string;
  inputSchema: object;
  execute: (args: unknown) => Promise<unknown>;
}

interface ModelContextLike {
  registerTool(tool: ToolSpec, options: { signal: AbortSignal }): Promise<unknown> | unknown;
}

export interface DeskToolsHandle {
  stop(): void;
  /** Names of tools the page accepted. Fills in as each registration settles. */
  registered: string[];
  /** Names of tools the page refused, or every name when the surface is missing. */
  failed: string[];
}

export function startDeskTools(
  doc: Document,
  invoker: DeskAgentInvoker,
  init: () => void = initializeWebMCPPolyfill,
): DeskToolsHandle {
  const controller = new AbortController();
  const registered: string[] = [];
  const failed: string[] = [];
  const descriptors = deskTools(invoker);

  let context: ModelContextLike | undefined;
  try {
    init();
    context = (doc as unknown as { modelContext?: ModelContextLike }).modelContext;
  } catch {
    context = undefined;
  }

  if (!context) {
    for (const descriptor of descriptors) failed.push(descriptor.name);
    return { stop: () => controller.abort(), registered, failed };
  }

  const surface = context;
  for (const descriptor of descriptors) {
    const tool: ToolSpec = {
      name: descriptor.name,
      description: descriptor.description,
      inputSchema: descriptor.inputSchema,
      execute: (args) => descriptor.invoke(args),
    };
    const attempt = async (): Promise<void> => {
      try {
        await surface.registerTool(tool, { signal: controller.signal });
        registered.push(tool.name);
      } catch {
        failed.push(tool.name);
      }
    };
    void attempt();
  }

  return { stop: () => controller.abort(), registered, failed };
}
