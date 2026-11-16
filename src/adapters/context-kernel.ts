/**
 * Context Kernel reference access (T10, REQ-STACK-005, REQ-STACK-010).
 *
 * ## What this is
 *
 * The one place Horizon asks the sibling Context Kernel for cited reference material. It speaks
 * the server's own JSON-RPC line protocol (`query_reference`, `get_status`) — the process rejects
 * MCP `initialize`, so there is no handshake to perform — and it maps every answer into this
 * module's closed outcome set. Nothing here interprets a sentence: an excerpt is an opaque string
 * that carries a citation and nothing else.
 *
 * ## Why it lives behind a capability
 *
 * REQ-STACK-010 forbids the navigation controller and renderers from holding a second client to
 * an external owner. The application registers `horizon.context.query_reference` at boot; the
 * capability invokes this adapter. The adapter is therefore reachable only as a recorded Cognate
 * invocation, which is also what makes a refused or degraded retrieval observable.
 *
 * ## Fail closed, fail small
 */
import { spawn } from "node:child_process";
import { z } from "zod";

const SCHEMA = "horizon.context-reference/1" as const;

/**
 * The closed observation set. These are different facts and are never collapsed:
 *  - `results`      the server answered with at least one cited passage
 *  - `no-match`     the server answered, and nothing in the corpus matched
 *  - `unavailable`  no process, no line, a crash, a timeout, or a socket-level failure
 *  - `denied`       the server refused this corpus or observer; no content is disclosed
 *  - `invalid_response` the server spoke, but not in the contracted shape
 *  - `invalid_argument` Horizon refused before sending anything
 *  - `absent`       no Context Kernel binding was configured for this application
 *  - `scope_denied` Horizon refused the binding's corpus as out of this deployment's scope
 */
export const CONTEXT_OUTCOMES = [
  "results",
  "no-match",
  "unavailable",
  "denied",
  "invalid_response",
  "invalid_argument",
  "absent",
  "scope_denied",
] as const;
export type ContextOutcome = (typeof CONTEXT_OUTCOMES)[number];

/** A corpus id as Context Kernel expects it: an opaque slug, never a path (NE-04). */
export const CorpusId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "corpus_id MUST be an opaque id, not a path");

export const CitationV1 = z
  .object({
    /** Stable citation handle from Context Kernel (`context:<corpus>/<document>#<chunk>`). */
    citation_ref: z.string().min(1),
    uri: z.string().min(1),
    anchor: z.string().min(1).nullable(),
    corpus_id: z.string().min(1),
    source_id: z.string().min(1).nullable(),
    version: z.string().min(1).nullable(),
  })
  .strict();
export type CitationV1 = z.infer<typeof CitationV1>;

export const ReferenceResultV1 = z
  .object({
    schema: z.literal(SCHEMA),
    result_id: z.string().min(1),
    title: z.string().nullable(),
    heading: z.string().nullable(),
    /** The retrieved bytes, as a citation carries them. Never interpreted, never executed. */
    excerpt: z.string(),
    citation: CitationV1,
    score: z.number().nullable(),
  })
  .strict();
export type ReferenceResultV1 = z.infer<typeof ReferenceResultV1>;

export interface ContextReferenceAnswer {
  readonly schema: typeof SCHEMA;
  readonly outcome: ContextOutcome;
  readonly corpus_id: string | null;
  readonly query: string | null;
  readonly results: readonly ReferenceResultV1[];
  /** A bounded, non-content explanation of the outcome. Never carries retrieved text. */
  readonly detail: string;
  readonly truncated: boolean;
  /**
   * Liveness of the retrieval subsystem, observed by a second `get_status` request that used the
   * same transport. `observed: false` means no status request was made, which is different from
   * "the server said nothing": an answer never claims liveness it did not see.
   */
  readonly retrieval: { readonly observed: boolean; readonly ok: boolean; readonly detail: string };
  /**
   * Literal: retrieved reference text is scoped/cited material, not canonical organizational
   * truth (REQ-STACK-005), and reading it grants nothing.
   */
  readonly authority: { readonly canonical: false; readonly grants_authority: false };
}

const REFUSED: ContextReferenceAnswer["authority"] = { canonical: false, grants_authority: false };

function answer(
  outcome: ContextOutcome,
  detail: string,
  extra: Partial<Pick<ContextReferenceAnswer, "corpus_id" | "query" | "results" | "truncated" | "retrieval">> = {},
): ContextReferenceAnswer {
  return {
    schema: SCHEMA,
    outcome,
    corpus_id: extra.corpus_id ?? null,
    query: extra.query ?? null,
    results: extra.results ?? [],
    detail,
    truncated: extra.truncated ?? false,
    retrieval: extra.retrieval ?? { observed: false, ok: false, detail: "retrieval liveness was not observed" },
    authority: REFUSED,
  };
}

