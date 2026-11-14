/**
 * The source-grounded, read-only world debugger (T10, REQ-UI-007, REQ-SAFE-004).
 *
 * ## What it is
 *
 * Seven questions asked about the *shared* navigation focus — `why`, `impact`, `diff`, `timeline`,
 * `counterfactual`, `reach`, `replay` — answered from the T06 projection read behind the frame and
 * from the frame's own context. It adds no store, no second event history and no authority: every
 * answer is a function of one projection read plus the facts the caller names, so the same focus
 * answered twice gives the same answer.
 *
 * Donor vocabulary is adapted from the World Debugger design note in the donor workbench; that
 * donor's product artifacts, run files, inbox and product-authority engine are **not** adopted.
 *
 * ## Every value is labelled
 *
 * Collapsing two of these into one is a lie, so the closed set is a type, not a comment:
 *
 *  - `recorded`            a row or field the projection actually holds
 *  - `derived`             a documented per-operation rule applied to recorded rows
 *  - `unknown`             the source records nothing; `missing_source` names what is absent
 *  - `effect`              an intent record only — never proof of an external effect
 *  - `untrusted_reference` retrieved text; never canonical, never an input to a decision
 *
 * ## Read-only, in the strong sense
 *
 * Nothing in this module mutates. It receives an immutable {@link DebuggerSources} snapshot and
 * returns frozen answer objects, so "the debugger changes nothing" is a property of the shape
 * rather than of the caller's restraint (NE-02, PE-09, NE-09).
 */
import type { NavigationChoice, NavigationFrame } from "./navigation.ts";
import type { LineageEdgeV1, OperationalLinkV1, OperationalObjectV1, RelationTypeRef } from "./operational.ts";

export const DEBUGGER_SCHEMA = "horizon.world-debugger/1" as const;

export const DEBUGGER_OPERATIONS = ["why", "impact", "diff", "timeline", "counterfactual", "reach", "replay"] as const;
export type DebuggerOperation = (typeof DEBUGGER_OPERATIONS)[number];

export const VALUE_CLASSES = ["recorded", "derived", "unknown", "effect", "untrusted_reference"] as const;
export type ValueClass = (typeof VALUE_CLASSES)[number];

/** Bounds are required, not defaulted, so an unbounded traversal cannot be asked for by omission. */
export const MAX_IMPACT_DEPTH = 4;
export const MAX_IMPACT_NODES = 64;
export const MAX_TIMELINE_ROWS = 200;
export const MAX_WHY_ROWS = 100;

export type DebuggerDirection = "out" | "in" | "both";
const DIRECTIONS: readonly DebuggerDirection[] = ["out", "in", "both"];

/** The frame context an answer was produced in, restated so an answer is never detached from it. */
export interface DebuggerScope {
  readonly observer_ref: string;
  readonly tenant_ref: string;
  readonly world_ref: string;
  readonly checkpoint_ref: string | null;
  readonly focus_ref: string;
  readonly case_ref: string | null;
  readonly frame_id: string;
  readonly frame_revision: number;
  /**
   * The checkpoint this answer actually read when it is not the frame's own (diff/timeline, NE-08).
   * Absent means the answer is about `checkpoint_ref`, and `checkpoint_ref` is never changed to say so.
   */
  readonly comparison?: string;
}

/** One labelled fact. `source` names the row, the rule or the missing source that produced it. */
export interface DebuggerValue {
  readonly key: string;
  readonly value: string;
  readonly class: ValueClass;
  readonly source: string;
  /** Set only when `class` is `unknown`: exactly what the source does not record. */
  readonly missing_source?: string;
}

export interface DebuggerAnswer {
  readonly schema: typeof DEBUGGER_SCHEMA;
  readonly operation: DebuggerOperation;
  /** What the operation answers, in one sentence, without claiming more than the class supports. */
  readonly question: string;
  readonly scope: DebuggerScope;
  /** `ok` answered from sources; `refused` malformed or out of bounds; `unavailable` nothing readable. */
  readonly status: "ok" | "refused" | "unavailable";
  readonly code: string | null;
  readonly message: string | null;
  readonly values: readonly DebuggerValue[];
  /** Outside the vocabulary, or an unread row: named so absence is never read as "no relation". */
  readonly unknown_remainder: readonly string[];
  /** Literal: a debugger answer is not authority and grants none (REQ-OUT-002, REQ-SAFE-004). */
  readonly authority: { readonly grants_authority: false };
  /** `settles` is false for every operation; only the owner's commit settles anything. */
  readonly settles: false;
}


// ---------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------

