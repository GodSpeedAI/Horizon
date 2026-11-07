# Live proof: hand a step to an agent

Date: 2026-11-07. Setup: testing. Horizon at 127.0.0.1:4339, workshop (worktree `cognate-workbench-horizon`) at 127.0.0.1:3190.

## Result

Passed. A step handed off from the desk became a step in the case and was given to a workshop agent. The agent ran and replied.

| What | Evidence |
|---|---|
| Preview, then "Also give this step to an agent" ticked | `agent-live-1-preview.png`, `agent-live-1c-agent-ticked.png` |
| Desk answer after Confirm: "Handed off: … It has started. It was given to an agent." | `agent-live-2-after.png` |
| Workshop conversation `conversation:assign:case_20261107T113303Z_7cc406:handoff_0a49…`: status `reconciliation-required` (finished, waiting for review), agent reply present | `agent-live-workshop-conversation.json` |
| Script (Playwright, keyboard only) | `live-agent-handoff.ts` |

The agent replied: "The requested two-line summary cannot be written because no seed cases were provided in this run." That is a correct answer: a handed-off step carries only its own words, not the case's records.

## What failed first, and the fix

The first two runs (`agent-handoff-*.png`, `agent-handoff-run2-*.png`) said "It was not given to an agent: The workshop is not answering". The workshop was answering. Its real answer was `failed_precondition: Configure a model in Settings`, because the test workshop had no AI model set up.

1. **Wrong words (Horizon bug, fixed in 88e340d).** `workshopFailure` treated every unknown error as "not answering". It now says "The workshop has no AI model set up…", "The agent named in Horizon's settings is not in the workshop…", or "The workshop answered but would not start this work." The error text is still never copied into the words. Covered by a new case in `test/adversarial-workshop.test.ts`.
2. **No model (setup).** The test workshop's default model was set through its own `model.configure` to ClinePass `cline-pass/deepseek-v4.1-flash` (`https://api.cline.bot/api/v1`, OpenAI-compatible). The key went from the OpenCode sign-in file straight into the workshop's secret store and was never printed or written anywhere else.

## Models tried

| Model | Result |
|---|---|
| OpenCode Zen free: `deepseek-v4.1-flash-free`, `glm-5.3-flash-free`, `big-pickle` | HTTP 429 from the workshop. The same key and model answer through `opencode run`, so Zen treats the two clients differently. Not chased: a direct check with the key was blocked by the permission check. |
| ClinePass `cline-pass/deepseek-v4-flash` (the name in the opencode config) | HTTP 404: the old name. OpenCode's own `cline-api` entry also fails (Unauthorized). |
| ClinePass `cline-pass/deepseek-v4.1-flash` | Works. In use now. |
| Cline free Nemotron 3.5 Lightning as `nvidia/nemotron-3.5-lightning[:free]` | HTTP 402. The free models need ids I could not find from this machine. |

A refused assignment leaves nothing behind in the workshop: the model is checked before anything is stored (`src/experts/service.ts:292`, before the write at ~330).
