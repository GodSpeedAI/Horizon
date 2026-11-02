/**
 * The shared identity package names its collections `identity-operators`, `identity-sessions` and
 * `identity-devices`, which the SQLite store behind Horizon accepts as they are. This view of the one
 * application store is therefore a passthrough: same store, same transactions, no second database.
 * It stays as the one place the host hands its store to the identity package.
 */
import type { DurableStore } from "@godspeedai/cognate-events";

export function identityStoreOf(store: DurableStore): DurableStore {
  return store;
}
