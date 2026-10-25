# Product

## Register

product

## Users

The primary user is a **solo stack owner**: a technical person running the whole GodSpeed stack on one machine (Horizon, SEA-Forge, RealityTrace, optionally Workbench and Context Kernel). They installed it themselves from [IGNITION](docs/IGNITION.md), they understand processes, sockets and logs, and they want proof that the governed loop works end to end before they trust it with real work.

They arrive in the cockpit straight from a terminal, usually on a laptop or a desktop monitor, often in a long working session. Their job on any screen is one of: see what the world currently allows, pick a move, have an independent authority decide it, and see what actually happened.

## Product Purpose

Horizon is an operational navigation environment: given this observer, the world as currently represented, the purpose being pursued, and the authority available, what is the next move that can be afforded, carried out, observed and learned from?

The cockpit never decides. SEA-Forge decides whether a consequential move is committed; RealityTrace observes what happened; Horizon shows the frame, the gates, the outcome and the evidence, and keeps them distinct (request accepted, obligations settled, effect observed).

**Activation** is the operator's first governed commit: they open a case with a purpose, choose an afforded move, SEA-Forge rules on it, RealityTrace records it, and the cockpit shows the settled outcome with its evidence. Success is an operator who can say what was decided, by whom, and how they know, not a green light the cockpit produced on its own.

## Brand Personality

**Quiet, dense, legible.** An instrument, not a dashboard.

Familiar patterns over invention: lists, splits, tables, a status rail. The interface earns trust by being unsurprising and fast, not novel. Density is a courtesy to an expert reading closely. Colour only carries process meaning (gate state, verdict, severity, staleness); it is never decorative, and when it means nothing it does not appear. Nothing moves that has not changed. Confidence comes from provenance, not polish.

## Anti-references

- Generic SaaS admin dashboards: identical card grids, hero metrics, stat rows, gradient accents.
- Chat-first interfaces. Horizon is world-first; a conversation thread is not a model of the work.
- Anything that animates on load, and motion used in place of information.
- Playful consumer onboarding: gamified progress, confetti, streaks, celebration for work not yet done, swipeable feature-tour slides.
- Anything that hides uncertainty. A refusal or an `unknown` gate must read as exactly that, never as an encouraging nudge toward yes.
- Dark-mode terminal cosplay (neon on black, glow) and its opposite, skeuomorphic industrial-instrument styling.
- Fake AI furniture: purple-to-blue gradients, glowing orbs, invented confidence meters.

## Design Principles

1. **Authority is visible and never borrowed.** Every consequential outcome names who decided it (SEA-Forge, the operator through an approval) and what observed it (RealityTrace). The cockpit must never look as though it decided or applied something it only recorded.
2. **Teach by doing, in the real cockpit.** First-run guidance lives on the production screens and leads to the one action that produces activation. No separate tour, no mock data presented as live.
3. **Fail closed, and say so plainly.** When a component is missing or a gate is unknown, the surface states what is missing and the exact step that fixes it, instead of degrading quietly.
4. **Friction in proportion to consequence.** Reading is instant and quiet; committing, approving and settling are deliberate and state what they will record.
5. **Distinct claims stay distinct.** Accepted, settled, observed and improved are different statements and are never merged into one success state.

## Accessibility & Inclusion

WCAG 2.2 AA in both light and dark themes: keyboard-complete, visible focus on every interactive element, AA contrast, targets at least 24px. Respect `prefers-reduced-motion` and `prefers-color-scheme`. State is never conveyed by colour alone (always paired with text). Step progress is announced to screen readers.
