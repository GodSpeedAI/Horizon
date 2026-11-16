# Donor attribution

The legal summary of these obligations is the root [`NOTICE`](../NOTICE) file. This
document is the detailed, change-by-change account of what Horizon borrowed and explicitly
did not borrow; the two must stay in agreement, and `just check-t05` fails if the NOTICE
names a donor that this file does not, or the reverse.

## Product Actualizer

- Source: `SPRIME01/Product-Actualizer`, donor commit `c9df8d2`, Apache-2.0.
- Reused at T04: structural vocabulary only — deterministic source references, a closed
  surface model, persistent navigation context, and pure projection from typed state.
- Not reused: Product Model, router, approval engine, server process or any second
  authoritative state store. Horizon does not import Product Actualizer packages.
- T04 implementation is an independent TypeScript derivation; no donor file was copied
  verbatim.
- Reused at T05: the closed-surface *vocabulary as data* — responsibility and intent names,
  layout-placement names and tone names — transcribed into `src/ui/surface2/grammar.ts`
  (`RESPONSIBILITIES`, `SURFACE_INTENTS`, `LAYOUT_PLACEMENTS`, `TONES`). They are data, not
  donor code: Horizon validates them with its own zod schemas and no Product Actualizer
  module is imported.
- Still not reused at T05: Product Actualizer's loopback/local-token trust model, its router,
  its reducer or its server. Horizon's binder, reducer and projection are its own, and
  `just check-t05` fails if a second grammar, a route-side binder or an off-authority renderer
  appears.

## Cognate

- Source: `GodSpeedAI/Cognate`, pinned `0.6.1` at `a477933a1ddf1a8bcd64b4e762ccbb56e5fbd7d5`,
  Apache-2.0.
- The `cognate create` starter was generated with the pinned CLI and committed with its
  vendored package closure. Horizon-owned application code replaces the starter example
  domain and test.

## DomainForge

- Source: `GodSpeedAI/DomainForge`, TypeScript binding `@godspeedai/domainforge` `0.22.2`
  (resolved through `@godspeedai/cognate-domainforge` 0.10.0, which depends on 0.22.2 itself; no
  `overrides` entry is needed), Apache-2.0.
- Used only through `@godspeedai/cognate-domainforge` for semantic projection and identity
  verification.
