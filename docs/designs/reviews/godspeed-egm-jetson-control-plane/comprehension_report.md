# Stage 6 — Comprehension Test

**Target:** `docs/designs/godspeed-egm-jetson-control-plane.md`
**Ranges:** `FeatureRange 1..236`, `DetailedRange 237..367`
**Persona:** `egm-comprehension` (naive reader)
**Reviewer status:** completed (fresh context)

## What this proposes

An interim, always-on organizational control plane — upstream Paperclip (MIT npm package) on the Jetson, run as a systemd unit under mise-managed Node, embedded PostgreSQL, telemetry off, 3 G memory cap — that hosts organization, goals, budgets and approvals as *scheduling and organizational* records only. It is joined to six existing systems by explicit identifiers rather than new stores or dashboards, and runs two loops: a repair pilot on `godspeed-growth` (fix a missing `src/scripts/hero-lattice.js` and a positioning contradiction, isolated worktree, SEA-Forge-classified, RealityTrace-evidenced, owner-approved merge) and a tax-first GTM preparation loop whose acceptance event is one owner-approved external discovery conversation. Supporting pieces: one minting authority plus a git-tracked ID map with an additive `case_id` on `agent-event/v1` and `unbound` as a first-class value; a single resource-governor state machine; a bounded Docker verification runner; an egress allowlist; a Horizon read contract. Delivery is a new top-level `control/` directory plus one `src/projections/` addition.

## How the existing system works, per this document

Horizon is the owner-facing strategic cockpit that renders intention, work, evidence, costs and owner decisions through projections; it is the only owner-facing surface. RealityTrace (`sxr`) independently holds observations, SEA-Forge is the fail-closed policy authority that classifies candidate changes and evaluates settlement (three-valued, and execution is not settlement), Gauntlet performs bounded long-horizon execution, and Cognate, DomainForge, SWE_SEED, `~/.agents`, TokenEconomizer and Context Kernel "keep their current roles". The Jetson is the only always-on host, running orinfer with Qwen3.8 Flash Next resident (~42 GiB), leaving ~14–16 GiB MemAvailable; the only live event path carries `case_id: null` in a Horizon ledger of ~1,703 records.

## Findings

**S6-1 [Blocker] Requirement IDs R2-3 … R2-14 are unresolvable.**
Scope: Open Questions; Components §1–8; target files.
The document cites R2-* as if a numbered register existed, but no register appears, is linked, or is summarized. Numbering is visibly incomplete (no R2-1, R2-2, R2-8, R2-13). The register resolves only in `.tmp/egm-integration/concepts_brief.md`, and `.tmp/` is gitignored — uncommitted scratch. A fresh implementer cannot know what "both must be specified in Increment 1" is a requirement *of*, cannot verify completeness, and cannot tell whether R2-8 or R2-13 were satisfied or dropped. Inline the register table or point at a committed path.

**S6-2 [Blocker] The "delivery-engineering vs tax-first" contradiction is never stated.**
Scope: Overview; Problem 5; Goals 2; CUJ 2; `control/loop/repair.ts`.
"Tax-first" is never defined and the contradiction itself is never written down, yet resolving it is half the pilot's acceptance and the whole GTM loop's premise. An implementing agent cannot scope a candidate to "one failing test or one single-file class of fix" for a contradiction whose two conflicting claims are unnamed. Name both claims and where they live.

**S6-3 [Blocker] Paperclip's actual interface is undefined.**
Scope: Goals 1; Components §1; `control/adapter/paperclip-client.ts`; `control/paperclip-smoke.sh`.
No documentation link, no statement of its API, CLI or data model, no definition of a "work item", no indication of how the adapter learns of one (poll, webhook, database read), and no definition of "the adapter's service identity". `paperclip-client.ts` and the smoke script's "confirm the service identity can write and other identities cannot" are unimplementable from this text.

