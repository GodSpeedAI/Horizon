# Horizon navigation

Horizon gives an operator a current decision surface derived from case, operational, semantic, and evidence sources.

Horizon’s [interaction model](../.sea/interaction/interaction-model.sea) and [frozen HORIZON-001 specification](../.agents/specs/horizon.agent.spec.yaml) own the local meanings. See [implementation names and proof terms](glossary-implementation.md).

## Language

**Horizon Closure Pin**:
Horizon’s pinned identifier for the name and compiled semantic closure of its own interaction model.
_Avoid_: World Reference, execution-world identifier

**Navigation Frame**:
An immutable view of a current decision, including the observer, focus, read checkpoint, assessed moves, and relevant case or settlement judgment.

**Case View**:
Horizon’s purpose-relative projection of authoritative facts, direction, and known work over a sequence of decisions.

**Read Checkpoint**:
The source position used to read a projection. A comparison may retain multiple such positions.

**Navigation Commitment**:
An actor’s typed selection of a move under the Navigation Frame that offered it.

**Affordance Assessment**:
Horizon’s judgment of a move across visibility, reach, payment, authority, capability, recovery, and settlement access. A move can be available, blocked, unknown, or conflicted.

**Consequential Operation**:
An operation that spends resources or changes consequential state and therefore requires the applicable authority and evidence checks.

**Case-work Handoff**:
The transfer of a plan item and the references needed for its receiver to consider or carry out the next work. The receiving context retains its admission and settlement decisions.

**Source Binding**:
The connection between a displayed value and its declared source.

**Untrusted Reference**:
Retrieved material usable as context for judgment with no standing to authorize or execute an action.

**Requirement Closure**:
A development governance finding that a Horizon requirement met the applicable preregistered gates and evidence obligations.
_Avoid_: Operational settlement, execution completion

**Operational Fact**:
An attributed fact about the state, work, or lineage of a declared operational object.

**Surface**:
A declarative composition of information and choices for a Navigation Frame.

**Actor Attribution**:
The recorded identity and source of an assertion, action, or contribution to a Surface.

**Behavioral Journey**:
A declared scenario defining the decisions, effects, and evidence an interaction must support.

**Case-Step Correlation**:
A stable correlation for Horizon’s request to work on a particular case step. A delegated attempt needs the separate SEA-Forge Case Assignment identity.
_Avoid_: Case Assignment, Expert Assignment

**Operator**:
The human with standing to make or authorize the navigation decisions assigned to the operator role.
_Avoid_: Representational Operator


### Relationships

A Case View projects a [Purposeful Case](https://github.com/GodSpeedAI/godspeed-growth/blob/main/new_world/glossary.md#role-and-organization-terms) into Horizon’s view of purpose across decisions. The Navigation Frame captures the decision now and the Read Checkpoint captures where the inputs were read. A SEA-Forge Managed Case has a separate lifecycle and authority.

A [World Reference](https://github.com/GodSpeedAI/DomainForge/blob/35c4ed1/docs/reference/sea-application-contract.md#L931-L957) pins the full semantic revision. Horizon’s Closure Pin identifies semantic closure for its own boot check. The loader’s in-memory projection, Cognate’s Execution World and Workbench’s Execution State Digest represent other subjects.

[Context Kernel](https://github.com/GodSpeedAI/Context-Kernel/blob/b6387cd/README.md#global-invariants) owns Context Access and Reference Citation. Horizon labels citation material as an Untrusted Reference and applies separate action authority for consequential work. See [CognitiveOS Affordance](https://github.com/GodSpeedAI/godspeed-growth/blob/main/new_world/glossary.md#navigation-terms) for the distinction between a possible path and one available to the observer.
