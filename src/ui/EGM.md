# src/ui — visual and declarative surface layer

## Overview

The seam between a validated navigation frame and everything a route is allowed to show or accept.
`surface.ts` owns no grammar of its own: it composes a frame into a `horizon.surface/2` document,
then parses, reduces and projects it through the one implementation in `./surface2/`. A GUI, a
terminal and an MCP client therefore differ only in how they spell a request, never in what exists.

Two boundaries are enforced here rather than described:

- **The frame owns affordability.** Every projected action reports the status the frame assessed;
  composition cannot widen it and the projection may only narrow it.
- **The transport owns what it may read.** `file:` sources default to refused and are only readable
  by a route that explicitly asks; a remote caller cannot use a surface as a filesystem read.

The pre-existing `./README.md` in this directory is Horizon's own project note and is neither
superseded nor modified by this contract.

## Interface

- `TransportRole` (alias of `SurfaceRole`), `SurfaceProjection` — the role-bound success or
  `INVALID_SURFACE` failure with issue paths `[surface.ts:SurfaceProjection]`.
- `composeSurface(frame, options?)` — frame → surface document, or `ComposedWithoutObserver`
  `[surface.ts:composeSurface]`, `[surface.ts:ComposedWithoutObserver]`.
- `affordanceOfFrame(frame): AffordanceStatusOf` — the frame's own assessment as a lookup
  `[surface.ts:affordanceOfFrame]`.
- `SurfaceRouteContext`, `bindingContextOf(context)` — the binding context a route may present
  `[surface.ts:SurfaceRouteContext]`, `[surface.ts:bindingContextOf]`.
- `projectForRole(submitted, role, frame, context)` — parse → reduce → project
  `[surface.ts:projectForRole]`.
- `projectFrame(frame, context, role = "human")` `[surface.ts:projectFrame]`.
- `assessmentOf(frame)` — the gate assessment in the shape `buildStructuralFrame` accepts
  `[surface.ts:assessmentOf]`.
- `frameFromCheckpoint(options)` — rebuild the frame a caller names from what the route knows
  `[surface.ts:frameFromCheckpoint]`.
- Re-exports for callers: `canonicalIntent`, `intentsEquivalent`, `type EquivalenceResult`,
  `type GuiView`, `type SurfaceIntentSubmission` `[surface.ts:canonicalIntent]`.
- Module-private: `ORIENTATION_BLOCK = "callout"`, `TREND_BLOCK = "chart"`, `BLOCK_ID`,
  `isAddressable`, `composeObserver` `[surface.ts:ORIENTATION_BLOCK]`, `[surface.ts:isAddressable]`,
  `[surface.ts:composeObserver]`.
- Child contracts: [sequential](./sequential/EGM.md), [surface2](./surface2/EGM.md),
  [workspace](./workspace/EGM.md).

## Invariants

- An observer that is not an authenticated `actor:` or `os:` principal is refused before
  composition: `composeObserver` returns `undefined` unless `OBSERVER_ACTOR_REF.test(frame.observer_ref)`,
  and `composeSurface` then returns `{ composed: false, reason: "observer is not an authenticated
  actor: or os: ref" }`, which fails the grammar `[surface.ts:composeObserver]`,
  `[surface.ts:composeSurface]`.
- The composed orientation block is fixed in shape: `id: "orientation"`, `tone: "info"`,
  `source_kind: "derived"`, `source_ref: "horizon:frame/" + frame.responsibility`,
  `layout: "owner_pinned"`, attributed to the observer as `role: "human"`
  `[surface.ts:composeSurface]`. The comment records why it is `derived` and why the source is keyed
  on responsibility rather than on the per-request `frame_id`.
- Composition is fixed to `surface_id: "horizon.home"`, `title: "Horizon"`, and
  `intent: options.intent ?? "inspect"` `[surface.ts:composeSurface]`.
- A choice that is not a published `HorizonOperation`, or whose `operation_ref` with `.` replaced by
  `-` fails `BLOCK_ID`, is **omitted** rather than renamed `[surface.ts:isAddressable]`.
- `affordanceOfFrame` marks an operation `"conflicted"` when two frame choices for it disagree, and
  returns the literal `"unknown"` for an operation the frame never mentioned: "absent means the frame
  said nothing, and saying nothing is not permission" `[surface.ts:affordanceOfFrame]`.
- `bindingContextOf` defaults both resolvers to `() => undefined`, pins
  `awaiting: { horizon: "TA-T06/T07" }` and defaults `allowFileReads: false`
  `[surface.ts:bindingContextOf]`.
- `projectForRole` is the only path from a submitted document to a view: it returns
  `{ ok: false, code: "INVALID_SURFACE", issues }` unchanged from `parseSurface`, and otherwise
  returns `{ surface, reduced, view }` with `affordanceOfFrame(frame)` as the affordance source
  `[surface.ts:projectForRole]`.
- `assessmentOf` reports `"available"` only when **every** choice's assessment is `"available"`;
  otherwise `"unknown"`. It never fabricates `"available"` from partial knowledge
  `[surface.ts:assessmentOf]`.
- `frameFromCheckpoint` defaults `status` to `"unknown"` and `firstBlockers` to `{}`, so a route that
  did not observe the original availability table cannot re-derive permission
  `[surface.ts:frameFromCheckpoint]`.

## Side Effects

- None observed in source: `surface.ts` performs no I/O, holds no state and reads no clock,
  environment or random source. The only impure work in this subsystem is `file:` reading in
  `./surface2/binder.ts`, and it is reached only through an injected `BindingContext`
  `[surface.ts:projectForRole]`.

## Verification

- Run: `bun test`
