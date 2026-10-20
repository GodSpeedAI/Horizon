/**
 * Deterministic source binding (`horizon.surface/2` sources → typed observations).
 *
 * A surface states *where* its facts come from and never *what* they are, except for
 * agent-supplied values which are always marked as such. The binder is the only reader of
 * those sources. It is a pure function of (surface, binding context):
 *
 *   - no clock, no network, no random and no environment variable is read;
 *   - every `file:` read stays inside the repository and inside one of the frozen
 *     `FILE_ROOTS`; a symlink that escapes is refused, not followed;
 *   - `semantic:` resolves through the caller-supplied `resolveEntity`, so the binder never
 *     invents an entity that the canonical world does not contain;
 *   - `horizon:` resolves through `resolveHorizon`, which reports its own observation
 *     status rather than a bare value;
 *   - `agent:` names a value the proposing agent supplied, which is always reported as
 *     `agent_supplied` and never as a bound fact.
 *
 * Anything it cannot bind becomes an explicit `refused` or `blocked` binding with a stable
 * reason code. It never substitutes a plausible-looking value (REQ-UI-003, REQ-UI-007).
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { FILE_ROOTS, parseSourceExpression, type SourceNamespace } from "./grammar.ts";

export type BindingStatus = "bound" | "refused" | "blocked";

/**
 * The observation status a bound source resolves to. PE-02 fixes this vocabulary exactly:
 * a binding either carries a value with one of these eight statuses or is refused. There
 * is no `ok`/`true`, so a caller cannot flatten "I have nothing" into a fact.
 */
export const OBSERVATION_STATUSES = [
  "available",
  "empty",
  "no-match",
  "blocked",
  "denied",
  "unavailable",
  "contradicted",
  "partial",
] as const;
export type ObservationStatus = (typeof OBSERVATION_STATUSES)[number];

/**
 * What an authority hands back for a source that resolved at all. The binder does not
 * decide whether a query matched; the authority that owns the source reports it here.
 * "blocked", "denied" and "unavailable" are *resolutions*, not refusals: the authority
 * answered, and its answer was that it cannot or will not say.
 */
export interface ObservedValue {
  readonly status: ObservationStatus;
  readonly value?: unknown;
  /** The operation that produced the observation, when the authority reports one. */
  readonly operation?: string;
  /** Opaque observation identity, retained so a projection can cite what it showed. */
  readonly observation_ref?: string;
}

export type RefusalReason =
  | "unknown_namespace"
  | "invalid_expression"
  | "outside_scope"
  | "not_found"
  | "unresolved_entity"
  | "not_permitted"
  | "source_too_large";

export interface SourceBinding {
  readonly expression: string;
  readonly namespace: SourceNamespace | "unknown";
  readonly status: BindingStatus;
  /** Set only for `bound`; one of `OBSERVATION_STATUSES`. */
  readonly observation?: ObservationStatus;
  readonly value: unknown;
  readonly sha256?: string;
  /** Stable machine code, present whenever `status` is not `bound`. */
  readonly reason?: RefusalReason;
  readonly detail?: string;
  /** True when the value came from the proposing agent rather than from an authority. */
  readonly agent_supplied: boolean;
  /** Present for `blocked` only: the authority that has not yet answered. */
  readonly awaiting?: string;
  readonly operation?: string;
  readonly observation_ref?: string;
}

export interface BindingContext {
  /** Repository root. `file:` sources are resolved under it and may not escape it. */
  readonly root: string;
  /** Resolve a semantic entity reference. `undefined` means "not in this world". */
  readonly resolveEntity: (ref: string) => unknown | undefined;
  /** Resolve a `horizon:` gate or operation state, with its own observation status. */
  readonly resolveHorizon: (key: string) => ObservedValue | undefined;
  /** Agent-supplied values carried with the request, always marked on the binding. */
  readonly agentValues?: Readonly<Record<string, unknown>>;
  /** Non-null when a required authority has not yet answered for that namespace. */
  readonly awaiting?: Partial<Record<SourceNamespace, string>>;
  /** Per-file read cap. Bounds a surface's cost regardless of what the file contains. */
  readonly maxFileBytes?: number;
  /** Whether `file:` reads are permitted at all for this route (a remote route sets false). */
  readonly allowFileReads?: boolean;
}

const DEFAULT_MAX_FILE_BYTES = 64 * 1024;

function refused(expression: string, namespace: SourceBinding["namespace"], reason: RefusalReason, detail: string): SourceBinding {
  return { expression, namespace, status: "refused", value: null, reason, detail, agent_supplied: false };
}

