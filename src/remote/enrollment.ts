/**
 * Enrolling a phone is an authority change, so the operator authorizes it, not the invitation.
 *
 * The invitation (the pairing link) proves the phone was shown it. A verified passkey registration
 * proves the phone holds a new credential. Neither authorizes a controller. A verified registration
 * is held as a pending enrolment, and the desk shows the operator a one-time code on its own
 * terminal together with what it would authorize: the phone, the replaced controllers, and the
 * time limit. The operator types the code on that terminal. Only that confirmation lets the phone's
 * retry commit the enrolment, and it commits once.
 *
 * The pending machinery is the Stage 0B confirmation (src/capabilities/pending-confirmations.ts), so
 * the code is never stored, a wrong code counts toward a limit, and a confirmation is applied by one
 * compare-and-swap. The operator's terminal is the only input: a browser cannot type into it.
 */
import { closeSync, createReadStream, openSync, writeSync } from "node:fs";
import { createInterface } from "node:readline";
import type { DurableStore, Json } from "@godspeedai/cognate-events";
import {
  abandon,
  applyConfirmed,
  confirm,
  describe,
  operationDigest,
  stateOf,
  summonAnnounced,
  type PendingState,
} from "../capabilities/pending-confirmations.ts";
import type { VerifiedRegistration } from "./webauthn.ts";

export const ENROLMENT_OPERATION = "device.pair";
export const ENROLMENTS_COLLECTION = "horizon-remote-enrollments";
/** The catalog's pending window for device.pair (pending_expiry 5m; policy pending_expiry_device_pair 300). */
export const ENROLMENT_WINDOW_MS = 5 * 60_000;
/** After this many wrong codes the pending enrolment is abandoned and nothing can authorize it. */
export const WRONG_CODE_LIMIT = 5;

/** The desk's view of the operator's terminal: lines shown to the operator, and lines the operator types. */
export interface OperatorChannel {
  /** Shows a line. Returns false when there is no terminal to show it on. */
  show(line: string): boolean;
  /** Reads the lines the operator types until the returned function is called. */
  read(handler: (line: string) => Promise<void> | void): () => void;
}

/** The controlling terminal of this desk, or null when the desk has none (a service, a pipe, an agent's shell). */
export function ttyOperatorChannel(): OperatorChannel | null {
  try {
    closeSync(openSync("/dev/tty", "r"));
  } catch {
    return null;
  }
  return {
    show: (line) => {
      try {
        const fd = openSync("/dev/tty", "w");
        try {
          writeSync(fd, `${line}\n`);
        } finally {
          closeSync(fd);
        }
        return true;
      } catch {
        return false;
      }
    },
    read: (handler) => {
      const input = createReadStream("/dev/tty", { encoding: "utf8" });
      input.on("error", () => undefined);
      const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
      lines.on("line", (line) => {
        void handler(line);
      });
      return () => {
        lines.close();
        input.destroy();
      };
    },
  };
}

/** What the phone asks the operator to authorize. Stored with the pending enrolment; its digest binds the confirmation. */
export interface EnrolmentRequest {
  readonly tenant: string;
  readonly operator: string;
  readonly generation: number;
  readonly label: string;
  readonly registration: VerifiedRegistration;
  /** The active controllers at request time, sorted. The commit refuses if the set has changed. */
  readonly replaces: readonly string[];
  readonly requested_at: string;
}

export type RequestOutcome =
  | { readonly ok: true; readonly pendingId: string; readonly expiresAt: string }
  | { readonly ok: false; readonly message: string };

export type CommitOutcome =
  | { readonly ok: true; readonly request: EnrolmentRequest }
  | { readonly ok: false; readonly code: "not_authorized" | "expired" | "stale" | "used" | "unknown"; readonly state: PendingState | null };

const shortId = (credentialId: string): string => credentialId.slice(-6);

export class EnrollmentAuthority {
  /**
   * Enrolments the operator has not committed. `confirmed` marks one whose code was typed and that now awaits
   * its commit; `wrong` counts the wrong codes typed while it waited.
   */
  private readonly open = new Map<string, { readonly tenant: string; wrong: number; confirmed: boolean }>();
  private stopReading: (() => void) | null = null;
  /** Typed lines are handled one at a time, so a pasted batch of lines counts against the wrong-code limit line by line. */
  private typing: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: DurableStore,
    private readonly channel: OperatorChannel | null,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  /** Holds a verified registration as pending and shows the operator what it would authorize. */
  async request(input: EnrolmentRequest): Promise<RequestOutcome> {
    const channel = this.channel;
    if (channel === null) return { ok: false, message: "Horizon has no terminal to show the authorization on, so the phone was not enrolled. Run Horizon from an interactive terminal to pair a phone." };
    const summoned = await summonAnnounced(
      this.store,
      { tenant: input.tenant, operator: input.operator, operationId: ENROLMENT_OPERATION, params: input as unknown as Record<string, unknown>, now: new Date(this.clock()), ttlMs: ENROLMENT_WINDOW_MS },
      (pendingId, code) => {
        const replacing = input.replaces.length > 0 ? ", replacing the phone that is connected now" : "";
        return channel.show(
          `Horizon remote control: authorize the phone "${input.label}" (passkey ending ${shortId(input.registration.credentialId)}) to control this desktop${replacing}. Pending ${pendingId}. Code: ${code}. It works once and expires in five minutes; if you do not type it, nothing is enrolled.`,
        );
      },
    );
    if (!summoned.ok) return { ok: false, message: summoned.message };
    const pendingId = summoned.summoned.pending_id;
    await this.store.commit({
      appends: [],
      records: [{ collection: ENROLMENTS_COLLECTION, id: pendingId, expectedVersion: 0, value: input as unknown as { readonly [key: string]: Json } }],
    });
    this.open.set(pendingId, { tenant: input.tenant, wrong: 0, confirmed: false });
    this.listen(channel);
    return { ok: true, pendingId, expiresAt: summoned.summoned.expires_at };
  }

