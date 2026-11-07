# DomainForge, `.sea`, and "semantic worlds" in plain English

## 1. What DomainForge and .sea are
A `.sea` file is a readable text file that writes down what a system is made of and what rules apply to it. DomainForge is the tool that reads that file, checks it for mistakes, and turns it into other forms (code, schemas, telemetry names). Its own pitch: "write the domain once, check it, and derive the representations that should agree with it" (domainforge/README.md:22-52). "SEA" stands for Semantic Executable Abstraction (README.md:24).

A model declares: things that exist (Entity, Resource), roles people or parts play (Role), movements of something between things (Flow), relationships (Relation: "X proposes to Y"), rules (Policy), measurements (Metric), units, and named fixed value lists (enum). The grammar is in /home/sprime01/projects/tree-sitter-sea/grammar.js (not read in detail). I saw no "transition" keyword; state changes appear as enums and relations (UNCONFIRMED whether a first-class transition exists).

Real example, /home/sprime01/projects/cognate/examples/refund-desk/domain/refund-desk.sea:
- `Entity "Customer"`, `"Order"`, `"Refund"`: the things the refund desk talks about.
- `Role "Support agent"`, `"Approver"`: who can act.
- `Flow "Money" from "Order" to "Customer" quantity 50`: money goes back to the customer.
- `Relation "Refund approval"`: the Approver approves, via that money flow.
- `Policy refund_over_50_needs_approval`: any refund above $50 needs an approval relation.
Read aloud: "These are the parts, these are the people, this is what moves, and this is the rule."

Horizon's own model is larger: /home/sprime01/projects/Horizon/.sea/interaction/interaction-model.sea (896 lines) with entities such as ObserverActor, HorizonHost, CognateHost, RealityTraceService (lines ~140-151), relations such as "evaluates_authority" and "observes_evidence" (~430-442), and enums such as AuthorityOutcome, EvidenceClass, SettlementStage (lines 20-110).

## 2. What a "world" is
A world is one specific, checked, frozen version of the whole model, with an identity fingerprint. Horizon loads it in /home/sprime01/projects/Horizon/src/adapters/semantic.ts: it reads every `.sea` file under `domain/`, asks DomainForge to build the world (`loadSemanticWorld`, lines ~38-50), and refuses to start if the fingerprint ("semantic closure hash") differs from the pinned one (lines ~52-57). Change one word of the model and the fingerprint changes, so the world reference changes (cognate/docs/semantics.md:20: a rename "mints a new identity rather than silently reinterpreting the old one").

How the three terms relate, as Horizon's workspace shows them (src/ui/workspace/model.ts:32, 565-567):
- World: which model version (fingerprint), "the rulebook edition".
- Checkpoint: a position in the recorded history, shown as "position N" (model.ts:42-43). "How far the story has got."
- Focus: the one thing in that world being looked at right now.
So a frame of the screen says: under this rulebook, at this point in history, looking at this thing. The UI is explicit that a view at an unknown checkpoint "is not evidence of the current world" (model.ts:538) and that a historical frame "is not current world state" (model.ts:558).

## 3. How events tie to model terms
Yes, but by explicit binding, never by guessing.
- Cognate turns model objects into stable references (`namespace::name`, identical across re-parses) and attaches them to capabilities only through an explicit `bindCapabilities` call. Policies are read-only and can never become permissions (cognate/docs/semantics.md:25, 43).
- Cognate-workbench declares every binding against a named model entity and checks the count (cognate-workbench/domain/README.md:7, "nothing is inferred").
- Observations sent to RealityTrace carry a "semantic reference" among other IDs (trace, event, causation, run, capability) (cognate/docs/evidence.md:20). So an observation can point at a model term.
- DomainForge can also project the model into OpenTelemetry names so a log event "carries a reference to the domain model that gave its fields meaning" (domainforge/README.md:300-323). Its README admits the log "still needs independent evidence to prove a claim".
Where exactly Horizon stamps a world ref on each event: UNCONFIRMED beyond the world_ref/checkpoint_ref/focus_ref fields on frames.

## 4. Tools to query a model
- CLI `domainforge`: subcommands parse, validate, import, project, format, test, normalize, registry, authority, pack, contract, envelope (domainforge-core/src/cli/mod.rs:36-62). Example: `domainforge validate --format human x.sea`.
- Libraries: Rust (domainforge-core), Python, npm `@godspeedai/domainforge`, WASM (README.md:462-470). In-process parse/inspect/validate.
- Cognate adapter `@godspeedai/cognate-domainforge`: `loadSemanticWorld`, `loadSemanticProjection`; this is what Horizon calls today (semantic.ts:3).
- Tree-sitter grammar for editors (tree-sitter-sea).
- LSP: docs mention language-server material, but I found no LSP server in domainforge-core/src. UNCONFIRMED.
Horizon should use the Cognate adapter in-process; the CLI is the fallback for validation checks.

## 5. The value, for a non-expert
An ordinary log says that something happened, in whatever words the programmer chose that day. A trace bounded by a semantic world says what the thing was, under which written rules, at which version of those rules, and whether the action was allowed to happen. The model is a shared dictionary plus rulebook that is checked by a machine and fingerprinted, so two people (or two systems) reading the same event cannot quietly mean different things, and a later reader can tell whether the rules have changed since. It turns "a line of text someone must interpret" into "a claim you can check against a named, versioned source".

Before (raw log, from the DomainForge README's own example):
`INFO payment-svc: transfer ok user=blake amt=100 dest=acct-9`
Open questions: what is "amt"? Which flow? Under which limit? Was 100 allowed?

After (same event in its world; wording illustrative, not real output):
"Money moved from Buyer to Supplier, quantity 100 USD. World: payments 1.0.0, fingerprint 3fa9c1d2. Rule 'transfer_limit' (max 10,000) was in force and was met. Position 412 in the history. This was the Money flow, not any other."
A later change of the limit produces a different fingerprint, so this event is still read against the rulebook it was made under.

Caveat to state honestly: a bad model can validate fine (README.md:394). The world proves consistency with a stated model, not that the model is right.
