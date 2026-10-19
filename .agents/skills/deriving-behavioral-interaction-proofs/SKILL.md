---
name: deriving-behavioral-interaction-proofs
description: Derives renderer-neutral Behavioral IRs (one per canonical journey) and executable sequential behavioral proofs from canonical Interaction Domain Models or equivalent journey definitions, exposing missing authority, capability, settlement, and recovery bindings instead of inventing them. Use when turning interaction semantics or .sea journeys into stateful, testable navigation, deriving affordance gates and blocked-action reasons, building IR_ONLY/PROTOTYPE/PROVE proofs, or recording projection pressure before TUI/GUI design. Composes with deriving-interaction-domain-models and domainforge-sea (canonical .sea source); needs filesystem access to write proof artifacts.
---

# Deriving Behavioral Interaction Proofs

Turn canonical interaction semantics into the smallest executable behavioral representation a human can navigate, challenge, and correct before richer interface design begins.

```text
canonical interaction journey → Behavioral IR → sequential behavioral proof → evidence → UI handoff
```

This skill does **not** own canonical domain meaning or final TUI/GUI composition. Preserve upstream semantics; expose missing bindings rather than invent them.

## Source boundary

Prefer `validated .sea / resolved DomainForge model → Behavioral IR → sequential proof`. When only source evidence exists, run `deriving-interaction-domain-models` first; do not duplicate domain discovery here. The Behavioral IR may make semantics more concrete but must not silently redefine them.

## Workflow

1. Identify semantic authority and in-scope canonical journeys.
2. Declare the proof mode (below).
3. Write one Behavioral IR per journey against the IS1–IS8 contract → [references/behavioral-ir.md](references/behavioral-ir.md).
4. Classify each action's operation class and interaction kind → [references/interaction-vocabulary.md](references/interaction-vocabulary.md).
5. Run `python scripts/validate_behavioral_ir.py <journey.yaml>...` and fix findings.
6. Build and test the sequential proof; record `projection_pressure` → [references/proof-and-testing.md](references/proof-and-testing.md).
7. Check the completion gate; hand off.

## Shared contract: IS1–IS8

Every journey is projected through eight semantic responsibilities. They are not mandatory screens or a strictly linear path: a phase may resolve deterministically, be skipped, loop, branch, or stay blocked.

| Phase | Question | Capture |
|---|---|---|
| IS1 Context Selection | What case, actor, and operative context? | Only context needed to expose the next consequential move |
| IS2 Preflight | What must be true before movement is legitimate? | Preconditions, required information, state compatibility, policy prerequisites |
| IS3 Authority Resolution | Who or what may make this consequential? | Role authority, approval, escalation, prohibitions, obligations. Capability ≠ authority |
| IS4 Capability Invocation | What capability performs it? | Executable binding; if the IDM names a capability with no implementation, record the gap |
| IS5 State / Artifact Effect | What changes on success? | State transition, artifacts, resource effects, invariants |
| IS6 Evidence Inspection | What was actually observed? | Evidence to compare expectation with observation; logs or generated text count only if the contract says why |
| IS7 Settlement / Decision | Did observation satisfy the criterion? | Keep execution success distinct from settlement success |
| IS8 Next-Affordance Selection | What is spendable now? | Derive from state, authority, payment, capability, recovery, settlement access, not a static menu |

## Affordance rule

A named action is not automatically a current affordance. It is available only when all gates hold:

```text
visible, reachable, authorized, payable, executable, recoverable, settleable
```

Classify candidates as `available | blocked | unknown | conflicted`. Blocked actions keep a reason (`missing_precondition`, `unauthorized`, `unpayable`, `missing_capability`, `unrecoverable`, `no_settlement_access`, `policy_prohibited`) and are not offered as normal choices outside explicit diagnostic mode.

## Evidence discipline

Preserve upstream evidence classes: `declared`, `observed`, `inferred`, `proposed`, `unknown`. Represent contradictions as relationships among claims. If ambiguity changes availability, authority, payment, settlement, or recovery, surface it or block the affected path. Never invent missing authority, payment, settlement, capability, or recovery semantics to make the proof feel complete.

## Proof modes

Declare exactly one. If the user does not choose, use `PROTOTYPE` and say so.

- `IR_ONLY`: Behavioral IR validated; no executable proof.
- `PROTOTYPE`: IR plus runnable sequential proof using fixtures or simulated execution.
- `PROVE`: IR, proof, fixtures, and behavioral tests with evidence for exercised paths.

Default to simulated or fixture-backed behavior unless real integration is explicitly authorized and safe. Never present simulated execution as real-world settlement.

## Completion gate

Do not call the proof complete until:

- source semantic authority is identified; one Behavioral IR exists per in-scope journey (validator passes);
- stable semantic IDs are used for actions and states where the source supports them;
- missing bindings (capability, authority, payment, settlement, recovery) are explicit, not invented;
- current affordances are distinguished from possibilities; blocked actions keep reasons;
- authority boundaries and material payment constraints are represented;
- execution and settlement stay distinct; outcomes have evidence paths;
- failures expose recovery or an explicit terminal condition; cancellation is safe;
- happy, blocked, and recovery paths are exercised where applicable; affordance dependencies are tested;
- unknown and conflicting semantics remain visible;
- proof mode is declared; simulated results are not represented as external settlement;
- `projection_pressure` is recorded for downstream UI modeling.

## Handoff

Give the UI-modeling agent (`deriving-atomic-ui-models`): canonical source references, the IS1–IS8 contract, journey IRs, `proof-report.md`, exercised fixtures, `projection-pressure.yaml`, unresolved bindings, and evidence of which distinctions must stay visible or simultaneous. The downstream agent must not need to rediscover domain behavior from renderer code.

A proof succeeds when a domain expert can say: this action should/should not be available here; this information is missing; that role cannot authorize this; this evidence is insufficient; execution happened but the case did not settle; this is what becomes possible next. Those corrections are the proof doing its job, not prototype defects.
