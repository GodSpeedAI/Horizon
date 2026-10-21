/**
 * T10 positive evidence (PE-01 … PE-14), one test per `.agents/prereg/horizon/T10.prereg.yaml`
 * `positive_expectations` entry.
 *
 * The local half reads a *real* Cognate SQLite store: `src/app.ts` builds its frame from the T06
 * projection read, so a debugger answer here describes rows that durable events produced. The
 * retrieval half drives `horizon.context.query_reference` through the runtime's own service, so the
 * boot-registered binding and its policy are exercised rather than an adapter imported by a test.
 *
 * What these do NOT establish: that a live Context Kernel answered (that is the evidence
 * transcript), or that the fixture rows came from an external system (the T06 known confound).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StoredEvent } from "@godspeedai/cognate-events";
import { createApplication, type HorizonApplication } from "../src/app.ts";
import { createContextKernelAdapter, type ContextReferenceAnswer } from "../src/adapters/context-kernel.ts";
import { CONTEXT_REFERENCE } from "../src/capabilities/context.ts";
import { INTENT_STREAM, readIntentRecords } from "../src/capabilities/navigation-intent.ts";
import {
  DEBUGGER_OPERATIONS,
  debuggerCatalogue,
  runDebugger,
  type DebuggerSources,
} from "../src/domain/debugger.ts";
import { retrievalView } from "../src/ui/workspace/inspect.ts";
import { WORKSPACE_REGION_ORDER } from "../src/ui/workspace/model.ts";
import { seedOperationalFixture } from "./support/operational-fixture.ts";
import { horizonDocument, writeConfig } from "./support/config.ts";
import { CHECKPOINT } from "./support/sequential-fixture.ts";
import type { LineageEdgeV1 } from "../src/domain/operational.ts";

const FOCUS = "obj:strategy:alpha";
/** The checkpoint the fixture recorded the focus row at (`fixtureObjects` provenance). */
const ALPHA_CHECKPOINT = "cognate:3";

let application: HorizonApplication;
/** A second application whose bound Context Kernel answers from a scripted wire, not a process. */
let kernelApplication: HorizonApplication;
/** The lines the bound application sent to its Context Kernel, in order. */
const kernelLines: string[] = [];

const STATUS_LINE = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  result: { status: "ok", corpus: "horizon", documents: 1, chunks: 1 },
});

/** One answer line per request line, shaped like the live server's `query_reference` result. */
function kernelLine(line: string): string {
  kernelLines.push(line);
  const request = JSON.parse(line) as {
    id?: unknown;
    method?: unknown;
    params?: { name?: unknown; arguments?: { query?: unknown; canonical_id?: unknown } };
  };
  const name = typeof request.params?.name === "string" ? request.params.name : "";
  if (name === "get_status") return STATUS_LINE;
  const query = typeof request.params?.arguments?.query === "string" ? request.params.arguments.query : "";
  const corpus = typeof request.params?.arguments?.canonical_id === "string" ? request.params.arguments.canonical_id : "horizon";
  return JSON.stringify({
    jsonrpc: "2.0",
    id: request.id ?? 1,
    result: {
      results: [
        {
          result_id: "t10kb#chunk-1",
          canonical_id: corpus,
          chunk_id: "chunk-1",
          title: "T10 knowledge base",
          heading: "Retrieval is reference material",
          excerpt: `Reference excerpt for: ${query}`,
          citation: { uri: "context:horizon/t10kb.md", anchor: "retrieval-is-reference-material" },
          score: 0.5,
          metadata: {},
        },
      ],
      query_id: "q-1",
      truncated: false,
    },
  });
}

async function configAt(name: string, contextKernel: boolean): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), `t10-${name}-`));
  return writeConfig(
    join(root, "horizon.toml"),
    horizonDocument({
      storePath: join(root, `${name}.sqlite`),
      secretPath: join(root, "launch.secret"),
      ...(contextKernel ? { contextKernelCommand: ["context-kernal", "serve"], corpusId: "horizon" } : {}),
    }),
  );
}

