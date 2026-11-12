#!/usr/bin/env bun
/**
 * The parameter-schema binding check.
 *
 * The frozen parameter schemas are the contract's statement of what an operation's parameters
 * are. A schema that names fields the handler does not read describes an effect that cannot
 * happen; a schema that omits a field the handler reads cannot cover the effect it does. Both
 * are the same defect: the confirmation digest would be made from a description of the operation
 * other than the one that runs.
 *
 * This check reads the live source and the frozen contract and compares them. It covers every
 * row the catalog marks `binding: verified`: the rows a route or a code op in this repository
 * actually performs. A row nobody performs is not checked here — it has no handler to disagree
 * with — but a row that is performed and is not listed is a defect in this table, so the check
 * fails rather than skipping it.
 *
 * The table below says where each handler reads its parameters from. It does not restate the
 * fields: those are read from the source, and the schema is read from the frozen contract, so a
 * change in either side is caught.
 *
 * Fields the protocol owns rather than the operation: the action selector that chooses the
 * operation (`op`, `tool`) and the request id that makes a retry safe (`request_id`). They are
 * excluded from the comparison and named here so the exclusion is visible.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadOperationManifest } from "../src/contracts/identity/manifest.ts";

const ROOT = path.resolve(import.meta.dir, "..");
const PROTOCOL_FIELDS = new Set(["op", "tool", "request_id"]);

interface Extraction {
  /** The file the handler lives in. */
  readonly file: string;
  /** How the handler is found in that file. */
  readonly kind: "block_after" | "function" | "agent_tool" | "statement" | "zod_fields";
  /** The text that identifies the handler. */
  readonly marker: string;
  /** The variable prefixes whose properties are the handler's parameters. */
  readonly variables?: readonly string[];
  /** The variables that hold the form or query values the handler reads. */
  readonly values?: readonly string[];
  /**
   * The identifiers the handler reads that are not request fields, and the schema field each
   * one is. The desk's settlement reads its intent and its phase out of the card the server
   * resolved, so the two values are named here rather than looked for in the body.
   */
  readonly derived?: Readonly<Record<string, string>>;
}

interface Binding {
  /** The catalog row the binding is about. */
  readonly operation: string;
  /** The code operation that selects it, when the row's schema is discriminated by one. */
  readonly codeOp?: string;
  /** Where the handler reads its parameters. */
  readonly reads: readonly Extraction[];
}

const APP = "src/app.ts";
const PANELS = "src/ui/desk/panels-model.ts";
const NOTE = "src/domain/note.ts";
const REMOTE = "src/remote/server.ts";

/**
 * The desk's decision route: one body, several effects.
 *
 * The card kind is resolved by the server from the card the body names, so every decision the
 * desk takes arrives in the same body and the handler reads the same fields for each of them.
 * The per-effect schemas differ in the choice they allow and in whether a reason is required,
 * not in the shape of the request.
 */
const DESK_DECIDE: Extraction = {
  file: APP,
  kind: "function",
  marker: "async function deskDecideCore",
  variables: ["body"],
};

/**
 * The desk's settlement branch.
 *
 * The settlement operation's parameters are the intent it settles and the half it settles. The
 * desk's decision route derives both from the card the server resolved — the card's own id
 * carries the intent and the phase — so the request body carries the card, not the settlement's
 * two values. The extraction therefore names the identifiers the handler reads rather than the
 * body's fields: `intentId` is the intent the schema calls `intent_id`, and `phase` is the half.
 *
 * The phone's own settlement rows are refused by containment and are catalogued as candidates:
 * the route resolves them and refuses them by their class, and no handler performs them, so no
 * parameter binding is claimed for them.
 */
const DESK_SETTLE: Extraction = {
  file: APP,
  kind: "function",
  marker: "async function deskDecideCore",
  derived: { intentId: "intent_id", phase: "phase" },
};
/**
 * The phone's own command branches: the case it opens and the move it commits. Each reads the
 * fields its own row's schema names.
 */
const REMOTE_OPEN_CASE: Extraction = {
  file: REMOTE,
  kind: "block_after",
  marker: 'if (operation === "device.case.open") {',
  variables: ["body"],
};
const REMOTE_COMMIT: Extraction = {
  file: REMOTE,
  kind: "block_after",
  marker: 'if (operation === "device.surface.intent.commit") {',
  variables: ["body"],
};

