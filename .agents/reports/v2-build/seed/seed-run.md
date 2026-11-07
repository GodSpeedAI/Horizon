# Seed run, test setup, 2026-11-07

Commands: `just seed` (twice), then `just seed-status`. Counts below are ledger rows per record repository and issues in the sandbox, measured before the first run, after it and after the second.

```
before : 01M6TWGX0MJ2QPD75SYMFXD5QA:1 01M6TWQ4VX299FT63J03JX4FK2:36 01M6TWQHNZN064JRW7KM41MCGE:36 | gh issues: 5
run 1  : 01M6TWGX0MJ2QPD75SYMFXD5QA:1 01M6TWQ4VX299FT63J03JX4FK2:36 01M6TWQHNZN064JRW7KM41MCGE:36 | gh issues: 5
run 2  : 01M6TWGX0MJ2QPD75SYMFXD5QA:1 01M6TWQ4VX299FT63J03JX4FK2:36 01M6TWQHNZN064JRW7KM41MCGE:36 | gh issues: 5
```

Note: this record holds three repositories for the same folder, left by development runs before the seed learned to find its own repository (see the report). The two extra copies are in the test record until the next seed-clear. The empty first one has only its enrollment row.

## Run 1 (`just seed`)
```
Seeding the test setup:
  templates: already installed
  policy: operator may add steps
  case Seed: weekly release: case_20261107T112912Z_fb271a
  case Seed: triage inbox: case_20261107T113303Z_7cc406
  GitHub issue: https://github.com/GodSpeedAI/horizon-sandbox/issues/5
  hand off step: handoff:seed-3f6c1a52-8d0b-4e7a-9a41-5b2d7c9e1f10
  agent proposal step: propose:seed-r1:rollback_note
  record obligation-matched: matched
  record obligation-contradicted: contradicted
  record obligation-unseen: expected but not seen
  record seed-matched: matched
  record seed-contradicted: contradicted
  record seed-unexpected: seen but not expected
  record journey:J-SEED:release:3: expected but not seen
  notes: 6 on 5 days
  labels: seed-matched=pass, seed-contradicted=fail, seed-unexpected=fail
Done. Running it again changes nothing.
```

## Run 2 (`just seed`)
```
Seeding the test setup:
  templates: already installed
  policy: operator may add steps
  case Seed: weekly release: case_20261107T112912Z_fb271a
  case Seed: triage inbox: case_20261107T113303Z_7cc406
  GitHub issue: https://github.com/GodSpeedAI/horizon-sandbox/issues/5
  hand off step: handoff:seed-3f6c1a52-8d0b-4e7a-9a41-5b2d7c9e1f10
  agent proposal step: propose:seed-r1:rollback_note
  record obligation-matched: matched
  record obligation-contradicted: contradicted
  record obligation-unseen: expected but not seen
  record seed-matched: matched
  record seed-contradicted: contradicted
  record seed-unexpected: seen but not expected
  record journey:J-SEED:release:3: expected but not seen
  notes: 6 on 5 days
  labels: seed-matched=pass, seed-contradicted=fail, seed-unexpected=fail
Done. Running it again changes nothing.
```

## `just seed-status`
```
Seed status (test setup):
  present  policy lets the operator add steps  discretionary_task_add in the test cell's policy.yaml
  present  templates  seed-release-signoff@0.1.0, seed-triage@0.1.0
  present  case release  case_20261107T112912Z_fb271a
  present  case triage  case_20261107T113303Z_7cc406
  present  GitHub issue  https://github.com/GodSpeedAI/horizon-sandbox/issues/5
  present  GitHub issue on the test board
  present  step from the GitHub issue  github:GodSpeedAI/horizon-sandbox#5
  present  step handed off  handoff:seed-3f6c1a52-8d0b-4e7a-9a41-5b2d7c9e1f10
  present  step proposed by an agent  propose:seed-r1:rollback_note
  present  decision waiting for the operator  Seed: sign off the weekly release notes (active, unsettled)
  present  record obligation-matched  matched
  present  record obligation-contradicted  contradicted
  present  record obligation-unseen  expected but not seen
  present  record seed-matched  matched
  present  record seed-contradicted  contradicted
  present  record seed-unexpected  seen but not expected
  present  record journey:J-SEED:release:3  expected but not seen
  present  notes  6 of 6 on 5 days
  present  labels  3 of 3
All 19 parts are present.
```
