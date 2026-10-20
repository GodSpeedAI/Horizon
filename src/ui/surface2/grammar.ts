/**
 * `horizon.surface/2` — the single closed surface grammar (REQ-UI-001, REQ-UI-002).
 *
 * There is exactly one schema object in Horizon that can describe a surface. The GUI
 * projection, the CLI projection and the machine (MCP) projection all read their
 * vocabulary from this module, so a construct one route accepts cannot be rejected by,
 * or absent from, another (REQ-UI-008).
 *
 * Closed means three things, enforced by construction rather than by convention:
 *
 *   1. `.strict()` on every object. An unknown property is an error, never ignored, so
 *      `onClick`, `html` or `dangerouslySetInnerHTML` cannot ride along inside a block
 *      that is otherwise valid.
 *   2. No string in the grammar is ever interpreted as code. Text is text; the only
 *      executable consequence of a surface is a `HorizonOperation`, an enum member.
 *      Nothing here renders markup (REQ-UI-001).
 *   3. The block union is a closed discriminated union. `iframe`, `script` and a
 *      developer-defined component are not reachable states.
 *
 * Provenance (REQ-UI-007) is not a field a producer may omit or forge: every block
 * declares `provenance`, and `agent` provenance must also name the proposing actor;
 * `owner` provenance requires a human actor and may carry layout authority. The reducer
 * (see `./reducer.ts`) is the only thing that decides what a block may do with it.
 */
import { z } from "zod";

export const SURFACE_SCHEMA = "horizon.surface/2" as const;

// ---------------------------------------------------------------------------
// Vocabulary shared by every route
// ---------------------------------------------------------------------------

/** Presentation roles. A surface's role is bound to the transport, never declared by a producer. */
export const SURFACE_ROLES = ["agent", "human", "system"] as const;
export type SurfaceRole = (typeof SURFACE_ROLES)[number];

/** The closed intent set a surface may present. Named once so discovery and parse agree. */
export const SURFACE_INTENTS = ["inspect", "compare", "decide", "verify", "monitor"] as const;
export type SurfaceIntent = (typeof SURFACE_INTENTS)[number];

/**
 * Layout authority. `owner_pinned`, `owner_laid_out` and `default_order` are human
 * decisions; `agent_composed` and `agent_proposed` are agent claims that the reducer may
 * downgrade but never upgrade (REQ-UI-006).
 */
export const LAYOUT_PLACEMENTS = [
  "owner_pinned",
  "owner_laid_out",
  "default_order",
  "agent_composed",
  "agent_proposed",
] as const;
export type LayoutPlacement = (typeof LAYOUT_PLACEMENTS)[number];

export const LAYOUT_AUTHORIZED: readonly LayoutPlacement[] = ["owner_pinned", "owner_laid_out"];

export function isLayoutAuthorized(placement: LayoutPlacement): boolean {
  return LAYOUT_AUTHORIZED.includes(placement);
}

/**
 * The six journeys a surface may be pointed at (`.sea` `NavigationFrameV1.responsibility`).
 *
 * Written dotted where it would otherwise collide with a block-kind name. J05 and the
 * `compare` block are different things; if they shared one spelling, a frame value and a
 * block kind would become interchangeable, which is the ambiguity a single closed grammar
 * exists to remove.
 */
export const RESPONSIBILITIES = ["orient", "decide", "execute", "monitor", "journey.compare", "develop"] as const;
export type Responsibility = (typeof RESPONSIBILITIES)[number];

/** Calm status tone. Deliberately not a colour: a renderer chooses the palette. */
export const TONES = ["neutral", "info", "success", "warning", "danger"] as const;
export type Tone = (typeof TONES)[number];

/**
 * The complete set of operations a surface may ask the observer to perform. This is the
 * same union every renderer emits: a name that is not here cannot be expressed in a
 * surface, cannot be projected, and cannot be routed.
 */