export type DebuggerArguments =
  | { readonly operation: "why"; readonly target_ref?: string }
  | {
      readonly operation: "impact";
      readonly direction?: DebuggerDirection;
      readonly max_depth?: number;
      readonly max_nodes?: number;
      readonly relation_types?: readonly RelationTypeRef[];
    }
  | { readonly operation: "diff"; readonly checkpoint_ref?: string }
  | { readonly operation: "timeline"; readonly checkpoint_ref?: string; readonly max_rows?: number }
  | { readonly operation: "counterfactual"; readonly proposal_ref?: string; readonly change?: string; readonly target_ref?: string }
  | { readonly operation: "reach"; readonly need?: string; readonly target_ref?: string }
  | {
      readonly operation: "replay";
      readonly selects?: { readonly semantic_ref?: string; readonly object_refs?: readonly string[] };
      readonly expect?: { readonly field?: string; readonly equals?: string | number | boolean };
    };

// ---------------------------------------------------------------------------------------------
// Answer construction
// ---------------------------------------------------------------------------------------------

function scopeOf(frame: NavigationFrame): DebuggerScope {
  return Object.freeze({
    observer_ref: frame.observer_ref,
    tenant_ref: frame.tenant_ref,
    world_ref: frame.world_ref,
    checkpoint_ref: frame.checkpoint_ref,
    focus_ref: frame.focus_ref,
    case_ref: frame.case_ref,
    frame_id: frame.frame_id,
    frame_revision: frame.revision,
  });
}

function value(key: string, text: string, cls: ValueClass, source: string): DebuggerValue {
  return Object.freeze({ key, value: text, class: cls, source });
}

function unknown(key: string, missing: string, source: string): DebuggerValue {
  return Object.freeze({ key, value: `unknown: ${missing}`, class: "unknown" as const, source, missing_source: missing });
}

type Failure = { readonly status: "refused" | "unavailable"; readonly code: string; readonly message: string };

/**
 * Answer with the frame's own scope, or — for an operation that read another checkpoint — a scope
 * that names *that* checkpoint under `comparison`, so an answer about an earlier checkpoint is never
 * labelled as an answer about the current one. The frame's own `checkpoint_ref` is left untouched:
 * the answer describes the frame it was asked in, not a frame it moved.
 */
function answer(
  frame: NavigationFrame,
  operation: DebuggerOperation,
  question: string,
  values: readonly DebuggerValue[],
  unknownRemainder: readonly string[],
  failure: Failure | null = null,
  comparison: string | null = null,
): DebuggerAnswer {
  const scope = scopeOf(frame);
  return Object.freeze({
    schema: DEBUGGER_SCHEMA,
    operation,
    question,
    scope: comparison === null || comparison === frame.checkpoint_ref ? scope : { ...scope, comparison },
    status: failure === null ? "ok" : failure.status,
    code: failure === null ? null : failure.code,
    message: failure === null ? null : failure.message,
    values: Object.freeze([...values]),
    unknown_remainder: Object.freeze([...unknownRemainder]),
    authority: Object.freeze({ grants_authority: false as const }),
    settles: false as const,
  });
}

/** The projection read behind the frame. Immutable: the debugger cannot write through it. */
export interface DebuggerSources {
  readonly frame: NavigationFrame;
  readonly objects: readonly OperationalObjectV1[];
  readonly links: readonly OperationalLinkV1[];
  readonly lineage: readonly LineageEdgeV1[];
  /** Relation types declared by the pinned world. Anything else is unknown, never traversed. */
  readonly declared_relations: readonly RelationTypeRef[];
  /** The observer's scope: objects outside it are `denied`, not `unknown`. */
  readonly allowed_semantic_refs?: readonly string[];
  readonly denied_refs?: readonly string[];
  /**
   * FDE evidence for one episode (WP-19), already read by the read-only adapters (`src/adapters/fde-read.ts`).
   * `why` about `episode_ref` answers from these rows; absent sources arrive as `unknown` values, never as zero.
   */
  readonly fde?: { readonly episode_ref: string; readonly values: readonly DebuggerValue[] };
  /** A checkpoint the caller names, already read by the T06 adapter (diff/timeline). */
  readonly other_checkpoint?: {
    readonly ref: string;
    readonly read: boolean;
    readonly objects: readonly OperationalObjectV1[];
    readonly links: readonly OperationalLinkV1[];
  };
}

function byRef<T extends { readonly object_ref: string }>(left: T, right: T): number {
  return left.object_ref < right.object_ref ? -1 : left.object_ref > right.object_ref ? 1 : 0;
}

function isVisible(sources: DebuggerSources, object: OperationalObjectV1): boolean {
  if ((sources.denied_refs ?? []).includes(object.object_ref)) return false;
  const allowed = sources.allowed_semantic_refs;
  return allowed === undefined || allowed.includes(object.semantic_ref);
}

