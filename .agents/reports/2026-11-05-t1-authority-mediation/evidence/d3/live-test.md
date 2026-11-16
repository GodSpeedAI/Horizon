# D3: Workbench live-test failure (unknown world)

## Root cause (environmental, not a test or server defect)
The world digest covers the DomainModelIdentity, which includes `producer` and `producer_version`
(domainforge-core 0.21.1 src/application/world.rs `DomainModelIdentity::from_document`, ~l.289-305).
The test derives worldRef with the CLI `domainforge` 0.21.2 (`created_by: domainforge 0.21.2`);
sea-forge-server v0.4.0 derives its own with domainforge-core 0.21.1
(crates/sea-forge-server/src/cep_authority.rs load_worlds l.40-112 -> WorldRegistry::register_source_set,
crates/sea-forge-domainforge/src/world.rs l.123-137). Worlds load eagerly per request; load succeeded
(no cep_world_config error), the digests simply differ, so `require` (world.rs l.215-226) says
`unknown world`. Server log shows startup only because nothing is logged on load.
Evidence: CLI 0.21.2 ref baeac462...; CLI built from domainforge-core 0.21.1 (scratch, offline) ref
d5f28bea.... Running the test with WB_DOMAINFORGE_BIN pointing at the 0.21.1 build passes.
(Horizon's pinned ref was likewise made with a matching producer version.)

## Fix
No code change: the test already honours WB_DOMAINFORGE_BIN. Use a domainforge CLI of the same
version as the server's domainforge-core (0.21.1). No commit made on t1/sdk-adoption.
Built via: cargo build --release --offline --features cli --bin domainforge from a copy of
~/.cargo/registry/src/*/domainforge-core-0.21.1 (scratch dir, binary at
/tmp/claude-1000/-home-sprime01-projects-Horizon/bfdd6412-8037-4618-a898-482854f082b8/scratchpad/tgt/release/domainforge).

## J-SW01 enablement
Needs REALITYTRACE_BIN (set to ~/.cargo/bin/realitytrace) plus the same flags.

## Results (both tests, WB_DOMAINFORGE_BIN=0.21.1 build, REALITYTRACE_BIN set)
- PR #29 (t1/sdk-adoption, 0.9.0): 2 pass, 0 fail
- Baseline (f0f2733, 0.8.0): 2 pass, 0 fail
