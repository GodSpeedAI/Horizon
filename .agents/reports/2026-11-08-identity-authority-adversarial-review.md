# Adversarial EGM review — unified identity, delegation, and authority

**Date:** 2026-11-08  
**Target:** `design_draft.md`, initial SHA-256 `2d91a729acdfa26aec4217cbab55bbb74293aec50cb47c9cc553dc714f7d8cdc` (397 lines)  
**Baseline:** accepted authority report `d302b5ae3133fbd4bc79a7113fb4c8332fefdd2caa3218f2901f5240790246e1`; accepted brief `e5887404b865ad65214aa74e5db16eff1685395b58c687dd6ac0bb4ff74c7237`  
**Method:** three independent, fresh-context EGM lenses — design critic, implementation readiness, and adversarial security/platform — with direct read-only source inspection and no parent transcript.  
**Initial verdict:** `CHANGES REQUIRED`  
**Current status:** revised design; final acceptance check recorded below.

## Review result

The reviewers agreed on the architecture but rejected the draft as implementation-ready. The defects were not disputes about ownership or S1/S2 direction. They were omissions that would force an implementer to invent policy or a security mechanism: no closed operation catalog or wire schema; custody without issuance authorization; A3 without a channel-bound verifier or recovery; local and governed paths mixed into one pipeline; aggregate delegation budgets missing; issuer and SEA-Forge revocation epochs conflated; evidence append-only but not independently authenticated; Stage 0B not independently executable; legacy quarantine scheduled too late; no minimum vertical slice; and acceptance criteria that demanded implementation evidence before implementation.

All findings were accepted. The revised design closes the pre-code decisions, assigns bounded investigations with preferred mechanisms and fallbacks, and moves runtime measurement to named qualification gates. No finding is waived.

## Findings and dispositions

Severity is from the original review. `D` = design critic, `R` = implementation readiness, `SEC` = security/platform.

| ID | Severity | Finding (sources) | Disposition | Revised location / gate |
|---|---|---|---|---|
| F01 | Blocker | No closed v1 operation catalog; shared contract was prose with no schema, canonicalization, holder proof, or unknown-version rule (R1, R2) | Closed catalog, Px default, route/handler manifest, `horizon.identity.v1` wire rules, ES256/JWS and JCS digest | Sections 2 and 11; Q1 |
| F02 | Blocker | Issuer topology was delegated to implementation and custody did not establish who may mint which principal (R3, D5) | Named preferred/fallback profiles; enrollment and issuance authorization; exact platform custody; zero unauthorized issuance gate | Section 3; U1.A/U1.B; Q2 |
| F03 | Blocker | A3 lacked a selected channel, verifier boundary, pairing/recovery, and a way to prevent page/relayed assertions (R4, D6, SEC2) | A3-UV phone path, authority-sourced canonical operation, trusted-verifier receipt, recovery codes, Stage 0B A3-T only | Section 7; U3.A/U3.B; Q4 |
| F04 | Blocker | A universal SEA pipeline contradicted local Cognate ownership, human sessions, offline work, and SEA outage behavior (R5, D4) | Explicit local vs governed paths; nullable authority reference; one pending-record writer; local P0/P1 survives SEA outage | Section 4; U2; Q3 |
| F05 | Blocker | Grant creation could bypass human intent; delegation/effect interfaces were unspecified; aggregate budgets, retries, crash recovery, and separation of duty were missing (D1, R6, D7, SEC1, SEC4) | Grant creation is P2 A3 or non-amplifying parent; atomic `effect_fence` protocol; ancestor budget reservations; supersession; gateway principal restriction | Sections 4 and 6; U4; Q3 |
| F06 | Major | Numeric policy and operational thresholds were replaced by “measurement”; no budgets, depth, expiry, sample counts, or failure action (R7, D10, SEC10) | Frozen v1 constants; post-implementation p99/load gates; conservative fallback or capability disable on miss | Section 14; Q2–Q7 |
| F07 | Major | Evidence had no authenticated producer/verifier receipt, independent verification procedure, retention, redaction, deletion, or unavailability behavior (R8, D9, SEC7) | Producer table, verifier receipt, retention defaults, tombstones, `verification_unavailable` | Section 10; U6; Q6 |
| F08 | Blocker | Stage 0B was not independently executable and had no usable confirmation or recovery path (R9, D3) | Horizon-only file/handler map, reserved-action deny matrix, local A3-T terminal challenge, preserved drafts/low-risk work | Section 12; Q5/Q4 |
| F09 | Blocker | Legacy quarantine followed consumer migration; mixed-version and human/service identity fallback remained reachable (R10, D2, SEC3) | Legacy marking at Stage 1, gateway principal restriction at Stage 2, drain/rebind at Stage 7, rollback refusal | Section 12; Q8 |
| F10 | Blocker | No executable minimum end-to-end slice; protocol/app expansion could precede proof (R11, D10) | Six-observation vertical slice at Stage 4; no extension before it passes | Section 12; Q5 |
| F11 | Major | Design acceptance required implementation evidence, while qualification lacked native lanes and zero-skip rules (R12, D10, SEC10) | Separate design acceptance from post-implementation Q1–Q8; explicit S1 criteria and S2 limits | Sections 15–16 |
| F12 | Major | Issuer and SEA revocation epochs were conflated; no acknowledgement or stale-fence rule (D8, SEC5) | `issuer_generation`, `authority_epoch`, `dispatch_epoch`; broker acknowledgement; pending vs complete | Section 8; U4.B; Q3 |
| F13 | Major | New attempt ID did not fence a still-running old attempt; sleep/suspend/clock behavior was incomplete (SEC6) | Issuer/broker supersede old attempt before new action; elapsed-time revalidation after suspend | Section 5; Q2 |
| F14 | Major | A0/A1/A2 meanings drifted from the accepted baseline; ordinal comparison could accept weaker evidence (SEC9) | Baseline-compatible A0–A3 predicates; unknown/weaker predicate fails closed | Section 7; Q1 |
| F15 | Major | Mandatory alternatives evaluation was missing (D11) | Alternatives and rejection rationale added without reopening owner decisions | Alternatives Considered |
| F16 | Major | Platform qualification was too generic: DPAPI alone, Windows/macOS `Isolated`, Linux prerequisites, and Jetson unsupported modes were not bounded (SEC8) | Exact platform mechanisms and unsupported claims; S2 requires out-of-boundary issuer/authority and separate device | Section 13; U5; Q7 |

