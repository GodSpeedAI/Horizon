/**
 * Read-only adapters for the FDE evidence path (WP-19): case records, the RealityTrace compare
 * result, and the current world pin.
 *
 * Rules (E sections 9 and 10, AD-8):
 *  - Read only. These functions use `readFileSync` and nothing that writes; no mutating verb exists here.
 *  - They never compute a classification. A residual's `class` and `basis`, a settlement's `result`,
 *    a tail's `status` are copied from the source and passed through `CLASS_LABEL`, which is a pure
 *    display label table (one distinct label per source value, no collapsing to pass/fail).
 *  - A source that is absent or unreadable is `not_connected` (rendered exactly "not connected").
 *  - A source that is present but fails its schema is `invalid`, with the violations; no partial data.
 *
 * Formats are fixed by the producers: SEA-Forge `cases/<case>/field-records.jsonl`,
 * `field-anchor-outbox.jsonl` (src/sfwp/case_records.rs), RealityTrace `observed compare` result
 * document (contracts/README.md section 5), SEA-Forge `authority_pin` JSON (world_pin.rs PinState).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resourcePath } from "../runtime/resource-root.ts";
import { SchemaRegistry } from "./fde-schema.ts";
import { NOT_CONNECTED, type CaseEpisodeRecord, type RealityTraceResidual, type RealityTraceStructure, type SourceRead, type WorldPin } from "./fde-types.ts";
export { NOT_CONNECTED, type CaseEpisodeRecord, type RealityTraceResidual, type RealityTraceStructure, type SourceRead, type WorldPin } from "./fde-types.ts";

const notConnected = <T>(detail: string): SourceRead<T> => ({ state: "not_connected", detail });
const invalid = <T>(detail: string, violations: readonly string[]): SourceRead<T> => ({ state: "invalid", detail, violations });

const CONTRACTS = resourcePath("contracts", "fde");
const IDS = {
  request: "urn:sea-forge:fde:case-record-append:v1#/$defs/Request",
  settled: "urn:sea-forge:fde:case-record-append:v1#/$defs/EpisodeSettledPayload",
  frozenReference: "urn:sea-forge:fde:frozen-reference:v1",
  residual: "https://sxr.dev/contracts/residual.v1.json",
  representation: "https://sxr.dev/contracts/observed-representation.v1.json",
} as const;
let registry: SchemaRegistry | null = null;
function schemas(): SchemaRegistry {
  if (registry === null) {
    registry = new SchemaRegistry();
    for (const file of ["case-record-append.v1.json", "frozen-reference.v1.json", "residual.v1.json", "observed-representation.v1.json"]) {
      registry.add(JSON.parse(readFileSync(join(CONTRACTS, file), "utf8")));
    }
  }
  return registry;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Text file, or `null` when absent or unreadable (permissions, directory, ...). */
function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** Complete newline-terminated JSON lines (a torn trailing fragment is ignored, as the producer does). Throws on a bad line. */
function jsonLines(text: string): Json[] {
  const lines = text.split("\n");
  lines.pop(); // last element is "" for a terminated file, or a torn fragment
  return lines.filter((l) => l.trim() !== "").map((l) => JSON.parse(l) as Json);
}

// ---------------------------------------------------------------------------------------------
// (a) Case records
// ---------------------------------------------------------------------------------------------

