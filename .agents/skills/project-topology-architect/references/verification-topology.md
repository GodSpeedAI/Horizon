# Verification topology

Phase P4. Derive a verification graph, not a tests folder. Every meaningful contract,
capability, journey, and invariant gets a proof home and a narrow proof command. Tests are
placed, not collected: requirement ↔ verification ↔ boundary, with each proof runnable in
isolation.

## 1. Why a verification graph

A tests folder records what you chose to test. A verification graph records why a test
exists, which requirement it proves, which boundary it crosses, and how to run just that
proof. Verification is derived alongside the topology (P2/P3), so every structural
decision carries its verification consequence and every contract carries its proof home.

Follow this rule of proof-home allocation:

| Concern | Proof home | Proof kind |
|---|---|---|
| domain contract | reusable contract test | reference conformance |
| application capability | integration test | reference conformance |
| external journey | E2E test | reference conformance (behavioral) or structural |
| architecture invariant | deterministic boundary check | structural |
| wiring integrity | structural E2E | structural |
| recorded behavior ↔ actual system | evidence trace | observational integrity |
| externally meaningful result | settlement evidence, never local test | consequential validation |

Each entry maps to a narrow command. If a proof has no command, give it one (`just verify:<id>`).
If a requirement has no proof home, open one during P4; do not leave it for "someday".

## 2. Derivation chains

Derive each test from the topology, not from the code's current shape. Four canonical
chains, each ending in a narrow command:

1. **Domain contract → reusable contract test → every adapter satisfies it.**
   The contract lives once; adapters are tested against it, not against each other.
   Example: contract `ContractPayment` governs ports AdapterA and AdapterB; one
   parametrized contract test, one run per adapter, reported per adapter.
2. **Application capability → integration proof.**
   A capability that composes a domain port with persistence or transport gets one
   integration test crossing the real seam (a doubled seam only where the ledger freezes
   that double).
3. **External journey → E2E proof.**
   A user-visible journey gets an E2E proof that drives the assembled system through its
   public surface (see structural vs behavioral below).
4. **Architecture invariant → deterministic boundary check.**
   Direction, scope, and possession rules are enforced by script — dependency-direction
   lint, no fakes in production paths, no frozen-surface writes, no adapter import into the
   domain layer. Deterministic machinery is scripted; semantic judgment is model reasoning
   and never gets a script.

## 3. Structural E2E vs behavioral E2E

- **Structural E2E** proves the real system graph is connected and executable:
  composition roots construct, real adapters satisfy contracts, config loads, processes
  boot, routes/commands/events register, fixtures initialize, and the harness reaches every
  real boundary. It asserts *the architecture composes*, not that business behavior works.
  It must settle before handoff and must not depend on unimplemented behavioral work.
- **Behavioral E2E** proves specified externally meaningful behavior through the assembled
  system. Until the behavior is implemented it stays honestly red — never force it green,
  never delete it to keep `just test` green.

### Reaching real boundaries without substantive business logic

Build a structural E2E that crosses every real boundary using only trivial endpoints of
those boundaries:

1. health/readiness probe on each service and composition root;
2. minimal persistence round-trip through the real storage adapter (write→read→compare→delete);
3. one seeded fixture delivered to the boundary the harness will later drive;
4. a no-op traversing each route/command/event registration path (registered, decodes,
   routes) without executing business effects.

Each of these exercises the real adapter and the real config with near-zero business
semantics. Deep-drive business behaviors only when their tasks land.

## 4. Proof kinds — keep the four-fold separation

Keep these conceptually separate. Do not let one proof kind claim another's conclusion.

1. **Structural** — does the architecture compose? Established when wiring, contracts,
   and boundaries demonstrably hold (walking skeleton + structural E2E + deterministic
   boundary checks). You may claim: the system assembles and runs.
2. **Reference conformance** — does the implementation satisfy the frozen intended
   requirement? Established when the requirement's gate passes against its acceptance
   contracts from [requirement-ledger](requirement-ledger.md). You may claim: this
   requirement's obligations are satisfied in the observed runs.
3. **Observational integrity** — does recorded evidence faithfully describe the effective
   system? Established when the evidence trace, run provenance, and SXR settlement data
   match the artifacts that produced them. You may claim: the record reflects what ran.
4. **Consequential validation** — did effective behavior produce the intended externally
   meaningful consequence? Never established by a local test; needs real-world observation
   and settlement evidence. Keep it reachable (instrument, record, settle) but never claim
   it from [realitytrace-integration](realitytrace-integration.md)-style local runs.

Invariants that keep the separation honest:

- **Observed-only evidence.** Record what was actually observed. Local tests never claim
  real-world consequence.
- Try to settle 1–3 early; most local projects initially do. Keep 4 reachable without
  claiming it.

## 5. Task-scoped gates

Design gates so future unsatisfied requirements can exist without making baseline
structural verification useless. Recommended three tiers:

1. **Global substrate checks** — build, structural E2E, boundary lints, ledger/wayfinder
   validation. Must always pass. These prove the topology holds regardless of task
   progress.