All 33 source findings are represented: D1–D11, R1–R12, and SEC1–SEC10.


## U1–U6 closure summary

| Item | Category | Result |
|---|---|---|
| U1 | S + I | Issuer profile/authorization frozen; platform custody probes timeboxed with preferred and fallback mechanisms |
| U2 | S | Closed catalog and exact binding rules frozen; route/handler manifest and downgrade tests assigned to 0A |
| U3 | S + I | V1 phone A3-UV and recovery frozen; independence/recovery investigation assigned a threshold and fallback |
| U4 | S + Q | Policy constants frozen; latency/load/revocation gates assigned to Stages 2/4/6 with conservative failure action |
| U5 | S + I + Q | Platform claim matrix frozen; Jetson/isolation probe timeboxed; native lanes at Stage 6 |
| U6 | S + Q | Evidence schema/retention frozen; access/deletion qualification at Stages 4–6 |

No architectural decision remains open. The remaining work is either a named, timeboxed investigation or a post-implementation qualification gate; neither permits an implementer to choose a different authority model, A3 channel, operation class, or fallback silently.

## Review evidence

The three sanitized outputs are retained under `.agents/evidence/2026-11-08-identity-authority/`:

| Output | Session | SHA-256 |
|---|---|---|
| `adversarial-design-critic.md` | `01a1bdfa-cf3d-7042-bf95-857abaced1f0` | `3cc618a0aea3726126852b59f72696f42e35117557c585e1a5ab49d69bfffa12` |
| `adversarial-implementation-readiness.md` | `01a1bdfa-cf63-7653-86c4-0b17ec0830bc` | `70c968d342178a76f067b6326bbbb5ad1c454e75f46b7865e851caeb2746ea48` |
| `adversarial-security-platform.md` | `01a1bdfa-cf3d-7903-8b8c-c137ac8265b1` | `564a633a5fdae993018a52ce91fc380c489bbac046185f413dc21451dc67c78c` |

These are independent reviewer outputs, not proof of runtime behavior. They establish design-review findings only; Q1–Q8 are the implementation qualification.

## Closure rounds