const BINDINGS: readonly Binding[] = [
  // The governed rows the person's desk performs.
  { operation: "human.answer", reads: [{ file: APP, kind: "block_after", marker: 'body.op === "human.answer"', variables: ["body"] }] },
  { operation: "ask.reassign", reads: [{ file: APP, kind: "block_after", marker: 'body.op === "human.reassign_owner"', variables: ["body"] }] },
  { operation: "ask.withdraw", codeOp: "human.stop_waiting", reads: [{ file: APP, kind: "block_after", marker: 'body.op === "human.stop_waiting"', variables: ["body"] }] },
  { operation: "ask.withdraw", codeOp: "ask.withdraw", reads: [{ file: PANELS, kind: "agent_tool", marker: "ask.withdraw" }] },
  { operation: "owner.pin", reads: [{ file: APP, kind: "block_after", marker: 'body.op === "human.pin"', variables: ["body"] }] },
  { operation: "workspace.label", reads: [{ file: APP, kind: "block_after", marker: 'url.pathname === "/workspace/label" && request.method === "POST"', values: ["form"] }] },
  { operation: "handoff.send", reads: [{ file: APP, kind: "function", marker: "async function deskHandoffCore", variables: ["body"] }] },
  { operation: "lesson.decide", reads: [{ file: APP, kind: "function", marker: "async function deskDecideCore", variables: ["body"] }] },
  { operation: "remote.start", reads: [{ file: APP, kind: "block_after", marker: 'url.pathname === "/workspace/remote/start" && request.method === "POST"' }] },
  { operation: "remote.refresh", reads: [{ file: APP, kind: "block_after", marker: 'url.pathname === "/workspace/remote/refresh" && request.method === "POST"' }] },
  { operation: "remote.stop", reads: [{ file: APP, kind: "block_after", marker: 'url.pathname === "/workspace/remote/stop" && request.method === "POST"' }] },
  {
    operation: "workspace.export",
    reads: [
      { file: APP, kind: "block_after", marker: 'url.pathname === "/workspace/export" && request.method === "POST"', values: ["fields"] },
      { file: APP, kind: "function", marker: "async function compareData", values: ["params"] },
    ],
  },
  // The governed rows the agent door performs.
  { operation: "ask.route", reads: [{ file: PANELS, kind: "agent_tool", marker: "answer.route" }] },
  // The rows the agent door performs that carry the caller's identity.
  { operation: "agent.surface.publish", reads: [{ file: PANELS, kind: "agent_tool", marker: "show_surface" }] },
  { operation: "agent.surface.arrange", reads: [{ file: PANELS, kind: "agent_tool", marker: "arrange" }] },
  { operation: "agent.surface.annotate", reads: [{ file: PANELS, kind: "agent_tool", marker: "annotate" }] },
  { operation: "agent.question.ask", reads: [{ file: PANELS, kind: "agent_tool", marker: "ask_human" }] },
  { operation: "agent.response.read", reads: [{ file: PANELS, kind: "agent_tool", marker: "read_responses" }] },
  // The desk's own panel operations.
  { operation: "human.panel.open", reads: [{ file: APP, kind: "statement", marker: 'body.op === "human.open" && typeof body.template === "string"', variables: ["body"] }] },
  { operation: "human.panel.close", reads: [{ file: APP, kind: "block_after", marker: 'body.op === "human.close"', variables: ["body"] }] },
  // The find: one route, a read and a recorded write.
  { operation: "horizon.search.read", reads: [{ file: APP, kind: "function", marker: "async function deskSearch", values: ["params"] }] },
  { operation: "horizon.search.record", reads: [{ file: APP, kind: "block_after", marker: 'url.pathname === "/desk/search" && request.method === "POST"', variables: ["body"] }] },
  // The reads that take no parameter at all: the liveness probe, the economics read and the
  // remote status read. Their schemas say so, and a handler that grew a parameter would show
  // up here as a field the schema does not name.
  { operation: "horizon.health", reads: [{ file: APP, kind: "block_after", marker: 'url.pathname === "/health"' }] },
  { operation: "horizon.economics.read", reads: [{ file: APP, kind: "block_after", marker: 'url.pathname === "/workspace/economics" && request.method === "GET"' }] },
  { operation: "horizon.remote.status", reads: [{ file: APP, kind: "block_after", marker: 'url.pathname === "/workspace/remote/status" && request.method === "GET"' }] },
  // The two intent commits: one names the operation it commits, the other names the transport
  // and the action the caller activated.
  {
    operation: "horizon.navigation.intent.commit",
    reads: [{ file: APP, kind: "block_after", marker: 'url.pathname === "/intent" && request.method === "POST"', variables: ["record"] }],
  },
  {
    operation: "horizon.surface.intent.commit",
    reads: [
      { file: APP, kind: "block_after", marker: 'url.pathname === "/surface/intent" && request.method === "POST"', variables: ["record"] },
      { file: APP, kind: "function", marker: "async function commitSurfaceIntent", variables: ["submission"] },
    ],
  },
  // The desk's own writes.
  { operation: "horizon.note.save", reads: [{ file: NOTE, kind: "zod_fields", marker: "export const NoteInput = z" }] },
  { operation: "horizon.draft.save", reads: [{ file: APP, kind: "block_after", marker: 'url.pathname === "/desk/draft" && request.method === "POST"', variables: ["parsed"] }] },
  { operation: "horizon.conversation.discard", reads: [{ file: APP, kind: "block_after", marker: 'url.pathname === "/desk/conversation/discard" && request.method === "POST"', variables: ["asked"] }] },
  { operation: "horizon.case.open", reads: [{ file: APP, kind: "block_after", marker: 'url.pathname === "/workspace/case" && request.method === "POST"', values: ["form"] }] },
  { operation: "horizon.lesson.propose", reads: [{ file: APP, kind: "function", marker: "async function deskProposeLesson", variables: ["body"] }] },
  { operation: "horizon.onboarding.skip", reads: [{ file: APP, kind: "block_after", marker: 'url.pathname === "/workspace/onboarding/skip" && request.method === "POST"' }] },
  { operation: "horizon.onboarding.resume", reads: [{ file: APP, kind: "block_after", marker: 'url.pathname === "/workspace/onboarding/resume" && request.method === "POST"' }] },
  { operation: "horizon.workspace.presenting", reads: [{ file: APP, kind: "block_after", marker: 'url.pathname === "/workspace/presenting" && request.method === "POST"', values: ["form"] }] },
  // The desk's decision route: one body, and the catalog says which effect each pair performs.
  { operation: "decision.hold", reads: [DESK_DECIDE] },
  { operation: "decision.release", reads: [DESK_DECIDE] },
  { operation: "approval.approve", reads: [DESK_DECIDE] },
  { operation: "approval.reject", reads: [DESK_DECIDE] },
  { operation: "case.task.decide", reads: [DESK_DECIDE] },
  { operation: "case.task.complete", reads: [DESK_DECIDE] },
  // The settlement halves. The desk's card carries the intent and the phase inside the card the
  // server resolved, so the desk never reads them from the request; the phone's own settlement
  // rows are refused by containment and are catalogued as candidates.
  { operation: "horizon.settlement.observe", reads: [DESK_SETTLE] },
  { operation: "horizon.settlement.rule", reads: [DESK_SETTLE] },
  // The phone's two rows it really performs: the case it opens and the move it commits.
  { operation: "device.case.open", reads: [REMOTE_OPEN_CASE] },
  { operation: "device.surface.intent.commit", reads: [REMOTE_COMMIT] },
  // The probe's detail is its own read, and it is the only route that reports the deployment.
  { operation: "horizon.diagnostics.read", reads: [{ file: APP, kind: "block_after", marker: 'url.pathname === "/diagnostics"' }] },
  // The phone's own routes: the transport's probe, the two signed-in reads, the pairing and
  // sign-in ceremonies, the sign-out, and the device enrollment.
  { operation: "remote.health", reads: [{ file: REMOTE, kind: "statement", marker: 'path === "/m/health"' }] },
  { operation: "remote.state.read", reads: [{ file: REMOTE, kind: "statement", marker: 'path === "/m/api/state"' }] },
  { operation: "remote.events.read", reads: [{ file: REMOTE, kind: "statement", marker: 'path === "/m/api/events"' }] },
  { operation: "remote.pair.redeem", reads: [{ file: REMOTE, kind: "block_after", marker: 'path === "/m/api/pair/redeem"', variables: ["body"] }] },
  { operation: "remote.session.challenge", reads: [{ file: REMOTE, kind: "block_after", marker: 'path === "/m/api/auth/options"' }] },
  { operation: "remote.session.authenticate", reads: [{ file: REMOTE, kind: "block_after", marker: 'path === "/m/api/auth/finish"', variables: ["body"] }] },
  { operation: "remote.session.logout", reads: [{ file: REMOTE, kind: "statement", marker: 'path === "/m/api/signout"' }] },
  { operation: "device.pair", reads: [{ file: REMOTE, kind: "block_after", marker: 'path === "/m/api/pair/finish"', variables: ["body"] }] },
  // The session rows: pairing proves possession of a code, and logging out names no other
  { operation: "session.logout", reads: [{ file: APP, kind: "block_after", marker: 'url.pathname === "/desk/pair/logout" && request.method === "POST"' }] },
  // session — the cookie the caller presents is the session that ends.
  { operation: "session.pair", reads: [{ file: APP, kind: "function", marker: "async function pairDesk", variables: ["body"] }] },
  // The start dispatcher: the caller's own request names the case and the steps it previewed,
  // and the plan is resolved by the handler rather than by the caller.
  { operation: "run.start", codeOp: "human_session", reads: [{ file: APP, kind: "function", marker: "async function deskStart", variables: ["body"] }] },
  // The projection reads. A route that only projects the world still performs the read it
  // projects, so the read is bound to the row that owns it and the row's schema says exactly
  // what the handler reads (R4-09).
  { operation: "horizon.workspace.read", reads: [
    { file: APP, kind: "block_after", marker: 'url.pathname === "/workspace.json"', values: ["url.searchParams"] },
    { file: APP, kind: "block_after", marker: 'url.pathname === "/desk/state.json"', values: ["url.searchParams"] },
  ] },
  { operation: "horizon.navigation.inspect", reads: [{ file: APP, kind: "block_after", marker: 'url.pathname === "/frame"' }] },
  { operation: "horizon.inspect.focus", reads: [{ file: APP, kind: "block_after", marker: 'url.pathname === "/workspace/inspect"', values: ["url.searchParams"] }] },
  { operation: "horizon.inspect.neighborhood", reads: [{ file: APP, kind: "block_after", marker: 'url.pathname === "/workspace/inspect"', values: ["url.searchParams"] }] },
  { operation: "horizon.compare.read", reads: [
    { file: APP, kind: "block_after", marker: 'url.pathname === "/workspace/compare"', values: ["url.searchParams"] },
    { file: APP, kind: "function", marker: "async function compareData", values: ["params"] },
  ] },
  { operation: "horizon.work.read", reads: [{ file: APP, kind: "function", marker: "async function compareData", values: ["params"] }] },
  { operation: "horizon.remote.events.read", reads: [{ file: APP, kind: "block_after", marker: 'url.pathname === "/workspace/remote/events"' }] },
  { operation: "horizon.decide.read", reads: [{ file: APP, kind: "block_after", marker: 'url.pathname === "/desk/decide.json"' }] },
  { operation: "horizon.conversation.read", reads: [{ file: APP, kind: "block_after", marker: 'url.pathname === "/desk/conversation"' }] },
  { operation: "horizon.draft.read", reads: [{ file: APP, kind: "block_after", marker: 'url.pathname === "/desk/draft"' }] },
  { operation: "horizon.lesson.read", reads: [{ file: APP, kind: "statement", marker: 'url.pathname === "/desk/lessons.json"' }] },
  { operation: "session.read", reads: [{ file: APP, kind: "statement", marker: 'url.pathname === "/desk/session"' }] },
  { operation: "horizon.surface.read", reads: [{ file: APP, kind: "block_after", marker: 'url.pathname === "/surface"', values: ["url.searchParams"] }] },
];

