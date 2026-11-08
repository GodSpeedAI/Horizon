# Putting a panel in front of the person (for agent authors)

An agent can put a panel in the desk's Conversation, ask the person a question, and learn the answer. It uses one door on Horizon's own port.

## The rule

Ask, then wait. Say where each answer went. You cannot answer or confirm for the person.

- You ask; the person answers in the Conversation. Their answers never come through this door as yours.
- When you have used an answer, say where it went with `answer.route` ("step handoff_0a49 in Seed: triage inbox", or "no action: why"). Until you do, the entry reads "Waiting for the agent to say where it went" and the step cannot be accepted.
- If you no longer need an answer, withdraw the question with a reason (`ask.withdraw`).
- Anything the person's side does (`human.answer`, `human.pin`, `human.close`, `human.open`) is refused at this door.

## Pairing and the desk's writes

When Horizon starts it prints a pairing code in the terminal: "To open the desk, enter this pairing code: XXXX-XXXX. It works once and expires in 10 minutes." A browser opens the desk by typing that code on the "Pair this browser" screen. The code works once. The browser then holds a session cookie (HttpOnly, SameSite=Strict) for 12 hours, or until Horizon restarts or the browser logs out (`POST /desk/pair/logout`). Every write the desk makes sends that cookie.

- The desk page carries no secret. Reading `/desk` gives a program nothing it can write with.
- Pairing gives agents nothing new. An agent on the page (`x-horizon-source: page-agent`) keeps the limits above. The agent door (`/agent/panels`) keeps its own key and never takes a session.
- Limit, stated plainly: anyone who can read the terminal can see the code and pair. A local program with terminal access can pair. This is a boundary against other callers, not a sandbox.

## How to call it

The door is on the desk's own address (for example `http://127.0.0.1:<port>`). Every call needs the agent key:

    Authorization: Bearer <key>

Every agent has its own key. The setup's default agent uses `agent.key` in the setup's secrets folder: `~/.horizon/setups/<setup>/secrets/agent.key`. (Without a setup it is `.cognate/agent.key`; `HORIZON_AGENT_KEY_FILE` names another file.) Horizon creates that key once and keeps it, so it stays the same across restarts. The file is private to you (mode 0600). Only you can read it. Read it in your script; never print it, log it or paste it in.

To add another agent, run `bun run scripts/agent-key.ts add <name>`. The key is printed once, to the terminal, with the agent's key id. Horizon keeps only a hash of each key, in `agents.json` beside `agent.key`, so a lost key cannot be read back: add the agent again under another name. Each question records the key that put it up. Only that key reads its answers, and only that key can say where an answer went or take the question back. A display name is a label; it never changes who owns a question.

Optional header `x-horizon-agent-name: <your name>` (60 characters at most). The Conversation shows it on your entries.

| Call | What it does |
|---|---|
| `POST /agent/panels` with `{"tool":"show_surface","surface":{"id","title","blocks":[...]}}` | Put up a panel, or replace it in place |
| `POST /agent/panels` with `{"tool":"ask_human","panel":"<id>","ask":{...}}` | Add a question to a panel |
| `POST /agent/panels` with `{"tool":"annotate","panel":"<id>","text":"..."}` | Add a short note to a panel |
| `POST /agent/panels` with `{"tool":"arrange","action":{"op":"surface.remove","id":"<id>"}}` | Remove a panel (not one the person pinned) |
| `POST /agent/panels` with `{"tool":"ask.withdraw","panel_id","ask_id","reason"}` | Take back a question nobody answered |
| `POST /agent/panels` with `{"tool":"answer.route","panel_id","ask_id","routed_as"}` | Say where an answer went (6 to 300 characters) |
| `GET /agent/panels/answers` | The answers waiting for you to route |
| `GET /agent/panels/catalogue` | The parts guide |

## The parts guide

`GET /agent/panels/catalogue` lists the 15 parts you can build a panel from (callout, metric, table, tree, timeline, graph, chart, compare, document, media, entity, progress, preflight, ask, form): when to use each, when not to, and a short example. Use the parts, not page code; the desk draws them and nothing you send runs.

A question has `id`, `question`, `why_needed`, and for pick-one or pick-several at least two `options` (`option_id`, `label`). `input` may be `select` (default), `multiselect`, `confirm` or `text`.

## From a script

    key=$(tr -d '\n' < "$HORIZON_SECRET_FILE")
    curl -s -H "Authorization: Bearer $key" -H 'content-type: application/json' \
      -d '{"tool":"ask_human","panel":"plan","ask":{"id":"which_way","question":"Which plan?","why_needed":"Two options","options":[{"option_id":"a","label":"Plan A"},{"option_id":"b","label":"Plan B"}]}}' \
      http://127.0.0.1:4339/agent/panels
