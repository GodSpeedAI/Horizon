# SPEC-CR-001 — manifesto v13.1 → v17 delta for Horizon's spec

Builder-side comparison (read-only subagent, 2026-10-21). **Not an independent verdict.** Line numbers
refer to the files pinned in `CANDIDATE.yaml`.

| Term (spec lines) | v13.1 | v17 | Class | Consequence |
|---|---|---|---|---|
| Affordance (37, 139, 196, 250, 718) | §Affordance L118, 6 conditions | §7 L247, 7 conditions (adds recoverable, per-currency payable) | refined | gate keys at L718 already match v17's seven; re-cite and document mapping |
| Horizon (1, 40, 175, 306+) | §Horizon L88 | §3 L71 | refined | low impact |
| Payment (41, 513, 516, 594, 1329) | §Payment L140 | §8 L272, invariant 21 | refined, material | scalar `payment_estimate` → per-currency vector; no scalarized gates |
| Settlement (135, 168, 225, 587, 745) | §Settlement L163 | §10 L320 | refined | outside registration becomes general (L587 is conditional) |
| Observer (8, 40, 121, 473) | §Observer L74 | §2 L42 | refined | compatible; authoring/executing/observing are distinct roles |
| Capability (96-97, 237-250, 759) | §Capability L191, 4 tests | §11 L371, 5 terms incl. discrimination | refined, material | add discrimination to REQ-DEV-002 |
| Transfer (243, 249) | "variation" | §11 held-out, novel surface, same structure, graded | refined | define per v17 |
| Expectation (140, 199, 380-381, 423, 440) | absent | §5 L112, two-sided, three-valued | new in v17, material | add two-sided + three-valued requirement |
| Discrepancy (123, 440, 1208) | absent | §5 L126 match/mismatch/undefined | changed | `undefined` never counts as match |
| Authority (175, 519-520, 614) | absent | §13 L487, invariants 24-25 | new in v17 | executing observer cannot alter the criterion (already a stack invariant) |
| Revision (24-26, 614, 682) | absent | §13 L503-535, §17 L737, invariant 26 | new in v17, material | criterion change = new frozen identity; superseded evidence kept |
| Developmental (168, 246, 559, 758-760) | §Developmental Memory L224 | §12.2 L448, invariant 33 | refined | no auto-revision of normative representation |
| Developmental memory (246) | L224 | §12.4 L467, invariant 35 | refined | L246 already matches |
| Episode (129, 335, 1104, 1195-1219) | absent | §29 L1184 | new in v17 | consider v17 minimum fields |
| Error typing | absent | §15.3 L636 | new in v17 | optional, sharpens REQ-DEV-001 |
| Spendable, Variation | present | present | unchanged | none |
| Orchestration (249, 758) | 5 mentions | §8 currency, §11 declining burden | refined | orchestration is a payment currency |
| Representation (704, 720) | Representational Topology | §6 L158 | refined | compatible |
| Case | not defined | not defined | n/a | governed by the separate Case Navigation document |

Confidence: high for affordance, payment, expectation, capability, revision; medium for settlement,
authority, developmental. Gaps are listed in `CANDIDATE.yaml` `not_covered`.