2. **Requirement/task gates** — one gate per requirement/acceptance (AK-017 / AC-017-02).
   Red until that task is implemented; not run (or run and reported separately) by the
   baseline command so they cannot fail the substrate.
3. **Regression gates** — gates for already-settled requirements. Pinned green; a genuine
   regression is the only permitted red, and it blocks handoff until repaired.

Selection rule: choose the ecosystem's native mechanism and keep inventory of skipped
items honest. Pytest markers (`@pytest.mark.gated("AK-017")`; substrate excludes
`gated`), cargo `#[ignore]`, Vitest `describe.skip` with a running manifest, or a shell
runner that computes the set from the ledger all work. The mechanism must (a) mark a test
as belonging to a gate, (b) let the baseline command exclude gated tests while still
running them on demand, and (c) fail if a gate goes missing from the ledger bindings —
no silently-unrun verification.

Example layout (pytest):

```text
tests/
  substrate/
    test_structural_e2e.py        # tier 1: always run
    test_dependency_direction.py      # tier 1: boundary lint
  gates/
    test_ak_017.py                # tier 2: @pytest.mark.gated("AK-017")
    test_ak_017_green.py          # tier 3: regression lock for settled AK-017
```

```toml
# pytest config: baseline run excludes gated+regression phase markers
[pytest]
addopts = "-m 'not gated and not regression'"
markers = ["gated: requirement/task-specific proof (runs via just verify)"]
```

```make
verify-ak-017: ; pytest -m 'gated and gated("AK-017")' tests/gates/test_ak_017.py
```

Keep the gate list in the ledger so `just verify --all` and the substrate runner agree on
what constitutes a full prove-out.

## 6. Honesty rules

- **No mocks-agree-with-themselves greens.** A test passing against a doubled partner that
  only mirrors its own assumptions is a lie. Every test's doubled seams are recorded and
  frozen; the observed width per contract must not shrink silently.
- **Simulated external tools are labeled.** When a test stands in for a real external
  tool, the test must say what is simulated and in which capability; simulated failure —
  including external-tool absence — fails honestly.
- **Missing integrations fail honestly.** An absent external integration is a red,
  not a skipped blessing. Standard SXR-missing behavior follows
  [realitytrace-integration](realitytrace-integration.md)'s fail-closed diagnostic.
- **Never silently skip behavioral requirements** to keep `just test` green. Gate them,
  report them as red or not-run, and leave the requirement's own truth visible.

## 7. Error-surface quality

Verification output must be bounded, discriminating, diagnosable, actionable, recoverable,
and independently verifiable — never "143 tests failed". Prefer the bounded form:

```text
Task:      AK-017
Gate:      AC-017-02
Expected:  <the acceptance predicate>
Observed:  <the recorded run facts>
Contract:  <file/region where the contract is frozen>
Mutable:   <the implementation surface that may change>
Frozen:    <hash-pinned ruler surface>
Proof:     just verify:ak-017
```

Where the toolchain produces a raw failure (e.g., pytest without context), wrap or
annotate it: run the requirement's gate with its acceptance context, emit the bounded
form over the raw output, and point the diagnosing agent at the narrow command that
reproduces the failure. Raw tool output is evidence inside the bounded form, never a
substitute for it.

## 8. Failure modes

| Failure mode | Symptom | Guard |
|---|---|---|
| false-green harness | gates pass with doubled seams that mirror each other; requirement claimed settled without real adapter runs | honesty rules in §6; per-contract real-adapter runs; ledger-bound evidence |
| structural E2E gated behind unimplemented behavior | handoff blocked because structural check awaits business logic | structural E2E stays in tier 1 and uses §3 boundary probes only |
| verification unmapped to requirements | tests exist but no requirement id, gate, or proof command | §1 proof-home table + gate inventory per requirement |
| duplicate proof surfaces | same contract proven in multiple places drifting apart | one reusable contract test; single gate per acceptance |
| brittle scripts asserting semantics | a script hardcodes a URL, port, or message a domain change legitimately alters | chronology-free environment fixture; scripts assert wiring, not semantic content |
| no narrow proof commands | only a whole-suite runner exists, so a cold agent must run everything | every proof home gets `just verify:<id>`; P9 measures discovery burden |

## 9. Sequencing within P4

1. Allocate proof homes per §1 against the P2 topology.
2. Write tier-1 substrate checks: structural E2E plus boundary lints; prove them green.
3. Implement contract tests per §2 chain 1; run each against every adapter.
4. Write tier-2 gates for each requirement/acceptance in the ledger; confirm they stay red
   until implemented, then green only when behavior is real.
5. Add tier-3 regression locks for requirements that settle.
6. Wrap every proof output in §7 §bounded form; add the narrow commands to the `just`
   surface; validate the ledger's proof bindings with the ledger script.
7. Record evidence and stitch settlement facts via
   [realitytrace-integration](realitytrace-integration.md) only at the CLI boundary; never
   claim consequential validation from local runs.