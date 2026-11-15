# Round-4 independent review prompt (retained for reproducibility)

SHA-256 of this file is recorded in `.agents/evidence/2026-11-09-stage-0a-defects/README.md` and in
the status entry. The reviewer received exactly this text, with the frozen-round-4 path below.

---
You are an independent critic reviewing a frozen contract set for the Horizon project. You did not
build it and you have no stake in it being accepted. Your job is to decide whether the bytes are
**semantically correct** — not whether they parse, and not whether the prose around them sounds
right. A contract that is internally tidy and wrong is worse than an obviously broken one, because
the tidiness is what earns the trust.

## What you are reading

Contract content comes from the frozen copy:

    F/ = /home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4

Live repository source is permitted and expected whenever a contract row claims a live binding and
you need to see what the handler actually does:

    L/ = /home/sprime01/projects/Horizon-gaps

## Step 0 — verify the manifest before you read any contract content

    cd /home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4
    sha256sum -c MANIFEST.sha256

Report the exit status and the complete output. If any file is not `OK`, stop and say so; a verdict
on bytes that did not verify is not a verdict.

## What you must not read

Do not read any file under `.agents/evidence`, `.agents/CURRENT_STATUS.jsonl`,
`.agents/CURRENT_STATUS.md`, `.agents/DEBT.md`, `.agents/reports`, or any `.agents/prereg` file
outside the frozen tree. Those are the builder's account of what was done. The point of this review
is to check the bytes, not the account.

Write no files and make no repository change. Do not run the repository's own check scripts as
evidence for your findings: write your own independent checks, in your own scripts, and report what
they print.

## What to review

Read the whole frozen contract set — `design_draft.md`, every file under `F/contracts/identity/v1/`,
and the preregistrations inside `F/.agents/prereg/horizon/` — and decide whether it says one thing
and means it. In particular:

1. **Operation definitions and handler mappings.** Does every catalog row name the handler that
   really serves it? Is the operation's class consistent with its semantics (effect, reversibility,
   external commitment, data sensitivity, amount)? Are the dispatcher rows (`capability.invoke`,
   `run.start`) free of authority of their own? Is every route the remote phone server actually
   serves catalogued, including the pairing and device-enrollment ceremonies?
2. **Agent-versus-human caller restrictions.** Is the executor of every row actually authenticated
   the way the row claims? Can a request name its own actor, role, executor or authority? Is an
   agent ever downgraded to a human session, or a human ever given a grant or a credential?
3. **P0/P1 ownership and scope.** Do the P0 and P1 rows stay inside the caller's own local scope,
   and does the catalog say what is missing at this freeze rather than claiming enforcement that
   does not exist?
4. **P2/P3 authority and confirmation.** Does every governed row name an authority writer outside
   Horizon's local continuation? Are the human-evidence predicates the ones the A3 mechanism
   declares, and only those? Are the exceptional ceremonies (pairing, device recovery, trust
   rotation) governed by their own requirements rather than inheriting a terminal predicate they
   cannot satisfy? Is separation of duty stated where it is required, and only there? Is there any
   path — a phone command, a desk card, a dispatcher — by which a P3 approval can be answered
   without the pending/A3/authority path, or a P3 row can be reached through a weaker row?
5. **Parameter schemas, aliases and downgrade resistance.** Does each row's parameter schema name
   the fields its handler reads, with the types and nullability the wire actually carries? Can an
   alias, a parameter or a weaker schema lower an operation's class? Are the record fixtures
   consistent with the schemas they claim to exercise, including the wire names? Are nested
   optionality, nullability and array-ness encoded rather than flattened?
6. **The human-entitlement path versus the agent-grant path.** A human's authority may rest on a
   current, bounded SEA-Forge entitlement; an agent's rests on a live bounded grant. Can a human
   ever be given a grant, or an agent ever be given an entitlement? Is the artifact an entitlement
   names something another project owns and mints, with the facts needed to check currentness,
   scope, subject, issuer, epoch and expiry? Does anything in Horizon pretend to mint or define
   it? If the owner has published no such artifact, does every path that depends on it fail closed
   rather than accepting self-asserted facts?
7. **Unknown operations failing closed.** What happens at the live intent boundary when an
   operation reference is not in the catalog? Is there any path where an unknown, a contradicted or
   an unloadable classification becomes weaker than `Px` rather than a refusal? Does a refusal
   happen before any capability is invoked and before any record is appended? Are deployment-bound
   operations refused on the plain intent path with a reason of their own?
8. **The records.** Are the field types, nullability rules and cross-field rules consistent with
   each other and with the fixtures? Does anything the contract claims to enforce live only in
   prose? Is anything a record cannot prove named as such rather than asserted? Do the pending
   record's replay, supersession, expiry and caller-channel rules actually bind, and do the
   fixtures exercise each of them?