/** The focus may be absent; that is a recorded fact about the projection, not an error. */
function focusObject(sources: DebuggerSources, ref: string): OperationalObjectV1 | null {
  return sources.objects.find((object) => object.object_ref === ref) ?? null;
}

function relText(link: OperationalLinkV1): string {
  return `${link.relation_type}: ${link.from} -> ${link.to}`;
}

/**
 * `why` explains a focus through rows: its provenance, its fields, the operational links that name
 * it, and the lineage edges that produced it. There is no inference here — an absent record is
 * `unknown` with the missing source named, never a plausible edge (PE-03).
 */
function why(sources: DebuggerSources, targetRef: string | undefined): DebuggerAnswer {
  const frame = sources.frame;
  const ref = targetRef ?? frame.focus_ref;
  const question = `Why is ${ref} true in this world?`;
  const checkpoint = frame.checkpoint_ref;
  if (sources.fde !== undefined && sources.fde.episode_ref === ref) {
    return answer(frame, "why", `Why was episode ${ref} classified and settled as recorded?`, sources.fde.values, [
      "classes, settlement and world are copied from the case records and the RealityTrace result; this answer computes none of them",
    ]);
  }
  const values: DebuggerValue[] = [];
  const unknownRemainder: string[] = [];
  const object = focusObject(sources, ref);
  if (object === null) {
    return answer(frame, "why", question, [
      unknown("focus", `the projection holds no row for ${ref}`, checkpoint ?? "projection"),
    ], []);
  }
  if (!isVisible(sources, object)) {
    return answer(frame, "why", question, [], [], {
      status: "refused",
      code: "denied",
      message: `the observer may not read ${ref}; no content is disclosed`,
    });
  }
  values.push(
    value("object_ref", object.object_ref, "recorded", `object/${object.object_ref}`),
    value("label", object.label, "recorded", `object/${object.object_ref}#label`),
    value("semantic_ref", object.semantic_ref, "recorded", `object/${object.object_ref}#semantic_ref`),
    value("connector", object.provenance.connector, "recorded", `object/${object.object_ref}#provenance.connector`),
    value("integration_level", object.provenance.integration_level, "recorded", `object/${object.object_ref}#provenance.integration_level`),
    value("observed_at", object.provenance.observed_at, "recorded", `object/${object.object_ref}#provenance.observed_at`),
    value("checkpoint", object.provenance.checkpoint_ref, "recorded", `object/${object.object_ref}#provenance.checkpoint_ref`),
  );
  const fields = Object.entries(object.fields).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  for (const [field, fieldValue] of fields) {
    values.push(value(`field.${field}`, String(fieldValue), "recorded", `object/${object.object_ref}#fields.${field}`));
  }

  const links = sources.links
    .filter((link) => link.from === ref || link.to === ref)
    .sort((left, right) => (relText(left) < relText(right) ? -1 : relText(left) > relText(right) ? 1 : 0));
  const declared = new Set(sources.declared_relations);
  links.slice(0, MAX_WHY_ROWS).forEach((link, index) => {
    if (!declared.has(link.relation_type)) {
      unknownRemainder.push(`${link.relation_type} is outside the declared operational vocabulary; it is shown, not interpreted`);
    }
    values.push(value(`link[${index}]`, relText(link), "recorded", `link/${link.relation_type}/${link.from}/${link.to}`));
  });
  if (links.length > MAX_WHY_ROWS) {
    values.push(value("links_folded", `${links.length - MAX_WHY_ROWS} link row(s) beyond the ${MAX_WHY_ROWS}-row cap`, "derived", "why:row-cap"));
  }
  if (links.length === 0) {
    values.push(unknown("links", `the projection records no operational link with an endpoint at ${ref}`, "link/"));
  }

  const lineage = sources.lineage
    .filter((edge) => edge.object_ref === ref)
    .sort((left, right) => (left.observation_ref < right.observation_ref ? -1 : 1));
  lineage.slice(0, MAX_WHY_ROWS).forEach((edge, index) => {
    values.push(value(`lineage[${index}]`, edge.observation_ref, "recorded", `lineage/${edge.observation_ref}/${edge.object_ref}`));
  });
  if (lineage.length === 0) {
    values.push(unknown("lineage", `the projection records no lineage observation for ${ref}`, "lineage/"));
  }
  return answer(frame, "why", question, values, unknownRemainder);
}

// ---------------------------------------------------------------------------------------------
// impact — operational links only, bounded
// ---------------------------------------------------------------------------------------------

