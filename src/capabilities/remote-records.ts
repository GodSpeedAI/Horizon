/**
 * Durable phone-remote state: the paired devices (credential id, COSE public key, sign count, label,
 * generation, revocation) and one audit record per remote command. Both are record collections in
 * the same Cognate store as cases and onboarding; nothing about remote control is stored elsewhere.
 */
import { randomUUID } from "node:crypto";
import type { DurableStore, Json } from "@godspeedai/cognate-events";

export const DEVICE_COLLECTION = "horizon-remote-devices";
export const AUDIT_COLLECTION = "horizon-remote-audit";

export interface RemoteDevice {
  readonly device_id: string;
  readonly credential_id: string;
  /** COSE_Key bytes, base64url. */
  readonly public_key: string;
  readonly sign_count: number;
  readonly label: string;
  readonly generation: number;
  readonly tenant: string;
  readonly operator: string;
  readonly created_at: string;
  readonly last_seen: string | null;
  readonly revoked_at: string | null;
}

function asDevice(value: { readonly [key: string]: Json }): RemoteDevice {
  return value as unknown as RemoteDevice;
}

export async function addDevice(store: DurableStore, device: RemoteDevice): Promise<void> {
  await store.commit({
    appends: [],
    records: [{ collection: DEVICE_COLLECTION, id: device.device_id, expectedVersion: 0, value: device as unknown as { readonly [key: string]: Json } }],
  });
}

export async function listDevices(store: DurableStore, tenant: string): Promise<RemoteDevice[]> {
  const rows = await store.listRecords(DEVICE_COLLECTION, { tenant });
  return rows.map((row) => asDevice(row.value)).sort((left, right) => (left.created_at < right.created_at ? -1 : 1));
}

/** Rewrite one device row with the given fields changed. A stale version is refused by the store. */
export async function updateDevice(store: DurableStore, deviceId: string, changes: Partial<Pick<RemoteDevice, "sign_count" | "last_seen" | "revoked_at">>): Promise<void> {
  const row = await store.getRecord(DEVICE_COLLECTION, deviceId);
  if (row === undefined) throw new Error(`REMOTE: device ${deviceId} is not stored`);
  const value = { ...asDevice(row.value), ...changes };
  await store.commit({
    appends: [],
    records: [{ collection: DEVICE_COLLECTION, id: deviceId, expectedVersion: row.version, value: value as unknown as { readonly [key: string]: Json } }],
  });
}

/** One line per remote command: who asked, what, which device, and the outcome the phone was given. */
export async function auditRemote(
  store: DurableStore,
  entry: { readonly tenant: string; readonly operator: string; readonly device_id: string; readonly action: string; readonly outcome: string; readonly at: string; readonly actors?: { readonly [role: string]: unknown } },
): Promise<void> {
  const id = `remote-audit:${randomUUID()}`;
  await store.commit({
    appends: [],
    records: [{ collection: AUDIT_COLLECTION, id, expectedVersion: 0, value: { ...entry, audit_id: id } as unknown as { readonly [key: string]: Json } }],
  });
}
