# swe_seed native-candidate: green on all 5 targets

Final run 42153072929 (head = last commit on PR #14): all success. Linux x86_64, Linux aarch64, macOS x86_64 (macos-15-intel), macOS aarch64 (macos-15), Windows msvc, SHA256SUMS. 5 CI rounds used of 6.

## Root causes and commits (after d0b86c6)
1. 1b6a70c - macOS compile E0617: openat mode passed as mode_t (u16 on macOS) through a variadic; now c_uint. Windows: load_redaction detected a missing config by the English text "No such file", but Windows returns os error 3; now checks io::ErrorKind::NotFound (fixed all 8 serve tests plus the redaction test).
2. a855c14 - Linux routing_gate flake and macOS doctor_json failure: same cause. Test temp dirs were named from the clock alone; with coarse timers parallel tests shared a root and one test's remove_dir_all (or README re-copy) hit another's open ledger ("database file has moved", README restored). My rel_path change is not involved (Linux output unchanged). Not reproducible locally, so this is the best-fit diagnosis. Added an atomic counter to all 41 temp-name sites in tests/. Serve test client now keeps partial reads.
3. 3rd commit - context_plan: Windows needs write access to set mtime.
4. ci(native): macos-14 jobs cancelled at start ("macos-14-arm64-us-default not supported"); aarch64-apple-darwin now uses macos-15.
5. Graceful close in gateway serve (shutdown + brief drain) and HTTP transport tolerates ConnectionReset after a complete response (Windows reset flake in live_discovery and gateway_routing).

## Gated to Unix
Nothing new. Existing cfg(unix) gates untouched.

Local: cargo test -j 2 --workspace --locked passed before every push.

## Round 2 (review of PR #14)
Run 42154434256 (head 7481c0d): all green - x86_64/aarch64 Linux, x86_64/aarch64 macOS, Windows msvc, SHA256SUMS.
- 95e07a3: linger_close bounded by 400 ms total and 64 KiB; test with a 50 ms/byte trickling peer.
- 3111c9e: reset tolerated only when the response is complete by framing (Content-Length received, chunked zero-chunk, 1xx/204/304 or HEAD); unit tests for each, including valid JSON shorter than Content-Length.
- 7481c0d: shared tests/common/mod.rs unique_temp_dir/unique_temp_path replaces 40 inline blocks and routing_gate's extra counter; provenance_verify uses it. Local workspace test passed before push.
