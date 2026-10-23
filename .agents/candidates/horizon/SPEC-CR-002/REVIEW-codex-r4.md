**Three r3 majors are closed; two remain partial and must be fixed before apply.** Both source hashes match. Review was read-only; no files changed or live integration tests run.

| R3 finding | R4 closure |
|---|---|
| 1. Verifier bound to the exact effect and immutable code | **Partial — major remains** |
| 2. Verification authority, confinement and payment | **Closed** — discrimination follows authorization, uses confinement, and has reserved verification cost; denied/unaffordable cases require no run. |
| 3. Observation deadline and frozen evidence set | **Partial — major remains** |
| 4. Crashed/null verification settlement | **Closed** — undefined observations are explicit, only known results decide, and mixed results have acceptance checks. |
| 5. Causal-order and rollback acceptance gaps | **Closed** — complete ordering, exact digest/id/position equality, and rollback refusal are asserted. |

1. **Major — the executable digest can leave verifier logic mutable.** [DELTA:116–126](/home/sprime01/projects/_wt/horizon-cr2/.agents/candidates/horizon/SPEC-CR-002/DELTA.md:116) pins argv and the executable. For `/usr/bin/python3 /approved/check.py <effect-id>`, changing `check.py` changes the criterion while both checks still pass. Read-only confinement prevents the verifier writing that script; it does not freeze its contents between runs. RealityTrace [executes the declared invocation](/home/sprime01/projects/gsr-heads/realitytrace/sxr-verify/src/verifier.rs:117) without adding that integrity guarantee. This leaves the changed-script case from r3 unresolved against [v17’s frozen-criterion relation](/home/sprime01/projects/godspeed-growth/world/cognitive_os_manifesto_v17.md:495). **Fix:** pin and verify the script/module artifacts that implement the criterion, or explicitly restrict supported bindings to self-contained verifier artifacts. Add a changed-script falsifier that preserves argv and interpreter digest.

2. **Major — C assumes Horizon captures the deadline without interruption.** [DELTA:148–166](/home/sprime01/projects/_wt/horizon-cr2/.agents/candidates/horizon/SPEC-CR-002/DELTA.md:148) asserts that a straddling run appends after C. Counterexample: Horizon stops before closure, the verifier finishes and appends after the deadline, then Horizon resumes and reads the head. That C includes the late observation. RealityTrace’s [head query returns the current head](/home/sprime01/projects/gsr-heads/realitytrace/sxr-ledger/src/ledger.rs:239), and its [persisted observation omits verifier timestamps](/home/sprime01/projects/gsr-heads/realitytrace/sxr-cli/src/commands.rs:1017). The existing straddle test assumes “appends after C,” so it misses this case. **Fix:** define trustworthy deadline-bound cutoff provenance, or explicitly fail closed to `unresolved`/`rejected` when an on-time C cannot be proven. Test delayed closure and downtime spanning the deadline, consistent with [frozen recovery requirements](/home/sprime01/projects/_wt/horizon-cr2/.agents/specs/horizon.agent.spec.yaml:1232).

**Minor — exercise confinement during implementation.** Add an authorized verifier that attempts a write and network access. The denied/no-run test does not exercise confinement; RealityTrace exposes a [launcher prefix](/home/sprime01/projects/gsr-heads/realitytrace/sxr-verify/src/port.rs:53), rather than enforcing that policy itself.

No additional blocker or major conflict found. The cutoff requirement needs the failure branch above to be reliably testable across recovery.

VERDICT: ACCEPT_WITH_CHANGES