export const HORIZON_OPERATIONS = [
  "horizon.health",
  "horizon.research.health",
  "horizon.inspect",
  "horizon.compare",
  "horizon.decide.defer",
  "horizon.decide.approve",
  "horizon.decide.reject",
  "horizon.authorize.confirm",
  "horizon.monitor.refresh",
  "horizon.navigate.back",
  "horizon.navigate.cancel",
] as const;
export type HorizonOperation = (typeof HORIZON_OPERATIONS)[number];

/** An operation that changes normative state, as opposed to one that only reads. */
export const CONSEQUENTIAL_OPERATIONS: readonly HorizonOperation[] = [
  "horizon.decide.approve",
  "horizon.decide.reject",
  "horizon.authorize.confirm",
];

export function isConsequential(operation: HorizonOperation): boolean {
  return CONSEQUENTIAL_OPERATIONS.includes(operation);
}

/** Reversibility as `.sea` `StructuralChoice` declares it. */
export const REVERSIBILITY = ["reversible", "compensable", "irreversible", "unknown"] as const;

// ---------------------------------------------------------------------------
// References: typed, never free-form
// ---------------------------------------------------------------------------

/** Shape of a semantic reference. Resolution is the binder's job, not the schema's. */
export const SEMANTIC_REF = /^semantic:[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
/** A world revision pinned by content identity. */
export const WORLD_REF = /^world:[a-z0-9-]+@sha256:[0-9a-f]{64}$/;
/** An observation owned by an independent source; Horizon never mints these. */
export const EVIDENCE_REF = /^evidence:[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
/** A span of the committed Gauntlet Reference or of a settled frame revision. */
export const FRAME_REF = /^frame:[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
/** An execution record owned by Gauntlet. */
export const EXECUTION_REF = /^execution:[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
/** A Case is a derived view; the ref names one, not its authority. */
export const CASE_REF = /^case:[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;

/** An actor is either the observer themselves or an agent acting on the observer's behalf. */
export const ACTOR_REF = /^(actor|agent|os):[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
/**
 * The operator principal for the `local_operator` profile. Its identity comes from the OS
 * session (REQ-SEC-006), so the minted ref is `os:<user>:<uid>` and no `actor:` prefix is
 * ever invented for it: an invented prefix would present a fabricated authenticated identity.
 */
export const OS_OPERATOR_REF = /^os:[A-Za-z0-9_.-][A-Za-z0-9_.:-]{0,126}$/;
/** A human observer: a Cognate `actor:` principal or the authenticated OS operator. */
export const OBSERVER_ACTOR_REF = /^(actor:|os:)[A-Za-z0-9_.-][A-Za-z0-9_.:-]{0,127}$/;
export const AGENT_ACTOR_REF = /^agent:[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

const IDENTIFIER = /^[a-z][a-z0-9_-]{0,63}$/;
const ENTITY_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

// ---------------------------------------------------------------------------
// Strings that are display text only
// ---------------------------------------------------------------------------

/** Longest display string a surface may carry, so a surface cannot become a payload. */
export const MAX_TEXT = 2048;
/**
 * Any `<` or `>` in display text is refused. A renderer could escape it and still be safe,
 * but refusing it here means a surface containing markup can never reach *any* renderer,
 * so "escaped at the boundary" does not have to be re-proven per route (REQ-SEC-003).
 */
const MARKUP = /[<>]/;

export const DisplayText = z
  .string()
  .min(1)
  .max(MAX_TEXT)
  .refine((value) => !MARKUP.test(value), { message: "display text MUST NOT contain markup ('<' or '>')" })
  .refine((value) => !value.includes("\u0000"), { message: "display text MUST NOT contain NUL" });

// ---------------------------------------------------------------------------
// Source expressions (syntax here, resolution in ./binder.ts)
// ---------------------------------------------------------------------------

/**
 * The only four namespaces a source expression may name. There is no `js:`, no `eval:`,
 * no URL and no bare path. The binder turns each into a deterministic value or a typed
 * refusal; the schema only refuses shapes that could never bind.
 */
export const SOURCE_NAMESPACES = ["semantic", "horizon", "file", "agent"] as const;
export type SourceNamespace = (typeof SOURCE_NAMESPACES)[number];

/**
 * Allowed `file:` roots. Each is inside the repository and read-only: frozen evidence,
 * frozen artifacts and the committed ui-model. Nothing here can address a secret, a
 * sibling repository, an absolute path or a parent traversal.
 */
export const FILE_ROOTS = ["evidence", "specs", "plans", "ui-model", "sea", "prereg"] as const;
export const MAX_SOURCE_DEPTH = 8;

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export type SourceParse =
  | { readonly ok: true; readonly namespace: SourceNamespace; readonly path: readonly string[] }
  | { readonly ok: false; readonly reason: string };

/**
 * `namespace:path` with no scheme, host, query, fragment or escape. The path is split on
 * `/` and every segment must be a plain name, so `..`, `.`, an empty segment and a
 * backslash are refused before any filesystem is touched.
 */
export function parseSourceExpression(expression: string): SourceParse {
  const colon = expression.indexOf(":");
  if (colon <= 0) return { ok: false, reason: "a source expression MUST be namespace:path" };
  const namespace = expression.slice(0, colon);
  const rest = expression.slice(colon + 1);
  if (!(SOURCE_NAMESPACES as readonly string[]).includes(namespace)) {
    return { ok: false, reason: `namespace '${namespace}' is not one of ${SOURCE_NAMESPACES.join(", ")}` };
  }
  if (rest.length === 0 || rest.length > 512) return { ok: false, reason: "source path length is out of range" };
  if (/[\\?#\s]/.test(rest)) return { ok: false, reason: "source path MUST NOT contain '\\', '?', '#' or whitespace" };
  if (rest.startsWith("/")) return { ok: false, reason: "source path MUST be relative" };
  const path = rest.split("/");
  if (path.length > MAX_SOURCE_DEPTH) return { ok: false, reason: "source path is too deep" };
  for (const segment of path) {
    if (!SEGMENT.test(segment)) {
      return { ok: false, reason: `segment '${segment}' is not a plain name (no '..', '.', empty segment or traversal)` };
    }
  }
  const ns = namespace as SourceNamespace;
  if (ns === "file" && !(FILE_ROOTS as readonly string[]).includes(path[0] ?? "")) {
    return { ok: false, reason: `file: sources MUST start with one of ${FILE_ROOTS.join(", ")}` };
  }
  if (ns === "semantic" && path.length !== 1) return { ok: false, reason: "semantic: sources name exactly one entity" };
  if ((ns === "semantic" || ns === "horizon") && !ENTITY_IDENTIFIER.test(path[0] ?? "") && !IDENTIFIER.test(path[0] ?? "")) {
    return { ok: false, reason: `'${path[0]}' is not an entity or operation name` };
  }
  return { ok: true, namespace: ns, path };
}

export const SourceExpression = z
  .string()
  .min(3)
  .max(600)
  .superRefine((value, ctx) => {
    const parsed = parseSourceExpression(value);
    if (!parsed.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: parsed.reason });
  });

// ---------------------------------------------------------------------------
// Provenance and actor attribution (REQ-UI-007, REQ-UX-006, REQ-SEC-002)
// ---------------------------------------------------------------------------

export const ACTOR_ROLES = ["human", "agent", "system"] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

/**
 * Who produced a value or an action. `principal_ref` is always the human the work is for;
 * when an agent acts for that human, `on_behalf_of_ref` names the human and `agent_ref`
 * names the agent, so a projected surface can never present agent output as the human's
 * own (AC-UX-006-01).
 */
export const ActorAttribution = z
  .object({
    actor_ref: z.string().regex(ACTOR_REF, "actor_ref MUST be actor:<id>, agent:<id> or os:<user>:<uid>"),
    role: z.enum(ACTOR_ROLES),
    principal_ref: z.string().regex(OBSERVER_ACTOR_REF, "principal_ref MUST be the human observer actor:<id>"),
    agent_ref: z.string().regex(AGENT_ACTOR_REF, "agent_ref MUST be agent:<id>").optional(),
    on_behalf_of_ref: z.string().regex(OBSERVER_ACTOR_REF, "on_behalf_of_ref MUST be actor:<id>").optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.role === "human") {
      if (!OBSERVER_ACTOR_REF.test(value.actor_ref)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["actor_ref"], message: "a human attribution MUST use an actor: ref" });
      }
      if (value.agent_ref !== undefined || value.on_behalf_of_ref !== undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "a human attribution MUST NOT name a delegating agent" });
      }
    }
    if (value.role === "agent") {
      if (!AGENT_ACTOR_REF.test(value.actor_ref)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["actor_ref"], message: "an agent attribution MUST use an agent: ref" });
      }
      if (value.agent_ref === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["agent_ref"], message: "an agent acting for a human MUST name itself" });
      }
      if (value.on_behalf_of_ref === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["on_behalf_of_ref"],
          message: "an agent acting for a human MUST name the human it acts for",
        });
      }
      if (value.agent_ref !== undefined && value.agent_ref !== value.actor_ref) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["agent_ref"], message: "agent_ref MUST equal actor_ref" });
      }
      if (value.on_behalf_of_ref !== undefined && value.on_behalf_of_ref !== value.principal_ref) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["on_behalf_of_ref"],
          message: "an agent may act only for the observer it is presented to",
        });
      }
    }
    if (value.role === "system" && value.agent_ref !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["agent_ref"], message: "a system attribution MUST NOT name an agent" });
    }
  });
