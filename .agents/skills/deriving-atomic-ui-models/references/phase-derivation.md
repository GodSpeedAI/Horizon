# Behavior-to-UI Derivation (IS1–IS8)

For each Behavioral IR phase ask the question, then derive only what the behavior requires.

| Phase | Ask | Derive |
|---|---|---|
| IS1 Context Selection | What context must remain available after selection? | identity; breadcrumbs/navigation context; entity selector; scope summary; persistent case header when later decisions depend on it |
| IS2 Preflight | What readiness, missing information, or blocked conditions must be visible? | validation; status; required-input group; blocked-reason presentation; corrective action |
| IS3 Authority Resolution | What authority relationship must the user understand before acting? | authority status; approver/role identity; escalation action; commitment affordance; policy explanation when required |
| IS4 Capability Invocation | What operation is invoked and what progress matters? | command/action; progress; execution status; cancellation/recovery action; live output only when it changes judgment |
| IS5 State / Artifact Effect | What expected change or artifact must become legible? | state-transition summary; artifact reference; diff/comparison; created/modified resource presentation |
| IS6 Evidence Inspection | What evidence must be inspected, compared, filtered, or kept visible? | evidence collection; artifact viewer; comparison; timeline; table; graph; inspector (richer structures only when earned) |
| IS7 Settlement / Decision | What must be compared against the criterion? | settlement status; expected-vs-observed comparison; decision controls; unresolved-evidence warning; recovery/escalation controls |
| IS8 Next-Affordance Selection | What spendable moves should be visible now? | action group; command palette; navigation choices; next-case selector; blocked alternatives only when diagnostically useful |
