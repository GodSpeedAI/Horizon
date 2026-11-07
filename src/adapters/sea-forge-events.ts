/**
 * A follower for the case keeper's event stream that resumes from a cursor: no gap and no duplicate.
 *
 * How the two guarantees are kept:
 * - No duplicate: an event is passed on only if its cursor sorts after the last one passed on (cursors are ULIDs, which sort in
 *   append order). A replayed or repeated frame is dropped.
 * - No gap: the live stream may drop frames when its queue is full, and a dropped connection loses whatever was in flight.
 *   So before every subscription, and on a timer while subscribed, the follower reads `events_get_range` from the last cursor
 *   and passes on what it finds, in order. The live stream is a speed-up; the ranged read is the source of truth.
 *
 * The stage 4 GitHub connector reuses this follower.
 */
import { seaForgeCall } from "./sea-forge-wire.ts";

export interface EventFrame {
  readonly cursor: string;
  readonly kind: string;
  readonly case_id?: string;
  readonly run_id?: string;
  readonly detail?: unknown;
  readonly committed_at?: string;
}

export type FollowState = "connecting" | "following" | "reconnecting" | "stopped" | "cursor_unknown";

export interface FollowOptions {
  readonly socketPath: string;
  /** Pass on events after this cursor. Null starts from the beginning of the durable ledger. */
  readonly from_cursor: string | null;
  readonly onEvent: (frame: EventFrame) => void | Promise<void>;
  readonly onState?: (state: FollowState, words: string) => void;
  /** Wait before reconnecting. */
  readonly retryMs?: number;
  /** How often a ranged read double-checks the live stream. */
  readonly sweepMs?: number;
  readonly timeoutMs?: number;
  readonly pageSize?: number;
}

export interface Follower {
  /** The cursor of the last event passed on. A restart can begin here. */
  cursor(): string | null;
  stop(): void;
}

const WORDS: Readonly<Record<FollowState, string>> = {
  connecting: "Connecting to the case keeper's events.",
  following: "Following the case keeper's events.",
  reconnecting: "The case keeper's event stream dropped. Reconnecting, and picking up from the last event seen.",
  stopped: "Not following events.",
  cursor_unknown: "The case keeper does not know the saved place in its events, so it cannot resume. Nothing is shown as current until this is fixed.",
};

const isFrame = (value: unknown): value is EventFrame => typeof value === "object" && value !== null && typeof (value as { cursor?: unknown }).cursor === "string" && typeof (value as { kind?: unknown }).kind === "string";

export function followEvents(options: FollowOptions): Follower {
  let last = options.from_cursor;
  let stopped = false;
  let socket: { end(): void } | undefined;
  let sweep: ReturnType<typeof setInterval> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let chain: Promise<unknown> = Promise.resolve();
  const say = (state: FollowState): void => options.onState?.(state, WORDS[state]);

  /** Deliver in order, one at a time, dropping anything at or before the last cursor. */
  const deliver = (frame: EventFrame): Promise<void> => {
    chain = chain.then(async () => {
      if (stopped || (last !== null && frame.cursor <= last)) return;
      last = frame.cursor;
      await options.onEvent(frame);
    });
    return chain as Promise<void>;
  };

  /** Read what was missed. Returns false when the case keeper could not say. */
  const catchUp = async (): Promise<boolean> => {
    for (;;) {
      let reply: Record<string, unknown>;
      try {
        reply = await seaForgeCall(options.socketPath, { verb: "events_get_range", ...(last !== null ? { from_cursor: last } : {}), limit: options.pageSize ?? 500 }, options.timeoutMs ?? 5_000);
      } catch {
        return false;
      }
      if (typeof reply.error_class === "string" || typeof reply.error === "string" || !Array.isArray(reply.events)) {
        if (/cursor/i.test(`${reply.error_class ?? ""} ${reply.error ?? ""}`)) {
          say("cursor_unknown");
          stopped = true;
        }
        return false;
      }
      const page = reply.events.filter(isFrame);
      for (const frame of page) await deliver(frame);
      await chain;
      if (reply.events.length < (options.pageSize ?? 500)) return true;
    }
  };

  const scheduleRetry = (): void => {
    if (stopped) return;
    say("reconnecting");
    retry = setTimeout(() => void connect(), options.retryMs ?? 500);
  };

  const connect = async (): Promise<void> => {
    if (stopped) return;
    say("connecting");
    if (!(await catchUp())) return scheduleRetry();
    if (stopped) return;
    let buffered = "";
    const decoder = new TextDecoder();
    try {
      await Bun.connect({
        unix: options.socketPath,
        socket: {
          open(s) {
            socket = s;
            s.write(`${JSON.stringify({ verb: "events_subscribe", ...(last !== null ? { from_cursor: last } : {}) })}\n`);
            say("following");
          },
          data(_s, chunk) {
            buffered += decoder.decode(chunk, { stream: true });
            for (let newline = buffered.indexOf("\n"); newline >= 0; newline = buffered.indexOf("\n")) {
              const line = buffered.slice(0, newline);
              buffered = buffered.slice(newline + 1);
              try {
                const message = JSON.parse(line) as { type?: string; event?: unknown };
                if (message.type === "event" && isFrame(message.event)) void deliver(message.event);
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

  say("connecting");
  void connect();
  sweep = setInterval(() => void (stopped || catchUp()), options.sweepMs ?? 5_000);

  return {
    cursor: () => last,
    stop() {
      stopped = true;
      if (sweep) clearInterval(sweep);
      if (retry) clearTimeout(retry);
      socket?.end();
      say("stopped");
    },
  };
}