export type ActorAttribution = z.infer<typeof ActorAttribution>;

/**
 * Per-block provenance. `source_kind` says what the block's *values* are: bound from an
 * authority, supplied verbatim by an agent, derived by Horizon, or authored by the owner.
 * `attributed_to` says who produced the block. The projection must print both
 * (REQ-UI-007).
 */
export const PROVENANCE_SOURCES = ["bound", "agent_supplied", "derived", "owner_authored"] as const;
export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];

export const Provenance = z
  .object({
    source_kind: z.enum(PROVENANCE_SOURCES),
    source_ref: SourceExpression,
    attributed_to: ActorAttribution,
    layout: z.enum(LAYOUT_PLACEMENTS),
  })
  .strict()
  .superRefine((value, ctx) => {
    // Agent-supplied values must be attributable to an agent, and bound/derived values
    // must come from their namespace. This stops an agent from dressing its own text up
    // as an authority-bound fact, or a bound value from losing its source.
    const namespace = parseSourceExpression(value.source_ref);
    if (!namespace.ok) return; // SourceExpression already reported it.
    if (value.source_kind === "agent_supplied" && namespace.namespace !== "agent") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["source_ref"], message: "agent_supplied values MUST use an agent: source" });
    }
    if (value.source_kind === "agent_supplied" && value.attributed_to.role !== "agent") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["attributed_to", "role"],
        message: "agent_supplied values MUST be attributed to an agent",
      });
    }
    if (value.source_kind === "bound" && namespace.namespace === "agent") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["source_ref"], message: "bound values MUST NOT use an agent: source" });
    }
    if (value.source_kind === "owner_authored" && value.attributed_to.role !== "human") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["attributed_to", "role"],
        message: "owner_authored values MUST be attributed to a human",
      });
    }
    if (isLayoutAuthorized(value.layout) && value.attributed_to.role !== "human") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["layout"], message: "layout authority requires a human attribution" });
    }
  });