  /**
   * The commit. Applies the operator's confirmation exactly once, after checking that the request is
   * still the one the operator saw: same tenant and operator, same generation, same controllers.
   */
  async commit(input: { readonly pendingId: string; readonly tenant: string; readonly operator: string; readonly generation: number; readonly currentControllers: readonly string[]; readonly now: Date }): Promise<CommitOutcome> {
    const row = await this.store.getRecord(ENROLMENTS_COLLECTION, input.pendingId);
    const descriptor = await describe(this.store, input.pendingId);
    if (row === undefined || descriptor === null || descriptor.tenant !== input.tenant || descriptor.operator !== input.operator) {
      return { ok: false, code: "unknown", state: null };
    }
    const request = row.value as unknown as EnrolmentRequest;
    if (descriptor.operation_digest !== operationDigest(ENROLMENT_OPERATION, request as unknown as Record<string, unknown>)) {
      return { ok: false, code: "unknown", state: null };
    }
    const state = await stateOf(this.store, input.pendingId);
    if (state === "pending") return { ok: false, code: "not_authorized", state };
    if (state === "expired") return { ok: false, code: "expired", state };
    if (state !== "confirmed") return { ok: false, code: "used", state };
    // A confirmation is only good inside its window: the commit checks the clock too, not only the typing.
    if (input.now.getTime() > Date.parse(descriptor.expires_at)) {
      await abandon(this.store, input.pendingId, input.now, "the authorization expired before the commit");
      this.forget(input.pendingId);
      return { ok: false, code: "expired", state: "expired" };
    }
    const stale = request.generation !== input.generation || !sameIds(request.replaces, input.currentControllers);
    if (stale) {
      await abandon(this.store, input.pendingId, input.now, "the controller changed or the pairing was refreshed while waiting");
      this.forget(input.pendingId);
      return { ok: false, code: "stale", state: "expired" };
    }
    const applied = await applyConfirmed(this.store, input.pendingId, input.now, "enrolment committed");
    this.forget(input.pendingId);
    if (!applied) return { ok: false, code: "used", state: await stateOf(this.store, input.pendingId) };
    return { ok: true, request };
  }

  /** Refresh and stop end every open enrolment, confirmed or not, so a late code or a late commit authorizes nothing. */
  async abandonWaiting(reason: string): Promise<void> {
    const now = new Date(this.clock());
    for (const pendingId of [...this.open.keys()]) await abandon(this.store, pendingId, now, reason);
    this.open.clear();
    this.stopListening();
  }

  private listen(channel: OperatorChannel): void {
    if (this.stopReading !== null) return;
    this.stopReading = channel.read((line) => {
      this.typing = this.typing.then(() => this.typed(line));
      return this.typing;
    });
  }

  private stopListening(): void {
    this.stopReading?.();
    this.stopReading = null;
  }

  /** Stops reading once no enrolment is waiting for a code. */
  private stopIfIdle(): void {
    if (![...this.open.values()].some((entry) => !entry.confirmed)) this.stopListening();
  }

  private forget(pendingId: string): void {
    this.open.delete(pendingId);
    this.stopIfIdle();
  }

  /** A line the operator typed: it confirms the waiting enrolment whose code it is, and counts against the others. */
  private async typed(line: string): Promise<void> {
    const code = line.trim();
    const now = new Date(this.clock());
    for (const [pendingId, entry] of [...this.open]) {
      if (entry.confirmed) continue;
      const result = await confirm(this.store, { tenant: entry.tenant, pendingId, typedCode: code, now });
      if (result.ok) {
        this.open.set(pendingId, { ...entry, confirmed: true });
        continue;
      }
      if (result.code !== "wrong_code") {
        this.forget(pendingId);
        continue;
      }
      if (entry.wrong + 1 >= WRONG_CODE_LIMIT) {
        await abandon(this.store, pendingId, now, "too many wrong codes");
        this.forget(pendingId);
      } else {
        this.open.set(pendingId, { ...entry, wrong: entry.wrong + 1 });
      }
    }
    this.stopIfIdle();
  }
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  const left = [...a].sort();
  const right = [...b].sort();
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
