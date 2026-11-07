/**
 * The GitHub side of the connector: `gh api` run as a child process under the operator's own login.
 * Horizon stores no token and never reads one; `gh` holds the login. Arguments are always an array (never a shell line),
 * and a request body goes in on standard input, so a title or body containing quotes, markdown or script is only ever data.
 *
 * Every failure becomes a `GhError` with a kind and plain words. The words are what the status bar and the issue's
 * comment say; nothing here guesses success.
 */
export type GhErrorKind =
  | "missing"
  | "not_logged_in"
  | "scope"
  | "forbidden"
  | "rate_limited"
  | "server"
  | "not_found"
  | "invalid"
  | "offline"
  | "timeout"
  | "too_large"
  | "garbled"
  | "other";

export class GhError extends Error {
  override readonly name = "GhError";
  constructor(
    readonly kind: GhErrorKind,
    /** One plain sentence a person can read. */
    readonly words: string,
    readonly options: { readonly status?: number; readonly retryAtMs?: number; readonly detail?: string } = {},
  ) {
    super(words);
  }
  get status(): number | undefined {
    return this.options.status;
  }
  /** When a rate limit lifts (epoch ms), if GitHub said. */
  get retryAtMs(): number | undefined {
    return this.options.retryAtMs;
  }
  /** Worth trying the same call again later without anyone changing anything. */
  get transient(): boolean {
    return this.kind === "offline" || this.kind === "server" || this.kind === "timeout" || this.kind === "rate_limited";
  }
}

export interface GhClient {
  /** REST: `method` and `path` such as `repos/o/r/issues`. A `body` is sent as JSON on standard input. */
  api(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown): Promise<any>;
  graphql(query: string, variables?: Record<string, unknown>): Promise<any>;
}

export interface GhOptions {
  readonly env?: Record<string, string | undefined>;
  readonly timeoutMs?: number;
  /** For rate-limit waits. */
  readonly now?: () => number;
  /** Largest answer read, in bytes. */
  readonly maxBytes?: number;
}

const MAX_BYTES = 16 * 1024 * 1024;
const TOKEN = /\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{16,}/g;
/** Never let a token-shaped string reach a message, even though `gh` does not print one. */
export const redact = (text: string): string => text.replace(TOKEN, "[token removed]");

function splitHeaders(out: string): { status: number | undefined; headers: Map<string, string>; body: string } {
  const match = /^HTTP\/[\d.]+ (\d{3})/.exec(out);
  if (!match) return { status: undefined, headers: new Map(), body: out };
  const end = out.search(/\r?\n\r?\n/);
  const head = end < 0 ? out : out.slice(0, end);
  const body = end < 0 ? "" : out.slice(end).replace(/^\r?\n\r?\n/, "");
  const headers = new Map<string, string>();
  for (const line of head.split(/\r?\n/).slice(1)) {
    const i = line.indexOf(":");
    if (i > 0) headers.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim());
  }
  return { status: Number(match[1]), headers, body };
}

const OFFLINE = /error connecting|dial tcp|no such host|network is unreachable|could not resolve|i\/o timeout|connection (?:refused|reset)|TLS handshake|temporary failure in name resolution|EOF/i;

function waitWords(retryAtMs: number | undefined, now: number): string {
  if (retryAtMs === undefined) return "GitHub says too many requests were made. Horizon is waiting before it tries again.";
  const seconds = Math.max(1, Math.ceil((retryAtMs - now) / 1000));
  const span = seconds >= 90 ? `${Math.ceil(seconds / 60)} minutes` : `${seconds} second${seconds === 1 ? "" : "s"}`;
  return `GitHub says too many requests were made. Horizon is waiting about ${span} and will carry on by itself.`;
}

