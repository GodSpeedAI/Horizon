# Horizon Interactive Explainers

This directory contains standalone, zero-dependency interactive HTML explainers for Horizon. Each explainer is a single, self-contained file with embedded styles, scripts, and verified operational models. They require no build step, no Node.js/Bun server, no package installation, and no internet access. You can open them directly via `file://` in any modern web browser.

Use these interactive representations when static diagrams or prose require too much mental simulation. They allow you to manipulate parameters, inspect affordance gate evaluations, step through the 7-operation world debugger, examine honest epistemic labeling, and test adversarial boundary invariants.

---

## Explainer Catalog

| Explainer | Reader Question Addressed | Form & Mechanism | Key Cognitive Affordance | Source Anchors |
|---|---|---|---|---|
| **[Affordance Navigation & Frame Lifecycle Simulator](affordance-navigation-simulator.html)** | *How does Horizon evaluate a candidate operation against the 7 canonical affordance gates (`visibility`, `reach`, `payment`, `authority`, `capability`, `recovery`, `settlement_access`) to produce an immutable, versioned Navigation Frame, and why does "possibility" never equal "affordance"?* | Live affordance evaluation laboratory, gate assessment simulator, and intent commitment runner | Directly toggle gate verdicts and authority outcomes to watch blocker accumulation and severity classification (`blocked` vs `unknown`), observe why consequential operations with `not_applicable` authority are blocked as `unknown`, inspect the synthesized `first_blocker` and `next_prerequisite_ref`, and test intent commitment against stale frames or simulated DOM tampering (`NE-09`, `NE-11`). | [`src/domain/navigation.ts`](../../src/domain/navigation.ts), [`src/domain/frame.ts`](../../src/domain/frame.ts), [`src/domain/intent.ts`](../../src/domain/intent.ts), [`docs/subsystems/navigation.md`](../subsystems/navigation.md) |
| **[World Debugger Workbench & Epistemic Truth Explorer](world-debugger-workbench.html)** | *How does Horizon's seven-operation world debugger (`why`, `impact`, `diff`, `timeline`, `counterfactual`, `reach`, `replay`) interrogate the operational projection, enforce query bounds, and label every value with honest epistemic classes (`recorded`, `derived`, `unknown`, `effect`, `untrusted_reference`) while preventing ungrounded AI hallucinations and unauthorized execution?* | Interactive seven-operation debugger console, bounded traversal laboratory, and epistemic label inspector | Directly execute each of the 7 read-only operations over operational projections, adjust traversal bounds (`depth`, `max_nodes`) to observe strict refusal on missing bounds (`NE-01`) or undeclared relations (`NE-02`), test cross-checkpoint diff immutability (`NE-08`), and inspect side-channel Context Kernel citations to observe why they are branded `untrusted_reference` and cannot authorize actions (`PE-10`). | [`src/domain/debugger.ts`](../../src/domain/debugger.ts), [`src/adapters/context-kernel.ts`](../../src/adapters/context-kernel.ts), [`docs/subsystems/world-debugger.md`](../subsystems/world-debugger.md), [`test/retrieval-debugger-teeth.test.ts`](../../test/retrieval-debugger-teeth.test.ts) |

---

## Technical Architecture & Boundary Principles

These explainers adhere strictly to the **Repository Cognitive Representation Architecture** principles:

1. **Zero Runtime Dependencies**: No CDNs (`unpkg`, `cdnjs`), external web fonts, or remote assets. All CSS, JavaScript, and SVG icons are strictly local and inline.
2. **Deterministic & Offline**: Directly openable from local disk via `file:///path/to/docs/explainers/<name>.html`.
3. **High-Fidelity Models**: The underlying data structures, token names, gate assessment rules, blocker sorting precedence, and value classes accurately match `Horizon` TypeScript domain implementations.
4. **Non-Invasive Documentation**: These tools serve comprehension, training, and operational inspection; they never mutate repository state, alter build configurations, or execute side-effecting code.
