/**
 * Test support for the controller path. Production has no path that makes the first controller yet (see the
 * remote-control report: a desk-held operator passkey is the dependency), so a test seeds that first controller
 * directly through the identity service and the remote ledger. Every later enrolment goes through the real
 * request, authorization and commit routes.
 */
import type { HorizonApplication } from "../../src/app.ts";
import { addDevice, listDevices, updateDevice, type RemoteDevice } from "../../src/capabilities/remote-records.ts";
import { b64url, newChallenge, verifyRegistration } from "../../src/remote/webauthn.ts";
import type { SoftwareAuthenticator } from "./remote-authenticator.ts";

interface Internals {
  readonly deps: {
    readonly store: Parameters<typeof addDevice>[0];
    readonly identity: { replaceDevices(input: unknown): Promise<{ device: { id: string } }>; listDevices(tenant: string, operatorId: string): Promise<unknown[]> };
    readonly identityTenant: string;
    readonly tenant: string;
    readonly operator: string;
  };
  readonly pairing: { readonly generation: number };
}

const internals = (app: HorizonApplication): Internals => app.remote as unknown as Internals;

/** Seeds the first active controller: a verified registration made by the authenticator, enrolled as the desk's controller. */
export async function seedController(app: HorizonApplication, authenticator: SoftwareAuthenticator, label = "seed phone"): Promise<RemoteDevice> {
  const { deps, pairing } = internals(app);
  const challenge = newChallenge();
  const origin = app.remote.origin;
  const rpId = new URL(origin).hostname;
  const credential = await authenticator.register({ challenge: b64url(challenge), origin, rpId });
  const registration = verifyRegistration(credential as unknown as Parameters<typeof verifyRegistration>[0], { challenge, origin, rpId });
  const enrolled = await deps.identity.replaceDevices({ tenant: deps.identityTenant, operatorId: deps.operator, label, registration });
  const at = new Date().toISOString();
  // The commit revokes every controller it replaces in the ledger; the seed does the same so one live controller remains.
  for (const existing of await listDevices(deps.store, deps.tenant)) {
    if (existing.revoked_at === null) await updateDevice(deps.store, existing.device_id, { revoked_at: at });
  }
  const device: RemoteDevice = {
    device_id: enrolled.device.id,
    credential_id: registration.credentialId,
    public_key: registration.publicKey,
    sign_count: registration.signCount,
    label,
    generation: pairing.generation,
    tenant: deps.tenant,
    operator: deps.operator,
    created_at: at,
    last_seen: at,
    revoked_at: null,
  };
  await addDevice(deps.store, device);
  return device;
}

/** The identity service's stored device for a credential, for tests that check revocation or the sign count. */
export async function identityDeviceOf(app: HorizonApplication, credentialId: string): Promise<{ revokedAt: string | null; signCount: number } | undefined> {
  const { deps } = internals(app);
  const devices = (await deps.identity.listDevices(deps.identityTenant, deps.operator)) as Array<{ credentialId: string; revokedAt: string | null; signCount: number }>;
  return devices.find((device) => device.credentialId === credentialId);
}

/** Replaces the identity service's device writer for one call, to inject a failure after confirmation. */
export function failNextReplace(app: HorizonApplication, message: string): () => void {
  const identity = internals(app).deps.identity as unknown as { replaceDevices: (input: unknown) => Promise<unknown> };
  const original = identity.replaceDevices;
  identity.replaceDevices = async () => {
    identity.replaceDevices = original;
    throw new Error(message);
  };
  return () => {
    identity.replaceDevices = original;
  };
}

