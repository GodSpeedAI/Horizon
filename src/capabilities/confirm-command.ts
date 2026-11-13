/**
 * `horizon confirm --pending <id>`: the local terminal side of a Stage 0B confirmation.
 *
 * It names the exact operation a descriptor waits for and asks for the code the Horizon terminal
 * showed when the operation was asked. It reads and writes the controlling terminal only, so a
 * browser or an agent process driven from elsewhere cannot answer the prompt.
 */
import { closeSync, openSync, readSync, writeSync } from "node:fs";
import type { DurableStore } from "@godspeedai/cognate-events";
import { confirm, describe, type ConfirmResult } from "./pending-confirmations.ts";

export interface ConfirmIO {
  /** Shows a line to the person. */
  readonly write: (line: string) => void;
  /** Reads one line typed by the person, or null when no terminal is available. */
  readonly readLine: (prompt: string) => string | null;
}

/** The controlling terminal (/dev/tty) for both the prompt and the answer. */
export function ttyConfirmIO(): ConfirmIO {
  return {
    write: (line) => {
      const fd = openSync("/dev/tty", "w");
      try {
        writeSync(fd, `${line}\n`);
      } finally {
        closeSync(fd);
      }
    },
    readLine: (prompt) => {
      let fd: number;
      try {
        fd = openSync("/dev/tty", "r+");
      } catch {
        return null;
      }
      try {
        writeSync(fd, prompt);
        const bytes: number[] = [];
        const one = Buffer.alloc(1);
        while (readSync(fd, one, 0, 1, null) === 1) {
          if (one[0] === 0x0a) break;
          bytes.push(one[0]!);
        }
        return Buffer.from(bytes).toString("utf8").replace(/\r$/, "");
      } finally {
        closeSync(fd);
      }
    },
  };
}

export interface ConfirmOutcome {
  readonly ok: boolean;
  readonly message: string;
}

/** Renders the waiting operation, asks for the code, and confirms exactly that descriptor. */
export async function runConfirm(store: DurableStore, pendingId: string, io: ConfirmIO, now: Date = new Date()): Promise<ConfirmOutcome> {
  const descriptor = await describe(store, pendingId);
  if (descriptor === null) return { ok: false, message: "No waiting operation has that id." };
  if (Date.parse(descriptor.expires_at) < now.getTime()) {
    return { ok: false, message: "That confirmation has expired. Ask again to start a new one." };
  }
  io.write(`Operation waiting for confirmation: ${descriptor.operation_id}`);
  io.write(`Requested by: ${descriptor.operator}`);
  io.write(`Expires: ${descriptor.expires_at}`);
  const typed = io.readLine("Type the code shown in the Horizon terminal: ");
  if (typed === null) return { ok: false, message: "There is no terminal to confirm on. Nothing was confirmed." };
  const result: ConfirmResult = await confirm(store, { tenant: descriptor.tenant, pendingId, typedCode: typed.trim(), now });
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, message: `Confirmed ${result.operation_id}. Repeat the action once to apply it.` };
}
