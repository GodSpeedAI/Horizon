/**
 * What the desk says after an answer to a waiting request (ported from the old approval inbox page).
 * Pure. The case keeper's own list is the truth: a click never claims more than that list shows. The words
 * say what was decided, what actually happened, who resolved it, and when a later step failed.
 */
export type DecisionFailureCode = "refused" | "not_pending" | "invalid" | "unavailable" | "followup_failed" | "unknown";

/** The state the case keeper lists for one request, or null when the list does not show it (or could not be read). */
export interface ListedStanding {
  readonly state: string;
  readonly resolved_by: string | null;
}

const FAILURE_COPY: Record<DecisionFailureCode, string> = {
  refused: "The case keeper or Horizon refused the decision, for example because you asked for it yourself or may not decide it.",
  not_pending: "No move is waiting on this request any more; it may already have been decided.",
  invalid: "The request was incomplete, so it was not sent.",
  unavailable: "The decision could not be sent or answered.",
  followup_failed: "A later step in Horizon failed, so the waiting move may not have finished.",
  unknown: "Something went wrong with that decision.",
};

const by = (standing: ListedStanding): string => (standing.resolved_by ? ` (resolved by ${standing.resolved_by})` : "");

/** "The case keeper lists this request as approved (resolved by X)." for a request that is no longer pending, else null. */
export function listedDecision(standing: ListedStanding | null): string | null {
  return standing !== null && standing.state !== "pending" ? ` The case keeper lists this request as ${standing.state}${by(standing)}.` : null;
}

/** The answer after a decision went through: confirmed only when the list shows the state the person chose. */
export function confirmedDecision(choice: "accept" | "reject", standing: ListedStanding | null): { readonly ok: boolean; readonly message: string } {
  const wanted = choice === "accept" ? "approved" : "rejected";
  const verb = choice === "accept" ? "approve" : "reject";
  if (standing !== null && standing.state === wanted) {
    return {
      ok: true,
      message: `Done. This request is now ${standing.state}${by(standing)}. You chose to ${verb} it.${wanted === "rejected" ? " The move that was waiting on it was refused and will not run." : " The case keeper checks the move again and runs it once; whether it succeeds is only known afterwards."}`,
    };
  }
  if (standing !== null && standing.state !== "pending") {
    return { ok: false, message: `Not confirmed. You chose to ${verb} this request, but the case keeper's list shows it as ${standing.state}${by(standing)}. The listed state is the truth.` };
  }
  return { ok: false, message: `Not confirmed. You chose to ${verb} this request, but the case keeper's list ${standing === null ? "does not show it" : "still shows it as waiting"}. Reload to check again before deciding anything else.` };
}

/** The answer when the decision did not go through, or a later step failed after it was recorded. */
export function failedDecision(code: DecisionFailureCode, standing: ListedStanding | null): string {
  const listed = listedDecision(standing);
  if (code === "followup_failed") {
    return `A later step failed after the decision was sent. ${FAILURE_COPY.followup_failed}${listed ?? " Not confirmed: the list does not show this request as decided yet."} Check the decided list below.`;
  }
  if (listed !== null) return `That click did not decide this request. ${FAILURE_COPY[code]}${listed}`;
  const next = code === "unknown" || code === "unavailable" ? " Check the list before trying again." : " Nothing was approved or rejected by this click.";
  return `That decision was not recorded. ${FAILURE_COPY[code]}${next}`;
}

/** One line of the decided list. */
export function decidedLine(operationName: string, requester: string, standing: ListedStanding): string {
  return `${standing.state[0]!.toUpperCase()}${standing.state.slice(1)}${by(standing)}: ${operationName}, asked for by ${requester}`;
}
