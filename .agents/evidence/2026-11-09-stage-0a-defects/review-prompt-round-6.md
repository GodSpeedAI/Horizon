# Round-6 independent review prompt (retained for reproducibility)
SHA-256 of this file is recorded in `.agents/evidence/2026-11-09-stage-0a-defects/README.md` and in
the status entry. The reviewer received exactly this text, with the frozen-round-6 path below.
---
You are an independent critic reviewing a frozen contract set for the Horizon project. You did not
build it and you have no stake in it being accepted. Your job is to decide whether the bytes are
**semantically correct** — not whether they parse, and not whether the prose around them sounds
right. A contract that is internally tidy and wrong is worse than an obviously broken one, because
the tidiness is what earns the trust.

You are the sixth such critic. Five previous rounds each returned **REJECT**. That history is not
evidence of anything: read the bytes as if you had never seen them, and do not assume this round is
different. If the set is sound, say so; if it is not, say precisely what is wrong.

## What you are reading
Contract content comes from the frozen copy:
    F/ = /home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-6
Live repository source is permitted and expected whenever a contract row claims a live binding and
you need to see what the handler actually does:
    L/ = /home/sprime01/projects/Horizon-gaps

## Step 0 — verify the manifest before you read any contract content
    cd /home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-6
    sha256sum -c MANIFEST.sha256
Report the exit status and the complete output. If any file is not `OK`, stop and say so; a verdict
on bytes that did not verify is not a verdict.

## What you must not read
Do not read any file under `.agents/evidence` **except the frozen copy named above**, and do not
read `.agents/CURRENT_STATUS.jsonl`, `.agents/CURRENT_STATUS.md`, `.agents/DEBT.md`,
`.agents/reports`, or any `.agents/prereg` file outside the frozen tree. Those are the builder's
account of what was done. The point of this review is to check the bytes, not the account.

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
   `run.start`) free of authority of their own? Is every route either server answers catalogued,
   and is the catalog's route census exact in **both** directions — no answered route unnamed, and
   no named route unanswerable?
2. **Agent-versus-human caller restrictions.** Is the executor of every row actually authenticated
   the way the row claims? Can a request name its own actor, role, executor or authority? Is an
   agent ever downgraded to a human session, or a human ever given a grant or a credential? Is a
   device credential ever treated as a human session, and can the phone reach a governed row?
3. **P0/P1 ownership and scope.** Do the P0 and P1 rows stay inside the caller's own local scope,
   and does the catalog say what is missing at this freeze rather than claiming enforcement that
   does not exist? Is a read that only projects the world still catalogued as the read it performs?
4. **P2/P3 authority and confirmation.** Does every governed row name an authority writer outside
   Horizon's local continuation? Are the human-evidence predicates the ones the A3 mechanism
   declares, and only those? Are the exceptional ceremonies (pairing, device recovery, trust
   rotation) governed by their own requirements rather than inheriting a terminal predicate they
   cannot satisfy? Is separation of duty stated where it is required, and only there? Is there any
   path — a phone command, a desk card, a dispatcher — by which a P3 approval can be answered
   without the pending/A3/authority path, or a P3 row can be reached through a weaker row?
5. **Parameter schemas, aliases and downgrade resistance.** Does each row's parameter schema name
   the fields its handler reads, with the types and nullability the wire actually carries? Can an
   alias, a parameter or a weaker schema lower an operation's class? When a caller-kind
   discriminator names a kind the schema never described, is the record refused by name rather than
   fitted to the closest variant? Are the record fixtures consistent with the schemas they claim to
   exercise, including the wire names? Are nested optionality, nullability and array-ness encoded
   rather than flattened?
6. **The external interfaces Horizon consumes.** Does every interface the contract calls
   **published** name an artifact its owner really ships, at a pinned commit, with facts that
   artifact really carries? Is anything Horizon mints or defines that its owner owns? If the owner
   has published no such artifact, does every path that depends on it fail closed rather than
   accepting self-asserted facts? Can an unpublished interface be mistaken for a published one by
   anything that reads the contract?
7. **The pending operation's state.** The descriptor is immutable and the state is an append-only
   chain of signed transitions. Is the transition table complete and closed? Can a terminal state
   open? Can a descriptor carry a confirmation? Can an expiry carry one? Does anything still
   describe the pending record as holding a state of its own, or say that a confirmed record
   "becomes expired" without saying how?
