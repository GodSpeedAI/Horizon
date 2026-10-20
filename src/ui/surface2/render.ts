/**
 * The three transports over one projection (REQ-UI-008).
 *
 * `projectSurface` produces one `horizon.gui-view/1` document. These renderers consume
 * that document and nothing else, so a discrepancy between what a GUI shows, what a CLI
 * prints and what an MCP client receives is a defect in a renderer, never a difference in
 * what Horizon decided (PE-04, PE-06).
 *
 * None of them can execute anything. `renderText` and `renderHtml` walk the view; neither
 * evaluates a string from it. `renderHtml` escapes every interpolated value, so text that
 * arrived through a source cannot become markup (NE-03).
 */
import { GUI_VIEW_SCHEMA, type GuiView, type ProjectedNode } from "./project";

/**
 * Who to print for a node, without inventing an actor.
 *
 * An agent is rendered as `agent:<ref> acting for <human>` — the delegation is part of the
 * label, not a footnote, because a reader who sees only `agent` cannot tell whose authority
 * the work was done under (REQ-UX-006). A human or system node prints its role unchanged.
 */
function actorLabel(node: ProjectedNode): string {
  const attribution = node.attributed_to;
  if (attribution.role === "agent" && attribution.on_behalf_of_ref !== undefined) {
    return `agent:${attribution.agent_ref ?? attribution.actor_ref} acting for ${attribution.on_behalf_of_ref}`;
  }
  return attribution.role;
}


/** Deterministic CLI text. Stable byte-for-byte for a given view. */
export function renderText(view: GuiView): string {
  const lines: string[] = [];
  lines.push(`${view.title} [${view.surface_id}] role=${view.role} intent=${view.intent} responsibility=${view.responsibility}`);
  lines.push(`focus=${view.focus_ref}${view.world_ref === undefined ? "" : ` world=${view.world_ref}`}`);
  for (const node of view.nodes) {
    const value = node.text === undefined ? "" : ` = ${node.text}`;
    lines.push(
      `- ${node.node_id} (${node.source_kind}/${node.layout}/${actorLabel(node)})${value}`,
    );
    for (const binding of node.bindings) {
      const state = binding.status === "bound" ? `bound:${binding.observation ?? "unknown"}` : `${binding.status}:${binding.reason ?? binding.awaiting ?? "unknown"}`;
      const mark = binding.agent_supplied ? " agent" : "";
      lines.push(`    source ${binding.expression} -> ${state}${mark}`);
    }
  }
  for (const action of view.actions) {
    lines.push(`* ${action.action_id} ${action.operation} (${action.posture}${action.consequential ? ", consequential" : ""})`);
  }
  lines.push(`unresolved=${view.unresolved}`);
  return `${lines.join("\n")}\n`;
}

const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/**
 * Renderer-neutral HTML. `data-*` attributes carry block id and source kind so the browser
 * shell binds intent to ids, never to text; no inline handler, script or style is emitted.
 */
export function renderHtml(view: GuiView): string {
  const body: string[] = [];
  body.push(`<header data-surface="${escapeHtml(view.surface_id)}">`);
  body.push(`<h1>${escapeHtml(view.title)}</h1>`);
  body.push(
    `<p data-focus="${escapeHtml(view.focus_ref)}">role=${escapeHtml(view.role)} intent=${escapeHtml(view.intent)} responsibility=${escapeHtml(view.responsibility)}</p>`,
  );
  body.push("</header>");
  body.push("<main>");
  for (const node of view.nodes) {
    body.push(`<section data-block="${escapeHtml(node.node_id)}" data-source-kind="${escapeHtml(node.source_kind)}" data-layout="${escapeHtml(node.layout)}" data-actor-role="${escapeHtml(node.attributed_to.role)}"${node.attributed_to.agent_ref === undefined ? "" : ` data-agent-ref="${escapeHtml(node.attributed_to.agent_ref)}"`}${node.attributed_to.on_behalf_of_ref === undefined ? "" : ` data-acting-for="${escapeHtml(node.attributed_to.on_behalf_of_ref)}"`}>`);
    body.push(`<h2>${escapeHtml(node.label)}</h2>`);
    if (node.text !== undefined) body.push(`<p>${escapeHtml(node.text)}</p>`);
    // The actor is text the reader sees, not only an attribute the shell might ignore.
    body.push(`<p data-actor>${escapeHtml(actorLabel(node))}</p>`);
    body.push("<ul>");
    for (const binding of node.bindings) {
      body.push(
        `<li data-source="${escapeHtml(binding.expression)}" data-status="${escapeHtml(binding.status)}">${escapeHtml(binding.expression)}: ${escapeHtml(binding.status === "bound" ? binding.observation ?? "unknown" : binding.reason ?? binding.awaiting ?? "unknown")}</li>`,
      );
    }
    body.push("</ul>");
    body.push("</section>");
  }
  body.push("</main>");
  if (view.actions.length > 0) {
    body.push("<nav>");
    for (const action of view.actions) {
      body.push(
        `<a data-operation="${escapeHtml(action.operation)}" data-posture="${escapeHtml(action.posture)}">${escapeHtml(action.label)}</a>`,
      );
    }
    body.push("</nav>");
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(view.title)}</title></head><body>${body.join("")}</body></html>`;
}

export interface McpTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: { readonly type: "object"; readonly properties: Record<string, unknown>; readonly required: readonly string[] };
}

/**
 * The MCP operation surface is *derived* from the same source the grammar validates
 * against, so a tool the server advertises and an operation the schema accepts cannot
 * diverge. One tool renders the projection; one tool per operation invokes.
 */
export function mcpTools(operations: readonly string[], consequential: (operation: string) => boolean): readonly McpTool[] {
  const tools: McpTool[] = [
    {
      name: "horizon.view",
      description: `Read the ${GUI_VIEW_SCHEMA} projection for a surface.`,
      inputSchema: {
        type: "object",
        properties: { role: { type: "string", enum: ["agent", "human", "system"] } },
        required: ["role"],
      },
    },
  ];
  for (const operation of operations) {
    tools.push({
      name: operation.replaceAll(".", "_"),
      description: consequential(operation)
        ? `${operation} — consequential; requires a human decision and is invoked through the normal path.`
        : `${operation} — read-only observation.`,
      inputSchema: {
        type: "object",
        properties: { intent_id: { type: "string" }, frame_id: { type: "string" } },
        required: ["frame_id"],
      },
    });
  }
  return tools;
}

/** The node ids a consumer may address, in projection order. */
export function addressableNodes(view: GuiView): readonly ProjectedNode[] {
  return view.nodes;
}
