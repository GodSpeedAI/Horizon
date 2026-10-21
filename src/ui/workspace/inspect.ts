/**
 * Inspection beside the shared focus (T10, REQ-STACK-005, REQ-UI-007, REQ-SAFE-004).
 *
 * Two read-only observations are attached to the *same* navigation frame the terminal and the GUI
 * already render:
 *
 *  - the world debugger answers one of its seven questions about the frame's focus
 *    (`src/domain/debugger.ts`), and
 *  - Context Kernel retrieval is cited beside that focus, reached only through the boot-registered
 *    `horizon.context.query_reference` capability (REQ-STACK-010) and never read directly.
 *
 * Nothing here can change what is available. A retrieval answer is flattened into citations whose
 * class is literally `untrusted_reference`, so even a retrieved instruction reaches the surface as
 * quoted reference text, not as an action, an affordance, a label or an authority statement. A
 * debugger answer restates `authority: false` and `settles: false` for the same reason.
 */
import { runDebugger, type DebuggerAnswer, type DebuggerArguments, type DebuggerOperation, type DebuggerSources } from "../../domain/debugger.ts";
import type { NavigationFrame } from "../../domain/navigation.ts";
import type { OperationalLinkV1, OperationalObjectV1 } from "../../domain/operational.ts";
import type { WorkspaceDebugger, WorkspaceReference, WorkspaceRetrieval } from "./model.ts";

/**
 * What this surface needs from a retrieval answer, stated structurally.
 *
 * Declared here rather than imported from the Context Kernel client so the UI depends on no
 * adapter: the client's answer is assignable to this shape, and the surface cannot reach the
 * client's behaviour, its transport or its corpus scope through a type import (REQ-STACK-010).
 */
export interface RetrievalAnswer {
  readonly outcome: string;
  readonly corpus_id: string | null;
  readonly query: string | null;
  readonly results: readonly {
    readonly excerpt: string;
    readonly heading: string | null;
    readonly score: number | null;
    readonly citation: {
      readonly uri: string;
      readonly anchor: string | null;
      readonly source_id?: string | null;
      readonly version?: string | null;
    };
  }[];
  readonly detail: string;
  readonly truncated: boolean;
  readonly retrieval: { readonly observed: boolean; readonly ok: boolean; readonly detail: string };
}

/**
 * The answer flattened for display.
 *
 * Every value keeps its class and its source, and `unknown` keeps the `missing_source` that says
 * what the source does not record — an absence must never read as "no relation".
 */
export function debuggerView(answer: DebuggerAnswer): WorkspaceDebugger {
  return Object.freeze({
    operation: answer.operation,
    question: answer.question,
    status: answer.status,
    code: answer.code,
    message: answer.message,
    values: Object.freeze(
      answer.values.map((entry) =>
        Object.freeze({
          key: entry.key,
          value: entry.value,
          class: entry.class,
          source: entry.source,
          missing_source: entry.missing_source ?? null,
        }),
      ),
    ),
    unknown_remainder: Object.freeze([...answer.unknown_remainder]),
    authority: false as const,
    settles: false as const,
    compared_checkpoint: answer.scope.comparison ?? answer.scope.checkpoint_ref,
  });
}

/**
 * Flatten a retrieval answer into citations.
 *
 * `class` is a literal, not a copy of anything the server said: the Context Kernel cannot promote
 * its own text by asserting a class, and a result with no anchor still keeps its URI.
 */
export function retrievalView(answer: RetrievalAnswer): WorkspaceRetrieval {
  const references: WorkspaceReference[] = answer.results.map((result): WorkspaceReference =>
    Object.freeze({
      uri: result.citation.uri,
      anchor: result.citation.anchor ?? null,
      heading: result.heading,
      excerpt: result.excerpt,
      score: result.score ?? null,
      source_id: result.citation.source_id ?? null,
      version: result.citation.version ?? null,
      class: "untrusted_reference" as const,
    }),
  );
  return Object.freeze({
    corpus_id: answer.corpus_id,
    query: answer.query,
    outcome: answer.outcome,
    detail: answer.detail,
    truncated: answer.truncated,
    liveness: Object.freeze({
      observed: answer.retrieval.observed,
      ok: answer.retrieval.ok,
      detail: answer.retrieval.detail,
    }),
    references: Object.freeze(references),
    canonical: false as const,
  });
}