/**
 * The block that starts at the marker, brace-matched. The block opens at the last brace on the
 * marker's line, so a signature whose return type carries braces still matches its own body.
 */
function blockAfter(source: string, marker: string): string | null {
  const at = source.indexOf(marker);
  if (at === -1) return null;
  const lineEnd = source.indexOf("\n", at);
  const line = source.slice(at, lineEnd === -1 ? source.length : lineEnd);
  const brace = line.lastIndexOf("{");
  const start = brace === -1 ? at : at + brace;
  let depth = 0;
  let started = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") {
      depth += 1;
      started = true;
    } else if (character === "}") {
      depth -= 1;
      if (started && depth <= 0) return source.slice(start, index + 1);
    }
  }
  return null;
}

/** The fields of one `AgentOp` union member: the top-level properties beside its tool. */
function agentToolFields(source: string, tool: string): Set<string> | null {
  const unionAt = source.indexOf("export type AgentOp =");
  if (unionAt === -1) return null;
  const members = source.slice(unionAt);
  const marker = `readonly tool: "${tool}"`;
  const at = members.indexOf(marker);
  if (at === -1) return null;
  const braceAt = members.lastIndexOf("{", at);
  let depth = 0;
  let end = -1;
  for (let index = braceAt; index < members.length; index += 1) {
    if (members[index] === "{") depth += 1;
    else if (members[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }
  if (end === -1) return null;
  const member = members.slice(braceAt, end + 1);
  const fields = new Set<string>();
  // The member's own properties, at its top level only: a nested object's fields belong to the
  // nested object, and the schema names it as one field.
  let level = 0;
  for (const match of member.matchAll(/([{}])|readonly ([A-Za-z_][A-Za-z0-9_]*)\??:/g)) {
    if (match[1] === "{") level += 1;
    else if (match[1] === "}") level -= 1;
    else if (level === 1 && match[2] !== undefined && match[2] !== "tool") fields.add(match[2]);
  }
  return fields;
}

/**
 * The body of a function, found from its name.
 *
 * The body does not always open on the line that names the function: a signature whose return
 * type is an object union opens its body several lines later. The body brace is therefore the
 * first brace that appears after the parameter list closes and outside any generic argument,
 * so a brace inside a return type is never mistaken for the body.
 */
function functionBody(source: string, marker: string): string | null {
  const at = source.indexOf(marker);
  if (at === -1) return null;
  let paren = 0;
  let closed = -1;
  for (let index = at; index < source.length; index += 1) {
    const character = source[index];
    if (character === "(") paren += 1;
    else if (character === ")") {
      paren -= 1;
      if (paren === 0) {
        closed = index;
        break;
      }
    }
  }
  if (closed === -1) return null;
  let angle = 0;
  for (let index = closed + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === "<") angle += 1;
    else if (character === ">") angle -= 1;
    else if (character === "{" && angle <= 0) {
      let depth = 0;
      for (let end = index; end < source.length; end += 1) {
        const inner = source[end];
        if (inner === "{") depth += 1;
        else if (inner === "}") {
          depth -= 1;
          if (depth === 0) return source.slice(index, end + 1);
        }
      }
      return null;
    }
  }
  return null;
}

/**
 * The fields of a zod object schema: the top-level keys of the object literal.
 *
 * A handler that validates its body with a zod schema reads exactly the fields that schema
 * declares. The schema is the handler's own statement of what it accepts, so the contract's
 * parameter schema is compared against it rather than against a reading of the handler.
 */
function zodObjectFields(source: string, marker: string): Set<string> | null {
  const at = source.indexOf(marker);
  if (at === -1) return null;
  const objectAt = source.indexOf(".object(", at);
  if (objectAt === -1) return null;
  const braceAt = source.indexOf("{", objectAt);
  if (braceAt === -1) return null;
  let depth = 0;
  let end = -1;
  for (let index = braceAt; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }
  if (end === -1) return null;
  const member = source.slice(braceAt, end + 1);
  const fields = new Set<string>();
  // The object's own keys, at its top level only: a nested object's keys belong to the nested
  // object, and the schema names the nested object as one field.
  let level = 0;
  for (const match of member.matchAll(/([{}])|([A-Za-z_][A-Za-z0-9_]*)\s*:/g)) {
    if (match[1] === "{") level += 1;
    else if (match[1] === "}") level -= 1;
    else if (level === 1 && match[2] !== undefined) fields.add(match[2]);
  }
  return fields;
}

/** The parameters one handler reads. */
function consumedFields(extraction: Extraction, sources: ReadonlyMap<string, string>): Set<string> | null {
  const source = sources.get(extraction.file);
  if (source === undefined) return null;
  if (extraction.kind === "agent_tool") return agentToolFields(source, extraction.marker);
  if (extraction.kind === "zod_fields") return zodObjectFields(source, extraction.marker);
  if (extraction.kind === "statement") {
    const at = source.indexOf(extraction.marker);
    if (at === -1) return null;
    const lineEnd = source.indexOf("\n", at);
    const line = source.slice(at, lineEnd === -1 ? source.length : lineEnd);
    const fields = new Set<string>();
    for (const variable of extraction.variables ?? []) {
      for (const match of line.matchAll(new RegExp(`\\b${variable}\\.([A-Za-z_][A-Za-z0-9_]*)`, "g"))) {
        const name = match[1];
        if (name !== undefined) fields.add(name);
      }
    }
    return fields;
  }
  const block = extraction.kind === "function" ? functionBody(source, extraction.marker) : blockAfter(source, extraction.marker);
  if (block === null) return null;
  const fields = new Set<string>();
  for (const variable of extraction.variables ?? []) {
    // The optional chaining marker is part of the read: `body?.panel` reads `panel`.
    for (const match of block.matchAll(new RegExp(`\\b${variable}\\??\\.([A-Za-z_][A-Za-z0-9_]*)`, "g"))) {
      const name = match[1];
      if (name !== undefined) fields.add(name);
    }
  }
  // A handler that reads a body through a loop over named keys reads those keys.
  for (const match of block.matchAll(/for \(const ([A-Za-z_][A-Za-z0-9_]*) of \[([^\]]*)\]\)/g)) {
    const name = match[1];
    const list = match[2];
    if (name === undefined || list === undefined) continue;
    const named = [...list.matchAll(/"([^"]+)"/g)].map((entry) => entry[1]).filter((value): value is string => value !== undefined);
    for (const variable of extraction.variables ?? []) {
      if (!block.includes(`${variable}[${name}]`)) continue;
      for (const value of named) fields.add(value);
    }
  }
  for (const variable of extraction.values ?? []) {
    for (const match of block.matchAll(new RegExp(`\\b${variable}\\.get\\("([^"]+)"\\)`, "g"))) {
      const name = match[1];
      if (name !== undefined) fields.add(name);
    }
  }
  // The values the handler reads out of what it resolved rather than out of the request: the
  // identifier must actually appear in the handler, or the row is claiming a parameter the
  // handler does not read.
  for (const [identifier, field] of Object.entries(extraction.derived ?? {})) {
    if (new RegExp(`\\b${identifier}\\b`).test(block)) fields.add(field);
  }
  return fields;
}

