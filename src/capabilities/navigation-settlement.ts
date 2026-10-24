import type { ObservedPayment } from "../domain/payment.ts";
/**
 * J02 IS6: the evidence record for one committed navigation intent: `execution_record`,
 * `realitytrace_observation` and `settlement_reference` (behavioral/journeys/J02.yaml). Each
 * settlement attempt appends one event (the history) and replaces the latest record per
 * `<tenant>/<intent_id>`. A part that could not be obtained is null with a reason, never invented.
 */
import { randomUUID } from "node:crypto";
import type { DurableStore, Json } from "@godspeedai/cognate-events";

export const SETTLEMENT_STREAM = "horizon.navigation-intent-settlements";
export const SETTLEMENT_COLLECTION = "horizon.navigation-intent-settlement";

export interface ExecutionRecord {
  /** The committed NavigationIntentRecord event and its store position. */
  readonly record_event_id: string;
  readonly position: number;
  /** The governed `run.invocation` event and the SEA-Forge operation it carried (null when ungoverned). */
  readonly invocation_event_id: string | null;
  readonly operation_id: string | null;
}

export interface RealityTraceObservation {
  /** RealityTrace's ledger position of the execution_trace it recorded. */
  readonly target_ref: string;
  readonly sxr_observation_id: string;
  /** RealityTrace's own evidence derived from it, as submitted to SEA-Forge. */
  readonly evidence_id: string;
  readonly evidence_packet_id: string;
  readonly evidence_ledger_entry: string;
}

export interface SettlementReference {
  /**
   * SEA-Forge's answer (`settled` / `unsettled` / `rejected`), `refused` when SEA-Forge refused the
   * evidence or the settlement, or `unavailable` when it could not be asked.
   */
  readonly status: "settled" | "unsettled" | "rejected" | "refused" | "unavailable" | "not_required" | "pending";
  readonly final: boolean;
  /** HORIZON-001 1.1.0 (REQ-NAV-012): SEA-Forge's epistemic status for an obligation; absent otherwise. */
  readonly epistemic_status?: "supported" | "contradicted" | "inconsistent" | "unresolved";
  readonly envelope_id: string | null;
  readonly ledger_entry: string | null;
  readonly reason: string | null;
}

export interface NavigationSettlement {
  readonly intent_id: string;
  readonly execution_record: ExecutionRecord;
  readonly realitytrace_observation: RealityTraceObservation | null;
  readonly settlement_reference: SettlementReference;
  /** REQ-NAV-010: the observed spend recorded with the settlement (steering_attention from SEA-Forge). */
  readonly observed_payment?: readonly ObservedPayment[];
  readonly at: string;
}

export function settlementKey(tenant: string, intentId: string): string {
  return `${tenant}/${intentId}`;
}

export async function latestSettlement(store: DurableStore, tenant: string, intentId: string): Promise<NavigationSettlement | null> {
  const record = await store.getRecord(SETTLEMENT_COLLECTION, settlementKey(tenant, intentId));
  return record ? (record.value as unknown as NavigationSettlement) : null;
}

export async function appendSettlement(
  store: DurableStore,
  options: { readonly settlement: NavigationSettlement; readonly tenant: string; readonly scopeId: string },
): Promise<void> {
  const key = settlementKey(options.tenant, options.settlement.intent_id);
  const current = await store.getRecord(SETTLEMENT_COLLECTION, key);
  const eventId = randomUUID();
  const outcome = await store.commit({
    appends: [
      {
        streamId: SETTLEMENT_STREAM,
        expectedVersion: await store.streamVersion(SETTLEMENT_STREAM),
        events: [
          {
            eventId,
            eventType: "horizon.navigation.intent.settlement",
            schemaVersion: 1,
            occurredAt: options.settlement.at,
            tenant: options.tenant,
            correlationId: eventId,
            causationId: options.settlement.execution_record.record_event_id,
            runId: null,
            scopeId: options.scopeId,
            componentId: "horizon.navigation-intent",
            payload: options.settlement as unknown as Json,
          },
        ],
      },
    ],
    records: [{ collection: SETTLEMENT_COLLECTION, id: key, expectedVersion: current?.version ?? 0, value: options.settlement as unknown as { readonly [key: string]: Json } }],
  });
  if (outcome.kind !== "committed") throw new Error(`SETTLEMENT: the settlement record was not committed (${outcome.kind})`);
}

export async function readSettlements(store: DurableStore): Promise<readonly NavigationSettlement[]> {
  return (await store.readStream(SETTLEMENT_STREAM, {})).map((event) => event.payload as unknown as NavigationSettlement);
}
