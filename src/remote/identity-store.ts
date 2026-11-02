/**
 * The shared identity package names its collections `identity.operators`, `identity.sessions` and
 * `identity.devices`. The SQLite store behind Horizon accepts only `[A-Za-z_][A-Za-z0-9_-]*`, so it
 * refuses the dot. This view of the one application store maps those names to hyphenated ones and
 * changes nothing else: same store, same transactions, no second database.
 */
import type { DurableStore } from "@godspeedai/cognate-events";

const renamed = (collection: string): string => collection.replace(/\./g, "-");

export function identityStoreOf(store: DurableStore): DurableStore {
  return new Proxy(store, {
    get(target, property) {
      if (property === "getRecord") return (collection: string, id: string) => target.getRecord(renamed(collection), id);
      if (property === "listRecords") return (collection: string, where?: Parameters<DurableStore["listRecords"]>[1]) => target.listRecords(renamed(collection), where);
      if (property === "commit") {
        return (input: Parameters<DurableStore["commit"]>[0]) =>
          target.commit({ ...input, records: (input.records ?? []).map((record) => ({ ...record, collection: renamed(record.collection) })) });
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}
