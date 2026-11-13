# Unified identity and authority investigation evidence

**Date:** 2026-11-08  
**Purpose:** bind the investigation's source inputs, focused test results, and independent review to inspectable local artifacts. These are design-review observations, not an implementation or whole-stack security qualification.

## Reviewed artifacts

| Artifact | SHA-256 |
|---|---|
| Accepted owner-synced report snapshot: [`reviewed-authority-d302b5ae.md`](reviewed-authority-d302b5ae.md) | `d302b5ae3133fbd4bc79a7113fb4c8332fefdd2caa3218f2901f5240790246e1` |
| Accepted owner-synced brief snapshot: [`reviewed-brief-e5887404.md`](reviewed-brief-e5887404.md) | `e5887404b865ad65214aa74e5db16eff1685395b58c687dd6ac0bb4ff74c7237` |
| Earlier focused-check report input: [`reviewed-authority-3b7bc18f.md`](reviewed-authority-3b7bc18f.md) | `3b7bc18ff913b4f37f99e32007d9316f473467ea5dc201a8de6736a786436018` |
| Earlier focused-check brief input: [`reviewed-brief-c7d1144e.md`](reviewed-brief-c7d1144e.md) | `c7d1144e9638b27efba4238cf2c1ece6c72cfe03ce05f9fca6508f997e07e0b8` |
| Earlier second adversarial review: [`reviewed-authority-3b2429ba.md`](reviewed-authority-3b2429ba.md) | `3b2429bad76233a7a0ce6f3cf0d20a6032f1cf3f66de483260b8f28c9743b1ba` |

The current `d302b5ae` and `e5887404` snapshots are the exact files accepted by the final owner-synchronization check. The report changed only after that check in status and evidence metadata (the final-check status, hashes, and review-history entries); no architecture recommendation changed, and the brief is byte-identical to the accepted snapshot. The earlier `3b7bc18f`/`c7d1144e` pair preserves the technical version accepted before the owner-decision register was added.

## Source and worktree inputs

Full branch/HEAD/tracked-modification record: [`worktree-status.txt`](worktree-status.txt).

| Repository | Commit used | Note |
|---|---|---|
| Horizon | `0eca3ed0fa438f8fa7e11fba56dee1a6e12a04f0` | clean tracked tree; report/evidence are untracked additions |
| Cognate | `87333bce08f449e4664b01936832d2a72034d405` | clean tracked tree |
| Cognate shared identity | `f4d4db6402485e1d6f0de4e11e7172af3bdeb49d` | clean tracked tree; separate worktree |
| Cognate Workbench | `65510bbfce73bf08dd9463e4213eef47cb74e5bf` | six pre-existing modified screenshot files recorded; HEAD unchanged before/after tests |
| SEA-Forge | `b072ec50b1e50df75c45ddf1709caa6877d5c2f1` | clean tracked tree |
| Gauntlet | `584277796ff73cb00ffd4c5f60b0e4a2cec429a6` | clean tracked tree |

Logs replace machine-specific roots with `<horizon-root>`, `<projects>`, `<home>`, and `<tmp>`. No secrets or credentials are included. The Workbench test log loads a semantic model from a path now displayed as `<projects>/cognate-workbench`; the working-tree inputs include the six recorded screenshot modifications, which the auth test suite does not read.

| Output | SHA-256 |
|---|---|
| `horizon-tests.log` | `e0ddc98e48ece256f18c863003a2c142dbd74186ce8f3a0ba950a765d47b96be` |
| `cognate-tests.log` | `1e98ee75234b641a84baae3a5dd4965d42c0f145892b393a43608b240c94b977` |
| `workbench-tests.log` | `acbc581154dd363944871494d0d62693318af9c4773ab0e80ed3bd85be4afeb9` |
| `shared-identity-tests.log` | `ebcde347cc1bc67ab287b19f60ec7ccca3645dd979469988a34941cf8deabbb4` |
| `sea-tests.log` | `3a2bb8d15118502914f36d56b25b1b4819f5b4873dd4afb3d4ff1f6d34b85530` |
| `gauntlet-tests.log` | `4701bc741ba51961549e7e81c39228d4e8e1dcfa1c8070ff93b04ce2bd889f86` |
| `final-rereview.md` | `148f8e0913abd726666d0946ad4d02dfa868707019c555dd943a2564e75c3be5` |
| `contradiction-check-round1.md` | `5e4ddef7e46087084e58cba7d083aa157a19c4663beae8d24194b2cb879a7985` |
| `contradiction-check-round2.md` | `0e49fcfc3f8f45df10c667238ce83cdf19b6be1a36f5ecbb7c051d150f399c3b` |
| `contradiction-check-final.md` | `2a25cbb6658a701e265523ee25ee61eed4d4116270bcd4e3b23945d6ff5b2180` |
| `owner-sync-check-round1.md` | `5941c0d7c4e148cbda9cc68535e35fb5c86e928d471f28b2a6bb7f6f76daf676` |
| `owner-sync-check-round2.md` | `3000d02aeffe77213c8a360cae28f37073d9eedc0dc9e944aab844aad3643df1` |
| `owner-sync-check-final.md` | `c8f8cb0a5de24d794983a71109d9b5fa457a349ce9ce0ad1b0ee71fa3c8d53d7` |
| `jetson-kernel.txt` | `b1d86f021a9b3ca22abc6ab8d838d883be615684db8a8b5605da8e6957b0c888` |

