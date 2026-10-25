/**
 * Durable first-run state for the cockpit: the operator's cases and the operator's skip choice.
 *
 * Both are record collections, so a read is one listing and a write is a versioned upsert. Nothing
 * else about onboarding is stored: each step is derived from configuration and from these records.
 */
import { randomUUID } from "node:crypto";
import type { DurableStore, Json } from "@godspeedai/cognate-events";

export const CASE_COLLECTION = "horizon-cases";
export const ONBOARDING_COLLECTION = "horizon-onboarding";
/** The purpose is one line; longer text is refused, never silently cut. */
export const CASE_PURPOSE_MAX = 200;

export interface OpenCase {
  readonly case_ref: string;
  readonly purpose: string;
  readonly opened_at: string;
  readonly operator: string;
  readonly tenant: string;
}

export type PurposeCheck = { readonly ok: true; readonly purpose: string } | { readonly ok: false; readonly code: "empty" | "too_long" };

/** Trim, then require one non-empty line within the limit. The result is what gets stored. */
export function checkPurpose(raw: unknown): PurposeCheck {
  const purpose = typeof raw === "string" ? raw.trim() : "";
  if (purpose === "") return { ok: false, code: "empty" };
  if (purpose.length > CASE_PURPOSE_MAX) return { ok: false, code: "too_long" };
  return { ok: true, purpose };
}

export async function openCase(
  store: DurableStore,
  options: { readonly tenant: string; readonly operator: string; readonly purpose: string; readonly now: Date },
): Promise<OpenCase> {
  const value: OpenCase = {
    case_ref: `case:${randomUUID()}`,
    purpose: options.purpose,
    opened_at: options.now.toISOString(),
    operator: options.operator,
    tenant: options.tenant,
  };
  await store.commit({
    appends: [],
    records: [{ collection: CASE_COLLECTION, id: value.case_ref, expectedVersion: 0, value: value as unknown as { readonly [key: string]: Json } }],
  });
  return value;
}

/** The most recently opened case for this tenant, or null when none has been opened. */
export async function latestCase(store: DurableStore, tenant: string): Promise<OpenCase | null> {
  let latest: OpenCase | null = null;
  for (const row of await store.listRecords(CASE_COLLECTION, { tenant })) {
    const value = row.value as unknown as OpenCase;
    if (latest === null || value.opened_at > latest.opened_at) latest = value;
  }
  return latest;
}

function onboardingId(tenant: string, operator: string): string {
  return `${tenant}/${operator}`;
}

export async function setOnboardingSkipped(
  store: DurableStore,
  options: { readonly tenant: string; readonly operator: string; readonly skipped: boolean; readonly now: Date },
): Promise<void> {
  const id = onboardingId(options.tenant, options.operator);
  const current = await store.getRecord(ONBOARDING_COLLECTION, id);
  await store.commit({
    appends: [],
    records: [
      {
        collection: ONBOARDING_COLLECTION,
        id,
        expectedVersion: current?.version ?? 0,
        value: { tenant: options.tenant, operator: options.operator, skipped: options.skipped, at: options.now.toISOString() },
      },
    ],
  });
}

export async function onboardingSkipped(store: DurableStore, tenant: string, operator: string): Promise<boolean> {
  const row = await store.getRecord(ONBOARDING_COLLECTION, onboardingId(tenant, operator));
  return row?.value.skipped === true;
}