/** The wire subset this adapter depends on, as confirmed against the live server. */
const WireResult = z.object({
  result_id: z.string().min(1).optional(),
  /** Observed `null` on a live corpus that had no library identity; only a string is an identity. */
  canonical_id: z.string().min(1).nullable().optional(),
  chunk_id: z.string().min(1).nullable().optional(),
  title: z.string().nullable().optional(),
  heading: z.string().nullable().optional(),
  excerpt: z.string().optional(),
  citation: z.object({ anchor: z.string().nullable().optional(), uri: z.string().min(1) }),
  score: z.number().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
const WireEnvelope = z.object({
  results: z.array(WireResult),
  query_id: z.string().optional(),
  truncated: z.boolean().optional(),
});

/**
 * One request line out, at most one answer line back. The server is a local stdio service that
 * reads one JSON-RPC line, answers one line, and exits; this is the whole transport surface an
 * adapter needs, so tests can drive the mapping without spawning anything.
 */
export type ContextTransport = (line: string, timeoutMs: number) => Promise<Wire>;

export interface ContextKernelOptions {
  /** Absolute path to the `context-kernal` binary, or its name on PATH. */
  readonly command: string;
  /** Extra `serve` arguments, e.g. `--database` / `--data-dir`, already split into argv. */
  readonly args?: readonly string[];
  readonly configPath?: string;
  readonly timeoutMs?: number;
  readonly env?: Readonly<Record<string, string>>;
  /** Injected transport. Omitted in production: the adapter spawns `command`. */
  readonly transport?: ContextTransport;
  /** The only corpus this binding may ask for. Required: an unscoped adapter is not built. */
  readonly scope: ContextKernelScope;
}

export interface ContextReferenceRequest {
  readonly corpus_id: string;
  readonly query: string;
  readonly top_k?: number;
}

/**
 * What one deployment is allowed to ask this Context Kernel for. The binding is a whole: no
 * corpus, no adapter. A returned adapter is therefore never in the `absent` state. Reaching any
 * other corpus is refused here, before a process is spawned (NE-03, NE-04), so a caller cannot
 * widen its own scope by naming a different `canonical_id`.
 */
export interface ContextKernelScope {
  readonly corpus_id: string;
}

export interface ContextKernelAdapter {
  /** The corpus this adapter is bound to; the only one it will ask for. */
  readonly scope: ContextKernelScope;
  /** Typed observation of `query_reference`. Never throws for a server-side failure. */
  queryReference(request: ContextReferenceRequest): Promise<ContextReferenceAnswer>;
  /** Typed observation of `get_status`: liveness, with no retrieval content. */
  status(): Promise<{ readonly ok: boolean; readonly detail: string }>;
}

const DEFAULT_TOP_K = 3;
const MAX_TOP_K = 20;
const DEFAULT_TIMEOUT_MS = 8_000;

type Wire = { readonly ok: true; readonly line: string } | { readonly ok: false; readonly outcome: ContextOutcome; readonly detail: string };

/**
 * Spawn one short-lived server process per request, write one request, read one line, kill it.
 *
 * The server is a local stdio service; a request must not outlive its caller, and a hung server
 * must not hold navigation. A timeout is `unavailable`, never an empty answer. stderr is drained
 * but never surfaced: it can contain host paths and is not part of an answer.
 */
function spawnTransport(options: ContextKernelOptions): ContextTransport {
  const args = [
    ...(options.configPath === undefined ? [] : ["--config", options.configPath]),
    "serve",
    ...(options.args ?? []),
  ];

  return (line, timeoutMs) =>
    new Promise<Wire>((resolve) => {
      let settled = false;
      let buffered = "";
      let child: ReturnType<typeof spawn> | undefined;

      // Declared before `finish` closes over it, and assigned before `finish` can run, so neither
      // the timer nor the sync-spawn failure path can touch a binding in its temporal dead zone.
      let timer: ReturnType<typeof setTimeout> | undefined;

      const finish = (value: Wire): void => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        try {
          child?.kill("SIGKILL");
        } catch {
          // Already gone.
        }
        resolve(value);
      };

      try {
        child = spawn(options.command, args, {
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env, ...(options.env ?? {}) },
        });
      } catch (error) {
        finish({ ok: false, outcome: "unavailable", detail: `context kernel could not be started (${(error as Error).name})` });
        return;
      }

      timer = setTimeout(
        () => finish({ ok: false, outcome: "unavailable", detail: `context kernel did not answer within ${timeoutMs} ms` }),
        timeoutMs,
      );

      child.on("error", (error: Error) => finish({ ok: false, outcome: "unavailable", detail: `context kernel could not be started (${error.name})` }));
      child.stderr?.on("data", () => undefined);
      child.stdout?.on("data", (chunk: Buffer) => {
        buffered += chunk.toString("utf8");
        const newline = buffered.indexOf("\n");
        if (newline >= 0) finish({ ok: true, line: buffered.slice(0, newline) });
      });
      child.on("close", (code) => finish({ ok: false, outcome: "unavailable", detail: `context kernel exited with code ${code ?? "null"} before answering` }));
      child.stdin?.on("error", () => undefined);
      child.stdin?.write(`${line}\n`);
    });
}