The per-run `.meta` files bind those outputs to repository, before/after HEAD, and exit code.

## Jetson host qualification probe

[`jetson-kernel.txt`](jetson-kernel.txt) records a read-only, non-interactive SSH probe on 2026-11-09. The host is `jetson`, Ubuntu 22.04, aarch64, kernel `5.15.185-tegra`. `landlock` is absent from the active LSM list; the Landlock create-ruleset version syscall returns `ENOSYS`; `newuidmap` is missing; `unshare` is present. This establishes that SEA-Forge's `Isolated` class prerequisites are not met on the actual host. It does not establish that the identity contract cannot run there, and no per-workload isolation or platform security is claimed.

## Focused test commands and outputs

Each `.meta` file records repository, HEAD before and after, and exit code. Each log retains the complete observed test output.

| Evidence | Command run at the recorded repository root | Observed |
|---|---|---|
| [`horizon-tests.log`](horizon-tests.log) / [meta](horizon-tests.meta) | `bun test test/remote-webauthn.test.ts test/remote-pairing.test.ts test/remote-sessions.test.ts test/desk-write-token.test.ts` | 42 pass, 0 fail; rc 0; HEAD unchanged |
| [`cognate-tests.log`](cognate-tests.log) / [meta](cognate-tests.meta) | `bun test packages/protocol-connect/test/service.test.ts` | 56 pass, 0 fail; rc 0; HEAD unchanged |
| [`workbench-tests.log`](workbench-tests.log) / [meta](workbench-tests.meta) | `bun test test/J-AUTH-SESSION.test.ts test/J-AUTH-TENANT-ISOLATION.test.ts test/J-AUTH-REBIND.test.ts test/remote-webauthn.test.ts` | 17 pass, 0 fail; rc 0; HEAD unchanged |
| [`shared-identity-tests.log`](shared-identity-tests.log) / [meta](shared-identity-tests.meta) | `bun test packages/identity/test` in the shared-identity worktree | 36 pass, 0 fail; rc 0; HEAD unchanged |
| [`sea-tests.log`](sea-tests.log) / [meta](sea-tests.meta) | `cargo test --locked -p sea-forge-server --test conformance_identity` then `cargo test --locked -p sea-forge-server --test sfwp_delegated_identity` | 15 pass and 9 pass, 0 fail; rc 0; HEAD unchanged |
| [`gauntlet-tests.log`](gauntlet-tests.log) / [meta](gauntlet-tests.meta) | `cargo test --locked -p gauntlet-domain role_invocation` | 4 relevant pass, 0 fail; rc 0; HEAD unchanged |

These test commands do not cover full repository gates, real cross-stack execution, live issuer/authority integration, native Windows/macOS runtime security, WSL runtime security, SSH runtime security, or a Jetson identity runtime. The Jetson host probe is separate prerequisite evidence.

## Independent review record

