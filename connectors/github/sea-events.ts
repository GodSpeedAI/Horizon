/**
 * The case keeper as the connector sees it: a few request/reply verbs and an event follower.
 *
 * The follower guarantees, in order and one at a time:
 * - no duplicate: a frame is queued only if its cursor sorts after every cursor already queued (cursors are ULIDs, which
 *   sort in append order);
 * - no gap: after every (re)connect, and on a timer, it reads `events_get_range` from the last queued cursor, so frames the
 *   live stream dropped are found. The live stream is a speed-up; the ranged read is the source of truth;
 * - no skipping: when the handler fails for a frame, that frame is tried again (after the wait the handler's error asks for)
 *   and nothing behind it is delivered first. `cursor()` is the last frame whose handler succeeded.
 */
import { seaForgeCall } from "../../src/adapters/sea-forge-approvals.ts";

export interface EventFrame {
  readonly cursor: string;
  readonly kind: string;
  readonly case_id?: string;
  readonly run_id?: string;
  readonly detail?: unknown;
  readonly committed_at?: string;
}

export interface Keeper {
  readonly socketPath: string;
  readonly actor: { readonly actor_id: string; readonly role: string };
  readonly onBehalfOf?: { readonly actor_id: string; readonly role: string };
  readonly timeoutMs?: number;
}

export class KeeperError extends Error {
  override readonly name = "KeeperError";
  constructor(
    readonly kind: "unreachable" | "refused" | "garbled",
    readonly words: string,
    readonly errorClass?: string,
  ) {
    super(words);
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const isFrame = (v: unknown): v is EventFrame => isRecord(v) && typeof v.cursor === "string" && typeof v.kind === "string";

/** One request. Throws `KeeperError` with words; a reply that is not an object or carries an error is never treated as success. */
export async function keeperCall(keeper: Keeper, request: Record<string, unknown>, write = false): Promise<Record<string, unknown>> {
  let reply: unknown;
  try {
    reply = await seaForgeCall(keeper.socketPath, { ...request, actor: keeper.actor, ...(write && keeper.onBehalfOf ? { on_behalf_of: keeper.onBehalfOf } : {}) }, keeper.timeoutMs ?? 5_000);
  } catch (error) {
    throw new KeeperError("unreachable", `The case keeper could not be reached (${error instanceof Error ? error.message : String(error)}).`);
  }
  if (!isRecord(reply)) throw new KeeperError("garbled", "The case keeper sent an answer Horizon could not read.");
  if (reply.ok === false || typeof reply.error === "string" || typeof reply.error_class === "string") {
    const errorClass = typeof reply.error_class === "string" ? reply.error_class : "error";
    throw new KeeperError("refused", `The case keeper refused this (${errorClass}).`, errorClass);
  }
  return reply;
}

export type FollowState = "connecting" | "following" | "reconnecting" | "stopped" | "cursor_unknown";

export interface FollowOptions {
  readonly keeper: Keeper;
  /** Pass on events after this cursor; null starts at the beginning of the durable ledger. */
  readonly from_cursor: string | null;
  /** Throw to say the write failed; the same frame comes back after `waitMs(error)`. */
  readonly onEvent: (frame: EventFrame) => Promise<void>;
  readonly waitMs?: (error: unknown) => number;
  readonly onState?: (state: FollowState) => void;
  readonly reconnectMs?: number;
  readonly sweepMs?: number;
  readonly pageSize?: number;
}

export interface Follower {
  /** Last cursor whose handler succeeded. */
  cursor(): string | null;
  /** Resolves when everything queued so far has been handled. */
  idle(): Promise<void>;
  stop(): void;
}

export function followEvents(options: FollowOptions): Follower {
  let done: string | null = options.from_cursor;
  let queued: string | null = options.from_cursor;
  const queue: EventFrame[] = [];
  let stopped = false;
  let pumping: Promise<void> | null = null;
  let socket: { end(): void } | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const page = options.pageSize ?? 500;
  const say = (state: FollowState) => options.onState?.(state);

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const pump = (): Promise<void> => {
    if (pumping) return pumping;
    const run = (async () => {
      while (!stopped && queue.length > 0) {
        const frame = queue[0]!;
        try {
          await options.onEvent(frame);
          done = frame.cursor;
          queue.shift();
        } catch (error) {
          await sleep(options.waitMs?.(error) ?? 1_000);
        }
      }
    })().finally(() => {
      if (pumping === run) pumping = null;
    });
    pumping = run;
    return run;
  };
  const enqueue = (frame: EventFrame): void => {
    if (queued !== null && frame.cursor <= queued) return;
    queued = frame.cursor;
    queue.push(frame);
    void pump();
  };

  const catchUp = async (): Promise<boolean> => {
    for (;;) {
      let reply: Record<string, unknown>;
      try {
        reply = await keeperCall(options.keeper, { verb: "events_get_range", ...(queued !== null ? { from_cursor: queued } : {}), limit: page });
      } catch (error) {
        if (error instanceof KeeperError && /cursor/i.test(`${error.errorClass ?? ""}`)) {
          say("cursor_unknown");
          stopped = true;
        }
        return false;
      }
      if (!Array.isArray(reply.events)) return false;
      for (const frame of reply.events) if (isFrame(frame)) enqueue(frame);
      if (reply.events.length < page) return true;
    }
  };

  const scheduleRetry = () => {
    if (stopped) return;
    say("reconnecting");
    retry = setTimeout(() => void connect(), options.reconnectMs ?? 500);
  };

  const connect = async (): Promise<void> => {
    if (stopped) return;
    say("connecting");
    if (!(await catchUp())) return scheduleRetry();
    let buffered = "";
    const decoder = new TextDecoder();
    try {
      await Bun.connect({
        unix: options.keeper.socketPath,
        socket: {
          open(s) {
            socket = s;
            s.write(`${JSON.stringify({ verb: "events_subscribe", ...(queued !== null ? { from_cursor: queued } : {}), actor: options.keeper.actor })}\n`);
            say("following");
          },
          data(_s, chunk) {
            buffered += decoder.decode(chunk, { stream: true });
            for (let nl = buffered.indexOf("\n"); nl >= 0; nl = buffered.indexOf("\n")) {
              const line = buffered.slice(0, nl);
              buffered = buffered.slice(nl + 1);
              try {
                const message = JSON.parse(line) as { type?: string; event?: unknown };
                if (message.type === "event" && isFrame(message.event)) enqueue(message.event);
              } catch {
                // A line that is not JSON is skipped; the ranged read recovers anything it carried.
              }
            }
          },
          close() {
            socket = undefined;
            scheduleRetry();
          },
          error() {
            socket = undefined;
          },
        },
      });
    } catch {
      scheduleRetry();
    }
  };

  void connect();
  const sweep = setInterval(() => void (stopped || catchUp()), options.sweepMs ?? 5_000);

  return {
    cursor: () => done,
    async idle() {
      while (queue.length > 0 && !stopped) await (pumping ?? pump());
    },
    stop() {
      stopped = true;
      clearInterval(sweep);
      if (retry) clearTimeout(retry);
      socket?.end();
      say("stopped");
    },
  };
}