export function readCaseRecords(caseDir: string): SourceRead<readonly CaseEpisodeRecord[]> {
  const recordsText = readText(join(caseDir, "field-records.jsonl"));
  if (recordsText === null) return notConnected(`no readable field-records.jsonl under ${caseDir}`);
  let records: Json[];
  let anchors: Json[] = [];
  try {
    records = jsonLines(recordsText);
    const anchorText = readText(join(caseDir, "field-anchor-outbox.jsonl"));
    if (anchorText !== null) anchors = jsonLines(anchorText);
  } catch (error) {
    return invalid("a case ledger line is not JSON", [String(error)]);
  }
  const violations: string[] = [];
  const frozen = new Map<string, Json>();
  for (const [i, record] of records.entries()) {
    const kind = str(record.kind);
    if (kind !== "episode.frozen" && kind !== "episode.settled") { violations.push(`record ${i}: unknown kind '${kind}'`); continue; }
    const errors = schemas().validate(IDS.request, { kind, idempotency_key: record.idempotency_key, payload: record.payload });
    violations.push(...errors.map((e) => `record ${i} (${kind}): ${e}`));
    if (kind === "episode.frozen") {
      const reference = obj(obj(record.payload).reference);
      violations.push(...schemas().validate(IDS.frozenReference, reference).map((e) => `record ${i} reference: ${e}`));
      frozen.set(str(obj(record.payload).episode_ref), record);
    }
  }
  if (violations.length > 0) return invalid("a case record fails case-record-append.v1 / frozen-reference.v1", violations);

  const latestAnchor = new Map<string, Json>();
  for (const line of anchors) latestAnchor.set(str(line.subject_ref), line); // the latest line per freeze wins, as the producer reads it
  const out: CaseEpisodeRecord[] = [];
  for (const [ref, record] of frozen) {
    const payload = obj(record.payload);
    const body = obj(obj(payload.reference).body);
    const anchor = latestAnchor.get(ref);
    const receipt = obj(anchor?.receipt);
    const settled = records.find((r) => r.kind === "episode.settled" && str(obj(r.payload).episode_ref) === ref);
    const sp = obj(settled?.payload);
    out.push({
      case_id: str(body.case_id), plan_item_id: str(body.plan_item_id), n: Number(body.n), episode_ref: ref,
      episode_kind: str(body.kind), frozen_record_id: str(record.record_id), frozen_digest: str(payload.digest),
      frozen_by: str(record.principal), world_ref: str(body.world_ref),
      realitytrace_refs: payload.realitytrace_refs as CaseEpisodeRecord["realitytrace_refs"],
      anchor: anchor === undefined ? { state: "none", tag: null, receipt_id: null, server_push_time: null }
        : { state: anchor.state === "published" ? "published" : "pending", tag: str(anchor.tag), receipt_id: str(receipt.receipt_id) || null, server_push_time: str(receipt.server_push_time) || null },
      settlement: settled === undefined ? null : {
        record_id: str(settled.record_id), result: str(sp.result), settling_actor: str(settled.principal),
        chain: (Array.isArray(settled.chain) ? settled.chain : []).map(String), settlement_ref: str(sp.settlement_ref),
        reliability: obj(sp.reliability) as Record<string, string>,
        independence: obj(sp.independence) as unknown as { independent_source_count: number; verifier_context: string },
        decision_id: str(settled.decision_id),
        // a settlement is bound to the world of the freeze its episode_ref names
        world_ref: str(body.world_ref),
      },
    });
  }
  return { state: "ok", data: out };
}

// ---------------------------------------------------------------------------------------------
// (b) RealityTrace structure (the `observed compare` result document + the derive wrapper)
// ---------------------------------------------------------------------------------------------

/**
 * `comparePath` is the `observed compare` output; `derivePath` (optional) is the `observed derive`
 * wrapper it was computed from, used only to show the representation hash.
 */