export type Provenance = z.infer<typeof Provenance>;

// ---------------------------------------------------------------------------
// Blocks: a closed set of fifteen declarative elements
// ---------------------------------------------------------------------------

/**
 * Every block is one of these fifteen `type` values. The list is data so the vocabulary
 * catalogue, the MCP tool descriptions and the CLI help all publish the same set; adding a
 * sixteenth block is a schema revision, never a runtime extension point.
 */
export const BLOCK_TYPES = [
  "metric",
  "callout",
  "table",
  "tree",
  "timeline",
  "graph",
  "chart",
  "compare",
  "media",
  "document",
  "entity",
  "preflight",
  "progress",
  "ask",
  "form",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const MAX_BLOCKS = 64;
export const MAX_ROWS = 500;
export const MAX_COLUMNS = 12;
export const MAX_NODES = 500;
export const MAX_FIELDS = 32;

const BlockId = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/, "block id MUST be a lower-case identifier");
const Ref = z.string().regex(SEMANTIC_REF, "ref MUST be semantic:<Entity>");
const EvidenceRef = z.string().regex(EVIDENCE_REF, "evidence_ref MUST be evidence:<id>");
/** A cell is a value, never markup and never a nested block. */
const Cell = z.union([DisplayText, z.number().finite(), z.boolean(), z.null()]);

