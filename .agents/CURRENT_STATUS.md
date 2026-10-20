# Horizon Current Status

**Revision:** 21 · **Recorded:** 2026-10-20T23:27:56Z · **Stage:** T07 settled (P2); next ready task **T08**

**Spec:** HORIZON-001 v1.0.1, frozen; SHA-256 `14a42936fe3a17c3726ee57fbc9278fd6f6e92276f67519fd9bf0f605f3324a4`.

## T07 — observer-relative navigation controller

A pure controller (`horizon.navigation/2`) now derives an observer-relative Case and typed
candidate moves from authoritative facts, assesses exactly the seven canonical gates, and emits an
immutable revisioned frame. Nothing in it reads a clock, store or network at assessment time.

- **Possibility is not affordance.** A declared but unassessed operation stays in
  `possible_operation_refs` and is absent from choices. Available, blocked, unknown and conflicted
  are distinct outcomes; only available moves are spendable.
- **Authority is never granted.** likely_allow and deferred_to_invocation pass without granting,
  requires_approval is blocked with an approval prerequisite, denied blocks, and unreachable or
  unknown block as unknown (DEC-T07-02). The frame carries the literal `grants_authority: false`.
- **A Case is derived, not stored.** It is a value over authoritative fact refs and a declared
  direction with `ontology: null`; unknown keys are refused. The adapter reads the T06 projection
  and derives only read-only inspection moves — no consequential authority, payment or repair is
  invented (DEC-T07-01, DEC-T07-03).
- **No forced primary.** A material deviation yields at most one primary from the available set;
  an optional-only case reports `owner_choice` and no primary. Inspect, defer, reframe and disagree
  are always available.
- **Settlement is separate from reachability.** `should_settle_now` requires an authorized
  judgment reference; `settlement_reachable` does not imply permission to settle.
- **Additive framing.** T04/T05's `horizon.navigation-frame/1` is untouched; T07 adds
  `horizon.navigation/2` (DEC-T07-04).

The prereg was shape-checked before implementation: 12 positive + 11 negative structural members,
sha256 `96e36c73…`. Proof level is **P2**: 11 mutation teeth show the named tests reject those
specific violations. No independent replay was performed, and none is implied.

**Verified:**

| Command | Result |
| --- | --- |
| `just check-t07` | exit 0 — shape 12+11, coverage 23 linked |
| `just teeth-t07` | exit 0 — 11/11 mutants caught by assertion |
| `just gate-t07` | exit 0 |
| `just verify` | exit 0 |
| `just check` | exit 0 |
| `bun test` | 70 pass / 0 fail (10 files, 612 expect()) |
| Navigation suites | 25 pass / 0 fail (3 files, 154 expect()) |
| Spec hash | unchanged |

**Limits:**

- Authority is a typed input, not a live SEA-Forge evaluation. T07 proves gate semantics, not live
  authorization.
- The source adapter reads fixture-produced T06 rows; `integration_level` stays `fixture`.
- Payment amounts and units remain unresolved (`OQ-IDM-02`).
- The frame is not yet consumed by Clack (T08) or the GUI (T09); no renderer parity is claimed.
- Mutation teeth cover the eleven enumerated violations only, not arbitrary defects.

## Open items carried

- **D-002:** upstream Cognate query gaps (no predicate query, traversal or version-aware query).
  Reported upstream; not worked around locally. T06 used whole-projection reads.
- **D-023:** latent SQLite opening-burst contention window; `busy_timeout` is supplied upstream.
- **D-024/D-025/D-030:** MCP tool-name folding, duplicated role vocabulary, and module-state
  findings in the T05 boundary check. All size S, out of T07 scope.
- **D-027:** agent attribution cap is unit-proven only; the J02 end-to-end case is not planned.
- **D-028/D-029:** a green gate can describe a tree behind `origin/main` because no gate fetches.
- Earlier: `REQ-RES-001` lexical baseline; Clack and the WebMCP browser transport remain declared
  but not bound.

**Next:** T08 — Clack-style sequential renderer from the shared frame (depends on T07, settled).
T09 (Atomic GUI) is also ready and follows.

**Evidence:** [T07 summary](evidence/horizon/T07/SUMMARY.md), [gate-t07](evidence/horizon/T07/gate-t07.log),
[verify](evidence/horizon/T07/just-verify.log), [navigation tests](evidence/horizon/T07/navigation-tests.log),
[T07 prereg](prereg/horizon/T07.prereg.yaml), [decisions](reports/horizon-decisions.yaml),
[spec](specs/horizon.agent.spec.yaml), [plan](plans/horizon.plan.yaml),
[ledger](../requirements/ledger.yaml), [wayfinder](../.wayfinder/answer-key.md), [debt](DEBT.md).
