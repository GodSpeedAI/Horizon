# Subsystem: navigation controller

The heart of Horizon: building the decision an observer faces, assessing affordances, and
accepting typed intents against them.

## Purpose

Turn "what is true at this checkpoint" into "what the observer may decide now" — a frozen,
versioned **navigation frame** — and validate every intent against the frame that issued
it.

## Responsibilities

- Derive operational navigation input from the projection
  (`src/adapters/navigation.ts`: objects, focus, links, facts, checkpoint).
- Derive the **Case**: purpose-relative view over facts + declared direction
  (`deriveCase`, `src/domain/navigation.ts`), including material-deviation detection.
- Assess **affordance gates** for every candidate operation across the seven canonical keys:
  `visibility`, `reach`, `payment`, `authority`, `capability`, `recovery`, `settlement_access`
  (`GATE_KEYS`). Authority evaluates to one of seven outcomes from `AUTHORITY_OUTCOMES`
  (`likely_allow`, `requires_approval`, `deferred_to_invocation`, `denied`, `unreachable`,
  `unknown`, `not_applicable`). The candidate's `status` resolves to `available`, `blocked`,
  `unknown`, or `conflicted` (`AffordanceStatus`).
- Build the **navigation frame** (`buildNavigationFrame`): focus, choices, available
  moves, view mode (`selectViewMode`), settlement judgment, observer controls;
  deep-frozen (`deepFreezeFrame`) and registered.
- Interactive model: explore gate assessment, blocker ordering, and intent commitment live in
  the **[Affordance Navigation & Frame Lifecycle Simulator](../explainers/affordance-navigation-simulator.html)**.
- Revise frames (`reviseNavigationFrame`) rather than mutating them.
- Validate and record intents (`src/domain/intent.ts` +
  `src/capabilities/navigation-intent.ts`), including refusal audit.

## Non-responsibilities

- No rendering (see [surfaces](surfaces-and-transports.md)).
- No store access (the adapter reads; the domain stays pure).
- No execution of consequential work (Gauntlet seam, later tasks; authority fails closed
  today).
- No policy of its own beyond the spec-declared gate semantics.

## Position in the system

Called by `src/app.ts` (`issueFrame`, `submitIntent`, `commitSurfaceIntent`); consumed by
all three renderers; produces `NavigationIntentRecord` events consumed by projections.

## Core abstractions

| Symbol | Location | Role |
| --- | --- | --- |
| `NavigationFrameV1` | `src/domain/frame.ts` | frozen frame schema |
| `buildNavigationFrame` | `src/domain/navigation.ts:575` | assessment → frame |
| `assessAffordance` | `src/domain/navigation.ts:219` | gate verdicts + blockers |
| `deriveCase` | `src/domain/navigation.ts:353` | Case derivation + deviation |
| `buildCommitIntent` / `assertCommitIntent` | `src/domain/intent.ts` | typed intent |
| `createFrameRegister` | `src/capabilities/navigation-intent.ts:28` | frame→intent binding |
| `appendIntentRecord` / `appendIntentAttempt` | `src/capabilities/navigation-intent.ts` | durable record + audit |
| `deriveOperationalNavigation` | `src/adapters/navigation.ts:64` | projection → input |

## Internal operation

1. **Derive input.** `deriveOperationalNavigation` reads the operational projection at the
   checkpoint, picks the focus, and computes candidate operations (`readOnlyCandidate`
   for reads; consequential candidates carry payment estimates and escalation behavior
   when declared).
2. **Assess.** For each candidate, `assessAffordance` evaluates the seven gates. Authority
   is evaluated first: `likely_allow` and `deferred_to_invocation` pass without granting;
   `requires_approval` generates a `blocked` blocker with synthesized prerequisite
   `authority:approval`; `denied` generates a `blocked` blocker; `unreachable` or `unknown`
   generates an `unknown` severity blocker. The remaining gates (`visibility`, `reach`,
   `payment`, `capability`, `recovery`, `settlement_access`) are checked next (`recovery` is
   only hard for `compensable`, `irreversible`, or `unknown` operations). Blockers are
   ordered by severity (`blocked` before `unknown`) and then `GATE_KEYS` sequence. Status
   is `available` (and `spendable: true`) only if zero blockers exist.
3. **Derive the Case** from facts and direction; material deviation influences the next
   primary move (`isOptionalOnly` suppresses primary recommendations when only optional
   choices remain).
4. **Build the frame.** Choices, controls (`observerControls`), view mode, settlement
   judgment (`shouldSettleNow` + reason). The frame is deep-frozen; its `frameId` and
   revision are stamped.
5. **Register.** The application stores the frame so later intents can be validated
   against *the frame that issued them*.
6. **Commit or refuse.** A submitted intent must match the frame id; unknown/stale frames
   produce typed refusals that are *also* appended as attempt-audit events — refusals are
   recorded observations, not swallowed exceptions.

## State

- Frames: in the application `FrameRegister` plus durable intent events.
- Intent records and attempts: streams on the store (append-only).
- Case: derived per frame; never persisted as authority.

## Lifecycle

issueFrame → (renderer presents) → intent commit/refusal → observation run → projection
update → next frame.

## Failure modes

| Failure | Symptom | Recovery |
| --- | --- | --- |
| Stale/unknown frame id | typed refusal + attempt event | re-issue frame |
| Unknown authority | `unknown` verdict surfaced, never guessed | obtain authority; today consequential ops fail closed |
| Invalid intent shape | `IntentError` | fix caller payload |
| Missing gate data | `unknown` with reason naming the gap | supply the prerequisite |

## Extension points

- New operations: extend candidate derivation plus the surface grammar's
  `HORIZON_OPERATIONS` (see [how-to](../how-to.md#add-an-operation-to-the-surface-grammar)).
- New gates: only via spec revision — gate keys are spec-declared frozen semantics.

## Source trail

- `src/domain/navigation.ts` — controller core
- `src/domain/frame.ts` — `NavigationFrameV1`
- `src/domain/intent.ts` — intent schema and validation
- `src/adapters/navigation.ts` — projection→frame derivation
- `src/capabilities/navigation-intent.ts` — durable intent/attempt streams
- `test/navigation-controller.test.ts`, `test/navigation-negative.test.ts` — contracts
