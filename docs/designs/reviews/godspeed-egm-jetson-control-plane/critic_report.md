# Stage 7 — Critic Review

**Target:** `docs/designs/godspeed-egm-jetson-control-plane.md`, `FeatureRange 1..236`
**Personas:** `egm-design` (feature-spec-standard), `egm-structural` (feature-spec-standard), `egm-style` (no standard)
**Reviewer status:** `egm-design` completed · `egm-structural` completed · `egm-style` completed

## Design Critic (`egm-design`)

**S7D-1 [Blocker] Alternative B misstates the integration register — the rejection rests on disprovable facts.**
Scope: L193–197 vs `.agents/reports/horizon-product-integration-register.yaml:37–52`.
"roughly 4,800 commits of divergence from upstream" — the register says "Fork of paperclipai/paperclip (about 4,800 commits) plus 3 owner Bun-migration commits"; divergence is 3 commits, 4,800 is inherited history. "a Bun migration that Horizon's own integration register warns against" — the register warns against forking core to fit Horizon (`REQ-STACK-014`) and sets a conditional retirement test; it does not warn against the Bun migration. "the register's disposition … follows its own retirement rule" — the disposition is `join_product`, `wave: second`, target `queryable, then actionable`, joined one-way via MCP/REST. **Recommendation:** restate the rejection on the actual grounds (owner pinned upstream; a 3-commit fork is not a substitute for a pinned release) and separate "out of the interim control plane" from "no Horizon join", which the register still requires.

**S7D-2 [Blocker] The mandatory-alternatives rule is satisfied only for the product choice.**
Scope: L185–233.
Alternatives exist for Paperclip yes/no, the fork, pilot target, auto-merge, GTM scope, new surfaces, HomeStation. There are **no alternatives** for the load-bearing decisions: one minting authority for case IDs versus reusing SEA-Forge or Horizon identifiers; git YAML as recovery source of truth versus a Postgres dump/export; the egress mechanism (proxy versus nftables, listed only as an open question); approval precedence.

**S7D-3 [Blocker] The 30-day falsifier still cannot fire; the 14-day fallback has no exit criterion.**
Scope: L32, L76, L140 vs `.tmp/egm-integration/concepts_brief.md` R2-9/R2-10.
R2-10 states the clock must start at **research-bundle intake**; the document keeps "30 days of the *first approved outreach*", and L140 forbids requesting outreach approval until the bundle lands. Never approve → clock never starts → CUJ 3 passes vacuously. "with its own exit criterion" (L32, L140) names no criterion, and "qualified conversation" remains owner-judged self-attestation.

**S7D-4 [Blocker] Approval and case-ID authorities conflict with the frozen spec.**
Scope: L30, L34, L70, L136–137, L147, L165; spec `REQ-CASE-001`, `REQ-UX-007`, `REQ-NAV-010/011`.
"One component mints case IDs" plus `ids/map.yaml` makes a Case a minted entity with its own registry, while `REQ-CASE-001` requires a derived view. "the owner approves the merge in Horizon" (L70) and Paperclip holding approvals conflict with `REQ-UX-007`, which makes approvals SEA-Forge records under the approver's identity and forbids local approval state. Goal 7 contradicts the register's "WarpRoom's board approvals and budgets stay authoritative inside WarpRoom", and no precedence is given between a SEA-Forge grant and a later resource-governor refusal, or between Paperclip budget exhaustion and the `REQ-NAV-008/009` payment gate.

