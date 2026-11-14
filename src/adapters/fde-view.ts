/**
 * The display model for one FDE episode: what the desk shows and what the debugger `why` answer is
 * built from. Every string here is COPIED from a source record; the only thing this module adds is
 * `CLASS_DISPLAY`, a label/tone table keyed by the source's own words. It decides nothing: an
 * unrecognised class is shown as itself with tone `unrecognised`, never mapped to pass or fail.
 *
 * Three-valued results stay three-valued (and more): `confirmed` / `contradicted` are decided,
 * `insufficient` is "not decided", and an unverified tail is its own marked state.
 */
import { NOT_CONNECTED, readCaseRecords, readRealityTrace, readWorldPin, type CaseEpisodeRecord, type RealityTraceStructure, type SourceRead, type WorldPin } from "./fde-read.ts";
import type { DebuggerValue } from "../domain/debugger.ts";

export type Tone = "affirmed" | "denied" | "undecided" | "undeclared" | "unrecognised";

/** The adapter's classification mapping (the NT-09 attack surface): source class word -> visual tone and gloss. */
export const CLASS_DISPLAY: Readonly<Record<string, { readonly tone: Tone; readonly gloss: string }>> = {
  confirmed: { tone: "affirmed", gloss: "decided: the declared expectation holds" },
  contradicted: { tone: "denied", gloss: "decided: the declared expectation is violated" },
  observed_undeclared: { tone: "undeclared", gloss: "observed behaviour the world does not declare" },
  declared_unobserved: { tone: "undeclared", gloss: "declared behaviour that was not observed" },
  insufficient: { tone: "undecided", gloss: "NOT decided: evidence is insufficient" },
};
export const toneOf = (cls: string): { tone: Tone; gloss: string } => CLASS_DISPLAY[cls] ?? { tone: "unrecognised", gloss: "unrecognised class: shown as recorded" };

export const RESULT_GLOSS: Readonly<Record<string, string>> = {
  S: "established success", F: "established failure", U: "unresolved (not decided)", C: "contradictory",
};

export interface FdeSources {
  readonly case: SourceRead<readonly CaseEpisodeRecord[]>;
  readonly realitytrace: SourceRead<RealityTraceStructure>;
  readonly pin: SourceRead<WorldPin>;
}

/** The episode record this comparison is about: the comparison's own `episode_ref`, else the single episode, else none. */
export function selectEpisode(sources: FdeSources, episodeRef?: string): CaseEpisodeRecord | null {
  if (sources.case.state !== "ok") return null;
  const ref = episodeRef ?? (sources.realitytrace.state === "ok" ? sources.realitytrace.data.episode_ref : undefined);
  const records = sources.case.data;
  return records.find((r) => r.episode_ref === ref) ?? (ref === undefined && records.length === 1 ? records[0]! : null);
}

const gone = (key: string, source: string, read: SourceRead<unknown>): DebuggerValue =>
  Object.freeze({ key, value: read.state === "invalid" ? "invalid source" : NOT_CONNECTED, class: "unknown" as const, source, missing_source: `${source}: ${read.state === "ok" ? "no matching record" : read.detail}` });
const rec = (key: string, value: string, source: string): DebuggerValue => Object.freeze({ key, value, class: "recorded" as const, source });

/** The debugger `why` rows for one episode: the same values the desk renders, each naming its source record. */
export function fdeDebuggerValues(sources: FdeSources, episodeRef: string): readonly DebuggerValue[] {
  const out: DebuggerValue[] = [];
  const episode = selectEpisode(sources, episodeRef);
  if (episode === null) out.push(gone("case.episode", "case-records", sources.case));
  else {
    const src = `case-record/${episode.frozen_record_id}`;
    out.push(rec("case.id", episode.case_id, src), rec("case.plan_item", episode.plan_item_id, src), rec("case.episode_n", String(episode.n), src),
      rec("case.episode_ref", episode.episode_ref, src), rec("case.frozen_digest", episode.frozen_digest, src), rec("case.world_ref", episode.world_ref, src),
      rec("case.anchor_state", episode.anchor.state, "anchor-outbox"));
    if (episode.settlement === null) out.push(Object.freeze({ key: "settlement.result", value: "unknown: not settled", class: "unknown" as const, source: "case-records", missing_source: "no episode.settled record" }));
    else out.push(rec("settlement.result", episode.settlement.result, `case-record/${episode.settlement.record_id}`), rec("settlement.actor", episode.settlement.settling_actor, `case-record/${episode.settlement.record_id}`));
  }
  if (sources.realitytrace.state !== "ok") out.push(gone("residuals", "realitytrace", sources.realitytrace));
  else {
    const rt = sources.realitytrace.data;
    out.push(rec("rt.comparison_id", rt.comparison_id, "realitytrace/compare"), rec("rt.tail_status", rt.tail_verification.status, "realitytrace/compare#tail_verification"));
    rt.residuals.forEach((r, i) => out.push(
      rec(`residual.${i}.class`, r.class, `realitytrace/${r.residual_id}`), rec(`residual.${i}.basis`, r.basis, `realitytrace/${r.residual_id}`)));
  }
  if (sources.pin.state !== "ok") out.push(gone("world.current", "world-pin", sources.pin));
  else out.push(rec("world.current", sources.pin.data.current ?? "none", "world-pin"));
  return out;
}

/** Where each source lives. An unset path is a source that is not connected. */
export interface FdeSourcePaths {
  readonly caseDir?: string;
  readonly comparePath?: string;
  readonly derivePath?: string;
  readonly pinPath?: string;
}

export function fdePathsFromEnv(env: Readonly<Record<string, string | undefined>>): FdeSourcePaths {
  const pick = (name: string): string | undefined => (env[name] !== undefined && env[name] !== "" ? env[name] : undefined);
  const paths = { caseDir: pick("HORIZON_FDE_CASE_DIR"), comparePath: pick("HORIZON_FDE_COMPARE"), derivePath: pick("HORIZON_FDE_DERIVE"), pinPath: pick("HORIZON_FDE_PIN") };
  return Object.fromEntries(Object.entries(paths).filter(([, v]) => v !== undefined)) as FdeSourcePaths;
}

export function readFdeSources(paths: FdeSourcePaths): FdeSources {
  const absent = <T,>(what: string): SourceRead<T> => ({ state: "not_connected", detail: `${what} is not configured` });
  return {
    case: paths.caseDir === undefined ? absent("the case directory") : readCaseRecords(paths.caseDir),
    realitytrace: paths.comparePath === undefined ? absent("the compare result") : readRealityTrace(paths.comparePath, paths.derivePath),
    pin: paths.pinPath === undefined ? absent("the world pin") : readWorldPin(paths.pinPath),
  };
}