function blocked(expression: string, namespace: SourceNamespace, awaiting: string): SourceBinding {
  return {
    expression,
    namespace,
    status: "blocked",
    value: null,
    agent_supplied: false,
    awaiting,
    detail: `${awaiting} has not answered for ${namespace}: sources yet`,
  };
}

/** Wrap an authority's own observation without changing its status. */
function observed(expression: string, namespace: SourceNamespace, seen: ObservedValue): SourceBinding {
  return {
    expression,
    namespace,
    status: "bound",
    observation: seen.status,
    value: seen.value ?? null,
    agent_supplied: false,
    ...(seen.operation === undefined ? {} : { operation: seen.operation }),
    ...(seen.observation_ref === undefined ? {} : { observation_ref: seen.observation_ref }),
  };
}

/** Resolve one source expression to a typed observation or an explicit refusal. */
export function bindSource(expression: string, context: BindingContext): SourceBinding {
  const parsed = parseSourceExpression(expression);
  if (!parsed.ok) return refused(expression, "unknown", "invalid_expression", parsed.reason);

  const pending = context.awaiting?.[parsed.namespace];
  if (pending !== undefined) return blocked(expression, parsed.namespace, pending);

  switch (parsed.namespace) {
    case "semantic": {
      const ref = `semantic:${parsed.path[0]}`;
      const entity = context.resolveEntity(ref);
      if (entity === undefined) {
        return refused(expression, "semantic", "unresolved_entity", `${ref} is not in the bound world`);
      }
      return observed(expression, "semantic", { status: "available", value: entity, operation: "horizon.semantics.world" });
    }
    case "horizon": {
      const key = parsed.path.join("/");
      const seen = context.resolveHorizon(key);
      if (seen === undefined) {
        return refused(expression, "horizon", "not_found", `horizon:${key} is not a known gate or operation state`);
      }
      return observed(expression, "horizon", seen);
    }
    case "agent": {
      // Agent values resolve, but they are *reported* as agent-supplied: there is no
      // authority behind them, and the mark keeps them distinct from an observed value.
      const key = parsed.path.join("/");
      const supplied = context.agentValues ?? {};
      if (!Object.prototype.hasOwnProperty.call(supplied, key)) {
        return refused(expression, "agent", "not_found", `agent:${key} was not supplied with this request`);
      }
      return {
        expression,
        namespace: "agent",
        status: "bound",
        observation: "available",
        value: supplied[key],
        agent_supplied: true,
      };
    }
    case "file":
      return bindFile(expression, parsed.path, context);
  }
}

function realpathOrNull(target: string): string | null {
  try {
    return fs.realpathSync(target);
  } catch {
    return null;
  }
}

/**
 * Read a frozen repository file. Containment is checked on the *real* path after symlink
 * resolution, so a committed symlink cannot tunnel out of the permitted root, and the size
 * cap is applied to the resolved file so a small link cannot hide a large target.
 */
function bindFile(expression: string, segments: readonly string[], context: BindingContext): SourceBinding {
  if (context.allowFileReads === false) {
    return refused(expression, "file", "not_permitted", "this route does not permit repository reads");
  }
  const rootSegment = segments[0];
  const relative = segments.join("/");
  if (rootSegment === undefined || !(FILE_ROOTS as readonly string[]).includes(rootSegment)) {
    return refused(expression, "file", "outside_scope", `file:${relative} is outside the permitted roots`);
  }

  const realRoot = realpathOrNull(context.root);
  if (realRoot === null) return refused(expression, "file", "not_found", "repository root is unreadable");
  const allowedRoots = [path.join(realRoot, rootSegment), path.join(realRoot, ".agents", rootSegment)];
  const candidates = [path.resolve(realRoot, relative), path.resolve(realRoot, ".agents", relative)];
  const max = context.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;

  for (const candidate of candidates) {
    const real = realpathOrNull(candidate);
    if (real === null) continue;
    if (!allowedRoots.some((allowed) => real === allowed || real.startsWith(allowed + path.sep))) {
      return refused(expression, "file", "outside_scope", `file:${relative} resolves outside ${rootSegment}/`);
    }
    let stat: fs.Stats;
    try {
      stat = fs.statSync(real);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    if (stat.size > max) {
      return refused(expression, "file", "source_too_large", `${stat.size} bytes exceeds the ${max} byte cap`);
    }
    let text: string;
    try {
      text = fs.readFileSync(real, "utf8");
    } catch {
      continue;
    }
    const digest = createHash("sha256").update(text).digest("hex");
    return {
      expression,
      namespace: "file",
      status: "bound",
      observation: text.length === 0 ? "empty" : "available",
      value: text,
      sha256: digest,
      agent_supplied: false,
      operation: "horizon.file.read",
    };
  }
  return refused(expression, "file", "not_found", `file:${relative} does not exist under ${rootSegment}/`);
}
