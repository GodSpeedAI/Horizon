# Round-5 review disposition

Builder's disposition of the nine findings in `independent-review-round-5.md` §4. This is the
builder's record of what it changed and what proves it. It is not evidence: the evidence is the
test, teeth and checker output named on each line, reproduced by the commands in the
remediation-4 report.

| Finding | Disposition | Change | Proved by |
|---|---|---|---|
| R5-01 desk P3 rows | Fixed | `case.task.decide`, `horizon.settlement.rule`, both approval decisions and `workspace.export` are refused on every path; the handlers perform no effect and append one refusal audit. Gates in `src/app.ts`. | PE-47, NE-39; teeth M31 |
| R5-02 `run.start` | Fixed | The shared run start is refused before `startCase` sends its unclassified case advance; no run starts and no target effect occurs. | PE-48, NE-39 |
| R5-03 device as human | Fixed | The device credential is a service principal (`device:<id>`); the operator is attribution only; a phone commit is refused with `no_device_delegation`. | PE-49, NE-40; teeth M32 |
| R5-04 executor mapping | Fixed | `agent_execution` executor maps to `registered_agent`, the key the agent door authenticates; the record vocabulary keeps `agent_execution` for an issuer-issued execution. | PE-50 |
| R5-05 caller kinds | Fixed | The record `caller_kind` enum covers the six kinds the catalog names; `caller_kind_permitted` is a constraint. | PE-51; fixture triple (TypeScript, Python, fixtures) |
| R5-06 composite interface | Fixed | Per-fact owner component and struct, checked per struct at the pinned commit; conditional facts state when they apply; every fact binds; Merkle fields `leaf_index`, `proof_hashes`, `mmr_leaf_index` added; local kinds renamed `HorizonDelegationGrant` and `HorizonAuthorityDecision`. | PE-44, PE-45, PE-46, NE-38; teeth M29, M30; `scripts/check-external-interface-facts.ts` |
| R5-07 class-inherited assurance | Fixed | The six anonymous and code-holder rows state `human_evidence: null` and inherit no assurance predicate. | PE-52; teeth M33 |
| R5-08 refusal audit wording | Fixed in prose | The design states that a refusal appends one audited refusal record before answering; it is not an effect and not a silent drop. | NE-39 |
| R5-09 separation of duty | Fixed | Separation of duty is a per-row requirement; the loader refuses a P3 row that does not state it. | PE-52 |

Rejections: none.
