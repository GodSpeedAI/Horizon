/**
 * Run a child process with bounds that hold even when the child misbehaves:
 * - output is read as a stream and counted; past `maxBytes` the child is killed and the result says so (nothing is buffered beyond the cap);
 * - the child runs in its own process group, and on a timeout or an over-large answer the whole group is killed;
 * - when the call finishes, however it ends, the whole group is killed, so no descendant outlives it;
 * - the call returns when the time is up, without waiting for the output pipes to close (a descendant may hold them).
 */
export interface ChildOptions {
  readonly cwd?: string;
  readonly env?: Record<string, string | undefined>;
  readonly stdin?: string;
  readonly timeoutMs: number;
  readonly maxBytes: number;
}

export interface ChildResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly tooLarge: boolean;
}

/** Process groups of children still running, so a shutdown can kill what is in flight. */
const liveGroups = new Set<number>();

/** Kill every child group started by `runChild` that has not finished. Used when the program is stopping. */
export function killAllChildren(): number {
  let killed = 0;
  for (const pid of liveGroups) {
    try {
      process.kill(-pid, "SIGKILL");
      killed += 1;
    } catch {
      // already gone
    }
  }
  return killed;
}

/** Throws (synchronously from Bun.spawn) when the program cannot be started, e.g. ENOENT. */
export async function runChild(cmd: readonly string[], options: ChildOptions): Promise<ChildResult> {
  const proc = Bun.spawn([...cmd], {
    cwd: options.cwd,
    env: options.env as Record<string, string> | undefined,
    stdin: options.stdin === undefined ? "ignore" : new Blob([options.stdin]),
    stdout: "pipe",
    stderr: "pipe",
    detached: true,
  });
  liveGroups.add(proc.pid);
  const killGroup = () => {
    try {
      process.kill(-proc.pid, "SIGKILL");
    } catch {
      try {
        proc.kill("SIGKILL");
      } catch {
        // already gone
      }
    }
  };
  let tooLarge = false;
  let timedOut = false;
  let signal!: () => void;
  const stop = new Promise<void>((resolve) => (signal = resolve));
  const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
  const collect = async (stream: ReadableStream<Uint8Array>): Promise<Uint8Array[]> => {
    const reader = stream.getReader();
    readers.push(reader);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
      if (done || !value) break;
      size += value.byteLength;
      if (size > options.maxBytes) {
        tooLarge = true;
        killGroup();
        signal();
        break;
      }
      chunks.push(value);
    }
    return chunks;
  };
  const timer = setTimeout(() => {
    timedOut = true;
    killGroup();
    signal();
  }, options.timeoutMs);
  const out = collect(proc.stdout as ReadableStream<Uint8Array>);
  const err = collect(proc.stderr as ReadableStream<Uint8Array>);
  const finished = Promise.all([out, err, proc.exited]);
  try {
    const result = await Promise.race([finished, stop.then(() => null)]);
    if (result === null) {
      for (const r of readers) r.cancel().catch(() => {});
      const [o, e] = await Promise.all([Promise.race([out, Promise.resolve([] as Uint8Array[])]), Promise.race([err, Promise.resolve([] as Uint8Array[])])]);
      return { code: null, stdout: tooLarge ? "" : decode(o), stderr: tooLarge ? "" : decode(e), timedOut, tooLarge };
    }
    const [o, e] = result;
    return { code: proc.exitCode, stdout: decode(o), stderr: decode(e), timedOut: false, tooLarge: false };
  } finally {
    clearTimeout(timer);
    // However the call ended, nothing it started may outlive it: a normal exit can leave a backgrounded descendant.
    killGroup();
    liveGroups.delete(proc.pid);
    if (tooLarge || timedOut) {
      // Let the killed child be reaped, but never wait long for it.
      await Promise.race([proc.exited, new Promise((r) => setTimeout(r, 1_000))]);
    }
  }
}

function decode(chunks: Uint8Array[]): string {
  return Buffer.concat(chunks).toString("utf8");
}
