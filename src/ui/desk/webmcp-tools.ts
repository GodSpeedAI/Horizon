// The desk's WebMCP tool descriptors. Each descriptor checks its input, then calls the invoker,
// which is the same client path the desk's own buttons use. Nothing here sends, confirms or
// settles anything: the propose tools only place a preview or suggested words in front of the person.
// Agents propose, people decide.

export interface DeskAgentInvoker {
  state(): Promise<unknown>;
  find(q: string): Promise<unknown>;
  inspect(rowId: string): Promise<unknown>;
  proposeHandoff(words: string, caseId?: string): Promise<unknown>;
  proposeNote(words: string): Promise<unknown>;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: object;
  invoke(input: unknown): Promise<{ content: { type: "text"; text: string }[] }>;
}

export const INSPECT_WITHHELD = "What was decided, recorded and observed is not shown to agents. The person can open this row on the desk.";

/** What desk_inspect returns for a row: the row as the desk served it to an agent, and nothing nested under it. */
export function inspectForAgent(row: object): { readonly row: object; readonly details: string } {
  return { row, details: INSPECT_WITHHELD };
}

// Agents propose, people decide. No offered tool may carry one of these words in its name.
export const NEVER_OFFERED = ["confirm", "send", "mark_done", "hold", "approve", "answer", "settle", "discard"];

const QUERY_MAX = 200;
const ID_MAX = 200;
const HANDOFF_WORDS_MAX = 2000;
const NOTE_WORDS_MAX = 8000;

const NOTHING_SENT = "Nothing is sent until the person confirms it.";

type Content = { content: { type: "text"; text: string }[] };
type Checked = { ok: true; value: string } | { ok: false; message: string };

function textResult(text: string): Content {
  return { content: [{ type: "text", text }] };
}

function errorResult(message: string): Content {
  return textResult(`Error: ${message}`);
}

function asRecord(input: unknown): Record<string, unknown> | undefined {
  return typeof input === "object" && input !== null && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : undefined;
}

function readText(record: Record<string, unknown>, key: string, max: number): Checked {
  const value = record[key];
  if (value === undefined) return { ok: false, message: `${key} is required.` };
  if (typeof value !== "string") return { ok: false, message: `${key} must be text.` };
  if (value.length < 1 || value.length > max) {
    return { ok: false, message: `${key} must be 1 to ${max} characters.` };
  }
  return { ok: true, value };
}

// Runs the invoker and turns its result or failure into a text result. Raw error messages and
// stack traces never reach the agent.
async function run(call: () => Promise<unknown>): Promise<Content> {
  try {
    return textResult(JSON.stringify((await call()) ?? null, null, 2));
  } catch {
    return errorResult("the desk could not complete this request.");
  }
}

const NOT_AN_OBJECT = "input must be an object with the fields this tool lists.";

export function deskTools(invoker: DeskAgentInvoker): ToolDescriptor[] {
  return [
    {
      name: "desk_state",
      description:
        "Read today's notes, the open case, the steps waiting on the person, and whether each service is connected. Read only; takes no input.",
      inputSchema: { type: "object", properties: {} },
      async invoke(input) {
        if (input !== undefined && asRecord(input) === undefined) return errorResult(NOT_AN_OBJECT);
        return run(() => invoker.state());
      },
    },
    {
      name: "desk_find",
      description:
        "Search the desk the same way the Find box does. Read only. Pass the words to look for as q.",
      inputSchema: {
        type: "object",
        properties: {
          q: { type: "string", minLength: 1, maxLength: QUERY_MAX, description: "What to find" },
        },
        required: ["q"],
      },
      async invoke(input) {
        const record = asRecord(input);
        if (!record) return errorResult(NOT_AN_OBJECT);
        const q = readText(record, "q", QUERY_MAX);
        if (!q.ok) return errorResult(q.message);
        return run(() => invoker.find(q.value));
      },
    },
    {
      name: "desk_inspect",
      description:
        "Read one row: what was decided, what was recorded and what was observed. Read only. Pass the row's id as row_id.",
      inputSchema: {
        type: "object",
        properties: {
          row_id: { type: "string", minLength: 1, maxLength: ID_MAX, description: "The row to read" },
        },
        required: ["row_id"],
      },
      async invoke(input) {
        const record = asRecord(input);
        if (!record) return errorResult(NOT_AN_OBJECT);
        const rowId = readText(record, "row_id", ID_MAX);
        if (!rowId.ok) return errorResult(rowId.message);
        return run(() => invoker.inspect(rowId.value));
      },
    },
    {
      name: "desk_propose_handoff",
      description:
        `Propose a hand-off as a preview row for the person to review. Pass the words for the hand-off as words, and optionally case_id. ${NOTHING_SENT}`,
      inputSchema: {
        type: "object",
        properties: {
          words: { type: "string", minLength: 1, maxLength: HANDOFF_WORDS_MAX, description: "The hand-off in words" },
          case_id: { type: "string", maxLength: ID_MAX, description: "The case the hand-off belongs to" },
        },
        required: ["words"],
      },
      async invoke(input) {
        const record = asRecord(input);
        if (!record) return errorResult(NOT_AN_OBJECT);
        const words = readText(record, "words", HANDOFF_WORDS_MAX);
        if (!words.ok) return errorResult(words.message);
        if (record.case_id !== undefined) {
          const caseId = readText(record, "case_id", ID_MAX);
          if (!caseId.ok) return errorResult(caseId.message);
          return run(() => invoker.proposeHandoff(words.value, caseId.value));
        }
        return run(() => invoker.proposeHandoff(words.value));
      },
    },
    {
      name: "desk_propose_note",
      description:
        `Put suggested words in the composer so the person can save or discard them. Pass the words as words. ${NOTHING_SENT}`,
      inputSchema: {
        type: "object",
        properties: {
          words: { type: "string", minLength: 1, maxLength: NOTE_WORDS_MAX, description: "The suggested words" },
        },
        required: ["words"],
      },
      async invoke(input) {
        const record = asRecord(input);
        if (!record) return errorResult(NOT_AN_OBJECT);
        const words = readText(record, "words", NOTE_WORDS_MAX);
        if (!words.ok) return errorResult(words.message);
        return run(() => invoker.proposeNote(words.value));
      },
    },
  ];
}