/**
 * Graph nodes name semantic entities only. An agent cannot introduce a node whose identity
 * is not already part of the canonical world (REQ-UI-002).
 */
export const GraphNode = z
  .object({
    id: z.string().regex(SEMANTIC_REF, "graph node id MUST be semantic:<Entity>"),
    label: DisplayText,
    kind: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/),
  })
  .strict();

export const GraphEdge = z
  .object({
    from: z.string().regex(SEMANTIC_REF, "edge source MUST be semantic:<Entity>"),
    to: z.string().regex(SEMANTIC_REF, "edge target MUST be semantic:<Entity>"),
    relation: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/),
  })
  .strict();

const basis = {
  id: BlockId,
  provenance: Provenance,
  /** The human the block is presented to. A block may not be shown to a different observer. */
  owner_ref: z.string().regex(OBSERVER_ACTOR_REF, "owner_ref MUST be the human observer actor:<id>").optional(),
};

const Callout = z.object({ ...basis, type: z.literal("callout"), tone: z.enum(TONES), text: DisplayText, ref: Ref.optional() }).strict();

/** A metric always names what it measures; a number with no source is not displayable. */
const Metric = z
  .object({
    ...basis,
    type: z.literal("metric"),
    label: DisplayText,
    value: z.union([z.number().finite(), DisplayText]),
    unit: z.string().max(16).optional(),
    ref: Ref,
  })
  .strict();

const Table = z
  .object({
    ...basis,
    type: z.literal("table"),
    columns: z
      .array(z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/), label: DisplayText }).strict())
      .min(1)
      .max(MAX_COLUMNS),
    rows: z.array(z.record(z.string(), Cell)).max(MAX_ROWS),
    source: SourceExpression,
  })
  .strict();

const Tree = z
  .object({
    ...basis,
    type: z.literal("tree"),
    nodes: z
      .array(z.object({ ref: Ref, label: DisplayText, parent_ref: Ref.nullable() }).strict())
      .min(1)
      .max(MAX_NODES),
    source: SourceExpression,
  })
  .strict();

const Timeline = z
  .object({
    ...basis,
    type: z.literal("timeline"),
    entries: z
      .array(
        z
          .object({
            /** ISO-8601 instant. The reducer never reads the clock; the binder orders by this. */
            at: z.string().datetime({ offset: true }),
            label: DisplayText,
            ref: Ref,
          })
          .strict(),
      )
      .min(1)
      .max(MAX_NODES),
    source: SourceExpression,
  })
  .strict();

const Graph = z
  .object({
    ...basis,
    type: z.literal("graph"),
    nodes: z.array(GraphNode).min(1).max(MAX_NODES),
    edges: z.array(GraphEdge).max(MAX_NODES),
    source: SourceExpression,
  })
  .strict();