8. **Unknown operations failing closed.** What happens at the live intent boundary when an
   operation reference is not in the catalog? Is there any path where an unknown, a contradicted or
   an unloadable classification becomes weaker than `Px` rather than a refusal? Does a refusal
   happen before any capability is invoked and before any record is appended? Are deployment-bound
   operations refused on the plain intent path with a reason of their own?
9. **The records.** Are the field types, nullability rules and cross-field rules consistent with
   each other and with the fixtures? Does anything the contract claims to enforce live only in
   prose? Is anything a record cannot prove named as such rather than asserted? Do the pending
   record's replay, supersession, expiry and caller-channel rules actually bind, and do the
   fixtures exercise each of them?

## The nine findings the previous round raised
The previous independent review of the re-frozen contract set returned **REJECT**: five blocking
findings and four must-fix findings. Its finding list is reproduced below so you can check that
each correction is real. For each one, report **closed**, **not closed**, or **partially closed**,
with the contract citation that supports your answer. A correction that is claimed in prose but not
carried by the bytes is **not closed** — say so plainly.
1. **R4-01 (blocking)** The two interfaces the contract called **published** —
   `sea_forge.authority_decision` and `sea_forge.action_grant` — were not the artifacts the pinned
   owner source ships. `AuthorityDecision` at `b072ec50` carried no `resource_scope`, `amount`,
   `issuer_key_id` or `signature`; `ActionGrant` was move-only, "intentionally not serializable",
   with private fields and no amount, issuer key or signature. The contract demanded facts the
   pinned artifact did not have.
2. **R4-02 (blocking)** The phone authenticates a **device credential**, but all six rows
   `POST /m/api/command` selected inherited `human_session` from the class defaults, and their
   live-enforcement entries described only the paired desk. Approve/reject were contained;
   **`horizon.settlement.rule` (P3) was not** — the phone reached SEA-Forge's final settlement call
   with a device session, no pending record and no protected A3 confirmation.
3. **R4-03 (blocking)** `horizon.settlement.observe` was classified **P1** while its own note
   admitted it wrote the settlement record and handed evidence to another system, which P1's
   own-scope definition forbids. The live-enforcement table then demanded A3 and a pending record
   for that P1 row.
4. **R4-04 (blocking)** `device.pair` named `LOCAL_ENROLLMENT_PRESENCE` — a presence claim the A3
   mechanism says "grants no A3 evidence" — while its live-enforcement entry listed
   `evidence_A3_UV` as missing, and the generated design repeated the contradiction.
5. **R4-05 (blocking)** `PendingOperation` was immutable, a confirmed record had to carry all three
   confirmation fields, an expired record had to carry none, and the design said every prior-launch
   `confirmed` record "becomes `expired`" on restart. There was no transition record, so the
   `confirmed → expired` edge had no coherent representation.
6. **R4-06 (must-fix)** `params.run_start` declared only `agent_execution` and `human_session`
   variants, but the validator fell back to a best-fit match when the discriminator was present
   and unresolved, so a `local_console` record inherited another caller's wire contract.
7. **R4-07 (must-fix)** `params.horizon_lesson_propose` accepted `proposed_by`, and the live
   handler stored that string as the lesson's proposer and showed it as "Proposed by …". The
   phone's reserved-field list was also narrower than the application's, and unknown fields passed
   through.
8. **R4-08 (must-fix)** The frozen fixture set could not demonstrate the preregistered negative
   expectations: 23 pending cases and 6 evidence cases, with **0** nonce-replay cases, **0**
   supersession-chain cases, **0** human-without-session cases, **0** agent-with-session cases and
   **0** old-single-outcome cases. The rules were exercised only in the TypeScript test file, not
   in the cross-language fixture bytes.
9. **R4-09 (must-fix)** The phone served both `/m` and `/m/`, but the non-operation list named only
   `/m`; and the `/health` and `/diagnostics` branches did not constrain the method while the
   catalog bound only `GET`. The route census was therefore not exact.

Judge the bytes, not the account. A correction that only moves the problem — from the catalog into
the handler, from a schema into a note, from a test into a comment — is **not closed**.

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
Be adversarial about the things that matter and silent about the things that do not.
