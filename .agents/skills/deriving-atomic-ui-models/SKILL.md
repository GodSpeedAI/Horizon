---
name: deriving-atomic-ui-models
description: Derives renderer-neutral Atomic UI IRs (views, regions, groups, elements, persistent context, states, traceability) from Behavioral IRs, sequential-proof evidence, projection pressure, and interface constraints, without framework component names. Use when translating proven interaction behavior into interface responsibilities and compositions, deciding whether a graph, timeline, table, inspector, or multi-pane layout is earned, auditing an existing UI against upstream behavior, or preparing a handoff to OpenTUI, React, Tauri, web, mobile, or voice renderers. Composes with deriving-behavioral-interaction-proofs; needs filesystem access to write UI IR artifacts.
---

# Deriving Atomic UI Models

Translate proven interaction behavior into a renderer-neutral Atomic UI IR before choosing concrete components.

```text
Behavioral IR + proof evidence + projection pressure + interface constraints → Atomic UI IR → renderer handoff
```

This skill does **not** own canonical domain meaning, does **not** redefine the Behavioral IR, and does not implement any renderer unless separately authorized. It answers: what interface responsibilities, atomic elements, compositions, persistent contexts, and richer representations has the proven behavior earned?

## Upstream authority

In order: (1) canonical Interaction Domain Model for meaning; (2) Behavioral IR for navigable behavior; (3) sequential-proof observations for demonstrated burden; (4) explicit product/interface constraints; (5) existing UI as implementation evidence, not semantic authority. If an Atomic UI choice conflicts with upstream behavior, the UI model is wrong unless upstream is explicitly revised.

Layers stay distinct: R1 Interaction Domain Model → R2 Behavioral IR → R3 Sequential Proof → **R4 Atomic UI IR (this skill)** → R5 Renderer Projection. Renderer details flow up into R4 only as explicit platform constraints.

## Core principle

Do not design screens from convention. Derive `domain semantic → behavioral necessity → observed pressure → UI responsibility → atomic composition`.

Every material element traces to at least one: behavioral responsibility; domain distinction that must stay visible; action/affordance; evidence or settlement obligation; recovery need; accessibility requirement; platform constraint; projection-pressure finding. Otherwise it is **unearned** until justified.

## Workflow

1. Gather the smallest sufficient inputs: Behavioral IR contract and journey IRs, proof report/transcript, `projection-pressure.yaml`, canonical source refs, platform and accessibility constraints, current UI evidence (brownfield). Do not rediscover domain behavior if upstream artifacts suffice; if they are missing, run `deriving-behavioral-interaction-proofs` first.
2. For each journey phase IS1–IS8, derive UI responsibilities → [references/phase-derivation.md](references/phase-derivation.md).
3. Translate each projection-pressure finding, applying the representation test → [references/projection-pressure.md](references/projection-pressure.md).
4. Write view IRs (elements, groups, regions, views, states) → [references/atomic-ui-ir.md](references/atomic-ui-ir.md); start from [assets/view.template.yaml](assets/view.template.yaml).
5. Run `python scripts/validate_atomic_ui_ir.py <view.yaml>...` and fix findings.
6. Validate, trace, and (if brownfield) audit → [references/validation-and-brownfield.md](references/validation-and-brownfield.md).
7. Check the completion gate; hand off.

## Renderer neutrality

Never put framework component names in the IR (`component: ReactButton`, `RadixDialog`). Use semantic primitives:

```yaml
primitive: action
semantic_action: approve_case
consequence: consequential
availability: { source: behavioral_ir }
```

One primitive must map to materially different renderers (terminal command/key binding, graphical action, touch action, spoken confirmation) without changing meaning. Use the smallest primitive that preserves required behavior.

## Affordance projection

UI actions project Behavioral IR affordances; they never become enabled merely because the renderer can issue them, and UI enablement rules must not become a second source of business truth. For every consequential action preserve: semantic action ID; availability source; authority state; commitment classification; blocked reason when material; evidence requirement; recovery relation.

## Completion gate

Do not call the Atomic UI IR ready for rendering until:

- every view has a purposeful behavioral source and the validator passes;
- material elements trace to Behavioral IR or explicit interface constraints (both directions);
- current affordances come from behavior semantics, not duplicated UI rules;
- commitment and authority boundaries stay visible where required;
- evidence and settlement responsibilities are represented;
- loading, empty, blocked, error, and recovery states are modeled where material;
- projection-pressure findings are addressed or explicitly deferred in `projection-decisions.yaml`;
- richer representations state their justification; unnecessary complexity is removed;
- framework-specific component names are absent; renderer assumptions are explicit constraints;
- accessibility obligations are preserved;
- at least two plausible renderer mappings preserve the model's meaning.

## Handoff

Give renderer agents: `atomic-ui-contract.yaml`, view IRs, `traceability.yaml`, `projection-decisions.yaml`, platform constraints, unresolved UI questions, Behavioral IR references, and acceptance criteria for behavioral fidelity (recorded in `handoff.md`). The renderer may choose mechanisms freely while preserving the Atomic UI IR and upstream behavior.

The goal is not to turn every sequential interaction into a screen but to discover which distinctions deserve persistence, simultaneity, comparison, spatial organization, or richer manipulation. A richer interface is justified when it makes consequential behavior cheaper to perceive, judge, execute, verify, or recover without inventing domain truth.
