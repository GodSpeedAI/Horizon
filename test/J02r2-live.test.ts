// J02 revision 2 live gate (HORIZON-001 1.1.0, SPEC-CR-002 "Independent evaluation required"): payment and IS7
// settlement of committed navigation intents, against a real sea-forge-server and a real RealityTrace, with the
// vetted verifier confined by an attested bubblewrap. Every check reads an owner's record: RealityTrace's ledger
// export, SEA-Forge's own settlement packet (read back from SEA-Forge), or the Horizon store. Horizon's view of
// itself does not count.
// Opt-in: SEA_FORGE_SERVER_BIN (with authority claims, authority_closure and obligation settlement),
// REALITYTRACE_BIN (with RT-1 completed_at) and HORIZON_BWRAP (an attested bubblewrap >= 0.12). Cognate must carry
// authority claims (GodSpeedAI/Cognate#65); without them SEA-Forge records no obligation and this gate fails.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { SeaForgeAuthority } from "@godspeedai/cognate-runtime-bun";
import { readLedger } from "../src/capabilities/capacity-ledger.ts";
import { INTENT_INDEX_COLLECTION, readIntentRecords } from "../src/capabilities/navigation-intent.ts";
import { readPending } from "../src/capabilities/pending-intent.ts";
import { applySequential, openSequential, renderSequentialText } from "../src/ui/sequential/controller.ts";
import { BIN, BWRAP, EXEMPT, GRACE_S, RECORD, RT, WRONG_TENANT, cell, ensureVerifier, expectation, rtRows, runCleanups, seaForgeSettlement, settleAfterClose } from "./support/j02r2-rig.ts";