/**
 * `impact` follows operational links in the requested direction, within one explicit depth and one
 * explicit node cap. An undeclared relation type or an unbounded request is refused; when either
 * bound bites, the folded remainder is reported so a truncated answer is never read as complete
 * (PE-04, NE-06).
 */
function impact(
  sources: DebuggerSources,
  request: { readonly direction?: unknown; readonly max_depth?: unknown; readonly max_nodes?: unknown; readonly relation_types?: unknown },
): DebuggerAnswer {
  const frame = sources.frame;
  const question = `What depends on ${frame.focus_ref}, and what does it depend on?`;
  const direction = request.direction ?? "both";
  if (typeof direction !== "string" || !DIRECTIONS.includes(direction as DebuggerDirection)) {
    return answer(frame, "impact", question, [], [], {
      status: "refused",
      code: "invalid_argument",
      message: "direction must be one of out, in, both",
    });
  }
  const { max_depth: depth, max_nodes: nodes } = request;
  if (depth === undefined || nodes === undefined) {
    const missing = [depth === undefined ? "max_depth" : null, nodes === undefined ? "max_nodes" : null].filter((name) => name !== null);
    return answer(frame, "impact", question, [], [], {
      status: "refused",
      code: "limit",
      message: `impact requires an explicit bound: missing ${missing.join(", ")}`,
    });
  }
  if (typeof depth !== "number" || !Number.isInteger(depth) || depth < 1 || depth > MAX_IMPACT_DEPTH) {
    return answer(frame, "impact", question, [], [], {
      status: "refused",
      code: "invalid_argument",
      message: `max_depth must be an integer between 1 and ${MAX_IMPACT_DEPTH}`,
    });
  }
  if (typeof nodes !== "number" || !Number.isInteger(nodes) || nodes < 1 || nodes > MAX_IMPACT_NODES) {
    return answer(frame, "impact", question, [], [], {
      status: "refused",
      code: "invalid_argument",
      message: `max_nodes must be an integer between 1 and ${MAX_IMPACT_NODES}`,
    });
  }
  const requestedRelations = request.relation_types ?? [...sources.declared_relations];
  if (!Array.isArray(requestedRelations)) {
    return answer(frame, "impact", question, [], [], { status: "refused", code: "invalid_argument", message: "relation_types must be a list" });
  }
  const declared = new Set<string>(sources.declared_relations);
  for (const relation of requestedRelations) {
    if (typeof relation !== "string" || !declared.has(relation)) {
      return answer(frame, "impact", question, [], [], {
        status: "refused",
        code: "undeclared",
        message: `relation type ${String(relation)} is not declared in ${frame.world_ref}`,
      });
    }
  }
  if (focusObject(sources, frame.focus_ref) === null) {
    return answer(frame, "impact", question, [
      unknown("focus", `the projection holds no row for ${frame.focus_ref}`, frame.checkpoint_ref ?? "projection"),
    ], []);
  }
  const permitted = new Set<string>(requestedRelations as string[]);
  const known = new Set(sources.objects.map((object) => object.object_ref));
  const edges = sources.links
    .filter((link) => permitted.has(link.relation_type) && known.has(link.from) && known.has(link.to))
    .sort((left, right) => (relText(left) < relText(right) ? -1 : relText(left) > relText(right) ? 1 : 0));
  const step = (ref: string): readonly OperationalLinkV1[] =>
    edges.filter((link) => (direction !== "in" && link.from === ref) || (direction !== "out" && link.to === ref));
  const other = (link: OperationalLinkV1, ref: string): string => (link.from === ref ? link.to : link.from);
  const byObject = new Map(sources.objects.map((object) => [object.object_ref, object]));

  const reached = new Set<string>([frame.focus_ref]);
  const values: DebuggerValue[] = [];
  let frontier = [frame.focus_ref];
  let folded = 0;
  let truncatedByDepth = false;
  for (let distance = 1; distance <= depth; distance += 1) {
    const next: string[] = [];
    for (const ref of frontier) {
      for (const link of step(ref)) {
        const target = other(link, ref);
        const object = byObject.get(target);
        if (object === undefined || reached.has(target) || !isVisible(sources, object)) continue;
        if (reached.size - 1 >= nodes) {
          folded += 1;
          continue;
        }
        reached.add(target);
        next.push(target);
        values.push(value(`depth${distance}:${target}`, `${link.relation_type} ${ref} -> ${target}`, "recorded", `link/${link.relation_type}/${link.from}/${link.to}`));
      }
    }
    frontier = next.sort();
    if (frontier.length === 0) break;
    if (distance === depth) truncatedByDepth = frontier.some((ref) => step(ref).some((link) => !reached.has(other(link, ref))));
  }
  if (values.length === 0) {
    values.push(unknown("dependents", `the projection records no operational link from or to ${frame.focus_ref} in the ${direction} direction`, "link/"));
  }
  if (folded > 0) {
    values.push(value("folded", `${folded} reachable node(s) folded beyond max_nodes=${nodes}`, "derived", "impact:node-cap"));
  }
  if (truncatedByDepth) {
    values.push(value("depth_limited", `the frontier at max_depth=${depth} still has edges beyond it`, "derived", "impact:depth-cap"));
  }
  const unknownRemainder: string[] = [];
  const undeclared = new Set(sources.links.map((link) => link.relation_type).filter((relation) => !declared.has(relation)));
  for (const relation of [...undeclared].sort()) {
    unknownRemainder.push(`${relation} is outside the declared operational vocabulary; its edges are not followed`);
  }
  unknownRemainder.push("this answer covers operational links only; relations the pinned world does not declare are unknown");
  return answer(frame, "impact", question, values, unknownRemainder);
}

