/**
 * The raw SEA-Forge NDJSON call, for the verbs the Cognate SDK client (`SeaForgeAuthority`) does not carry:
 * the case keeper (`case_*`, `human_task_*`), the ledger reads and the event follower. The SDK client owns
 * every governance verb (decide, approvals, closure, settle); this module is only for the desk's case-keeper
 * work and is the one place besides `sea-forge-events.ts` that `scripts/check-boundaries.ts` lets open the socket.
 */

/** One NDJSON request/response over the SEA-Forge Unix socket. The socket is closed however it ends. */
export async function seaForgeCall(socketPath: string, request: Record<string, unknown>, timeoutMs = 5_000): Promise<Record<string, unknown>> {
  let buffered = "";
  const decoder = new TextDecoder();
  let open: { end(): void } | undefined;
  return await new Promise((resolve, reject) => {
    let done = false;
    const finish = (error: Error | null, value?: Record<string, unknown>) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      // Settle before closing: in Bun, end() fires close() synchronously.
      if (error) reject(error);
      else resolve(value!);
      open?.end();
    };
    const timer = setTimeout(() => finish(new Error("SEA-Forge did not answer in time")), timeoutMs);
    Bun.connect({
      unix: socketPath,
      socket: {
        open(socket) {
          open = socket;
          socket.write(`${JSON.stringify(request)}\n`);
        },
        data(_socket, chunk) {
          // Stream mode: a multibyte character split across chunks is decoded whole.
          buffered += decoder.decode(chunk, { stream: true });
          const newline = buffered.indexOf("\n");
          if (newline < 0) return;
          try {
            finish(null, JSON.parse(buffered.slice(0, newline)) as Record<string, unknown>);
          } catch {
            finish(new Error("SEA-Forge answered with invalid JSON"));
          }
        },
        close() {
          finish(new Error("SEA-Forge closed the connection without an answer"));
        },
        error(_socket, error) {
          finish(error);
        },
      },
    })
      .then((socket) => {
        open = socket;
        if (done) socket.end();
      })
      .catch((error: unknown) => finish(error instanceof Error ? error : new Error(String(error))));
  });
}