const Chart = z
  .object({
    ...basis,
    type: z.literal("chart"),
    kind: z.enum(["bar", "line"]),
    series: z
      .array(z.object({ label: DisplayText, points: z.array(z.number().finite()).max(MAX_ROWS) }).strict())
      .min(1)
      .max(8),
    source: SourceExpression,
  })
  .strict();

const Compare = z
  .object({
    ...basis,
    type: z.literal("compare"),
    left: z.object({ ref: Ref, label: DisplayText }).strict(),
    right: z.object({ ref: Ref, label: DisplayText }).strict(),
    dimensions: z.array(z.object({ label: DisplayText, left: Cell, right: Cell }).strict()).max(MAX_COLUMNS),
  })
  .strict();

const Document = z
  .object({
    ...basis,
    type: z.literal("document"),
    title: DisplayText,
    source: SourceExpression,
    excerpt: DisplayText.optional(),
  })
  .strict();

/**
 * Media shows run artifacts. `src` is a `file:` expression (never a URL and never inline
 * data), so an agent cannot point the observer at a remote asset that Horizon never
 * bound, and an owner pin is a *recording request*, never an applied change.
 */
const Media = z
  .object({
    ...basis,
    type: z.literal("media"),
    items: z
      .array(z.object({ label: DisplayText, src: SourceExpression }).strict())
      .min(1)
      .max(8),
    pins: z
      .array(
        z
          .object({
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
            note: DisplayText,
          })
          .strict(),
      )
      .max(32),
  })
  .strict();

const Entity = z.object({ ...basis, type: z.literal("entity"), ref: Ref, label: DisplayText }).strict();

/**
 * Progress is bound to an observation and never settable by a producer: there is no
 * `value` field, only a source that the binder resolves. An agent cannot report its own
 * progress as an authority fact through this block (donor debt carried forward).
 */
const Progress = z
  .object({
    ...basis,
    type: z.literal("progress"),
    label: DisplayText,
    source: SourceExpression,
  })
  .strict();

/**
 * A preflight is the check *before* an operation. It carries the operation, the gate's
 * status and, when not available, the first blocker — the four `.sea` statuses, never a
 * boolean (possibility is not an affordance).
 */
const Preflight = z
  .object({
    ...basis,
    type: z.literal("preflight"),
    operation: z.enum(HORIZON_OPERATIONS),
    availability: z.enum(["available", "blocked", "unknown", "conflicted"]),
    first_blocker: DisplayText.nullable(),
    evidence_ref: EvidenceRef.optional(),
  })
  .strict();

/** An agent may ask; it may never pre-fill an affirmative answer. */
const Ask = z
  .object({
    ...basis,
    type: z.literal("ask"),
    question: DisplayText,
    why_needed: DisplayText,
    options: z
      .array(z.object({ option_id: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/), label: DisplayText }).strict())
      .min(2)
      .max(8),
  })
  .strict();

/**
 * A form is a request to *the human*. Fields are declarative inputs only; a field may
 * reference its bound source but can never carry a default answer, because a default an
 * agent supplies is an agent answering for the human.
 */