// ---------------------------------------------------------------------------------------------
// diff — two checkpoints, both through the T06 adapter
// ---------------------------------------------------------------------------------------------

/**
 * `diff` compares the frame's checkpoint with one the caller names. A checkpoint the adapter could
 * not read is `unavailable`, never "everything was removed": an unread row is not an absent row
 * (PE-05, NE-08).
 */
function diff(sources: DebuggerSources, checkpointRef: unknown): DebuggerAnswer {
  const frame = sources.frame;
  const question = `What changed between ${frame.checkpoint_ref ?? "this checkpoint"} and another checkpoint?`;
  if (typeof checkpointRef !== "string" || checkpointRef.trim() === "") {
    return answer(frame, "diff", question, [], [], { status: "refused", code: "invalid_argument", message: "checkpoint_ref must be a non-empty string" });
  }
  const other = sources.other_checkpoint;
  if (other === undefined || other.ref !== checkpointRef || !other.read) {
    return answer(frame, "diff", question, [], [], {
      status: "unavailable",
      code: "checkpoint_unreadable",
      message: `checkpoint ${checkpointRef} could not be read; no diff is stated rather than an empty one`,
    });
  }
  if (frame.checkpoint_ref === null) {
    return answer(frame, "diff", question, [
      unknown("to", "the frame carries no checkpoint, so there is nothing to compare against", "frame#checkpoint_ref"),
    ], []);
  }
  const visible = (object: OperationalObjectV1): boolean => isVisible(sources, object);
  const current = new Map(sources.objects.filter(visible).map((object) => [object.object_ref, object]));
  const previous = new Map(other.objects.filter(visible).map((object) => [object.object_ref, object]));
  const added = [...current.keys()].filter((ref) => !previous.has(ref)).sort();
  const changed = [...current.entries()]
    .filter(([ref, object]) => previous.has(ref) && JSON.stringify(previous.get(ref)) !== JSON.stringify(object))
    .map(([ref]) => ref)
    .sort();
  const removed = [...previous.keys()].filter((ref) => !current.has(ref)).sort();
  const currentMode = checkpointRef === frame.checkpoint_ref;
  const values: DebuggerValue[] = [
    value("mode", currentMode ? "same-checkpoint" : "comparing", "derived", "diff:checkpoint"),
    value("from", currentMode ? checkpointRef : frame.checkpoint_ref, "recorded", `checkpoint/${currentMode ? checkpointRef : frame.checkpoint_ref}`),
    value("to", checkpointRef, "recorded", `checkpoint/${checkpointRef}`),
    value("added", added.length === 0 ? "none" : added.join(", "), "derived", "diff:object-set"),
    value("changed", changed.length === 0 ? "none" : changed.join(", "), "derived", "diff:object-row"),
    value("removed", removed.length === 0 ? "none" : removed.join(", "), "derived", "diff:object-set"),
  ];
  return answer(frame, "diff", question, values, [
    "present means a row this observer may read; a row outside the observer's scope is neither added nor removed here",
  ], null, checkpointRef);
}

// ---------------------------------------------------------------------------------------------
// timeline — row provenance, ordered by time then ref
// ---------------------------------------------------------------------------------------------

/**
 * `timeline` is the projection's own provenance: `observed_at` and `checkpoint_ref` from the rows.
 * The order is (observed_at, object_ref) — never event position — so two rows observed at the same
 * instant have a stable, content-derived order (PE-06).
 */
