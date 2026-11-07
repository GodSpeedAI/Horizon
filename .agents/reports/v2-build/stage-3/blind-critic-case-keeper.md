1. **Major — `dry_run` bypasses replay protection on unrelated verbs.**  
   [crates/sea-forge-server/src/lib.rs:2477](/home/sprime01/projects/sea-rs-horizon/crates/sea-forge-server/src/lib.rs:2477)  
   `dedupe_key` trusts the raw `dry_run` field without checking the request variant. Send `case_commit` with `dry_run: true` and a previously completed `request_id`: deserialization ignores that unknown field, deduplication is skipped, and the handler creates another case. Changing the payload also bypasses `request_id_reused`.

2. **Major — add-item checks one plan, then reloads and commits another.**  
   [crates/sea-forge-server/src/sfwp/case_mutations.rs:265](/home/sprime01/projects/sea-rs-horizon/crates/sea-forge-server/src/sfwp/case_mutations.rs:265)  
   Request A previews adding X to plan P and passes its precondition. Before A calls `propose_item_with`, request B adds Y. A then reloads P+Y and commits P+Y+X without checking its digest. A stale confirmation succeeds. No lock spans preview, comparison, and mutation.

3. **Major — case commit reloads the template after checking its digest.**  
   [crates/sea-forge-server/src/lib.rs:3402](/home/sprime01/projects/sea-rs-horizon/crates/sea-forge-server/src/lib.rs:3402)  
   The resolver validates template A and its instantiated items. An editor replaces the template before `instantiate_plan_file` loads it at line 3767. The server then commits template B using A’s accepted precondition. The checked plan is discarded rather than passed into the commit path.

4. **Major — dry runs and stale rejections commit authority records.**  
   [crates/sea-forge-case-runner/src/case_ops/mod.rs:290](/home/sprime01/projects/sea-rs-horizon/crates/sea-forge-case-runner/src/case_ops/mod.rs:290)  
   `preview_item` calls `mediation::authorize_read`, which commits `authority_policy`, `authority_evidence`, and `authority_decision` records and rebuilds authority mirrors. Every valid dry run therefore writes durable state. Add-item preconditions are evaluated afterward, so even a `rejected_as_stale` request performs these writes. The new test checks only the case plan and case-events file.

5. **Major — preflight can return a digest for a different plan than it displayed.**  
   [crates/sea-forge-server/src/sfwp/case.rs:273](/home/sprime01/projects/sea-rs-horizon/crates/sea-forge-server/src/sfwp/case.rs:273)  
   Preflight builds its displayed items from one template read, then `plan_digest_source` independently reloads the template. If A becomes B between those reads, the reply displays A with B’s digest. Confirming that reply commits B successfully, although B was never displayed. This can happen even without a race during commit.

6. **Major — overview attaches a newer digest to older displayed state.**  
   [crates/sea-forge-server/src/lib.rs:3279](/home/sprime01/projects/sea-rs-horizon/crates/sea-forge-server/src/lib.rs:3279)  
   `get_overview` reads case and plan projections before `current_record_digest` reads the ledger. Another writer can add an item between those operations. The response then contains the old item count and the new ledger digest. An approval submitted with that digest passes the case precondition despite the operator having reviewed the older state.

7. **Minor — dry-run `item` differs from the item actually stored.**  
   [crates/sea-forge-server/src/sfwp/case_mutations.rs:277](/home/sprime01/projects/sea-rs-horizon/crates/sea-forge-server/src/sfwp/case_mutations.rs:277)  
   The reply serializes the original item, while its digest covers the normalized preview plan. For a sandboxed task without `sandbox_class`, validation inserts `"local"` into the stored item but the reply omits it. Likewise, `depends_on` is converted into sentries in storage but remains unconverted in the preview item.

8. **Minor — some changed plans produce validation errors instead of stale rejection.**  
   [crates/sea-forge-server/src/sfwp/case_mutations.rs:258](/home/sprime01/projects/sea-rs-horizon/crates/sea-forge-server/src/sfwp/case_mutations.rs:258)  
   Preview adding X, then let another request add X. Confirming the original preview fails duplicate-ID validation inside `preview_item`, before evaluating the supplied precondition. The client receives a plan-schema error instead of the promised `rejected_as_stale`, bypassing its stale-state recovery branch.

Canonicalization, parameter defaults, and field ordering: no additional concrete defect found.

Old stored-plan hashes: no concrete regression found.

Skipped authority/actor checks: no new bypass found.

Information leaks in new reply fields: no concrete defect found.

Static inspection only; tests were not run.