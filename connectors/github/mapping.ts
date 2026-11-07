/**
 * Pure mapping between a GitHub issue and a case-keeper step. No network, no clock.
 *
 * Text rule: a title or body is data. Going into the case keeper it is cleaned (control and direction-override
 * characters removed, length capped) and kept verbatim otherwise. Going into GitHub markdown it is escaped so that
 * markup, HTML, links and @mentions show as the characters typed and run nothing.
 */
import { redact } from "../../src/adapters/redact.ts";

export const LABEL_INTAKE = "horizon";
export const LABEL_CASE = "horizon-case";
export const STATE_PREFIX = "horizon-state/";
export const NAME_MAX = 200;
export const TITLE_MAX = 256;
/** An issue body at or above this size is not read; the title alone is used and the issue is told so. */
export const BODY_LIMIT = 1_000_000;
export const POLICY = "policy.yaml";

export interface Issue {
  readonly number: number;
  readonly title: string;
  readonly body?: string | null;
  readonly state: string;
  readonly html_url: string;
  readonly id?: number;
  readonly node_id?: string;
  readonly labels: readonly (string | { readonly name?: string })[];
  readonly pull_request?: unknown;
  /** The author, as GitHub lists it. */
  readonly user?: { readonly login?: string } | null;
}

export interface HorizonItem {
  readonly plan_item_id: string;
  readonly name: string;
  readonly execution?: string;
  readonly settlement?: string;
  readonly external_ref?: { readonly kind: string; readonly id: string; readonly url: string } | null;
}

const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;

/** One cleaned line, at most `max` characters (counted as code points), never empty. */
export function plainLine(raw: unknown, max: number, fallback = "(no title)"): string {
  const line = String(raw ?? "").replace(CONTROL, " ").replace(/\s+/g, " ").trim();
  const chars = [...line];
  const cut = chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : line;
  return cut === "" ? fallback : cut;
}

/** Text for GitHub markdown: shows exactly as typed. */
export function asText(raw: unknown, max = TITLE_MAX): string {
  return plainLine(raw, max)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_{}\[\]()#+!|~])/g, "\\$1")
    .replace(/@/g, "@​");
}

export const labelNames = (labels: Issue["labels"]): string[] => labels.map((l) => (typeof l === "string" ? l : (l.name ?? ""))).filter((n) => n !== "");
export const hasLabel = (issue: Issue, name: string): boolean => labelNames(issue.labels).includes(name);

export const issueRef = (repo: string, n: number): string => `${repo}#${n}`;
export function parseIssueRef(ref: string): { repo: string; number: number } | null {
  const m = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#(\d+)$/.exec(ref);
  return m ? { repo: m[1]!, number: Number(m[2]) } : null;
}
/** The intake request id. Attempt 0 is the plain id; after a refusal the case keeper has remembered, the next attempt is `:a<k>`. */
export const requestIdFor = (repo: string, n: number, attempt = 0): string => `github:${issueRef(repo, n)}${attempt > 0 ? `:a${attempt}` : ""}`;
export const stepIdFor = (repo: string, n: number): string => `gh_${repo.replace(/[^A-Za-z0-9]+/g, "_")}_${n}`;

export interface IntakeFrame {
  readonly frame: Record<string, unknown>;
  /** Plain sentences to tell the issue about, once. */
  readonly notes: readonly string[];
}

/** The `case_add_item` for an issue (the caller adds `actor`). */
export function intakeFrame(input: { readonly caseId: string; readonly repo: string; readonly issue: Issue; readonly attempt?: number }): IntakeFrame {
  const { caseId, repo, issue } = input;
  const notes: string[] = [];
  const bodyLength = (issue.body ?? "").length;
  if (bodyLength >= BODY_LIMIT) notes.push("This issue's text is 1 MB or longer, so Horizon used only the title. Nothing from the text was added to the step.");
  return {
    frame: {
      verb: "case_add_item",
      case_id: caseId,
      item: {
        plan_item_id: stepIdFor(repo, issue.number),
        // Masked before it is cut, so a credential is never kept as a fragment: the title becomes a durable case item.
        name: plainLine(redact(String(issue.title ?? "")), NAME_MAX, "(untitled GitHub issue)"),
        item_kind: "human_task",
        // A person decides; nothing about GitHub's issue state counts as acceptance.
        settlement_criteria: { required_artifacts: [], required_declarations: [], require_approval: true },
        external_ref: { kind: "github_issue", id: issueRef(repo, issue.number), url: issue.html_url },
      },
      policy: POLICY,
      request_id: requestIdFor(repo, issue.number, input.attempt ?? 0),
    },
    notes,
  };
}

