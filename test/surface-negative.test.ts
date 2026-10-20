/**
 * T05 negative evidence (NE-01 … NE-10), one test per `.agents/prereg/horizon/T05.prereg.yaml`
 * `evidence.negative` entry.
 *
 * Each test asserts that the *falsifier* named for its PE does not hold: the grammar, the
 * binder, the reducer or the equivalence seam refuses the adversarial input rather than
 * accepting it, and refuses it with a typed answer (`INVALID_SURFACE` + JSON-pointer issues,
 * a stable `reason`, or a typed equivalence code) rather than throwing.
 *
 * The surface under test is always the one `composeSurface` produced for a real frame, then
 * mutated. Hand-building a surface from scratch would test a shape the seam never emits.
 */
import { describe, expect, test } from "bun:test";
import { buildStructuralFrame } from "../src/domain/frame.ts";
import type { LoadedWorld } from "../src/adapters/semantic.ts";
import { affordanceOfFrame, bindingContextOf, composeSurface, projectFrame, projectForRole, type SurfaceRouteContext } from "../src/ui/surface.ts";
import { bindSource } from "../src/ui/surface2/binder.ts";
import { canonicalIntent, intentsEquivalent } from "../src/ui/surface2/equivalent.ts";
import { BLOCK_TYPES, parseSurface, publishSurfaceSchema, SURFACE_SCHEMA, type SurfaceV2 } from "../src/ui/surface2/grammar.ts";
import { reduceSurface } from "../src/ui/surface2/reducer.ts";
import { projectSurface } from "../src/ui/surface2/project.ts";
import { escapeHtml, renderHtml, renderText } from "../src/ui/surface2/render.ts";

const world = {
  worldRef: "world:horizon@sha256:6c18d6a608bd9d83e6aa354d5a8cc804009ca208562021c1736ee429412309f0",
  cognateWorldRef: "world:horizon@sha256:aa459cf9c096b8102824d5d0a0d7a3b29bbf3f2537013800c88d7e7690300a9b",
  projection: { objects: [], relations: [] },
  objectCount: 0,
  relationCount: 0,
  unmapped: [],
} as unknown as LoadedWorld;

const context: SurfaceRouteContext = { root: process.cwd(), allowFileReads: true };

function frameFor(observerRef = "os:operator:1000") {
  return buildStructuralFrame({ frameId: `frame-${observerRef}`, observerRef, world, checkpointRef: "cognate:42" });
}

/** The composed document for a real frame, as the seam itself emits it. */
function composed(): SurfaceV2 {
  const parsed = parseSurface(composeSurface(frameFor()));
  if (!parsed.ok) throw new Error(`composeSurface emitted a document its own grammar rejects: ${JSON.stringify(parsed.issues)}`);
  return parsed.surface;
}

/** Replace one block, keeping the document otherwise as the seam composed it. */
function withBlock(surface: SurfaceV2, block: unknown): unknown {
  return { ...surface, blocks: [block, ...surface.blocks.slice(1)] };
}

const provenance = {
  source_kind: "owner_authored",
  source_ref: "horizon:frame/orient",
  attributed_to: { actor_ref: "os:operator:1000", role: "human", principal_ref: "os:operator:1000" },
  layout: "owner_pinned",
} as const;