const Form = z
  .object({
    ...basis,
    type: z.literal("form"),
    fields: z
      .array(
        z
          .object({
            name: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/),
            label: DisplayText,
            kind: z.enum(["text", "longtext", "select", "confirm"]),
            required: z.boolean(),
            source: SourceExpression.optional(),
            choices: z.array(DisplayText).max(32).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_FIELDS),
    submit_operation: z.enum(HORIZON_OPERATIONS),
    authority_ref: z.string().max(128).optional(),
  })
  .strict();

/** The closed discriminated union. A `type` that is not in `BLOCK_TYPES` has no member. */
export const SurfaceBlock = z.discriminatedUnion("type", [
  Metric,
  Callout,
  Table,
  Tree,
  Timeline,
  Graph,
  Chart,
  Compare,
  Media,
  Document,
  Entity,
  Preflight,
  Progress,
  Ask,
  Form,
]);
export type SurfaceBlock = z.infer<typeof SurfaceBlock>;

// ---------------------------------------------------------------------------
// Actions: the only executable consequence of a surface
// ---------------------------------------------------------------------------

/**
 * An action names an operation from the shared union and the attribution that would be
 * recorded if it were chosen. It does not carry a handler, a URL, a payload or a
 * permission. Whether the operation is *offered* is decided by the frame
 * (`src/domain/frame.ts`), not by the surface; whether it would be *authorized* is
 * SEA-Forge's decision at invocation, not this schema's.
 */
export const SurfaceAction = z
  .object({
    id: BlockId,
    type: z.literal("action"),
    operation: z.enum(HORIZON_OPERATIONS),
    label: DisplayText,
    by: ActorAttribution,
    preflight_ref: BlockId.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    // An agent may not offer a consequential operation as if it were the human's own
    // decision. It may only *propose* it; the reducer records the proposal and the human
    // still has to choose it.
    if (value.by.role === "agent" && isConsequential(value.operation)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["by", "role"],
        message: "an agent MUST NOT present a consequential operation as its own action; it may only propose it",
      });
    }
  });
export type SurfaceAction = z.infer<typeof SurfaceAction>;

// ---------------------------------------------------------------------------
// The surface document
// ---------------------------------------------------------------------------

/**
 * A surface is one document whose blocks each carry their own provenance and layout
 * placement. The owner's pinned blocks keep their submitted order; the reducer may only
 * append agent-composed blocks after them (REQ-UI-006). `world_ref` is optional because a
 * surface may legitimately be bound to a frame that predates a world pin; when present it
 * is checked against the bound world by `./binder.ts`.
 */
export const SurfaceV2 = z
  .object({
    schema: z.literal(SURFACE_SCHEMA),
    surface_id: z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/),
    title: DisplayText,
    responsibility: z.enum(RESPONSIBILITIES),
    intent: z.enum(SURFACE_INTENTS),
    world_ref: z.string().regex(WORLD_REF, "world_ref MUST be world:<name>@sha256:<64 hex>").optional(),
    focus_ref: z.string().regex(SEMANTIC_REF, "focus_ref MUST be semantic:<Entity>"),
    blocks: z.array(SurfaceBlock).min(1).max(MAX_BLOCKS),
    actions: z.array(SurfaceAction).max(16),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = new Set<string>();
    for (const [index, block] of value.blocks.entries()) {
      if (ids.has(block.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["blocks", index, "id"], message: `duplicate block id '${block.id}'` });
      }
      ids.add(block.id);
    }
    for (const [index, block] of value.blocks.entries()) {
      // Graph: an edge to a node that is not here cannot be drawn or followed, and a
      // duplicate id would make a node ambiguous to the observer.
      if (block.type === "graph") {
        const nodeIds = new Set(block.nodes.map((node) => node.id));
        if (nodeIds.size !== block.nodes.length) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["blocks", index, "nodes"], message: "graph node ids MUST be unique" });
        }
        for (const [edgeIndex, edge] of block.edges.entries()) {
          if (!nodeIds.has(edge.from)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["blocks", index, "edges", edgeIndex, "from"], message: "edge source MUST be a node" });
          }
          if (!nodeIds.has(edge.to)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["blocks", index, "edges", edgeIndex, "to"], message: "edge target MUST be a node" });
          }
        }
      }
      // Preflight: an available operation has no blocker; anything else must name the
      // first blocker, so "not now" is never shown without saying what stops it.
      if (block.type === "preflight") {
        if (block.availability === "available" && block.first_blocker !== null) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["blocks", index, "first_blocker"], message: "an available operation has no blocker" });
        }
        if (block.availability !== "available" && block.first_blocker === null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["blocks", index, "first_blocker"],
            message: "a non-available operation MUST name its first blocker",
          });
        }
      }
      // Form: submission is the consequential step, so only a consequential operation
      // may be submitted. A read-only form would be an action wearing a form's clothes.
      if (block.type === "form" && !isConsequential(block.submit_operation)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["blocks", index, "submit_operation"],
          message: "a form MUST submit a consequential operation; use an action for read-only operations",
        });
      }
      // A tree must be internally consistent: an orphan or self-parented node cannot be
      // laid out, and a renderer that tried would silently drop a row the observer needs.
      // Checked here rather than inside the block schema so this block stays a plain object
      // that `discriminatedUnion` can dispatch on.
      if (block.type !== "tree") continue;
      const refs = new Set(block.nodes.map((node) => node.ref));
      for (const [nodeIndex, node] of block.nodes.entries()) {
        if (node.parent_ref !== null && !refs.has(node.parent_ref)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["blocks", index, "nodes", nodeIndex, "parent_ref"],
            message: "parent_ref MUST name a node in this tree",
          });
        }
        if (node.parent_ref === node.ref) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["blocks", index, "nodes", nodeIndex, "parent_ref"],
            message: "a node cannot be its own parent",
          });
        }
      }
    }
    for (const [index, action] of value.actions.entries()) {
      if (ids.has(action.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["actions", index, "id"], message: `duplicate block id '${action.id}'` });
      }
      ids.add(action.id);
      if (
        action.preflight_ref !== undefined &&
        !value.blocks.some((block) => block.id === action.preflight_ref && block.type === "preflight")
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["actions", index, "preflight_ref"],
          message: "preflight_ref MUST name a preflight block in this surface",
        });
      }
    }
  });
