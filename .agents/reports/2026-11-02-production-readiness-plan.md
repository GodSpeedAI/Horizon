# Horizon cockpit: production-readiness plan (working record)

Date: 2026-11-02. Branch: `horizon-cockpit-projection-review` (PR #14, base `main`). Head at writing: `ad1b139`.
Status of this file: working plan, not a frozen document. Update it as classes close.

## 1. What we are doing overall

Make Horizon a trustworthy, production-ready cockpit: the operator inspects the GodSpeed environment, sees what
actions exist, starts governed operations, approves or rejects requests, and inspects what happened. Horizon is a
projection and interaction layer. It never issues a verdict, never declares external execution successful, and never
grants settlement. Authority stays with SEA-Forge, observation with RealityTrace, case and capacity records with
Cognate and Casework, and semantic compilation with DomainForge. Source of the mission: the 2026-11-02 brief v3 and
the Phase A reconciliation record in `.agents/reports/`.

Constraints that persist:
- The assistant never runs sudo, systemctl, useradd, or chown/chmod on system paths. The owner runs those.
- No pushes to `main`, no force-push, no merge of `main`. Commits and pushes only to `horizon-cockpit-projection-review`.
- Commit trailers: `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>` and the `Claude-Session` line. PR bodies end with the Claude Code attribution line.
- Never hardcode a username, home path, or UID in code, config templates, or tests.
- Spec 1.2.0 is the current frozen spec. Amendments need a new version, owner approval, a re-freeze (`scripts/freeze-formation.sh`), and a plan rebind.
- Palantir screenshots in `.tmp/palintar-screens/` are reference-only: no copy, no ship. The recon is clean-room.

## 2. Where we are

Done and pushed:
- Stages 1 and 2 (terminal accounting, reconciliation, typed approval references).
- Identity package `@godspeed/identity`, durable sessions, actor mapping for phone sessions.
- Launcher, snapshot-based verifier, insecure-mode banner, Justfile gateway recipes.
- Gateway setup applied on this machine. Services active. Runtime listens on loopback 4319.
- Operator identity is configured, not the OS account (`2223515`). Spec 1.2.0 re-frozen (`341fb7b`).
- Full suite: 449 pass, 16 skip, 0 fail (last run on `341fb7b`).

Not yet done: the classes below.

## 3. Priority order

Ordered by what each fix unblocks. A class closes when every line in it is verified, not when code is merged.

### P1. Identity and approval safety on the live path (blocks any real use)
1. Owner redeploy of the runtime (`/opt`) with stage digest `efaa982634ba275358f7bd1e10682c960dbcc0d2c0f63cdc93e325c07618170d`, then `sudo systemctl restart godspeed-horizon.service`, then `just gateway-check`. Owner runs it.
2. Verify the cockpit operator field reads the configured ref after redeploy. Verify the runtime's SEA-Forge approver equals the configured actor.
3. Socket containment. Partly verified 2026-11-02: `/run/godspeed-sea-forge` is `godspeed-sea-forge:godspeed-sock 750`, and the operator login (`sprime01`) gets "Permission denied" listing it, so it cannot reach the socket. The socket check in `just gateway-check` is still skipped because the socket is absent (the running gateway predates this install). `python3` is on PATH via mise, so the earlier "python3 missing" note was wrong. Re-check after redeploy. Also: `/var/lib/godspeed-sea-forge` is 711, not the expected 1700, so `gateway-check` reports BAD until the owner's redeploy.
4. Live approval through the deployed gateway: one request, one approve, one reject. Confirm SEA-Forge records the actor, not the runtime account.
5. Cockpit access path: confirm how the browser obtains the per-launch secret, and a sanctioned way for the owner to open the link. Currently not confirmed.
6. Decide desktop attribution: desktop commits run as the server operator with no delegated actor. Options: require the operator session, or document it as a known gap for local-only use.
7. Policy: phone-session tests use a scripted SEA-Forge. Add a live policy test with operator-role rules.

Class closes when: a live approve and reject round-trip through the gateway is recorded with the configured actor, containment is shown, and desktop attribution has a decision.

### P2. Governed approval workflow (the core operator task)
1. Approval inbox: built 2026-11-02, unit and scripted-socket tested, not yet live-verified. `GET /workspace/approvals` lists SEA-Forge's `authority_approvals` (read-only) through `listApprovals` in `src/adapters/sea-forge-approvals.ts`, validated in `src/domain/approval-inbox.ts`, and rendered by `src/ui/workspace/approval-inbox.tsx`. Decisions go through the existing `/workspace/approval`, which SEA-Forge decides. Buttons appear only for a pending approval that a Horizon commit waits on. Other pending approvals are shown as "decide it in SEA-Forge". The listing is read through the adapter, not Cognate, which is P3.1. Layout still to be checked in a browser against P8.1.
2. Stale-approval context check (T-A1 live half). By code reading it is not a gap, because approval entries are immutable. The live half is unverified: does the displayed context match the entry it resolves?
3. Layout of the inbox follows P8.1 (UI/UX). The behavior here is authoritative and does not depend on the reference.
4. Remaining settlement items: obligation-window observe shows an Observe button that returns a refusal. Hide it or make it honest.

Class closes when: the inbox approves and rejects through Cognate and SEA-Forge live, and each decision shows its SEA-Forge identity.

### P3. Architecture invariants (what makes Horizon a projection, not an authority)
1. Invariant 2: `src/adapters/sea-forge-approvals.ts` (authority socket client) and `src/adapters/realitytrace-economics.ts` (RealityTrace CLI spawn) move behind Cognate, or get a named exception with a date.
2. Horizon still computes some availability and gates in `navigation.ts` and `expectation.ts`. Separate presentation-derived availability from authoritative eligibility, and show authoritative eligibility from SEA-Forge.
3. Phone remote Chromium failure (`ERR_INSUFFICIENT_RESOURCES`). Closed as not reproduced on `ad1b139`: the E2E file passes 9/9 alone, and the full suite passes 466/0. A single full-suite run once failed with `ERR_ABORTED` on navigation to `/workspace/remote` and passed on rerun. Treat it as an intermittent flake under load, and watch it. Not skipped.

Class closes when: no Horizon module makes a verdict, and every adapter that talks to an authority is behind Cognate or has a recorded exception.

### P4. Case, capacity, and data authority (Stages 4 to 6)
1. Cognate identity branch `horizon/shared-identity` (`f4d4db6`) and the Cognate main checkout are unpushed. Cognate origin history was rewritten: check, then push only if it is safe.
2. Cognate SDK driver: port the Workbench pg0 lifecycle protections (data directory, pinned version, ownership record, refusal to replace silently). `pg0.ts` still runs bare `pg0 start --name`.
3. Typed capacity capability in Cognate over PostgreSQL: reserve and pending record share one commit.
4. Casework binding (Stage 5): `case_ref` maps to a Casework case id. The creation shape must be probed against the running service first.
5. Migration (Stage 6): resumable import with writer fencing. SQLite kept as the rollback source until reconciliation passes.

Class closes when: capacity and cases are written through Cognate, the migration reconciles, and rollback is tested.

### P5. Other products and their projection contracts
1. Gauntlet and SWE_SEED have no projection contract in Horizon. Both are read-only today. Define contracts only where a consumer needs them.
2. Workbench still uses its own approval path. Decide whether it converges on the Cognate path.

### P6. Spec and documentation hygiene
1. Stale 1.0.1 references: `AGENTS.md`, `docs/architecture.md:186`, `docs/glossary.md:154`, `.sea/interaction/README.md:5`, prereg T05 to T07.
2. Gateway policy comment in `scripts/gateway-setup.ts` (around line 381) says "without the approval option", but the rule `operator-approves` is present.
3. Keep `docs/gateway-runbook.md` in step with each redeploy.

### P7. Tooling and test debt
1. `python3` is present (3.14.4, mise shim). The earlier "missing" note was wrong. The socket check still skips, because the socket is absent until redeploy. Closed.
2. Economics live test skipped: RealityTrace's ledger export drops token fields. Enable with `HORIZON_ECONOMICS_RT_EXPORTS_EVENTS=1` once upstream carries them.
3. RealityTrace accepts undeclared questions. Upstream issue, not Horizon's.
4. RealityTrace: `~/.cargo/bin/realitytrace` is built from sxr `c239d5c`. The gateway runtime unit expects a root-owned copy at `/usr/local/lib/godspeed-horizon/bin/realitytrace`. Owner places it if RealityTrace is used.

### P8. UI/UX from the Palantir reference and Cognate Workbench (presentation only)
Scope: the Palantir material is about UI and UX. It informs layout, navigation, and interaction patterns. It does not change authority, approval logic, or architecture. Those stay in P1 to P4.

Source: `.agents/reports/2026-11-01-palantir-foundry-aifde-recon.md` and the features CSV (66 rows), with 56 public product screenshots under `.tmp/palintar-screens/` (gitignored, reference-only). The brief v3 excluded "Palantir polish and a full UI redesign." The owner now wants these patterns incorporated.

1. Operator inbox layout (workshop pattern): the layout for the approval inbox built in P2.1. Behavior comes from P2.
2. AI FDE session and ribbon patterns: how agent activity and approvals show up next to the work.
3. Object view hub and app gallery: navigation and where an operator starts. Presentation only.
4. Action wizard and submission criteria: how a governed action's eligibility is shown before submit, using SEA-Forge's authoritative state.

Second source: Cognate Workbench (`/home/sprime01/projects/cognate-workbench`, read-only donor). It has a locked design system and working approval UI:
- `DESIGN.md`: "Cognate Console" design system (Cobalt theme, modern-minimal genre, hairline surfaces, one accent, tokens). It names an exports section `tokens.css`. Adopting it is a decision, not a copy: Horizon's surfaces are different (observer navigation, not chat).
- `PRODUCT.md`: product truth and anti-references for the same owner. Read before adopting any visual choice.
- Components that match Horizon's gaps: `src/ui/GovernanceApprovalCard.tsx`, `src/ui/GovernancePane.tsx`, `src/ui/SettlementCard.tsx`, `src/ui/AmbiguousStepCard.tsx`, `src/ui/CognitiveFrame.tsx`, `src/ui/RemoteWorkspaceForm.tsx`, `src/ui/DirectoryField.tsx`, and `src/ui/app.css`. Their tests (`test/approval-bar-render.test.tsx`, `test/ui-governance-approval.test.tsx`, `test/ui-settlement.test.tsx`) show the expected states.
- Workbench's approval UI runs on its own approval path (see P5.2). Use its layout and states, not its authority wiring.
- Workbench's working tree has uncommitted screenshot changes. Do not touch them, and do not commit from that checkout.

Not included: copied screenshots, copied visual design, or any Palantir UI code. Patterns are re-expressed in Horizon's own grammar and checked against the Horizon spec. Workbench code can be reused where the owner's own work is the source, but each reuse is checked against the Horizon spec and the adapter rules.

Class closes when: the inbox and the action flow follow the chosen patterns, each screen is checked against the spec in a browser, and no screenshot or code from the reference is in the repo.

## 5. Next actions, in order (for the assistant)

1. Wait for the owner's redeploy (P1.1). Do not run privileged commands.
2. Done 2026-11-02: P3.3 (not reproduced; see the class line), P7.1 (python3 present). Full suite on the new head: 466 pass, 0 fail. `test/gateway-setup.test.ts` tamper case got a 120 s timeout; it copies the staged runtime tree, which includes `node_modules`.
3. P2.1 approval inbox built with 17 tests (domain, scripted socket, app route). Next: a browser check of `/workspace/approvals` against a local app with a scripted SEA-Forge socket (not the live gateway), then verify live once P1 closes.
4. P3.1 adapter move, after P2.1 defines the typed commands it needs.
5. P4 and P5 after the live path is verified.