export function readRealityTrace(comparePath: string, derivePath?: string): SourceRead<RealityTraceStructure> {
  const text = readText(comparePath);
  if (text === null) return notConnected(`no readable compare result at ${comparePath}`);
  let doc: Json;
  try { doc = JSON.parse(text) as Json; } catch (error) { return invalid("compare result is not JSON", [String(error)]); }
  const violations: string[] = [];
  for (const field of ["comparison_id", "episode_ref", "representation_id", "input_set_sha256", "world_ref", "tail_verification", "residuals"]) {
    if (!(field in doc)) violations.push(`/${field}: required`);
  }
  const lists = obj(doc.residuals);
  if (!Array.isArray(lists.episode) || !Array.isArray(lists.structural)) violations.push("/residuals: needs `episode` and `structural` lists");
  if (typeof obj(doc.tail_verification).status !== "string") violations.push("/tail_verification/status: required");
  if (typeof doc.settleable !== "boolean") violations.push("/settleable: required boolean");
  const residuals: RealityTraceResidual[] = [];
  for (const list of ["episode", "structural"] as const) {
    for (const [i, raw] of ((Array.isArray(lists[list]) ? lists[list] : []) as unknown[]).entries()) {
      violations.push(...schemas().validate(IDS.residual, raw).map((e) => `residuals.${list}[${i}]${e}`));
      const r = obj(raw);
      residuals.push({
        residual_id: str(r.residual_id), list, class: str(r.class), basis: str(r.basis), rule: obj(r.rule) as RealityTraceResidual["rule"],
        occurrence_ids: (r.occurrence_ids as string[]) ?? [], evidence_refs: (r.evidence_refs as string[]) ?? [], keys: (r.keys as string[]) ?? [],
        support_count: Number(r.support_count), world_ref: str(r.world_ref),
      });
    }
  }
  let representationHash: string | null = null;
  if (derivePath !== undefined) {
    const dtext = readText(derivePath);
    if (dtext === null) return notConnected(`no readable derive output at ${derivePath}`);
    try {
      const derived = JSON.parse(dtext) as Json;
      violations.push(...schemas().validate(IDS.representation, derived.representation).map((e) => `derive.representation${e}`));
      if (derived.representation_id !== doc.representation_id) violations.push("derive output is not the representation this comparison used");
      representationHash = str(derived.representation_hash) || null;
    } catch (error) { return invalid("derive output is not JSON", [String(error)]); }
  }
  if (violations.length > 0) return invalid("the compare result does not satisfy residual.v1 / observed-representation.v1 / the result document shape", violations);
  const tail = obj(doc.tail_verification);
  const proposed = obj(doc.proposed_result);
  return { state: "ok", data: {
    comparison_id: str(doc.comparison_id), episode_ref: str(doc.episode_ref), representation_id: str(doc.representation_id), representation_hash: representationHash,
    input_set_sha256: str(doc.input_set_sha256), world_ref: str(doc.world_ref), settleable: doc.settleable === true,
    flags: ((doc.flags as string[]) ?? []), proposed_result: { result: typeof proposed.result === "string" ? proposed.result : null, basis: str(proposed.basis) },
    tail_verification: { status: str(tail.status), detail: str(tail.reason) || str(tail.expected_entry_hash) },
    silent_evidence_sources: ((doc.silent_evidence_sources as string[]) ?? []), residuals,
  } };
}

// ---------------------------------------------------------------------------------------------
// (c) The current world pin (`authority_pin` output: PinState + attempts)
// ---------------------------------------------------------------------------------------------

const WORLD_REF = /^world:[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*@sha256:[0-9a-f]{64}$/;

/** No JSON Schema exists for the `authority_pin` response (a wire verb, not a contract); these checks are the PinState / PinRecord fields of world_pin.rs. */
export function readWorldPin(pinPath: string): SourceRead<WorldPin> {
  const text = readText(pinPath);
  if (text === null) return notConnected(`no readable world pin at ${pinPath}`);
  let doc: Json;
  try { doc = JSON.parse(text) as Json; } catch (error) { return invalid("world pin is not JSON", [String(error)]); }
  const violations: string[] = [];
  if (doc.ok !== true) violations.push("/ok: the pin read was not a success response");
  for (const f of ["baseline", "current"]) if (doc[f] !== null && !(typeof doc[f] === "string" && WORLD_REF.test(doc[f] as string))) violations.push(`/${f}: not a world_ref`);
  if (!Array.isArray(doc.history)) violations.push("/history: required array");
  const history = ((Array.isArray(doc.history) ? doc.history : []) as unknown[]).map(obj);
  for (const [i, h] of history.entries()) {
    for (const f of ["pin_id", "kind", "approval_id", "operation_id", "transition_ref"]) if (str(h[f]) === "") violations.push(`/history/${i}/${f}: required`);
    for (const f of ["from_world_ref", "to_world_ref"]) if (!WORLD_REF.test(str(h[f]))) violations.push(`/history/${i}/${f}: not a world_ref`);
    if (h.kind !== "promoted" && h.kind !== "repinned") violations.push(`/history/${i}/kind: not promoted/repinned`);
  }
  if (violations.length > 0) return invalid("the world pin does not match PinState", violations);
  return { state: "ok", data: { baseline: doc.baseline as string | null, current: doc.current as string | null,
    history: history.map((h) => ({ pin_id: str(h.pin_id), kind: str(h.kind), from_world_ref: str(h.from_world_ref), to_world_ref: str(h.to_world_ref), approval_id: str(h.approval_id), transition_ref: str(h.transition_ref), operation_id: str(h.operation_id) })) } };
}
