# T09 — Atomic GUI projection in Cognate React

**Status:** settled · **Proof level:** P2 (builder with adversarial teeth) · **Recorded:** 2026-10-21
**Spec:** HORIZON-001 v1.0.1 `14a42936…` · **Plan:** T09

## What changed

T09 adds the rich, persistent workspace over the same T07 frame and T05 closed surface:

- `src/ui/workspace/model.ts` — one renderer-neutral snapshot. Owner region order is fixed
  (`context`, `decision`, `evidence`, `inspector`, `lineage`, `agent`). Choices reuse T07's
  plain reason and next prerequisite; actions reuse T05's posture/affordance and are submittable
  only when `offered` + `available`. Scope is `frame_id` **and** `revision` compared with the
  current frame. Agent nodes are appended as contributions, never admitted to owner evidence.
- `src/ui/workspace/render.tsx` — server-rendered semantic HTML. Skip link, landmarks, `aria-live`
  scope banner, visible focus rings, light/dark tokens, reduced-motion rules, native `<form>`
  submits, bounded SVG lineage plus a complete table, and progressive disclosure for gates,
  sources, provenance and raw refs. `ProjectionWorkspace` consumes
  `@godspeedai/cognate-react`'s `useProjection`; `renderWorkspacePage` waits for the live rows
  before rendering.
- `src/app.ts` — `workspace()` data seam and `/workspace`, `/workspace.json` and
  `/workspace/intent`. Forms carry `frame_id` and `frame_revision`; the POST route refuses a
  missing or stale frame and re-checks the action is offered and available before committing.
- `src/projections/operational-objects.ts`, `src/adapters/operational-objects.ts` — T06 defect
  found by the live client read: public projections must key state `<tenant>/<key>`. Projection
  state is now tenant-prefixed, operational events use the declared tenant, direct reads filter
  by that tenant, and the projection version is 1.1.0. The adapter and Cognate's public read now
  see the same rows.
- `package.json` — vendored `@godspeedai/cognate-client` and `@godspeedai/cognate-react` declared;
  `react-dom` added for server rendering.
- `justfile` — `check-t09`, `teeth-t09`, real `gate-t09`; the placeholder is gone.
- `test/workspace-model.test.ts`, `test/workspace-render.test.tsx`, `test/workspace-teeth.test.tsx`
  — 18 model/render tests and 5 adversarial HTTP/HTML tests. T06 tests were updated for the
  corrected projection version/key prefix; their behavioural assertions are unchanged.

## Positive observations

1. **Owner layout, not input order.** Regions are emitted in the declared owner order even when
   the supplied view interleaves blocks. The agent region is last and marked
   `data-owner-pinned="false"`.
2. **Blocked before drill-down.** A blocked choice leads with plain language
   ("you are not authorized yet…"), then the single next prerequisite, then a collapsed gate list.
   The same wording appears in the sequential renderer.
3. **Context persists.** Observer, world, checkpoint, focus, case and frame stay visible; the GUI
   never asks for a field it already resolved.
4. **Attribution is visible.** An agent acting for a human renders as
   `agent:<ref> acting for <principal>`, distinct from human and system.
5. **Historical scope is renderer-derived.** A frame whose id or revision differs from the current
   frame gets "Historical frame … this view is not current world state." Agent text cannot
   suppress or rewrite it.
6. **Lineage is bounded and equivalent.** The SVG opens `viewBox` fit-to-content; beyond the
   configured bound it aggregates and states how many nodes/edges were folded. The table always
   lists every object and link row.
7. **Accessible states.** Loading, empty, unknown, blocked, partial and error each have their own
   status/alert text. Unavailable sources render as `refused`/`unknown`, never as an empty success.
8. **Real Cognate React path.** The full page is rendered through `CognateProvider` +
   `useProjection("horizon.operational-objects")` over a real SQLite store with the T06 fixture;
   "Strategy alpha" and the lineage table appear from projected rows, not from the request body.
9. **Forged/stale forms fail closed.** A blocked or agent-proposed action has no form. A forged
   POST with a wrong frame returns `stale_surface`; a missing frame returns 400; only a current,
   offered, available action returns 303.
10. **Escaping.** Agent labels/text containing `<script>`, `javascript:` links and `onerror`
    attributes are HTML-escaped by React and never become elements or executable URLs.

## Negative teeth

| Attack | Result |
| --- | --- |
| Agent claims `owner_pinned` and places a block before the decision | Appended to agent contributions; owner evidence unchanged; reduction note shown |
| Agent text says "Current"/"Approved" on a historical frame | Banner still historical; agent text only appears as contribution text |
| Blocked action submitted through the form | No form rendered; forged POST refused |
| Agent-proposed consequential action | Visible, labelled "proposed by an agent; not offered to the human"; no form |
| Stale frame POST | 409 `stale_surface`; no intent |
| More lineage nodes than the bound | Graph aggregates; table retains every row |
| Missing/refused source | Rendered as refused/unknown, not an empty success |
| `<script>`, `javascript:` URL, `onerror` in agent content | Escaped; no executable element/URL |

## Verified

| Command | Result |
| --- | --- |
| `just check-t09` | exit 0 — 16 pass / 0 fail (2 files, 77 expects), prereg shape ok |
| `just teeth-t09` | exit 0 — 5 pass / 0 fail (19 expects) |
| `just gate-t09` | exit 0 |
| `just verify` | exit 0 |
| `bun test` | 114 pass / 0 fail (18 files, 916 expects) |
| `bun x tsc --noEmit` | exit 0 |
| Spec hash | unchanged (1.0.1) |

Logs: `check-t09.log`, `teeth-t09.log`, `gate-t09.log`, `just-verify.log`, `bun-test.log`,
`typecheck.log`.

## Limits

- P2 here means **builder plus adversarial teeth**, not independent replay. No fresh independent
  confirmer signed this round.
- The page is server-rendered; there is no browser bundle, hydration test or screen-reader vendor
  trace. WCAG 2.2 AA is checked by semantic structure, contrast tokens and computed CSS assertions,
  not by a vendor announcement.
- The live pages use fixture-produced T06 rows; `integration_level` stays `fixture`. No live
  SEA-Forge authority channel exists, so blocked/pending states are represented but approval or
  denial cannot be proven.
- The T06 tenant correction was discovered during T09 and changes the projection key layout and
  version. T06's behavioural tests pass; its old `1.0.0` checkpoint literal remains only in the
  deliberate stale-checkpoint test. See DEC-T09-02.
- The GUI records intents only. It does not execute, settle or claim a world effect; T10/T11 own
  the governed path.