function timeline(sources: DebuggerSources, request: { readonly checkpoint_ref?: unknown; readonly max_rows?: unknown }): DebuggerAnswer {
  const frame = sources.frame;
  const question = "How did this world get here?";
  let rows: readonly OperationalObjectV1[] = sources.objects;
  let checkpointLabel: string = frame.checkpoint_ref ?? "unnamed";
  // The frame's own checkpoint is the current world; anything else is a comparison, and a
  // comparison the adapter could not read is unavailable (PE-05, NE-08).
  let mode: "current" | "comparing" = "current";
  if (request.checkpoint_ref !== undefined) {
    if (typeof request.checkpoint_ref !== "string" || request.checkpoint_ref.trim() === "") {
      return answer(frame, "timeline", question, [], [], { status: "refused", code: "invalid_argument", message: "checkpoint_ref must be a non-empty string" });
    }
    if (frame.checkpoint_ref !== request.checkpoint_ref) {
      mode = "comparing";
      const other = sources.other_checkpoint;
      if (other === undefined || other.ref !== request.checkpoint_ref || !other.read) {
        return answer(frame, "timeline", question, [], [], {
          status: "unavailable",
          code: "checkpoint_unreadable",
          message: `checkpoint ${request.checkpoint_ref} could not be read; no timeline is stated rather than an empty one`,
        });
      }
      rows = other.objects;
      checkpointLabel = other.ref;
    }
  }
  const cap = request.max_rows === undefined ? MAX_TIMELINE_ROWS : request.max_rows;
  if (typeof cap !== "number" || !Number.isInteger(cap) || cap < 1 || cap > MAX_TIMELINE_ROWS) {
    return answer(frame, "timeline", question, [], [], {
      status: "refused",
      code: "invalid_argument",
      message: `max_rows must be an integer between 1 and ${MAX_TIMELINE_ROWS}`,
    });
  }
  const visible = rows
    .filter((row) => isVisible(sources, row))
    .sort((left, right) => {
      const byTime = left.provenance.observed_at < right.provenance.observed_at ? -1 : left.provenance.observed_at > right.provenance.observed_at ? 1 : 0;
      return byTime !== 0 ? byTime : left.object_ref < right.object_ref ? -1 : left.object_ref > right.object_ref ? 1 : 0;
    });
  const values: DebuggerValue[] = [
    value("mode", mode, "derived", "timeline:checkpoint"),
    value("checkpoint", checkpointLabel, "recorded", `checkpoint/${checkpointLabel}`),
    value("order", "observed_at, then object_ref", "derived", "timeline:rule"),
  ];
  if (visible.length === 0) {
    values.push(unknown("rows", `the projection at ${checkpointLabel} holds no row this observer may read`, "object/"));
  }
  visible.slice(0, cap).forEach((row, index) => {
    values.push(
      value(
        `row[${index}]`,
        `${row.provenance.observed_at} ${row.object_ref} (${row.provenance.connector}, ${row.provenance.checkpoint_ref})`,
        "recorded",
        `object/${row.object_ref}#provenance`,
      ),
    );
  });
  if (visible.length > cap) {
    values.push(value("folded", `${visible.length - cap} row(s) folded beyond max_rows=${cap}`, "derived", "timeline:row-cap"));
  }
  return answer(frame, "timeline", question, values, [
    "this reads row provenance, not the event log: history that left no row in this projection is not recorded here",
  ], null, checkpointLabel);
}

// ---------------------------------------------------------------------------------------------
// counterfactual — a preview, never an outcome
// ---------------------------------------------------------------------------------------------

/**
 * A proposal is not a row and a preview is not a settlement: the answer states `possibility`
 * authority and `settles: false` from the frame, and its consequence sentence is derived from
 * recorded edges only (PE-07, NE-02).
 */
