/**
 * Enrolling a phone is an authority change, and the operator authorizes it with a passkey, not a code.
 *
 * The invitation proves the phone was shown it. A verified registration proves the phone holds a new
 * credential. Neither authorizes a controller. The registration is held as a pending enrolment whose
 * operation digest covers the exact credential, public key, label and controllers it would replace.
 * The one active controller authorizes it by signing that digest with its own passkey, which requires
 * user verification, on its own trusted surface. The proof is checked against the controller's stored
 * key and sign count, and the pending record moves to confirmed by one compare-and-swap. Only the commit,
 * which rechecks that confirmation, its window and its generation, creates the credential.
 *
 * A proof is evidence, not the authority. The authority is the pending record the designated writer
 * (cognate_local_continuation) moves to applied. Nothing typed on a terminal and nothing clicked in a
 * browser can produce the proof, because it needs the controller's own user-verified passkey.
 */
import type { DurableStore, Json } from "@godspeedai/cognate-events";
import {
  abandon,
  applyConfirmed,
  confirmWithProof,
  describe,
  openAwaitingProof,
  operationDigest,
  PENDING_COLLECTION,
  stateOf,
  type PendingDescriptor,
  type PendingState,
} from "../capabilities/pending-confirmations.ts";
import { fromB64url, type VerifiedRegistration } from "./webauthn.ts";

export const ENROLMENT_OPERATION = "device.pair";
export const ENROLMENTS_COLLECTION = "horizon-remote-enrollments";
/** The approval record: the active controller that signed the proof, written once with the confirmation. */
export const APPROVALS_COLLECTION = "horizon-remote-enrollment-approvals";
/** The catalog's pending window for device.pair (pending_expiry 5m). */
export const ENROLMENT_WINDOW_MS = 5 * 60_000;

/** What the phone asks to enrol. Its digest is the operation digest the authorizing controller signs. */
export interface EnrolmentRequest {
  readonly tenant: string;
  readonly operator: string;
  readonly generation: number;
  readonly label: string;
  readonly registration: VerifiedRegistration;
  /** The active controllers at request time, sorted. Authorization and commit refuse if the set has changed. */
  readonly replaces: readonly string[];
  /** The permissions the new device would hold. The digest covers them, so the proof authorizes exactly this grant. */
  readonly permissions: readonly string[];
  readonly requested_at: string;
}

/** The human authorization of one enrolment: which active controller signed the proof, and when. */
export interface Approval {
  readonly pending_id: string;
  readonly digest: string;
  readonly authorizer_device_id: string;
  readonly authorizer_credential_id: string;
  readonly sign_count: number;
  readonly approved_at: string;
}

export interface Waiting {
  readonly pendingId: string;
  readonly label: string;
  readonly replaces: number;
  readonly expiresAt: string;
  /** The challenge the authorizing controller signs: the operation digest of this exact request. */
  readonly challenge: Uint8Array;
}

export type RequestOutcome = { readonly ok: true; readonly pendingId: string; readonly expiresAt: string };

export type AuthorizeOutcome =
  | { readonly ok: true; readonly signCount: number }
  | { readonly ok: false; readonly code: "unknown" | "not_pending" | "expired" | "unverified" | "raced" | "stale"; readonly message: string };

export type CommitOutcome =
  | { readonly ok: true; readonly request: EnrolmentRequest; readonly approval: Approval }
  | { readonly ok: false; readonly code: "not_authorized" | "expired" | "stale" | "used" | "unknown"; readonly state: PendingState | null };

