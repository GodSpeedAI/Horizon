# Verification record — remediation of `codex-root-20261019-7b4d110`

Environment: Bun 1.4.0, Node 26.8.2, Python 3.14, uv 0.12.1, DomainForge 0.21.1
(`DOMAINFORGE_BIN=../domainforge/target/release/domainforge`). Network unavailable (DNS and
outbound TCP blocked) for the whole run; nothing here needed a download except the pinned
`uv` environment, which was already synced from the committed lock.

## Which artifact set each command reads

| Command | Artifact set | Why |
| --- | --- | --- |
| `just check` | active `config/horizon.toml`, `src/**` | baseline configuration and types |
| `just boundaries` | active manifest + tree | dependency metadata and authority boundaries |
| `just idm-integrity` | active `.sea` + frozen spec | referential and identity integrity of the canonical model |
| `just acceptance-claims` | **candidate** T04-CR-001 ledger + frozen spec | the candidate must preserve the four prohibitions |
| `just acceptance-claims-frozen` | **active frozen** ledger | expected to fail until T04-CR-001 is authorized; kept red on purpose |
| `just witness-claims` | active + **candidate** ledgers, frozen spec | a contract may not add policy; 9 inherited findings baselined (D-020), a new one fails |
| `just contract-modals` | **candidate** ledger | no changed contract drops a modal its requirement carries; `contract-modals-frozen` is red on purpose |
| `just test` | active `src/**`, `test/**`, `research/` | behavioural tests, including the witness tests |
| `just ledger` | active frozen ledger + freeze checker | freeze integrity (ledger, spec, plan, policy) |
| `just wayfinder` | active frozen Wayfinder + freeze checker | projection integrity |
| `just teeth` | active tree + isolated copies | adversarial attacks (memory-only fake, metadata removal, in-memory store, competing store, duplicate `.sea`, false world, ledger freeze, DomainForge gate, IDM integrity) |
| `just verify` | active frozen artifact set | T04's declared gate: check + boundaries + idm-integrity + test + ledger + wayfinder + teeth |
| `just gate-t04` | active frozen set + candidate contracts | T04 task proof: everything in `verify`, plus the candidate acceptance check |

## Exact commands and exits (this run)

```
$ bash .agents/evidence/horizon/T04/run-gates.sh
```

| Target | Exit |
| --- | --- |
| check | 0 |
| boundaries | 0 |
| idm-integrity | 0 |
| acceptance-claims | 0 |
| acceptance-claims-frozen | **1** (expected: the active frozen ledger is inverted, D-015) |
| test | 0 |
| ledger | 0 |
| wayfinder | 0 |
| teeth | 0 |
| verify | 0 |
| gate-t04 | 0 |
| **recorder** | **1** (because one target is honestly red) |

Per-target logs: `just-<target>.log` beside this file.

Final confirmation on the complete tree (after the last source and documentation edits):

```
$ just verify     -> exit 0   "verify: ok (active frozen artifacts: requirements/ledger.yaml + .wayfinder/answer-key.md)"
$ just gate-t04   -> exit 0   "gate-t04: ok — active frozen artifacts verified; T04-CR-001 candidate contracts verified; T04 settlement still requires an independent verdict"
$ node_modules/.bin/tsc --noEmit  -> exit 0
$ bun test        -> 23 pass / 0 fail / 125 expect() calls
```

`just-verify.log` shows each prerequisite actually ran rather than being skipped:
`check: ok`, `boundaries: ok`, `ledger: 0 error(s)`, `wayfinder: 0 error(s)`,
`teeth: all attacks blocked`, `tooth: gate discriminates …`,
`tooth: referential integrity is enforced …`, `4 passed` (pytest).

## Decisive observations

- `just test`: **23 Bun pass / 0 fail**, pytest **4 passed**. The 23 include the durable
  round-trip E2E, the construction-path in-memory rejection, the spoof/audit test, the
  degraded-research test, the absent-research test, and the ten witness tests.
- `just teeth`: five boundary/adapter probes blocked; `isolated-tree-real-runtime` baseline
  6/6 pass (the control); `fake-runtime-substitution` **exit 1, 3 tests fail**; metadata
  removal blocked by boundaries and the E2E outcome recorded; ledger freeze 6 blocked /
  0 missed; DomainForge tooth proves both blind spots with the undefined-type control still
  failing; IDM-integrity tooth fails on dangling and duplicate references.
