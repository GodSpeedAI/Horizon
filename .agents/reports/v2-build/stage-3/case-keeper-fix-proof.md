# Case keeper blind-critic fixes: proof (2026-11-07)

Commit `6e8b6aff` on `feat/horizon-desk-support`. Coordinator rerun under the build lock:

```
test result: ok. 21 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.09s
test result: ok. 23 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 19.79s
gen=0
0
test add_item_dry_run_and_stale_rejection_write_no_authority_records ... FAILED
test add_item_dry_run_returns_the_item_as_it_will_be_stored ... FAILED
test add_item_duplicate_after_preview_is_stale_not_a_validation_error ... FAILED
test add_item_concurrent_confirmations_of_one_preview_commit_once ... FAILED
test dry_run_field_on_another_verb_does_not_skip_replay_protection ... FAILED
```

Lines 1-2: `conformance_case_authoring` (21) and `conformance_sfwp` (23) pass on the fix. `gen=0` with 0 changed files: contracts unchanged. The last block is the new `conformance_case_authoring.rs` run against the parent commit `cefa10a1` (before the fix): 5 of the new tests fail there, so they detect the defects.