After the dispositions, five bounded closure rounds, one narrow verification check, and one final acceptance check were run against successive revisions. Each was scoped to the preceding round's findings; none was a fresh broad review.

| Round | Reviewers | Findings | Nature |
|---|---|---|---|
| 1 | readiness, security | 10 + 3 | Typed wire schemas absent; local/governed branches contradictory; approval policy implicit; recovery ceremonies conflicting; Stage 0B not independently executable; gate categories mixed; legacy effects not barred before cutover; vertical slice lacked a real commitment; evidence freshness undecided; an unsafe S2 downgrade path |
| 2 | readiness, security | 6 + 1 | Human/bootstrap callers could not satisfy agent-only schemas; parameter schemas still deferred; Stage 0B redemption not atomic; TTY ≠ local session; Q3 preceded its confirmation runtime; Stage 0B left governed operations' behaviour implicit |
| 3 | readiness, security | 5 + 4 | Incompatible caller discriminators; incomplete Stage 0B binding; restart recovery contradicted the state machine; operation aliases lacked constraints; `run.start` target resolution undefined; paired-device recovery had no catalog or schema path |
| 4 | readiness, security | 2 + 1 | `Credential.delegation_ref` excluded local P0 executions; governed-human branch excluded catalogued human P3; entitlement-backed decisions and fences had no explicit variant |
| 5 | combined | 1 | Entitlement-backed human P2 excluded from the null-grant rule; root-grant creation could not complete the fenced pipeline |
| Narrow check | combined | 1 | P3 row still required a grant unconditionally, contradicting the entitlement variant |
| Final acceptance | combined, frozen target | 1 | Human-session `capability.invoke` and `run.start` named a grant-based expiry although a human session has no grant |

All findings were corrected in the design. The corrections were small and local: caller discriminators, nullability rules, per-operation schemas, alias constraints, restart expiry and replacement, and an explicit entitlement-backed authority variant for human callers.

**Process defect, recorded rather than hidden.** Rounds 2 and 3 were invalidated as snapshot checks: the reviewed file changed while the reviewer was reading it, and both reviewers correctly reported the hash mismatch instead of silently reviewing a different document. That is why findings appeared to repeat across rounds. The final verification therefore ran against an immutable `0444` copy with a pre-declared hash.

## Final acceptance

The final acceptance check ran against an immutable `0444` copy of the design at SHA-256 `e7ef6a9dffebe138262d865bf58299ef0b613c9ca60f2900cab90a623b003c4a` (658 lines). Verdict: **`CHANGES REQUIRED`** — one defect, with the reviewer prescribing the exact minimal correction.

**The defect.** Catalog rows `capability.invoke` and `run.start` permit a human-session caller, but stated their pending expiry as "grant expiry". A human session has no grant, so the expiry was undefined and an implementer would have had to invent a fallback.

**Disposition.** Corrected exactly as prescribed: both cells now read "bound by grant expiry for an agent execution; 10m for a human session, with the entitlement rechecked at consumption." A deterministic sweep of all 30 catalog rows then confirmed zero rows with a grant-based expiry but no agent caller, zero duplicate operation rows, and zero operations without a resolved parameter schema.

**What this verdict is not.** The corrected text has not been re-read by an independent reviewer. It is claimed as sufficient because the correction is the reviewer's own prescribed wording applied verbatim to the cited cell, and because the surrounding consistency sweep is reproducible rather than interpretive. Recorded explicitly so no later reader mistakes the last edit for a reviewed sentence.

What the reviewer verdicts across all rounds establish is narrower than they may appear:

- They establish that the design contains no remaining internal contradiction and no implementer-blocking ambiguity of the authority model.
- They do **not** establish runtime behaviour, platform security, revocation latency, or cross-stack integration. Those are Q1–Q8.
- They do **not** validate the accepted authority report's empirical platform findings beyond the inputs already recorded.

Conditions on acceptance, restated so they cannot be lost:

1. S1 is the initial target. No S2 claim is made on any deployment until the S2 lane passes.
2. Jetson (`5.15.185-tegra`, no Landlock) implements identity and refuses `Isolated` guarantees.
3. `A3-T` is weaker evidence than `A3-UV` and is never represented as equivalent.
4. P3 does not imply a human ceremony where a valid bounded grant already authorizes autonomous execution.
5. Each platform claim requires its own native lane; an unsupported control disables only the affected operation.