## The ten findings the previous round raised

The previous independent review of the re-frozen contract set returned **REJECT**: six blocking
findings and four must-fix findings. Its finding list is reproduced below so you can check that
each correction is real. For each one, report **closed**, **not closed**, or **partially closed**,
with the contract citation that supports your answer. A correction that is claimed in prose but not
carried by the bytes is **not closed** — say so plainly.

1. **R3-01 (blocking)** The live remote router was absent from the catalog: `POST /m/api/pair/finish`
   performed credential registration and device replacement while `device.pair` claimed no
   repository route performs enrollment, and `POST /m/api/command` dispatched `open_case`,
   `commit`, `approve`, `reject` and `settle` with an approval path that invoked the live SEA-Forge
   resolver without the operation-bound pending/A3-UV contract.
2. **R3-02 (blocking)** `/desk/decide` downgraded a P3 approval to a P2 lesson row: the catalog
   mapped the whole route to `lesson.decide`, while the handler dispatched by server-side card
   kind, and the catalog's schema did not permit the live `choice: "accept"`.
3. **R3-03 (blocking)** Deployment-bound operations bypassed the catalog's minimum-P2 rule: live
   classification returned `allowed: true` for every identity-catalog-unknown deployment binding,
   and the binding preparation checked payment and settlement access but not the identity
   contract's pending confirmation, caller authority or A3 evidence.
4. **R3-04 (blocking)** `PendingOperation` did not make caller channels mutually exclusive: a
   human record could lack any session binding, and an agent record could simultaneously name a
   human session, because no single cross-field constraint stated the exclusive choice.
5. **R3-05 (must-fix)** The human-grant rule made `grant.revoke` impossible: `human_has_no_grant`
   refused any descriptor carrying `grant_ref` in its parameters, although there `grant_ref` is the
   identifier of the grant being revoked — a target, not authority held by the human.
6. **R3-06 (must-fix)** Parameter contracts still contradicted both handlers and the design:
   `surface.blocks` was declared an object where the handler requires an array; question `options`
   was declared a nullable required object where the handler accepts an absent array; surface
   `title`, annotation `tone` and panel `title` were required-nullable where the live types make
   them optional and reject null; and the generated design table dropped nested nullability.
7. **R3-07 (blocking)** The evidence outcome had two incompatible meanings: the design recorded
   effect outcome as `none | uncertain | committed` while `EvidenceRecord.outcome` permitted only
   `observed | failed | refused`.
8. **R3-08 (blocking)** The external-authority path was not independently authenticatable: the
   entitlement interface was `specified_not_published` and said its path must fail closed, yet a
   fixture expected a decision backed by that unpublished interface to be valid using
   self-asserted facts with no owner signature, key identifier or trust-chain evidence; and
   `subject_ref` bound to a field no entitled record kind had.
9. **R3-09 (must-fix)** Pending replay and terminal-state rules were incomplete:
   `nonce_not_reused` and `supersedes_chain` excluded `PendingOperation`, and the
   confirmation-field rule said nothing about the `expired` state.
10. **R3-10 (must-fix)** `horizon.health` was not the single anonymous operation the catalog
    claimed: the catalog described `/health` as anonymous public liveness exposing no identity,
    counts or versions, while the live handler returned the deployment profile, operator
    reference, semantic world, research state and transports to a paired caller, and the catalog
    had no authenticated detailed-health operation.

Judge the bytes, not the account.

## What to deliver

1. **Manifest verification result** — the command, its exit status, and its output.
2. **An independent census** — the class counts, the binding counts, the schema counts, the route
   and dispatcher counts, and the comparison between the catalog's live rows and the live routes,
   computed by your own scripts.
3. **A closure table** — one row per finding above: finding, closed / not closed / partially
   closed, and the contract citation that supports your answer.
4. **Numbered findings** — every defect you found, whether or not it was in the previous round.
   For each: severity (**blocking** / **must-fix** / **advisory**), the contract or source
   citation, why it is wrong, and the smallest correction that would fix it. Be concrete: a finding
   that cannot be acted on is not a finding.
5. **Final verdict** — **ACCEPT** or **REJECT**, with one paragraph of reasoning. ACCEPT means the
   contract set is semantically correct and internally consistent enough to freeze and build
   against; REJECT means it is not, and the numbered findings say why.
6. **Limits** — what you did not read, did not run, did not test, and could not verify.

Be adversarial about the things that matter and silent about the things that do not. If the set is
sound, say so; if it is not, say precisely what is wrong.
