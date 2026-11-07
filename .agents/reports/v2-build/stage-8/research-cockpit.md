# Research: product-actualizer cockpit (agent-built UI)

Source: a read-only study of `~/projects/product-actualizer`, 2026-11-07. Paths are under that project unless they start with `Horizon/`.

## Main finding
The cockpit is not a conversation. Agent UI sits in docked, tabbed surfaces next to the work. `cockpit/design/PRODUCT.md` names "chat applications" as an anti-reference, and the Work Terminal footer is "one persistent line for the work, not a chat… no speech bubbles" (`web/WorkTerminal.tsx:1-3`). Agents compose UI as data and never write UI code. The rule chain is "intent → action → schema → authority → state change → render", and never "agent → DOM" (`protocol/actions.ts:1-2`).

## Protocol
- **`cockpit/protocol/spec.ts`** (zod, `.strict()`):
  - 15 blocks;
  - data comes from a named read-only `source` (`pa:`, `case:`, `work:`, `file:`…) or inline `data`, and inline data is always marked "agent-supplied";
  - refs such as `claim:C1` become chips;
  - a surface is `{id, title, summary, intent, layout, blocks[1..12]}`;
  - placement is relative only.
- **Catalog:** `protocol/catalog.ts` has use, avoid, affords and an example for each block, and `vocabulary()` lists the rules. One rule: "you cannot answer: ask, then read_responses".
- **Agent actions** (`protocol/actions.ts`):
  - `surface.put`, `surface.patch`, `surface.remove`, `view.*`, `layout.*`, `note.add`, `ask.withdraw`.
  - Errors carry a code and the path to the problem (`{code, message, issues[]}`).
- **Reducer** (`server/workspace.ts`), pure:
  - refuses human operations from an agent;
  - checks refs and sources, and lints the surface;
  - caps surfaces at 8, never evicting one with an open ask.

## Rendering (`web/Surface.tsx`)
- **Registry:** closed. An unknown block shows "unknown block type X".
- **Failures:** each block sits in its own error boundary.
- **Header:** title, intent, an agent tag and the summary.
- **Banners:** a historical or candidate banner comes from the data sources, so an agent cannot hide it.
- **Text:** through `RichText` and `Markdown`, which build React nodes, never HTML.

## People answer, the agent must reply
- **Ask inputs:** `confirm`, `select`, `multiselect`, `text`, `multiline`, `search` and `path`. Options carry `hint`, `consequence` and `refs`; the ask names what it `resolves`.
- **Always available:** Answer, Not yet, Skip.
- **After answering:** the ask folds to a short echo: the value, then "routed: <where>", "withdrawn by the agent" or "waiting for the router".
- **Who can answer:** only the human connection may answer, confirm or rule.
- **Inbox:** each answer is an entry in `inbox.jsonl`. The agent closes it with an ack that says where the answer went ("proposal P27", "decision D8" or "no action: <why>", at least 6 characters).
- **Open entries:** an entry with no ack blocks the release gate and shows in every status line.

## WebMCP
- **Registration:** `web/webmcp.ts` calls `document.modelContext.registerTool(tool, {signal})` and withdraws a tool by aborting its signal.
- **Calls:** they go with the agent's token through the same reducer.
- **One definition:** a single set of tool definitions feeds the CLI, MCP and WebMCP.
- **Context:** the tools offered depend on the situation ("discovery, not authorization").
- **Missing on purpose:** there is no tool to answer, rule or confirm for the owner, and no raw-DOM tool.

## Look (`cockpit/design/DESIGN.md`, `web/styles.css`)
- **Colour:** graphite OKLCH neutrals and one teal accent, plus ok, warning, danger and unknown colours.
- **Type scale:** 11, 12, 12.5, 13, 15 and 22.
- **Structure:** no nested cards, and borders only on things you can act on.
- **Callouts:** a leading glyph, never a side stripe.
- **Motion:** 120-150 ms transitions, and reduced motion is respected.

## Horizon today, compared
- **`Horizon/src/ui/surface2/grammar.ts`:** the same 15 blocks, stricter on provenance, and versioned (`horizon.surface/2`). Its ask is select-only, with no consequence or resolves.
- **`Horizon/src/ui/surface2/panel-blocks.ts`:** draws 5 of the 15 blocks. The other 10 show "unavailable".
- **`Horizon/src/ui/desk/panels-model.ts`:** a cap of 8, but it can evict a panel that is waiting on an answer. No withdraw.
- **`Horizon/src/ui/desk/Panels.tsx`:** panels sit in a separate "From agents" list, not in the conversation.
- **Horizon's reply rule:** any later agent action on the panel counts as a reply. That is weaker than the cockpit's ack, which says where the answer went.