- **Six EGM lenses:** design, codebase-details, zoom-out, comprehension, implementation-readiness, and structural were dispatched in fresh ephemeral Codex contexts after the EGM readiness gate. Their findings were incorporated, but their raw outputs and invocation identifiers were not retained and are therefore a **historical report, not independently verifiable evidence**. The final document does not rely on those reports for a security claim; all substantive claims are separately source- or test-anchored.
- **First final adversarial review:** verdict `REJECT`, with seven findings. Six concerned trust profile, legacy admission, browser authorship, revocation ordering, Cognate legacy work, and critic blindness; the seventh required traceability. Raw output was not retained. The findings and dispositions are recorded in the report.
- **Second final adversarial review:** fresh ephemeral session `01a1bdb5-2835-7670-9dea-fb63e6722146`; retained at [`final-rereview.md`](final-rereview.md). It found six corrections adequate and required only the evidence-traceability correction. Verdict: `ACCEPT WITH REQUIRED CORRECTIONS`.
- **Focused contradiction check, round 1:** session `01a1bdd0-3a76-7363-8b58-3b8fd3f3891b`; retained at [`contradiction-check-round1.md`](contradiction-check-round1.md). It found three major ambiguities and one minor evidence-disclaimer issue. Verdict: `CHANGES REQUIRED`.
- **Focused contradiction check, round 2:** session `01a1bdd3-8686-7693-8656-2be8823203d4`; retained at [`contradiction-check-round2.md`](contradiction-check-round2.md). It found the substantive corrections consistent and one remaining minor wording issue. Verdict: `CHANGES REQUIRED`.
- **Final narrow wording check:** session `01a1bdd6-4d48-72e2-a6a0-7fc26a676b73`; retained at [`contradiction-check-final.md`](contradiction-check-final.md). It confirmed the disclaimer now distinguishes the Jetson prerequisite probe from runtime/security qualification and returned `ACCEPT`.
- **Owner-decision synchronization round 1:** session `01a1bdec-133f-7ca2-8ade-c5407419d406`; retained at [`owner-sync-check-round1.md`](owner-sync-check-round1.md). It found stale threat-profile labels, over-broad A3 wording for P3, candidate labels on settled decisions, a mislabeled issuer decision, and stale provisional-default wording. Verdict: `CHANGES REQUIRED`.
- **Owner-decision synchronization round 2:** session `01a1bdef-a8e8-7ae2-9572-b60421b283e2`; retained at [`owner-sync-check-round2.md`](owner-sync-check-round2.md). It found four residual stale labels for D5, P3, D1, and provisional defaults. Verdict: `CHANGES REQUIRED`.
- **Final owner-decision synchronization check:** session `01a1bdf1-71ac-74b3-959a-1edbd66d4ad0`; retained at [`owner-sync-check-final.md`](owner-sync-check-final.md). It verified report SHA-256 `d302b5ae...` and brief SHA-256 `e5887404...` and returned `ACCEPT` with no remaining defect.
- **This manifest and retained outputs** bind the accepted versions to their hashes. Owner decisions O1–O8 are fixed for drafting; implementation choices U1–U6, including issuer topology, exact operation mapping, qualified A3 surfaces, measured budgets, conformance qualification, and evidence retention, remain open.

## Design closure rounds

After `design_draft.md` was written from the accepted report and brief, three fresh EGM lenses reviewed it and five bounded closure rounds followed. Every output that was retained is listed here.

| Round | Outputs | Findings |
|---|---|---|
| Initial three-lens review | [`adversarial-design-critic.md`](adversarial-design-critic.md), [`adversarial-implementation-readiness.md`](adversarial-implementation-readiness.md), [`adversarial-security-platform.md`](adversarial-security-platform.md) | 33, consolidated into 16 dispositions |
| Closure 1 | [`closure-round1-readiness.md`](closure-round1-readiness.md), [`closure-round1-security.md`](closure-round1-security.md) | 10 + 3 |
| Closure 2 | [`closure-round2-readiness.md`](closure-round2-readiness.md), [`closure-round2-security.md`](closure-round2-security.md) | 6 + 1 |
| Closure 3 | [`closure-round3-readiness.md`](closure-round3-readiness.md), [`closure-round3-security.md`](closure-round3-security.md) | 5 + 4 |
| Closure 4 | [`closure-round4-readiness.md`](closure-round4-readiness.md), [`closure-round4-security.md`](closure-round4-security.md) | 2 + 1 |
| Closure 5 | [`closure-round5-combined.md`](closure-round5-combined.md) | 1 |
| Final acceptance | [`closure-final-acceptance.md`](closure-final-acceptance.md) | 1 — corrected verbatim as prescribed; not re-reviewed |
| Owner-identified corrections | [`closure-focused-corrections.md`](closure-focused-corrections.md) | 4 — item 1 and 4 PASS; all four corrected as prescribed and assigned to Stage 0A fixtures |

**Snapshot integrity.** Closure rounds 2 and 3 are retained but are **not valid verdicts on a fixed document**: both reviewers reported that the target changed mid-read and stated the hash they actually saw. They are kept because the findings were real and were acted on, not because they certify a version. From the end of closure 5 onward, every check ran against an immutable `0444` copy with the hash declared before the read:

| Frozen artifact | SHA-256 | Lines |
|---|---|---|
| `/tmp/frozen/design_draft.md`, `/tmp/design-final.md` (pre-acceptance frozen copy) | `e7ef6a9dffebe138262d865bf58299ef0b613c9ca60f2900cab90a623b003c4a` | 658 |

The live [`design_draft.md`](../../../design_draft.md) has diverged from every frozen copy by the corrections described above. Rather than track a moving hash in prose, [`design-freeze-record.md`](design-freeze-record.md) records each frozen snapshot, its role, and the current live hash in one place; [`design-draft-delta.txt`](design-draft-delta.txt) records the exact difference against the last frozen copy.

Closure outputs are sanitized: absolute host paths are removed and `design-final.md` is normalized to `design_draft.md`. They contain no credentials and no private workspace content.

The review output was sanitized only by replacing machine-specific roots. The reviewer performed direct local reads after its automatic policy layer rejected external indexing.