const live = BIN && RT && BWRAP ? test : test.skip;
afterAll(() => runCleanups());
beforeAll(() => {
  if (!BIN || !RT || !BWRAP) return;
  ensureVerifier();
}, 120_000);
describe("J02 revision 2 (live)", () => {
  live("causal order across owners, and a supported obligation settles", async () => {
    const c = await cell("allow");
    const commit = await c.app.commitNavigationIntent({ operationRef: RECORD, expectation: expectation() });
    const id = commit.intent.intent_id;
    const pending = (await readPending(c.app.runtime.runtime.store, c.app.caller.tenant, id))!.pending;

    // Window open: settlement is pending, never settled early.
    expect((await c.app.settleNavigationIntent(id)).settlement_reference.status).toBe("pending");

    const settlement = await settleAfterClose(c, id);
    expect(settlement.settlement_reference).toMatchObject({ status: "settled", final: true, epistemic_status: "supported" });

    // RealityTrace's ledger: threshold at T, then discrimination (B > T, did not observe), then verification (> B, observed).
    const rows = rtRows(c);
    const threshold = rows.find((r) => r.record_kind === "threshold.declared" && r.payload.states?.[0]?.state_id === pending.threshold!.threshold_id)!;
    expect(threshold.append_ordinal).toBe(pending.threshold!.position.ordinal);
    const after = (await readPending(c.app.runtime.runtime.store, c.app.caller.tenant, id))!.pending;
    const obs = (o: string) => rows.find((r) => r.record_kind === "observation.recorded" && r.payload.observations[0].observation_id === o)!;
    const discrimination = obs(after.discrimination!.observation_id);
    const verification = obs(after.verifications![0]!.observation_id);
    expect(discrimination.append_ordinal).toBeGreaterThan(threshold.append_ordinal);
    expect(discrimination.payload.representations[0].inline_content.exit_code).toBe(1);
    expect(verification.append_ordinal).toBeGreaterThan(discrimination.append_ordinal);
    expect(verification.payload.representations[0].inline_content.exit_code).toBe(0);
    expect(verification.payload.representations[0].inline_content.invocation.launcher[0]).toBe(BWRAP);

    // SEA-Forge's own record: the claims it froze equal RealityTrace's records and the expectation digest.
    const packet = await seaForgeSettlement(c, after.operation_id!);
    expect(packet.ok).toBe(true);
    const basis = packet.envelope.settlements[0].threshold_basis;
    expect(basis.expectation_digest).toBe(pending.expectation_digest);
    expect(basis.threshold).toEqual({ id: threshold.payload.states[0].state_id, ledger_id: threshold.ledger_id, position: threshold.append_ordinal });
    expect(basis.closure.b).toBe(discrimination.append_ordinal);
    expect(basis.closure.c).toBeGreaterThanOrEqual(verification.append_ordinal);
    expect(packet.envelope.extensions["godspeed.settlement_packet"]).toMatchObject({ modality: "obligation", epistemic_status: "supported", overall_status: "settled", final: true });

    // Horizon store: the effect exists, and the reservation became consumption.
    expect((await readIntentRecords(c.app.runtime.runtime.store)).map((r) => r.record.intent_id)).toContain(id);
    const { ledger } = await readLedger(c.app.runtime.runtime.store, c.app.caller.tenant, []);
    expect(ledger.reservations.map((r) => r.intent_id)).not.toContain(id);
    expect(ledger.consumptions.map((r) => r.intent_id)).toContain(id);
  }, 240_000);

  live("a verifier checking the wrong tenant contradicts the statement: rejected", async () => {
    const c = await cell("allow");
    const commit = await c.app.commitNavigationIntent({ operationRef: WRONG_TENANT, expectation: expectation() });
    const settlement = await settleAfterClose(c, commit.intent.intent_id);
    expect(settlement.settlement_reference).toMatchObject({ status: "rejected", final: true, epistemic_status: "contradicted" });
  }, 240_000);

  live("an expectation already true before acting: the operation is not executed and nothing changes", async () => {
    const c = await cell("allow");
    const id = randomUUID();
    // The effect already exists for this intent id (as if the operation had happened outside Horizon).
    await c.app.runtime.runtime.store.commit({ appends: [], records: [{ collection: INTENT_INDEX_COLLECTION, id: `${c.app.caller.tenant}/${id}`, expectedVersion: 0, value: { event_id: "outside", intent_id: id, frame_id: "f", frame_revision: 0, actor_ref: "x", operation_ref: RECORD } }] });
    const before = (await readIntentRecords(c.app.runtime.runtime.store)).length;
    await expect(c.app.commitNavigationIntent({ operationRef: RECORD, intentId: id, expectation: expectation() })).rejects.toThrow(/already holds before acting/);
    expect((await readIntentRecords(c.app.runtime.runtime.store)).length).toBe(before);
    expect((await readPending(c.app.runtime.runtime.store, c.app.caller.tenant, id))!.pending.terminal).toMatchObject({ outcome: "refused", reason: "expected outcome already holds before acting" });
    const { ledger } = await readLedger(c.app.runtime.runtime.store, c.app.caller.tenant, []);
    expect(ledger.consumptions.map((r) => r.intent_id)).toContain(id);
  }, 240_000);

  live("a denied intent and an unaffordable intent produce no verifier run and no effect", async () => {
    const denied = await cell("deny");
    await expect(denied.app.commitNavigationIntent({ operationRef: RECORD, expectation: expectation() })).rejects.toThrow();
    expect(rtRows(denied).filter((r) => r.record_kind === "observation.recorded" && r.payload.representations?.[0]?.inline_content?.verifier_id === "command")).toHaveLength(0);
    expect(await readIntentRecords(denied.app.runtime.runtime.store)).toHaveLength(0);

    const poor = await cell("allow", { computeAllowance: 0 });
    await expect(poor.app.commitNavigationIntent({ operationRef: RECORD, expectation: expectation() })).rejects.toThrow(/payment is blocked: compute: declares 1 units, 0 available/);
    expect(rtRows(poor).filter((r) => r.record_kind === "question.declared")).toHaveLength(0);
    expect(await readIntentRecords(poor.app.runtime.runtime.store)).toHaveLength(0);
  }, 240_000);

  live("an approval that arrives after the window closes is refused and executes nothing", async () => {
    const c = await cell("escalate");
    const error = await c.app.commitNavigationIntent({ operationRef: RECORD, expectation: expectation({ window_s: 6 }) }).then(() => null, (e: unknown) => e as { approvalId?: string; intent?: { intent_id: string } });
    expect(error?.approvalId).toMatch(/^apr-/);
    await Bun.sleep(7_000);
    await expect(c.app.resolveNavigationApproval({ approvalId: error!.approvalId!, resolution: "approved" })).rejects.toThrow(/window expired/);
    expect(await readIntentRecords(c.app.runtime.runtime.store)).toHaveLength(0);
    expect((await readPending(c.app.runtime.runtime.store, c.app.caller.tenant, error!.intent!.intent_id))!.pending.terminal).toMatchObject({ outcome: "refused", reason: "window expired" });
  }, 240_000);

  live("Horizon stopped across the deadline: the late closure cannot prove C on time, so unresolved and rejected", async () => {
    const c = await cell("allow");
    const commit = await c.app.commitNavigationIntent({ operationRef: RECORD, expectation: expectation({ window_s: 10 }) });
    const id = commit.intent.intent_id;
    const pending = (await readPending(c.app.runtime.runtime.store, c.app.caller.tenant, id))!.pending;
    await c.app.close();
    await Bun.sleep(Math.max(0, Date.parse(pending.window!.closes_at) - Date.now()) + (GRACE_S + 2) * 1000);
    c.app = await c.reopen();
    const settlement = await c.app.settleNavigationIntent(id);
    expect(settlement.settlement_reference).toMatchObject({ status: "rejected", final: true, epistemic_status: "unresolved" });
  }, 240_000);

  live("REQ-NAV-010: observed steering attention equals SEA-Forge's recorded decisions, beside the declared bound in the frame and the Clack render", async () => {
    const c = await cell("escalate");
    const waiting = await c.app.commitNavigationIntent({ operationRef: RECORD, expectation: expectation() }).then(() => null, (e: unknown) => e as { approvalId?: string });
    expect(waiting?.approvalId).toMatch(/^apr-/);
    const committed = await c.app.resolveNavigationApproval({ approvalId: waiting!.approvalId!, resolution: "approved" });
    // SEA-Forge's own record of human authority decisions for that approval.
    const listed = await new SeaForgeAuthority({ socketPath: c.socket, actor: { actor_id: "cognate-service", role: "service" } }).listApprovals({ timeoutMs: 15_000 });
    if (!listed.ok) throw new Error(`${listed.errorClass}: ${listed.error}`);
    const decided = listed.approvals.filter((a) => a.approval_id === waiting!.approvalId && a.resolved_by);
    expect(decided).toHaveLength(1);
    const observed = (await readPending(c.app.runtime.runtime.store, c.app.caller.tenant, committed.intent.intent_id))!.pending.observed;
    expect(observed).toEqual([{ currency: "steering_attention", unit: "decisions", amount: decided.length, source_ref: "sea-forge:authority_approvals" }]);
    // The frame projection carries it beside the declared bound ...
    const frame = await c.app.navigationFrame();
    const choice = frame.choices.find((ch) => ch.operation_ref === RECORD)!;
    expect(choice.payment?.observed).toEqual(observed!);
    expect(choice.payment?.entries.find((entry) => entry.currency === "steering_attention")).toMatchObject({ amount: 1, unit: "decisions", basis: "declared_bound" });
    // ... and so does the Clack render of the move's review.
    const reviewed = applySequential(openSequential(frame), { type: "select", choice_id: RECORD, frame_id: frame.frame_id, revision: frame.revision });
    expect(reviewed.session.prompt.kind).toBe("review");
    const text = renderSequentialText(reviewed.session.prompt);
    expect(text).toContain("steering_attention declared 1 decisions, observed 1 decisions (sea-forge:authority_approvals)");
  }, 240_000);

  live("an exempt read_only intent settles not_required without an expectation", async () => {
    const c = await cell("allow");
    const commit = await c.app.commitNavigationIntent({ operationRef: EXEMPT });
    expect((await c.app.settleNavigationIntent(commit.intent.intent_id)).settlement_reference).toMatchObject({ status: "not_required", final: true });
  }, 240_000);
});
