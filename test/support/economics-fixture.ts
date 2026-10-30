/** Ledger / projection rows in the shape `realitytrace ledger export` and `projections export` print. */
import { createHash } from "node:crypto";

export const eventId = (name: string): string => createHash("sha256").update(name).digest("hex");

export interface Ev {
  name: string;
  runtime?: string;
  sid?: string;
  kind?: string;
  case_id?: string | null;
  owner?: string;
  tokens?: { input: number; output: number; cache_write: number; cache_read: number } | null;
  token_quality?: string;
  arm?: string;
  exit_code?: number | null;
  attributed_input_tokens?: number | null;
  payload_ref?: string | null;
  ts?: string;
}

export function agentEvent(e: Ev): Record<string, unknown> {
  return {
    agent_event_version: 1,
    schema: "agent-event/v1",
    event_id: eventId(e.name),
    source: "hook",
    runtime: e.runtime ?? "claude",
    verifier: `agent-tap/${e.runtime ?? "claude"}`,
    native_session_id: e.sid ?? "s1",
    native_event_ref: e.name,
    kind: e.kind ?? "usage",
    ts: e.ts ?? "2026-10-30T10:00:00Z",
    case_id: e.case_id === undefined ? "case:alpha" : e.case_id,
    unit_id: "u1",
    te_session_id: "te1",
    role: "user",
    arm: e.arm ?? "none",
    repo: null,
    tokens: e.tokens === undefined ? null : e.tokens,
    token_quality: e.token_quality ?? "EXACT",
    owner: e.owner ?? "native",
    attributed_input_tokens: e.attributed_input_tokens ?? null,
    payload_ref: e.payload_ref ?? null,
    exit_code: e.exit_code ?? null,
  };
}

export const observation = (ordinal: number, e: Ev) => ({
  append_ordinal: ordinal,
  record_kind: "observation.recorded",
  ledger_id: "L1",
  entry_hash: `h${ordinal}`,
  payload: { extensions: { agent_event: agentEvent(e) } },
});

export const questionDeclared = (ordinal: number, questionId: string) => ({
  append_ordinal: ordinal,
  record_kind: "question.declared",
  ledger_id: "L1",
  entry_hash: `q${ordinal}`,
  payload: { representations: [{ inline_content: { question_id: questionId, question_form: "is it so" } }] },
});

export const tok = (input: number, output: number, cache_read = 0, cache_write = 0) => ({ input, output, cache_read, cache_write });

export const residual = (id: string, kind: string) => ({ residual_id: id, question_id: "q", snapshot_id: "s", decl_key: "d", residual_kind: kind, severity: "low", attribution_status: "undiagnosed", ledger_id: "L1", append_ordinal: 1 });

/** Two cases and one unbound, with TE events, journeys and a repeated row. */
export function sampleLedger(): unknown[] {
  return [
    questionDeclared(1, "agent-activity"),
    questionDeclared(2, "journey:J01:desired_state:1"),
    questionDeclared(3, "journey:J01:evidence:2"),
    questionDeclared(4, "journey:J02:capability:1@abcd1234"),
    // case:alpha, claude s1
    observation(10, { name: "a-u1", tokens: tok(1000, 200, 5000, 300) }),
    observation(11, { name: "a-u2", tokens: tok(2000, 100, 7000, 0), token_quality: "ESTIMATED" }),
    observation(12, { name: "a-fail", kind: "tool_fail", exit_code: 1 }),
    observation(13, { name: "a-ok", kind: "tool_post", exit_code: 0 }),
    observation(14, { name: "a-inj", kind: "te_injection", owner: "te", attributed_input_tokens: 400, token_quality: "ESTIMATED", payload_ref: "te-ledger:injected_chars=1600" }),
    observation(15, { name: "a-ovh", kind: "te_overhead", owner: "te", tokens: tok(150, 0), token_quality: "DERIVED" }),
    observation(16, { name: "a-j1", kind: "journey_check", exit_code: 0, payload_ref: "journey:journey:J01:desired_state:1", ts: "2026-10-30T10:01:00Z" }),
    observation(17, { name: "a-j2", kind: "journey_check", exit_code: 1, payload_ref: "journey:journey:J01:evidence:2", ts: "2026-10-30T10:02:00Z" }),
    // a second session in case:alpha, codex
    observation(20, { name: "b-u1", runtime: "codex", sid: "c9", tokens: tok(300, 50, 0, 0), arm: "T" }),
    // case:beta
    observation(30, { name: "c-u1", case_id: "case:beta", sid: "s2", tokens: tok(10, 20, 30, 40) }),
    // unknown case: unbound, and a null case
    observation(40, { name: "d-u1", case_id: "unknown", sid: "s3", tokens: tok(111, 22, 0, 0) }),
    observation(41, { name: "d-u2", case_id: null, sid: "s3", tokens: tok(1, 1, 1, 1) }),
    // backfill owner: shown, never observed
    observation(42, { name: "d-bf", case_id: "unknown", sid: "s3", owner: "backfill", tokens: tok(9999, 0) }),
    // a re-delivered row (RealityTrace dedups; the model must not double count if one repeats)
    observation(50, { name: "a-u1", tokens: tok(1000, 200, 5000, 300) }),
  ];
}