interface FieldSpec {
  readonly name: string;
  readonly wire?: string;
  readonly optional?: boolean;
  readonly fixed_by_operation?: boolean;
  readonly object_fields?: readonly { readonly name: string }[];
}

interface SchemaSpec {
  readonly fields?: readonly FieldSpec[];
  readonly variants?: Readonly<Record<string, { readonly fields?: readonly FieldSpec[] }>>;
  readonly discriminated_by?: string;
}

export interface BindingResult {
  readonly ok: boolean;
  readonly checked: number;
  readonly failures: readonly string[];
}

/** The schema's wire names: what the handler actually sees. A field the row fixes is named by the
 * operation, not by the caller, so it is not a parameter the request carries. */
function wireNames(spec: SchemaSpec, fixed: Readonly<Record<string, string | number | boolean>>): Set<string> {
  const names = new Set<string>();
  for (const field of spec.fields ?? []) {
    if (field.fixed_by_operation === true) continue;
    const wire = field.wire ?? field.name;
    if (Object.prototype.hasOwnProperty.call(fixed, wire)) continue;
    names.add(wire);
  }
  return names;
}

export function checkParamSchemaBinding(root: string = ROOT): BindingResult {
  const failures: string[] = [];
  const sources = new Map<string, string>();
  const manifest = loadOperationManifest(path.join(root, "contracts/identity/v1/operations.yaml"));
  const params = Bun.YAML.parse(readFileSync(path.join(root, "contracts/identity/v1/params.yaml"), "utf8")) as {
    schemas: Record<string, SchemaSpec>;
  };
  for (const file of new Set(BINDINGS.flatMap((binding) => binding.reads.map((read) => read.file)))) {
    sources.set(file, readFileSync(path.join(root, file), "utf8"));
  }
  for (const binding of BINDINGS) {
    const operation = manifest.byId.get(binding.operation);
    if (operation === undefined) {
      failures.push(`${binding.operation}: no catalog row`);
      continue;
    }
    const schemaName = operation.paramsSchema;
    if (schemaName === null) {
      failures.push(`${binding.operation}: no parameter schema`);
      continue;
    }
    const schema = params.schemas[schemaName];
    if (schema === undefined) {
      failures.push(`${binding.operation}: the schema ${schemaName} does not exist`);
      continue;
    }
    let spec: SchemaSpec = schema;
    if (schema.variants !== undefined) {
      const codeOp = binding.codeOp;
      if (codeOp === undefined) {
        failures.push(`${binding.operation}: the schema is caller-discriminated and the binding names no code operation`);
        continue;
      }
      const variant = schema.variants[codeOp];
      if (variant === undefined) {
        failures.push(`${binding.operation}: the schema has no variant for ${codeOp}`);
        continue;
      }
      spec = variant;
    }
    const consumed = new Set<string>();
    for (const read of binding.reads) {
      const fields = consumedFields(read, sources);
      if (fields === null) {
        failures.push(`${binding.operation}: the handler ${read.marker} was not found in ${read.file}`);
        continue;
      }
      for (const field of fields) consumed.add(field);
    }
    for (const field of PROTOCOL_FIELDS) consumed.delete(field);
    // A field the row fixes is named by the operation, not by the caller. The dispatcher that
    // selects the row may read the same field from the request — that is how the desk's choice
    // and the phone's phase reach the pair — but the operation's own parameter is the fixed one,
    // so the field belongs to neither side of this comparison.
    for (const field of Object.keys(operation.fixedParameters)) consumed.delete(field);
    const declared = wireNames(spec, operation.fixedParameters);
    const missing = [...consumed].filter((field) => !declared.has(field)).sort();
    const extra = [...declared].filter((field) => !consumed.has(field)).sort();
    if (missing.length > 0) {
      failures.push(`${binding.operation} (${schemaName}): the handler reads ${missing.join(", ")}, which the schema does not name`);
    }
    if (extra.length > 0) {
      failures.push(`${binding.operation} (${schemaName}): the schema names ${extra.join(", ")}, which the handler does not read`);
    }
  }
  // Every live-bound row must be bound by this check. A row the catalog says a route performs
  // and this table does not name is a row whose parameters nothing checks: the confirmation
  // digest would be made from a description of the operation other than the one that runs.
  //
  // A row the catalog says performs no effect is the one exception: the route resolves it and
  // refuses it by its class before any capability is invoked, so there is no handler that reads
  // a parameter for it to disagree with. The row keeps its class, its evidence and its schema,
  // and the refusal stays a containment rather than an absence.
  const bound = new Set(BINDINGS.map((binding) => binding.operation));
  const performsNothing = new Set(
    (manifest.manifest.live_enforcement?.rows ?? [])
      .filter((row) => row.refused_today === true)
      .map((row) => row.id),
  );
  for (const operation of manifest.byId.values()) {
    if (operation.binding !== "verified") continue;
    if (performsNothing.has(operation.id)) continue;
    if (!bound.has(operation.id)) {
      failures.push(`${operation.id}: a live-bound row has no binding in the parameter check`);
    }
  }
  // A fixed parameter names a field of the row's own schema, and the fixed value is one the field
  // allows. A fixed value outside the enum would describe an operation that cannot happen.
  for (const operation of manifest.byId.values()) {
    const fixed = operation.fixedParameters;
    if (Object.keys(fixed).length === 0) continue;
    const schemaName = operation.paramsSchema;
    const schema = schemaName === null ? undefined : params.schemas[schemaName];
    if (schema === undefined) {
      failures.push(`${operation.id}: a row with fixed parameters has no schema`);
      continue;
    }
    for (const [name, value] of Object.entries(fixed)) {
      const field = (schema.fields ?? []).find((candidate) => candidate.name === name || candidate.wire === name);
      if (field === undefined) {
        failures.push(`${operation.id}: the fixed parameter "${name}" is not a field of ${schemaName}`);
        continue;
      }
      const allowed = (field as { enum?: readonly string[] }).enum;
      if (allowed !== undefined && !allowed.includes(String(value))) {
        failures.push(`${operation.id}: the fixed parameter "${name}=${String(value)}" is not one of ${schemaName}'s ${allowed.join(", ")}`);
      }
    }
  }
  return { ok: failures.length === 0, checked: BINDINGS.length, failures };
}

if (import.meta.main) {
  const result = checkParamSchemaBinding();
  for (const failure of result.failures) console.log(`  FAIL ${failure}`);
  if (!result.ok) {
    console.error(`param-schema binding: ${result.failures.length} failure(s) across ${result.checked} bindings`);
    process.exit(1);
  }
  console.log(`param-schema binding: ok — ${result.checked} handlers agree with the frozen schemas`);
}
