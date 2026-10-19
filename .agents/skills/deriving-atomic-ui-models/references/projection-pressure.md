# Projection Pressure and the Representation Test

Sequential-proof observations (`projection-pressure.yaml` entries: `id`, `kind`, `journey`, `phases`, `observation`, `evidence_ref`) are evidence for richer UI. Translate each deliberately, and record the outcome (adopted, simplified, or deferred, with reason) in `projection-decisions.yaml`.

| `kind` | Observed | Candidate requirement |
|---|---|---|
| persistent_context | repeatedly returns to earlier steps to recall context | `persistence: { context: visible_across_decision }` (do not assume a sidebar) |
| simultaneous_comparison | alternates between two artifacts | `comparison: { operands: [expected, observed], simultaneous_visibility: required }` |
| collection | inspects many comparable entities before deciding | `collection: { representation: comparative, sort_filter_required: true }` (table, list, tree, or grid decided later) |
| relationship_view | decision depends on topology among entities | `relationship_view: { topology_visibility: required }` (graph only if it beats simpler forms) |
| temporal_view | history or sequence changes judgment | `temporal_view: { ordered_events: required }` |
| artifact_context | artifact must stay visible while choosing actions | `artifact_context: { persistence: simultaneous_with_actions }` (may earn inspector/workspace) |

## Representation test

Before adding a richer representation ask: **what behavioral burden does it reduce that a simpler one does not?** If unclear, keep the simpler one. Do not introduce graph over list, timeline over ordered text, canvas over form, dashboard over status, tabs over one view, or multiple panes over sequential navigation unless the extra cost buys a consequential advantage.
