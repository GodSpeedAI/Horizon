# Donor attribution

## Product Actualizer

- Source: `SPRIME01/Product-Actualizer`, donor commit `c9df8d2`, Apache-2.0.
- Reused at T04: structural vocabulary only — deterministic source references, a closed
  surface model, persistent navigation context, and pure projection from typed state.
- Not reused: Product Model, router, approval engine, server process or any second
  authoritative state store. Horizon does not import Product Actualizer packages.
- T04 implementation is an independent TypeScript derivation; no donor file was copied
  verbatim.

## Cognate

- Source: `GodSpeedAI/Cognate`, pinned `0.6.1` at `a477933a1ddf1a8bcd64b4e762ccbb56e5fbd7d5`,
  Apache-2.0.
- The `cognate create` starter was generated with the pinned CLI and committed with its
  vendored package closure. Horizon-owned application code replaces the starter example
  domain and test.

## DomainForge

- Source: `GodSpeedAI/DomainForge`, TypeScript binding `@godspeedai/domainforge` `0.21.1`,
  Apache-2.0.
- Used only through `@godspeedai/cognate-domainforge` for semantic projection and identity
  verification.
