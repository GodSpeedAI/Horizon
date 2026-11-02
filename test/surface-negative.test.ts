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
  worldRef: "world:horizon@sha256:0a10c20d22ee11a184165005a553390e7a45ce0b858773e2220e442eb0cf9d2b",
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
  test("NE-01 rejects <script>alert(1)</script> and other executable markup at the SCHEMA, with a typed rejection (falsifier PE-05)", () => {
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

  test("NE-02/PE-01 rejects an <iframe> block type and the jsx / onclick fields (.strict()); NE-02/PE-02 then refuses an agent-supplied value dressed as a bound fact, and every typed source (horizon: / semantic: / file: / agent:) resolves to a value or a non-bound status (falsifier PE-01/PE-02)", () => {
    const surface = composed();

    // The prereg's NE-02 attack, verbatim: an unknown block type and executable-looking
    // fields. Each is refused by the union/discriminator or by `.strict()`.
    const iframe = parseSurface(withBlock(surface, { id: "rogue", type: "iframe", src: "https://example.test", provenance }));
    expect(iframe.ok).toBe(false);
    if (!iframe.ok) {
      // FROZEN: "Rejection names the unknown block type". Zod does not echo the submitted
      // value back, so "names" is met structurally, not literally: the JSON pointer addresses
      // the field that carries the unknown type, and the message enumerates the legal set, so
      // a caller can see *which* field was wrong and *what* was allowed.
      //
      // This test previously asserted `not.toContain("iframe")`, which recorded the absence of
      // the value as if it were the property, and would have passed on a rejection that named
      // nothing at all. The assertions below are the requirement; the absence of the echo is
      // incidental and is not asserted.
      const issue = iframe.issues.find((candidate) => candidate.path.endsWith("/type"));
      expect(issue?.path).toBe("/blocks/0/type");
      expect(issue?.message).toMatch(/Invalid discriminator value/);
      // Every legal block type is named, so the message is a closed-set description, not a
      // generic "invalid input". Asserting the whole set means a dropped member fails here.
      for (const blockType of BLOCK_TYPES) expect(issue?.message).toContain(`'${blockType}'`);
    }
    for (const field of ["jsx", "onclick"]) {
      const executable = parseSurface(
        withBlock(surface, { id: "orientation", type: "callout", tone: "info", text: "hi", [field]: "<b/>", provenance }),
      );
      expect(executable.ok).toBe(false);
      if (!executable.ok) {
        // `.strict()` names the smuggled key rather than dropping it silently.
        expect(executable.issues.map((issue) => issue.message).join(" ")).toContain(field);
      }
    }

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


  test("NE-05/PE-03 keeps the reducer pure — (state, op) -> {state, result} with no I/O — so no agent layout op (view.move / view.pin / surface.put / human.approve) moves, pins, resizes, closes or focuses an owner block (falsifier PE-03)", () => {
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

    // NE-07 — "record an agent op as `human`". An agent cannot launder its attribution into a
    // human one: reducing the same document for the agent never presents a block as the
    // agent's own principal, and every recorded role comes from the closed set.
    const parsed = parseSurface(claimed);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const asAgent = reduceSurface(parsed.surface, "agent");
    for (const block of asAgent.blocks) {
      expect(["human", "agent", "system"]).toContain(block.provenance.attributed_to.role);
      expect(block.provenance.attributed_to.principal_ref).not.toBe("agent:rearranger");
    }

    // PE-03 — the reducer is a pure function of (state, op): the same parsed surface reduces
    // to the same bytes every time, with no clock, no I/O and no shared mutation, and the
    // result is stably serializable so two runs can be compared rather than eyeballed.
    const first = reduceSurface(parsed.surface, "agent");
    const second = reduceSurface(parsed.surface, "agent");
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    // The input is not mutated by reduction: reducing twice from the same document yields
    // the same document, so a reducer cannot accumulate state into its argument.
    const before = JSON.stringify(parseSurface(claimed));
    reduceSurface(parsed.surface, "agent");
    expect(JSON.stringify(parseSurface(claimed))).toBe(before);

    // ...and when a document legitimately carries an agent block, reducing it for the agent
    // never promotes the agent's placement, while the human view keeps the owner's order.
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

  test("NE-04/PE-06 refuses a human-authority op for the agent role (falsifier PE-03/PE-06)", () => {
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

    // The prereg's NE-05 attack, verbatim: an agent sends view.move / view.pin / surface.put
    // into an owner-pinned slot, or human.approve. None is in the closed operation union, so
    // none can be offered to *any* role; and the layout claim an agent makes is capped.
    const view = projectFrame(frameFor(), bindingContextOf(context));
    expect(view.ok).toBe(true);
    if (view.ok) {
      for (const operation of ["view.move", "view.pin", "surface.put", "human.approve"]) {
        // The op does not exist in the vocabulary: a proposal naming it is never an intent.
        // `human.approve` is refused as a role mismatch first, since the role gate precedes
        // the view gate — either way the result is a typed refusal, never a canonical intent.
        const attempt = canonicalIntent({ transport: "cli", view: view.view, operation: operation as never, role: "agent" });
        expect(attempt.ok).toBe(false);
        if (!attempt.ok) expect(["operation_not_in_view", "role_mismatch"]).toContain(attempt.code);
      }
      // The owner's pinned foreground is not addressable by an agent through any *offered* op.
      const agentView = projectForRole(composeSurface(frameFor()), "agent", frameFor(), bindingContextOf(context));
      expect(agentView.ok).toBe(true);
      if (agentView.ok) {
        const agentOps = agentView.view.actions.map((action) => action.operation);
        for (const ownerOnly of ["horizon.decide.approve", "horizon.decide.reject", "horizon.authorize.confirm"]) {
          expect(agentOps).not.toContain(ownerOnly);
        }
      }
    }

    // vocabulary calls it, an agent submission must never canonicalise to a human decision.
    const approveView = projectFrame(frameFor(), bindingContextOf(context));
    expect(approveView.ok).toBe(true);
    if (approveView.ok) {
      expect(canonicalIntent({ transport: "mcp", view: approveView.view, operation: "horizon.decide.approve", role: "agent" })).toEqual({
        ok: false,
        code: "role_mismatch",
      });
    }
  });

  test("NE-03 refuses an unauthorized action in a block — an unoffered or non-union operation, and an agent-offered human decision (falsifier PE-03/PE-06)", () => {
    const surface = composed();

    // (a) An operation outside the closed union, and (b) an owner-ruling op id that the
    // frame does not offer: neither is a `HORIZON_OPERATIONS` member, so the grammar's
    // `z.enum` refuses the action rather than admitting an unaddressable choice.
    for (const operation of ["horizon.surface.put", "owner.ruling.0001", "horizon.teleport"]) {
      const smuggled = { ...(surface as unknown as Record<string, unknown>), actions: [{ id: "acted", type: "action", label: "Act", operation, by: { actor_ref: "os:operator:1000", role: "human", principal_ref: "os:operator:1000" } }] };
      const parsed = parseSurface(smuggled);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        // The rejection names the action, so which field failed is inspectable.
        expect(parsed.issues.some((issue) => issue.path.startsWith("/actions"))).toBe(true);
      }
    }

    // (c) An agent presenting a consequential operation as its own action is refused at the
    // grammar, before any reducer sees it — an agent cannot offer a human decision.
    const agentOffered = {
      ...(surface as unknown as Record<string, unknown>),
      actions: [
        {
          id: "decide-approve",
          type: "action",
          label: "Approve",
          operation: "horizon.decide.approve",
          by: { actor_ref: "agent:synthesizer", role: "agent", principal_ref: "os:operator:1000", agent_ref: "agent:synthesizer", on_behalf_of_ref: "os:operator:1000" },
        },
      ],
    };
    const refused = parseSurface(agentOffered);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.issues.map((issue) => issue.message)).toContain(
        "an agent MUST NOT present a consequential operation as its own action; it may only propose it",
      );
    }
  });

  test("PE-04/NE-10 serves no unescaped markup under the horizon.gui-view/1 projection (falsifier PE-04)", () => {
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

  test("PE-01 NE-06 lets no second surface schema validate a route (falsifier PE-01)", () => {
    const surface = composed();
    for (const wrong of ["horizon.surface/1", "horizon.surface/3", "horizon.surface", ""]) {
      expect(parseSurface({ ...surface, schema: wrong }).ok).toBe(false);
    }
    // An unknown block type has no union member: the vocabulary is closed at fifteen.
    // (The `iframe` form of this attack is asserted by NE-02; this test keeps to the schema
    // identity so the two cannot drift into claiming the same thing.)

    // Discovery publishes the same closed set the parser enforces, not a wider one.
    const declared = publishSurfaceSchema();
    expect(declared.schema).toBe(SURFACE_SCHEMA);
    expect(declared.block_types).toEqual([...BLOCK_TYPES]);
    expect(BLOCK_TYPES.length).toBe(15);
    // A `.strict()` document: an undeclared top-level key is refused, not ignored.
    expect(parseSurface({ ...surface, extra: "smuggled" }).ok).toBe(false);
  });

  test("NE-04/NE-07 PE-02 refuses javascript: and file: traversal, an unknown horizon: source, and records no agent op as human (falsifier PE-02)", () => {
    // The prereg's NE-04 attack, verbatim: each unsafe expression is refused with a bounded
    // message, never resolved into a value. Note the second clause of NE-04: an unknown
    // `horizon:` source is *not* an invalid one. Over the default route that namespace is
    // declared pending (`horizon: "TA-T06/T07"`), so the binder reports it `blocked` and
    // carries no value. `blocked` is still a refusal to supply a fact — the property NE-04
    // asserts — but it is a different, truthful status: `unknown`, never `available`.
    for (const unsafe of ["javascript:alert(1)", "file:../../etc/passwd", `horizon:${"x".repeat(2000)}`]) {
      const binding = bindSource(unsafe, bindingContextOf(context));
      expect(binding.status).toBe("refused");
      expect(binding.value).toBeNull();
      expect(JSON.stringify(binding).length).toBeLessThan(4096);
    }
    const unknownHorizon = bindSource("horizon:no-such-source", bindingContextOf(context));
    expect(["blocked", "refused"]).toContain(unknownHorizon.status);
    expect(unknownHorizon.value).toBeNull();
    // The typed source vocabulary is closed at four namespaces: each resolves to a value plus
    // an observation, or to a non-bound status — never to an unstamped string.
    for (const [expression, namespace] of [
      ["horizon:health", "horizon"],
      ["semantic:Case", "semantic"],
      ["file:specs/exists.md", "file"],
      ["agent:note", "agent"],
    ] as const) {
      const binding = bindSource(expression, bindingContextOf({ root: process.cwd(), allowFileReads: true, agentValues: { note: "supplied" } }));
      expect(binding.namespace).toBe(namespace);
      if (binding.status === "bound") {
        expect(binding.value).not.toBeUndefined();
        expect(binding.observation).toBeDefined();
      } else {
        expect(binding.value).toBeNull();
      }
    }
    // Once the route stops declaring that namespace pending, an unknown key is refused as
    // `not_found` rather than staying `blocked` — the status follows the observation. The
    // pending declaration is checked *before* the resolver, so a resolver alone does not
    // unblock it; both must change. `bindingContextOf` seeds `awaiting.horizon`, and an
    // explicit `awaiting` entry overrides it (`undefined` clears it).
    const resolved = bindSource(
      "horizon:no-such-source",
      bindingContextOf({ root: process.cwd(), resolveHorizon: () => undefined, awaiting: { horizon: undefined } }),
    );
    expect(resolved.status).toBe("refused");
    expect(resolved.value).toBeNull();

    // Traversal is refused even though `file:` reads are permitted for this route...
    expect(bindSource("file:specs/../.env", bindingContextOf(context)).status).toBe("refused");
    // ...and an unrelated `file:` path outside the frozen roots is not addressable at all.
    expect(bindSource("file:src/config/load.ts", bindingContextOf(context)).status).toBe("refused");
    // The remote route's bindings are refused with `agent_supplied` false: a refusal is never
    // dressed as an agent's contribution.
    const remote = bindingContextOf({ root: process.cwd(), allowFileReads: false });
    expect(bindSource("file:specs/../.env", remote).agent_supplied).toBe(false);

    // Traversal is refused for the local route too, whatever the read permission.
    const local = bindSource("file:specs/../.env", bindingContextOf(context));
    expect(local.status).toBe("refused");
    expect(local.value).toBeNull();
    // And a root outside the frozen set is not addressable at all.
    expect(bindSource("file:src/config/load.ts", bindingContextOf(context)).status).toBe("refused");
  });

  test("NE-08 PE-02 reports an unanswered authority as blocked, never as a value (falsifier PE-02)", () => {
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

  test("NE-09 PE-04 does not treat a divergent GUI/CLI/MCP intent as equivalent (falsifier PE-04)", () => {
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

  test("NE-10 escapes an <img onerror=...> value that arrives from an observed source (falsifier PE-05)", () => {
    // A value an observed source returns is attacker-controlled. It must be escaped at render,
    // so the payload is present as text and inert as markup.
    const injected = "<img onerror=alert(1) src=x>";
    const surface = composed();
    const parsed = parseSurface(
      withBlock(surface, { id: "orientation", type: "callout", tone: "info", text: `observed: ${injected}`, provenance }),
    );
    // Either the grammar refuses the markup outright, or the renderer escapes it. Both are
    // safe; silently emitting it is not, and that is what this asserts.
    if (parsed.ok) {
      const view = projectSurface(reduceSurface(parsed.surface, "human"), (expression) => bindSource(expression, bindingContextOf(context)));
      const html = renderHtml(view);
      expect(html.toLowerCase()).not.toContain("<img");
      expect(html.toLowerCase()).not.toMatch(/onerror\s*=/);
      expect(html).toContain("&lt;");
    } else {
      expect(parsed.code).toBe("INVALID_SURFACE");
    }
    // The escape helper itself: the payload survives as text, never as an element.
    const escaped = escapeHtml(injected);
    expect(escaped).not.toContain("<");
    expect(escaped).toContain("&lt;img");
    // The CLI renderer is text, not markup: the same value cannot become an element there.
    const textSurface = composed();
    const textParsed = parseSurface(withBlock(textSurface, { id: "orientation", type: "callout", tone: "info", text: injected, provenance }));
    if (textParsed.ok) {
      const rendered = renderText(projectSurface(reduceSurface(textParsed.surface, "human"), (expression) => bindSource(expression, bindingContextOf(context))));
      expect(rendered).not.toContain("<img");
    }
  });

  test("PE-05/NE-10 carries an ActorAttribution with on_behalf_of_ref on every node and attributes no surface to an unattributable observer (falsifier PE-05)", () => {
    // NE-10's escaping is asserted by its own test above; here the subject is attribution.
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

    // PE-05 — an agent acting for the human is visibly distinct, not merely labelled: the
    // attribution carries `on_behalf_of_ref` naming the human, plus the agent ref.
    const agentFacing = projectForRole(composeSurface(frameFor()), "agent", frameFor(), bindingContextOf(context));
    expect(agentFacing.ok).toBe(true);
    if (agentFacing.ok) {
      for (const node of agentFacing.view.nodes) {
        const attribution = node.attributed_to;
        expect(attribution.role).toBe("agent");
        if (attribution.role === "agent") {
          expect(attribution.agent_ref).toBeDefined();
          expect(attribution.on_behalf_of_ref).toBeDefined();
        }
      }
    }
  });
});
