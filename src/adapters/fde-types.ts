/** Types shared by the FDE read adapters and the desk view. Pure: no I/O, so the browser bundle can import it. */
export const NOT_CONNECTED = "not connected" as const;

export type SourceRead<T> =
  | { readonly state: "not_connected"; readonly detail: string }
  | { readonly state: "invalid"; readonly detail: string; readonly violations: readonly string[] }
  | { readonly state: "ok"; readonly data: T };

export interface CaseEpisodeRecord {
  readonly case_id: string;
  readonly plan_item_id: string;
  readonly n: number;
  readonly episode_ref: string;
  readonly episode_kind: string;
  readonly frozen_record_id: string;
  readonly frozen_digest: string;
  readonly frozen_by: string;
  readonly world_ref: string;
  readonly realitytrace_refs: { readonly plan_id: string; readonly question_ids: readonly string[]; readonly threshold_ids: readonly string[] };
  /** The anchor outbox state for this freeze, as recorded: `published` with a receipt, or `pending`, or `none` (no outbox line). */
  readonly anchor: { readonly state: "published" | "pending" | "none"; readonly tag: string | null; readonly receipt_id: string | null; readonly server_push_time: string | null };
  readonly settlement: null | {
    readonly record_id: string;
    readonly result: string;
    readonly settling_actor: string;
    readonly chain: readonly string[];
    readonly settlement_ref: string;
    readonly reliability: Readonly<Record<string, string>>;
    readonly independence: { readonly independent_source_count: number; readonly verifier_context: string };
    readonly decision_id: string;
    readonly world_ref: string;
  };
}

export interface RealityTraceResidual {
  readonly residual_id: string;
  readonly list: "episode" | "structural";
  readonly class: string;
  readonly basis: string;
  readonly rule: { readonly kind: string; readonly ref: string };
  readonly occurrence_ids: readonly string[];
  readonly evidence_refs: readonly string[];
  readonly keys: readonly string[];
  readonly support_count: number;
  readonly world_ref: string;
}
export interface RealityTraceStructure {
  readonly comparison_id: string;
  readonly episode_ref: string;
  readonly representation_id: string;
  readonly representation_hash: string | null;
  readonly input_set_sha256: string;
  readonly world_ref: string;
  readonly settleable: boolean;
  readonly flags: readonly string[];
  readonly proposed_result: { readonly result: string | null; readonly basis: string };
  readonly tail_verification: { readonly status: string; readonly detail: string };
  readonly silent_evidence_sources: readonly string[];
  readonly residuals: readonly RealityTraceResidual[];
}

export interface WorldPin {
  readonly baseline: string | null;
  readonly current: string | null;
  readonly history: readonly { readonly pin_id: string; readonly kind: string; readonly from_world_ref: string; readonly to_world_ref: string; readonly approval_id: string; readonly transition_ref: string; readonly operation_id: string }[];
}