beforeAll(async () => {
  application = await createApplication({ configPath: await configAt("retrieval", false) });
  await seedOperationalFixture(application.runtime.runtime.store, undefined, application.caller.tenant);
  kernelApplication = await createApplication({
    configPath: await configAt("kernel", true),
    // The adapter is injected, so no process is spawned; the capability, its policy and the
    // boot-recorded binding are still the production ones (REQ-STACK-010).
    contextAdapter: createContextKernelAdapter({
      command: "context-kernal",
      scope: { corpus_id: "horizon" },
      transport: async (line) => ({ ok: true, line: kernelLine(line) }),
    }),
  });
  await seedOperationalFixture(kernelApplication.runtime.runtime.store, undefined, kernelApplication.caller.tenant);
});

afterAll(async () => {
  await application?.close();
  await kernelApplication?.close();
});

async function allEvents(): Promise<StoredEvent[]> {
  return application.runtime.runtime.store.readAll({});
}

/** Read the frame-backed sources the way `inspectFocus` does, for a direct domain call. */
async function inspectionSources(): Promise<DebuggerSources> {
  const frame = await application.navigationFrame({ focusRef: FOCUS });
  const data = await application.workspace({ focusRef: FOCUS });
  return { frame, objects: data.objects, links: data.links, lineage: [], declared_relations: [] };
}

/** The composite checkpoint this application's operational read is at, remembered for comparisons. */
let seenCheckpoint: string | null = null;

/**
 * A readable checkpoint the projection has already reached, derived from the frame's own checkpoint.
 *
 * The composite checkpoint is `cognate-checkpoint/1@<position>;<projection>@<version>,…`, so the
 * projection refs are reused verbatim and only the position moves back to 1 — a position the seeded
 * fixture is after — so reading there truncates the row set and never fabricates one.
 */
function earlierCheckpoint(): string {
  if (seenCheckpoint === null) throw new Error("earlierCheckpoint() called before a frame was read");
  const cut = seenCheckpoint.split(";").slice(1).join(";");
  return `cognate-checkpoint/1@1;${cut}`;
}

/**
 * A composite checkpoint the projection has *not* reached: the same projections, ahead of the frame.
 *
 * A position in the future is not a checkpoint that held no rows; it is a checkpoint that does not
 * exist yet, and it is what a reader must report as `unavailable` rather than as an empty diff.
 */
function unreachedCheckpoint(): string {
  if (seenCheckpoint === null) throw new Error("unreachedCheckpoint() called before a frame was read");
  const cut = seenCheckpoint.split(";").slice(1).join(";");
  return `cognate-checkpoint/1@999999;${cut}`;
}

