# Stage 6 — Comprehension Test (v3) — verbatim reviewer output

Reviewer: `egm:egm-comprehension` (fresh context, model inherit), 2026-11-05. Target: `design_draft.md` v3 (sha256 `32f47582…6daa6`; snapshot `design_draft.v3.stage6-input.md`). FeatureRange 1-58, DetailedRange 59-186. No document standard.

---

## EGM Stage 6 — Comprehension Goldfish (Mode: REVIEW)

**What I read:** the persona file; the target `/home/sprime01/projects/Horizon/.agents/reports/2026-11-05-t1-authority-mediation/design_draft.md` (feature section L1-58, detailed section L59-186); both baseline files (`02-concepts-brief.md`, `04-adjudication-remaining.md`). I spot-checked these referenced sources: Horizon `src/adapters/sea-forge-approvals.ts`, `src/adapters/delegating-authority.ts`, the `src/app.ts` call sites, `scripts/` (check-boundaries and the teeth scripts), Workbench `src/capabilities/governance.ts`, and Cognate `packages/runtime-bun/src/sea-forge-authority.ts`. No document standard applies to this stage. **I found no Blockers: I could paraphrase every section.**

### What this proposes
Two products ("fronts"), Cognate Workbench and Horizon, each contain their own copy of the code that talks to the SEA-Forge authority server over its socket protocol (SFWP). Both copies lack the busy-retry and 256 KB cap that the shared Cognate SDK client `SeaForgeAuthority` already has. The design adds typed calls to that SDK client: list approvals, resolve an approval, record a closure, and decide with an optional `on_behalf_of` delegation. It releases them as Cognate 0.9.0, and both fronts switch to them and delete their own clients. Before that, sea-rs ships 0.4.0. That release renames the case-plan human task `PendingApproval` → `CaseTaskApproval` so it no longer shares a name with the escalation standing (`ApprovalStanding`), and moves the generated schemas to `sea-rs/contracts/`. 0.4.0 is deployed to the gateway before any front adopts the new client. Horizon also drops its vendored Cognate tarballs for registry pins, adds a boundary check plus a mutation script that fail on raw SFWP socket code in `src/`, and changes its preflight to say "authority: decided at invocation". Wire messages and request ids stay the same, and identity work is deferred to T2.

