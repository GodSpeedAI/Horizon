# Subsystem: semantic world

How Horizon loads, pins, and serves the canonical DomainForge world.

## Purpose

Every decision Horizon mediates refers to one immutable semantic model. This subsystem
owns loading that model, asserting its identity, and exposing it read-only to the rest of
the application.

## Responsibilities

- Read the canonical `.sea` source map (`domain/` symlink → `.sea/interaction`).
- Load the world through Cognate's `loadSemanticWorld` (`src/adapters/semantic.ts:35`).
- Assert the pinned world identity: the DomainForge `semantic_closure_hash` must equal
  `world:horizon@sha256:6c18d6a6…` (config `world_ref`, justfile variable). Mismatch
  fails startup via `assertSemanticOutput`.
- Expose the loaded world as the read-only Cognate capability
  `horizon.semantic.world` (`src/capabilities/semantic.ts`).
- Report object and relation counts for the startup banner (`src/main.ts`).

## Non-responsibilities

- It does not compile `.sea` (DomainForge owns compilation; Horizon pins the *output*).
- It does not authorize, mutate, or derive operational state — the semantic world declares
  types and relations that the operational layer must respect, but never contains runtime
  rows.

## Position in the system

- Consumed by: `src/capabilities/semantic.ts` (capability), `src/app.ts` (boot + counts),
  `src/adapters/navigation.ts` (declared types/relations for navigation derivation).
- Calls: `@godspeedai/cognate-domainforge` (vendored 0.6.1).

## Core abstractions

| Symbol | Location | Role |
| --- | --- | --- |
| `loadWorld` | `src/adapters/semantic.ts` | read sources, project through `loadSemanticWorld` |
| `assertSemanticOutput` | `src/adapters/semantic.ts:68` | identity assertion against pinned ref |
| `SemanticAdapterError` | `src/adapters/semantic.ts:5` | typed failure (no silent degradation) |
| `semanticWorldComponent` | `src/capabilities/semantic.ts` | read-only capability registration |

## Internal operation

1. `createApplication` resolves the absolute `domain/` path and calls `loadWorld`.
2. Cognate parses the source map and returns closure + canonical world metadata.
3. `assertSemanticOutput` compares the closure hash with the pinned `world_ref`; on
   mismatch it throws (a wrong world is never adopted).
4. The world is handed to the semantic capability (read-only policy) and kept for the
   process lifetime; it is never reloaded mid-run.

## State

Immutable for the process lifetime. No persistence of its own; the compiled artifact
identity is pinned in config and the frozen `.sea` sources.

## Lifecycle

Load once at boot → assert identity → serve read-only → closed at shutdown with the rest
of the application.

## Failure modes

| Failure | Symptom | Handling |
| --- | --- | --- |
| Pinned world mismatch | startup throws `SemanticAdapterError` | recompile with pinned DomainForge; never edit frozen `.sea` |
| Missing/corrupt sources | startup throws | restore `.sea/interaction` from git |
| DomainForge version drift | caught by `just check-toolchain` (requires 0.21.2) | set `DOMAINFORGE_BIN` to the pinned binary |

## Extension points

The world changes only through a new DomainForge compilation of the canonical `.sea`,
which changes `world_ref` — a governed event requiring spec/plan review, never a code
change. Consumers that need new semantic concepts should extend the `.sea` model, then
re-pin.

## Source trail

- `src/adapters/semantic.ts` — `loadWorld`, `assertSemanticOutput`
- `src/capabilities/semantic.ts` — `semanticWorldComponent`
- `config/horizon.toml` — `world_ref` pin
- `justfile` — `world_ref` variable, `gate-t01` identity proof
- `scripts/world-ref.py` — hash verification CLI
- `.sea/interaction/README.md` — canonical model documentation (canonical home)