export type SurfaceV2 = z.infer<typeof SurfaceV2>;

// ---------------------------------------------------------------------------
// Parsing: one entry point for every route
// ---------------------------------------------------------------------------

export interface SurfaceIssue {
  /** JSON pointer into the submitted document, so a CLI, GUI or MCP caller sees the same path. */
  readonly path: string;
  readonly message: string;
}

export type ParseSurfaceResult =
  | { readonly ok: true; readonly surface: SurfaceV2 }
  | { readonly ok: false; readonly code: "INVALID_SURFACE"; readonly issues: readonly SurfaceIssue[] };

export function describeIssues(error: z.ZodError): SurfaceIssue[] {
  return error.issues.slice(0, 32).map((issue) => ({
    path: "/" + issue.path.map((segment) => String(segment).replaceAll("~", "~0").replaceAll("/", "~1")).join("/"),
    message: issue.message,
  }));
}
/**
 * The closed vocabulary and op union this grammar publishes, in a serializable shape. MCP,
 * WebMCP and CLI discovery all read *this* object, so a tool list cannot describe a
 * different surface than the one every route parses (REQ-UI-008, PE-01, PE-06). Discovery
 * publishes what the grammar accepts; it never asserts that the caller may use it.
 */
export function publishSurfaceSchema(): {
  readonly schema: typeof SURFACE_SCHEMA;
  readonly block_types: readonly BlockType[];
  readonly roles: readonly SurfaceRole[];
  readonly intents: readonly SurfaceIntent[];
  readonly responsibilities: readonly Responsibility[];
  readonly operations: readonly HorizonOperation[];
  readonly consequential_operations: readonly HorizonOperation[];
} {
  return {
    schema: SURFACE_SCHEMA,
    block_types: BLOCK_TYPES,
    roles: SURFACE_ROLES,
    intents: SURFACE_INTENTS,
    responsibilities: RESPONSIBILITIES,
    operations: HORIZON_OPERATIONS,
    consequential_operations: CONSEQUENTIAL_OPERATIONS,
  };
}



/**
 * The only way any route turns untrusted JSON into a surface. It never coerces, never
 * strips and never repairs: a document that does not validate is refused whole, and the
 * caller receives every issue path (REQ-UI-002).
 */
export function parseSurface(input: unknown): ParseSurfaceResult {
  const parsed = SurfaceV2.safeParse(input);
  if (parsed.success) return { ok: true, surface: parsed.data };
  return { ok: false, code: "INVALID_SURFACE", issues: describeIssues(parsed.error) };
}