/** What an inspection needs from the runtime: one capability, and one checkpoint read. */
export interface InspectionRuntime {
  readonly invoke: (query: string) => Promise<RetrievalAnswer>;
  /**
   * Read a checkpoint the caller names (diff/timeline), or report that it cannot be read.
   *
   * `ok: false` means the checkpoint could not be restored, which the debugger reports as
   * `unavailable`. When `ok`, the rows are the ones that checkpoint held, so a comparison is made
   * against them rather than against the current rows relabelled.
   */
  readonly readSnapshotAt: (checkpointRef: string) => Promise<{
    readonly ok: boolean;
    readonly objects?: readonly OperationalObjectV1[];
    readonly links?: readonly OperationalLinkV1[];
  }>;
}

export interface InspectionRequest {
  readonly frame: NavigationFrame;
  readonly sources: DebuggerSources;
  readonly operation: DebuggerOperation;
  /**
   * The question `diff`/`timeline` ask about another checkpoint. Defaults to the frame's own
   * checkpoint; naming another one needs `runtime` to read it.
   */
  readonly checkpoint_ref?: string;
  /**
   * The operation's own arguments (`proposal_ref`/`change` for `counterfactual`, `selects`/`expect`
   * for `replay`, the bounds for `impact`, …). Omitted means the operation answers under its own
   * defaults — which for `impact` is a refusal, because a bound is required rather than defaulted.
   */
  readonly arguments?: Omit<DebuggerArguments, "operation">;
  /** Reference query. Absent means "do not ask Context Kernel" — not "ask for nothing". */
  readonly query?: string | null;
}

/**
 * The argument object for one operation: its own arguments, never silently dropped.
 *
 * A caller's arguments are passed through unchanged so the debugger, not this adapter, decides
 * whether they are valid. Refusals therefore stay typed and attributable to the operation.
 */
function argumentsFor(request: InspectionRequest): DebuggerArguments {
  const extra = (request.arguments ?? {}) as Record<string, unknown>;
  switch (request.operation) {
    case "diff":
    case "timeline":
      return {
        operation: request.operation,
        ...extra,
        ...(request.checkpoint_ref === undefined ? {} : { checkpoint_ref: request.checkpoint_ref }),
      };
    case "why":
    case "impact":
    case "counterfactual":
    case "reach":
    case "replay":
      return { operation: request.operation, ...extra } as DebuggerArguments;
  }
}

/**
 * Answer the selected question, and cite reference material beside it when a query is given.
 *
 * A `diff` or `timeline` naming a checkpoint reads it through the caller's `readSnapshotAt`; a
 * checkpoint that cannot be read is passed on as `read: false`, which the debugger reports as
 * `unavailable` rather than as an empty comparison (NE-08). The frame's own checkpoint is read the
 * same way: the debugger, not this function, decides whether that is `same-checkpoint` or a
 * comparison, so the read must not be skipped for it.
 */
export async function inspect(
  request: InspectionRequest,
  runtime: InspectionRuntime,
): Promise<{ readonly debugger: WorkspaceDebugger; readonly retrieval: WorkspaceRetrieval | null }> {
  let sources = request.sources;
  const names = request.checkpoint_ref !== undefined;
  if (names && (request.operation === "diff" || request.operation === "timeline")) {
    const ref = request.checkpoint_ref as string;
    const read = await runtime.readSnapshotAt(ref);
    // The rows of another checkpoint are the debugger's business only through `other_checkpoint`;
    // the frame's own rows stay the ones the surface already rendered.
    sources = {
      ...sources,
      other_checkpoint: { ref, read: read.ok, objects: read.objects ?? [], links: read.links ?? [] },
    };
  }
  const answer = runDebugger(sources, argumentsFor(request));
  let retrieval: WorkspaceRetrieval | null = null;
  const query = request.query ?? "";
  if (query.trim() !== "") {
    try {
      retrieval = retrievalView(await runtime.invoke(query));
    } catch {
      // A capability that cannot be reached is `unavailable`; it is never reported as `absent`,
      // because "nobody configured a kernel" and "the kernel did not answer" are different facts.
      retrieval = missingRetrieval("unavailable", "the context reference capability could not be reached");
    }
  }
  return { debugger: debuggerView(answer), retrieval };
}

/** The retrieval row for a fact no server answered, kept beside the probe result as a value. */
export function missingRetrieval(outcome: string, detail: string): WorkspaceRetrieval {
  return Object.freeze({
    corpus_id: null,
    query: null,
    outcome,
    detail,
    truncated: false,
    liveness: Object.freeze({ observed: false, ok: false, detail: "no retrieval request was answered" }),
    references: Object.freeze([]),
    canonical: false as const,
  });
}

