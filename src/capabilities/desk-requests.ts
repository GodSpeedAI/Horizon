/**
 * Request ids for the person's panel operations (design v3, section 2: "use the store's durable request deduplication"). A browser
 * request carries a `request_id`. The answer that the request makes writes one record in `horizon-desk-requests`, keyed
 * `request:<tenant>:<request id>`, in the same commit as the answer and its row. The record holds a fingerprint of the request body
 * (everything but the id) and the response that was sent. So:
 *  - the same id with the same body returns the stored response, and nothing is written again;
 *  - the same id with a different body is refused ("That request id was already used for something else.");
 *  - a request that was refused stores nothing, so its id can be used again.
 * The queue runs one command at a time, so the lookup and the commit cannot interleave with another answer.
 */
import { createHash } from "node:crypto";
import type { DurableStore, Json } from "@godspeedai/cognate-events";
import type { CommitRecord } from "./panel-records.ts";

export const REQUESTS_COLLECTION = "horizon-desk-requests";
export const REUSED_REQUEST_WORDS = "That request id was already used for something else.";
export const BAD_REQUEST_ID_WORDS = "That request id could not be read. Nothing was sent.";
const MAX_REQUEST_ID = 100;

/** A request id is a non-empty string of up to 100 characters, with no spaces or control characters. */
export function validRequestId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= MAX_REQUEST_ID && /^[A-Za-z0-9._:-]+$/.test(value);
}

/** JSON with object keys in sorted order, so the same body always gives the same text. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>).sort().filter((k) => (value as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** A fingerprint of what the request asks for: the body without its request id. */
export function requestFingerprint(body: { readonly [key: string]: unknown }): string {
  const { request_id: _id, ...rest } = body;
  return createHash("sha256").update(canonical(rest)).digest("hex");
}

const requestIdOf = (tenant: string, requestId: string): string => `request:${tenant}:${requestId}`;

export type RequestSeen = { readonly kind: "new" } | { readonly kind: "replay"; readonly response: Json } | { readonly kind: "reused" };

/** Whether this request id has been used, and if so whether for the same request. Reads only. */
export async function seenRequest(store: DurableStore, tenant: string, requestId: string, fingerprint: string): Promise<RequestSeen> {
  const row = await store.getRecord(REQUESTS_COLLECTION, requestIdOf(tenant, requestId));
  if (row === null || row === undefined) return { kind: "new" };
  const value = row.value as { readonly fingerprint?: unknown; readonly response?: Json };
  if (value.fingerprint !== fingerprint) return { kind: "reused" };
  return { kind: "replay", response: value.response ?? null };
}

/** The record that keeps a request id and the response it got. It joins the commit that makes the request's change. */
export function requestRecord(tenant: string, requestId: string, fingerprint: string, response: Json): CommitRecord {
  return { collection: REQUESTS_COLLECTION, id: requestIdOf(tenant, requestId), expectedVersion: 0, value: { tenant, request_id: requestId, fingerprint, response } as { readonly [key: string]: Json } };
}
