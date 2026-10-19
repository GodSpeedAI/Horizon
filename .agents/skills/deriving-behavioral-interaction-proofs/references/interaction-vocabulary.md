# Operation Classes and Interaction Vocabulary

## Operation classes

**Epistemic**: improves representation or reduces uncertainty (inspect, search, retrieve, measure, question, compare, investigate, simulate, request evidence).
`case → inquiry → evidence → changed representation → changed affordance field`

**Consequential**: alters authoritative case or world state (approve, reject, submit, deploy, modify, commit, pay, send, close, escalate, publish, authorize).
`represented possibility → commitment → governed execution → observed consequence → evidence → settlement`

Consequential operations require stronger authority, commitment, recovery, and evidence handling.

## Semantic interaction kinds

Describe semantics, never framework widgets, buttons, prompts, or terminal components.

| Kind | Sequential-renderer mapping (adapter logic, not canonical) |
|---|---|
| single_choice | one bounded choice |
| multi_choice | bounded scope selection |
| entity_resolution | searchable entity selection |
| open_input | genuinely unmodeled information entry |
| commitment | explicit consequential confirmation |
| validation | invariant/precondition check |
| execution | bounded operation progress |
| observation | execution output |
| evidence_review | evidence presentation |
| settlement | criterion evaluation |
| navigation | next-affordance choice |
| cancel | safe noncommitment |