function counterfactual(
  sources: DebuggerSources,
  request: { readonly proposal_ref?: unknown; readonly change?: unknown; readonly target_ref?: unknown },
): DebuggerAnswer {
  const frame = sources.frame;
  const question = "What would follow if this proposal settled?";
  if (typeof request.proposal_ref !== "string" || request.proposal_ref.trim() === "" || typeof request.change !== "string" || request.change.trim() === "") {
    return answer(frame, "counterfactual", question, [], [], { status: "refused", code: "invalid_argument", message: "proposal_ref and change are required" });
  }
  const target = typeof request.target_ref === "string" && request.target_ref.trim() !== "" ? request.target_ref : frame.focus_ref;
  const values: DebuggerValue[] = [
    value("authority", "possibility", "derived", "counterfactual:authority"),
    value("settles", "false", "derived", "counterfactual:settles"),
    value("scope", `${frame.world_ref} at ${frame.checkpoint_ref ?? "an unnamed checkpoint"}`, "recorded", "frame"),
    value("proposal_ref", request.proposal_ref, "derived", "counterfactual:proposal"),
    value("change", request.change, "derived", "counterfactual:change"),
  ];
  const object = focusObject(sources, target);
  if (object === null || !isVisible(sources, object)) {
    values.push(unknown("target", `the projection holds no row this observer may read for ${target}`, frame.checkpoint_ref ?? "projection"));
    return answer(frame, "counterfactual", question, values, ["no consequence is derived from an object the projection does not hold"]);
  }
  values.push(value("target", `${object.object_ref} (${object.semantic_ref})`, "recorded", `object/${object.object_ref}`));
  const affected = sources.links.filter((link) => link.from === object.object_ref || link.to === object.object_ref);
  values.push(
    value(
      "derived_consequences",
      affected.length === 0
        ? "no recorded edge names this object, so no consequence is derived"
        : `${affected.length} recorded edge(s) would be re-read: ${affected.map(relText).join("; ")}`,
      "derived",
      "counterfactual:rule:edges-re-read",
    ),
  );
  values.push(unknown("outcome", "the consequence of settling a proposal is recorded nowhere until the owner commits it", "settlement"));
  const unknownRemainder = ["derived consequences are Horizon's documented rule over recorded rows, not a model of any external engine"];
  if (frame.case_ref !== null) {
    const open = frame.choices.filter((choice: NavigationChoice) => choice.status !== "available");
    unknownRemainder.push(
      open.length === 0
        ? `case ${frame.case_ref} has no blocked or unknown choice today (recorded); whether a settlement clears one is unknown`
        : `case ${frame.case_ref} holds ${open.length} blocked or unknown choice(s): ${open.map((choice) => choice.operation_ref).join(", ")}`,
    );
  }
  return answer(frame, "counterfactual", question, values, unknownRemainder);
}

// ---------------------------------------------------------------------------------------------
// reach — the capability a gap needs; nothing is run
// ---------------------------------------------------------------------------------------------

const REACH_RUNGS = ["installed", "configured", "probed", "reachable", "authorized"] as const;

/**
 * `reach` names the capability a missing row would need and the rung this environment actually
 * observed. Horizon observes filesystem and configuration state only: it runs no prober, so
 * `probed`, `reachable` and `authorized` stay `unknown` (PE-08).
 */
function reach(sources: DebuggerSources, request: { readonly need?: unknown; readonly target_ref?: unknown }): DebuggerAnswer {
  const frame = sources.frame;
  const question = "What outside capability could answer what this world does not record?";
  if (typeof request.need !== "string" || request.need.trim() === "") {
    return answer(frame, "reach", question, [], [], { status: "refused", code: "invalid_argument", message: "need must name the missing fact or capability" });
  }
  const target = typeof request.target_ref === "string" && request.target_ref.trim() !== "" ? request.target_ref : frame.focus_ref;
  const object = focusObject(sources, target);
  const values: DebuggerValue[] = [
    value("need", request.need, "derived", "reach:request"),
    value("target", target, "recorded", object === null ? "reach:request" : `object/${target}`),
  ];
  if (object === null) values.push(unknown("target", `the projection holds no row for ${target}`, frame.checkpoint_ref ?? "projection"));
  values.push(value("installed", `the pinned world declares ${sources.declared_relations.length} operational relation type(s)`, "recorded", "world#relations"));
  values.push(value("configured", "no capability binding names this need", "derived", "reach:configuration"));
  for (const rung of REACH_RUNGS) {
    if (rung === "installed" || rung === "configured") continue;
    values.push(unknown(rung, `no prober runs in this environment, so the ${rung} rung is not observed`, "reach:prober"));
  }
  values.push(value("usable", "unproven", "derived", "reach:ladder"));
  values.push(value("first_unobserved_rung", "probed", "derived", "reach:ladder"));
  values.push(value("next_step", "observe the target through an installed capability before relying on this reach", "derived", "reach:ladder"));
  return answer(frame, "reach", question, values, ["nothing was contacted and nothing was run: this answer describes the ladder, not a probe"]);
}

// ---------------------------------------------------------------------------------------------
// replay — an expectation over recorded rows
// ---------------------------------------------------------------------------------------------

/**
 * `replay` selects recorded rows and checks one field expectation. An empty selection is
 * `not-selected`, never a pass; a failing expectation is `fail`; the answer changes nothing
 * (PE-09, NE-07).
 */