export function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export class EnrollmentAuthority {
  constructor(
    private readonly store: DurableStore,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  /** Holds a verified registration as pending. A newer request ends an older one, so one enrolment waits at a time. */
  async request(input: EnrolmentRequest): Promise<RequestOutcome> {
    await this.endWaiting(input.tenant, "a newer enrolment request replaced it");
    const opened = await openAwaitingProof(this.store, {
      tenant: input.tenant,
      operator: input.operator,
      operationId: ENROLMENT_OPERATION,
      params: input as unknown as Record<string, unknown>,
      now: new Date(this.clock()),
      ttlMs: ENROLMENT_WINDOW_MS,
    });
    await this.store.commit({
      appends: [],
      records: [{ collection: ENROLMENTS_COLLECTION, id: opened.pending_id, expectedVersion: 0, value: input as unknown as { readonly [key: string]: Json } }],
    });
    return { ok: true, pendingId: opened.pending_id, expiresAt: opened.expires_at };
  }

  /** The enrolment waiting for authorization, if one is open: what the authorizing controller is shown and signs. */
  async waiting(tenant: string, now: number): Promise<Waiting | null> {
    const rows = await this.store.listRecords(PENDING_COLLECTION, { tenant, operation_id: ENROLMENT_OPERATION });
    let best: { readonly descriptor: PendingDescriptor; readonly at: number } | null = null;
    for (const row of rows) {
      const descriptor = row.value as unknown as PendingDescriptor;
      if ((await stateOf(this.store, descriptor.pending_id)) !== "pending") continue;
      if (now > Date.parse(descriptor.expires_at)) continue;
      const at = Date.parse(descriptor.created_at);
      if (best === null || at > best.at) best = { descriptor, at };
    }
    if (best === null) return null;
    const request = await this.requestOf(best.descriptor.pending_id);
    if (request === null) return null;
    return {
      pendingId: best.descriptor.pending_id,
      label: request.label,
      replaces: request.replaces.length,
      expiresAt: best.descriptor.expires_at,
      challenge: fromB64url(best.descriptor.operation_digest),
    };
  }

  /**
   * Confirms a waiting enrolment when the authorizing controller's proof verifies. `verify` receives the
   * challenge the proof must sign and returns the proof's sign count; it throws to refuse. Nothing is
   * confirmed unless the request is still the one the controller set and generation describe.
   */
  async authorize(input: {
    readonly tenant: string;
    readonly pendingId: string;
    readonly now: Date;
    readonly generation: number;
    readonly currentControllers: readonly string[];
    readonly authorizer: { readonly deviceId: string; readonly credentialId: string };
    readonly verify: (challenge: Uint8Array) => Promise<number>;
  }): Promise<AuthorizeOutcome> {
    const request = await this.requestOf(input.pendingId);
    if (request === null || request.tenant !== input.tenant) return { ok: false, code: "unknown", message: "No waiting enrolment has that id." };
    if (request.generation !== input.generation || !sameIds(request.replaces, input.currentControllers)) {
      await abandon(this.store, input.pendingId, input.now, "the controller changed or the pairing was refreshed while waiting");
      return { ok: false, code: "stale", message: "The desktop's controller changed while this phone waited. Refresh the QR on your desktop." };
    }
    const signed: { signCount: number | null } = { signCount: null };
    const result = await confirmWithProof(
      this.store,
      { tenant: input.tenant, pendingId: input.pendingId, now: input.now, reason: "authorized by a user-verified passkey on the active controller" },
      async (descriptor) => {
        signed.signCount = await input.verify(fromB64url(descriptor.operation_digest));
      },
    );
    if (!result.ok) return { ok: false, code: result.code, message: result.message };
    const signCount = signed.signCount ?? 0;
    const approval: Approval = {
      pending_id: input.pendingId,
      digest: result.descriptor.operation_digest,
      authorizer_device_id: input.authorizer.deviceId,
      authorizer_credential_id: input.authorizer.credentialId,
      sign_count: signCount,
      approved_at: input.now.toISOString(),
    };
    try {
      await this.store.commit({
        appends: [],
        records: [{ collection: APPROVALS_COLLECTION, id: input.pendingId, expectedVersion: 0, value: approval as unknown as { readonly [key: string]: Json } }],
      });
    } catch {
      // The confirmation is spent without its approval record, so the commit refuses it (fail closed).
      return { ok: false, code: "raced", message: "The approval could not be recorded. Refresh the QR on your desktop and scan again." };
    }
    return { ok: true, signCount };
  }

  /**
   * The commit. It creates the credential only for a confirmed enrolment, inside its window, for the same
   * generation and controllers, and applies the confirmation once.
   */
  async commit(input: { readonly pendingId: string; readonly tenant: string; readonly generation: number; readonly currentControllers: readonly string[]; readonly now: Date }): Promise<CommitOutcome> {
    const descriptor = await describe(this.store, input.pendingId);
    if (descriptor === null || descriptor.tenant !== input.tenant) return { ok: false, code: "unknown", state: null };
    const state = await stateOf(this.store, input.pendingId);
    if (state === "pending") return { ok: false, code: "not_authorized", state };
    if (state === "expired") return { ok: false, code: "expired", state };
    if (state !== "confirmed") return { ok: false, code: "used", state };
    if (input.now.getTime() > Date.parse(descriptor.expires_at)) {
      await abandon(this.store, input.pendingId, input.now, "the authorization expired before the commit");
      return { ok: false, code: "expired", state: "expired" };
    }
    const request = await this.requestOf(input.pendingId);
    if (request === null) return { ok: false, code: "unknown", state };
    // The credential created must be the one the controller signed: the request is re-derived and must match the digest proven.
    if (operationDigest(ENROLMENT_OPERATION, request as unknown as Record<string, unknown>) !== descriptor.operation_digest) {
      await abandon(this.store, input.pendingId, input.now, "the stored request no longer matches the authorized digest");
      return { ok: false, code: "stale", state: "expired" };
    }
    if (request.generation !== input.generation || !sameIds(request.replaces, input.currentControllers)) {
      await abandon(this.store, input.pendingId, input.now, "the controller changed or the pairing was refreshed while waiting");
      return { ok: false, code: "stale", state: "expired" };
    }
    // The authority decision the commit needs: an approval written with the confirmation, by a controller still active.
    const approval = await this.approvalOf(input.pendingId);
    if (approval === null || !input.currentControllers.includes(approval.authorizer_device_id)) {
      return { ok: false, code: "not_authorized", state };
    }
    const applied = await applyConfirmed(this.store, input.pendingId, input.now, "enrolment committed");
    if (!applied) return { ok: false, code: "used", state: await stateOf(this.store, input.pendingId) };
    return { ok: true, request, approval };
  }

  /**
   * Ends every enrolment waiting for authorization or committed but not yet applied. It reads the store, not
   * memory, so an enrolment that outlived a restart is ended too.
   */
  async endWaiting(tenant: string, reason: string): Promise<void> {
    const rows = await this.store.listRecords(PENDING_COLLECTION, { tenant, operation_id: ENROLMENT_OPERATION });
    for (const row of rows) {
      await abandon(this.store, (row.value as unknown as PendingDescriptor).pending_id, new Date(this.clock()), reason);
    }
  }

  private async approvalOf(pendingId: string): Promise<Approval | null> {
    const row = await this.store.getRecord(APPROVALS_COLLECTION, pendingId);
    return row === undefined || row === null ? null : (row.value as unknown as Approval);
  }

  private async requestOf(pendingId: string): Promise<EnrolmentRequest | null> {
    const row = await this.store.getRecord(ENROLMENTS_COLLECTION, pendingId);
    return row === undefined || row === null ? null : (row.value as unknown as EnrolmentRequest);
  }
}
