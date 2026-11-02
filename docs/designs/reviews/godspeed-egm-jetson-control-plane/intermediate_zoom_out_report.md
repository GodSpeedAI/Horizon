# Stage 8 — Intermediate Zoom Out Review

**Target:** `docs/designs/godspeed-egm-jetson-control-plane.md` (367 lines, full file)
**Persona:** `egm-zoom-out` (Skeptical Architect, intermediate pass)
**Standard:** `resources/document_standards/zoom-out-standard.md`
**Reviewer status:** completed (fresh context, supplied with Stage 5–7 findings)
**Scope of this pass:** problems the earlier stages missed, and whether the implied remediation makes the design simpler or larger. Earlier findings are not repeated.

## Findings

**S8-1 [Blocker] The "does not replace anything / no new systems" claim does not survive its own component list.**
Scope: L13, L39 vs L132–141, L243–346, L106–129.
The design claims joining by "explicit identifiers and existing interfaces, not by new task, execution, evidence, memory or dashboard systems" (L13) and makes that a Non-Goal (L39). The component list then creates a second state store (embedded PostgreSQL), an ID authority plus git ledger, a TypeScript governor, a verification runner, two loop runners and a Horizon read path. The document convicts itself at L220, where Alternative F is rejected because a new surface "adds a sixth memory system to five existing ones; creates state that must be reconciled with RealityTrace and Cognate events." Paperclip's embedded Postgres is exactly that. Softening the wording converts one honest boundary claim into a paragraph of qualifications; the simple fix is to cut components until the claim is true. This also disposes of the "reversible at low cost" justification at L191.

**S8-2 [Major] The Horizon read contract should not exist in Increment 1, and its placement is wrong.**
Scope: L33, L48, L141, L172, L177, L323–331.
The design's own Open Question (L48) offers "or the Horizon view moves to a later increment." Take it. The pilot's learning is a merged candidate and one approved conversation; neither needs a new Horizon read path, and the existing economics view already renders the honest `unbound` state (`src/economics/model.ts:84`). Deferring deletes 2 of 22 files, one goal, one component, two increment steps and half of R2-3. If it is kept, L323 places it in `src/projections/`, but that directory is defined as pure Cognate-event folds (`src/projections/EGM.md`); a read path over a foreign store is an adapter under `src/adapters/` by the repository's own convention, and its required distinctions (`blocked`/`unknown`/`denied`/`unbound`) already match the closed-outcome union shape used by every read adapter (`src/adapters/EGM.md`). Test L331 ("works with Paperclip uninstalled") passes only if the read path reads nothing from Paperclip, contradicting L326.

**S8-3 [Major] `control/loop/repair.ts` and `control/loop/gtm.ts` contradict the document's own premise.**
Scope: L140 vs L293–301, L39.
L140 states both loops "run on existing primitives"; the file list specifies two new TypeScript orchestration runners with scoping, wall clocks, branch and PR creation, approval filing and outcome recording. Two new schedulers are the "new task systems" the Non-Goal forbids. A systemd timer plus an existing CLI satisfies the same requirement with zero new modules.

**S8-4 [Major] `control/egress/allowlist.md` is a document standing in for the $0-spend mechanism.**
Scope: L303–306, L52, L179.
The only deliverable for the strongest safety claim is a Markdown file, and the mechanism is still undecided between nftables SNI rules and a netns plus proxy (L52). `AGENTS.md` §6 states docs are not configuration. Egress refusal must live where enforcement already exists (the systemd unit, the governor's refusal path), or the claim at L31 must be downgraded to "absent credentials", which the existing Horizon secret handling does provide.

**S8-5 [Major] `gate-control` inside `just verify` breaks a property the design says it preserves.**
Scope: L338–341, L359–360.
L360 asserts `just verify` stays green with `gate-control` included. A gate whose proofs require Docker, Paperclip and a Jetson-enforced memory envelope cannot be green on a fresh clone or an offline workstation, so the sentence is false except on one host. Keep the control proofs in a host-scoped target and let Horizon's static checks assert the boundary (`src/` never imports `control/`).

**S8-6 [Major] Item 22 smuggles host and foreign-repository state changes into a Horizon deliverables list.**
Scope: L348–351.
Tagging another repository's `main`, reconciling the workspace `dev` branch, and pausing `jetson-probe.timer` are operator actions on a shared workspace and on the only always-on host's observability. They sit in the same numbered list as file creation, with no authority boundary and no restore step for the paused probe.

**S8-7 [Major] The numeric envelope is asserted as measured, but no measurement is retained.**
Scope: L31, L138, L180; `.tmp/egm-integration/evidence/` is gitignored.
MemAvailable floors (14 / 14.3 GiB), 85 °C, 100 GiB, Docker and cgroup versions and ~50 tok/s are stated as verified facts and then used as refusal thresholds and an admission contract. Nothing in the repository preserves the observation, so the numbers are unfalsifiable and will drift with the next Qwen3 load. Either cite a retained artifact or mark the numbers as provisional targets to be re-measured at increment step 1.

**S8-8 [Nit] Four enumerations of the same eight things.**
Scope: L26–34, L132–141, L167–175, L241+.
Every component appears four times, which is how the internal inconsistencies (R2 identifiers, admission floors, diagrams) survive: there is no single authority to contradict. Close the template gaps with one deliverable table and one short risk table, with R2 items inlined where they qualify a decision; anything longer grows a 367-line document that is mostly restatement.

## Net verdict on the remediation path
S8-1, S8-2, S8-3 and S8-5 are satisfied by deletion (about ten files, two goals, four component entries). Only S8-6 and S8-7 need added text, and both are short. If remediation lands as new sections explaining why the existing components are acceptable, complexity goes up and the design will need a further review round.