function replay(sources: DebuggerSources, request: { readonly selects?: unknown; readonly expect?: unknown }): DebuggerAnswer {
  const frame = sources.frame;
  const question = "Does a recorded row still satisfy a declared expectation?";
  const selects = (request.selects ?? {}) as { readonly semantic_ref?: unknown; readonly object_refs?: unknown };
  const expect = (request.expect ?? {}) as { readonly field?: unknown; readonly equals?: unknown };
  if (typeof expect.field !== "string" || expect.field.trim() === "") {
    return answer(frame, "replay", question, [], [], { status: "refused", code: "invalid_argument", message: "expect.field must name a recorded field" });
  }
  if (!("equals" in expect) || !["string", "number", "boolean"].includes(typeof expect.equals)) {
    return answer(frame, "replay", question, [], [], { status: "refused", code: "invalid_argument", message: "expect.equals must be a string, number or boolean" });
  }
  if (selects.semantic_ref !== undefined && typeof selects.semantic_ref !== "string") {
    return answer(frame, "replay", question, [], [], { status: "refused", code: "invalid_argument", message: "selects.semantic_ref must be a string" });
  }
  if (selects.object_refs !== undefined && (!Array.isArray(selects.object_refs) || selects.object_refs.some((ref) => typeof ref !== "string"))) {
    return answer(frame, "replay", question, [], [], { status: "refused", code: "invalid_argument", message: "selects.object_refs must be a list of object refs" });
  }
  const field = expect.field;
  const semanticRef = selects.semantic_ref as string | undefined;
  const wanted = selects.object_refs as readonly string[] | undefined;
  const selected = sources.objects
    .filter((object) => isVisible(sources, object))
    .filter((object) => semanticRef === undefined || object.semantic_ref === semanticRef)
    .filter((object) => wanted === undefined || wanted.includes(object.object_ref))
    .sort(byRef);
  const selection = semanticRef === undefined && wanted === undefined ? "all visible rows" : [semanticRef, ...(wanted ?? [])].filter(Boolean).join(" + ");
  const values: DebuggerValue[] = [
    value("selection", selection, "derived", "replay:selects"),
    value("expectation", `${field} == ${JSON.stringify(expect.equals)}`, "derived", "replay:expect"),
    value("settles", "false", "derived", "replay:settles"),
  ];
  if (selected.length === 0) {
    values.push(value("outcome", "not-selected", "derived", "replay:rule:empty-selection"));
    return answer(frame, "replay", question, values, ["an empty selection is not a pass"]);
  }
  const read = (object: OperationalObjectV1): string | number | boolean | undefined => {
    if (object.fields[field] !== undefined) return object.fields[field];
    const provenance = object.provenance as unknown as Record<string, string>;
    if (provenance[field] !== undefined) return provenance[field];
    if (field === "label") return object.label;
    if (field === "semantic_ref") return object.semantic_ref;
    if (field === "object_ref") return object.object_ref;
    return undefined;
  };
  const outcomes = selected.map((object) => ({ ref: object.object_ref, actual: read(object) }));
  for (const entry of outcomes) {
    values.push(
      entry.actual === undefined
        ? unknown(`row:${entry.ref}`, `the row records no field ${field}`, `object/${entry.ref}`)
        : value(`row:${entry.ref}`, String(entry.actual), "recorded", `object/${entry.ref}#${field}`),
    );
  }
  const failing = outcomes.filter((entry) => entry.actual === undefined || entry.actual !== expect.equals);
  values.push(value("outcome", failing.length === 0 ? "pass" : "fail", "derived", "replay:rule"));
  if (failing.length > 0) values.push(value("failing", failing.map((entry) => entry.ref).join(", "), "derived", "replay:rule"));
  return answer(frame, "replay", question, values, []);
}

// ---------------------------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------------------------

/**
 * The only entry point. It dispatches to a pure function per operation; there is no mutating
 * operation to reach, because none is claimed here (NE-09).
 */
export function runDebugger(sources: DebuggerSources, request: DebuggerArguments): DebuggerAnswer {
  switch (request.operation) {
    case "why":
      return why(sources, request.target_ref);
    case "impact":
      return impact(sources, request);
    case "diff":
      return diff(sources, request.checkpoint_ref);
    case "timeline":
      return timeline(sources, request);
    case "counterfactual":
      return counterfactual(sources, request);
    case "reach":
      return reach(sources, request);
    case "replay":
      return replay(sources, request);
  }
}

/** The seven questions, published so a surface or a route can list them without a second list. */
export function debuggerCatalogue(): readonly { readonly operation: DebuggerOperation; readonly question: string }[] {
  return Object.freeze([
    { operation: "why", question: "Why is this true?" },
    { operation: "impact", question: "What depends on this?" },
    { operation: "diff", question: "What changed?" },
    { operation: "timeline", question: "How did we get here?" },
    { operation: "counterfactual", question: "What if this changed?" },
    { operation: "reach", question: "What could reach what is missing?" },
    { operation: "replay", question: "Can this be reproduced?" },
  ] as { readonly operation: DebuggerOperation; readonly question: string }[]);
}