describe("T10 world debugger and CK retrieval — positive evidence (PE-01…PE-14)", () => {
  test("PE-01: seven debugger operations answer from one shared focus with the frame context", async () => {
    expect(DEBUGGER_OPERATIONS).toEqual(["why", "impact", "diff", "timeline", "counterfactual", "reach", "replay"]);
    expect(debuggerCatalogue().map((entry) => entry.operation)).toEqual([...DEBUGGER_OPERATIONS]);
    const answers = await Promise.all(
      DEBUGGER_OPERATIONS.map((operation) => application.inspectFocus(operation, { focusRef: FOCUS })),
    );
    expect(answers.map((entry) => entry.debugger.operation)).toEqual([...DEBUGGER_OPERATIONS]);
    for (const entry of answers) {
      expect(entry.frame.focus_ref).toBe(FOCUS);
      expect(entry.frame.world_ref).toBe(application.world.worldRef);
      expect(entry.frame.checkpoint_ref).toBeTruthy();
      expect(entry.debugger.question.length).toBeGreaterThan(0);
    }
    // One shared focus means one frame: every operation is answered about the same frame.
    expect(new Set(answers.map((entry) => entry.frame.frame_id)).size).toBe(1);
  });

  test("PE-02: every value names a class from the closed set and the source it came from", async () => {
    const classes = new Set(["recorded", "derived", "unknown", "effect", "untrusted_reference"]);
    const results = await Promise.all(
      DEBUGGER_OPERATIONS.map((operation) => application.inspectFocus(operation, { focusRef: FOCUS, checkpointRef: CHECKPOINT })),
    );
    let seen = 0;
    for (const result of results) {
      const answered = result.debugger;
      for (const entry of answered.values) {
        seen += 1;
        expect(classes.has(entry.class)).toBe(true);
        expect(entry.source.length).toBeGreaterThan(0);
        // `unknown` is never a bare absence: it names the source that records nothing.
        if (entry.class === "unknown") expect(entry.missing_source).toBeTruthy();
        else expect(entry.missing_source).toBeNull();
      }
    }
    expect(seen).toBeGreaterThan(0);
    // `effect` is only ever a committed intent record; this read-only surface claims none.
    expect(results.flatMap((entry) => entry.debugger.values).some((entry) => entry.class === "effect")).toBe(false);
  });

  test("PE-03: why explains the focus through recorded rows, links and lineage only", async () => {
    const sources = await inspectionSources();
    const lineage: LineageEdgeV1[] = [
      {
        schema: "horizon.operational-objects/1",
        graph: "lineage",
        observation_ref: "obs:mlflow:run-1",
        object_ref: FOCUS,
        provenance: {
          product: "horizon",
          connector: "mlflow",
          integration_level: "fixture",
          checkpoint_ref: CHECKPOINT,
          observed_at: "2026-10-20T12:00:00.000Z",
        },
      },
    ];
    const answer = runDebugger({ ...sources, lineage, declared_relations: ["journey.covers", "entity.governed_by"] }, { operation: "why" });
    const valueOf = (key: string) => answer.values.find((entry) => entry.key === key);
    expect(answer.status).toBe("ok");
    expect(answer.settles).toBe(false);
    expect(valueOf("semantic_ref")?.class).toBe("recorded");
    expect(valueOf("field.tier")?.value).toBe("1");
    // The live store's lineage edge is the only lineage source; a supplied edge is reported verbatim.
    expect(answer.values.filter((entry) => entry.key.startsWith("lineage")).map((entry) => entry.value)).toContain("obs:mlflow:run-1");
    expect(answer.values.filter((entry) => entry.key.startsWith("link[")).length).toBeGreaterThan(0);

    // A focus the projection does not hold is `unknown` with the source named, never an invented edge.
    const absent = runDebugger(
      { ...sources, lineage: [], frame: { ...sources.frame, focus_ref: "obj:not-recorded" } },
      { operation: "why" },
    );
    expect(absent.values).toHaveLength(1);
    expect(absent.values[0]?.class).toBe("unknown");
    expect(absent.values[0]?.missing_source).toBeTruthy();
  });

  test("PE-04: impact follows only declared links within an explicit bound and folds the remainder", async () => {
    const sources = await inspectionSources();
    // The pinned world declares no operational relation types, so no edge may be traversed: impact
    // is bounded by the vocabulary first and by `max_nodes` second, and says so either way.
    expect(sources.declared_relations).toEqual([]);
    const refused = runDebugger(sources, { operation: "impact", direction: "out", max_depth: 2, max_nodes: 64 });
    expect(refused.values.some((entry) => /^depth\d+:/.test(entry.key))).toBe(false);
    // The absence is named per relation type, and the remainder folds into one sentence.
    const remainder = refused.unknown_remainder.join(" ");
    for (const relation of ["journey.covers", "entity.governed_by", "host.serves"]) {
      expect(remainder).toContain(`${relation} is outside the declared operational vocabulary`);
    }
    expect(remainder).toContain("this answer covers operational links only");
    for (const entry of refused.values) {
      if (entry.class === "unknown") expect(entry.missing_source).toBeTruthy();
    }
    // Traversal is exercised on the same rows once the world declares the two relation types the
    // fixture uses; the bound is still explicit, and a cap folds rather than silently truncates.
    const declared = { ...sources, declared_relations: ["journey.covers", "entity.governed_by"] };
    const bounded = runDebugger(declared, { operation: "impact", direction: "out", max_depth: 2, max_nodes: 64 });
    expect(bounded.status).toBe("ok");
    const reached = bounded.values.filter((entry) => /^depth\d+:/.test(entry.key)).map((entry) => entry.key);
    // `alpha -entity.governed_by-> beta` is the only outgoing edge; `journey.covers` points the
    // other way, so it is reached by an `in` walk and never by this one.
    expect(reached).toEqual(["depth1:obj:strategy:beta"]);
    const inward = runDebugger(declared, { operation: "impact", direction: "in", max_depth: 2, max_nodes: 64 });
    const inbound = inward.values.filter((entry) => /^depth\d+:/.test(entry.key)).map((entry) => entry.key);
    expect(inbound).toEqual(["depth1:obj:journey:j01"]);
    // `obj:host:local` has two outgoing edges, so a cap of one folds the second rather than
    // truncating silently; the fold is `derived` and names the cap that bit.
    // From `obj:journey:j01`, `obj:strategy:alpha` is depth 1 and its own two neighbours are the
    // candidates a cap of one must fold; the single focus edge alone can never fold.
    const capped = { ...declared, frame: { ...declared.frame, focus_ref: "obj:journey:j01" } };
    const folded = runDebugger(capped, { operation: "impact", direction: "out", max_depth: 2, max_nodes: 1 });
    const foldedEntry = folded.values.find((entry) => entry.key === "folded");
    expect(foldedEntry?.value).toContain("folded beyond max_nodes=1");
    expect(foldedEntry?.class).toBe("derived");
    expect(folded.values.filter((entry) => /^depth\d+:/.test(entry.key)).length).toBe(1);
    const full = runDebugger(capped, { operation: "impact", direction: "out", max_depth: 2, max_nodes: 64 });
    expect(full.values.some((entry) => entry.key === "folded")).toBe(false);
    // An unstated bound is refused: an unbounded walk is never performed by default.
    const unbounded = runDebugger(declared, { operation: "impact" });
    expect(unbounded.status).toBe("refused");
    expect(unbounded.code).toBe("limit");
    expect(unbounded.message).toContain("missing max_depth, max_nodes");
    const tooDeep = runDebugger(declared, { operation: "impact", max_depth: 5, max_nodes: 8 });
    expect(tooDeep.status).toBe("refused");
    expect(tooDeep.code).toBe("invalid_argument");
    // A relation type the world does not declare is refused by name, not silently skipped.
    const undeclaredType = runDebugger(declared, { operation: "impact", max_depth: 1, max_nodes: 8, relation_types: ["host.serves"] });
    expect(undeclaredType.status).toBe("refused");
    expect(undeclaredType.code).toBe("undeclared");
    // The same request without the declared vocabulary reaches no edge at all.
    const undeclared = runDebugger(sources, { operation: "impact", direction: "out", max_depth: 2, max_nodes: 64 });
    expect(undeclared.values.some((entry) => /^depth\d+/.test(entry.key))).toBe(false);
  });

  test("PE-05: diff compares the frame's checkpoint with another checkpoint read through the T06 adapter", async () => {
    // Naming the frame's own composite checkpoint is a same-checkpoint read, and it still goes
    // through the adapter rather than being echoed from memory.
    const current = await application.inspectFocus("diff", { focusRef: FOCUS });
    const frameCheckpoint = current.frame.checkpoint_ref;
    if (frameCheckpoint === null) throw new Error("the frame carries no checkpoint; diff has nothing to compare");
    seenCheckpoint = frameCheckpoint;
    const same = await application.inspectFocus("diff", { focusRef: FOCUS, checkpointRef: frameCheckpoint });
    expect(same.debugger.status).toBe("ok");
    const valueOf = (answer: { readonly values: readonly { readonly key: string; readonly value: string }[] }, key: string) =>
      answer.values.find((entry) => entry.key === key);
    expect(valueOf(same.debugger, "mode")?.value).toBe("same-checkpoint");
    expect(same.debugger.compared_checkpoint).toBe(frameCheckpoint);
    expect(valueOf(same.debugger, "added")?.value).toBe("none");
    expect(valueOf(same.debugger, "changed")?.value).toBe("none");
    expect(valueOf(same.debugger, "removed")?.value).toBe("none");

    // A checkpoint the projection has already reached is readable, and reading it truncates the row
    // set rather than echoing the current one: at position 1 the fixture holds fewer rows than now,
    // so comparing forward reports what was added since, and removes nothing it cannot see.
    const earlier = await application.inspectFocus("diff", { focusRef: FOCUS, checkpointRef: earlierCheckpoint() });
    expect(earlier.debugger.status).toBe("ok");
    expect(valueOf(earlier.debugger, "mode")?.value).toBe("comparing");
    expect(earlier.debugger.compared_checkpoint).toBe(earlierCheckpoint());
    expect(valueOf(earlier.debugger, "added")?.value).not.toBe("none");
    expect(valueOf(earlier.debugger, "removed")?.value).toBe("none");

    // A checkpoint the adapter cannot restore is `unavailable`, never an empty diff: a position the
    // projection has not reached does not exist yet, and no-position/garbled refs are not a
    // comparison at all.
    for (const unreadableRef of [unreachedCheckpoint(), "cognate:3", "cognate:projection@999999", "not-a-checkpoint"]) {
      const unreadable = await application.inspectFocus("diff", { focusRef: FOCUS, checkpointRef: unreadableRef });
      expect(unreadable.debugger.status).toBe("unavailable");
      expect(unreadable.debugger.code).toBe("checkpoint_unreadable");
      expect(unreadable.debugger.values.some((entry) => entry.key === "added")).toBe(false);
      expect(unreadable.debugger.message).toContain("no diff is stated rather than an empty one");
    }

    // A bad argument is refused, never silently defaulted to "this checkpoint".
    const refused = await application.inspectFocus("diff", { focusRef: FOCUS, checkpointRef: "  " });
    expect(refused.debugger.status).toBe("refused");
    expect(refused.debugger.code).toBe("invalid_argument");

    // The answer never settles and grants nothing, whatever it read.
    for (const answer of [same, refused]) {
      expect(answer.debugger.settles).toBe(false);
      expect(answer.debugger.authority).toBe(false);
    }
  });

  test("PE-06: timeline is row provenance ordered by observation time then object ref", async () => {
    const answered = await application.inspectFocus("timeline", { focusRef: FOCUS });
    expect(answered.debugger.status).toBe("ok");
    const valueOf = (key: string) => answered.debugger.values.find((entry) => entry.key === key);
    expect(valueOf("order")?.value).toBe("observed_at, then object_ref");
    expect(valueOf("mode")?.value).toBe("current");
    const rows = answered.debugger.values.filter((entry) => /^row\[\d+\]/.test(entry.key)).map((entry) => entry.value);
    expect(rows.length).toBeGreaterThan(1);
    // The fixture records every row at one instant, so the tie-break alone must order them.
    const refs = rows.map((row) => row.split(" ")[1]!);
    expect(refs).toEqual([...refs].sort());
    // The cap folds the remainder rather than silently dropping it.
    const sources = await inspectionSources();
    seenCheckpoint = sources.frame.checkpoint_ref ?? seenCheckpoint;
    const folded = runDebugger(sources, { operation: "timeline", max_rows: 1 });
    expect(folded.values.find((entry) => entry.key === "folded")?.value).toContain("max_rows=1");
    // An unreadable checkpoint is unavailable, never an empty timeline.
    const unreadable = await application.inspectFocus("timeline", { focusRef: FOCUS, checkpointRef: "cognate:projection@999999" });
    expect(unreadable.debugger.status).toBe("unavailable");
    expect(unreadable.debugger.code).toBe("checkpoint_unreadable");
  });

  test("PE-07: counterfactual is a possibility preview that settles nothing", async () => {
    const sources = await inspectionSources();
    const answer = runDebugger(sources, { operation: "counterfactual", proposal_ref: "proposal:raise-tier", change: "tier 1 -> 2" });
    const valueOf = (key: string) => answer.values.find((entry) => entry.key === key);
    expect(answer.status).toBe("ok");
    expect(valueOf("authority")?.value).toBe("possibility");
    expect(valueOf("settles")?.value).toBe("false");
    expect(valueOf("scope")?.value).toContain(application.world.worldRef);
    expect(answer.authority.grants_authority).toBe(false);
    expect(answer.settles).toBe(false);
    // The consequence sentence is `derived` from recorded edges; the outcome is named `unknown`.
    expect(valueOf("derived_consequences")?.class).toBe("derived");
    expect(valueOf("derived_consequences")?.value).toMatch(/^\d+ recorded edge\(s\) would be re-read: /);
    expect(valueOf("outcome")?.class).toBe("unknown");
    expect(valueOf("outcome")?.missing_source).toBeTruthy();
    // The preview never claims a new row: the target is the row that already exists.
    expect(valueOf("target")?.value).toContain(FOCUS);
    expect(valueOf("change")?.value).toBe("tier 1 -> 2");
    // An incomplete proposal is refused rather than previewed with a blank change.
    const refused = runDebugger(sources, { operation: "counterfactual", proposal_ref: "proposal:raise-tier" });
    expect(refused.status).toBe("refused");
    expect(refused.code).toBe("invalid_argument");
    // A target the projection does not hold yields `unknown`, never a fabricated consequence.
    const absent = runDebugger(
      { ...sources, frame: { ...sources.frame, focus_ref: "obj:not-recorded" } },
      { operation: "counterfactual", proposal_ref: "proposal:x", change: "anything" },
    );
    expect(absent.values.find((entry) => entry.key === "target")?.class).toBe("unknown");
  });

  test("PE-08: reach reports the ladder with only observed rungs and runs nothing", async () => {
    const sources = await inspectionSources();
    const before = (await allEvents()).length;
    const answer = runDebugger(sources, { operation: "reach", need: "a cost model for the strategy" });
    const valueOf = (key: string) => answer.values.find((entry) => entry.key === key);
    expect(answer.status).toBe("ok");
    expect(valueOf("need")?.value).toBe("a cost model for the strategy");
    expect(valueOf("installed")?.class).toBe("recorded");
    expect(valueOf("configured")?.class).toBe("derived");
    for (const rung of ["probed", "reachable", "authorized"]) {
      expect(valueOf(rung)?.class).toBe("unknown");
      expect(valueOf(rung)?.missing_source).toBeTruthy();
    }
    expect(answer.unknown_remainder.join(" ")).toContain("nothing was contacted");
    // No probe, no process, no event: the rung is unknown because nothing ran.
    expect((await allEvents()).length).toBe(before);
    const missingNeed = runDebugger(sources, { operation: "reach" });
    expect(missingNeed.status).toBe("refused");
    expect(missingNeed.code).toBe("invalid_argument");
  });

  test("PE-09: replay reports pass, fail or not-selected and writes no event", async () => {
    const before = (await allEvents()).length;
    const sources = await inspectionSources();
    const passed = runDebugger(sources, {
      operation: "replay",
      selects: { object_refs: [FOCUS] },
      expect: { field: "label", equals: "Strategy alpha" },
    });
    expect(passed.values.find((entry) => entry.key === "outcome")?.value).toBe("pass");
    const failed = runDebugger(sources, {
      operation: "replay",
      selects: { object_refs: [FOCUS] },
      expect: { field: "label", equals: "Strategy omega" },
    });
    expect(failed.values.find((entry) => entry.key === "outcome")?.value).toBe("fail");
    // An empty selection is `not-selected`, never a vacuous pass.
    const empty = runDebugger(sources, {
      operation: "replay",
      selects: { semantic_ref: "horizon.products.strategist::NotARecordedType" },
      expect: { field: "label", equals: "anything" },
    });
    expect(empty.values.find((entry) => entry.key === "outcome")?.value).toBe("not-selected");
    for (const answer of [passed, failed, empty]) {
      expect(answer.settles).toBe(false);
      expect(answer.authority.grants_authority).toBe(false);
    }
    // A field the row does not record is `unknown` per row, and the outcome is not a pass.
    const unrecorded = runDebugger(sources, {
      operation: "replay",
      selects: { object_refs: [FOCUS] },
      expect: { field: "not_a_recorded_field", equals: "x" },
    });
    expect(unrecorded.values.find((entry) => entry.key === `row:${FOCUS}`)?.class).toBe("unknown");
    expect(unrecorded.values.find((entry) => entry.key === "outcome")?.value).toBe("fail");
    // A malformed expectation is refused, not defaulted to a pass.
    const refused = runDebugger(sources, { operation: "replay", selects: {}, expect: {} });
    expect(refused.status).toBe("refused");
    expect(refused.code).toBe("invalid_argument");
    // The surface answered everything above and appended nothing to the durable log.
    expect((await allEvents()).length).toBe(before);
  });

  test("PE-10: retrieval is cited reference material that is never canonical", async () => {
    // One inspect is one retrieval request, straight through the boot-registered capability.
    const before = kernelLines.length;
    const answered = await kernelApplication.inspectFocus("why", { focusRef: FOCUS, query: "why is strategy alpha blocked" });
    const retrieval = answered.retrieval;
    expect(retrieval).not.toBeNull();
    if (retrieval === null) throw new Error("unreachable: retrieval was null");
    expect(retrieval.outcome).toBe("results");
    expect(retrieval.canonical).toBe(false);
    expect(retrieval.query).toBe("why is strategy alpha blocked");
    expect(retrieval.corpus_id).toBe("horizon");
    expect(retrieval.references.length).toBe(1);
    const [reference] = retrieval.references;
    expect(reference!.class).toBe("untrusted_reference");
    expect(reference!.uri).toBe("context:horizon/t10kb.md");
    expect(reference!.anchor).toBe("retrieval-is-reference-material");
    expect(reference!.excerpt).toBe("Reference excerpt for: why is strategy alpha blocked");
    // Liveness is a second, observed request over the same transport — not an assumption.
    expect(retrieval.liveness.observed).toBe(true);
    expect(retrieval.liveness.ok).toBe(true);
    const sent = kernelLines.slice(before).map((line) => JSON.parse(line) as { params: { name: string; arguments: { canonical_id?: string; query?: string } } });
    expect(sent.map((request) => request.params.name)).toEqual(["query_reference", "get_status"]);
    expect(sent[0]!.params.arguments.canonical_id).toBe("horizon");
    expect(sent[0]!.params.arguments.query).toBe("why is strategy alpha blocked");
  });


  test("PE-11: a read that grants no authority adds no reference row and no event", async () => {
    const before = (await allEvents()).length;
    const read = await kernelApplication.inspectFocus("timeline", { focusRef: FOCUS });
    // Without a reference query the surface asks nothing and claims nothing.
    expect(read.retrieval).toBeNull();
    const answered = await kernelApplication.inspectFocus("timeline", { focusRef: FOCUS, query: "checkpoint provenance" });
    const retrieval = answered.retrieval!;
    expect(retrieval.references.every((reference) => reference.class === "untrusted_reference")).toBe(true);
    expect(retrieval.canonical).toBe(false);
    expect(answered.debugger.settles).toBe(false);
    expect(answered.debugger.authority).toBe(false);
    // The read wrote nothing to the durable log and changed no frame field.
    expect((await allEvents()).length).toBe(before);
    expect(answered.frame.focus_ref).toBe(FOCUS);
  });

  test("PE-12: an absent Context Kernel is reported absent and never as a server that is down", async () => {
    const answered = await application.inspectFocus("why", { focusRef: FOCUS, query: "anything at all" });
    expect(answered.retrieval).not.toBeNull();
    const retrieval = answered.retrieval!;
    expect(retrieval.outcome).toBe("absent");
    expect(retrieval.detail).toContain("no Context Kernel binding is configured");
    expect(retrieval.liveness.observed).toBe(false);
    expect(retrieval.references).toEqual([]);
    expect(retrieval.canonical).toBe(false);
    // The local answer stands on its own: only the citation row degraded.
    expect(answered.debugger.status).toBe("ok");
    expect(answered.debugger.values.length).toBeGreaterThan(0);
    // A reference answer's own view keeps the literal, whatever the outcome.
    const direct = (await application.runtime.runtime.service.invoke(application.caller, {
      capability: CONTEXT_REFERENCE.id,
      input: { operation: "query_reference", query: "anything at all" } as never,
    })) as unknown as ContextReferenceAnswer;
    expect(direct.authority).toEqual({ canonical: false, grants_authority: false });
    const view = retrievalView(direct);
    expect(view.canonical).toBe(false);
    expect(view.outcome).toBe("absent");
  });

  test("PE-13: the seven operations and the retrieval row appear in the closed workspace surface", async () => {
    const inspected = await kernelApplication.inspectFocus("why", { focusRef: FOCUS, query: "why is alpha blocked" });
    const workspace = await kernelApplication.workspace({ focusRef: FOCUS, inspection: inspected });
    expect(workspace.snapshot.debugger?.operation).toBe("why");
    expect(workspace.snapshot.regions.map((region) => region.id)).toEqual([...WORKSPACE_REGION_ORDER]);
    // The retrieval material rides inside the fixed `inspector` region: the region set is owner
    // pinned, so a retrieved document can never add a region of its own.
    const inspector = workspace.snapshot.regions.find((region) => region.id === "inspector");
    expect(inspector).toBeDefined();
    expect(workspace.snapshot.retrieval?.outcome).toBe("results");
    const serialized = JSON.stringify({ inspector, retrieval: workspace.snapshot.retrieval });
    // Retrieved text arrives as a reference value, never as markup or a behavior.
    expect(serialized).toContain("untrusted_reference");
    expect(serialized).not.toContain("<script");
    const all = JSON.stringify(workspace);
    for (const needle of ["onclick", "innerhtml", "addeventlistener", "javascript:"]) {
      expect(all.toLowerCase()).not.toContain(needle);
    }
  });

  test("PE-14: no invocation the surface makes can settle, execute or write", async () => {
    const before = (await allEvents()).length;
    const results = await Promise.all(
      DEBUGGER_OPERATIONS.map((operation) =>
        kernelApplication.inspectFocus(operation, { focusRef: FOCUS, checkpointRef: CHECKPOINT, query: "reference" }),
      ),
    );
    for (const result of results) {
      expect(result.debugger.settles).toBe(false);
      expect(result.debugger.authority).toBe(false);
      expect(result.retrieval?.canonical).toBe(false);
      // `effect` would mean a committed intent record exists; nothing here commits one.
      expect(result.debugger.values.some((entry) => entry.class === "effect")).toBe(false);
    }
    // Reading a world through the debugger appends nothing: only T07's commit can write one.
    expect((await allEvents()).length).toBe(before);
    const intents = await readIntentRecords(kernelApplication.runtime.runtime.store);
    expect(intents.some((entry) => entry.record.operation_ref.includes("inspect"))).toBe(false);
  });
});