/** Tools are addressed by name inside `tools/call`, as the server's dispatch expects. */
function requestLine(name: string, args: Record<string, unknown>): string {
  return JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
}

const asText = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);

export function createContextKernelAdapter(options: ContextKernelOptions): ContextKernelAdapter {
  const transport = options.transport ?? spawnTransport(options);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const bound = CorpusId.safeParse(options.scope.corpus_id);
  // A malformed binding cannot reach `outcome: "absent"` without rewriting the memory: it is
  // `scope_denied`, so a refusal is never retold as an absent configuration.
  const scope: ContextKernelScope = Object.freeze(bound.success ? { corpus_id: bound.data } : { corpus_id: options.scope.corpus_id });
  const adapter: ContextKernelAdapter = {
    scope,
    async queryReference(request) {
      if (!bound.success) {
        return answer("scope_denied", "the configured corpus is not an opaque corpus id, so no request is sent", {
          corpus_id: null,
          query: typeof request.query === "string" ? request.query : null,
        });
      }
      if (request.corpus_id !== bound.data) {
        return answer("scope_denied", "this application is bound to a different corpus; no request is sent", {
          corpus_id: bound.data,
          query: typeof request.query === "string" ? request.query : null,
        });
      }
      const corpus = CorpusId.safeParse(request.corpus_id);
      const query = z.string().trim().min(1).max(2_000).safeParse(request.query);
      const topK = request.top_k ?? DEFAULT_TOP_K;
      if (!corpus.success) return answer("invalid_argument", "corpus_id is not an opaque corpus id");
      if (!query.success) {
        return answer("invalid_argument", "query must be a non-empty string of at most 2000 characters", { corpus_id: corpus.data });
      }
      if (!Number.isInteger(topK) || topK < 1 || topK > MAX_TOP_K) {
        return answer("invalid_argument", `top_k must be an integer between 1 and ${MAX_TOP_K}`, { corpus_id: corpus.data });
      }

      const wire = await transport(
        requestLine("query_reference", { canonical_id: corpus.data, query: query.data, top_k: topK }),
        timeoutMs,
      );
      const scope = { corpus_id: corpus.data, query: query.data };
      if (!wire.ok) return answer(wire.outcome, wire.detail, scope);

      let parsed: unknown;
      try {
        parsed = JSON.parse(wire.line);
      } catch {
        return answer("invalid_response", "context kernel answered with a line that is not JSON", scope);
      }
      if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
        const code = (parsed as { error?: { code?: unknown } }).error?.code;
        const denied = code === -32001 || code === -32003;
        return answer(
          denied ? "denied" : "invalid_response",
          denied ? "context kernel refused this corpus for this caller; no content is disclosed" : "context kernel returned an error object",
          scope,
        );
      }
      const envelope = WireEnvelope.safeParse((parsed as { result?: unknown }).result ?? parsed);
      if (!envelope.success) return answer("invalid_response", "context kernel answered outside the query_reference contract", scope);

      const results: ReferenceResultV1[] = [];
      for (const item of envelope.data.results) {
        const citationRef =
          item.result_id ?? (item.canonical_id !== undefined && item.chunk_id !== undefined ? `${item.canonical_id}#${item.chunk_id}` : undefined);
        if (citationRef === undefined) return answer("invalid_response", "a result carried no citation identity", scope);
        const metadata = item.metadata ?? {};
        results.push({
          schema: SCHEMA,
          result_id: citationRef,
          title: item.title ?? null,
          heading: item.heading ?? null,
          excerpt: item.excerpt ?? "",
          citation: {
            citation_ref: citationRef,
            uri: item.citation.uri,
            anchor: item.citation.anchor ?? null,
            corpus_id: asText(metadata.corpus_id) ?? corpus.data,
            source_id: asText(metadata.source_id),
            version: asText(metadata.version),
          },
          score: item.score ?? null,
        });
      }
      // Liveness is observed, never assumed: a second request over the same transport reports whether
      // the retrieval subsystem is actually up, so `results` is never read as "retrieval is healthy".
      const liveness = await adapter.status();
      const retrieval = { observed: true as const, ok: liveness.ok, detail: liveness.detail };
      if (results.length === 0) return answer("no-match", "the corpus matched nothing for this query", { ...scope, retrieval });
      return answer("results", `${results.length} cited passage${results.length === 1 ? "" : "s"}`, {
        corpus_id: corpus.data,
        query: query.data,
        results,
        truncated: envelope.data.truncated ?? false,
        retrieval,
      });
    },

    async status() {
      const wire = await transport(requestLine("get_status", {}), timeoutMs);
      if (!wire.ok) return { ok: false, detail: wire.detail };
      try {
        const parsed = JSON.parse(wire.line) as { result?: { retrieval?: unknown } };
        return { ok: true, detail: typeof parsed.result?.retrieval === "object" ? "retrieval subsystem reported" : "status answered" };
      } catch {
        return { ok: false, detail: "status answered with a line that is not JSON" };
      }
    },
  };
  return adapter;
}
