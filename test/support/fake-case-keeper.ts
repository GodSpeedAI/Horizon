import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** What the fake does with one request. */
export type FakeReply =
  | { readonly json: unknown }
  /** Bytes written as they are, then the connection ends. */
  | { readonly raw: string }
  /** Never answers. */
  | { readonly hang: true }
  /** Writes part of a line, then closes: the socket closing mid-reply. */
  | { readonly partial: string }
  /** Closes with no bytes. */
  | { readonly close: true }
  /** Writes each line, then keeps the connection open (an event subscription). */
  | { readonly stream: readonly unknown[]; readonly thenClose?: boolean };

export interface FakeKeeper {
  readonly socketPath: string;
  readonly received: Record<string, unknown>[];
  script: (request: Record<string, unknown>) => FakeReply;
  /** Close every open connection (a dropped events stream). */
  dropAll: () => void;
  /** Write one line to every open connection (a live event). */
  push: (value: unknown) => void;
  stop: () => void;
}

/** A Unix-socket stand-in for the case keeper. It speaks NDJSON, one request line in, one reply line out. */
export function fakeCaseKeeper(script: FakeKeeper["script"], at?: string): FakeKeeper {
  const dir = mkdtempSync(join(tmpdir(), "fake-keeper-"));
  const socketPath = at ?? join(dir, "sea-forge.sock");
  const received: Record<string, unknown>[] = [];
  const open = new Set<{ end(): void }>();
  const keeper: FakeKeeper = {
    socketPath,
    received,
    script,
    dropAll: () => {
      for (const socket of [...open]) socket.end();
      open.clear();
    },
    push: (value) => {
      for (const socket of open) (socket as unknown as { write(text: string): void }).write(`${JSON.stringify(value)}\n`);
    },
    stop: () => {
      keeper.dropAll();
      server.stop(true);
      rmSync(dir, { recursive: true, force: true });
    },
  };
  const buffers = new WeakMap<object, string>();
  const server = Bun.listen({
    unix: socketPath,
    socket: {
      open(socket) {
        open.add(socket);
      },
      close(socket) {
        open.delete(socket);
      },
      data(socket, chunk) {
        const text = (buffers.get(socket) ?? "") + new TextDecoder().decode(chunk);
        const lines = text.split("\n");
        buffers.set(socket, lines.pop() ?? "");
        for (const line of lines) {
          if (line.trim() === "") continue;
          const request = JSON.parse(line) as Record<string, unknown>;
          received.push(request);
          const reply = keeper.script(request);
          if ("json" in reply) {
            socket.write(`${JSON.stringify(reply.json)}\n`);
            socket.end();
          } else if ("raw" in reply) {
            socket.write(reply.raw);
            socket.end();
          } else if ("partial" in reply) {
            socket.write(reply.partial);
            socket.end();
          } else if ("close" in reply) socket.end();
          else if ("stream" in reply) {
            for (const frame of reply.stream) socket.write(`${JSON.stringify(frame)}\n`);
            if (reply.thenClose) socket.end();
          }
          // hang: say nothing and keep the connection.
        }
      },
    },
  });
  return keeper;
}
