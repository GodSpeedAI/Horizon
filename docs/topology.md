# Horizon topology (T04 walking skeleton) — historical freeze record

> **Status: historical.** This is the topology record frozen at T04
> (`T04-CR-001@2026-10-20`) and cited by the T04 evidence under `.agents/evidence/horizon/T04/`.
> It is preserved as a freeze-time record, not maintained as current documentation.
> For the current architecture (including T05–T10: the closed surface grammar, three
> transports, operational object layer, navigation controller, and the seven-operation
> world debugger), read **[architecture.md](architecture.md)**.

The spec owns what must be true and the plan owns settlement order. The T04 record named
only the executable substrate and its boundaries at that point in time.

## Component units (as of the T04 freeze)

| Unit | Path | Responsibility | Depends on |
| --- | --- | --- | --- |
| Configuration | `src/config/` | Parse and validate `config/horizon.toml`; issue per-launch secret; derive operator/agent principals from the trusted local boundary. | Bun TOML, OS session |
| Semantic adapter | `src/adapters/semantic.ts` | Read the canonical `.sea` source map and project it through `loadSemanticWorld`; assert the pinned DomainForge world identity. | `@godspeedai/cognate-domainforge`, `domain/` |
| Research adapter | `src/adapters/research.ts` | Invoke the Python subsystem's typed process contract and validate its health envelope. A failed or absent subsystem is a typed degraded observation (`research_unavailable`), never a startup prerequisite; research-dependent operations fail closed. | `research/` |
| Domain | `src/domain/` | Typed navigation frame, typed `CommitNavigationIntent` intent and `NavigationIntentRecord`. No I/O, runtime or adapter imports. | none |
| UI seam | `src/ui/` | Pure projection from a frame to a closed surface model with explicit source references. No executable markup. | `src/domain` |
| Capability | `src/capabilities/` | Expose the loaded semantic projection as a read-only Cognate capability, and `horizon.navigation.intent.commit` (the typed intent, validated against the frame the application issued). Committed `NavigationIntentRecord`s and refused attempts are appended to Cognate's durable log. | `src/adapters/semantic`, `src/domain` |
| Agent | `src/agents/` | Deterministic structural observation run, started from a committed intent; invokes the semantic capability and emits its observation. | runtime API |
| Projection | `src/projections/` | Tenant-partitioned `horizon.navigation-context` projection over `run.started`. | projection API |
| Runtime | `src/runtime/` | Compose the real Cognate runtime over a durable SQLite store; local policy and action gates. | Cognate runtime |
| Application | `src/app.ts`, `src/main.ts` | Composition root, HTTP health surface and process lifecycle. | all of the above |
| Research subsystem | `research/` | Independent uv project with a lock file, typed JSON contract and pytest gate. No ML logic. | Python 3.12+ |
| Verification | `scripts/`, `justfile` | Type/config check, boundary checks, IDM reference integrity, acceptance-claim polarity, adversarial teeth (including a memory-only runtime fake in an isolated tree), scoped gates. `just verify` is T04's complete gate. | Bun, Python, DomainForge CLI |

## One-way dependencies (T04 rules, still enforced)

- `src/domain` imports nothing from adapters, runtime, or UI.
- `src/ui` projects frames only; it holds no authority and no store access.
- Adapters may depend on the domain; the domain never depends on adapters.
- The research subsystem stays a typed subprocess contract with no ML claims.

## Frozen and mutable surfaces (T04 declaration, unchanged in effect)

- Frozen inside a run: `.agents/specs/**`, `.agents/plans/**`, `requirements/ledger.yaml`,
  `.wayfinder/answer-key.md`, and the canonical `.sea` source after freeze.
- Mutable: `src/**`, `scripts/**`, `test/**`, `research/**`, `config/**`, `justfile`,
  `docs/**`, and future task-specific surfaces.

## Trust boundary (T04 declaration)

Local operator profile: loopback binding, OS-session-derived principals, per-launch
secret. This is a single-operator trust model, not a remote/multi-user security model.

## Known release mismatch (at freeze)

The pinned Cognate runtime release and the vendored 0.6.1 tarballs are the verified
combination; later Cognate releases require re-verification rather than silent adoption.
See [donors.md](donors.md) and `src/runtime/required-cognate.ts`.

## Open behavior (at freeze; since settled by T05–T10)

Surface semantics beyond the T04 seam, sequential rendering, the operational object
layer, the navigation controller, the GUI workspace, and the world debugger were
explicitly open at the freeze and are now documented in
[subsystems/](documentation-map.md#subsystems-subsystems).
