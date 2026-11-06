/**
 * Raw SEA-Forge NDJSON call for adversarial tests the typed SDK verbs cannot express (self-approval,
 * raw authority_settle). Moved unchanged from the deleted src/adapters/sea-forge-approvals.ts. Tests only:
 * src/ must not construct sockets (scripts/check-boundaries.ts).
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

