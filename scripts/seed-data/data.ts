/**
 * What the seed creates (technical annex J.2). Plain data: no I/O, no clock. Every entry has a fixed key, request id or title,
 * which is how a second run finds that the entry is already there and changes nothing.
 * Everything here is labelled "Seed" in words a person reads, so seed rows are never mistaken for the operator's own work.
 */
import { CELL_POLICY } from "../../src/adapters/sea-forge-case.ts";
export const TEMPLATES = ["seed-release-signoff@0.1.0", "seed-triage@0.1.0"] as const;

export const POLICY = CELL_POLICY;
export const SERVICE_ACTOR = { actor_id: "cognate-service", role: "service" } as const;
export const OPERATOR_ACTOR = { actor_id: "operator", role: "operator" } as const;

export interface SeedCase {
  readonly key: "release" | "triage";
  readonly label: string;
  readonly template: (typeof TEMPLATES)[number];
  readonly request_id: string;
  /** The step the template makes; it is how a case is found again without writing. */
  readonly step_id: string;
}
export const CASES: readonly SeedCase[] = [
  { key: "release", label: "Seed: weekly release", template: "seed-release-signoff@0.1.0", request_id: "seed:case:release", step_id: "signoff_release_notes" },
  { key: "triage", label: "Seed: triage inbox", template: "seed-triage@0.1.0", request_id: "seed:case:triage", step_id: "review_inbox" },
];

const REQUIRE_APPROVAL = { required_artifacts: [], required_declarations: [], require_approval: true } as const;

/** A step handed off from the composer. The id is fixed so the same hand off is the same step. */
export const HANDOFF = {
  request_id: "handoff:seed-3f6c1a52-8d0b-4e7a-9a41-5b2d7c9e1f10",
  item: { plan_item_id: "seed_handoff_metrics", name: "Seed hand off: collect this week's release numbers", item_kind: "human_task", settlement_criteria: REQUIRE_APPROVAL },
} as const;

/** A step an agent proposed. It is sent as the workshop's service actor alone, so the case keeper records who proposed it. */
export const PROPOSAL = {
  request_id: "propose:seed-r1:rollback_note",
  item: { plan_item_id: "seed_rollback_note", name: "Seed proposal: add a rollback note to the release", item_kind: "human_task", settlement_criteria: REQUIRE_APPROVAL },
} as const;

export const ISSUE = {
  title: "Seed: review the release checklist",
  body: "A demo issue made by the Horizon seed for the test setup. It is safe to close or delete.\n\nHorizon should show it as a step waiting for a decision.",
} as const;

export interface SeedObligation {
  readonly id: string;
  readonly intentId: string;
  readonly statement: string;
  readonly target: string;
  /** null: declared and never run, so it is expected but not seen. */
  readonly argv: readonly string[] | null;
  readonly expect: "matched" | "contradicted" | "expected but not seen";
}
export const OBLIGATIONS: readonly SeedObligation[] = [
  { id: "obligation-matched", intentId: "seed-obligation-matched", statement: "Seed: the release notes file exists (the check exits 0)", target: "seed:release-notes", argv: ["/usr/bin/true"], expect: "matched" },
  { id: "obligation-contradicted", intentId: "seed-obligation-contradicted", statement: "Seed: the rollback plan file exists (the check exits 1)", target: "seed:rollback-plan", argv: ["/usr/bin/false"], expect: "contradicted" },
  { id: "obligation-unseen", intentId: "seed-obligation-unseen", statement: "Seed: the changelog is updated (declared, never checked)", target: "seed:changelog", argv: null, expect: "expected but not seen" },
];

/** A declared check no session touched: expected but not seen. */
export const UNSEEN_JOURNEY = { question: "journey:J-SEED:release:3", title: "Seed: the changelog entry is written (declared, no session checked it)" } as const;
export const ACTIVITY_QUESTION = { question: "seed:agent-activity", title: "Seed: agent activity with no declared check" } as const;
export const RECORD_RUNTIME = "pi";

export interface SeedSession {
  readonly id: string;
  readonly daysAgo: number;
  /** The declared question a journey_check answers, or null for a session nobody expected anything of. */
  readonly question: string | null;
  readonly title: string;
  readonly check_exit: number | null;
  readonly tools: readonly { readonly name: string; readonly exit: number }[];
  readonly expect: "matched" | "contradicted" | "seen but not expected";
}
export const SESSIONS: readonly SeedSession[] = [
  { id: "seed-matched", daysAgo: 0, question: "journey:J-SEED:release:1", title: "Seed: the release notes are written", check_exit: 0, tools: [{ name: "Edit", exit: 0 }, { name: "Bash", exit: 0 }], expect: "matched" },
  { id: "seed-contradicted", daysAgo: 1, question: "journey:J-SEED:release:2", title: "Seed: the tests pass before release", check_exit: 1, tools: [{ name: "Bash", exit: 1 }, { name: "Edit", exit: 0 }], expect: "contradicted" },
  { id: "seed-unexpected", daysAgo: 2, question: null, title: ACTIVITY_QUESTION.title, check_exit: null, tools: [{ name: "Bash", exit: 0 }, { name: "Write", exit: 0 }, { name: "Bash", exit: 0 }], expect: "seen but not expected" },
];

export interface SeedLabel {
  readonly session: string;
  readonly verdict: "pass" | "fail";
  readonly first_failure: string;
}
export const LABELS: readonly SeedLabel[] = [
  { session: "seed-matched", verdict: "pass", first_failure: "" },
  { session: "seed-contradicted", verdict: "fail", first_failure: "Seed: the agent said the tests passed, but the record shows the test command exited 1." },
  { session: "seed-unexpected", verdict: "fail", first_failure: "Seed: the agent wrote a file nobody asked for." },
];

export interface SeedNote {
  /** The first line is the note's identity: a second run finds it there and writes nothing. */
  readonly title: string;
  readonly daysAgo: number;
  readonly tags: readonly string[];
  /** Filled in by the seed with real ids: `{case:release}`, `{case:triage}`. */
  readonly text: string;
  readonly on_case?: "release" | "triage";
}
export const NOTES: readonly SeedNote[] = [
  { title: "Seed note: release prep kickoff", daysAgo: 4, tags: ["seed", "release", "planning"], on_case: "release", text: "Release prep started. The sign-off step is on [[case:{case:release}|Seed: weekly release]]. Need the numbers by Friday #release" },
  { title: "Seed note: retro thoughts", daysAgo: 3, tags: ["seed", "retro"], text: "What went well: small steps. What to change: write the expectation before the run, not after. #retro" },
  { title: "Seed note: the contradicted session", daysAgo: 2, tags: ["seed", "review"], text: "Look at [[session:seed-contradicted|the session the record contradicted]]. The agent reported success; the test command failed. #review" },
  { title: "Seed note: triage list", daysAgo: 1, tags: ["seed", "triage"], on_case: "triage", text: "Three things arrived in [[case:{case:triage}|Seed: triage inbox]]: a GitHub issue, a hand off and an agent's proposal. Decide on each." },
  { title: "Seed note: today", daysAgo: 0, tags: ["seed", "today"], text: "Plan for today: sign off the release notes, then look at the contradicted session. See [[day:{day1}|yesterday]]." },
  { title: "Seed note: questions for the agent", daysAgo: 0, tags: ["seed", "questions"], on_case: "release", text: "Ask: which checks did you run before saying done? Link the answer to [[step:signoff_release_notes|the sign-off step]]." },
];
