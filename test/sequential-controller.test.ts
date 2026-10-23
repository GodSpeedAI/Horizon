import { describe, expect, test } from "bun:test";
import {
  applySequential,
  openSequential,
  presentSequentialFrame,
  renderSequentialText,
  type SequentialSession,
} from "../src/ui/sequential/controller.ts";
import { CHECKPOINT, frame, j01, j02, j02Blocked, j02Conflicted, j02Denied, j03, j04Unknown, j05, readOnly } from "./support/sequential-fixture.ts";

function select(session: SequentialSession, choice_id: string, frame_id = session.frame.frame_id, revision = session.frame.revision) {
  return applySequential(session, { type: "select", choice_id, frame_id, revision });
}

function confirm(session: SequentialSession, frame_id = session.frame.frame_id, revision = session.frame.revision) {
  return applySequential(session, { type: "confirm", frame_id, revision });
}

describe("T08 sequential controller", () => {
  test("J01 optional-only case asks one question, does not force a primary and asks no known context again", () => {
    const session = openSequential(j01());
    expect(session.prompt.kind).toBe("choice");
    if (session.prompt.kind !== "choice") return;
    expect(session.frame.primary_choice_ref).toBeNull();
    expect(session.prompt.initial_choice_id).toBeNull();
    expect(session.prompt.context.context_questions).toEqual([]);
    expect(session.prompt.body.join(" ")).toContain("no context question is needed");
    expect(session.prompt.options.some((option) => option.id === "horizon.inspect.focus" && !option.disabled)).toBe(true);
    expect(session.prompt.options.some((option) => option.label === "Inspect Strategy Alpha")).toBe(true);
  });

  test("a known checkpoint is not asked for; an unknown one is", () => {
    expect(openSequential(j01()).prompt.context.context_questions).toEqual([]);
    const unknown = frame({ optional: true, checkpoint: null, candidates: [readOnly("horizon.inspect.focus", "Inspect")] });
    const session = openSequential(unknown);
    expect(session.prompt.context.context_questions).toEqual(["Which checkpoint should this view use?"]);
    expect(session.prompt.body.join(" ")).toContain("Still needed: Which checkpoint");
  });

  test("J02 consequential choice is reviewed before any typed intent exists", () => {
    const opened = openSequential(j02());
    expect(opened.prompt.kind).toBe("choice");
    const reviewed = select(opened, "product.apply");
    expect(reviewed.ok).toBe(true);
    expect(reviewed.intent).toBeNull();
    expect(reviewed.session.pending_review?.operation_ref).toBe("product.apply");
    expect(reviewed.session.prompt.kind).toBe("review");
    if (reviewed.session.prompt.kind !== "review") return;

    const review = reviewed.session.prompt;
    expect(review.question).toContain("Apply the strategy change");
    expect(review.reversibility).toBe("compensable");
    expect(review.payment).toContain("2 credits");
    expect(review.payment).toContain("heuristic estimate");
    expect(review.expected_evidence).toEqual(["evidence:receipt"]);
    expect(review.escalation).toContain("approval");
    expect(review.simulation_note).toBeNull();
    expect(review.body.join(" ")).toContain("does not approve or execute");

    const confirmed = confirm(reviewed.session);
    expect(confirmed.ok).toBe(true);
    expect(confirmed.intent?.kind).toBe("confirm");
    expect(confirmed.intent?.operation_ref).toBe("product.apply");
    expect(confirmed.intent?.actor_ref).toBe("os:operator:1000");
    expect(confirmed.intent?.simulated).toBe(false);
    expect(confirmed.session.intents).toHaveLength(1);
  });

  test("a contradictory authority is visible, not selectable, and names one next prerequisite", () => {
    for (const [label, frameValue, reason] of [
      ["blocked", j02Blocked(), "needs an authorized approver"],
      ["denied", j02Denied(), "policy prohibits"],
      ["unknown", j04Unknown(), "unreachable"],
      ["conflicted", j02Conflicted(), "disagree"],
    ] as const) {
      const session = openSequential(frameValue);
      expect(session.prompt.kind).toBe("choice");
      if (session.prompt.kind !== "choice") continue;
      const option = session.prompt.options.find((entry) => entry.operation_ref === frameValue.choices.find((choice) => choice.kind === "move")?.operation_ref);
      expect(option?.disabled).toBe(true);
      expect(option?.reason).toContain(reason);
      expect(session.prompt.blocked.length).toBeGreaterThan(0);
      if (label === "blocked") {
        expect(session.prompt.blocked[0]?.next_step).toContain("sea-forge:approval:42");
      }
      const refused = select(session, option?.id ?? "missing");
      expect(refused.ok).toBe(false);
      expect(refused.intent).toBeNull();
      expect(refused.session.intents).toHaveLength(0);
    }
  });

  test("stale revision after a newer frame is refused and asks for refresh", () => {
    const opened = openSequential(j02());
    const newer = presentSequentialFrame(opened, frame({ frame_id: "frame:t08:2", revision: 2, candidates: [consequentialAgain()] }));
    const stale = select(newer, "product.apply", "frame:t08:1", 1);
    expect(stale.ok).toBe(false);
    expect(stale.intent).toBeNull();
    expect(stale.session.error?.code).toBe("stale_frame");
    expect(stale.session.prompt.kind).toBe("notice");
    if (stale.session.prompt.kind === "notice") expect(stale.session.prompt.tone).toBe("stale");
    expect(stale.session.intents).toHaveLength(0);
    expect(stale.session.latest_frame.revision).toBe(2);

    const refreshed = applySequential(stale.session, { type: "refresh" });
    expect(refreshed.ok).toBe(true);
    expect(refreshed.session.frame.revision).toBe(2);
    expect(refreshed.session.prompt.kind).toBe("choice");
  });

  test("a review cannot survive a frame change", () => {
    const opened = openSequential(j02());
    const reviewed = select(opened, "product.apply");
    const newer = presentSequentialFrame(reviewed.session, frame({ frame_id: "frame:t08:2", revision: 2, candidates: [consequentialAgain()] }));
    expect(newer.pending_review).toBeNull();
    expect(newer.prompt.kind).toBe("choice");
    const staleConfirm = confirm(newer);
    expect(staleConfirm.ok).toBe(false);
    expect(staleConfirm.session.error?.code).toBe("invalid_intent");
    expect(newer.intents).toHaveLength(0);
  });

  test("cancel midway keeps frame, focus and selection and emits nothing", () => {
    const opened = openSequential(j02());
    const reviewed = select(opened, "product.apply");
    const cancelled = applySequential(reviewed.session, { type: "cancel" });
    expect(cancelled.ok).toBe(true);
    expect(cancelled.intent).toBeNull();
    expect(cancelled.session.intents).toHaveLength(0);
    expect(cancelled.session.frame).toBe(reviewed.session.frame);
    expect(cancelled.session.selection).toBe("product.apply");
    expect(cancelled.session.pending_review).toBeNull();
    expect(cancelled.session.prompt.kind).toBe("notice");
    if (cancelled.session.prompt.kind === "notice") expect(cancelled.session.prompt.tone).toBe("cancelled");

    const resumed = applySequential(cancelled.session, { type: "resume" });
    expect(resumed.intent).toBeNull();
    expect(resumed.session.prompt.kind).toBe("choice");
    if (resumed.session.prompt.kind === "choice") expect(resumed.session.prompt.initial_choice_id).toBe("product.apply");
  });

  test("back restores the previous frame and selection, and does not act on a historical frame", () => {
    const opened = openSequential(j01());
    const inspected = select(opened, "horizon.inspect.focus");
    expect(inspected.intent?.kind).toBe("inspect");
    const moved = presentSequentialFrame(inspected.session, frame({ frame_id: "frame:t08:2", revision: 2, optional: true, candidates: [readOnly("horizon.inspect.focus", "Inspect Strategy Alpha")] }));
    expect(moved.history).toHaveLength(1);
    expect(moved.selection).toBe("horizon.inspect.focus");

    const back = applySequential(moved, { type: "back" });
    expect(back.ok).toBe(true);
    expect(back.session.frame.frame_id).toBe("frame:t08:1");
    expect(back.session.selection).toBe("horizon.inspect.focus");
    expect(back.session.prompt.current).toBe(false);
    expect(back.session.prompt.body.join(" ")).toContain("earlier frame");

    const refused = select(back.session, "horizon.inspect.focus", "frame:t08:1", 1);
    expect(refused.ok).toBe(false);
    expect(refused.session.error?.code).toBe("stale_frame");

    const resumed = applySequential(back.session, { type: "resume" });
    expect(resumed.session.frame.frame_id).toBe("frame:t08:2");
    expect(resumed.session.prompt.current).toBe(true);
  });

  test("defer is a typed control, not a fake commitment", () => {
    const opened = openSequential(j02());
    const deferred = select(opened, "horizon.navigation.defer");
    expect(deferred.ok).toBe(true);
    expect(deferred.intent?.kind).toBe("defer");
    expect(deferred.intent?.operation_ref).toBe("horizon.navigation.defer");
    expect(deferred.session.pending_review).toBeNull();
    expect(deferred.session.intents).toHaveLength(1);
    if (deferred.session.prompt.kind === "notice") expect(deferred.session.prompt.tone).toBe("deferred");
  });

  test("simulation is explicit in both the intent and the review", () => {
    const opened = openSequential(j02(), { simulate_consequences: true, source: "test-simulation" });
    const reviewed = select(opened, "product.apply");
    if (reviewed.session.prompt.kind !== "review") throw new Error("expected review");
    expect(reviewed.session.prompt.simulation_note).toContain("SIMULATION");
    const confirmed = confirm(reviewed.session);
    expect(confirmed.intent?.simulated).toBe(true);
    expect(reviewed.session.source).toBe("test-simulation");
  });

  test("J01–J05 fixtures all traverse a prompt without renderer-side authority", () => {
    const cases = [
      ["J01", j01()],
      ["J02", j02()],
      ["J02-blocked", j02Blocked()],
      ["J02-denied", j02Denied()],
      ["J02-conflicted", j02Conflicted()],
      ["J03", j03()],
      ["J04-unknown", j04Unknown()],
      ["J05", j05()],
    ] as const;
    for (const [, value] of cases) {
      const session = openSequential(value);
      expect(session.prompt.kind).toBe("choice");
      expect(session.frame.authority.grants_authority).toBe(false);
      const move = session.frame.choices.find((choice) => choice.kind === "move" && choice.selectable);
      if (move !== undefined) {
        const next = select(session, move.operation_ref);
        expect(next.ok).toBe(true);
        expect(next.session.prompt.kind).toBe(move.reversibility === "read_only" ? "notice" : "review");
      } else {
        const control = session.frame.choices.find((choice) => choice.selectable);
        expect(control).toBeDefined();
        const next = select(session, control?.operation_ref ?? "missing");
        expect(next.ok).toBe(true);
      }
    }
  });

  test("text rendering is deterministic and leads with plain language", () => {
    const session = openSequential(j02Blocked());
    const first = renderSequentialText(session.prompt);
    expect(first).toBe(renderSequentialText(session.prompt));
    expect(first).toContain("you are not authorized yet");
    expect(first).toContain("sea-forge:approval:42");
    expect(first).toContain("Apply the strategy change");
  });
});

function consequentialAgain() {
  return {
    operation_ref: "product.apply",
    label: "Apply the strategy change",
    kind: "move" as const,
    responsibility: "commit" as const,
    reversibility: "compensable" as const,
    gates: {
      visibility: { verdict: "pass" as const, basis_ref: CHECKPOINT },
      reach: { verdict: "pass" as const, basis_ref: CHECKPOINT },
      payment: { verdict: "pass" as const, basis_ref: CHECKPOINT },
      authority: { verdict: "pass" as const, authority_outcome: "likely_allow" as const, basis_ref: CHECKPOINT },
      capability: { verdict: "pass" as const, basis_ref: CHECKPOINT },
      recovery: { verdict: "pass" as const, basis_ref: CHECKPOINT },
      settlement_access: { verdict: "pass" as const, basis_ref: CHECKPOINT },
    },
    payment: { entries: [{ currency: "compute" as const, unit: "credits", amount: 2, basis: "predicted" as const, source_ref: "fixture" }] },
    expected_evidence: ["evidence:receipt"],
    escalation: { behavior: "approval" as const, approval_ref: "sea-forge:approval" },
  };
}