**S7D-5 [Blocker] The dispatch adapter's single-write-path claim has no enforcement.**
Scope: L135, L266.
"Paperclip is writable only by the adapter's service identity (R2-14)" is a statement about a system the design does not control, and `paperclip-client.ts` is a client, not an authorization boundary. Without an enforcement mechanism (database role, socket ownership, or Paperclip's own auth), the adapter is advisory. R2-14 identified exactly this defect class.

**S7D-6 [Blocker] No consolidated Risks & Limits section (standard-mandatory).**
Scope: whole range; no Risks heading exists between L9 and L235.
Mitigations are scattered across Goals, NFRs and Open Questions. Absent: single-point-of-failure analysis (the Jetson is the only always-on host; one OOM or thermal event kills control plane, cockpit and repair loop together, and a governor on the same host is not a remedy), accepted-outage/RTO statement, and Paperclip operational cost.

**S7D-7 [Major] The two-host verification path is unspecified and contradicted.**
Scope: L31, L70, L138.
"the workstation" is never named; HomeStation — the only candidate — is described as offline (L11, Problem 1). No transport, no ownership, no authority for the SHA256 pin (who compares), no transfer budget, and the path is outside both the memory table and the egress allowlist. CUJ 2's acceptance depends on it.

**S7D-8 [Major] Egress and credential control is committed in Goals but undesigned, and internally inconsistent.**
Scope: L31, L52, L64, L179.
R2-7 is still an open question, yet $0 spend is a Goal and CUJ 4 requires a recorded egress refusal. CUJ 2 requires pushing a branch and opening a PR, so repository write credentials must be reachable from the Jetson, which contradicts "no paid or subscription credential is reachable" as written; the document never separates spend credentials from repository credentials, and an allowlisted GitHub with a token permits device-flow issuance of new credentials.

**S7D-9 [Major] SEA-Forge and RealityTrace transport unnamed.**
Scope: L107–128, L159, L182.
The "gate" arrow has no transport or host. `.agents/DEBT.md` records that only invocation-time authorization is reachable through Cognate's socket adapter, so "SEA-Forge classifies the change" needs a stated invocation path and a fail-closed state when the Jetson is thermally held or the model is evicted.

**S7D-10 [Major] Acceptance events are partly unmeasurable.**
Scope: L62–88, L180.
CUJ 1 "Horizon shows the organization as *observed*" gives no command and no evidence path. CUJ 2 "the public claims are consistent" gives no rule for detecting the positioning contradiction. "30 minutes wall clock … owner gate excluded" has no start/stop instrumentation. "2M tokens **advisory**" is not a ceiling, while Problem 3 claims ceilings are enforced. 10 candidates/day has no owner or evidence path.

**S7D-11 [Nit] Node is bounded below, not pinned.**
Scope: L28, L134, L321 vs Goal 1's "pinned by exact version".
"Node ≥ 24.11" plus "25.9.0 already installed" is not a reproducible environment and may exceed tested support. Unverified from the repository: the 25.9.0 claim, the Paperclip npm pin, the ~1,703-record count, ARM64 embedded PostgreSQL behaviour.

**S7D-12 [Nit] Alt A/D/E rejection reasons are authority or unquantified.**
Scope: L191, L208, L215.
"owner pinned upstream" is a decision, not a documented technical rejection; "would take months" and "not reversible in practice" carry no evidence.

**S7D-13 [Nit] Novelty overstated for `unbound`.**
Scope: L30, L136, L165.
`src/economics/model.ts:84,392` already treats `case_id: null` as `unbound`; the design should say it extends an existing state rather than introducing one.

## Structural Validator (`egm-structural`)

Verified clean: heading levels never skip (H1 → H2 → H3 → H4); CUJ 1–5 (L60, 66, 72, 78, 84) and Alternatives A–H (L187–229) are self-similar; both fences (L95/130, L146/163) are closed and tagged `text`; every box row in the component map has borders at consistent columns; no stray characters in either block.

**S7S-1 [Blocker] Missing "Risks & Mitigations".**
Scope: whole document; no H2 between L9 and L185 covers it.
The standard requires failure modes, security implications, scalability limits and mitigation. The only occurrence of "risk" in 236 lines is "no external risk" (L213) inside an alternative. NFRs (L179–182) are obligations, not risks.

**S7S-2 [Blocker] R2-* identifiers used but never defined in-document.**
Scope: L48–55, 104, 112, 134, 136, 172, 266, 271, 286, 291, 301, 306, 316, 326.
`R2-3`…`R2-14` carry the document's load-bearing constraints with no definition, table or link. They resolve only in `.tmp/egm-integration/concepts_brief.md`, which `git check-ignore` reports as ignored via `.gitignore:25`. `R2-1`, `R2-2`, `R2-8`, `R2-13` are never referenced and the gap is unexplained.

**S7S-3 [Major] Open Questions contradict mandatory Increment 1.**
Scope: L46–55 vs L172, L266–331.
L48 says both must be specified in Increment 1 *or* the Horizon view moves later; L172 says both *are* Increment 1 items. Items at L49, L51, L53, L54 are posed as open yet already committed as deliverables (L271, L316, L301, L266). `R2-12` is used at L291 but absent from the open list; `R2-8`/`R2-13` are absent entirely.

**S7S-4 [Major] Three admission-floor values.**
Scope: L24, L31, L137, L286.
"guarded at 14 GiB" / "≥14G guard ≤ 61G" / "MemAvailable ≥ 14.3 GiB". L24 also states the usable window is ~14–16 GiB, so a 14.3 floor leaves ≤1.7 GiB margin that is never published. One floor must be normative and the table re-derived from it.

**S7S-5 [Major] The two diagrams do not describe the same graph.**
Scope: L95–130 vs L146–163.
The component map terminates the chain at the ID map (L126) and never draws SEA-Forge → Horizon settlement or RealityTrace → Horizon evidence; the identifier chain ends at the read contract. The map feeds Horizon upward from the dispatch column (L103–104), while L141 says Horizon reads projections. The map has no box for the governor, verification runner, repair loop or GTM workstream; the numbered list has no entry for SEA-Forge, Gauntlet, RealityTrace or Cognate. Two unsynchronised representations of one architecture.

**S7S-6 [Major] Section ordering and level for the required areas.**
Scope: L91, L185, L353.
`### Verification Plan` is nested under `## Detailed Implementation Plan` rather than being a peer of `Alternatives Considered`. The architecture area is titled `Technical Plan (Architecture)`, so "Proposed Architecture" has no named section. L353 forward-references `just gate-control` (L360), which does not exist in the `justfile`.

**S7S-7 [Major] Status header incomplete for a design of record.**
Scope: L3–5.
`Status: Draft` coexists with seven owner decisions dated 2026-11-01 asserted as settled (L11, 15, 191, 197, 203, 209, 215). No version, no revision history, no approving signature or evidence link, and the author line fuses the accountable human with a tool session.

**S7S-8 [Major] No success metrics.**
Scope: absent.
Goals (L28–34) and CUJ "Then" clauses (L70, 76, 82, 88) are prose; the Verification Plan lists commands, not thresholds a reviewer can adjudicate.

**S7S-9 [Nit] Alternatives symmetry breaks at F and H.**
L217 bundles two decisions ("or adopt Twenty first"); L229 bundles a host move with a data-fabric build. Their Pros/Cons cannot be attributed per option.

**S7S-10 [Nit] Diagram-1 arrow semantics.**
The `<-->` gate between Paperclip and SEA-Forge (L108) contradicts "one-directional" (L135). L97 places annotation text in the same column as the vertical bar; an arrowhead drives into a solid border at L99 with no junction while the parallel case uses `+`. Arrow glyphs are mixed (`->` at L156, 162 vs `→` at L70).

**S7S-11 [Nit] Enumerations and lists inconsistent.**
Numbered enumerations (L28–34, 134–141, 169–175) sit beside bulleted peers (L38–44, 48–55, 179–182) for no stated reason; alternatives use letters A–H while target files use `#### 1.`–`#### 22.`.

**S7S-12 [Nit] Unfulfilled artifact fields and undefined terms.**
The `ID-ownership table` is promised (L136, L271) but never appears; `WarpRoom` (L195) and the positioning contradiction have no definition.

## Style Editor (`egm-style`)

**S7Y-1 [Blocker] Numeric constraint stated in three incompatible values.**
Scope: L24, L31, L137, L286.
"leaves ~14–16 GiB MemAvailable, guarded at 14 GiB" vs "≥14G guard" vs "MemAvailable ≥ 14.3 GiB". The table also expresses the guard as an upper bound while the state machine expresses it as a lower bound. An implementing agent cannot tell which value is normative or which way the inequality runs.

**S7Y-2 [Blocker] The Goal 5 acceptance event has no measurable predicate.**
Scope: L32, L76, L215, L361.
"one scoped, owner-approved discovery conversation"; "no qualified conversation within 30 days". "Qualified" is never defined; "scoped" is never quantified. The one falsifier meant to stop the loop from running forever is itself unfalsifiable.

**S7Y-3 [Blocker] `case_id` state collides with itself.**
Scope: L30, 136, 165, 281.
"`unbound` as a first-class state"; "assert `case_id` stays null/`unbound`"; "the additive field starts empty". Three words for one condition, so the replay test's assertion is literally ambiguous.

**S7Y-4 [Blocker] Same word, two objects: "case".**
Scope: L20 vs L141, 147, 150.
Six entities are named as needing joins; the design supplies one new field plus a run correlation ID. "Cognate assignment" is never mentioned again and no identifier is defined for observation or settlement. The diagram claims the full join while the field list cannot express it.

**S7Y-5 [Blocker] An unresolved open question is asserted as an existing mechanism.**
Scope: L179 vs L52.
"the egress allowlist is a named mechanism with a credential-absence check" while the mechanism selection is still open. Same pattern at L181: "a documented uninstall plus restore drill exists" — existence asserted, owner and path unnamed.

**S7Y-6 [Blocker] The Verification Plan references an undefined gate and an unverified invariant.**
Scope: L359–361.
`gate-control` is defined nowhere in the reviewed scope; the spec-hash claim is an argument, not a check, and no command verifies it.

**S7Y-7 [Major] Hyperbole presented as requirement.**
Scope: L34.
"Approval precedence that cannot be shadowed." The one mechanized test (a Paperclip approval is not settlement) is tested only by an unnamed "negative check"; the absolute framing adds rhetoric instead of scope.

**S7Y-8 [Major] Marketing register in the framing.**
Scope: L11, 15, 19.
"always-on surface", "approval-ready campaigns", "executed into" (no agent named). "Always-on" has no uptime or watchdog definition, and the Jetson's availability is exactly what the governor caveats.

**S7Y-9 [Major] "control plane" / "cockpit" / "surface" / "dashboard" / "console" name overlapping things without definition.**
Scope: L11, 19, 100, 134, 141, 220.
"Control plane" is Paperclip; "control surface" is the missing thing; "cockpit"/"console"/"dashboard" are the prohibited things; "surface" is also Paperclip's non-canonical UI. A fresh implementer cannot tell whether "control surface" in Problem 1 means "control plane" in the Goals.

**S7Y-10 [Major] "evidence" / "observation" / "settlement" used interchangeably.**
Scope: L13, 33, 134, 156, 159, 182.
"evidence" names a RealityTrace record, a gate artifact and a category; "settlement evidence" — the design's central prohibition — is defined only by negation at L134.

**S7Y-11 [Major] State vocabulary introduced once and never defined.**
Scope: L64, L141.
"Horizon shows the organization as *observed*, not *assumed*" appears nowhere in the state list (`blocked` / `unknown` / `denied` / `unbound`).

**S7Y-12 [Major] The no-new-systems claim is contradicted by the component list.**
Scope: L13 vs L134–141.
"No new task, execution, evidence, memory or dashboard systems" sits beside a new dispatch adapter, ID authority, governor and verification runner. The sentence is true only because the negation list omits them; as written it reads as "no new components".

**S7Y-13 [Major] Approximations inside a numeric-constraint document.**
Scope: L24, 138, 180, 196.
"~14–16 GiB", "2–3G", "~50 tok/s", "≈42G … ≤ 61G", "roughly 4,800 commits" mix approximations with exact values (`14.3`, `61`, `100 GiB`, `85 °C`) with no rule for which are normative. `2–3G` is a range used as an enforcement cap.

**S7Y-14 [Nit] Hedges and unowned passives.**
Scope: L165, 181, 208, 239.
"in practice"; "must pass before the first release is called accepted" (agent unnamed); "the pilot's track record exists" (no threshold).

**S7Y-15 [Nit] Advisory limit with no consequence.**
Scope: L31, L180.
"2M tokens advisory" and "10 candidates per day": "advisory" leaves enforcement unspecified, and the governor's refusal list does not include a token budget, so the constraint's status is undefined.
