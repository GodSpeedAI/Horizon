/** @jsxImportSource react */
/** The word scan, extended to the text the gap fixes added. */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { startsWords } from "../src/ui/desk/Composer.tsx";
import { AGENT_READ_WORDS, NOT_RECORDED_WORDS } from "../src/app.ts";
import { LOCKED_WORDS, NOT_PAIRED_WORDS, SPENT_CODE_WORDS, WRONG_CODE_WORDS } from "../src/desk/pairing.ts";
import { PAIR_BODY, PAIR_HEADING, PAIR_LIMIT, PAIR_NO_ANSWER, PAIR_FAILED } from "../src/ui/desk/pair-words.ts";
import { WITHHELD_WORDS } from "../src/ui/desk/agent-view.ts";
import { BANNED, hasBannedWords } from "../src/ui/desk/banned-words.ts";
import { START } from "../src/ui/desk/attention.ts";
import { CONTROL_WORDS } from "../src/ui/desk/blocks/ask.tsx";
import { STAGE_WORD, STATUS_WORD } from "../src/ui/desk/Conversation.tsx";
import { TOO_MANY_PROPOSALS, type ConversationRow } from "../src/ui/desk/conversation-model.ts";
import { Desk } from "../src/ui/desk/Desk.tsx";
import { ANSWERED_CANNOT_CHANGE, QUESTION_CHANGED, REQUIRED_CANNOT_WITHDRAW } from "../src/ui/desk/panels-model.ts";
import { INSPECT_WITHHELD } from "../src/ui/desk/webmcp-tools.ts";
import { deskState } from "./support/desk-fixture.ts";
import { quietIo } from "./support/desk-io.ts";

const visible = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const clean = (label: string, words: string): void => {
  const hits = BANNED.filter((b) => b.pattern.test(words)).map((b) => b.name);
  expect({ label, hits }).toEqual({ label, hits: [] });
  expect({ label, flagged: hasBannedWords(words) }).toEqual({ label, flagged: false });
};

describe("new sentences are plain", () => {
  test("every refusal and note", () => {
    const all: Record<string, string> = { NOT_PAIRED_WORDS, WRONG_CODE_WORDS, LOCKED_WORDS, SPENT_CODE_WORDS, PAIR_HEADING, PAIR_BODY, PAIR_LIMIT, PAIR_NO_ANSWER, PAIR_FAILED, NOT_RECORDED_WORDS, TOO_MANY_PROPOSALS, QUESTION_CHANGED, ANSWERED_CANNOT_CHANGE, REQUIRED_CANNOT_WITHDRAW, AGENT_READ_WORDS, WITHHELD_WORDS, INSPECT_WITHHELD, ...CONTROL_WORDS, ...STATUS_WORD, ...STAGE_WORD };
    for (const [label, words] of Object.entries(all)) clean(label, words);
  });

  test("the sentences that say what will start, and the warnings shown after an answer or a note", () => {
    const pv = { draft_id: "d", case_id: "c1", case_title: "Seed", step_name: "Fix the footer", step_id: "s", check: "ok", plan_precondition: { ref: "p", expected_digest: "x" }, agent: { offered: false, words: "" } };
    clean("starts, others", startsWords({ ...pv, also_starts: [{ step_id: "a", name: "Call the supplier" }] }).replace(/Fix the footer|Call the supplier/g, ""));
    clean("starts, only this", startsWords(pv).replace(/Fix the footer/g, ""));
    clean("the answer could not be sent", "The answer could not be sent. Nothing was changed. Try again.");
    clean("the note was saved", "The note was saved. This was done, but it could not be added to the conversation. Check the desk log.");
    clean("steps changed", "Preview out of date. The steps waiting to start in this case changed after you looked at it. Nothing was sent. Look at the new preview and decide again.");
    clean("other agent", "That question was asked by a different agent, so you cannot answer for it.");
  });

  test("a conversation with stages, a claimed route and a partly done hand off", () => {
    const base = { at: "2026-11-07T10:00:00Z", source: "you" as const, refs: { case_id: "c1", step_id: "s1" } };
    const rows: ConversationRow[] = [
      { ...base, row_id: "r1", kind: "handoff", words: "Sort the inbox", outcome: "Handed off.", status: "partial", stages: [{ name: "Sent", status: "done", words: "The step was added to the case." }, { name: "Started", status: "refused", words: "It did not start: the case keeper could not start it.", recovery: "Try again" }, { name: "Given to an agent", status: "refused", words: "No agent has it: not connected.", recovery: "Open the step" }, { name: "Result seen", status: "unseen", words: "Not seen yet." }] },
      { ...base, row_id: "r2", kind: "answer", words: "You answered: A", outcome: "The agent says it took it to: step one. Not checked: Horizon found no step with that name.", status: "claimed" },
    ];
    const html = renderToStaticMarkup(<Desk ui={{ ...START, view: "conversation", rows, data: deskState() }} dispatch={() => undefined} io={quietIo()} />);
    clean("conversation", visible(html).replace(/Sort the inbox|You answered: A/g, ""));
  });
});
