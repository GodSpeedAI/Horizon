# Horizon Current Status

**Revision:** 23 · **Recorded:** 2026-10-21T00:55:00Z · **Stage:** T09 settled (P2 builder+teeth); next ready task **T10**

**Spec:** HORIZON-001 v1.0.1, frozen; SHA-256 `14a42936fe3a17c3726ee57fbc9278fd6f6e92276f67519fd9bf0f605f3324a4`.

## T09 — Atomic GUI projection in Cognate React

The rich workspace now projects the same T07 frame and T05 closed surface as the terminal. It is
server-rendered semantic HTML with native form submissions: no client bundle, no inline handler,
and no client-side enablement rule. The page is also rendered through the real Cognate React
`useProjection` path against a durable store.

- **Owner layout.** Region order is fixed: context, decision, evidence, inspector, lineage, agent.
  Agent-composed blocks are appended after owner regions and cannot enter owner evidence, even if
  an agent claims `owner_pinned`.
- **Plain language first.** Every blocked/pending choice leads with what it is, why it is blocked
  and one next prerequisite, then progressive drill-down to gates, sources, provenance and refs.
- **Scope is renderer-derived.** Historical scope is a comparison of frame id **and** revision;
  the banner is independent of agent text. "Approved" in agent content is never approval state.
- **Lineage is bounded and equivalent.** The SVG opens fit-to-content and aggregates beyond the
  node bound; the table always contains every object and link row.
- **Accessible states.** Skip link, landmarks, live scope announcement, visible focus, light/dark
  themes, reduced motion, and distinct loading/empty/unknown/blocked/partial/error states.
- **Fail closed.** Forms carry `frame_id` and `frame_revision`. A stale frame returns
  `stale_surface`; an unavailable/proposed action has no form and a forged POST is refused.
- **T06 defect corrected.** The live Cognate read was empty because public projections require
  `<tenant>/<key>` state. Operational projection keys and event tenancy were corrected and the
  projection version bumped to `1.1.0`; direct and public reads now observe the same rows.

**Verified:**

| Command | Result |
| --- | --- |
| `just check-t09` | exit 0 — 16 pass / 0 fail (2 files, 77 expects); prereg shape ok |
| `just teeth-t09` | exit 0 — 5 pass / 0 fail (19 expects) |
| `just gate-t09` | exit 0 |
| `just verify` | exit 0 |
| `bun test` | 114 pass / 0 fail (18 files, 916 expects) |
| `bun x tsc --noEmit` | exit 0 |
| Spec hash | unchanged |

**Limits:**

- P2 is builder plus adversarial teeth, not an independent replay or a fresh confirmer signature.
- The GUI is server-rendered; there is no browser bundle/hydration test and no screen-reader
  vendor announcement trace. WCAG 2.2 AA rests on semantic structure, contrast tokens and computed
  CSS assertions.
- Live pages use fixture-produced T06 rows; `integration_level` stays `fixture`. No live
  SEA-Forge authority channel exists, so approval/denial cannot be proven.
- The GUI records intents only. It does not execute, settle or claim a world effect.
- Existing stores with the old `1.0.0` projection need an explicit Cognate projection rebuild
  before the new `1.1.0` rows are read; the gate reports `rebuild_required` rather than reinterpreting.

## Settled task history

- T00–T04: formation, frozen artifacts, walking skeleton, surface grammar/projection.
- T05: `horizon.surface/2` + `horizon.gui-view/1` across GUI/CLI/MCP.
- T06: operational object layer on Cognate's public Projection API.
- T07: `horizon.navigation/2` deterministic navigation controller (P2, 12 reqs).
- T08: sequential Clack renderer over the shared frame (P1, 5 reqs).
- T09: atomic GUI projection in Cognate React (P2 builder+teeth, 8 reqs).

## Open items carried

- **D-002:** upstream Cognate query gaps (no predicate query, traversal or version-aware query).
  Reported upstream; not worked around locally.
- **D-023:** latent SQLite opening-burst contention window; `busy_timeout` is supplied upstream.
- **D-024/D-025/D-030:** MCP tool-name folding, duplicated role vocabulary, and module-state
  findings in the T05 boundary check.
- **D-027:** agent attribution cap is unit-proven only; the J02 end-to-end case is not planned.
- **D-028/D-029:** a green gate can describe a tree behind `origin/main` because no gate fetches.
- Earlier: `REQ-RES-001` lexical baseline; Clack and the WebMCP browser transport remain declared
  but not bound.

**Next:** T10 — Context Kernel and source-grounded seven-operation world debugger (depends on
settled T06 + T07).
