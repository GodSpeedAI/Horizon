import type { Component, HandlerContext } from "@godspeedai/cognate-kernel-api";
import {
  createContextKernelAdapter,
  type ContextKernelAdapter,
  type ContextKernelOptions,
  type ContextReferenceAnswer,
} from "../adapters/context-kernel.ts";
import type { ContextKernelConfig } from "../config/types.ts";

export const CONTEXT_REFERENCE = {
  id: "horizon.context.query_reference",
  version: "1.0.0",
} as const;

/** Input shape accepted from a caller. Everything beyond these fields is rejected, not ignored. */
const REQUEST_FIELDS = new Set(["operation", "corpus_id", "query", "top_k"]);

const REFUSED = Object.freeze({ canonical: false as const, grants_authority: false as const });
const NOT_OBSERVED = Object.freeze({ observed: false, ok: false, detail: "no request was sent" });

/**
 * The absent binding, as a value. When no Context Kernel is configured there is no adapter and no
 * process: the capability answers `absent` from memory, so Horizon never reports a server as down
 * when nobody configured a server (REQ-STACK-005).
 */
const ABSENT: ContextReferenceAnswer = Object.freeze({
  schema: "horizon.context-reference/1" as const,
  outcome: "absent" as const,
  corpus_id: null,
  query: null,
  results: Object.freeze([]),
  detail: "no Context Kernel binding is configured for this deployment",
  truncated: false,
  retrieval: Object.freeze({ observed: false, ok: false, detail: "no retrieval subsystem is bound" }),
  authority: REFUSED,
});

/**
 * Split a configured argv into the adapter's options.
 *
 * The argv is `[binary, ...args]`, exactly as `context_kernel.command` is written, so the config
 * stays one honest description of what runs. `serve` and the storage flags are the server's argv
 * and are passed through; nothing is inferred from a model name or a path.
 */
function optionsOf(config: ContextKernelConfig): ContextKernelOptions | { readonly error: string } {
  const [command, ...args] = config.command;
  if (command === undefined || command.trim() === "") return { error: "context_kernel.command is empty" };
  return { command, args, scope: { corpus_id: config.corpus_id }, timeoutMs: 20_000 };
}


export interface ContextComponentOptions {
  /** Injected in tests so the component never needs a real server. Omitted in production. */
  readonly adapter?: ContextKernelAdapter;
}

/**
 * Register retrieval as a Cognate capability rather than calling the adapter from a route.
 *
 * The route therefore reaches the Context Kernel only through the runtime's policy and the
 * boot-recorded binding: there is no second path, and no module-level singleton a caller could
 * import (REQ-STACK-010). The capability is read-only, so its answer is an observation, never an
 * event: it writes nothing and settles nothing.
 */
export function contextReferenceComponent(
  config: ContextKernelConfig | undefined,
  options: ContextComponentOptions = {},
): Component {
  return {
    id: "horizon.context-adapter",
    provides: [CONTEXT_REFERENCE],
    activate(fiber) {
      let adapter: ContextKernelAdapter | null = options.adapter ?? null;
      let notBuilt: string | null = null;
      if (config !== undefined && adapter === null) {
        const built = optionsOf(config);
        if ("error" in built) notBuilt = built.error;
        else adapter = createContextKernelAdapter(built);
      }
      const bound = adapter;

      fiber.provide(CONTEXT_REFERENCE, async (input: unknown, context: HandlerContext) => {
        if (bound === null) {
          return { ...ABSENT, detail: notBuilt ?? ABSENT.detail, correlation_ref: context.correlationId };
        }
        const request = parseRequest(input, bound.scope.corpus_id);
        if ("error" in request) {
          return {
            schema: "horizon.context-reference/1" as const,
            outcome: "invalid_argument" as const,
            corpus_id: bound.scope.corpus_id,
            query: null,
            results: Object.freeze([]),
            detail: request.error,
            truncated: false,
            retrieval: NOT_OBSERVED,
            authority: REFUSED,
            correlation_ref: context.correlationId,
          };
        }
        // A throwing adapter is a transport defect, not an answer. It is still reported as
        // `unavailable` so a route cannot turn a crash into a 500 that reads like success.
        try {
          return { ...(await bound.queryReference(request.value)), correlation_ref: context.correlationId };
        } catch (error) {
          return {
            ...ABSENT,
            outcome: "unavailable" as const,
            corpus_id: bound.scope.corpus_id,
            query: request.value.query,
            detail: `retrieval failed before answering (${error instanceof Error ? error.name : "unknown"})`,
            correlation_ref: context.correlationId,
          };
        }
      });
    },
  };
}

type ParsedRequest = { readonly value: { readonly corpus_id: string; readonly query: string; readonly top_k?: number } };

function parseRequest(input: unknown, boundCorpus: string): ParsedRequest | { readonly error: string } {
  if (typeof input !== "object" || input === null) return { error: "retrieval input must be an object" };
  const record = input as Record<string, unknown>;
  const extra = Object.keys(record).filter((key) => !REQUEST_FIELDS.has(key));
  if (extra.length > 0) return { error: `retrieval input has undeclared field(s): ${extra.join(", ")}` };
  // Sending is addressed by operation, not by implication: a caller must say what it is asking.
  if (record.operation !== undefined && record.operation !== "query_reference") {
    return { error: "the only retrieval operation is query_reference" };
  }
  const corpus = record.corpus_id ?? boundCorpus;
  if (typeof corpus !== "string") return { error: "corpus_id must be a string" };
  if (typeof record.query !== "string") return { error: "query must be a string" };
  const topK = record.top_k;
  if (topK !== undefined && typeof topK !== "number") return { error: "top_k must be a number" };
  return { value: { corpus_id: corpus, query: record.query, ...(topK === undefined ? {} : { top_k: topK }) } };
}