export function classify(input: { status: number | undefined; headers: Map<string, string>; body: string; stderr: string; now: number }): GhError {
  const { status, headers, body, now } = input;
  const stderr = redact(input.stderr);
  const text = `${stderr} ${body}`;
  const detail = redact(text).slice(0, 300);
  if (/gh auth login|not logged in|authentication required|bad credentials/i.test(text) || status === 401) {
    return new GhError("not_logged_in", "Horizon is not signed in to GitHub. Run `gh auth login` and it will carry on.", { status, detail });
  }
  if (status === 403 || status === 429) {
    const resetSeconds = Number(headers.get("x-ratelimit-reset"));
    const retryAfter = Number(headers.get("retry-after"));
    const limited = status === 429 || headers.get("x-ratelimit-remaining") === "0" || /rate limit|secondary rate|abuse/i.test(text);
    if (limited) {
      const retryAtMs = Number.isFinite(retryAfter) && headers.has("retry-after") ? now + retryAfter * 1000 : Number.isFinite(resetSeconds) && headers.has("x-ratelimit-reset") ? resetSeconds * 1000 : undefined;
      return new GhError("rate_limited", waitWords(retryAtMs, now), { status, ...(retryAtMs !== undefined ? { retryAtMs } : {}), detail });
    }
    if (/scope|Resource not accessible|insufficient|must have (?:admin|push|write)|requires/i.test(text)) {
      return new GhError("scope", "The GitHub sign-in is missing a permission Horizon needs (for the project board: `gh auth refresh -s project`).", { status, detail });
    }
    return new GhError("forbidden", "GitHub refused this request (403). Nothing was changed.", { status, detail });
  }
  if (status === 404 || /\(HTTP 404\)/.test(stderr)) return new GhError("not_found", "GitHub does not have what was asked for (404): the repository or issue is missing or not visible to this sign-in.", { status: 404, detail });
  if ((status !== undefined && status >= 500) || /\(HTTP 5\d\d\)/.test(stderr)) return new GhError("server", "GitHub had a problem on its side (5xx). Horizon will try again.", { status, detail });
  if (status === 422 || /\(HTTP 422\)/.test(stderr)) return new GhError("invalid", "GitHub did not accept what Horizon sent (422). Nothing was changed.", { status: 422, detail });
  if (OFFLINE.test(text)) return new GhError("offline", "GitHub cannot be reached. Steps keep working; Horizon will carry on from its saved place when GitHub is back.", { detail });
  return new GhError("other", "The GitHub command failed in a way Horizon does not recognise. Nothing was changed.", { ...(status !== undefined ? { status } : {}), detail });
}

export function createGh(options: GhOptions = {}): GhClient {
  const now = options.now ?? Date.now;
  const run = async (args: readonly string[], stdin?: string): Promise<any> => {
    let proc: ReturnType<typeof Bun.spawn>;
    try {
      proc = Bun.spawn(["gh", "api", "--include", ...args], {
        env: (options.env ?? process.env) as Record<string, string>,
        stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch (error) {
      if (/ENOENT|not found|no such file/i.test(String(error))) throw new GhError("missing", "The GitHub command line (`gh`) is not installed, so Horizon cannot reach GitHub.");
      throw new GhError("other", "The GitHub command could not be started.", { detail: redact(String(error)).slice(0, 200) });
    }
    let timedOut = false;
    const limit = options.timeoutMs ?? 30_000;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, limit);
    try {
      const max = options.maxBytes ?? MAX_BYTES;
      const [out, err] = await Promise.all([new Response(proc.stdout as ReadableStream).text(), new Response(proc.stderr as ReadableStream).text(), proc.exited]);
      if (timedOut) throw new GhError("timeout", `GitHub did not answer within ${Math.round(limit / 1000)} seconds. Horizon will try again.`);
      if (out.length > max) throw new GhError("too_large", "GitHub sent an answer larger than Horizon reads, so it was refused.");
      const { status, headers, body } = splitHeaders(out);
      if (proc.exitCode !== 0 || (status !== undefined && status >= 400)) throw classify({ status, headers, body, stderr: err, now: now() });
      if (body.trim() === "") return null;
      try {
        return JSON.parse(body);
      } catch {
        throw new GhError("garbled", "GitHub sent an answer Horizon could not read. Nothing was changed.");
      }
    } finally {
      clearTimeout(timer);
    }
  };
  return {
    api: (method, path, body) => run(["-X", method, path, ...(body === undefined ? [] : ["--input", "-"])], body === undefined ? undefined : JSON.stringify(body)),
    async graphql(query, variables = {}) {
      const answer = await run(["graphql", "--input", "-"], JSON.stringify({ query, variables }));
      if (answer && Array.isArray(answer.errors) && answer.errors.length > 0) {
        const text = answer.errors.map((e: { type?: string; message?: string }) => `${e.type ?? ""} ${e.message ?? ""}`).join("; ");
        if (/INSUFFICIENT_SCOPES|scope/i.test(text)) return Promise.reject(new GhError("scope", "The GitHub sign-in is missing a permission Horizon needs (for the project board: `gh auth refresh -s project`).", { detail: redact(text).slice(0, 300) }));
        if (/NOT_FOUND|Could not resolve/i.test(text)) return Promise.reject(new GhError("not_found", "GitHub does not have what was asked for: the organization or board is missing or not visible to this sign-in.", { detail: redact(text).slice(0, 300) }));
        return Promise.reject(new GhError("other", "GitHub answered the board request with an error. Nothing was changed.", { detail: redact(text).slice(0, 300) }));
      }
      return answer?.data;
    },
  };
}