describe("T05 negative evidence (NE-01…NE-10)", () => {
  test("NE-01 rejects executable markup in a human-authored block (falsifier PE-01/PE-05)", () => {
    const surface = composed();
    // Markup is refused at the grammar, so it can never reach a renderer.
    for (const payload of ["<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "a > b", "<"]) {
      const submitted = withBlock(surface, { id: "orientation", type: "callout", tone: "info", text: payload, provenance });
      const parsed = parseSurface(submitted);
      expect(parsed.ok).toBe(false);
      if (parsed.ok) continue;
      // Typed rejection with a JSON pointer, never a thrown exception.
      expect(parsed.code).toBe("INVALID_SURFACE");
      expect(parsed.issues.length).toBeGreaterThan(0);
      expect(parsed.issues[0]?.path.startsWith("/blocks/0/")).toBe(true);
    }

    // A URL-shaped string is not markup and is accepted as inert display text: the surface
    // has no field that renders it as a URL, and the renderer never emits it as a link.
    const inert = parseSurface(withBlock(surface, { id: "orientation", type: "callout", tone: "info", text: "javascript:alert(1)", provenance }));
    expect(inert.ok).toBe(true);
    if (inert.ok) {
      const view = projectSurface(reduceSurface(inert.surface, "human"), (expression) => bindSource(expression, bindingContextOf(context)));
      expect(renderHtml(view).toLowerCase()).not.toContain("javascript:");
      const anchors = [...renderHtml(view).matchAll(/<a ([^>]*)>/g)].map((match) => match[1]);
      expect(anchors.length).toBeGreaterThan(0);
      for (const attributes of anchors) {
        // A rendered anchor carries only a data-operation and a posture — no href, no event
        // handler, no target: nothing the text value could steer.
        expect(attributes).toMatch(/^data-operation="[a-z.]+"( data-posture="[a-z]+")?$/);
      }
    }
  });

  test("NE-02 rejects an agent-supplied value dressed as an authority-bound fact (falsifier PE-02)", () => {
    const surface = composed();
    const disguised = withBlock(surface, {
      id: "orientation",
      type: "callout",
      tone: "info",
      text: "the world agrees with me",
      provenance: {
        // It claims `bound`, but its source is the agent's own value.
        source_kind: "bound",
        source_ref: "agent:summary",
        attributed_to: { actor_ref: "agent:synthesizer", role: "agent", principal_ref: "os:operator:1000" },
        layout: "agent_composed",
      },
    });
    const parsed = parseSurface(disguised);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      // Not merely "some issue": *this* rule must reject it, or the guard is untested.
      expect(parsed.issues.map((issue) => issue.message)).toContain("bound values MUST NOT use an agent: source");
    }

    // An agent value attributed to a human is refused too, whichever way it is labelled.
    const attributedToHuman = withBlock(surface, {
      id: "orientation",
      type: "callout",
      tone: "info",
      text: "the owner said this",
      provenance: {
        source_kind: "agent_supplied",
        source_ref: "agent:summary",
        attributed_to: { actor_ref: "os:operator:1000", role: "human", principal_ref: "os:operator:1000" },
        layout: "agent_composed",
      },
    });
    expect(parseSurface(attributedToHuman).ok).toBe(false);
    const humanParsed = parseSurface(attributedToHuman);
    if (!humanParsed.ok) {
      expect(humanParsed.issues.map((issue) => issue.message)).toContain("agent_supplied values MUST be attributed to an agent");
    }
  });


  test("NE-03 lets no agent layout op move, pin, resize, close or focus an owner block (falsifier PE-03)", () => {
    const surface = composed();
    const claimed = withBlock(surface, {
      id: "orientation",
      type: "callout",
      tone: "info",
      text: "agent placed this",
      provenance: { ...provenance, layout: "agent_composed" },
    });
    const stolenPin = withBlock(surface, {
      id: "orientation",
      type: "callout",
      tone: "info",
      text: "agent claims the pin",
      provenance: { ...provenance, layout: "owner_pinned", attributed_to: { actor_ref: "agent:rearranger", role: "agent", principal_ref: "os:operator:1000" } },
    });

    // An agent may not *claim* human layout authority in the document...
    const claimParsed = parseSurface(stolenPin);
    expect(claimParsed.ok).toBe(false);
    if (!claimParsed.ok) {
      expect(claimParsed.issues.map((issue) => issue.message)).toContain("layout authority requires a human attribution");
    }

    // ...and when a document legitimately carries an agent block, reducing it for the agent
    // never promotes the agent's placement, while the human view keeps the owner's order.
    const parsed = parseSurface(claimed);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const human = reduceSurface(parsed.surface, "human");
    const agent = reduceSurface(parsed.surface, "agent");
    // The human view presents the owner's order and the document's asserted layout unchanged:
    // the reducer does not "correct" a human document, it only refuses to hand an agent more.
    expect(human.blocks[0]?.id).toBe("orientation");
    expect(human.blocks[0]?.provenance.layout).toBe("agent_composed");
    // The agent view may not hold an owner placement: every block is capped at the agent's
    // own authority, and the owner's blocks keep their order.
    expect(agent.blocks.map((block) => block.id)).toEqual(human.blocks.map((block) => block.id));
    for (const block of agent.blocks) {
      expect(["agent_composed", "agent_proposed"]).toContain(block.provenance.layout);
    }
    // The agent's own claim is recorded, not silently rewritten: the reduction says which
    // placement it downgraded and why, so the substitution is inspectable.
    expect(agent.notes.some((note) => note.kind === "layout_authority_claimed" && note.target === "orientation")).toBe(true);
  });

  test("NE-04 refuses a human-authority op for the agent role (falsifier PE-03/PE-06)", () => {
    const surface = composed();
    const withConsequential = {
      ...surface,
      actions: [
        ...surface.actions,
        { id: "decide-approve", type: "action", label: "Approve", operation: "horizon.decide.approve" },
        { id: "authorize-confirm", type: "action", label: "Confirm", operation: "horizon.authorize.confirm" },
      ],
    };
    const parsed = parseSurface(withConsequential);
    expect(parsed.ok).toBe(false);

    // Even a parse-bypassing hand-built document cannot yield an offered human decision to
    // an agent: the reducer degrades it to `proposed` and says why.
    const handBuilt = {
      ...(surface as unknown as Record<string, unknown>),
      actions: [{ id: "decide-approve", type: "action", label: "Approve", operation: "horizon.decide.approve" }],
    } as unknown as SurfaceV2;
    const agentReduction = reduceSurface(handBuilt, "agent");
    expect(agentReduction.actions.some((action) => action.operation === "horizon.decide.approve")).toBe(false);
    expect(agentReduction.notes.some((note) => note.kind === "action_proposed_not_offered")).toBe(true);
    // The human reduction of the same document does offer it.
    expect(reduceSurface(handBuilt, "human").actions.some((action) => action.operation === "horizon.decide.approve")).toBe(true);
  });

  test("NE-05 serves no unescaped markup from the GUI projection (falsifier PE-04)", () => {
    const view = projectForRole(composeSurface(frameFor()), "human", frameFor(), bindingContextOf(context));
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    const html = renderHtml(view.view);
    expect(html).not.toContain("<script");
    expect(html.toLowerCase()).not.toContain("javascript:");
    const escaped = escapeHtml("<script>alert(1)</script>");
    expect(escaped).not.toContain("<script");
    expect(escaped).toContain("&lt;");
    // The CLI renderer is text, not markup.
    expect(renderText(view.view)).not.toContain("<script");
  });

  test("NE-06 lets no second surface schema validate a route (falsifier PE-01)", () => {
    const surface = composed();
    for (const wrong of ["horizon.surface/1", "horizon.surface/3", "horizon.surface", ""]) {
      expect(parseSurface({ ...surface, schema: wrong }).ok).toBe(false);
    }
    // An unknown block type has no union member: the vocabulary is closed at fifteen.
    const sixteenth = withBlock(surface, { id: "rogue", type: "iframe", src: "https://example.test", provenance });
    expect(parseSurface(sixteenth).ok).toBe(false);

    // Discovery publishes the same closed set the parser enforces, not a wider one.
    const declared = publishSurfaceSchema();
    expect(declared.schema).toBe(SURFACE_SCHEMA);
    expect(declared.block_types).toEqual([...BLOCK_TYPES]);
    expect(BLOCK_TYPES.length).toBe(15);
    // A `.strict()` document: an undeclared top-level key is refused, not ignored.
    expect(parseSurface({ ...surface, extra: "smuggled" }).ok).toBe(false);
  });

  test("NE-07 refuses a remote route's file: source instead of reading it (falsifier PE-02)", () => {
    const remote = bindingContextOf({ root: process.cwd(), allowFileReads: false });
    const binding = bindSource("file:specs/../.env", remote);
    expect(binding.status).toBe("refused");
    expect(binding.agent_supplied).toBe(false);
    expect(binding.value).toBeNull();
    // Traversal is refused for the local route too, whatever the read permission.
    const local = bindSource("file:specs/../.env", bindingContextOf(context));
    expect(local.status).toBe("refused");
    expect(local.value).toBeNull();
    // And a root outside the frozen set is not addressable at all.
    expect(bindSource("file:src/config/load.ts", bindingContextOf(context)).status).toBe("refused");
  });

  test("NE-08 reports an unanswered authority as blocked, never as a value (falsifier PE-02)", () => {
    const binding = bindSource("horizon:preflight/case-1", bindingContextOf({ root: process.cwd() }));
    expect(binding.status === "blocked" || binding.observation === "unavailable").toBe(true);
    // A non-bound binding never carries a value a caller could mistake for a fact.
    if (binding.status !== "bound") {
      expect(binding.value).toBeNull();
      expect(binding.reason !== undefined || binding.awaiting !== undefined).toBe(true);
    }
    // `possibility != affordance`: an absent frame assessment is `unknown`, not `available`.
    expect(affordanceOfFrame(frameFor())("horizon.decide.approve")).toBe("unknown");
  });

  test("NE-09 does not treat a divergent GUI/CLI/MCP intent as equivalent (falsifier PE-04)", () => {
    const frame = frameFor();
    const projection = projectFrame(frame, bindingContextOf(context));
    expect(projection.ok).toBe(true);
    if (!projection.ok) return;
    const view = projection.view;
    const offered = view.actions.find((action) => action.posture === "offered");
    if (offered !== undefined) {
      const gui = canonicalIntent({ transport: "gui", view, node_id: offered.action_id, role: "human" });
      const cli = canonicalIntent({ transport: "cli", view, operation: offered.operation, role: "human" });
      const mcp = canonicalIntent({ transport: "mcp", view, operation: offered.operation, role: "human" });
      // Same choice, three transports: equivalent.
      expect(intentsEquivalent(gui, cli)).toBe(true);
      expect(intentsEquivalent(cli, mcp)).toBe(true);

      // A different choice is not equivalent.
      const other = view.actions.find((action) => action.posture === "offered" && action.operation !== offered.operation);
      if (other !== undefined) {
        expect(intentsEquivalent(gui, canonicalIntent({ transport: "cli", view, operation: other.operation, role: "human" }))).toBe(false);
      }
    }

    // An unprovable intent is a typed refusal, not a reinterpretation.
    expect(canonicalIntent({ transport: "gui", view, node_id: "no-such-node", role: "human" })).toEqual({ ok: false, code: "unknown_node" });
    expect(canonicalIntent({ transport: "cli", view, operation: "horizon.decide.approve", role: "agent" })).toEqual({ ok: false, code: "role_mismatch" });
    expect(canonicalIntent({ transport: "mcp", view, operation: "horizon.no-such-op", role: "human" })).toEqual({
      ok: false,
      code: "operation_not_in_view",
    });
    // A transport that cannot express the intent is a gap, never equivalence.
    expect(intentsEquivalent({ ok: false, code: "unknown_node" }, { ok: false, code: "unknown_node" })).toBe(false);
  });

  test("NE-10 attributes no surface to an unattributable observer (falsifier PE-05)", () => {
    for (const observerRef of ["anon:visitor", "operator", "os::1000", "os:operator:1000 extra"]) {
      // Either the seam refuses to compose at all, or the composed document fails the grammar.
      expect(projectFrame(frameFor(observerRef), bindingContextOf(context)).ok).toBe(false);
    }

    const projection = projectFrame(frameFor(), bindingContextOf(context));
    expect(projection.ok).toBe(true);
    if (!projection.ok) return;
    // Every block of an attributable surface names its actor.
    for (const node of projection.view.nodes) {
      expect(node.attributed_to.actor_ref).toBe("os:operator:1000");
      expect(node.attributed_to.role).toBe("human");
    }
    // A projection is reduced for exactly the role it serves, never for another.
    const asAgent = projectForRole(composeSurface(frameFor()), "agent", frameFor(), bindingContextOf(context));
    expect(asAgent.ok).toBe(true);
    if (asAgent.ok) expect(asAgent.view.role).toBe("agent");
  });
});
