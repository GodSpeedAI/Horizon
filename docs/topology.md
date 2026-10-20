# Horizon topology (T04 walking skeleton)

The spec owns what must be true and the plan owns settlement order. This record names
only the executable substrate and its boundaries.

## Component units

| Unit | Path | Responsibility | Depends on |
| --- | --- | --- | --- |
| Configuration | `src/config/` | Parse and validate `config/horizon.toml`; issue per-launch secret; derive operator/agent principals from the trusted local boundary. | Bun TOML, OS session |
| Semantic adapter | `src/adapters/semantic.ts` | Read the canonical `.sea` source map and project it through `loadSemanticWorld`; assert the pinned DomainForge world identity. | `@godspeedai/cognate-domainforge`, `domain/` |
| Research adapter | `src/adapters/research.ts` | Invoke the Python subsystem's typed process contract and validate its health envelope. A failed or absent subsystem is a typed degraded observation (`research_unavailable`), never a startup prerequisite; research-dependent operations fail closed. | `research/` |
| Domain | `src/domain/` | Typed navigation frame, typed `CommitNavigationIntent` intent and `NavigationIntentRecord`, and the pure contract witnesses (`contracts.ts`). No I/O, runtime or adapter imports. | none |
| UI seam | `src/ui/` | Pure projection from a frame to a closed surface model with explicit source references. No executable markup. | `src/domain` |
| Capability | `src/capabilities/` | Expose the loaded semantic projection as a read-only Cognate capability, and `horizon.navigation.intent.commit` (the typed intent, validated against the frame the application issued). Committed `NavigationIntentRecord`s and refused attempts are appended to Cognate's durable log. | `src/adapters/semantic`, `src/domain` |
| Agent | `src/agents/` | Deterministic structural observation run, started from a committed intent; invokes the semantic capability and emits its observation. | runtime API |
| Projection | `src/projections/` | Tenant-partitioned `horizon.navigation-context` projection over `run.started`. | projection API |
| Runtime | `src/runtime/` | Compose the real Cognate runtime over a durable SQLite store; local policy and action gates. | Cognate runtime |
| Application | `src/app.ts`, `src/main.ts` | Composition root, HTTP health surface and process lifecycle. | all of the above |
| Research subsystem | `research/` | Independent uv project with a lock file, typed JSON contract and pytest gate. No ML logic. | Python 3.12+ |
| Verification | `scripts/`, `justfile` | Type/config check, boundary checks, IDM reference integrity, acceptance-claim polarity, adversarial teeth (including a memory-only runtime fake in an isolated tree), scoped gates. `just verify` is T04's complete gate. | Bun, Python, DomainForge CLI |

## One-way dependencies

`domain` ← `ui`; `domain` ← `app`. `adapters` → domain/external APIs. `capabilities` →
adapters/domain; they write only through Cognate's own store. `agents` → runtime API and
domain. `runtime` → capabilities/agents/projections. `app` →
config/world/adapters/runtime. `config` does not import adapters, runtime or UI. `domain`
does not import adapters, runtime or capabilities. `ui` does not import adapters or runtime.

The canonical semantic authority is `.sea/interaction/`, exposed to Cognate tooling through
the `domain` symlink. No second `.sea` tree is permitted. Cognate owns events, capability
invocation and projection state; no second event history or product model is created.

## Frozen and mutable surfaces

- Frozen inside a run: `.agents/specs/**`, `.agents/plans/**`, `requirements/ledger.yaml`,
  `.wayfinder/answer-key.md`, and the canonical `.sea` source after freeze.
- Mutable: `src/**`, `scripts/**`, `test/**`, `research/**`, `config/**`, `justfile`,
  `docs/**`, and future task-specific surfaces.

## Trust boundary

`local_operator` binds loopback transports only, derives the operator principal from the OS
session, gives each agent a distinct `agent:` principal, and writes a fresh `0600` secret at
every launch. `shared_remote` is refused unless a real identity provider is configured; the
Product Actualizer loopback-token model is not reused as a remote trust model.

## Known release mismatch

Cognate 0.6.1 `loadSemanticWorld` returns a `worldRef` derived by
`Graph.worldRefFromIdentityJson`, while the pinned T01 identity is DomainForge's
`semantic_closure_hash`. Both are recorded: `world_ref` is the canonical pinned reference;
`cognate_world_ref` is the adapter's returned reference. The adapter asserts the closure
hash, so a world change fails closed. This is recorded as debt D-011 and is not silently
normalized.

## Open behavior

No navigation ranking, object query, live SEA-Forge authorization, Gauntlet execution,
RealityTrace evidence or Product Actualizer model integration is claimed here. Their gates
fail closed until their settlement tasks land.