**S6-4 [Blocker] `godspeed-growth` and `edgeai` are undefined external repositories.**
Scope: Overview; Goals 2; CUJ 2; Alternative C; target file 22.
Both are load-bearing: the pilot target, the failing suite, the positioning contradiction and the deploy pin all live in them. Neither is described (host, language, ownership, path) and no link is given, so the repair loop's acceptance cannot be interpreted.

**S6-5 [Blocker] "Settlement" and "three-valued" are never defined.**
Scope: Components §1, §8; `src/projections/control-plane-read.ts` tests.
"Settlement" carries the whole negative check ("a Paperclip approval is refused as settlement evidence") and the read contract's terminal column, yet is never defined. "Three-valued" is never enumerated. The R2-14 guard and the test oracle cannot be written without it.

**S6-6 [Major] The incumbent systems are unlinked jargon.**
Scope: Overview; Non-Goals; component map.
Cognate, DomainForge, SWE_SEED, `~/.agents`, TokenEconomizer, Context Kernel and Workbench are named once and told to keep their current roles, with no definition or link. This is load-bearing for the no-duplication argument (Alternative F "adds a sixth memory system to five existing ones"), and TokenEconomizer's "paid-model guard is off by policy rather than a hard gate" is an assertion about an undocumented mechanism.

**S6-7 [Major] Memory numbers do not reconcile.**
Scope: Problem 6; Goals 4; Components §4; `governor/state-machine.ts`.
Problem 6 says guarded at 14 GiB and ~14–16 GiB MemAvailable; the governor admits at ≥ 14.3 GiB. The published table (42 + 3 + 2 + 14 ≤ 61) sums to exactly the total, leaving zero slack, while the text claims 14–16 GiB of headroom. The governor is said to own "model-guard eviction" while the precedence rule is "never evict the model".

**S6-8 [Major] `null` versus `unbound` is ambiguous.**
Scope: Problem 2; Goals 3; `control/ids/schema.ts`; `replay.test.ts`.
`unbound` is first-class, the field "starts empty", historical records are not re-attributed, and the test asserts `case_id` "stays null/`unbound`". Whether `null` and `unbound` are one value, two states, or a migration step is undecidable, so the schema and its negative test are underdetermined.

**S6-9 [Major] The GTM acceptance event is undefined.**
Scope: Goals 5; Alternative E; CUJ 3; `control/loop/gtm.ts`.
"Qualified conversation" is the sole falsification threshold and is never defined (who qualifies, what counts, recorded where). "The discovery-recorded strategy summary" — the fallback input after the 14-day intake window — is undefined and circular.

**S6-10 [Major] Horizon-side nouns are assumed.**
Scope: Goals 6; `src/projections/control-plane-read.ts`; Alternative F.
"Horizon case", "projections" and "read contract over projections" are used as given. A fresh implementer is not told what a case is, which projections exist, who writes them, or how `blocked`/`unknown`/`denied`/`unbound` are represented. "The live Horizon ledger (~1,703 records)" never names the store or path the replay test must copy.

**S6-11 [Major] Egress enforcement is hand-waved.**
Scope: Open Questions R2-7; `control/egress/allowlist.md`.
nftables SNI rules are offered without noting that SNI inspection covers TLS-with-SNI only; nothing is said about non-TLS, QUIC or registry tarball redirects. The credential-absence check is named, not described, and it is unresolved whether the governor or a separate path enforces egress.

**S6-12 [Nit] Single-use terms.**
`sxr`, `EGM`, WarpRoom, "the register", "Twenty", "Home Assistant Yellow data-fabric rebuild" appear once each without introduction. "2M tokens advisory" does not say per candidate or how it is measured. "Increment 1" implies later increments that are never listed. `1,703` and `b7e88d9` are given without provenance.

## Self-containment verdict
Not self-contained. S6-1 and S6-2 are pure missing-definition gaps; S6-3 and S6-4 make Increment 1's first two steps unexecutable without tribal knowledge. The document reads as a decision record for the owner, not as the implementable design of record a fresh agent could act on.
