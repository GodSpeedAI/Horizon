# terminal-ui (vendored source copy)

Source: `GodSpeedAI/Terminal-UI` at commit `793215499ef6149988711c92c935b06e13315eb9`
(2026-10-20), copied under the MIT license. Only the prompt shell and the
`Select` / `Confirm` controls, their shared theme, primitives, hooks and utilities
are included. The Workbench, scenarios, other controls and visual tests are not.

This is the registry-copy path the T08 plan asks for: Horizon owns the code,
there is one implementation, and the copy is editable. Attribution and the
upstream license text are in `THIRD_PARTY_NOTICES.md` at the repository root.

Horizon's sequential controller supplies the business state. Nothing under this
directory reads a Horizon frame, invokes a capability or decides availability;
it only renders a prompt and emits the answer the caller gives it.