export interface StepState {
  readonly word: string;
  readonly words: string;
}

const EXECUTION: Readonly<Record<string, StepState>> = {
  pending: { word: "waiting", words: "waiting to start" },
  enabled: { word: "ready", words: "ready to start" },
  active: { word: "in-progress", words: "being worked on" },
  completed: { word: "finished", words: "finished, waiting for a person's decision" },
  failed: { word: "failed", words: "failed" },
  terminated: { word: "stopped", words: "stopped" },
};

/** The step's state in GitHub's terms. Only the case keeper's settlement says accepted; the issue being closed never does. */
export function stateOf(item: Pick<HorizonItem, "execution" | "settlement">, issueClosed: boolean): StepState {
  if (item.settlement === "accepted") return { word: "accepted", words: "accepted" };
  if (issueClosed) return { word: "closed-not-accepted", words: "closed on GitHub, not accepted" };
  if (item.settlement === "rejected") return { word: "rejected", words: "not accepted (rejected)" };
  if (item.settlement === "escalated") return { word: "needs-decision", words: "waiting for a person's decision" };
  return EXECUTION[item.execution ?? "pending"] ?? { word: "waiting", words: "waiting to start" };
}

export const stateLabel = (word: string): string => `${STATE_PREFIX}${word}`;
export const caseMarker = (caseId: string): string => `<!-- horizon:case:${caseId} -->`;
export const stepMarker = (caseId: string, stepId: string): string => `<!-- horizon:step:${caseId}/${stepId} -->`;
/** One marker per transition and event: `ready~active@<event cursor>`. Returning to an earlier state is a new transition. */
export const stateMarker = (caseId: string, stepId: string, transition: string): string => `<!-- horizon:state:${caseId}/${stepId}:${transition.replace(/[^A-Za-z0-9_.:~@+-]/g, "_")} -->`;
export const noteMarker = (key: string): string => `<!-- horizon:note:${key} -->`;

/** Ids are used inside HTML comments and code spans; refuse any that could break out of them. */
export const safeId = (id: string): boolean => /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(id);

export function stateComment(input: { caseId: string; stepId: string; state: StepState; transition: string; deskUrl?: string }): string {
  const link = input.deskUrl ? `\n\n[Open in Horizon](${input.deskUrl})` : "";
  return `Horizon: this step is now ${input.state.words}.\n\nThe case keeper decides; closing an issue on GitHub never accepts the work.${link}\n\n${stateMarker(input.caseId, input.stepId, input.transition)}`;
}

export interface ParentInput {
  readonly caseId: string;
  readonly summary: string;
  readonly caseState: string;
  readonly items: readonly HorizonItem[];
  readonly subIssues: boolean;
  /** Issue number for a step that has its own issue. */
  readonly numberOf: (item: HorizonItem) => number | undefined;
  readonly issueClosed: (item: HorizonItem) => boolean;
  readonly repo: string;
}

export function parentTitle(summary: string): string {
  return plainLine(summary, TITLE_MAX - 8, "(untitled case)");
}

/** The parent issue's text. With sub-issues the steps are the sub-issues; without, a task list lives here. */
export function parentBody(input: ParentInput): string {
  const lines = [asText(input.summary, 400), "", `Case \`${input.caseId}\`, state: ${asText(input.caseState, 40)}.`, "", caseMarker(input.caseId), ""];
  if (input.subIssues) {
    lines.push("The steps of this case are this issue's sub-issues.");
  } else {
    lines.push("Steps:");
    for (const item of input.items) {
      const state = stateOf(item, input.issueClosed(item));
      const n = input.numberOf(item);
      lines.push(`- [${state.word === "accepted" ? "x" : " "}] ${asText(item.name, NAME_MAX)} (${state.words})${n === undefined ? "" : ` ${input.repo}#${n}`} ${stepMarker(input.caseId, item.plan_item_id)}`);
    }
    if (input.items.length === 0) lines.push("(no steps yet)");
  }
  lines.push("", "Kept in step by Horizon. The case keeper decides; GitHub shows.");
  return lines.join("\n");
}

export function subIssueBody(input: { caseId: string; item: HorizonItem }): string {
  return `${asText(input.item.name, NAME_MAX)}\n\nA step of case \`${input.caseId}\`.\n\n${stepMarker(input.caseId, input.item.plan_item_id)}`;
}
