/**
 * The parts catalogue, in plain words, for agents (stage 8, step 6). For each of the grammar's 15 blocks: when to use it, when not to,
 * and one example that passes the grammar. The grammar stays the single vocabulary: this file only describes it, and a test checks that
 * every example parses and that no block is missing or extra.
 */
import { BLOCK_TYPES, type BlockType } from "./grammar";

export interface CatalogueEntry {
  readonly use: string;
  readonly avoid: string;
  readonly example: Readonly<Record<string, unknown>>;
}

const prov = {
  source_kind: "agent_supplied",
  source_ref: "agent:assistant",
  attributed_to: { actor_ref: "agent:assistant", role: "agent", principal_ref: "actor:operator", agent_ref: "agent:assistant", on_behalf_of_ref: "actor:operator" },
  layout: "agent_composed",
} as const;
const boundProv = { ...prov, source_kind: "bound", source_ref: "horizon:inspect" } as const;
const base = (id: string, bound = false) => ({ id, provenance: bound ? boundProv : prov });

export const CATALOGUE: Readonly<Record<BlockType, CatalogueEntry>> = {
  callout: {
    use: "One short note the person should not miss: a warning, a result, a heads-up. Give it a tone.",
    avoid: "Long reports (use document) or anything that needs an answer (use ask).",
    example: { ...base("note_1"), type: "callout", tone: "warning", text: "Two checks are still running, so this result may change." },
  },
  metric: {
    use: "One number that matters, with its name and the thing it measures.",
    avoid: "Several numbers at once (use table or chart) or a number with no clear meaning.",
    example: { ...base("open_issues"), type: "metric", label: "Open issues", value: 7, unit: "issues", ref: "semantic:Case" },
  },
  table: {
    use: "Rows and columns of facts the person will scan or compare. Name where the data came from.",
    avoid: "A single value (metric) or more than 12 columns.",
    example: { ...base("status_table", true), type: "table", columns: [{ key: "step", label: "Step" }, { key: "state", label: "State" }], rows: [{ step: "Plan", state: "Done" }, { step: "Build", state: "Waiting" }], source: "horizon:inspect" },
  },
  tree: {
    use: "Things that sit inside other things: a plan with steps, a folder with parts.",
    avoid: "Links that are not parent and child (use graph).",
    example: { ...base("plan_tree", true), type: "tree", nodes: [{ ref: "semantic:Plan", label: "The plan", parent_ref: null }, { ref: "semantic:Step", label: "First step", parent_ref: "semantic:Plan" }], source: "horizon:inspect" },
  },
  timeline: {
    use: "What happened, in time order, each with a time.",
    avoid: "Facts with no time on them (use table).",
    example: { ...base("history", true), type: "timeline", entries: [{ at: "2026-11-05T09:00:00Z", label: "Work started", ref: "semantic:Case" }, { at: "2026-11-06T14:30:00Z", label: "First review", ref: "semantic:Case" }], source: "horizon:inspect" },
  },
  graph: {
    use: "How known things link to each other, when the links matter more than the order.",
    avoid: "A simple hierarchy (use tree). Every item must be a thing Horizon already knows; every link must join two listed items.",
    example: { ...base("links", true), type: "graph", nodes: [{ id: "semantic:Plan", label: "Plan", kind: "plan" }, { id: "semantic:Step", label: "Step", kind: "step" }], edges: [{ from: "semantic:Plan", to: "semantic:Step", relation: "has" }], source: "horizon:inspect" },
  },
  chart: {
    use: "A trend (line) or a size comparison (bar) across a few numbers, with a name for each series.",
    avoid: "Exact values the person must read (use table). At most 8 series.",
    example: { ...base("trend"), type: "chart", kind: "line", series: [{ label: "Checks passed", points: [3, 5, 4, 8] }], source: "agent:trend" },
  },
  compare: {
    use: "Two things side by side, one line for each way they differ.",
    avoid: "More than two things (use table).",
    example: { ...base("two_plans"), type: "compare", left: { ref: "semantic:Plan", label: "Plan A" }, right: { ref: "semantic:Step", label: "Plan B" }, dimensions: [{ label: "Cost", left: "Low", right: "High" }, { label: "Risk", left: "Medium", right: "Low" }] },
  },
  media: {
    use: "A picture or recording kept with the project, with short notes pinned on it.",
    avoid: "Anything from the internet. Only files kept with the project can be shown; a web address is never loaded.",
    example: { ...base("shot", true), type: "media", items: [{ label: "Home page after the change", src: "file:evidence/home.png" }], pins: [{ x: 0.5, y: 0.2, note: "The heading moved up" }] },
  },
  document: {
    use: "A longer text the person may open, with a title and a short excerpt.",
    avoid: "A one-line note (use callout).",
    example: { ...base("readme", true), type: "document", title: "Release notes", source: "file:specs/release-notes.md", excerpt: "This release changes how handoffs are previewed." },
  },
  entity: {
    use: "A pointer to one known thing, so the person can open it.",
    avoid: "Describing the thing at length (use document or table).",
    example: { ...base("the_case"), type: "entity", ref: "semantic:Case", label: "The onboarding case" },
  },
  preflight: {
    use: "Whether a next step can happen now, and if not, what stops it first.",
    avoid: "Offering a step as done. Say what stops it whenever it is not ready.",
    example: { ...base("can_approve", true), type: "preflight", operation: "horizon.decide.approve", availability: "blocked", first_blocker: "Two reviews are still open." },
  },
  progress: {
    use: "How far something has got, measured from a named source. You cannot set the number yourself.",
    avoid: "Reporting your own progress as fact.",
    example: { ...base("build_progress", true), type: "progress", label: "Checks passed", source: "horizon:inspect" },
  },
  ask: {
    use: "A question only the person can answer. Choose select (pick one), multiselect (pick several), confirm (yes or no) or text (one line). Say why you need it, what each option leads to, and what it settles. Then wait.",
    avoid: "Answering for the person, filling in an answer, or asking something you can find out yourself.",
    example: { ...base("which_way"), type: "ask", question: "Which plan should I follow?", why_needed: "Both plans are possible and the choice is yours.", input: "select", options: [{ option_id: "plan_a", label: "Plan A", consequence: "Faster, but riskier." }, { option_id: "plan_b", label: "Plan B", consequence: "Slower, but safer." }], resolves: "Choice of plan" },
  },
  form: {
    use: "Several answers at once, filled in by the person. It only fills in a preview; nothing is sent until the person presses Confirm.",
    avoid: "Defaults that answer for the person, or a form for one question (use ask).",
    example: { ...base("approval_form"), type: "form", fields: [{ name: "reason", label: "Why approve this?", kind: "longtext", required: true }, { name: "sure", label: "I have read the changes", kind: "confirm", required: true }], submit_operation: "horizon.decide.approve" },
  },
};

/** The rules every agent works by, in plain words. */
export function vocabulary(): string {
  const parts = BLOCK_TYPES.map((t) => `- ${t}: ${CATALOGUE[t].use} Avoid: ${CATALOGUE[t].avoid}`);
  return [
    `You build a panel from these ${BLOCK_TYPES.length} parts, and only these. Anything else cannot be shown.`,
    ...parts,
    "",
    "Rules:",
    "- Agents never answer. A question is for the person; you cannot fill in, guess or pre-select an answer.",
    "- Ask, then wait for the answer. Do not carry on as if it had been given.",
    "- When an answer arrives, say where it went with answer.route (for example the step it settled, or \"no action: <why>\"). Until you do, the answer shows as waiting for you.",
    "- Nothing sends without the person's Confirm. A form or a button only fills in a preview.",
    "- Data you write into a part yourself is marked \"from the agent\". Data read from a named source is not.",
    "- Text is shown as plain text. Do not use markup, web addresses or code.",
  ].join("\n");
}
