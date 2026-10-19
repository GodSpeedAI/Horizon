# Validation, Traceability, Accessibility, Brownfield

## Contents
- Validation questions
- Traceability
- Accessibility
- Brownfield mode

## Validation questions

For every material element or composition:

1. What behavioral responsibility does it serve?
2. What upstream semantic or proof evidence justifies it?
3. Is its visibility/persistence requirement earned?
4. Does it preserve affordance availability rather than recreate it?
5. Could a simpler representation serve the same consequential purpose?
6. Does it accidentally introduce a new domain rule?
7. Can at least two materially different renderers implement it without changing meaning? If not, it is likely too implementation-specific.

## Traceability

Forward: `UI element → UI responsibility → Behavioral IR phase/action/evidence → canonical journey → Interaction Domain Model`.
Reverse: `behavioral responsibility → projected UI responsibility → rendered element, or an explicit reason no persistent UI is needed`. This gives coverage analysis without forcing every behavioral step into a visible component.

## Accessibility

First-class requirements, not decoration. Express semantic relationships and interaction obligations so they can support keyboard navigation, screen readers, focus order, non-color status communication, text alternatives for visual relationships, reduced-motion variants, and alternative modalities. A visual representation is never assumed to be the only valid projection.

## Brownfield mode

1. Derive the Atomic UI IR from upstream behavior first.
2. Inspect the existing UI as implementation evidence.
3. Map current components to atomic responsibilities.
4. Find UI-only rules that became accidental business logic.
5. Find missing behavioral responsibilities.
6. Find unnecessary or duplicated structures.
7. Preserve working representations that demonstrably reduce burden.
8. Propose the smallest structural revision. Do not redesign just because another component system is cleaner.
