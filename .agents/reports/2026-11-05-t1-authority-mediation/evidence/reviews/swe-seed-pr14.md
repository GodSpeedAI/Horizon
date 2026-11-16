# Review: swe_seed PR #14 (read-only, no build/test run)

Verdict: REQUEST CHANGES (one Major, rest Minor).

## Findings

### Major
- gateway/serve.rs:599-608 `linger_close`: drain is bounded per read (1s) but not in total time or bytes. `while read() > 0` repeats as long as the peer sends at least 1 byte per second. A slow client pins a worker forever (workers are a fixed pool, serve_bounded), so a few trickling connections exhaust the pool. Scenario: attacker sends a normal request, then 1 byte/s; each connection holds a worker indefinitely. Fix: overall deadline (e.g. 1s wall clock via Instant) and byte cap (e.g. 64 KiB) on the loop.

### Minor
- gateway/routing.rs:273-285 (a): "complete" is not determined by framing. The only checks are bytes non-empty and that the post-header body parses as JSON. Content-Length, chunked termination and HEAD/204/304 are never examined (the code comment "trust close-delimited framing" is pre-existing). In practice a truncated JSON object fails parse, a reset before any byte, a timeout (WouldBlock/TimedOut), and a header-only reset (empty body) all still fail, so truncation is mostly caught. Gaps: a response whose Content-Length exceeds the bytes received but whose body is already valid JSON is accepted after a reset; a non-2xx status is not checked (pre-existing). Suggest parsing Content-Length and requiring body.len() >= CL when tolerating a reset. Also read_to_end is unbounded in size (pre-existing).
- gateway/redaction.rs:51-58 (c): good. Only io NotFound via the error chain returns the builtin policy; permission denied, parse errors and other IO errors still return Err (fail closed). Caveat: any NotFound anywhere in the chain counts (e.g. a nested include), acceptable. Behaviour change: an anyhow error with a context-only string "No such file" no longer matches, which is intended.
- tests/routing_gate.rs:20-36: two counters now (outer SEQ plus a per-site inline static); redundant but correct. The inline-block pattern repeated at 41 sites is ugly; a shared helper in a test-support module would be cleaner.
- tests/provenance_verify.rs:83: temp dir still pid-only (`swe-seed-prov-{pid}`); two tests in one process using it can still collide. Not covered by the fix.
- util.rs rel_path / (e): fine, see below.

## Checks that passed
- (d) `mode as libc::c_uint` is correct on Linux (mode_t u32) and macOS (mode_t u16, variadic promotes to int/unsigned; passing c_uint avoids E0617). Mode values fit.
- (e) context_plan.rs:94: opening with write(true) is required on Windows for SetFileTime; Unix unchanged. File is not truncated (no truncate flag). Assertion intact.
- Test temp roots: every site keeps pid and a distinct per-site prefix (checked federation_signing, render_skills_golden, doctor_json), and adds a per-site static counter (low 16 bits; nanos<<16 | seq, precedence correct: `<<` binds tighter than `|`). Unique per process and per call; across processes pid separates. Counter wraps at 65536 calls, irrelevant. Only deletions in tests are the as_nanos lines; no assertion weakened. The serve test client now keeps partial reads and appends a "[read error]" marker; assertions still need the expected content, so not weakened.
- util::rel_path: Unix output identical to the old to_string_lossy version (strip_prefix fallback to whole path preserved; harness_validate previously used display(), equivalent for valid UTF-8). Windows replaces backslashes with '/'. Unit tests only meaningful on Windows for the slash case (on Unix they pass trivially).
- Workflow: macos-15-intel (x86_64) and macos-15 (arm64) are valid GitHub-hosted labels; macos-13 and macos-14 retirement matches the notes. checkout@v5 exists (Node 24 runtime). macos-15-intel is available only until the Intel runner sunset (announced for ~Aug 2027), worth a note.

# Round 2 (ed96e50..7481c0d)

Verdict: APPROVE (one Minor to fix, optional).

- (a) linger_close (serve.rs:599-629): bounded by a 400 ms wall-clock deadline (remaining time re-armed as the read timeout each iteration) and a 64 KiB cap; any error/EOF breaks. A trickling peer pins a worker at most ~400 ms. The Major from round 1 is resolved; new test asserts < 1.5 s against a 50 ms trickle.
- (b) response_complete_by_framing / chunked_body_ended (routing.rs:358-427): Content-Length requires body.len() >= n; chunk extensions (split on ';'), trailers after the zero chunk (loop to empty line), invalid hex, missing CRLF, bare headers, and close-delimited all behave as intended (false unless provably complete). No-body statuses and HEAD return true; chunked takes precedence over Content-Length. Minor: `size + 2` at ~line 417 can overflow for a hostile chunk size near usize::MAX (debug build panics; release wraps and can wrongly accept). Use `size.checked_add(2)` and return false on None. Also `from_str_radix` accepts a leading '+', and the CRLF after chunk data is not verified. Residual, unchanged: the post-reset path still JSON-parses the raw body, so a chunked response fails to parse anyway (tolerance is harmless, not harmful).
- (c) tests/common/mod.rs `unique_temp_path`: pid + process-wide AtomicU64 + nanos; unique per process and call, no truncation. Duplicate file in crates/swe-seed/tests/common is byte-identical. No assertion lines removed in the diff (grep of removed lines found none). provenance_verify pid-only name from round 1 is gone in the diff stat.
- (d) convergence_t01/t04/t06/t07 `tmp_dir(tag)` = `swe-seed-tNN-{tag}-{pid}`, with remove_dir_all on entry. Collision requires the same tag used by two tests in one binary running in parallel. I checked every tmp_dir/adjudicator/upstream/emit_from_real_chain call: no tag is repeated within any of these files (t07 "drift" vs "verbatim"/"failed-proof"/"authority" are distinct), and each file has its own tNN prefix. So no collision today; it is a latent hazard (a reused tag would let one test delete another's live ledger) and should move to unique_temp_dir. Minor, not blocking.