- `just idm-integrity`: 11 requirement references, **1 tolerated as recorded debt**
  (`REQ-CMP-001`, D-016), 11 invariant ids unique.
- `just acceptance-claims` on the candidate: 4 prohibitions preserved, 0 generic restatements.
- `just acceptance-claims-frozen` on the active ledger: **69 failures**, naming all four
  inverted prohibitions. It is red until T04-CR-001 is authorized.

## Frozen-artifact check

```
$ git diff 7b4d110 -- requirements/ .wayfinder/ .agents/specs/ .agents/prereg/ .sea/ scripts/ledger-policy.yaml | wc -l
0
$ sha256sum requirements/ledger.yaml .wayfinder/answer-key.md .agents/specs/horizon.agent.spec.yaml \
    .agents/prereg/horizon/T04.prereg.yaml scripts/ledger-policy.yaml .sea/interaction/interaction-model.sea
c7afbcc60f9cd197ddef60941e19bd6cc9cfc00584c5703a6e6fa07e364e7417  requirements/ledger.yaml
f00b060d4f27a1dc727ad34a50b099efa881a665e7c4ba308c2429b22ec05eb2  .wayfinder/answer-key.md
75cfc1ceb9eec6139f7b8e73f8d1107fcc5e2b680e80683824edd7d8de434130  .agents/specs/horizon.agent.spec.yaml
9c434b404a948971e3bca27a06eef670ab790e1f6bfc5c7ffd0847662a06a03e  .agents/prereg/horizon/T04.prereg.yaml
6d03ab70cfabc446e2610300909edbaa81adfce6b629ce0b2d79eef733003e45  scripts/ledger-policy.yaml
1c3909e51c509b60634dc5f4dba7dc29c3c58bc883a0134cf2861ac23bb1eec1  .sea/interaction/interaction-model.sea
```

Every hash matches the value recorded in `CURRENT_STATUS` revisions 9–11 (and the ledger,
Wayfinder, spec and `.sea` also match the reviewed commit `7b4d110`).

## Round 2 — after criticism round 1 corrected the candidate

Re-run on the complete tree after every source, script, candidate and documentation edit of
this round. Recorder: `bash .agents/evidence/horizon/T04/run-gates.sh`.

| Target | Exit | Note |
| --- | --- | --- |
| check | 0 | |
| boundaries | 0 | |
| idm-integrity | 0 | 1 tolerated `REQ-CMP-001` (D-016) |
| acceptance-claims | 0 | candidate preserves the four prohibitions |
| acceptance-claims-frozen | **1** | expected: the active ledger is still inverted (D-015) |
| witness-claims | 0 | 9 inherited findings baselined (D-020); a new one fails |
| contract-modals | 0 | 4 inherited losses baselined; a changed contract that loses a modal fails |
| contract-modals-frozen | **1** | expected: the active ledger drops 10 modals |
| test | 0 | 20 Bun pass / 0 fail, pytest 4 passed |
| ledger | 0 | |
| wayfinder | 0 | |
| teeth | 0 | |
| verify | 0 | |
| gate-t04 | 0 | |
| **recorder** | **1** | because two targets are honestly red |

Teeth demonstrated by mutation and reverted in the same session:

- removing the generator's `MAY` branch → `restate() self-test failed …` (generation aborts);
- `evaluateDeviation` returning the deviated operation even when blocked → `AC-CASE-002-01` fails;
- a surface that exposes the configured endpoint → `AC-CONFIG-004-01` fails;
- a reintroduced SHOULD→MUST in the candidate ledger → `just contract-modals` exits 1, naming
  `REQ-UX-009`.

Reproducibility: re-running `apply-candidate-revision.py` and `gen-wayfinder.py` reproduces the
candidate ledger, Wayfinder and `composed/prereg.patch` byte-for-byte (`sha256sum -c` OK), and
`git apply --check composed/prereg.patch` exits 0 with the prereg untouched.

## Environmental limits

- Network and DNS were unavailable for the whole run; `bun install` was not attempted.
  `uv run --project research pytest` used the already-synced pinned environment.
- `just teeth` copies `node_modules` (~135 MB) twice per run and takes roughly two minutes
  here (D-017).
