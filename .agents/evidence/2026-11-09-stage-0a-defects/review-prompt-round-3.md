# Round-3 independent review prompt (retained for reproducibility)

SHA-256 of this file is recorded in `.agents/evidence/2026-11-09-stage-0a-defects/README.md` and in
the status entry. The reviewer received exactly this text, with the frozen-round-3 path below.

---

You are an independent critic reviewing a frozen contract set for the Horizon project. You did not
build it and you have no stake in it being accepted. Your job is to decide whether the bytes are
**semantically correct** — not whether they parse, and not whether the prose around them sounds
right. A contract that is internally tidy and wrong is worse than an obviously broken one, because
the tidiness is what earns the trust.

## What you are reading

Contract content comes from the frozen copy:

    F/ = /home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3

Live repository source is permitted and expected whenever a contract row claims a live binding and
you need to see what the handler actually does:

    L/ = /home/sprime01/projects/Horizon-gaps

## Step 0 — verify the manifest before you read any contract content

    cd /home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3
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
   `run.start`) free of authority of their own?
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
   cannot satisfy? Is separation of duty stated where it is required, and only there?
5. **Parameter schemas, aliases and downgrade resistance.** Does each row's parameter schema name
   the fields its handler reads, with the types and nullability the wire actually carries? Can an
   alias, a parameter or a weaker schema lower an operation's class? Are the record fixtures
   consistent with the schemas they claim to exercise, including the wire names?
6. **The human-entitlement path versus the agent-grant path.** A human's authority may rest on a
   current, bounded SEA-Forge entitlement; an agent's rests on a live bounded grant. Can a human
   ever be given a grant, or an agent ever be given an entitlement? Is the artifact an entitlement
   names something another project owns and mints, with the facts needed to check currentness,
   scope, subject, issuer, epoch and expiry? Does anything in Horizon pretend to mint or define it?
7. **Unknown operations failing closed.** What happens at the live intent boundary when an
   operation reference is not in the catalog? Is there any path where an unknown, a contradicted or
   an unloadable classification becomes weaker than `Px` rather than a refusal? Does a refusal
   happen before any capability is invoked and before any record is appended?
8. **The records.** Are the field types, nullability rules and cross-field rules consistent with
   each other and with the fixtures? Does anything the contract claims to enforce live only in
   prose? Is anything a record cannot prove named as such rather than asserted?

## The sixteen findings the previous round raised

The previous independent review of the re-frozen contract set returned **REJECT**: five blocking
findings, seven must-fix findings and four advisories. Its finding list is reproduced below so you
can check that each correction is real. For each one, report **closed**, **not closed**, or
**partially closed**, with the contract citation that supports your answer. A correction that is
claimed in prose but not carried by the bytes is **not closed** — say so plainly.

1. R2-01 (blocking) A3-T had two incompatible receipt predicates: `protected_terminal_presence` was
   called the predicate and was also a claim that cannot satisfy it.
2. R2-02 (blocking) `PendingOperation`'s anti-substitution constraints were listed in prose but the
   frozen `applies_to` lists excluded the pending record, so a consumer following the contract could
   accept a human grant or an agent with no delegation.
3. R2-03 (blocking) Unknown identity-catalog operations were not gated at the live intent
   boundaries, so current-frame membership could turn an uncatalogued operation into a real write.
4. R2-04 (blocking) The governed parameter fixtures and the live wire types contradicted the
   schema: `owner_rev` was string in one file and number in the other, and a supposedly valid
   workspace-label descriptor carried entirely different fields.
5. R2-05 (must-fix) Live P0/P1 handlers used generic class schemas that did not name the fields
   they read (`operation_ref`, `expected_outcome`, `row_id`, `draft_id`, `text`, `mode`).
6. R2-06 (must-fix) The design's parameter table was not field-for-field equivalent to
   `params.yaml`; requiredness and nullability differed.
7. R2-07 (must-fix) The approval aliases were prose-only: `approval.approve` could be described
   with `resolution: "rejected"` without contradicting the catalog.
8. R2-08 (blocking) Stage 0B both executed and deferred `ask.route`, whose row is agent-executed
   and needs a bounded grant Stage 0B does not have.
9. R2-09 (must-fix) Caller authentication was incomplete — sixty-three non-Px rows resolved to no
   caller authentication — and `session.pair` claimed a local-console executor it cannot prove.
10. R2-10 (must-fix) `refused_prefixes` was checked against a field the route does not use.
11. R2-11 (must-fix) `workspace.export`'s separation of duty was internally inconsistent.
12. R2-12 (must-fix) The exceptional P2 ceremonies inherited A3-T although the design requires
    recovery-code-plus-fresh-passkey or independent administrator presence.
13. R2-13 (advisory) Candidate source locators (`route`, `code_ops`) could not be told apart from
    live bindings.
14. R2-14 (advisory) The preregistration described eight signed records where the contract has
    nine, and no preregistration pinned the final design.
15. R2-15 (advisory) The human entitlement reference had no frozen interface, so currentness,
    scope, subject, issuer, epoch and expiry could not be independently checked.
16. R2-16 (advisory) Two rules referred to data they did not encode: `human_has_no_credential`
    named a nonexistent `attempt_ref`, and `A0_OR_A1` encoded a disjunction as a conjunction.

Judge the bytes, not the account.

## What to deliver

1. **Manifest verification result** — the command, its exit status, and its output.
2. **An independent census** — the class counts, the binding counts, the schema counts, and the
   comparison between the catalog's live rows and the live routes, computed by your own scripts.
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