### How the existing system works, per this document
SEA-Forge (repo `sea-rs`) decides authority requests and records escalations that wait for a human answer. Clients send newline-delimited JSON over a Unix socket. The server dedups on request id: the same id with the same payload is a replay, and the same id with a different payload is refused as `request_id_reused`. Workbench and Horizon each send approval list/resolve calls through a hand-written `seaForgeCall`. Horizon also makes raw calls for closure, for an approval listing, and for delegated decide, where the gateway service acts `on_behalf_of` a mapped human operator. The server already binds an approval to the exact pending operation (#79), refuses self-approval, and checks `on_behalf_of` against its gateway rules. Horizon's INV-2 says all authority I/O goes through Cognate, but today that is not true.

### Findings

**1. Major — D4 (L125-129): only part of the deleted adapter's contents is given a new home.**
`sea-forge-approvals.ts` holds more than the socket code. It also has `approvalAuthorityFromEnv`/`approvalAuthority`: the `COGNATE_SEA_FORGE_OPERATOR` env contract, the "refuse to guess" startup errors, and the config-time check that the operator differs from the service. It also has the `ACTOR_ID` check of the operator id. D4 re-homes only `seaForgeActorOf` and says the regexes are "deleted with the adapter". A new reader can't tell where these guards go, or whether they survive. The Adversarial row (L157) then asserts "unknown-identity self-approval refused (Horizon `18f0c40` behaviour)" without saying where that behaviour lives after the deletion.

**2. Major — Goal 4 (L44), D4 (L129): "the regex is replaced by the typed record field" doesn't explain how untrusted input is checked.**
The `APPROVAL_ID` regex validates the `approvalId` passed into resolve, which comes from the operator's request, not from a listed record. Workbench's `validateResolve` has the same regex, and D3 doesn't mention it. The document doesn't say what now validates an `approvalId` before it is sent, or whether the SDK `resolveApproval` validates it.

**3. Major — Goal 2 (L42), D2 step 2 (L99), Negative states (L156): the escalation-standing contract and the case-task read path are missing.**
- "One live wire contract each": the case task gets `CaseTaskApproval.schema.json`, but nothing says what the escalation-standing contract is or where it lives. "`ApprovalStanding` is unchanged" doesn't say whether a schema exists for it, and the rejected alternative at L169 suggests the old `PendingApproval` schema was being used for it.
- The Negative states row requires "case-task read as standing **and vice versa** gives a typed refusal". D1 adds no SDK call that reads case tasks, so the reader can't see what code path "vice versa" exercises.

**4. Major — D2 step 5 (L108), Recovery row (L160): the rollback logic doesn't hold together.**
L146 says the new client is safe against a 0.3.x server. If so, rolling the gateway back to 0.3.x should be enough, and it isn't clear why adapters must "then" be restored, or when. "The 0.4.0 revert" (a code revert?) and "gateway back to 0.3.x" (a redeploy?) are also not clearly the same action.

**5. Major — D3 (L112, L117, L119): the Workbench instructions are ambiguous or contradict each other.**
- "Commit only `src`" conflicts with "Registry pins → exact Cognate 0.9.0", because pins live in the package manifest outside `src`.
- "The capability names, the actor checks … and the README … are all updated together" reads as if the capability names and the human-operator guards change. They are probably meant to be kept and documented together. A reader can't tell whether `governance.approvals.list`/`governance.approval.resolve` and the L132 guard survive unchanged.

**6. Major — feature section and D2/D4: PR, commit and stage references assume history the reader doesn't have.**
These are used as load-bearing steps but never described:
- PR #84 (what it is, and which "two CodeRabbit Majors")
- #81 (what the gate branch is "based before")
- #74
- Horizon PR #15 and #14 (D4 "bases on main after PR #15 is resolved"; "the state of #14 is re-verified")
- `087fecc` ("terminal-accounting")

L103 also calls the lineage disposition a "forced step before freeze" without saying what freeze is meant or why it forces the step. L174 has a one-phrase gloss for #84; the others have none.

**7. Major — Overview (L37), Non-Goals (L49): "the bar pre-agreed in D-N2" is never stated.**
Identity is the main deferred item, and the reader has to open another folder to learn what bar T2 must meet. One sentence would fix this: live gateway E2E WebAuthn + pairing round-trip before deletion, and spec amendment 1.2.0→1.3.0.

**8. Major — terms in the active scope that are never defined:**
- **protected gateway** and **owner installer** (L32, L108, L159). What is deployed, where, and by whom? The runbook is linked only by path.
- **RealityTrace**, and **`createSxrCliPort`/SXR** (L118)
- **casework-go** (L101, L169)
- **linked-versions group** / "released as the linked group" (L44, L86)
- **facade policy** (L84)
- **drift test** (L95)
- **`approvalState`** (L66)
- **`carry`** in the `decide` signature (L72)
- **"envelope-coupled id"** (L77)
- **CEP** (L56, `cep.rs`)
- **Gauntlet** (L53)
- **"teeth"** (Goal 3, L135)
- **"label"** in D5 (L140, "+ teeth + label"); it presumably means the preflight text, but that isn't stated
- **"dirty evidence in the working checkout"** (L112)

**9. Nit — D1 (L65): the name `caller` is already taken.**
In the same SDK file, `caller` already means a governed operation's principal (`operation.caller.actor`). Reusing it for a request-id prefix (`"horizon"`/`"workbench"`) invites confusion. A name like `requestIdPrefix` or `front` would read unambiguously.

**10. Nit — D1 (L66): the `listApprovals` sentence is hard to parse.**
In "`authority_approvals` has no filter …, and a client built without an `actor` sends none", the "none" refers to the actor but reads like it refers to the filter. The point of "has no filter" (that sending the actor doesn't narrow the result) is left implicit.

**11. Nit — D1 (L72), Goal 1: the shape of `onBehalfOf` isn't given.**
Today's code sends an object `{actor_id, role: "operator"}`. Because R4 makes the exact wire form load-bearing, the type of `delegation.onBehalfOf` and `resolveApproval`'s `onBehalfOf` should be stated.

**12. Nit — L37 vs L102: "exactly one visible change" appears twice with different subjects.**
L37 says the only operator-visible change is the preflight. L102 says the only wire-visible change is `get_schema`. Both are true for different audiences, but a first reader sees two "only changes". Name the audience in each.

**13. Nit — L135: the script name `teeth-t01-mutation.ts` may clash with existing numbering.**
The existing `teeth-t05…t10` scripts appear to follow a different "tNN" series than the T1/T2 transformations. Saying which series `t01` belongs to would avoid a collision.

**14. Nit — L16-17: the `app.ts:1011` call is described only as "approval listing".**
In the code it counts decided approvals as a `steering_attention` capacity amount. That differs from the inbox listing, and the reader should know so it isn't mistaken for a duplicate of the inbox.
