/**
 * What the runtime does with an operation at this freeze.
 *
 * The operation catalog's live-enforcement table states, per live-bound row, whether the runtime
 * refuses the row and with what reason. A row that is refused performs no target effect: the
 * route that would perform it refuses it before the effect runs and records the refusal.
 *
 * The list lives in the catalog and only there. A route asks this module what the catalog says
 * about the operation it is about to perform, so the contract and the runtime cannot drift: a
 * contract that says a row is refused is a row the route refuses, and a contract that says a row
 * runs is a row the route runs.
 *
 * The refusal is not silent and it is not a guess. It names the operation, the reason the
 * catalog gives, and the fact that the refusal is recorded.
 */
import type { LoadedManifest } from "./manifest.ts";

/** A row the runtime refuses at this freeze. */
export interface FrozenRefusal {
  /** The operation the catalog refuses. */
  readonly operationId: string;
  /** The caller path's own name, when the row's answer depends on which caller is at the route. */
  readonly codeOp: string | null;
  /** Why the row is refused, in the catalog's own words. */
  readonly reason: string;
  /** What the refusal writes. */
  readonly audit: "appends_refusal_audit";
}

/** Which caller path is at the route, when the row's answer depends on it. */
export interface RefusalSelector {
  /** The route the request arrived at. */
  readonly route?: string;
  /** The action the request named, as the catalog's dispatch table names it. */
  readonly codeOp?: string;
}

/**
 * What the catalog says the runtime does with this operation.
 *
 * A row with no enforcement entry is not a live-bound row, so the catalog says nothing about it
 * and this module says nothing either: the route's own checks decide. A row whose answer depends
 * on which caller is at the route and whose caller did not say which one it is is refused, because
 * a refusal that guesses would be a guess about an effect.
 */
export function frozenRefusal(
  manifest: LoadedManifest,
  operationId: string,
  selector?: RefusalSelector,
): FrozenRefusal | null {
  const rows = manifest.manifest.live_enforcement?.rows ?? [];
  const entry = rows.find((row) => row.id === operationId);
  if (entry === undefined) return null;
  if (entry.variants !== undefined) {
    const variant = entry.variants.find((candidate) => {
      if (selector?.route !== undefined && (candidate.routes ?? []).includes(selector.route)) return true;
      if (selector?.codeOp !== undefined && candidate.code_op === selector.codeOp) return true;
      return false;
    });
    if (variant === undefined) {
      return {
        operationId,
        codeOp: null,
        reason: `The catalog gives "${operationId}" a different answer for each caller path, and the request did not say which path it is on.`,
        audit: "appends_refusal_audit",
      };
    }
    if (variant.refused_today !== true) return null;
    return {
      operationId,
      codeOp: variant.code_op,
      reason: variant.refusal_reason ?? "",
      audit: "appends_refusal_audit",
    };
  }
  if (entry.refused_today !== true) return null;
  return {
    operationId,
    codeOp: null,
    reason: entry.refusal_reason ?? "",
    audit: "appends_refusal_audit",
  };
}

/**
 * The words a refusal is answered with.
 *
 * A refusal says what was refused, why, and that nothing was changed. It does not apologise for
 * a limit it states, and it does not promise a stage it cannot name.
 */
export function refusalWords(refusal: FrozenRefusal): string {
  const reason = refusal.reason.trim();
  return `This action is refused at this release. ${reason} Nothing was changed.`;
}
